import type { Lang } from '../languages';
import type { DisplayMode, OutputFormat, TranslationMode } from '../types';

const SAMPLES: Record<string, { native: string; romanized: string }> = {
  ta: { native: 'நாளைக்கு நீ ஃப்ரீயா இருக்கியா?', romanized: 'Naalaiku nee free-ah irukkiya?' },
  hi: { native: 'क्या तुम कल फ्री हो?', romanized: 'Kal tum free ho kya?' },
};

export function formatOptions(lang: Lang): Array<{ value: OutputFormat; label: string; hint?: string }> {
  const s = SAMPLES[lang.code];
  return [
    { value: 'native', label: `${lang.name} Script`, hint: s?.native },
    { value: 'romanized', label: lang.romanizedName ?? 'Romanized', hint: s?.romanized },
    { value: 'both', label: 'Both', hint: 'Shows script and Latin letters together' },
  ];
}

export const DISPLAY_MODES: Array<{ value: DisplayMode; label: string }> = [
  { value: 'translation_only', label: 'Translation only' },
  { value: 'original_translation', label: 'Original + Translation' },
  { value: 'original_translation_english', label: 'Original + Translation + English' },
];

export const TRANSLATION_MODES: Array<{ value: TranslationMode; label: string; hint: string }> = [
  { value: 'casual', label: 'Casual Chat', hint: 'Keeps slang, emojis, abbreviations and texting style' },
  { value: 'natural', label: 'Natural Translation', hint: 'Fluent and meaning-first' },
  { value: 'literal', label: 'Literal Translation', hint: 'Stays close to the original sentence structure' },
];
