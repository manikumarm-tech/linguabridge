import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket, sendSocket } from '../api/client';
import { Avatar } from '../components/Avatar';
import { Composer } from '../components/Composer';
import { confirmDeleteChat, notify } from '../components/dialog';
import { MessageBubble } from '../components/MessageBubble';
import { lastSeen } from './Home';
import { useApp } from '../store/app';
import { useTheme } from '../theme';
import type { Message, User } from '../types';
import type { RootStack } from '../../App';

export function Chat({ route, navigation }: NativeStackScreenProps<RootStack, 'Chat'>) {
  const { conversationId, peerName } = route.params;
  const t = useTheme();
  const me = useApp((s) => s.user)!;
  const [peer, setPeer] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useRef<FlatList<Message>>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);

  const visible = () => Platform.OS !== 'web' || !document.hidden;
  const markRead = useCallback(() => { if (visible()) api.markRead(conversationId).catch(() => {}); }, [conversationId]);
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sendSocket('typing', { conversationId });
  }, [conversationId]);

  const status = typing ? 'typing…' : lastSeen(peer?.online, peer?.lastSeenAt) || 'Translating automatically';

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={peerName} url={peer?.avatarUrl} size={36} />
          <View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{peerName}</Text>
            <Text style={{ color: typing || peer?.online ? '#22C55E' : t.primary, fontSize: 12 }}>{status}</Text>
          </View>
        </View>
      ),
      headerRight: () => (
        <Pressable
          hitSlop={10}
          accessibilityLabel="Delete chat"
          onPress={async () => {
            if (!(await confirmDeleteChat(peerName))) return;
            try { await api.deleteConversation(conversationId); navigation.goBack(); }
            catch (e) { notify('Could not delete chat', String((e as Error).message)); }
          }}
        >
          <Text style={{ fontSize: 20 }}>🗑️</Text>
        </Pressable>
      ),
    });
  }, [navigation, peerName, conversationId, t, status, typing, peer]);

  useEffect(() => {
    api.messages(conversationId)
      .then((r) => { setPeer(r.peer); setMessages(r.messages); setPeerLastReadAt(r.peerLastReadAt); markRead(); })
      .catch((e) => notify('Could not load chat', String(e.message)))
      .finally(() => setLoading(false));
  }, [conversationId, markRead]);

  const upsert = useCallback((m: Message) => {
    if (m.conversationId !== conversationId) return;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
  }, [conversationId]);

  useEffect(() => connectSocket((event, data) => {
    if (event === 'message' || event === 'message_updated') {
      upsert(data);
      if (event === 'message' && data.conversationId === conversationId && data.senderId !== me.id) { setTyping(false); markRead(); }
    }
    if (data?.conversationId === conversationId && event === 'read' && data.userId !== me.id) setPeerLastReadAt(data.at);
    if (data?.conversationId === conversationId && event === 'typing') {
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 3500);
    }
    if (event === 'presence') setPeer((p) => (p && p.id === data.userId ? { ...p, online: data.online, lastSeenAt: data.lastSeenAt ?? p.lastSeenAt } : p));
  }), [upsert, conversationId, me.id, markRead]);

  // coming back to the tab counts as reading
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onVis = () => { if (!document.hidden) markRead(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [markRead]);

  const retranslate = async (m: Message) => {
    try { upsert(await api.retranslate(m.id)); }
    catch (e) { notify('Could not translate again', String((e as Error).message)); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1, backgroundColor: t.screen }}>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} /> : (
        <FlatList
          ref={list} data={messages} keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>Type in your own language. {peerName} will read it in theirs.</Text>}
          renderItem={({ item }) => (
            <MessageBubble message={item} me={me} displayMode={me.displayMode} onRetranslate={retranslate}
              seen={!!peerLastReadAt && item.senderId === me.id && item.createdAt <= peerLastReadAt} />
          )}
          extraData={peerLastReadAt}
        />
      )}
      {peer ? <Composer conversationId={conversationId} me={me} peer={peer} onSent={upsert} onTyping={sendTyping} /> : null}
    </KeyboardAvoidingView>
  );
}
