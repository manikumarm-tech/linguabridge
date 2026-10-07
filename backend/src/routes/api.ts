import { randomInt } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { q } from '../db.js';
import { requireAuth, sign, verify } from '../auth.js';
import { verifyGoogleIdToken } from '../google.js';
import { emit, isOnline } from '../hub.js';
import { LANGUAGES, detectionLabel, getLanguage } from '../languages.js';
import { Translator, primaryText } from '../pipeline/translate.js';
import type { TranslateRequest, TranslationResult } from '../types.js';
import { BOTS } from '../bots.js';
import { config } from '../config.js';

interface UserRow {
  id: string; handle: string; name: string; language: string; output_format: 'native' | 'romanized' | 'both';
  show_english: boolean; display_mode: string; translation_mode: 'natural' | 'literal' | 'casual'; is_bot: boolean;
  google_sub: string | null; email: string | null; avatar_url: string | null; last_seen_at: string | null;
}
interface MsgRow {
  id: string; conversation_id: string; sender_id: string; original_text: string; kind: string;
  /** 1:1: the recipient's translation. Group: the first member's (detection info); per-member ones live in message_translations. */
  translation: TranslationResult | null; created_at: string;
  reply_to: string | null; deleted_at: string | null; has_audio: boolean;
}
interface Conv {
  id: string; isGroup: boolean; title: string | null; memberIds: string[];
  /** everyone but me */
  otherIds: string[];
  /** 1:1 only */
  peerId: string | null;
}

type AI = {
  extractText(b64: string, mt: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'): Promise<string>;
  transcribe?(b64: string, mimeType: string): Promise<string>;
};

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', details: e.flatten() });
    console.error(e);
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'server_error' });
  });
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

const publicUser = (u: UserRow) => ({
  id: u.id, handle: u.handle, name: u.name, language: u.language, outputFormat: u.output_format,
  showEnglish: u.show_english, displayMode: u.display_mode, translationMode: u.translation_mode, isBot: u.is_bot,
  avatarUrl: u.avatar_url,
});
/** Someone I chat with, including whether they're online right now (demo contacts always are). */
const peerUser = (u: UserRow) => ({ ...publicUser(u), online: u.is_bot || isOnline(u.id), lastSeenAt: u.last_seen_at });

/** What I see about myself (adds my Google email; never sent to other people). */
const selfUser = (u: UserRow) => ({ ...publicUser(u), email: u.email });

async function getUser(id: string): Promise<UserRow> {
  const [u] = await q<UserRow>('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw fail(404, 'user_not_found');
  return u;
}
const getUsers = async (ids: string[]) => (ids.length ? q<UserRow>('SELECT * FROM users WHERE id = ANY($1)', [ids]) : []);

async function getConversation(id: string, userId: string): Promise<Conv> {
  const [c] = await q<{ id: string; is_group: boolean; title: string | null; members: string[] }>(
    `SELECT c.id, c.is_group, c.title, array_agg(cm.user_id ORDER BY cm.joined_at) AS members
     FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
     WHERE c.id=$1 GROUP BY c.id`, [id]);
  if (!c || !c.members.includes(userId)) throw fail(404, 'conversation_not_found');
  const otherIds = c.members.filter((m) => m !== userId);
  return { id: c.id, isGroup: c.is_group, title: c.title, memberIds: c.members, otherIds, peerId: c.is_group ? null : otherIds[0] ?? null };
}

async function conversationBetween(me: string, peerId: string) {
  const [a, b] = me < peerId ? [me, peerId] : [peerId, me];
  const [c] = await q<{ id: string }>(
    `INSERT INTO conversations (user_a,user_b) VALUES ($1,$2)
     ON CONFLICT (user_a,user_b) DO UPDATE SET user_a=EXCLUDED.user_a RETURNING id`, [a, b]);
  await q(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`, [c.id, a, b]);
  return c.id;
}

/** People I have a 1:1 chat with (friends + demo contacts): who I may put in a group. */
const friendIds = async (me: string) =>
  (await q<{ id: string }>(
    `SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS id FROM conversations
     WHERE NOT is_group AND (user_a=$1 OR user_b=$1)`, [me])).map((r) => r.id);

// ---- message serialization (depends on who is looking) ----------------------
interface Ctx {
  tr: Map<string, TranslationResult>;
  reactions: Map<string, { userId: string; emoji: string }[]>;
  replies: Map<string, MsgRow>;
  names: Map<string, string>;
}

/** Load everything needed to show `rows` to `viewer`: their translations, reactions, reply previews. */
async function hydrate(rows: MsgRow[], viewer: string): Promise<Ctx> {
  const ids = rows.map((m) => m.id);
  const replyIds = [...new Set(rows.map((m) => m.reply_to).filter((x): x is string => !!x))];
  const [trs, reacts, replies] = await Promise.all([
    ids.length || replyIds.length
      ? q<{ message_id: string; translation: TranslationResult }>(
        'SELECT message_id, translation FROM message_translations WHERE user_id=$1 AND message_id = ANY($2)', [viewer, [...ids, ...replyIds]])
      : [],
    ids.length ? q<{ message_id: string; user_id: string; emoji: string }>(
      'SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id = ANY($1) ORDER BY created_at', [ids]) : [],
    replyIds.length ? q<MsgRow>('SELECT * FROM messages WHERE id = ANY($1)', [replyIds]) : [],
  ]);
  const senderIds = [...new Set(replies.map((r) => r.sender_id))];
  const names = new Map((await getUsers(senderIds)).map((u) => [u.id, u.name]));
  const reactions = new Map<string, { userId: string; emoji: string }[]>();
  for (const r of reacts) reactions.set(r.message_id, [...(reactions.get(r.message_id) ?? []), { userId: r.user_id, emoji: r.emoji }]);
  return { tr: new Map(trs.map((t) => [t.message_id, t.translation])), reactions, replies: new Map(replies.map((r) => [r.id, r])), names };
}

/** The translation `viewer` should see for message `m` (none for their own group messages). */
function viewTranslation(m: MsgRow, viewer: string, ctx: Ctx) {
  if (m.sender_id === viewer) return m.translation;
  return ctx.tr.get(m.id) ?? m.translation;
}

function serialize(m: MsgRow, viewer: string, ctx: Ctx) {
  const deleted = !!m.deleted_at;
  const t = deleted ? null : viewTranslation(m, viewer, ctx);
  const reply = m.reply_to ? ctx.replies.get(m.reply_to) : undefined;
  let replyTo = null;
  if (reply && !deleted) {
    const rt = reply.sender_id === viewer || reply.deleted_at ? null : viewTranslation(reply, viewer, ctx);
    replyTo = {
      id: reply.id, senderId: reply.sender_id, senderName: ctx.names.get(reply.sender_id) ?? '',
      text: reply.deleted_at ? 'Message deleted' : rt ? primaryText(rt) : reply.original_text,
      kind: reply.kind,
    };
  }
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    kind: m.kind,
    originalText: deleted ? '' : m.original_text,
    createdAt: m.created_at,
    deleted,
    detected: t && {
      language: t.detectedLanguage, languageCode: t.detectedLanguageCode, script: t.detectedScript,
      romanized: t.isRomanized, confidence: t.confidence,
      label: detectionLabel(t.detectedLanguageCode, t.isRomanized),
    },
    translation: t,
    primaryText: deleted ? '' : t ? primaryText(t) : m.original_text,
    audioUrl: m.has_audio && !deleted ? `/api/messages/${m.id}/audio` : null,
    replyTo,
    reactions: deleted ? [] : ctx.reactions.get(m.id) ?? [],
  };
}

/** Send `event` with message `id` to each member, serialized for that member. */
async function emitMessage(event: 'message' | 'message_updated', id: string, memberIds: string[]) {
  const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1', [id]);
  if (!m) return;
  await Promise.all(memberIds.map(async (u) => emit([u], event, serialize(m, u, await hydrate([m], u)))));
}

async function serializeOne(id: string, viewer: string) {
  const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1', [id]);
  return serialize(m, viewer, await hydrate([m], viewer));
}

const CODE_TTL_MIN = 10;
/** Wrong-code guard: 6 digits is only 1M combinations, so cap attempts per user. */
const attempts = new Map<string, number[]>();
function tooManyAttempts(userId: string) {
  const now = Date.now();
  const recent = (attempts.get(userId) ?? []).filter((t) => now - t < 60_000);
  attempts.set(userId, recent);
  return recent.length >= 5;
}

const AUDIO_MAX_BYTES = 2_000_000; // ~2 min of opus
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|m4a|x-m4a|wav|3gpp)(;.*)?$/;

export function buildApi(translator: Translator, ai?: AI) {
  const r = Router();

  /** Translate `text` written by `sender` for `recipient`, with recent conversation as context. */
  async function translateFor(
    sender: UserRow, recipient: UserRow, convId: string, text: string,
    extra: Partial<TranslateRequest> = {}, modeOverride?: TranslateRequest['mode'],
  ) {
    const recent = await q<MsgRow>(
      'SELECT * FROM messages WHERE conversation_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 6', [convId]);
    const context = recent.reverse().map((m) => ({
      from: (m.sender_id === sender.id ? 'me' : 'them') as 'me' | 'them',
      text: m.original_text,
      languageCode: m.translation?.detectedLanguageCode,
    }));
    return translator.translate({
      text,
      targetLang: recipient.language,
      format: recipient.output_format,
      mode: modeOverride ?? sender.translation_mode,
      includeEnglish: recipient.show_english || sender.show_english,
      senderLang: sender.language,
      context,
      ...extra,
    });
  }

  /** Translate for every other member (one model call per distinct language/format), store, and deliver. */
  async function storeAndEmit(
    conv: Conv, sender: UserRow, text: string, kind: string,
    opts: { replyTo?: string | null; audio?: { data: Buffer; mimeType: string; durationMs?: number } } = {},
  ) {
    const recipients = await getUsers(conv.memberIds.filter((id) => id !== sender.id));
    const byPrefs = new Map<string, Promise<TranslationResult>>();
    const perUser = new Map<string, TranslationResult>();
    await Promise.all(recipients.map(async (u) => {
      const key = `${u.language}|${u.output_format}|${u.show_english}`;
      if (!byPrefs.has(key)) byPrefs.set(key, translateFor(sender, u, conv.id, text));
      perUser.set(u.id, await byPrefs.get(key)!);
    }));
    const first = recipients[0] ? perUser.get(recipients[0].id)! : null;
    const [row] = await q<MsgRow>(
      `INSERT INTO messages (conversation_id, sender_id, original_text, kind, translation, reply_to, has_audio)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [conv.id, sender.id, text, kind, first && JSON.stringify(first), opts.replyTo ?? null, !!opts.audio]);
    if (conv.isGroup && perUser.size) {
      const users = [...perUser.keys()];
      await q(
        `INSERT INTO message_translations (message_id, user_id, translation)
         SELECT $1, u, t FROM unnest($2::uuid[], $3::jsonb[]) AS x(u, t)`,
        [row.id, users, users.map((u) => JSON.stringify(perUser.get(u)))]);
    }
    if (opts.audio) {
      await q('INSERT INTO message_audio (message_id, mime_type, duration_ms, data) VALUES ($1,$2,$3,$4)',
        [row.id, opts.audio.mimeType, opts.audio.durationMs ?? null, opts.audio.data]);
    }
    await emitMessage('message', row.id, conv.memberIds);
    return serializeOne(row.id, sender.id);
  }

  async function checkReply(conv: Conv, replyTo?: string | null) {
    if (!replyTo) return null;
    const [m] = await q<{ id: string }>('SELECT id FROM messages WHERE id=$1 AND conversation_id=$2', [replyTo, conv.id]);
    if (!m) throw fail(400, 'reply_not_found');
    return m.id;
  }

  // ---- meta -------------------------------------------------------------
  r.get('/languages', (_req, res) => res.json(LANGUAGES));

  // ---- auth / profile ---------------------------------------------------
  const prefs = {
    language: z.string().refine((c) => !!getLanguage(c), 'unsupported language'),
    outputFormat: z.enum(['native', 'romanized', 'both']),
    showEnglish: z.boolean(),
    displayMode: z.enum(['translation_only', 'original_translation', 'original_translation_english']),
    translationMode: z.enum(['natural', 'literal', 'casual']),
  };
  const registerSchema = z.object({
    name: z.string().min(1).max(60),
    handle: z.string().regex(/^[a-z0-9_.-]{3,30}$/i),
    language: prefs.language,
    outputFormat: prefs.outputFormat.default('both'),
    showEnglish: prefs.showEnglish.default(true),
    displayMode: prefs.displayMode.default('original_translation'),
    translationMode: prefs.translationMode.default('casual'),
  });

  r.post('/auth/register', wrap(async (req, res) => {
    const b = registerSchema.parse(req.body);
    const handle = b.handle.toLowerCase();
    const [exists] = await q('SELECT 1 FROM users WHERE handle=$1', [handle]);
    if (exists) return res.status(409).json({ error: 'handle_taken' });
    const [u] = await q<UserRow>(
      `INSERT INTO users (handle,name,language,output_format,show_english,display_mode,translation_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [handle, b.name, b.language, b.outputFormat, b.showEnglish, b.displayMode, b.translationMode]);
    res.json({ token: sign(u.id), user: selfUser(u) });
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const { handle } = z.object({ handle: z.string() }).parse(req.body);
    const [u] = await q<UserRow>('SELECT * FROM users WHERE handle=$1 AND is_bot=false', [handle.toLowerCase()]);
    if (!u) return res.status(404).json({ error: 'user_not_found' });
    if (u.google_sub) return res.status(403).json({ error: 'use_google' });
    res.json({ token: sign(u.id), user: selfUser(u) });
  }));

  r.get('/config', (_req, res) => res.json({ googleClientId: config.googleClientIds[0] ?? null }));

  /**
   * Sign in with Google. Known Google account -> signed in. New one -> { needsProfile } until the
   * client sends the language choices in `profile`, then the account is created.
   */
  r.post('/auth/google', wrap(async (req, res) => {
    const { idToken, profile } = z.object({
      idToken: z.string().min(20),
      profile: registerSchema.pick({ language: true, outputFormat: true, showEnglish: true }).optional(),
    }).parse(req.body);
    const g = await verifyGoogleIdToken(idToken);
    const [known] = await q<UserRow>('SELECT * FROM users WHERE google_sub=$1', [g.sub]);
    if (known) return res.json({ token: sign(known.id), user: selfUser(known) });
    if (!profile) return res.json({ needsProfile: true, name: g.name, email: g.email });

    // private handle from the email name, made unique; people connect by code, so it's never typed
    const base = (g.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'user').slice(0, 20).padEnd(3, '0');
    for (let i = 0; i < 20; i++) {
      const handle = i === 0 ? base : `${base}${randomInt(100, 10_000)}`;
      const [u] = await q<UserRow>(
        `INSERT INTO users (handle,name,language,output_format,show_english,google_sub,email,avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (handle) DO NOTHING RETURNING *`,
        [handle, g.name.slice(0, 60), profile.language, profile.outputFormat, profile.showEnglish, g.sub, g.email, g.picture ?? null]);
      if (u) return res.json({ token: sign(u.id), user: selfUser(u) });
    }
    throw new Error('could_not_create_account');
  }));

  /** Attach Google to the signed-in (username) account, keeping its chats. */
  r.post('/auth/google/link', requireAuth, wrap(async (req, res) => {
    const { idToken } = z.object({ idToken: z.string().min(20) }).parse(req.body);
    const g = await verifyGoogleIdToken(idToken);
    const [other] = await q<{ id: string }>('SELECT id FROM users WHERE google_sub=$1', [g.sub]);
    if (other && other.id !== res.locals.userId) return res.status(409).json({ error: 'google_already_used' });
    const [u] = await q<UserRow>(
      'UPDATE users SET google_sub=$1, email=$2, avatar_url=COALESCE(avatar_url,$3) WHERE id=$4 RETURNING *',
      [g.sub, g.email, g.picture ?? null, res.locals.userId]);
    res.json(selfUser(u));
  }));

  r.get('/me', requireAuth, wrap(async (_req, res) => res.json(selfUser(await getUser(res.locals.userId)))));

  r.patch('/me', requireAuth, wrap(async (req, res) => {
    const b = z.object({ name: z.string().min(1).max(60), ...prefs }).partial().parse(req.body);
    const cols: Record<string, unknown> = {
      name: b.name, language: b.language, output_format: b.outputFormat, show_english: b.showEnglish,
      display_mode: b.displayMode, translation_mode: b.translationMode,
    };
    const keys = Object.keys(cols).filter((k) => cols[k] !== undefined);
    if (!keys.length) return res.json(selfUser(await getUser(res.locals.userId)));
    const [u] = await q<UserRow>(
      `UPDATE users SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1} RETURNING *`,
      [...keys.map((k) => cols[k]), res.locals.userId]);
    res.json(selfUser(u));
  }));

  // ---- conversations ----------------------------------------------------
  r.get('/conversations', requireAuth, wrap(async (_req, res) => {
    const me = res.locals.userId as string;
    const rows = await q<any>(
      `SELECT c.id, c.is_group, c.title,
              (SELECT count(*) FROM conversation_members x WHERE x.conversation_id=c.id)::int AS member_count,
              p.id AS peer_id, p.handle, p.name, p.language, p.avatar_url, p.last_seen_at, p.is_bot,
              m.id AS last_id, m.original_text AS last_text, m.created_at AS last_at, m.sender_id AS last_sender,
              m.kind AS last_kind, m.deleted_at AS last_deleted, COALESCE(mt.translation, m.translation) AS last_translation,
              su.name AS last_sender_name,
              (SELECT count(*) FROM messages mm WHERE mm.conversation_id=c.id AND mm.sender_id<>$1 AND mm.deleted_at IS NULL
                 AND mm.created_at > GREATEST(COALESCE(cr.last_read_at,'-infinity'), COALESCE(cc.cleared_at,'-infinity')))::int AS unread
       FROM conversation_members mine
       JOIN conversations c ON c.id = mine.conversation_id
       LEFT JOIN LATERAL (SELECT u.* FROM conversation_members om JOIN users u ON u.id=om.user_id
                          WHERE om.conversation_id=c.id AND om.user_id<>$1 LIMIT 1) p ON NOT c.is_group
       LEFT JOIN conversation_clears cc ON cc.conversation_id=c.id AND cc.user_id=$1
       LEFT JOIN conversation_reads cr ON cr.conversation_id=c.id AND cr.user_id=$1
       LEFT JOIN LATERAL (SELECT * FROM messages WHERE conversation_id=c.id AND created_at > COALESCE(cc.cleared_at, '-infinity')
                          ORDER BY created_at DESC LIMIT 1) m ON true
       LEFT JOIN message_translations mt ON mt.message_id=m.id AND mt.user_id=$1
       LEFT JOIN users su ON su.id=m.sender_id
       WHERE mine.user_id=$1 AND (cc.cleared_at IS NULL OR m.id IS NOT NULL OR c.is_group)
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`, [me]);
    res.json(rows.map((x) => {
      const t = x.last_translation as TranslationResult | null;
      const mine = x.last_sender === me;
      let last: string | null = null;
      if (x.last_id) {
        last = x.last_deleted ? '🚫 Message deleted' : t && !mine ? primaryText(t) : x.last_text;
        if (!x.last_deleted && x.last_kind === 'voice') last = `🎤 ${last}`;
        if (x.is_group) last = `${mine ? 'You' : String(x.last_sender_name ?? '').split(' ')[0]}: ${last}`;
      }
      return {
        id: x.id,
        isGroup: x.is_group,
        title: x.is_group ? x.title : x.name,
        memberCount: x.member_count,
        peer: x.is_group ? null : {
          id: x.peer_id, handle: x.handle, name: x.name, language: x.language, avatarUrl: x.avatar_url,
          online: x.is_bot || isOnline(x.peer_id), lastSeenAt: x.last_seen_at,
        },
        unread: x.unread,
        lastMessage: last,
        lastAt: x.last_at,
        detectedLabel: t && !x.last_deleted ? detectionLabel(t.detectedLanguageCode, t.isRomanized) : null,
      };
    }));
  }));

  r.post('/conversations', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const { peerHandle } = z.object({ peerHandle: z.string() }).parse(req.body);
    const [peer] = await q<UserRow>('SELECT * FROM users WHERE handle=$1', [peerHandle.toLowerCase()]);
    if (!peer) return res.status(404).json({ error: 'user_not_found' });
    if (peer.id === me) return res.status(400).json({ error: 'cannot_chat_with_self' });
    if (!peer.is_bot && !(await friendIds(me)).includes(peer.id)) {
      // real people only through a connect code (or a chat you already have)
      return res.status(404).json({ error: 'user_not_found' });
    }
    res.json({ id: await conversationBetween(me, peer.id), peer: publicUser(peer) });
  }));

  // ---- groups -------------------------------------------------------------
  /** People I can add to a group. */
  r.get('/friends', requireAuth, wrap(async (_req, res) => {
    const users = await getUsers(await friendIds(res.locals.userId));
    res.json(users.map(peerUser).sort((a, b) => Number(a.isBot) - Number(b.isBot) || a.name.localeCompare(b.name)));
  }));

  const memberList = z.array(z.string().uuid()).min(1).max(50);
  async function checkFriends(me: string, ids: string[]) {
    const friends = new Set(await friendIds(me));
    if (ids.some((id) => !friends.has(id))) throw fail(400, 'not_a_friend');
  }

  r.post('/groups', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const { title, memberIds } = z.object({ title: z.string().trim().min(1).max(60), memberIds: memberList }).parse(req.body);
    const ids = [...new Set(memberIds)].filter((id) => id !== me);
    await checkFriends(me, ids);
    const [c] = await q<{ id: string }>('INSERT INTO conversations (is_group, title, created_by) VALUES (true,$1,$2) RETURNING id', [title, me]);
    await q('INSERT INTO conversation_members (conversation_id, user_id) SELECT $1, unnest($2::uuid[])', [c.id, [me, ...ids]]);
    emit(ids, 'group_added', { id: c.id, title });
    res.json({ id: c.id, title });
  }));

  r.get('/groups/:id', requireAuth, wrap(async (req, res) => {
    const conv = await getConversation(req.params.id, res.locals.userId);
    if (!conv.isGroup) throw fail(400, 'not_a_group');
    res.json({ id: conv.id, title: conv.title, members: (await getUsers(conv.memberIds)).map(peerUser) });
  }));

  r.post('/groups/:id/members', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const conv = await getConversation(req.params.id, me);
    if (!conv.isGroup) throw fail(400, 'not_a_group');
    const { memberIds } = z.object({ memberIds: memberList }).parse(req.body);
    const ids = [...new Set(memberIds)].filter((id) => !conv.memberIds.includes(id));
    await checkFriends(me, ids);
    if (ids.length) await q('INSERT INTO conversation_members (conversation_id, user_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [conv.id, ids]);
    emit(ids, 'group_added', { id: conv.id, title: conv.title });
    emit(conv.memberIds, 'group_updated', { id: conv.id });
    res.json({ ok: true, added: ids.length });
  }));

  r.post('/groups/:id/leave', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const conv = await getConversation(req.params.id, me);
    if (!conv.isGroup) throw fail(400, 'not_a_group');
    await q('DELETE FROM conversation_members WHERE conversation_id=$1 AND user_id=$2', [conv.id, me]);
    emit(conv.otherIds, 'group_updated', { id: conv.id });
    res.json({ ok: true });
  }));

  // ---- add friend by code ------------------------------------------------
  /** My current code: reuse one with >2 min left, otherwise issue a fresh one. */
  r.post('/connect/code', requireAuth, wrap(async (_req, res) => {
    const me = res.locals.userId as string;
    const [live] = await q<{ code: string; expires_at: string }>(
      `SELECT code, expires_at FROM connect_codes
       WHERE user_id=$1 AND used_at IS NULL AND expires_at > now() + interval '2 minutes'
       ORDER BY expires_at DESC LIMIT 1`, [me]);
    if (live) return res.json({ code: live.code, expiresAt: live.expires_at });
    await q('DELETE FROM connect_codes WHERE user_id=$1 OR expires_at < now() - interval \'1 day\'', [me]);
    for (let i = 0; i < 10; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const [row] = await q<{ code: string; expires_at: string }>(
        `INSERT INTO connect_codes (code, user_id, expires_at)
         VALUES ($1, $2, now() + make_interval(mins => $3))
         ON CONFLICT (code) DO UPDATE SET user_id=EXCLUDED.user_id, expires_at=EXCLUDED.expires_at, used_at=NULL
           WHERE connect_codes.used_at IS NOT NULL OR connect_codes.expires_at < now()
         RETURNING code, expires_at`, [code, me, CODE_TTL_MIN]);
      if (row) return res.json({ code: row.code, expiresAt: row.expires_at });
    }
    throw new Error('could_not_issue_code');
  }));

  /** Enter a friend's code: connects both people and opens the chat for both. */
  r.post('/connect/redeem', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    if (tooManyAttempts(me)) return res.status(429).json({ error: 'too_many_attempts' });
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
    const [row] = await q<{ user_id: string }>(
      `UPDATE connect_codes SET used_at=now()
       WHERE code=$1 AND used_at IS NULL AND expires_at > now() AND user_id <> $2
       RETURNING user_id`, [code, me]);
    if (!row) {
      attempts.get(me)!.push(Date.now());
      const [own] = await q('SELECT 1 FROM connect_codes WHERE code=$1 AND user_id=$2', [code, me]);
      return res.status(404).json({ error: own ? 'own_code' : 'invalid_code' });
    }
    const [meRow, friend] = await Promise.all([getUser(me), getUser(row.user_id)]);
    const id = await conversationBetween(me, friend.id);
    emit([friend.id], 'connected', { id, peer: publicUser(meRow) });
    res.json({ id, peer: publicUser(friend) });
  }));

  // ---- a conversation -----------------------------------------------------
  r.get('/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const conv = await getConversation(req.params.id, me);
    const rows = await q<MsgRow>(
      `SELECT m.* FROM messages m
       LEFT JOIN conversation_clears cc ON cc.conversation_id=m.conversation_id AND cc.user_id=$2
       WHERE m.conversation_id=$1 AND m.created_at > COALESCE(cc.cleared_at, '-infinity')
       ORDER BY m.created_at ASC LIMIT 500`, [conv.id, me]);
    const [members, reads, ctx] = await Promise.all([
      getUsers(conv.memberIds),
      q<{ user_id: string; last_read_at: string }>(
        'SELECT user_id, last_read_at FROM conversation_reads WHERE conversation_id=$1 AND user_id = ANY($2)', [conv.id, conv.otherIds]),
      hydrate(rows, me),
    ]);
    const readsBy = Object.fromEntries(reads.map((x) => [x.user_id, x.last_read_at]));
    // everyone else has read up to this point (✓✓)
    const allRead = conv.otherIds.length && conv.otherIds.every((id) => readsBy[id])
      ? conv.otherIds.map((id) => readsBy[id]).sort()[0] : null;
    const peer = conv.peerId ? members.find((u) => u.id === conv.peerId) : undefined;
    res.json({
      isGroup: conv.isGroup,
      title: conv.isGroup ? conv.title : peer?.name,
      peer: peer ? peerUser(peer) : null,
      members: members.map(peerUser),
      reads: readsBy,
      peerLastReadAt: allRead,
      messages: rows.map((m) => serialize(m, me, ctx)),
    });
  }));

  /** I've seen everything in this chat up to now; tells the others (read receipts). */
  r.post('/conversations/:id/read', requireAuth, wrap(async (req, res) => {
    const conv = await getConversation(req.params.id, res.locals.userId);
    const [row] = await q<{ last_read_at: string }>(
      `INSERT INTO conversation_reads (conversation_id, user_id) VALUES ($1,$2)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at=now() RETURNING last_read_at`, [conv.id, res.locals.userId]);
    emit(conv.otherIds, 'read', { conversationId: conv.id, userId: res.locals.userId, at: row.last_read_at });
    res.json({ at: row.last_read_at });
  }));

  /** Delete chat for me only: hides everything so far; new messages bring it back. */
  r.delete('/conversations/:id', requireAuth, wrap(async (req, res) => {
    const conv = await getConversation(req.params.id, res.locals.userId);
    await q(
      `INSERT INTO conversation_clears (conversation_id, user_id) VALUES ($1,$2)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET cleared_at=now()`, [conv.id, res.locals.userId]);
    res.json({ ok: true });
  }));

  // ---- messaging --------------------------------------------------------
  r.post('/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
    const { text, kind, replyTo } = z.object({
      text: z.string().trim().min(1).max(4000),
      kind: z.enum(['text', 'voice']).default('text'),
      replyTo: z.string().uuid().nullish(),
    }).parse(req.body);
    const conv = await getConversation(req.params.id, res.locals.userId);
    const sender = await getUser(res.locals.userId);
    const msg = await storeAndEmit(conv, sender, text, kind, { replyTo: await checkReply(conv, replyTo) });
    res.json(msg);
    void botReply(conv, sender);
  }));

  /** Voice message: keep the recording, transcribe it, then translate like typed text. */
  r.post('/conversations/:id/voice', requireAuth, wrap(async (req, res) => {
    if (!ai?.transcribe) return res.status(501).json({ error: 'voice_not_configured' });
    const { audioBase64, mimeType, durationMs, replyTo } = z.object({
      audioBase64: z.string().min(100).max(Math.ceil(AUDIO_MAX_BYTES * 4 / 3) + 4),
      mimeType: z.string().regex(AUDIO_TYPES),
      durationMs: z.number().int().positive().max(5 * 60_000).optional(),
      replyTo: z.string().uuid().nullish(),
    }).parse(req.body);
    const conv = await getConversation(req.params.id, res.locals.userId);
    const sender = await getUser(res.locals.userId);
    const text = await ai.transcribe(audioBase64, mimeType);
    if (!text) return res.status(422).json({ error: 'no_speech' });
    const msg = await storeAndEmit(conv, sender, text.slice(0, 4000), 'voice', {
      replyTo: await checkReply(conv, replyTo),
      audio: { data: Buffer.from(audioBase64, 'base64'), mimeType, durationMs },
    });
    res.json(msg);
    void botReply(conv, sender);
  }));

  /** The recording. <audio> can't send headers, so the token may come as ?token=. */
  r.get('/messages/:id/audio', wrap(async (req, res) => {
    const header = req.headers.authorization?.replace(/^Bearer /, '');
    const userId = verify(header || String(req.query.token ?? ''));
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const [a] = await q<{ conversation_id: string; mime_type: string; data: Buffer }>(
      `SELECT m.conversation_id, a.mime_type, a.data FROM message_audio a JOIN messages m ON m.id=a.message_id
       WHERE a.message_id=$1 AND m.deleted_at IS NULL`, [req.params.id]);
    if (!a) return res.status(404).json({ error: 'not_found' });
    await getConversation(a.conversation_id, userId);
    res.setHeader('Content-Type', a.mime_type.split(';')[0]);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(a.data);
  }));

  /** One reaction per person per message; same emoji again (or null) removes it. */
  r.post('/messages/:id/react', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const { emoji } = z.object({ emoji: z.string().min(1).max(16).nullable() }).parse(req.body);
    const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'message_not_found' });
    const conv = await getConversation(m.conversation_id, me);
    const [existing] = await q<{ emoji: string }>('SELECT emoji FROM message_reactions WHERE message_id=$1 AND user_id=$2', [m.id, me]);
    if (!emoji || existing?.emoji === emoji) await q('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2', [m.id, me]);
    else {
      await q(`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
               ON CONFLICT (message_id, user_id) DO UPDATE SET emoji=EXCLUDED.emoji, created_at=now()`, [m.id, me, emoji]);
    }
    await emitMessage('message_updated', m.id, conv.memberIds);
    res.json(await serializeOne(m.id, me));
  }));

  /** Delete for everyone (sender only). The text, translations and recording are wiped. */
  r.delete('/messages/:id', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'message_not_found' });
    const conv = await getConversation(m.conversation_id, me);
    if (m.sender_id !== me) return res.status(403).json({ error: 'not_your_message' });
    await q(`UPDATE messages SET deleted_at=now(), original_text='', translation=NULL, has_audio=false WHERE id=$1`, [m.id]);
    await Promise.all([
      q('DELETE FROM message_translations WHERE message_id=$1', [m.id]),
      q('DELETE FROM message_reactions WHERE message_id=$1', [m.id]),
      q('DELETE FROM message_audio WHERE message_id=$1', [m.id]),
    ]);
    await emitMessage('message_updated', m.id, conv.memberIds);
    res.json(await serializeOne(m.id, me));
  }));

  /** Composer preview: detect + translate for the other person (first other member in a group) without sending. */
  r.post('/conversations/:id/preview', requireAuth, wrap(async (req, res) => {
    const { text, mode } = z.object({ text: z.string().trim().min(1).max(4000), mode: prefs.translationMode.optional() }).parse(req.body);
    const conv = await getConversation(req.params.id, res.locals.userId);
    if (!conv.otherIds.length) throw fail(400, 'no_one_else_here');
    const [sender, recipient] = await Promise.all([getUser(res.locals.userId), getUser(conv.otherIds[0])]);
    const t = await translateFor(sender, recipient, conv.id, text, {}, mode);
    res.json({
      detected: { language: t.detectedLanguage, languageCode: t.detectedLanguageCode, script: t.detectedScript, romanized: t.isRomanized, confidence: t.confidence, label: detectionLabel(t.detectedLanguageCode, t.isRomanized) },
      translateTo: { languageCode: recipient.language, label: detectionLabel(recipient.language, recipient.output_format !== 'native') },
      translation: t,
      primaryText: primaryText(t),
    });
  }));

  /** "Translate again": a fresh rendering for the person asking (or, in a 1:1, for the recipient of my own message). */
  r.post('/messages/:id/retranslate', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const { mode } = z.object({ mode: prefs.translationMode.optional() }).parse(req.body ?? {});
    const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'message_not_found' });
    const conv = await getConversation(m.conversation_id, me);
    const targetId = m.sender_id !== me ? me : conv.peerId;
    if (!targetId) throw fail(400, 'nothing_to_retranslate');
    const [sender, target] = await Promise.all([getUser(m.sender_id), getUser(targetId)]);
    const ctx = await hydrate([m], target.id);
    const previous = viewTranslation(m, target.id, ctx);
    const t = await translateFor(sender, target, conv.id, m.original_text, previous ? { regenerate: { previous: primaryText(previous) } } : {}, mode);
    if (conv.isGroup) {
      await q(`INSERT INTO message_translations (message_id, user_id, translation) VALUES ($1,$2,$3)
               ON CONFLICT (message_id, user_id) DO UPDATE SET translation=EXCLUDED.translation`, [m.id, target.id, JSON.stringify(t)]);
      await emitMessage('message_updated', m.id, [target.id]);
    } else {
      await q('UPDATE messages SET translation=$1 WHERE id=$2', [JSON.stringify(t), m.id]);
      await emitMessage('message_updated', m.id, conv.memberIds);
    }
    res.json(await serializeOne(m.id, me));
  }));

  // ---- voice / photo helpers -------------------------------------------
  /**
   * Server-side STT fallback for dictation. The app transcribes on-device by default;
   * this exists for devices without speech recognition. Requires OPENAI_API_KEY (Whisper).
   */
  r.post('/voice/transcribe', requireAuth, wrap(async (req, res) => {
    if (!config.openaiKey) return res.status(501).json({ error: 'stt_not_configured' });
    const { audioBase64, mimeType } = z.object({ audioBase64: z.string().max(14_000_000), mimeType: z.string().default('audio/m4a') }).parse(req.body);
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('file', new Blob([Buffer.from(audioBase64, 'base64')], { type: mimeType }), 'voice.m4a');
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${config.openaiKey}` }, body: form,
    });
    if (!resp.ok) return res.status(502).json({ error: 'stt_failed' });
    res.json({ text: ((await resp.json()) as { text: string }).text });
  }));

  /** Photo -> text. The app drops the result into the composer so the user can review it before sending. */
  r.post('/vision/extract-text', requireAuth, wrap(async (req, res) => {
    if (!ai) return res.status(501).json({ error: 'vision_not_configured' });
    const { imageBase64, mimeType } = z.object({
      imageBase64: z.string().max(14_000_000),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).default('image/jpeg'),
    }).parse(req.body);
    res.json({ text: await ai.extractText(imageBase64, mimeType) });
  }));

  // ---- demo bots --------------------------------------------------------
  /** A demo contact in the chat (1:1, or one of them in a group) reads, types, then replies. */
  async function botReply(conv: Conv, human: UserRow) {
    if (human.is_bot) return;
    const bots = (await getUsers(conv.otherIds)).filter((u) => u.is_bot);
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const def = bot && BOTS.find((b) => b.handle === bot.handle);
    if (!def) return;
    try {
      await new Promise((r2) => setTimeout(r2, 600));
      const humans = conv.memberIds.filter((id) => !bots.some((b) => b.id === id));
      for (const b of bots) { // every demo contact in the chat reads it
        const [row] = await q<{ last_read_at: string }>(
          `INSERT INTO conversation_reads (conversation_id, user_id) VALUES ($1,$2)
           ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at=now() RETURNING last_read_at`, [conv.id, b.id]);
        emit(humans, 'read', { conversationId: conv.id, userId: b.id, at: row.last_read_at });
      }
      emit(humans, 'typing', { conversationId: conv.id, userId: bot.id });
      await new Promise((r2) => setTimeout(r2, 1500));
      const text = def.replies[Math.floor(Math.random() * def.replies.length)];
      await storeAndEmit(conv, bot, text, 'text');
    } catch (e) {
      console.error('bot reply failed', e);
    }
  }

  return r;
}
