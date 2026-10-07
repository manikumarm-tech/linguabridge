import type { WebSocket } from 'ws';

/** userId -> open sockets. Tiny in-process pub/sub; swap for Redis when scaling horizontally. */
const sockets = new Map<string, Set<WebSocket>>();

/** Track a socket; `onPresence` fires on a user's first connection (true) and when their last one closes (false). */
export function register(userId: string, ws: WebSocket, onPresence?: (online: boolean) => void) {
  const set = sockets.get(userId) ?? new Set<WebSocket>();
  const wasOnline = set.size > 0;
  set.add(ws);
  sockets.set(userId, set);
  if (!wasOnline) onPresence?.(true);
  ws.on('close', () => {
    set.delete(ws);
    if (set.size === 0) { sockets.delete(userId); onPresence?.(false); }
  });
}

export const isOnline = (userId: string) => (sockets.get(userId)?.size ?? 0) > 0;

export function emit(userIds: string[], event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const id of userIds) for (const ws of sockets.get(id) ?? []) if (ws.readyState === ws.OPEN) ws.send(payload);
}
