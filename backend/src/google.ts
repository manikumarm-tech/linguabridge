import { config } from './config.js';

export interface GoogleProfile { sub: string; email: string; name: string; picture?: string }

/** Verify a Google Sign-In ID token (signature, expiry and issuer are checked by Google's tokeninfo endpoint). */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const t = (await res.json().catch(() => ({}))) as Record<string, string>;
  const bad = () => Object.assign(new Error('invalid_google_token'), { status: 401 });
  if (!res.ok) throw bad();
  if (!config.googleClientIds.includes(t.aud)) throw bad();
  if (t.iss !== 'accounts.google.com' && t.iss !== 'https://accounts.google.com') throw bad();
  if (t.email_verified !== 'true' || Number(t.exp) * 1000 < Date.now()) throw bad();
  return { sub: t.sub, email: t.email, name: t.name || t.email.split('@')[0], picture: t.picture };
}
