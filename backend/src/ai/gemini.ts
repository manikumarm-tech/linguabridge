import { config } from '../config.js';
import { SYSTEM_PROMPT } from '../pipeline/prompts.js';
import { TOOL, type LLM, type RawLLMResult } from './llm.js';

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Google Gemini over REST; same forced-tool-call contract as ClaudeLLM. Has a free tier. */
export class GeminiLLM implements LLM {
  constructor(private apiKey = config.geminiKey, private model = config.geminiModel) {}

  private async call(body: unknown) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? 'request failed'}`);
    return json.candidates?.[0]?.content?.parts ?? [];
  }

  async run(userPrompt: string, opts: { temperature?: number } = {}): Promise<RawLLMResult> {
    const parts = await this.call({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [{ functionDeclarations: [{ name: TOOL.name, description: TOOL.description, parametersJsonSchema: TOOL.input_schema }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [TOOL.name] } },
      generationConfig: { temperature: opts.temperature ?? 0.2, maxOutputTokens: 1024 },
    });
    const call = parts.find((p: any) => p.functionCall)?.functionCall;
    if (!call) throw new Error('Model returned no tool call');
    return call.args as RawLLMResult;
  }

  /** Speech -> text in the language and script it was spoken in (voice messages). */
  async transcribe(base64: string, mimeType: string): Promise<string> {
    const parts = await this.call({
      systemInstruction: { parts: [{ text: 'Transcribe the speech exactly as spoken, in the language it was spoken. For Indian languages spoken casually, write it the way people text it (e.g. Tanglish/Hinglish in Latin letters) unless it is clearly formal. Output only the transcript. If there is no speech, output an empty string.' }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data: base64 } }, { text: 'Transcribe this voice message.' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    });
    return parts.map((p: any) => p.text ?? '').join('').trim();
  }

  async extractText(base64: string, mediaType: MediaType): Promise<string> {
    const parts = await this.call({
      systemInstruction: { parts: [{ text: 'Transcribe all readable text in the image exactly as written, in its original language and script. Output only the transcription, nothing else. If there is no text, output an empty string.' }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: 'Transcribe the text.' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    });
    return parts.map((p: any) => p.text ?? '').join('').trim();
  }
}
