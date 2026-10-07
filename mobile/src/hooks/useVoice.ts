import { useCallback, useRef, useState } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { SPEECH_LOCALE } from '../languages';

/**
 * Voice flow, step 1-2 of: Speech -> STT -> language detection -> translation -> display.
 * Detection/translation happen on the server once the final transcript is handed to `onFinal`.
 */
export function useVoice(language: string, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const last = useRef('');

  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    last.current = t;
    setPartial(t);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const text = last.current.trim();
    last.current = '';
    setPartial('');
    if (text) onFinal(text);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    setError(e.error === 'no-speech' ? 'Did not catch that. Try again.' : e.message || 'Speech recognition failed');
  });

  const start = useCallback(async () => {
    setError(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) { setError('Microphone permission is required.'); return; }
    last.current = '';
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: SPEECH_LOCALE[language] ?? 'en-US', interimResults: true, continuous: false });
  }, [language]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  return { listening, partial, error, start, stop };
}
