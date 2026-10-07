/** Unicode script detection (step 2 of the pipeline). Pure, no I/O. */

export type ScriptName =
  | 'Latin' | 'Devanagari' | 'Tamil' | 'Telugu' | 'Malayalam' | 'Kannada' | 'Bengali'
  | 'Gujarati' | 'Gurmukhi' | 'Oriya' | 'Sinhala' | 'Arabic' | 'Cyrillic' | 'Hangul'
  | 'Han' | 'Japanese' | 'Thai' | 'Mixed' | 'Unknown';

const RANGES: Array<[ScriptName, number, number]> = [
  ['Devanagari', 0x0900, 0x097f],
  ['Bengali', 0x0980, 0x09ff],
  ['Gurmukhi', 0x0a00, 0x0a7f],
  ['Gujarati', 0x0a80, 0x0aff],
  ['Oriya', 0x0b00, 0x0b7f],
  ['Tamil', 0x0b80, 0x0bff],
  ['Telugu', 0x0c00, 0x0c7f],
  ['Kannada', 0x0c80, 0x0cff],
  ['Malayalam', 0x0d00, 0x0d7f],
  ['Sinhala', 0x0d80, 0x0dff],
  ['Thai', 0x0e00, 0x0e7f],
  ['Arabic', 0x0600, 0x06ff],
  ['Arabic', 0x0750, 0x077f],
  ['Arabic', 0xfb50, 0xfdff],
  ['Arabic', 0xfe70, 0xfeff],
  ['Cyrillic', 0x0400, 0x04ff],
  ['Hangul', 0xac00, 0xd7af],
  ['Hangul', 0x1100, 0x11ff],
  ['Hangul', 0x3130, 0x318f],
  ['Japanese', 0x3040, 0x30ff], // Hiragana + Katakana
  ['Han', 0x4e00, 0x9fff],
  ['Han', 0x3400, 0x4dbf],
];

function scriptOf(cp: number): ScriptName | null {
  for (const [name, lo, hi] of RANGES) if (cp >= lo && cp <= hi) return name;
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) return 'Latin';
  return null; // digits, punctuation, emoji, whitespace: script-neutral
}

export interface ScriptResult {
  script: ScriptName;
  /** share of letters per script, 0..1 */
  shares: Partial<Record<ScriptName, number>>;
  letterCount: number;
}

export function detectScript(text: string): ScriptResult {
  const counts: Partial<Record<ScriptName, number>> = {};
  let total = 0;
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!);
    if (!s) continue;
    counts[s] = (counts[s] ?? 0) + 1;
    total++;
  }
  if (total === 0) return { script: 'Unknown', shares: {}, letterCount: 0 };
  // Han + kana together => Japanese (merge counts so the share is not split)
  if (counts.Han && counts.Japanese) {
    counts.Japanese += counts.Han;
    delete counts.Han;
  }

  const shares: Partial<Record<ScriptName, number>> = {};
  let top: ScriptName = 'Unknown';
  let topN = 0;
  for (const [k, n] of Object.entries(counts) as [ScriptName, number][]) {
    shares[k] = n / total;
    if (n > topN) { top = k; topN = n; }
  }
  // no single script above 80% => Mixed (e.g. Hindi in Devanagari with English words)
  const dominant = (shares[top] ?? 0) >= 0.8;
  return { script: dominant ? top : 'Mixed', shares, letterCount: total };
}

/** Does `text` contain any character of the given script? Used to enforce "Tanglish = no Tamil Unicode". */
export function containsScript(text: string, script: ScriptName): boolean {
  for (const ch of text) if (scriptOf(ch.codePointAt(0)!) === script) return true;
  return false;
}

/** True if text has ANY non-Latin letters. */
export function containsNonLatin(text: string): boolean {
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!);
    if (s && s !== 'Latin') return true;
  }
  return false;
}
