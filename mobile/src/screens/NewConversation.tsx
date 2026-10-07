import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
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

  const open = async (h: string) => {
    setBusy(true);
    try {
      const c = await api.openConversation(h.trim());
      navigation.replace('Chat', { conversationId: c.id, peerName: c.peer.name });
    } catch (e) {
      const m = (e as Error).message;
      Alert.alert('Could not start conversation', m === 'user_not_found' ? 'No user with that username.' : m);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 20 }}>
      <Text style={{ color: t.sub, marginBottom: 8 }}>Your username: <Text style={{ color: t.text, fontWeight: '700' }}>{me.handle}</Text></Text>
      <TextInput value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="Friend's username" placeholderTextColor={t.sub}
        style={{ backgroundColor: t.card, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14, fontSize: 16 }} />
      <Pressable disabled={busy || handle.trim().length < 3} onPress={() => open(handle)} style={{ marginTop: 12, backgroundColor: t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center', opacity: handle.trim().length < 3 ? 0.5 : 1 }}>
        {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 16 }}>Start chat</Text>}
      </Pressable>

      <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12, marginTop: 32, marginBottom: 8 }}>TRY A DEMO CONTACT</Text>
      {DEMOS.map((d) => (
        <Pressable key={d.handle} onPress={() => open(d.handle)} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontSize: 16 }}>{d.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
