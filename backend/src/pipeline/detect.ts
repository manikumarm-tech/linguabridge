import { detectScript, type ScriptName } from './script.js';
import { romanizedHints } from './romanized.js';
import { getLanguage } from '../languages.js';

export interface Detection {
  language: string;
  languageCode: string;
  script: string;
  romanized: boolean;
  confidence: number;
  /** other languages present in a code-mixed message */
  mixedWith?: string[];
}

export interface PreDetection {
  empty: boolean;
  script: ScriptName;
  /** best offline guess, if any */
  guess?: Detection;
  /** ranked language codes the LLM should weigh */
  candidates: string[];
  /** true when only an LLM can settle it */
  needsLLM: boolean;
}

/** Native script -> possible languages (ordered by prior likelihood). */
const SCRIPT_LANGS: Partial<Record<ScriptName, string[]>> = {
  Tamil: ['ta'], Telugu: ['te'], Kannada: ['kn'], Malayalam: ['ml'], Gujarati: ['gu'],
  Gurmukhi: ['pa'], Oriya: ['or'], Sinhala: ['si'], Thai: ['th'], Hangul: ['ko'], Japanese: ['ja'],
  Han: ['zh', 'ja'], Cyrillic: ['ru'], Devanagari: ['hi', 'mr', 'ne'], Bengali: ['bn', 'as'], Arabic: ['ur', 'ar'],
};

function make(code: string, script: string, romanized: boolean, confidence: number): Detection {
  return {
    language: getLanguage(code)?.name ?? code,
    languageCode: code,
    script,
    romanized,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * Pipeline steps 1-3 (offline): empty check -> script -> lexicon hints.
 * The LLM step then confirms/overrides using conversation context.
 */
export function preDetect(text: string): PreDetection {
  const trimmed = text.trim();
  if (!trimmed) return { empty: true, script: 'Unknown', candidates: [], needsLLM: false };

  const sc = detectScript(trimmed);
  if (sc.script === 'Unknown') {
    // emoji / digits only: nothing to translate
    return { empty: false, script: 'Unknown', candidates: [], needsLLM: false };
  }

  if (sc.script !== 'Latin' && sc.script !== 'Mixed') {
    const langs = SCRIPT_LANGS[sc.script] ?? [];
    const unique = langs.length === 1;
    return {
      empty: false,
      script: sc.script,
      candidates: langs,
      guess: langs[0] ? make(langs[0], sc.script, false, unique ? 0.97 : 0.7) : undefined,
      needsLLM: !unique,
    };
  }

  // Latin (or mixed): never assume English.
  const h = romanizedHints(trimmed);
  const top = h.candidates[0];
  const candidates = h.candidates.map((c) => c.code);
  if (h.englishRatio >= 0.6 && (!top || top.score < 0.4)) {
    return { empty: false, script: sc.script, candidates: ['en', ...candidates], guess: make('en', 'Latin', false, 0.8), needsLLM: h.tokenCount < 4 };
  }
  if (top && top.score >= 0.35) {
    return {
      empty: false,
      script: sc.script,
      candidates,
      guess: make(top.code, 'Latin', true, Math.min(0.85, 0.5 + top.score * 0.4)),
      needsLLM: true,
    };
  }
  // Latin text, no lexicon match: could be es/fr/de/en or an unseen romanized language
  return { empty: false, script: sc.script, candidates, needsLLM: true };
}

/** Normalize an LLM-produced detection into a safe, consistent shape. */
export function normalizeDetection(raw: Partial<Detection>, pre: PreDetection): Detection {
  const code = getLanguage(raw.languageCode ?? '') ? raw.languageCode! : pre.guess?.languageCode ?? 'en';
  const info = getLanguage(code)!;
  const script = raw.script || pre.script || info.script;
  // romanized iff text is Latin but the language's native script isn't
  const romanized = script === 'Latin' && info.script !== 'Latin';
  const conf = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : pre.guess?.confidence ?? 0.5;
  return {
    language: info.name,
    languageCode: code,
    script: pre.script === 'Mixed' ? 'Mixed' : script,
    romanized: pre.script === 'Mixed' ? !!raw.romanized : romanized,
    confidence: Math.round(conf * 100) / 100,
    mixedWith: raw.mixedWith?.filter((c) => getLanguage(c) && c !== code),
  };
}
