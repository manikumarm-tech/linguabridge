import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, connectSocket, sendSocket } from '../api/client';
import { Avatar } from '../components/Avatar';
import { Composer } from '../components/Composer';
import { confirm, confirmDeleteChat, notify } from '../components/dialog';
import { MessageBubble } from '../components/MessageBubble';
import { lastSeen } from './Home';
import { useApp } from '../store/app';
import { useTheme } from '../theme';
import { fx } from '../ui/web';
import type { Message, User } from '../types';
import type { RootStack } from '../../App';

const firstName = (n: string) => n.split(' ')[0];

/** "Today" / "Yesterday" / "Mon, 6 Oct" */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

export function Chat({ route, navigation }: NativeStackScreenProps<RootStack, 'Chat'>) {
  const { conversationId, peerName } = route.params;
  const t = useTheme();
  const me = useApp((s) => s.user)!;
  const [title, setTitle] = useState(peerName);
  const [isGroup, setIsGroup] = useState(false);
  const [peer, setPeer] = useState<User | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useRef<FlatList<Message>>(null);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastTypingSent = useRef(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const names = useMemo(() => Object.fromEntries(members.map((u) => [u.id, u.name])), [members]);
  const others = members.filter((u) => u.id !== me.id);
  // ✓✓ once everyone else has read up to a message
  const seenUpTo = others.length && others.every((u) => reads[u.id]) ? others.map((u) => reads[u.id]).sort()[0] : null;

  const visible = () => Platform.OS !== 'web' || !document.hidden;
  const markRead = useCallback(() => { if (visible()) api.markRead(conversationId).catch(() => {}); }, [conversationId]);
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    sendSocket('typing', { conversationId });
  }, [conversationId]);

  const typingNames = typingIds.map((id) => firstName(names[id] ?? '')).filter(Boolean);
  const status = typingIds.length
    ? isGroup ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : 'typing…'
    : isGroup
      ? ['You', ...others.map((u) => firstName(u.name))].join(', ')
      : lastSeen(peer?.online, peer?.lastSeenAt) || 'Translating automatically';

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable disabled={!isGroup} onPress={() => navigation.navigate('GroupInfo', { conversationId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={isGroup ? '👥' : title} url={isGroup ? null : peer?.avatarUrl} size={36} />
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
            <Text numberOfLines={1} style={{ color: typingIds.length || peer?.online ? t.success : t.sub, fontSize: 12, fontWeight: '600' }}>{status}</Text>
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {isGroup ? (
            <Pressable hitSlop={10} accessibilityLabel="Group info" onPress={() => navigation.navigate('GroupInfo', { conversationId })}>
              <Text style={{ fontSize: 20 }}>ⓘ</Text>
            </Pressable>
          ) : null}
          <Pressable
            hitSlop={10}
            accessibilityLabel="Delete chat"
            onPress={async () => {
              if (!(await confirmDeleteChat(title))) return;
              try { await api.deleteConversation(conversationId); navigation.goBack(); }
              catch (e) { notify('Could not delete chat', String((e as Error).message)); }
            }}
          >
            <Text style={{ fontSize: 20 }}>🗑️</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation, title, conversationId, t, status, typingIds.length, peer, isGroup]);

  const load = useCallback(() =>
    api.messages(conversationId)
      .then((r) => {
        setTitle(r.title ?? peerName);
        setIsGroup(r.isGroup);
        setPeer(r.peer);
        setMembers(r.members);
        setMessages(r.messages);
        setReads(r.reads);
        markRead();
      })
      .catch((e) => notify('Could not load chat', String(e.message)))
      .finally(() => setLoading(false)), [conversationId, markRead, peerName]);
  useEffect(() => { load(); }, [load]);

  const upsert = useCallback((m: Message) => {
    if (m.conversationId !== conversationId) return;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
  }, [conversationId]);

  const stopTyping = (id: string) => { clearTimeout(typingTimers.current.get(id)); setTypingIds((xs) => xs.filter((x) => x !== id)); };

  useEffect(() => connectSocket((event, data) => {
    if (event === 'message' || event === 'message_updated') {
      upsert(data);
      if (event === 'message' && data.conversationId === conversationId && data.senderId !== me.id) { stopTyping(data.senderId); markRead(); }
    }
    if (data?.conversationId === conversationId && event === 'read' && data.userId !== me.id) setReads((r) => ({ ...r, [data.userId]: data.at }));
    if (data?.conversationId === conversationId && event === 'typing') {
      const id = data.userId as string;
      setTypingIds((xs) => (xs.includes(id) ? xs : [...xs, id]));
      clearTimeout(typingTimers.current.get(id));
      typingTimers.current.set(id, setTimeout(() => stopTyping(id), 3500));
    }
    if (event === 'group_updated' && data.id === conversationId) load();
    if (event === 'presence') {
      const upd = (u: User) => (u.id === data.userId ? { ...u, online: data.online, lastSeenAt: data.lastSeenAt ?? u.lastSeenAt } : u);
      setPeer((p) => (p ? upd(p) : p));
      setMembers((ms) => ms.map(upd));
    }
  }), [upsert, conversationId, me.id, markRead, load]);

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
  const react = async (m: Message, emoji: string) => {
    try { upsert(await api.react(m.id, emoji)); }
    catch (e) { notify('Could not react', String((e as Error).message)); }
  };
  const remove = async (m: Message) => {
    if (!(await confirm('Delete for everyone?', 'This message will be removed for everyone in this chat.', 'Delete'))) return;
    try { upsert(await api.deleteMessage(m.id)); if (replyTo?.id === m.id) setReplyTo(null); }
    catch (e) { notify('Could not delete', String((e as Error).message)); }
  };

  const previewFor = isGroup ? (others[0] ? firstName(others[0].name) : 'the group') : title;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1, backgroundColor: t.screen }}>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} /> : (
        <FlatList
          ref={list} data={messages} keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={{ color: t.sub, textAlign: 'center', marginTop: 40 }}>
              {isGroup ? 'Type in your own language. Everyone reads it in theirs.' : `Type in your own language. ${title} will read it in theirs.`}
            </Text>
          }
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
            const newDay = !prev || !sameDay(prev.createdAt, item.createdAt);
            const continued = !newDay && prev.senderId === item.senderId && !prev.deleted
              && new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
            return (
            <>
            {newDay ? (
              <View style={{ alignItems: 'center', marginVertical: 14 }}>
                <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700', backgroundColor: t.chip, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' }}>{dayLabel(item.createdAt)}</Text>
              </View>
            ) : null}
            <MessageBubble
              message={item} me={me} displayMode={me.displayMode} isGroup={isGroup} names={names} continued={continued}
              senderName={names[item.senderId]}
              seen={!!seenUpTo && item.senderId === me.id && item.createdAt <= seenUpTo}
              onRetranslate={retranslate} onReact={react} onDelete={remove}
              onReply={(m) => setReplyTo(m)}
            />
            </>
            );
          }}
          extraData={[seenUpTo, names]}
          ListFooterComponent={typingIds.length ? (
            <View {...fx({ anim: 'in' })} style={{ alignSelf: 'flex-start', marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.theirs, borderWidth: 1, borderColor: t.border, borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
              {isGroup ? <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>{typingNames.join(', ')}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3].map((n) => <View key={n} {...fx({ dot: n })} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.sub }} />)}
              </View>
            </View>
          ) : null}
        />
      )}
      {!loading ? (
        <Composer
          conversationId={conversationId} me={me} previewFor={previewFor} onSent={upsert} onTyping={sendTyping}
          replyTo={replyTo} replyToName={replyTo ? (replyTo.senderId === me.id ? 'yourself' : names[replyTo.senderId] ?? '') : ''}
          onCancelReply={() => setReplyTo(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
