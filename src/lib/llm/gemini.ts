import { GoogleGenAI, type Part } from '@google/genai';
import type { ZodType } from 'zod';
import { env } from '../../config/env';
import { logLlmCall, type LlmCallLogger } from './log';
import { modelFor } from './routing';
import type { GroundingSource, LLMCallOptions, LLMInput, LLMProvider, LLMResult, RawCompletion, TaskName } from './types';
import { validatedCall } from './validate';

// SDK usage verified 2026-09-28 against @google/genai 2.24.0 type definitions.
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;
  private client: GoogleGenAI | null = null;

  constructor(private readonly log: LlmCallLogger = logLlmCall) {}

  private ai(): GoogleGenAI {
    if (!this.client) {
      const apiKey = env().GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  private async complete(model: string, input: LLMInput, grounding: boolean): Promise<RawCompletion> {
    const parts: Part[] = [
      ...(input.images ?? []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data.toString('base64') } })),
      { text: input.user },
    ];

    const res = await this.ai().models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: input.system,
        temperature: 0.2,
        ...(grounding
          ? // TODO(verify): Search grounding combined with JSON mode is a Preview feature. Until a live call
            // confirms it, grounded calls ask for JSON in the prompt only and the reply is parsed leniently.
            { tools: [{ googleSearch: {} }] }
          : { responseMimeType: 'application/json' }),
      },
    });

    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: GroundingSource[] = [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) sources.push({ uri: chunk.web.uri, title: chunk.web.title ?? null });
    }

    const usage = res.usageMetadata;
    const out = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
    return {
      text: res.text ?? '',
      model,
      tokensIn: usage?.promptTokenCount ?? null,
      tokensOut: usage ? out : null,
      sources: grounding ? sources : undefined,
    };
  }

  async json<T>(task: TaskName, input: LLMInput, schema: ZodType<T>, opts?: LLMCallOptions): Promise<LLMResult<T>> {
    const model = modelFor(task);
    const grounding = Boolean(opts?.grounding);
    return validatedCall({
      task,
      provider: this.name,
      model,
      input,
      schema,
      opts,
      log: this.log,
      complete: (i) => this.complete(model, i, grounding),
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = modelFor('embed');
    const started = Date.now();
    try {
      // One Content per text. A plain string array may be merged into a single embedding.
      const res = await this.ai().models.embedContent({
        model,
        contents: texts.map((t) => ({ role: 'user', parts: [{ text: t }] })),
        config: { outputDimensionality: env().EMBED_DIM },
      });
      const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== texts.length) throw new Error(`expected ${texts.length} embeddings, got ${vectors.length}`);
      const wrong = vectors.find((v) => v.length !== env().EMBED_DIM);
      if (wrong) throw new Error(`embedding has ${wrong.length} dimensions, EMBED_DIM is ${env().EMBED_DIM}`);
      await this.log({ task: 'embed', provider: this.name, model, tokensIn: null, tokensOut: null, grounded: false, latencyMs: Date.now() - started, ok: true });
      return vectors;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.log({ task: 'embed', provider: this.name, model, tokensIn: null, tokensOut: null, grounded: false, latencyMs: Date.now() - started, ok: false, error: message });
      throw err;
    }
  }
}
