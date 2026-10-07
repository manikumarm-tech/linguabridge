import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { notify } from '../components/dialog';
import { PeoplePicker } from '../components/PeoplePicker';
import { radius, useTheme } from '../theme';
import type { User } from '../types';
import type { RootStack } from '../../App';

/** Name the group and pick friends. Everyone reads every message in their own language. */
export function NewGroup({ navigation }: NativeStackScreenProps<RootStack, 'NewGroup'>) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const [friends, setFriends] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.friends().then(setFriends).catch((e) => notify('Could not load friends', (e as Error).message)); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const g = await api.createGroup(title.trim(), selected);
      navigation.replace('Chat', { conversationId: g.id, peerName: g.title });
    } catch (e) { notify('Could not create group', (e as Error).message); }
    finally { setBusy(false); }
  };
  const ready = title.trim().length > 0 && selected.length > 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.screen }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.sub, fontSize: 14 }}>Everyone writes in their own language and reads everyone else in theirs.</Text>
      <TextInput value={title} onChangeText={setTitle} maxLength={60} placeholder="Group name (e.g. Weekend gang)" placeholderTextColor={t.sub}
        style={{ backgroundColor: t.card, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14, fontSize: 16 }} />
      <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12 }}>ADD PEOPLE {selected.length ? `(${selected.length})` : ''}</Text>
      {friends === null ? <ActivityIndicator color={t.primary} /> : friends.length === 0 ? (
        <Text style={{ color: t.sub }}>Add friends first (Add friend → share your code), then make a group with them.</Text>
      ) : (
        <PeoplePicker people={friends} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
      )}
      <Pressable disabled={!ready || busy} onPress={create}
        style={{ backgroundColor: t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center', opacity: ready ? 1 : 0.5 }}>
        {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700', fontSize: 16 }}>Create group</Text>}
      </Pressable>
    </ScrollView>
  );
}
