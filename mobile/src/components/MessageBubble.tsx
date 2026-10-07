import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { audioSrc } from '../api/client';
import { langByCode } from '../languages';
import { radius, useTheme } from '../theme';
import type { DisplayMode, LangText, Message, User } from '../types';
import { AudioPlayer } from './AudioPlayer';

/** Pick the strings to show for the recipient's language, honoring their output-format preference. */
function targetText(m: Message): LangText {
  const tr = m.translation;
  if (!tr) return {};
  const name = langByCode(tr.targetLanguageCode)?.name.toLowerCase() ?? '';
  return (tr.translations[name] as LangText) ?? {};
}
const english = (m: Message) => (typeof m.translation?.translations.english === 'string' ? m.translation.translations.english : undefined);

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface Props {
  message: Message;
  me: User;
  displayMode: DisplayMode;
  onRetranslate: (m: Message) => Promise<void>;
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onDelete: (m: Message) => void;
  /** my message has been seen by everyone else (✓✓) */
  seen?: boolean;
  isGroup?: boolean;
  /** group chats: who wrote it (shown above other people's messages) */
  senderName?: string;
  /** userId -> name, to explain reactions */
  names: Record<string, string>;
}

export function MessageBubble({ message: m, me, displayMode, onRetranslate, onReply, onReact, onDelete, seen, isGroup, senderName, names }: Props) {
  const t = useTheme();
  const mine = m.senderId === me.id;
  const [showOriginal, setShowOriginal] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  // tap a message to show its actions (keeps the chat uncluttered)
  const [open, setOpen] = useState(false);

  const bubble = { backgroundColor: mine ? t.mine : t.theirs, borderRadius: radius.lg, padding: 12, maxWidth: '86%' as const, alignSelf: mine ? ('flex-end' as const) : ('flex-start' as const), marginVertical: 4, borderWidth: 1, borderColor: t.border };
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (m.deleted) {
    return (
      <View style={{ ...bubble, paddingVertical: 8 }}>
        {isGroup && !mine && senderName ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', marginBottom: 2 }}>{senderName}</Text> : null}
        <Text style={{ color: t.sub, fontSize: 14, fontStyle: 'italic' }}>🚫 {mine ? 'You deleted this message' : 'This message was deleted'}  <Text style={{ fontSize: 11 }}>{time}</Text></Text>
      </View>
    );
  }

  const tt = targetText(m);
  const en = english(m);
  const tr = m.translation;
  const lowConf = tr && (tr.status === 'low_confidence' || tr.status === 'degraded' || tr.status === 'failed');
  const sameLang = !!tr && tr.detectedLanguageCode === tr.targetLanguageCode && tr.status !== 'degraded' && !tr.isRomanized;

  // Layers: translation is primary for others; for my own message the original I typed is primary.
  const wantOriginalLayer = displayMode !== 'translation_only';
  const wantEnglishLayer = displayMode === 'original_translation_english';
  const originalVisible = mine ? true : wantOriginalLayer || showOriginal;
  const englishVisible = !!en && (wantEnglishLayer || showEnglish);

  const copyText = mine ? m.originalText : m.primaryText;

  // reactions grouped by emoji, mine highlighted
  const groups = new Map<string, string[]>();
  for (const r of m.reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.userId]);
  const myReaction = m.reactions.find((r) => r.userId === me.id)?.emoji;

  const retry = async () => {
    setBusy(true);
    try { await onRetranslate(m); } finally { setBusy(false); }
  };

  const Primary = ({ children }: { children: string }) => <Text style={{ color: t.text, fontSize: 17, lineHeight: 23 }} selectable>{children}</Text>;
  const Label = ({ children }: { children: string }) => <Text style={{ color: t.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginTop: 8, marginBottom: 2 }}>{children}</Text>;
  const Action = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} hitSlop={6} style={{ backgroundColor: t.chip, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ color: t.primary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', marginVertical: 4 }}>
      <Pressable onPress={() => { setOpen((v) => !v); setPicking(false); }} onLongPress={() => { setOpen(true); setPicking(true); }}
        accessibilityHint="Tap for reply, react and more" style={{ ...bubble, maxWidth: '100%', marginVertical: 0, ...(open ? { borderColor: t.primary } : null) }}>
        {isGroup && !mine && senderName ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{senderName}</Text> : null}

        {m.replyTo ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: t.primary, backgroundColor: t.chip, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 8 }}>
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>{m.replyTo.senderId === me.id ? 'You' : m.replyTo.senderName}</Text>
            <Text numberOfLines={2} style={{ color: t.sub, fontSize: 13 }}>{m.replyTo.kind === 'voice' ? '🎤 ' : ''}{m.replyTo.text}</Text>
          </View>
        ) : null}

        {m.audioUrl ? <AudioPlayer src={audioSrc(m.audioUrl)} /> : null}

        {mine ? (
          <>
            <Primary>{m.originalText}</Primary>
            {!isGroup && !sameLang && (tt.romanized || tt.native) ? (
              <>
                <Label>{`SENT AS ${(tr && langByCode(tr.targetLanguageCode)?.name.toUpperCase()) ?? ''}`}</Label>
                {tt.romanized ? <Text style={{ color: t.text, fontSize: 15 }} selectable>{tt.romanized}</Text> : null}
                {tt.native ? <Text style={{ color: tt.romanized ? t.sub : t.text, fontSize: 15 }} selectable>{tt.native}</Text> : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            {tt.romanized || tt.native ? (
              <>
                {tt.romanized ? <Primary>{tt.romanized}</Primary> : null}
                {tt.native ? (tt.romanized ? <Text style={{ color: t.sub, fontSize: 15, marginTop: 4 }} selectable>{tt.native}</Text> : <Primary>{tt.native}</Primary>) : null}
              </>
            ) : (
              <Primary>{m.originalText}</Primary>
            )}
            {originalVisible && (tt.romanized || tt.native) && !sameLang ? (
              <>
                <Label>ORIGINAL</Label>
                <Text style={{ color: t.sub, fontSize: 14, fontStyle: 'italic' }} selectable>{m.originalText}</Text>
              </>
            ) : null}
          </>
        )}

        {englishVisible && !(mine && isGroup) ? (
          <>
            <Label>ENGLISH</Label>
            <Text style={{ color: t.sub, fontSize: 14 }} selectable>{en}</Text>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {m.detected ? <Text style={{ color: t.sub, fontSize: 11 }}>{m.detected.label}{m.kind === 'voice' ? '  🎤' : ''}</Text> : null}
          {lowConf && !(mine && isGroup) ? (
            <View style={{ backgroundColor: t.warnBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: t.warn, fontSize: 11, fontWeight: '600' }}>{tr!.status === 'failed' ? 'Translation failed' : tr!.status === 'degraded' ? 'Check translation' : `Low confidence ${Math.round(tr!.confidence * 100)}%`}</Text>
            </View>
          ) : null}
          <Text style={{ color: t.sub, fontSize: 11, marginLeft: 'auto' }}>
            {time}
            {mine ? <Text style={{ color: seen ? '#38BDF8' : t.sub, fontWeight: '700' }}>{seen ? '  ✓✓' : '  ✓'}</Text> : null}
          </Text>
        </View>

        {open ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Action label="↩ Reply" onPress={() => { setOpen(false); onReply(m); }} />
          <Action label={myReaction ? `${myReaction} React` : '🙂 React'} onPress={() => setPicking((v) => !v)} />
          {tr && tr.status !== 'skipped' && !(mine && isGroup) ? (
            <>
              {!mine && !wantOriginalLayer ? <Action label={showOriginal ? 'Hide original' : 'Original'} onPress={() => setShowOriginal((v) => !v)} /> : null}
              {!!en && !wantEnglishLayer ? <Action label={showEnglish ? 'Hide English' : 'English'} onPress={() => setShowEnglish((v) => !v)} /> : null}
              {busy ? <ActivityIndicator size="small" color={t.primary} /> : <Action label="Translate again" onPress={retry} />}
            </>
          ) : null}
          <Action label={copied ? 'Copied' : 'Copy'} onPress={async () => { await Clipboard.setStringAsync(copyText); setCopied(true); setTimeout(() => setCopied(false), 1200); }} />
          {mine ? <Action label="🗑 Delete" onPress={() => { setOpen(false); onDelete(m); }} /> : null}
        </View>
        ) : null}

        {open && picking ? (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 8, backgroundColor: t.chip, borderRadius: 999, padding: 4, alignSelf: 'flex-start' }}>
            {QUICK_REACTIONS.map((e) => (
              <Pressable key={e} onPress={() => { setPicking(false); setOpen(false); onReact(m, e); }} hitSlop={4}
                style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: myReaction === e ? t.primary : 'transparent' }}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>

      {groups.size ? (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: -6, paddingHorizontal: 8, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
          {[...groups].map(([emoji, users]) => (
            <Pressable key={emoji} onPress={() => onReact(m, emoji)}
              accessibilityLabel={`${emoji} by ${users.map((u) => (u === me.id ? 'you' : names[u] ?? 'someone')).join(', ')}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: t.card, borderWidth: 1, borderColor: users.includes(me.id) ? t.primary : t.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 14 }}>{emoji}</Text>
              {users.length > 1 ? <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700' }}>{users.length}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
