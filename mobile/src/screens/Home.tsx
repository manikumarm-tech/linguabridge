import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket } from '../api/client';
import { confirmDeleteChat } from '../components/confirm';
import { radius, useTheme } from '../theme';
import type { ConversationItem } from '../types';
import type { RootStack } from '../../App';

export function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  return diff < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function Home({ navigation }: NativeStackScreenProps<RootStack, 'Home'>) {
  const t = useTheme();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setItems(await api.conversations()); } catch {} finally { setRefreshing(false); }
  }, []);

  const remove = async (item: ConversationItem) => {
    if (!(await confirmDeleteChat(item.peer.name))) return;
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    try { await api.deleteConversation(item.id); } catch { load(); }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => connectSocket((e) => { if (e === 'message') load(); }), [load]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 64 }}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '800' }}>LinguaBridge</Text>
          <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>Break language barriers.</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}><Text style={{ fontSize: 26 }}>⚙️</Text></Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate('NewConversation')} style={{ margin: 20, backgroundColor: t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center' }}>
        <Text style={{ color: t.onPrimary, fontSize: 16, fontWeight: '700' }}>+  New Conversation</Text>
      </Pressable>

      <FlatList
        data={items} keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListHeaderComponent={items.length ? <Text style={{ color: t.sub, fontSize: 12, paddingHorizontal: 20, paddingBottom: 6 }}>Long-press a chat to delete it</Text> : null}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }}>No conversations yet. Start one with a friend, or try a demo contact.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('Chat', { conversationId: item.id, peerName: item.peer.name })} onLongPress={() => remove(item)} delayLongPress={400} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomColor: t.border, borderBottomWidth: 1 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: t.primary, fontSize: 20, fontWeight: '700' }}>{item.peer.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{item.peer.name}</Text>
                <Text style={{ color: t.sub, fontSize: 12 }}>{formatTime(item.lastAt)}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>{item.lastMessage ?? 'Say hello 👋'}</Text>
              {item.detectedLabel ? <Text style={{ color: t.primary, fontSize: 12, marginTop: 3 }}>{item.detectedLabel}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
