import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket } from '../api/client';
import { Composer } from '../components/Composer';
import { confirmDeleteChat } from '../components/confirm';
import { MessageBubble } from '../components/MessageBubble';
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

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{peerName}</Text>
          <Text style={{ color: t.primary, fontSize: 12 }}>Translating automatically</Text>
        </View>
      ),
      headerRight: () => (
        <Pressable
          hitSlop={10}
          accessibilityLabel="Delete chat"
          onPress={async () => {
            if (!(await confirmDeleteChat(peerName))) return;
            try { await api.deleteConversation(conversationId); navigation.goBack(); }
            catch (e) { Alert.alert('Could not delete chat', String((e as Error).message)); }
          }}
        >
          <Text style={{ fontSize: 20 }}>🗑️</Text>
        </Pressable>
      ),
    });
  }, [navigation, peerName, conversationId, t]);

  useEffect(() => {
    api.messages(conversationId)
      .then((r) => { setPeer(r.peer); setMessages(r.messages); })
      .catch((e) => Alert.alert('Could not load chat', String(e.message)))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const upsert = useCallback((m: Message) => {
    if (m.conversationId !== conversationId) return;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
  }, [conversationId]);

  useEffect(() => connectSocket((event, data) => { if (event === 'message' || event === 'message_updated') upsert(data); }), [upsert]);

  const retranslate = async (m: Message) => {
    try { upsert(await api.retranslate(m.id)); }
    catch (e) { Alert.alert('Could not translate again', String((e as Error).message)); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1, backgroundColor: t.bg }}>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} /> : (
        <FlatList
          ref={list} data={messages} keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>Type in your own language. {peerName} will read it in theirs.</Text>}
          renderItem={({ item }) => <MessageBubble message={item} me={me} displayMode={me.displayMode} onRetranslate={retranslate} />}
        />
      )}
      {peer ? <Composer conversationId={conversationId} me={me} peer={peer} onSent={upsert} /> : null}
    </KeyboardAvoidingView>
  );
}
