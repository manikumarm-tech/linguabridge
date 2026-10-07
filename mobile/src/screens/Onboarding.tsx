import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { notify } from '../components/dialog';
import { api } from '../api/client';
import { formatOptions } from '../components/formats';
import { LanguagePicker } from '../components/LanguagePicker';
import { Option } from '../components/Option';
import { langByCode } from '../languages';
import { useApp } from '../store/app';
import { radius, useTheme } from '../theme';
import type { OutputFormat } from '../types';

type Step = 'welcome' | 'language' | 'format' | 'english' | 'profile' | 'login';

export function Onboarding() {
  const t = useTheme();
  const signIn = useApp((s) => s.signIn);
  const [step, setStep] = useState<Step>('welcome');
  const [language, setLanguage] = useState('en');
  const [format, setFormat] = useState<OutputFormat>('both');
  const [showEnglish, setShowEnglish] = useState(true);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  const lang = langByCode(language)!;
  const hasRoman = !!lang.romanizedName;
  const order: Step[] = ['welcome', 'language', ...(hasRoman ? (['format'] as Step[]) : []), 'english', 'profile'];
  const idx = order.indexOf(step);
  const next = () => setStep(order[Math.min(idx + 1, order.length - 1)]);
  const back = () => setStep(step === 'login' ? 'welcome' : order[Math.max(idx - 1, 0)]);

  const finish = async () => {
    setBusy(true);
    try {
      const r = await api.register({ name: name.trim(), handle: handle.trim().toLowerCase(), language, outputFormat: hasRoman ? format : 'native', showEnglish });
      await signIn(r.token, r.user);
    } catch (e) {
      const m = (e as Error).message;
      notify('Could not create profile', m === 'handle_taken' ? 'That username is taken. Try another.' : m);
    } finally { setBusy(false); }
  };

  const login = async () => {
    setBusy(true);
    try { const r = await api.login(handle.trim()); await signIn(r.token, r.user); }
    catch (e) { notify('Could not sign in', (e as Error).message === 'user_not_found' ? 'No account with that username.' : (e as Error).message); }
    finally { setBusy(false); }
  };

  const Title = ({ children, sub }: { children: string; sub?: string }) => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{children}</Text>
      {sub ? <Text style={{ color: t.sub, fontSize: 16, marginTop: 6 }}>{sub}</Text> : null}
    </View>
  );
  const Btn = ({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled || busy} style={{ backgroundColor: secondary ? t.chip : t.primary, padding: 16, borderRadius: radius.md, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
      {busy && !secondary ? <ActivityIndicator color={t.onPrimary} /> : <Text style={{ color: secondary ? t.text : t.onPrimary, fontSize: 16, fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
  const input = { backgroundColor: t.card, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: 14, fontSize: 16, marginBottom: 12 } as const;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 72, justifyContent: step === 'welcome' ? 'center' : 'flex-start' }} keyboardShouldPersistTaps="handled">
        {step === 'welcome' && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 56 }}>🌉</Text>
            <Text style={{ color: t.text, fontSize: 34, fontWeight: '800' }}>Welcome to EasyTalk</Text>
            <Text style={{ color: t.sub, fontSize: 18, marginBottom: 24 }}>Talk to anyone in their language.</Text>
            <Btn label="Get started" onPress={next} />
            <Btn label="I already have an account" secondary onPress={() => setStep('login')} />
          </View>
        )}

        {step === 'login' && (
          <View>
            <Title sub="Enter your username">Welcome back</Title>
            <TextInput style={input} value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="username" placeholderTextColor={t.sub} />
            <Btn label="Sign in" onPress={login} disabled={handle.trim().length < 3} />
          </View>
        )}

        {step === 'language' && (
          <View>
            <Title sub="Messages from others will be translated into this language.">Choose your language</Title>
            <LanguagePicker value={language} onChange={(c) => { setLanguage(c); setFormat('both'); }} />
          </View>
        )}

        {step === 'format' && (
          <View>
            <Title sub={`How should ${lang.name} messages be written?`}>Preferred output format</Title>
            {formatOptions(lang).map((o) => (
              <Option key={o.value} label={o.label} hint={o.hint} selected={format === o.value} onPress={() => setFormat(o.value)} />
            ))}
          </View>
        )}

        {step === 'english' && (
          <View>
            <Title sub="An English version can appear under each message to double-check meaning.">Optional English translation</Title>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.card, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: t.border }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>Show English translation</Text>
              <Switch value={showEnglish} onValueChange={setShowEnglish} trackColor={{ true: t.primary }} />
            </View>
          </View>
        )}

        {step === 'profile' && (
          <View>
            <Title sub="Friends find you by username.">Your profile</Title>
            <TextInput style={input} value={name} onChangeText={(v) => { setName(v); if (!handle) setHandle(v.toLowerCase().replace(/[^a-z0-9]/g, '')); }} placeholder="Your name" placeholderTextColor={t.sub} />
            <TextInput style={input} value={handle} onChangeText={setHandle} autoCapitalize="none" placeholder="username (3+ letters or digits)" placeholderTextColor={t.sub} />
          </View>
        )}

        {step !== 'welcome' && step !== 'login' && (
          <View style={{ marginTop: 'auto', paddingTop: 24, gap: 10 }}>
            {step === 'profile'
              ? <Btn label="Start chatting" onPress={finish} disabled={!name.trim() || !/^[a-z0-9_.-]{3,30}$/i.test(handle.trim())} />
              : <Btn label="Continue" onPress={next} />}
            <Btn label="Back" secondary onPress={back} />
          </View>
        )}
        {step === 'login' && <View style={{ marginTop: 12 }}><Btn label="Back" secondary onPress={back} /></View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
