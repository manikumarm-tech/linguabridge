import { randomInt } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { q } from '../db.js';
import { requireAuth, sign } from '../auth.js';
import { emit } from '../hub.js';
import { LANGUAGES, detectionLabel, getLanguage } from '../languages.js';
import { Translator, primaryText } from '../pipeline/translate.js';
import type { TranslateRequest, TranslationResult } from '../types.js';
import { BOTS } from '../bots.js';
import { config } from '../config.js';

interface UserRow {
  id: string; handle: string; name: string; language: string; output_format: 'native' | 'romanized' | 'both';
  show_english: boolean; display_mode: string; translation_mode: 'natural' | 'literal' | 'casual'; is_bot: boolean;
}
interface MsgRow {
  id: string; conversation_id: string; sender_id: string; original_text: string; kind: string;
  translation: TranslationResult | null; created_at: string;
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', details: e.flatten() });
    console.error(e);
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'server_error' });
  });

const publicUser = (u: UserRow) => ({
  id: u.id, handle: u.handle, name: u.name, language: u.language, outputFormat: u.output_format,
  showEnglish: u.show_english, displayMode: u.display_mode, translationMode: u.translation_mode, isBot: u.is_bot,
});

export function serializeMessage(m: MsgRow, recipientId: string | null) {
  const t = m.translation;
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    recipientId,
    kind: m.kind,
    originalText: m.original_text,
    createdAt: m.created_at,
    detected: t && {
      language: t.detectedLanguage, languageCode: t.detectedLanguageCode, script: t.detectedScript,
      romanized: t.isRomanized, confidence: t.confidence,
      label: detectionLabel(t.detectedLanguageCode, t.isRomanized),
    },
    translation: t,
    primaryText: t ? primaryText(t) : m.original_text,
  };
}

async function getUser(id: string): Promise<UserRow> {
  const [u] = await q<UserRow>('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw Object.assign(new Error('user_not_found'), { status: 404 });
  return u;
}

async function getConversation(id: string, userId: string) {
  const [c] = await q<{ id: string; user_a: string; user_b: string }>(
    'SELECT * FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)', [id, userId]);
  if (!c) throw Object.assign(new Error('conversation_not_found'), { status: 404 });
  return { ...c, peerId: c.user_a === userId ? c.user_b : c.user_a };
}

async function conversationBetween(me: string, peerId: string) {
  const [a, b] = me < peerId ? [me, peerId] : [peerId, me];
  const [c] = await q<{ id: string }>(
    `INSERT INTO conversations (user_a,user_b) VALUES ($1,$2)
     ON CONFLICT (user_a,user_b) DO UPDATE SET user_a=EXCLUDED.user_a RETURNING id`, [a, b]);
  return c.id;
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

export function buildApi(translator: Translator, ocr?: { extractText(b64: string, mt: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'): Promise<string> }) {
  const r = Router();

  /** Translate `text` written by `sender` for `recipient`, with recent conversation as context. */
  async function translateFor(
    sender: UserRow, recipient: UserRow, convId: string, text: string,
    extra: Partial<TranslateRequest> = {}, modeOverride?: TranslateRequest['mode'],
  ) {
    const recent = await q<MsgRow>(
      'SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 6', [convId]);
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

  async function storeAndEmit(conv: { id: string }, sender: UserRow, recipient: UserRow, text: string, kind: string) {
    const translation = await translateFor(sender, recipient, conv.id, text);
    const [row] = await q<MsgRow>(
      'INSERT INTO messages (conversation_id, sender_id, original_text, kind, translation) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [conv.id, sender.id, text, kind, JSON.stringify(translation)]);
    const msg = serializeMessage(row, recipient.id);
    emit([sender.id, recipient.id], 'message', msg);
    return msg;
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
    res.json({ token: sign(u.id), user: publicUser(u) });
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const { handle } = z.object({ handle: z.string() }).parse(req.body);
    const [u] = await q<UserRow>('SELECT * FROM users WHERE handle=$1 AND is_bot=false', [handle.toLowerCase()]);
    if (!u) return res.status(404).json({ error: 'user_not_found' });
    res.json({ token: sign(u.id), user: publicUser(u) });
  }));

  r.get('/me', requireAuth, wrap(async (_req, res) => res.json(publicUser(await getUser(res.locals.userId)))));

  r.patch('/me', requireAuth, wrap(async (req, res) => {
    const b = z.object({ name: z.string().min(1).max(60), ...prefs }).partial().parse(req.body);
    const cols: Record<string, unknown> = {
      name: b.name, language: b.language, output_format: b.outputFormat, show_english: b.showEnglish,
      display_mode: b.displayMode, translation_mode: b.translationMode,
    };
    const keys = Object.keys(cols).filter((k) => cols[k] !== undefined);
    if (!keys.length) return res.json(publicUser(await getUser(res.locals.userId)));
    const [u] = await q<UserRow>(
      `UPDATE users SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1} RETURNING *`,
      [...keys.map((k) => cols[k]), res.locals.userId]);
    res.json(publicUser(u));
  }));

  // ---- conversations ----------------------------------------------------
  r.get('/conversations', requireAuth, wrap(async (_req, res) => {
    const me = res.locals.userId as string;
    const rows = await q<any>(
      `SELECT c.id, u.id AS peer_id, u.handle, u.name, u.language,
              m.original_text AS last_text, m.created_at AS last_at, m.translation AS last_translation, m.sender_id AS last_sender
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a=$1 THEN c.user_b ELSE c.user_a END
       LEFT JOIN conversation_clears cc ON cc.conversation_id=c.id AND cc.user_id=$1
       LEFT JOIN LATERAL (SELECT * FROM messages WHERE conversation_id=c.id AND created_at > COALESCE(cc.cleared_at, '-infinity')
                          ORDER BY created_at DESC LIMIT 1) m ON true
       WHERE (c.user_a=$1 OR c.user_b=$1) AND (cc.cleared_at IS NULL OR m.id IS NOT NULL)
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`, [me]);
    res.json(rows.map((x) => {
      const t = x.last_translation as TranslationResult | null;
      return {
        id: x.id,
        peer: { id: x.peer_id, handle: x.handle, name: x.name, language: x.language },
        lastMessage: t && x.last_sender !== me ? primaryText(t) : x.last_text,
        lastAt: x.last_at,
        detectedLabel: t ? detectionLabel(t.detectedLanguageCode, t.isRomanized) : null,
      };
    }));
  }));

  r.post('/conversations', requireAuth, wrap(async (req, res) => {
    const me = res.locals.userId as string;
    const { peerHandle } = z.object({ peerHandle: z.string() }).parse(req.body);
    const [peer] = await q<UserRow>('SELECT * FROM users WHERE handle=$1', [peerHandle.toLowerCase()]);
    if (!peer) return res.status(404).json({ error: 'user_not_found' });
    if (peer.id === me) return res.status(400).json({ error: 'cannot_chat_with_self' });
    if (!peer.is_bot) {
      // real people only through a connect code (or a chat you already have)
      const [a, b] = me < peer.id ? [me, peer.id] : [peer.id, me];
      const [existing] = await q('SELECT 1 FROM conversations WHERE user_a=$1 AND user_b=$2', [a, b]);
      if (!existing) return res.status(404).json({ error: 'user_not_found' });
    }
    res.json({ id: await conversationBetween(me, peer.id), peer: publicUser(peer) });
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

  r.get('/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
    const conv = await getConversation(req.params.id, res.locals.userId);
    const rows = await q<MsgRow>(
      `SELECT m.* FROM messages m
       LEFT JOIN conversation_clears cc ON cc.conversation_id=m.conversation_id AND cc.user_id=$2
       WHERE m.conversation_id=$1 AND m.created_at > COALESCE(cc.cleared_at, '-infinity')
       ORDER BY m.created_at ASC LIMIT 500`, [conv.id, res.locals.userId]);
    const peer = publicUser(await getUser(conv.peerId));
    res.json({
      peer,
      messages: rows.map((m) => serializeMessage(m, m.sender_id === res.locals.userId ? conv.peerId : res.locals.userId)),
    });
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
    const { text, kind } = z.object({ text: z.string().trim().min(1).max(4000), kind: z.enum(['text', 'voice']).default('text') }).parse(req.body);
    const conv = await getConversation(req.params.id, res.locals.userId);
    const [sender, recipient] = await Promise.all([getUser(res.locals.userId), getUser(conv.peerId)]);
    const msg = await storeAndEmit(conv, sender, recipient, text, kind);
    res.json(msg);
    if (recipient.is_bot) void botReply(conv, recipient, sender);
  }));

  /** Composer preview: detect + translate for the other person without sending. */
  r.post('/conversations/:id/preview', requireAuth, wrap(async (req, res) => {
    const { text, mode } = z.object({ text: z.string().trim().min(1).max(4000), mode: prefs.translationMode.optional() }).parse(req.body);
    const conv = await getConversation(req.params.id, res.locals.userId);
    const [sender, recipient] = await Promise.all([getUser(res.locals.userId), getUser(conv.peerId)]);
    const t = await translateFor(sender, recipient, conv.id, text, {}, mode);
    res.json({
      detected: { language: t.detectedLanguage, languageCode: t.detectedLanguageCode, script: t.detectedScript, romanized: t.isRomanized, confidence: t.confidence, label: detectionLabel(t.detectedLanguageCode, t.isRomanized) },
      translateTo: { languageCode: recipient.language, label: detectionLabel(recipient.language, recipient.output_format !== 'native') },
      translation: t,
      primaryText: primaryText(t),
    });
  }));

  r.post('/messages/:id/retranslate', requireAuth, wrap(async (req, res) => {
    const { mode } = z.object({ mode: prefs.translationMode.optional() }).parse(req.body ?? {});
    const [m] = await q<MsgRow>('SELECT * FROM messages WHERE id=$1', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'message_not_found' });
    const conv = await getConversation(m.conversation_id, res.locals.userId);
    const [sender, recipient] = await Promise.all([getUser(m.sender_id), getUser(m.sender_id === conv.user_a ? conv.user_b : conv.user_a)]);
    const t = await translateFor(sender, recipient, conv.id, m.original_text,
      m.translation ? { regenerate: { previous: primaryText(m.translation) } } : {}, mode);
    const [row] = await q<MsgRow>('UPDATE messages SET translation=$1 WHERE id=$2 RETURNING *', [JSON.stringify(t), m.id]);
    const msg = serializeMessage(row, recipient.id);
    emit([sender.id, recipient.id], 'message_updated', msg);
    res.json(msg);
  }));

  // ---- voice ------------------------------------------------------------
  /**
   * Server-side STT fallback. The mobile app transcribes on-device by default;
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
    if (!ocr) return res.status(501).json({ error: 'vision_not_configured' });
    const { imageBase64, mimeType } = z.object({
      imageBase64: z.string().max(14_000_000),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).default('image/jpeg'),
    }).parse(req.body);
    res.json({ text: await ocr.extractText(imageBase64, mimeType) });
  }));

  // ---- demo bots --------------------------------------------------------
  async function botReply(conv: { id: string }, bot: UserRow, human: UserRow) {
    const def = BOTS.find((b) => b.handle === bot.handle);
    if (!def) return;
    await new Promise((r2) => setTimeout(r2, 1500));
    try {
      const text = def.replies[Math.floor(Math.random() * def.replies.length)];
      await storeAndEmit(conv, bot, human, text, 'text');
    } catch (e) {
      console.error('bot reply failed', e);
    }
  }

  return r;
}
