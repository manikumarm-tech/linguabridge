import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { api } from '../api/client';

declare global {
  interface Window { google?: any }
}

let clientId: Promise<string | null> | null = null;
const getClientId = () => (clientId ??= api.config().then((c) => c.googleClientId).catch(() => null));

let script: Promise<void> | null = null;
const loadScript = () => (script ??= new Promise<void>((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => resolve();
  s.onerror = () => { script = null; reject(new Error('Could not load Google sign-in')); };
  document.head.appendChild(s);
}));

/**
 * Google's own "Sign in with Google" button (web). Calls onToken with the ID token.
 * Renders nothing on native for now, or when the server has no Google client ID configured.
 */
export function GoogleButton({ onToken, text = 'continue_with' }: { onToken: (idToken: string) => void; text?: 'continue_with' | 'signin_with' | 'signup_with' }) {
  const host = useRef<View>(null);
  const [enabled, setEnabled] = useState(false);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let live = true;
    (async () => {
      const id = await getClientId();
      if (!id || !live) return;
      await loadScript();
      if (!live) return;
      setEnabled(true);
      window.google.accounts.id.initialize({ client_id: id, callback: (r: { credential: string }) => cb.current(r.credential) });
      const el = host.current as unknown as HTMLElement;
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      window.google.accounts.id.renderButton(el, { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text, width: Math.min(el.clientWidth || 320, 400) });
    })().catch(() => {});
    return () => { live = false; };
  }, [text]);

  if (Platform.OS !== 'web') return null;
  return <View ref={host} style={{ alignItems: 'center', minHeight: enabled ? 44 : 0 }} />;
}
