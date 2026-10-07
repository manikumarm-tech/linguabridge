import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Avatar } from '../components/Avatar';
import { confirm, notify } from '../components/dialog';
import { PeoplePicker } from '../components/PeoplePicker';
import { langByCode } from '../languages';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { User } from '../types';
import type { RootStack } from '../../App';

export function GroupInfo({ route, navigation }: NativeStackScreenProps<RootStack, 'GroupInfo'>) {
  const { conversationId } = route.params;
  const t = useTheme();
  const me = useApp((s) => s.user)!;
  const [group, setGroup] = useState<{ title: string; members: User[] } | null>(null);
  const [adding, setAdding] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.group(conversationId).then(setGroup).catch((e) => notify('Could not load group', (e as Error).message)), [conversationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (group) navigation.setOptions({ title: group.title }); }, [group, navigation]);

  const startAdding = async () => {
    const friends = await api.friends();
    setAdding(friends.filter((f) => !group?.members.some((m) => m.id === f.id)));
    setSelected([]);
  };
  const add = async () => {
    setBusy(true);
    try { await api.addGroupMembers(conversationId, selected); setAdding(null); await load(); }
    catch (e) { notify('Could not add', (e as Error).message); }
    finally { setBusy(false); }
  };
  const leave = async () => {
    if (!(await confirm('Leave group?', "You won't get new messages from this group.", 'Leave'))) return;
    try { await api.leaveGroup(conversationId); navigation.navigate('Home'); }
    catch (e) { notify('Could not leave', (e as Error).message); }
  };

  if (!group) return <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.screen }} contentContainerStyle={{ padding: 20, gap: 10 }}>
      <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12 }}>{group.members.length} MEMBERS</Text>
      {group.members.map((u) => (
        <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
          <Avatar name={u.name} url={u.avatarUrl} online={u.online} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{u.id === me.id ? `${u.name} (you)` : u.name}</Text>
            <Text style={{ color: t.sub, fontSize: 13 }}>Reads in {langByCode(u.language)?.name ?? u.language}</Text>
          </View>
        </View>
      ))}

      {adding ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Text style={{ color: t.sub, fontWeight: '700', fontSize: 12 }}>ADD PEOPLE</Text>
          {adding.length ? <PeoplePicker people={adding} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
            : <Text style={{ color: t.sub }}>All your friends are already here.</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setAdding(null)} style={{ flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.chip }}><Text style={{ color: t.text, fontWeight: '600' }}>Cancel</Text></Pressable>
            <Pressable disabled={!selected.length || busy} onPress={add} style={{ flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.primary, opacity: selected.length ? 1 : 0.5 }}>
              {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Add</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={startAdding} style={{ marginTop: 12, padding: 16, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.chip }}>
          <Text style={{ color: t.primary, fontWeight: '700' }}>+ Add people</Text>
        </Pressable>
      )}

      <Pressable onPress={leave} style={{ marginTop: 20, padding: 16, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.chip }}>
        <Text style={{ color: t.warn, fontWeight: '700' }}>Leave group</Text>
      </Pressable>
    </ScrollView>
  );
}
