import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket } from '../api/client';
import { radius, useTheme } from '../theme';
import { fx } from '../ui/web';
import type { RootStack } from '../../App';

const DEMOS = [
  { handle: 'demo-priya', label: 'Priya • Hindi / Hinglish' },
  { handle: 'demo-karthik', label: 'Karthik • Tamil / Tanglish' },
  { handle: 'demo-lucia', label: 'Lucía • Spanish' },
];

const ERRORS: Record<string, string> = {
  invalid_code: 'That code is wrong or has expired. Ask your friend for a new one.',
  own_code: "That's your own code. Send it to your friend instead.",
  too_many_attempts: 'Too many tries. Wait a minute and try again.',
  invalid_request: 'Enter all 6 digits.',
};

const spaced = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

/** Add friend: share my 6-digit code, or enter a friend's code. */
export function NewConversation({ navigation }: NativeStackScreenProps<RootStack, 'NewConversation'>) {
  const t = useTheme();
  const [mine, setMine] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCode = useCallback(() => { api.myConnectCode().then(setMine).catch((e) => setError((e as Error).message)); }, []);
  useEffect(refreshCode, [refreshCode]);

  // countdown; fetch a fresh code when this one runs out
  useEffect(() => {
    if (!mine) return;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(mine.expiresAt).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) refreshCode();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mine, refreshCode]);

  // my friend entered my code: jump straight into the new chat
  useEffect(() => connectSocket((event, data) => {
    if (event === 'connected') navigation.replace('Chat', { conversationId: data.id, peerName: data.peer.name });
  }), [navigation]);

  const go = (c: { id: string; peer: { name: string } }) => navigation.replace('Chat', { conversationId: c.id, peerName: c.peer.name });

  const redeem = async (code: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { go(await api.redeemConnectCode(code)); }
    catch (e) { const m = (e as Error).message; setError(ERRORS[m] ?? m); }
    finally { setBusy(false); }
  };

  const openDemo = async (handle: string) => {
    try { go(await api.openConversation(handle)); } catch (e) { setError((e as Error).message); }
  };

  const share = async () => {
    if (!mine) return;
    const message = `Add me on EasyTalk 👋 My code: ${spaced(mine.code)} (valid for 10 minutes)`;
    try {
      if (Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator)) { await Share.share({ message }); return; }
    } catch { /* cancelled or unsupported: fall back to copy */ }
    await Clipboard.setStringAsync(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const card = { backgroundColor: t.card, borderRadius: radius.xl, borderWidth: 1, borderColor: t.border, padding: 22 } as const;
  const heading = { color: t.sub, fontWeight: '800', fontSize: 11.5, letterSpacing: 1, marginBottom: 10 } as const;
  const button = { backgroundColor: t.primary, padding: 14, borderRadius: 999, alignItems: 'center', flex: 1 } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.screen }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={card}>
        <Text style={heading}>MY CODE</Text>
        <Text style={{ color: t.sub, fontSize: 14 }}>Send this to your friend. When they enter it, you're connected.</Text>
        {mine ? (
          <>
            <View accessible accessibilityLabel={`Your code ${mine.code.split('').join(' ')}`} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 18 }}>
              {mine.code.split('').map((d, i) => (
                <React.Fragment key={i}>
                  {i === 3 ? <View style={{ width: 8 }} /> : null}
                  <View {...fx({ grad: 'soft', anim: 'pop' })} style={{ width: 46, height: 60, borderRadius: 14, backgroundColor: t.chip, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text {...fx({ gradtext: true })} style={{ color: t.primary, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{d}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <Text style={{ color: t.sub, textAlign: 'center', marginBottom: 16 }}>
              {`Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · works once`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={share} {...fx({ grad: 'primary', press: true, glow: true })} style={button}><Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 16 }}>{copied ? 'Copied ✓' : 'Share'}</Text></Pressable>
              <Pressable onPress={async () => { await Clipboard.setStringAsync(mine.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                style={{ ...button, backgroundColor: t.chip }}>
                <Text style={{ color: t.primary, fontWeight: '700', fontSize: 16 }}>Copy code</Text>
              </Pressable>
            </View>
          </>
        ) : <ActivityIndicator color={t.primary} style={{ marginVertical: 32 }} />}
      </View>

      <View style={card}>
        <Text style={heading}>ENTER A FRIEND'S CODE</Text>
        <TextInput
          value={entry}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 6);
            setEntry(digits);
            setError(null);
            if (digits.length === 6) redeem(digits);
          }}
          keyboardType="number-pad" inputMode="numeric" maxLength={7} placeholder="000000" placeholderTextColor={t.border}
          style={{ backgroundColor: t.bg, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: error ? t.warn : t.border, padding: 14, fontSize: 28, fontWeight: '700', letterSpacing: 8, textAlign: 'center' }}
        />
        {error ? <Text style={{ color: t.warn, marginTop: 10, fontSize: 14 }}>{error}</Text> : null}
        <Pressable disabled={busy || entry.length !== 6} onPress={() => redeem(entry)} {...fx({ grad: entry.length === 6 ? 'primary' : undefined, press: true })} style={{ ...button, flex: undefined, marginTop: 12, opacity: entry.length === 6 ? 1 : 0.5 }}>
          {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 16 }}>Connect</Text>}
        </Pressable>
      </View>

      <View>
        <Text style={heading}>OR TRY A DEMO CONTACT</Text>
        {DEMOS.map((d) => (
          <Pressable key={d.handle} onPress={() => openDemo(d.handle)} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
            <Text style={{ color: t.text, fontSize: 16 }}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
