/**
 * Language registry. Adding a language = adding one row.
 * `romanizedName` is the community name for Latin-typed text (Hinglish, Tanglish…).
 * Languages whose native script is already Latin have no romanized variant.
 */
export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  /** Unicode script name of the native script */
  script: string;
  /** e.g. "Hinglish" — undefined for Latin-script languages */
  romanizedName?: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', script: 'Latin' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', script: 'Tamil', romanizedName: 'Tanglish' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'Devanagari', romanizedName: 'Hinglish' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', script: 'Telugu', romanizedName: 'Tenglish' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', script: 'Malayalam', romanizedName: 'Manglish' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'Kannada', romanizedName: 'Kanglish' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', script: 'Bengali', romanizedName: 'Banglish' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', script: 'Devanagari', romanizedName: 'Romanized Marathi' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujarati', romanizedName: 'Romanized Gujarati' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', romanizedName: 'Romanized Punjabi' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', script: 'Arabic', romanizedName: 'Roman Urdu' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', script: 'Oriya', romanizedName: 'Romanized Odia' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', script: 'Bengali', romanizedName: 'Romanized Assamese' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', script: 'Devanagari', romanizedName: 'Romanized Nepali' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', script: 'Sinhala', romanizedName: 'Romanized Sinhala' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', script: 'Latin' },
  { code: 'fr', name: 'French', nativeName: 'Français', script: 'Latin' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', script: 'Latin' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', script: 'Latin' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', script: 'Latin' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', script: 'Latin' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', script: 'Latin' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', script: 'Latin' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', script: 'Cyrillic', romanizedName: 'Translit' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', script: 'Japanese', romanizedName: 'Romaji' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', script: 'Hangul', romanizedName: 'Romanized Korean' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', script: 'Han', romanizedName: 'Pinyin' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', script: 'Arabic', romanizedName: 'Arabizi' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', script: 'Thai', romanizedName: 'Romanized Thai' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): LanguageInfo | undefined {
  return BY_CODE.get(code);
}

export function requireLanguage(code: string): LanguageInfo {
  const l = BY_CODE.get(code);
  if (!l) throw new Error(`Unsupported language: ${code}`);
  return l;
}

export function hasRomanizedVariant(code: string): boolean {
  return !!getLanguage(code)?.romanizedName;
}

/** Display label e.g. "Hindi • Hinglish" */
export function detectionLabel(code: string, romanized: boolean): string {
  const l = getLanguage(code);
  if (!l) return code;
  return romanized && l.romanizedName ? `${l.name} • ${l.romanizedName}` : l.name;
}
