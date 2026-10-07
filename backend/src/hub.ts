import type { WebSocket } from 'ws';

/** userId -> open sockets. Tiny in-process pub/sub; swap for Redis when scaling horizontally. */
const sockets = new Map<string, Set<WebSocket>>();

export function register(userId: string, ws: WebSocket) {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId)!.add(ws);
  ws.on('close', () => sockets.get(userId)?.delete(ws));
}

export function emit(userIds: string[], event: string, data: unknown) {
  const payload = JSON.stringify({ event, data });
  for (const id of userIds) for (const ws of sockets.get(id) ?? []) if (ws.readyState === ws.OPEN) ws.send(payload);
}
