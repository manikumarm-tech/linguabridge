import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, useTheme } from '../theme';

/** Radio-style row used for output format, display mode and translation mode. */
export function Option({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: selected ? t.primary : t.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? t.primary : t.sub, alignItems: 'center', justifyContent: 'center' }}>
        {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: t.sub, fontSize: 13, marginTop: 2 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}
