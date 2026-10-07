import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket } from '../api/client';
import { Avatar } from '../components/Avatar';
import { confirmDeleteChat } from '../components/dialog';
import { setUnreadTitle, showMessageNotification } from '../components/notify-web';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { ConversationItem } from '../types';
import type { RootStack } from '../../App';

/** "online" / "last seen today at 2:20 PM" / "last seen Mon" */
export function lastSeen(online?: boolean, iso?: string | null) {
  if (online) return 'online';
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? `last seen today at ${formatTime(iso)}` : `last seen ${formatTime(iso)}`;
}

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

  const me = useApp((s) => s.user)!;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const xs = await api.conversations();
      setItems(xs);
      setUnreadTitle(xs.reduce((n, x) => n + x.unread, 0));
    } catch {} finally { setRefreshing(false); }
  }, []);

  const remove = async (item: ConversationItem) => {
    if (!(await confirmDeleteChat(item.peer.name))) return;
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    try { await api.deleteConversation(item.id); } catch { load(); }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => connectSocket((e, data) => {
    if (e === 'message' && data.senderId !== me.id) {
      const from = itemsRef.current.find((x) => x.id === data.conversationId)?.peer.name ?? 'New message';
      showMessageNotification(from, data.primaryText);
    }
    if (e === 'message' || e === 'connected' || e === 'read' || e === 'presence') load(true);
  }), [load, me.id]);

  return (
    <View style={{ flex: 1, backgroundColor: t.screen, paddingTop: 64 }}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: t.text, fontSize: 30, fontWeight: '800' }}>EasyTalk</Text>
          <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>Break language barriers.</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}><Text style={{ fontSize: 26 }}>⚙️</Text></Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate('NewConversation')} style={{ margin: 20, backgroundColor: t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center' }}>
        <Text style={{ color: t.onPrimary, fontSize: 16, fontWeight: '700' }}>+  Add friend</Text>
      </Pressable>

      <FlatList
        data={items} keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load()} />}
        ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 }}>No chats yet. Tap Add friend and share your code, or try a demo contact.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('Chat', { conversationId: item.id, peerName: item.peer.name })} onLongPress={() => remove(item)} delayLongPress={400} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomColor: t.border, borderBottomWidth: 1 }}>
            <Avatar name={item.peer.name} url={item.peer.avatarUrl} online={item.peer.online} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{item.peer.name}</Text>
                <Text style={{ color: item.unread ? t.primary : t.sub, fontSize: 12, fontWeight: item.unread ? '700' : '400' }}>{formatTime(item.lastAt)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: item.unread ? t.text : t.sub, fontSize: 15, fontWeight: item.unread ? '600' : '400' }}>{item.lastMessage ?? 'Say hello 👋'}</Text>
                {item.unread ? (
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: t.onPrimary, fontSize: 12, fontWeight: '800' }}>{item.unread > 99 ? '99+' : item.unread}</Text>
                  </View>
                ) : null}
              </View>
              {item.detectedLabel ? <Text style={{ color: t.primary, fontSize: 12, marginTop: 3 }}>{item.detectedLabel}</Text> : null}
            </View>
            <Pressable onPress={() => remove(item)} accessibilityLabel={`Delete chat with ${item.peer.name}`} hitSlop={10} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={{ fontSize: 18 }}>🗑️</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}
