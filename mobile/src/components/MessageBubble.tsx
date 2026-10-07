import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { langByCode } from '../languages';
import { radius, useTheme } from '../theme';
import type { DisplayMode, LangText, Message, User } from '../types';

/** Pick the strings to show for the recipient's language, honoring their output-format preference. */
function targetText(m: Message): LangText {
  const tr = m.translation;
  if (!tr) return {};
  const name = langByCode(tr.targetLanguageCode)?.name.toLowerCase() ?? '';
  return (tr.translations[name] as LangText) ?? {};
}
const english = (m: Message) => (typeof m.translation?.translations.english === 'string' ? m.translation.translations.english : undefined);

interface Props {
  message: Message;
  me: User;
  displayMode: DisplayMode;
  onRetranslate: (m: Message) => Promise<void>;
}

export function MessageBubble({ message: m, me, displayMode, onRetranslate }: Props) {
  const t = useTheme();
  const mine = m.senderId === me.id;
  const [showOriginal, setShowOriginal] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const tt = targetText(m);
  const en = english(m);
  const tr = m.translation;
  const lowConf = tr && (tr.status === 'low_confidence' || tr.status === 'degraded');
  const sameLang = !!tr && tr.detectedLanguageCode === tr.targetLanguageCode && tr.status !== 'degraded' && !tr.isRomanized;

  // Layers: translation is primary for others; for my own message the original I typed is primary.
  const wantOriginalLayer = displayMode !== 'translation_only';
  const wantEnglishLayer = displayMode === 'original_translation_english';
  const originalVisible = mine ? true : wantOriginalLayer || showOriginal;
  const translationVisible = true; // my own bubbles always show what the recipient received
  const englishVisible = !!en && (wantEnglishLayer || showEnglish);

  const copyText = mine ? m.originalText : m.primaryText;
  const bubble = { backgroundColor: mine ? t.mine : t.theirs, borderRadius: radius.lg, padding: 12, maxWidth: '86%' as const, alignSelf: mine ? ('flex-end' as const) : ('flex-start' as const), marginVertical: 4, borderWidth: 1, borderColor: t.border };

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
    <View style={bubble}>
      {mine ? (
        <>
          <Primary>{m.originalText}</Primary>
          {translationVisible && !sameLang && (tt.romanized || tt.native) ? (
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

      {englishVisible ? (
        <>
          <Label>ENGLISH</Label>
          <Text style={{ color: t.sub, fontSize: 14 }} selectable>{en}</Text>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {m.detected ? <Text style={{ color: t.sub, fontSize: 11 }}>{m.detected.label}{m.kind === 'voice' ? '  🎤' : ''}</Text> : null}
        {lowConf ? (
          <View style={{ backgroundColor: t.warnBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: t.warn, fontSize: 11, fontWeight: '600' }}>{tr!.status === 'degraded' ? 'Check translation' : `Low confidence ${Math.round(tr!.confidence * 100)}%`}</Text>
          </View>
        ) : null}
      </View>

      {tr && tr.status !== 'skipped' ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!mine && !wantOriginalLayer ? <Action label={showOriginal ? 'Hide original' : 'Original'} onPress={() => setShowOriginal((v) => !v)} /> : null}
          {!!en && !wantEnglishLayer ? <Action label={showEnglish ? 'Hide English' : 'English'} onPress={() => setShowEnglish((v) => !v)} /> : null}
          <Action label={copied ? 'Copied' : 'Copy'} onPress={async () => { await Clipboard.setStringAsync(copyText); setCopied(true); setTimeout(() => setCopied(false), 1200); }} />
          {busy ? <ActivityIndicator size="small" color={t.primary} /> : <Action label="Translate again" onPress={retry} />}
        </View>
      ) : null}
    </View>
  );
}
