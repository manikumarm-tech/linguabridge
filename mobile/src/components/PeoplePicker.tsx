import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { langByCode } from '../languages';
import { radius, useTheme } from '../theme';
import type { User } from '../types';
import { Avatar } from './Avatar';

/** Tick-list of people (friends and demo contacts). */
export function PeoplePicker({ people, selected, onToggle }: { people: User[]; selected: string[]; onToggle: (id: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {people.map((u) => {
        const on = selected.includes(u.id);
        return (
          <Pressable key={u.id} onPress={() => onToggle(u.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: t.card }}>
            <Avatar name={u.name} url={u.avatarUrl} online={u.online} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{u.name}</Text>
              <Text style={{ color: t.sub, fontSize: 13 }}>{langByCode(u.language)?.name ?? u.language}{u.isBot ? ' · demo' : ''}</Text>
            </View>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <Text style={{ color: t.onPrimary, fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
