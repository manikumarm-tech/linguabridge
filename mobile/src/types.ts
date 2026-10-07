export type OutputFormat = 'native' | 'romanized' | 'both';
export type DisplayMode = 'translation_only' | 'original_translation' | 'original_translation_english';
export type TranslationMode = 'natural' | 'literal' | 'casual';

export interface User {
  id: string; handle: string; name: string; language: string; outputFormat: OutputFormat;
  showEnglish: boolean; displayMode: DisplayMode; translationMode: TranslationMode; isBot: boolean;
}

export interface LangText { native?: string; romanized?: string }
export interface TranslationResult {
  originalText: string; detectedLanguage: string; detectedLanguageCode: string; detectedScript: string;
  isRomanized: boolean; targetLanguageCode: string; translations: Record<string, LangText | string>;
  tone: string; confidence: number; status: 'ok' | 'low_confidence' | 'degraded' | 'skipped' | 'failed';
}

export interface Detected { language: string; languageCode: string; script: string; romanized: boolean; confidence: number; label: string }

export interface Message {
  id: string; conversationId: string; senderId: string; recipientId: string | null; kind: 'text' | 'voice';
  originalText: string; createdAt: string; detected: Detected | null; translation: TranslationResult | null; primaryText: string;
}

export interface ConversationItem {
  id: string; peer: { id: string; handle: string; name: string; language: string };
  lastMessage: string | null; lastAt: string | null; detectedLabel: string | null;
}

export interface Preview {
  detected: Detected; translateTo: { languageCode: string; label: string };
  translation: TranslationResult; primaryText: string;
}
