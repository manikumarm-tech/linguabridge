import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { langByCode } from '../languages';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { RootStack } from '../../App';

const DEMOS = [
  { handle: 'demo-priya', label: 'Priya • Hindi / Hinglish' },
  { handle: 'demo-karthik', label: 'Karthik • Tamil / Tanglish' },
  { handle: 'demo-lucia', label: 'Lucía • Spanish' },
];

export function NewConversation({ navigation }: NativeStackScreenProps<RootStack, 'NewConversation'>) {
  const t = useTheme();
  const me = useApp((s) => s.user)!;
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof api.searchUsers>>>([]);

  // suggest usernames as you type ("karthi" → demo-karthik)
  useEffect(() => {
    const term = handle.trim();
    if (term.length < 2) { setMatches([]); return; }
    const id = setTimeout(() => { api.searchUsers(term).then(setMatches).catch(() => setMatches([])); }, 250);
    return () => clearTimeout(id);
  }, [handle]);

  const open = async (h: string) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.openConversation(h.trim());
      navigation.replace('Chat', { conversationId: c.id, peerName: c.peer.name });
    } catch (e) {
      const m = (e as Error).message;
      setError(m === 'user_not_found'
        ? `No one with the username "${h.trim()}". Ask your friend for their exact username (shown at the top of this screen on their phone), or pick a suggestion.`
        : m === 'cannot_chat_with_self' ? "That's your own username." : m);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 20 }}>
      <Text style={{ color: t.sub, marginBottom: 8 }}>Your username: <Text style={{ color: t.text, fontWeight: '700' }}>{me.handle}</Text></Text>
      <TextInput value={handle} onChangeText={(v) => { setHandle(v); setError(null); }} onSubmitEditing={() => handle.trim().length >= 3 && open(handle)} autoCapitalize="none" placeholder="Friend's username" placeholderTextColor={t.sub}
        style={{ backgroundColor: t.card, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14, fontSize: 16 }} />
      <Pressable disabled={busy || handle.trim().length < 3} onPress={() => open(handle)} style={{ marginTop: 12, backgroundColor: t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center', opacity: handle.trim().length < 3 ? 0.5 : 1 }}>
        {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 16 }}>Start chat</Text>}
      </Pressable>
      {error ? <Text style={{ color: t.warn, marginTop: 10, fontSize: 14 }}>{error}</Text> : null}

      {matches.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12, marginBottom: 8 }}>SUGGESTIONS</Text>
          {matches.map((u) => (
            <Pressable key={u.handle} onPress={() => open(u.handle)} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{u.name}</Text>
              <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>@{u.handle} · {langByCode(u.language)?.name ?? u.language}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12, marginTop: 32, marginBottom: 8 }}>TRY A DEMO CONTACT</Text>
      {DEMOS.map((d) => (
        <Pressable key={d.handle} onPress={() => open(d.handle)} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontSize: 16 }}>{d.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
