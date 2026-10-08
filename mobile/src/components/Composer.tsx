import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { notify } from './dialog';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '../api/client';
import { useRecorder } from '../hooks/useRecorder';
import { useVoice } from '../hooks/useVoice';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { Message, Preview, User } from '../types';
import { fx } from '../ui/web';

interface Props {
  conversationId: string;
  me: User;
  /** who the preview translates for (1:1 peer, or a group member) */
  previewFor: string;
  onSent: (m: Message) => void;
  onTyping?: () => void;
  replyTo: Message | null;
  replyToName: string;
  onCancelReply: () => void;
}

export function Composer({ conversationId, me, previewFor, onSent, onTyping, replyTo, replyToName, onCancelReply }: Props) {
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
      const msg = await api.send(conversationId, value, kind, replyTo?.id);
      onSent(msg);
      onCancelReply();
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

  // Dictation (native): speech -> STT -> (server) detect -> translate -> preview. Always previews so a mis-heard word is catchable.
  const voice = useVoice(me.language, (spoken) => { setText(spoken); showPreview(spoken, 'voice'); });

  // Voice messages (web): record, then the server keeps the audio, transcribes and translates it.
  const recorder = useRecorder();
  const [sendingVoice, setSendingVoice] = useState(false);
  const startRecording = async () => {
    try { await recorder.start(); }
    catch { notify('Microphone blocked', 'Allow microphone access for this site to send voice messages.'); }
  };
  const sendRecording = async () => {
    const r = await recorder.stop();
    if (!r) return;
    if (r.durationMs < 700) { notify('Too short', 'Hold on a little longer to record a voice message.'); return; }
    setSendingVoice(true);
    try { onSent(await api.sendVoice(conversationId, r.base64, r.mimeType, r.durationMs, replyTo?.id)); onCancelReply(); }
    catch (e) {
      const m = (e as Error).message;
      notify('Could not send voice message', m === 'no_speech' ? "Couldn't hear any words. Try again a bit closer to the mic." : m);
    } finally { setSendingVoice(false); }
  };
  const secs = Math.floor(recorder.elapsed / 1000);

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

  const IconBtn = ({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) => (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={a11y} {...fx({ press: true })}
      style={{ width: 38, height: 40, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 19, opacity: 0.85 }}>{label}</Text>
    </Pressable>
  );
  const hasText = !!text.trim();
  const micActive = recorder.supported ? recorder.recording : voice.listening;
  const onMic = () => (recorder.supported
    ? (recorder.recording ? sendRecording() : startRecording())
    : (voice.listening ? voice.stop() : voice.start()));

  return (
    <View style={{ backgroundColor: t.screen === 'transparent' ? t.glass : t.card, borderTopColor: t.border, borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
      {replyTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderLeftColor: t.primary, backgroundColor: t.chip, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>Replying to {replyToName}</Text>
            <Text numberOfLines={1} style={{ color: t.sub, fontSize: 13 }}>{replyTo.senderId === me.id ? replyTo.originalText : replyTo.primaryText}</Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={10} accessibilityLabel="Cancel reply"><Text style={{ color: t.sub, fontSize: 18 }}>✕</Text></Pressable>
        </View>
      ) : null}
      {recorder.recording || sendingVoice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Text style={{ color: '#EF4444', fontSize: 16 }}>●</Text>
          <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>
            {sendingVoice ? 'Sending and translating…' : `Recording ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}
          </Text>
          {sendingVoice ? <ActivityIndicator color={t.primary} /> : (
            <>
              <Pressable onPress={recorder.cancel} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: t.chip }}><Text style={{ color: t.text, fontWeight: '600' }}>Cancel</Text></Pressable>
              <Pressable onPress={sendRecording} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: t.primary }}><Text style={{ color: t.onPrimary, fontWeight: '700' }}>Send ➤</Text></Pressable>
            </>
          )}
        </View>
      ) : null}
      {voice.listening ? <Text style={{ color: t.primary, marginBottom: 6, fontSize: 15 }}>Listening... {voice.partial}</Text> : null}
      {voice.error ? <Text style={{ color: t.warn, marginBottom: 6 }}>{voice.error}</Text> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View {...fx({ focusring: true })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: t.chip, borderRadius: 26, paddingHorizontal: 6, minHeight: 50, borderWidth: 1, borderColor: t.border }}>
          <IconBtn label="📷" a11y="Text from a photo" onPress={pickImage} />
          <TextInput
            ref={inputRef} value={text} onChangeText={(v) => { setText(v); if (v.trim()) onTyping?.(); }} multiline numberOfLines={1}
            placeholder={replyTo ? 'Write a reply…' : 'Message in your language…'} placeholderTextColor={t.sub}
            onKeyPress={(e: any) => {
              // web: Enter sends, Shift+Enter adds a line
              if (e?.nativeEvent?.key === 'Enter' && !e?.nativeEvent?.shiftKey && typeof window !== 'undefined' && 'document' in window) { e.preventDefault?.(); onSend(); }
            }}
            style={{ flex: 1, maxHeight: 130, minHeight: 24, color: t.text, paddingHorizontal: 6, paddingVertical: 12, fontSize: 16, lineHeight: 22 }}
          />
          <IconBtn label="📎" a11y="Attach" onPress={pickFile} />
        </View>
        {hasText ? (
          <Pressable onPress={onSend} disabled={busy} accessibilityLabel="Send" {...fx({ grad: 'primary', press: true, glow: true, anim: 'pop' })}
            style={{ width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: t.primary, opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: t.onPrimary, fontSize: 20, fontWeight: '800', marginLeft: 3 }}>➤</Text>}
          </Pressable>
        ) : (
          <Pressable onPress={onMic} accessibilityLabel={micActive ? 'Stop recording' : 'Record a voice message'} {...fx({ grad: micActive ? undefined : 'primary', press: true, glow: !micActive, anim: 'pop' })}
            style={{ width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: micActive ? '#EF4444' : t.primary }}>
            <Text style={{ fontSize: 20 }}>{micActive ? '■' : '🎤'}</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}>
          {preview ? (
            <View style={{ backgroundColor: t.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 6 }}>
              <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700' }}>DETECTED</Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{preview.detected.label}  <Text style={{ color: t.sub }}>{Math.round(preview.detected.confidence * 100)}%</Text></Text>
              <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700', marginTop: 8 }}>TRANSLATE TO ({previewFor})</Text>
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
