import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { notify } from '../components/dialog';
import { api, defaultBaseUrl, getBaseUrl } from '../api/client';
import { DISPLAY_MODES, formatOptions, TRANSLATION_MODES } from '../components/formats';
import { GoogleButton } from '../components/GoogleButton';
import { notificationPermission, notificationsSupported, requestNotifications } from '../components/notify-web';
import { LanguagePicker } from '../components/LanguagePicker';
import { Option } from '../components/Option';
import { langByCode } from '../languages';
import { Avatar } from '../components/Avatar';
import { fx } from '../ui/web';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { User } from '../types';

export function Settings() {
  const t = useTheme();
  const { user, token, previewBeforeSend, setPreviewBeforeSend, updateSettings, signIn, signOut, setApiUrl } = useApp();
  const [url, setUrl] = useState(getBaseUrl());
  const [notif, setNotif] = useState(notificationPermission());
  if (!user) return null;
  const lang = langByCode(user.language)!;

  const save = (patch: Partial<User>) => updateSettings(patch).catch((e) => notify('Could not save', String(e.message)));
  const H = ({ children }: { children: string }) => <Text style={{ color: t.sub, fontSize: 11.5, fontWeight: '800', letterSpacing: 1, marginTop: 28, marginBottom: 10 }}>{children}</Text>;
  const Row = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: t.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: t.text, fontSize: 16, flex: 1, paddingRight: 12 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary }} />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.screen }} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <View {...fx({ grad: 'soft' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.xl, backgroundColor: t.card, borderWidth: 1, borderColor: t.border }}>
        <Avatar name={user.name} url={user.avatarUrl} size={60} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{user.name}</Text>
          <Text style={{ color: t.sub, fontSize: 13.5, marginTop: 2 }}>{user.email ?? `@${user.handle}`}</Text>
          <Text style={{ color: t.primary, fontSize: 13, fontWeight: '700', marginTop: 6 }}>🌐 Reads in {lang.name}{lang.romanizedName && user.outputFormat !== 'native' ? ` · ${lang.romanizedName}` : ''}</Text>
        </View>
      </View>

      <H>MY LANGUAGE</H>
      <LanguagePicker value={user.language} onChange={(c) => save({ language: c, outputFormat: langByCode(c)?.romanizedName ? user.outputFormat : 'native' })} />

      {lang.romanizedName ? (
        <>
          <H>{`${lang.name.toUpperCase()} OUTPUT FORMAT`}</H>
          {formatOptions(lang).map((o) => <Option key={o.value} label={o.label} hint={o.hint} selected={user.outputFormat === o.value} onPress={() => save({ outputFormat: o.value })} />)}
        </>
      ) : null}

      <H>TRANSLATION DISPLAY</H>
      {DISPLAY_MODES.map((o) => (
        <Option key={o.value} label={o.label} selected={user.displayMode === o.value}
          onPress={() => save({ displayMode: o.value, ...(o.value === 'original_translation_english' ? { showEnglish: true } : {}) })} />
      ))}
      <Row label="Show English translation" value={user.showEnglish} onChange={(v) => save({ showEnglish: v, ...(!v && user.displayMode === 'original_translation_english' ? { displayMode: 'original_translation' as const } : {}) })} />

      <H>TRANSLATION MODE (FOR MESSAGES I SEND)</H>
      {TRANSLATION_MODES.map((o) => <Option key={o.value} label={o.label} hint={o.hint} selected={user.translationMode === o.value} onPress={() => save({ translationMode: o.value })} />)}

      <H>COMPOSER</H>
      <Row label="Preview translation before sending" value={previewBeforeSend} onChange={setPreviewBeforeSend} />

      <H>SERVER</H>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholderTextColor={t.sub}
        onEndEditing={() => setApiUrl(url.trim() === defaultBaseUrl ? null : url.trim())}
        style={{ backgroundColor: t.card, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14, fontSize: 15 }} />
      <Text style={{ color: t.sub, fontSize: 12, marginTop: 6 }}>Restart the app after changing the server address.</Text>

      {notificationsSupported() ? (
        <>
          <H>NOTIFICATIONS</H>
          <Row
            label={notif === 'denied' ? 'Blocked in browser settings' : 'Notify me about new messages'}
            value={notif === 'granted'}
            onChange={async (on) => { if (on && notif !== 'granted') setNotif(await requestNotifications()); }}
          />
        </>
      ) : null}

      <H>ACCOUNT</H>
      {user.email ? (
        <View style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ color: t.text, fontSize: 16 }}>Signed in with Google</Text>
          <Text style={{ color: t.sub, fontSize: 14, marginTop: 2 }}>{user.email}</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: t.border, gap: 12 }}>
          <Text style={{ color: t.sub, fontSize: 14 }}>Link Google to keep this account and its chats safe, and sign in on any device. After linking, the username alone can no longer open it.</Text>
          <GoogleButton text="continue_with" onToken={async (idToken) => {
            try { await signIn(token!, await api.linkGoogle(idToken)); notify('Google linked', 'Next time, sign in with Google.'); }
            catch (e) { const m = (e as Error).message; notify('Could not link Google', m === 'google_already_used' ? 'That Google account is already used by another EasyTalk account.' : m); }
          }} />
        </View>
      )}

      <Pressable onPress={() => signOut()} style={{ marginTop: 32, padding: 16, alignItems: 'center', borderRadius: radius.md, backgroundColor: t.chip }}>
        <Text style={{ color: t.warn, fontWeight: '700' }}>Sign out ({user.handle})</Text>
      </Pressable>
    </ScrollView>
  );
}
