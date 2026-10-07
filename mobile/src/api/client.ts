import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ConversationItem, Message, Preview, TranslationMode, User } from '../types';

// the deployed website is served by the API itself, so on web use the page's own origin (except the :8081 dev server)
const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' && window.location.port !== '8081' ? window.location.origin : '';

const defaultUrl =
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  webOrigin ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');

let baseUrl = defaultUrl;
let token: string | null = null;

export const getBaseUrl = () => baseUrl;
export const defaultBaseUrl = defaultUrl;
export const setBaseUrl = (u: string) => { baseUrl = u.replace(/\/$/, ''); };
export const setToken = (t: string | null) => { token = t; };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export const api = {
  register: (b: Partial<User> & { name: string; handle: string; language: string }) =>
    call<{ token: string; user: User }>('POST', '/auth/register', b),
  login: (handle: string) => call<{ token: string; user: User }>('POST', '/auth/login', { handle }),
  config: () => call<{ googleClientId: string | null }>('GET', '/config'),
  googleSignIn: (idToken: string, profile?: { language: string; outputFormat: User['outputFormat']; showEnglish: boolean }) =>
    call<{ token: string; user: User } | { needsProfile: true; name: string; email: string }>('POST', '/auth/google', { idToken, profile }),
  linkGoogle: (idToken: string) => call<User>('POST', '/auth/google/link', { idToken }),
  updateMe: (b: Partial<User>) => call<User>('PATCH', '/me', b),
  conversations: () => call<ConversationItem[]>('GET', '/conversations'),
  myConnectCode: () => call<{ code: string; expiresAt: string }>('POST', '/connect/code'),
  redeemConnectCode: (code: string) => call<{ id: string; peer: User }>('POST', '/connect/redeem', { code }),
  openConversation: (peerHandle: string) => call<{ id: string; peer: User }>('POST', '/conversations', { peerHandle }),
  messages: (id: string) => call<{ peer: User; messages: Message[] }>('GET', `/conversations/${id}/messages`),
  deleteConversation: (id: string) => call<{ ok: true }>('DELETE', `/conversations/${id}`),
  send: (id: string, text: string, kind: 'text' | 'voice' = 'text') =>
    call<Message>('POST', `/conversations/${id}/messages`, { text, kind }),
  preview: (id: string, text: string, mode?: TranslationMode) =>
    call<Preview>('POST', `/conversations/${id}/preview`, { text, mode }),
  retranslate: (messageId: string, mode?: TranslationMode) =>
    call<Message>('POST', `/messages/${messageId}/retranslate`, { mode }),
  extractText: (imageBase64: string, mimeType: string) =>
    call<{ text: string }>('POST', '/vision/extract-text', { imageBase64, mimeType }),
};

export function connectSocket(onEvent: (event: string, data: any) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 1000;
  const open = () => {
    if (closed || !token) return;
    ws = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
    ws.onmessage = (e) => { try { const { event, data } = JSON.parse(String(e.data)); onEvent(event, data); } catch {} };
    ws.onopen = () => { retry = 1000; };
    ws.onclose = () => { if (!closed) setTimeout(open, (retry = Math.min(retry * 2, 15000))); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}
