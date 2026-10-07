import test from 'node:test';
import assert from 'node:assert/strict';
import { detectScript } from '../src/pipeline/script.js';
import { preDetect } from '../src/pipeline/detect.js';
import { Translator } from '../src/pipeline/translate.js';
import type { LLM, RawLLMResult } from '../src/ai/llm.js';
import type { TranslateRequest } from '../src/types.js';

const base: TranslateRequest = {
  text: 'Kal tum free ho kya?', targetLang: 'ta', format: 'both', mode: 'casual', includeEnglish: true,
};

function fakeLLM(responses: RawLLMResult[]): LLM & { calls: number } {
  let i = 0;
  return {
    calls: 0,
    async run() { this.calls++; return responses[Math.min(i++, responses.length - 1)]; },
  };
}

const hindiDetect = { languageCode: 'hi', script: 'Latin', romanized: true, confidence: 0.96 };

test('script detection', () => {
  assert.equal(detectScript('நாளைக்கு நீ ஃப்ரீயா').script, 'Tamil');
  assert.equal(detectScript('क्या तुम कल फ्री हो?').script, 'Devanagari');
  assert.equal(detectScript('hello 😀').script, 'Latin');
  assert.equal(detectScript('😀 123').script, 'Unknown');
  assert.equal(detectScript('こんにちは 漢字').script, 'Japanese');
});

test('romanized Tamil is NOT classified as English', () => {
  const p = preDetect('nee enga iruka');
  assert.equal(p.guess?.languageCode, 'ta');
  assert.equal(p.guess?.romanized, true);
});

test('Hinglish detected', () => {
  const p = preDetect('Kal tum free ho kya?');
  assert.equal(p.guess?.languageCode, 'hi');
  assert.equal(p.guess?.romanized, true);
});

test('Telugu / Kannada / Malayalam romanized hints', () => {
  assert.equal(preDetect('nuvvu ekkada unnav?').guess?.languageCode, 'te');
  assert.equal(preDetect('neenu elli idiya?').guess?.languageCode, 'kn');
  assert.equal(preDetect('nee evideya?').guess?.languageCode, 'ml');
});

test('plain English stays English, native script resolves offline', () => {
  assert.equal(preDetect('Are you free tomorrow? I will call you later').guess?.languageCode, 'en');
  const ta = preDetect('நீ எங்க இருக்க');
  assert.equal(ta.guess?.languageCode, 'ta');
  assert.equal(ta.needsLLM, false);
});

test('empty message rejected, emoji-only skipped without LLM', async () => {
  const llm = fakeLLM([]);
  const t = new Translator(llm);
  await assert.rejects(() => t.translate({ ...base, text: '   ' }));
  const r = await t.translate({ ...base, text: '👍👍' });
  assert.equal(r.status, 'skipped');
  assert.equal(llm.calls, 0);
});

test('full result shape for Hinglish -> Tamil (both)', async () => {
  const llm = fakeLLM([{
    detection: hindiDetect,
    target: { native: 'நாளைக்கு நீ ஃப்ரீயா இருக்கியா?', romanized: 'Naalaiku nee free-ah irukkiya?' },
    english: 'Are you free tomorrow?', tone: 'casual', confidence: 0.96,
  }]);
  const r = await new Translator(llm).translate(base);
  assert.equal(r.detectedLanguage, 'Hindi');
  assert.equal(r.isRomanized, true);
  assert.equal(r.detectedScript, 'Latin');
  assert.deepEqual(r.translations.tamil, { native: 'நாளைக்கு நீ ஃப்ரீயா இருக்கியா?', romanized: 'Naalaiku nee free-ah irukkiya?' });
  assert.equal(r.translations.english, 'Are you free tomorrow?');
  assert.equal(r.status, 'ok');
});

test('Tanglish-only never returns Tamil script (retry, then hard strip)', async () => {
  const leaky = {
    detection: hindiDetect,
    target: { romanized: 'Naalaiku நீ free-ah irukkiya? 😊' },
    tone: 'casual', confidence: 0.9,
  };
  const llm = fakeLLM([leaky, leaky]);
  const r = await new Translator(llm).translate({ ...base, format: 'romanized', includeEnglish: false });
  const t = r.translations.tamil as { native?: string; romanized?: string };
  assert.equal(llm.calls, 2);
  assert.equal(t.native, undefined);
  assert.match(t.romanized!, /^[\u0000-ɏ -⁯\p{Extended_Pictographic}]+$/u);
  assert.equal(r.status, 'degraded');
});

test('retry fixes a leak without degrading', async () => {
  const good = { detection: hindiDetect, target: { romanized: 'Naalaiku nee free-ah irukkiya?' }, tone: 'casual', confidence: 0.9 };
  const llm = fakeLLM([{ ...good, target: { romanized: 'நாளைக்கு' } }, good]);
  const r = await new Translator(llm).translate({ ...base, format: 'romanized', includeEnglish: false });
  assert.equal(r.status, 'ok');
  assert.equal((r.translations.tamil as any).romanized, 'Naalaiku nee free-ah irukkiya?');
});

test('cache hit avoids second LLM call; regenerate bypasses cache', async () => {
  const llm = fakeLLM([{ detection: hindiDetect, target: { native: 'a', romanized: 'b' }, english: 'c', tone: 'casual', confidence: 0.9 }]);
  const t = new Translator(llm);
  await t.translate(base);
  await t.translate(base);
  assert.equal(llm.calls, 1);
  await t.translate({ ...base, regenerate: { previous: 'b' } });
  assert.equal(llm.calls, 2);
});

test('low confidence is flagged', async () => {
  const llm = fakeLLM([{ detection: { ...hindiDetect, confidence: 0.4 }, target: { native: 'x', romanized: 'y' }, english: 'z', tone: 'casual', confidence: 0.9 }]);
  const r = await new Translator(llm).translate(base);
  assert.equal(r.status, 'low_confidence');
});
