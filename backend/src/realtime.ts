import { q } from './db.js';
import { emit } from './hub.js';

/** Everyone who shares a chat or group with me. */
const partners = async (userId: string) =>
  (await q<{ id: string }>(
    `SELECT DISTINCT o.user_id AS id FROM conversation_members mine
     JOIN conversation_members o ON o.conversation_id=mine.conversation_id AND o.user_id<>$1
     WHERE mine.user_id=$1`, [userId],
  )).map((r) => r.id);

/** Tell everyone I chat with that I came online / went offline. */
export async function presenceChanged(userId: string, online: boolean) {
  let lastSeenAt: string | null = null;
  if (!online) [{ last_seen_at: lastSeenAt }] = await q<{ last_seen_at: string }>('UPDATE users SET last_seen_at=now() WHERE id=$1 RETURNING last_seen_at', [userId]);
  emit(await partners(userId), 'presence', { userId, online, lastSeenAt });
}

const lastTyping = new Map<string, number>();
/** Relay "typing…" to the others in the conversation (at most once a second per user). */
export async function typing(userId: string, conversationId: unknown) {
  if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/.test(conversationId)) return;
  const now = Date.now();
  if (now - (lastTyping.get(userId) ?? 0) < 1000) return;
  lastTyping.set(userId, now);
  const members = (await q<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id=$1', [conversationId])).map((r) => r.user_id);
  if (members.includes(userId)) emit(members.filter((id) => id !== userId), 'typing', { conversationId, userId });
}
