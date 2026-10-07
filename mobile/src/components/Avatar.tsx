import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '../theme';

/** Profile photo (Google) or first letter, with a green dot when online. */
export function Avatar({ name, url, online, size = 48 }: { name: string; url?: string | null; online?: boolean; size?: number }) {
  const t = useTheme();
  const [broken, setBroken] = useState(false);
  const dot = Math.max(10, Math.round(size / 4));
  return (
    <View style={{ width: size, height: size }}>
      {url && !broken ? (
        <Image source={{ uri: url }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.chip }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.primary, fontSize: size * 0.42, fontWeight: '700' }}>{(Array.from(name)[0] ?? '?').toUpperCase()}</Text>
        </View>
      )}
      {online ? (
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: '#22C55E', borderWidth: 2, borderColor: t.card }} />
      ) : null}
    </View>
  );
}
