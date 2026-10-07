import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../theme';

/** Native: playback arrives with the Android build; the transcript is shown in the bubble meanwhile. */
export function AudioPlayer(_: { src: string }) {
  const t = useTheme();
  return <Text style={{ color: t.sub, fontSize: 13, marginBottom: 6 }}>🎤 Voice message</Text>;
}
