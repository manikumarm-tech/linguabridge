import { createHash } from 'node:crypto';
import type { LLM, RawLLMResult } from '../ai/llm.js';
import { getLanguage, hasRomanizedVariant, requireLanguage } from '../languages.js';
import type { LangText, TranslateRequest, TranslationResult, TranslationStatus } from '../types.js';
import { normalizeDetection, preDetect, type PreDetection } from './detect.js';
import { buildUserPrompt } from './prompts.js';
import { containsNonLatin } from './script.js';

const LOW_CONFIDENCE = 0.6;
const MAX_TEXT = 4000;

class LRU<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string) {
    const v = this.m.get(k);
    if (v !== undefined) { this.m.delete(k); this.m.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}

/** Per-field checks that make the output-format guarantees real, not just prompted. */
function validate(req: TranslateRequest, raw: RawLLMResult): string[] {
  const problems: string[] = [];
  const canRoman = hasRomanizedVariant(req.targetLang);
  const wantNative = req.format !== 'romanized' || !canRoman;
  const wantRoman = canRoman && req.format !== 'native';
  const t = raw.target ?? {};
  if (wantNative && !t.native?.trim()) problems.push('target.native is missing');
  if (wantRoman) {
    if (!t.romanized?.trim()) problems.push('target.romanized is missing');
    else if (containsNonLatin(stripEmoji(t.romanized))) {
      problems.push(`target.romanized contains ${requireLanguage(req.targetLang).script} characters; it must be Latin letters only`);
    }
  }
  if (req.includeEnglish && req.targetLang !== 'en' && !raw.english?.trim()) problems.push('english is missing');
  return problems;
}

function stripEmoji(s: string) {
  return s.replace(/\p{Extended_Pictographic}|\p{Emoji_Component}/gu, '');
}

/** Remove native-script characters from a romanized string as a last resort. */
function forceLatin(s: string) {
  return s.replace(/[^\u0000-ɏ -⁯\p{Extended_Pictographic}\p{Emoji_Component}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function skipped(req: TranslateRequest, pre: PreDetection): TranslationResult {
  return {
    originalText: req.text,
    detectedLanguage: pre.guess?.language ?? 'Unknown',
    detectedLanguageCode: pre.guess?.languageCode ?? 'und',
    detectedScript: pre.script,
    isRomanized: false,
    targetLanguageCode: req.targetLang,
    translations: { [requireLanguage(req.targetLang).name.toLowerCase()]: { native: req.text } },
    tone: 'neutral',
    confidence: 1,
    status: 'skipped',
    mode: req.mode,
    format: req.format,
  };
}

export class Translator {
  private cache = new LRU<TranslationResult>(500);
  constructor(private llm: LLM) {}

  private key(req: TranslateRequest) {
    return createHash('sha1')
      .update(JSON.stringify([req.text, req.targetLang, req.format, req.mode, req.includeEnglish, req.senderLang ?? '', (req.context ?? []).slice(-3)]))
      .digest('hex');
  }

  /** Full pipeline: empty check -> script -> hints -> LLM detect+translate -> validate -> normalize. */
  async translate(input: TranslateRequest): Promise<TranslationResult> {
    if (!getLanguage(input.targetLang)) throw new Error(`Unsupported target language: ${input.targetLang}`);
    const req: TranslateRequest = { ...input, text: input.text.trim().slice(0, MAX_TEXT) };

    const pre = preDetect(req.text);
    if (pre.empty) throw new Error('Message is empty');
    if (pre.script === 'Unknown') return skipped(req, pre); // emoji / numbers only

    const cacheKey = this.key(req);
    if (!req.regenerate) {
      const hit = this.cache.get(cacheKey);
      if (hit) return hit;
    }

    let prompt = buildUserPrompt(req, pre);
    const temperature = req.regenerate ? 0.7 : 0.2;
    let raw: RawLLMResult;
    let problems: string[];
    let degraded = false;
    try {
      raw = await this.llm.run(prompt, { temperature });
      problems = validate(req, raw);
      if (problems.length) {
        // one corrective retry
        prompt += `\n\nYour previous answer was rejected: ${problems.join('; ')}. Fix exactly these problems.`;
        raw = await this.llm.run(prompt, { temperature: 0.1 });
        problems = validate(req, raw);
        if (problems.length) degraded = true;
      }
    } catch (e) {
      // model unreachable (bad key, no credit, outage): deliver the original text, marked failed
      console.error('translation failed:', (e as Error).message);
      return { ...skipped(req, pre), translations: { [requireLanguage(req.targetLang).name.toLowerCase()]: {} }, status: 'failed' };
    }

    const detection = normalizeDetection(raw.detection, pre);
    const target = requireLanguage(req.targetLang);
    const canRoman = hasRomanizedVariant(req.targetLang);

    const out: LangText = {};
    if (req.format !== 'romanized' || !canRoman) out.native = raw.target?.native?.trim();
    if (canRoman && req.format !== 'native') {
      const r = raw.target?.romanized?.trim();
      // Hard guarantee: "Tanglish only" never leaks Tamil script.
      out.romanized = r && containsNonLatin(stripEmoji(r)) ? forceLatin(r) : r;
    }

    const translations: TranslationResult['translations'] = { [target.name.toLowerCase()]: out };
    if (req.includeEnglish && req.targetLang !== 'en' && raw.english?.trim()) translations.english = raw.english.trim();

    const confidence = Math.min(detection.confidence, typeof raw.confidence === 'number' ? raw.confidence : 1);
    let status: TranslationStatus = degraded ? 'degraded' : confidence < LOW_CONFIDENCE ? 'low_confidence' : 'ok';
    if (!out.native && !out.romanized) status = 'failed';

    const result: TranslationResult = {
      originalText: req.text,
      detectedLanguage: detection.language,
      detectedLanguageCode: detection.languageCode,
      detectedScript: detection.script,
      isRomanized: detection.romanized,
      mixedWith: detection.mixedWith,
      targetLanguageCode: req.targetLang,
      translations,
      tone: raw.tone ?? req.mode,
      confidence: Math.round(confidence * 100) / 100,
      status,
      mode: req.mode,
      format: req.format,
    };
    if (status !== 'failed' && !req.regenerate) this.cache.set(cacheKey, result);
    return result;
  }
}

/** Pick the string the recipient should see first, honoring their format preference. */
export function primaryText(r: TranslationResult): string {
  const t = r.translations[requireLanguage(r.targetLanguageCode).name.toLowerCase()] as LangText | undefined;
  return (r.format === 'native' ? t?.native ?? t?.romanized : t?.romanized ?? t?.native) ?? r.originalText;
}
