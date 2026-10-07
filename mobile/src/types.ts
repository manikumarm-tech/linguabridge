export type OutputFormat = 'native' | 'romanized' | 'both';
export type DisplayMode = 'translation_only' | 'original_translation' | 'original_translation_english';
export type TranslationMode = 'natural' | 'literal' | 'casual';

export interface User {
  id: string; handle: string; name: string; language: string; outputFormat: OutputFormat;
  showEnglish: boolean; displayMode: DisplayMode; translationMode: TranslationMode; isBot: boolean;
  /** only on my own profile: set once Google is linked */
  email?: string | null; avatarUrl?: string | null;
  /** only for people I chat with */
  online?: boolean; lastSeenAt?: string | null;
}

export interface LangText { native?: string; romanized?: string }
export interface TranslationResult {
  originalText: string; detectedLanguage: string; detectedLanguageCode: string; detectedScript: string;
  isRomanized: boolean; targetLanguageCode: string; translations: Record<string, LangText | string>;
  tone: string; confidence: number; status: 'ok' | 'low_confidence' | 'degraded' | 'skipped' | 'failed';
}

export interface Detected { language: string; languageCode: string; script: string; romanized: boolean; confidence: number; label: string }

export interface Message {
  id: string; conversationId: string; senderId: string; kind: 'text' | 'voice';
  originalText: string; createdAt: string; detected: Detected | null; translation: TranslationResult | null; primaryText: string;
  deleted: boolean;
  /** voice messages: path of the recording on the server */
  audioUrl: string | null;
  replyTo: { id: string; senderId: string; senderName: string; text: string; kind: string } | null;
  reactions: { userId: string; emoji: string }[];
}

export interface ConversationItem {
  id: string; isGroup: boolean; title: string; memberCount: number;
  /** 1:1 chats only */
  peer: { id: string; handle: string; name: string; language: string; avatarUrl: string | null; online: boolean; lastSeenAt: string | null } | null;
  lastMessage: string | null; lastAt: string | null; detectedLabel: string | null; unread: number;
}

export interface Preview {
  detected: Detected; translateTo: { languageCode: string; label: string };
  translation: TranslationResult; primaryText: string;
}

export interface ChatData {
  isGroup: boolean; title: string; peer: User | null; members: User[];
  /** userId -> when they last read this chat */
  reads: Record<string, string>;
  /** everyone else has read up to here */
  peerLastReadAt: string | null;
  messages: Message[];
}
