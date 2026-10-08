import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket } from '../api/client';
import { Avatar } from '../components/Avatar';
import { confirmDeleteChat } from '../components/dialog';
import { setUnreadTitle, showMessageNotification } from '../components/notify-web';
import { useApp } from '../store/app';
import { useTheme } from '../theme';
import { fx } from '../ui/web';
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
    if (!(await confirmDeleteChat(item.title))) return;
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    try { await api.deleteConversation(item.id); } catch { load(); }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => connectSocket((e, data) => {
    if (e === 'message' && data.senderId !== me.id) {
      const from = itemsRef.current.find((x) => x.id === data.conversationId)?.title ?? 'New message';
      showMessageNotification(from, data.primaryText);
    }
    if (['message', 'message_updated', 'connected', 'read', 'presence', 'group_added', 'group_updated'].includes(e)) load(true);
  }), [load, me.id]);

  const [query, setQuery] = useState('');
  const shown = query.trim()
    ? items.filter((x) => `${x.title} ${x.lastMessage ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : items;
  const totalUnread = items.reduce((n, x) => n + x.unread, 0);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={{ flex: 1, backgroundColor: t.screen, paddingTop: Platform.OS === 'web' ? 28 : 60 }}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => navigation.navigate('Settings')} accessibilityLabel="Profile and settings" {...fx({ press: true })}>
          <Avatar name={me.name} url={me.avatarUrl} size={46} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.sub, fontSize: 13, fontWeight: '600' }}>{hello}, {me.name.split(' ')[0]} 👋</Text>
          <Text {...fx({ gradtext: true })} style={{ color: t.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>EasyTalk</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10} accessibilityLabel="Settings" {...fx({ press: true })}
          style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chip }}>
          <Text style={{ fontSize: 19 }}>⚙️</Text>
        </Pressable>
      </View>

      <View {...fx({ focusring: true })} style={{ marginHorizontal: 20, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.chip, borderRadius: 999, paddingHorizontal: 16, height: 44 }}>
        <Text style={{ color: t.sub, fontSize: 15 }}>🔍</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search chats" placeholderTextColor={t.sub}
          style={{ flex: 1, color: t.text, fontSize: 15, height: 44 }} />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Text style={{ color: t.sub }}>✕</Text></Pressable> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 14, marginBottom: 8 }}>
        <Pressable onPress={() => navigation.navigate('NewConversation')} {...fx({ grad: 'primary', press: true, glow: true })}
          style={{ flex: 1, backgroundColor: t.primary, paddingVertical: 14, borderRadius: 999, alignItems: 'center' }}>
          <Text style={{ color: t.onPrimary, fontSize: 15, fontWeight: '700' }}>＋  Add friend</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('NewGroup')} {...fx({ press: true })}
          style={{ flex: 1, backgroundColor: t.chip, paddingVertical: 14, borderRadius: 999, alignItems: 'center', borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>👥  New group</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 4 }}>
        <Text style={{ color: t.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>CHATS</Text>
        {totalUnread ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', marginLeft: 8 }}>{totalUnread} unread</Text> : null}
      </View>

      <FlatList
        data={shown} keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load()} />}
        ListEmptyComponent={query ? (
          <Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>No chats match “{query}”.</Text>
        ) : (
          <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 32, gap: 10 }}>
            <View {...fx({ grad: 'soft' })} style={{ width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: t.chip }}>
              <Text style={{ fontSize: 50 }}>💬</Text>
            </View>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', marginTop: 8 }}>Say hi in any language</Text>
            <Text style={{ color: t.sub, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
              Tap <Text style={{ color: t.text, fontWeight: '700' }}>Add friend</Text> and share your code. You type in Tanglish, they read in Hindi, and the other way round.
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, peerName: item.title })}
            onLongPress={() => remove(item)} delayLongPress={400} {...fx({ row: true })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 18 }}>
            <Avatar name={item.isGroup ? '👥' : item.title} url={item.peer?.avatarUrl} online={item.peer?.online} size={54} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16.5, fontWeight: '700' }}>
                  {item.title}{item.isGroup ? <Text style={{ color: t.sub, fontSize: 12.5, fontWeight: '500' }}>{`  ·  ${item.memberCount} people`}</Text> : null}
                </Text>
                <Text style={{ color: item.unread ? t.primary : t.sub, fontSize: 12, fontWeight: item.unread ? '700' : '500' }}>{formatTime(item.lastAt)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: item.unread ? t.text : t.sub, fontSize: 14.5, fontWeight: item.unread ? '600' : '400' }}>{item.lastMessage ?? 'Say hello 👋'}</Text>
                {item.unread ? (
                  <View {...fx({ grad: 'primary', anim: 'pop' })} style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: t.onPrimary, fontSize: 11.5, fontWeight: '800' }}>{item.unread > 99 ? '99+' : item.unread}</Text>
                  </View>
                ) : null}
              </View>
              {item.detectedLabel ? <Text style={{ color: t.sub, fontSize: 11.5, marginTop: 3 }}>🌐 {item.detectedLabel}</Text> : null}
            </View>
            <Pressable onPress={() => remove(item)} accessibilityLabel={`Delete chat with ${item.title}`} hitSlop={10} {...fx({ rowaction: true })}
              style={{ padding: 8, borderRadius: 999 }}>
              <Text style={{ fontSize: 16 }}>🗑️</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}
