// Mirrors backend/src/languages.ts (GET /api/languages is the source of truth; this is the offline copy for onboarding).
export interface Lang { code: string; name: string; nativeName: string; romanizedName?: string }

export const LANGUAGES: Lang[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', romanizedName: 'Tanglish' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', romanizedName: 'Hinglish' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', romanizedName: 'Tenglish' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', romanizedName: 'Manglish' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', romanizedName: 'Kanglish' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', romanizedName: 'Banglish' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', romanizedName: 'Romanized Marathi' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', romanizedName: 'Romanized Gujarati' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', romanizedName: 'Romanized Punjabi' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', romanizedName: 'Roman Urdu' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', romanizedName: 'Romanized Odia' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', romanizedName: 'Romanized Assamese' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', romanizedName: 'Romanized Nepali' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', romanizedName: 'Romanized Sinhala' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', romanizedName: 'Translit' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', romanizedName: 'Romaji' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', romanizedName: 'Romanized Korean' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', romanizedName: 'Pinyin' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', romanizedName: 'Arabizi' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', romanizedName: 'Romanized Thai' },
];

export const langByCode = (c: string) => LANGUAGES.find((l) => l.code === c);

/** BCP-47 locale for on-device speech recognition. */
export const SPEECH_LOCALE: Record<string, string> = {
  en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', te: 'te-IN', ml: 'ml-IN', kn: 'kn-IN', bn: 'bn-IN', mr: 'mr-IN',
  gu: 'gu-IN', pa: 'pa-IN', ur: 'ur-IN', or: 'or-IN', as: 'as-IN', ne: 'ne-NP', si: 'si-LK', es: 'es-ES',
  fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT', tr: 'tr-TR', id: 'id-ID', vi: 'vi-VN', ru: 'ru-RU',
  ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', th: 'th-TH',
};
