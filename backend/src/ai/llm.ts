import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { SYSTEM_PROMPT } from '../pipeline/prompts.js';

/** What the model returns through the forced tool call. */
export interface RawLLMResult {
  detection: {
    languageCode: string;
    script?: string;
    romanized?: boolean;
    confidence?: number;
    mixedWith?: string[];
  };
  target?: { native?: string; romanized?: string };
  english?: string;
  tone?: string;
  confidence?: number;
}

export interface LLM {
  run(userPrompt: string, opts?: { temperature?: number }): Promise<RawLLMResult>;
}

const TOOL: Anthropic.Tool = {
  name: 'submit_translation',
  description: 'Return the language detection and the translations for the chat message.',
  input_schema: {
    type: 'object',
    properties: {
      detection: {
        type: 'object',
        properties: {
          languageCode: { type: 'string', description: 'ISO 639-1 code of the dominant language, e.g. ta, hi, en' },
          script: { type: 'string', description: 'Latin, Devanagari, Tamil, Arabic, Mixed…' },
          romanized: { type: 'boolean', description: 'true if the language is written in Latin letters but is not natively Latin-script' },
          confidence: { type: 'number' },
          mixedWith: { type: 'array', items: { type: 'string' }, description: 'ISO codes of other languages in a code-mixed message' },
        },
        required: ['languageCode', 'script', 'romanized', 'confidence'],
      },
      target: {
        type: 'object',
        properties: {
          native: { type: 'string', description: 'Translation in the target native script' },
          romanized: { type: 'string', description: 'Translation typed in Latin letters only' },
        },
      },
      english: { type: 'string' },
      tone: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['detection', 'target', 'tone', 'confidence'],
  },
};

export class ClaudeLLM implements LLM {
  private client: Anthropic;
  constructor(apiKey = config.anthropicKey, private model = config.model) {
    this.client = new Anthropic({ apiKey });
  }

  async run(userPrompt: string, opts: { temperature?: number } = {}): Promise<RawLLMResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: opts.temperature ?? 0.2,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) throw new Error('Model returned no tool call');
    return block.input as RawLLMResult;
  }

  /** Read text out of a photo (signs, screenshots, handwriting) so it can be translated like a typed message. */
  async extractText(base64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0,
      system: 'Transcribe all readable text in the image exactly as written, in its original language and script. Output only the transcription, nothing else. If there is no text, output an empty string.',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: 'Transcribe the text.' }] }],
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }
}
