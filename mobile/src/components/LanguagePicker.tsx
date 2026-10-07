import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { LANGUAGES, langByCode } from '../languages';
import { radius, useTheme } from '../theme';

export function LanguagePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const s = query.trim().toLowerCase();
    return s ? LANGUAGES.filter((l) => l.name.toLowerCase().includes(s) || l.nativeName.toLowerCase().includes(s)) : LANGUAGES;
  }, [query]);
  const cur = langByCode(value);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, padding: 14 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{cur?.name ?? value}  <Text style={{ color: t.sub }}>{cur?.nativeName}</Text></Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: 56, paddingHorizontal: 16 }}>
          <TextInput
            placeholder="Search languages" placeholderTextColor={t.sub} value={query} onChangeText={setQuery} autoFocus
            style={{ backgroundColor: t.card, color: t.text, borderRadius: radius.md, padding: 14, fontSize: 16, marginBottom: 8 }}
          />
          <FlatList
            data={list} keyExtractor={(l) => l.code} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => { onChange(item.code); setOpen(false); setQuery(''); }} style={{ paddingVertical: 14, borderBottomColor: t.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: item.code === value ? '700' : '400' }}>{item.name}</Text>
                <Text style={{ color: t.sub, fontSize: 16 }}>{item.nativeName}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={() => setOpen(false)} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: t.primary, fontSize: 16, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
