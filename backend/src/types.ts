export type TranslationMode = 'natural' | 'literal' | 'casual';
/** native = script (தமிழ்), romanized = Tanglish, both = both */
export type OutputFormat = 'native' | 'romanized' | 'both';
export type TranslationStatus = 'ok' | 'low_confidence' | 'degraded' | 'skipped' | 'failed';

export interface ContextMessage {
  from: 'me' | 'them';
  text: string;
  languageCode?: string;
}

export interface TranslateRequest {
  text: string;
  targetLang: string;
  format: OutputFormat;
  mode: TranslationMode;
  includeEnglish: boolean;
  context?: ContextMessage[];
  /** sender's declared primary language: a prior, not a rule */
  senderLang?: string;
  /** retranslate: skip cache and ask for a different phrasing */
  regenerate?: { previous: string };
}

export interface LangText {
  /** native script, e.g. Tamil Unicode */
  native?: string;
  /** Latin transliteration, e.g. Tanglish */
  romanized?: string;
}

export interface TranslationResult {
  originalText: string;
  detectedLanguage: string;
  detectedLanguageCode: string;
  detectedScript: string;
  isRomanized: boolean;
  mixedWith?: string[];
  targetLanguageCode: string;
  /** keyed by lowercase language name (e.g. "tamil") plus "english" */
  translations: Record<string, LangText | string>;
  tone: string;
  confidence: number;
  status: TranslationStatus;
  mode: TranslationMode;
  format: OutputFormat;
}
