import { q } from './db.js';
import { emit } from './hub.js';

const partners = async (userId: string) =>
  (await q<{ id: string }>(
    `SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS id FROM conversations WHERE user_a=$1 OR user_b=$1`, [userId],
  )).map((r) => r.id);

/** Tell everyone I chat with that I came online / went offline. */
export async function presenceChanged(userId: string, online: boolean) {
  let lastSeenAt: string | null = null;
  if (!online) [{ last_seen_at: lastSeenAt }] = await q<{ last_seen_at: string }>('UPDATE users SET last_seen_at=now() WHERE id=$1 RETURNING last_seen_at', [userId]);
  emit(await partners(userId), 'presence', { userId, online, lastSeenAt });
}

const lastTyping = new Map<string, number>();
/** Relay "typing…" to the other person in the conversation (at most once a second per user). */
export async function typing(userId: string, conversationId: unknown) {
  if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/.test(conversationId)) return;
  const now = Date.now();
  if (now - (lastTyping.get(userId) ?? 0) < 1000) return;
  lastTyping.set(userId, now);
  const [c] = await q<{ peer: string }>(
    `SELECT CASE WHEN user_a=$2 THEN user_b ELSE user_a END AS peer FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)`,
    [conversationId, userId]);
  if (c) emit([c.peer], 'typing', { conversationId, userId });
}
