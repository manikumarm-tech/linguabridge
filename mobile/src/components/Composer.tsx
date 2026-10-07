import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { notify } from './dialog';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';
import { useVoice } from '../hooks/useVoice';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { Message, Preview, User } from '../types';

interface Props {
  conversationId: string;
  me: User;
  peer: User;
  onSent: (m: Message) => void;
  onTyping?: () => void;
}

export function Composer({ conversationId, me, peer, onSent, onTyping }: Props) {
  const t = useTheme();
  const previewBeforeSend = useApp((s) => s.previewBeforeSend);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKind, setPreviewKind] = useState<'text' | 'voice'>('text');
  const inputRef = useRef<TextInput>(null);

  const send = async (value: string, kind: 'text' | 'voice' = 'text') => {
    setBusy(true);
    try {
      const msg = await api.send(conversationId, value, kind);
      onSent(msg);
      setText('');
      setPreview(null);
    } catch (e) {
      notify('Could not send', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const showPreview = async (value: string, kind: 'text' | 'voice') => {
    setBusy(true);
    try {
      setPreviewKind(kind);
      setPreview(await api.preview(conversationId, value));
    } catch (e) {
      notify('Could not translate', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const onSend = () => {
    const v = text.trim();
    if (!v || busy) return;
    previewBeforeSend ? showPreview(v, 'text') : send(v);
  };

  // Voice: speech -> STT -> (server) detect -> translate -> preview. Voice always previews so a mis-heard word is catchable.
  const voice = useVoice(me.language, (spoken) => { setText(spoken); showPreview(spoken, 'voice'); });

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ['images'] });
    if (res.canceled || !res.assets[0]?.base64) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const { text: found } = await api.extractText(a.base64!, a.mimeType ?? 'image/jpeg');
      if (!found) notify('No text found', 'Could not find readable text in that photo.');
      else { setText(found); inputRef.current?.focus(); }
    } catch (e) {
      notify('Could not read the photo', String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
    notify('Attachments', 'File sharing is not available yet. Text, voice and photo-to-text are supported.');
  };

  const IconBtn = ({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) => (
    <Pressable onPress={onPress} hitSlop={6} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? t.primary : t.chip }}>
      <Text style={{ fontSize: 18 }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: t.card, borderTopColor: t.border, borderTopWidth: 1, padding: 10 }}>
      {voice.listening ? <Text style={{ color: t.primary, marginBottom: 6, fontSize: 15 }}>Listening... {voice.partial}</Text> : null}
      {voice.error ? <Text style={{ color: t.warn, marginBottom: 6 }}>{voice.error}</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <IconBtn label="🎤" active={voice.listening} onPress={() => (voice.listening ? voice.stop() : voice.start())} />
        <IconBtn label="📷" onPress={pickImage} />
        <IconBtn label="📎" onPress={pickFile} />
        <TextInput
          ref={inputRef} value={text} onChangeText={(v) => { setText(v); if (v.trim()) onTyping?.(); }} multiline placeholder="Type a message..." placeholderTextColor={t.sub}
          style={{ flex: 1, maxHeight: 120, minHeight: 40, backgroundColor: t.bg, color: t.text, borderRadius: radius.lg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16 }}
        />
        <Pressable onPress={onSend} disabled={busy || !text.trim()} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', backgroundColor: t.primary, opacity: busy || !text.trim() ? 0.5 : 1 }}>
          {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Send</Text>}
        </Pressable>
      </View>

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          {preview ? (
            <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 6 }}>
              <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700' }}>DETECTED</Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{preview.detected.label}  <Text style={{ color: t.sub }}>{Math.round(preview.detected.confidence * 100)}%</Text></Text>
              <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700', marginTop: 8 }}>TRANSLATE TO ({peer.name})</Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{preview.translateTo.label}</Text>
              <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700', marginTop: 8 }}>PREVIEW</Text>
              <Text style={{ color: t.text, fontSize: 16 }}>{text}</Text>
              <Text style={{ color: t.sub, fontSize: 18 }}>↓</Text>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>{preview.primaryText}</Text>
              {typeof preview.translation.translations.english === 'string' ? <Text style={{ color: t.sub, fontSize: 14 }}>{preview.translation.translations.english}</Text> : null}
              {preview.translation.status === 'low_confidence' ? <Text style={{ color: t.warn, fontSize: 13 }}>Low confidence. You may want to edit before sending.</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => { setPreview(null); if (previewKind === 'voice') setText(''); }} style={{ flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.chip }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => { setPreview(null); setTimeout(() => inputRef.current?.focus(), 200); }} style={{ flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.chip }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => send(text.trim(), previewKind)} disabled={busy} style={{ flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center', backgroundColor: t.primary }}>
                  {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontWeight: '700' }}>Send</Text>}
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
