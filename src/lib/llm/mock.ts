import type { ZodType } from 'zod';
import { env } from '../../config/env';
import { FIXTURE_SITES, fixtureFor } from '../fixtures/sites';
import { logLlmCall, type LlmCallLogger } from './log';
import type { GroundingSource, LLMCallOptions, LLMInput, LLMProvider, LLMResult, RawCompletion, TaskName } from './types';
import { validatedCall } from './validate';

export const MOCK_MODEL = 'mock-fixtures';

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function domainFrom(user: string): string | null {
  return user.match(/^(?:Domain|Site): (\S+)/m)?.[1] ?? null;
}

/** Answers from fixtures. Used when LLM_MODE=mock, so the pipeline can run without keys or network. */
export class MockProvider implements LLMProvider {
  readonly name = 'mock' as const;

  constructor(private readonly log: LlmCallLogger = logLlmCall) {}

  private answer(task: TaskName, input: LLMInput): { json: unknown; sources?: GroundingSource[] } {
    if (task === 'discover') {
      const segment = (['fashion', 'furniture', 'villa_developer'] as const).find((s) => input.user.includes(s === 'villa_developer' ? 'villa' : s)) ?? 'fashion';
      const pool = FIXTURE_SITES.filter((s) => s.segment === segment);
      const start = hash(input.user) % pool.length;
      const picked = Array.from({ length: 7 }, (_, i) => pool[(start + i) % pool.length]);
      return {
        json: picked.map((s) => ({ brand_name: s.name, website_url: `https://${s.domain}/`, country: s.country, city: s.city, why_candidate: `Fixture: ${s.classify.summary}` })),
        sources: picked.map((s) => ({ uri: `https://${s.domain}/`, title: s.name })),
      };
    }

    const domain = domainFrom(input.user);
    const site = domain ? fixtureFor(domain) : null;
    if (!site) throw new Error(`MockProvider has no fixture for ${domain ?? 'this prompt'} (task ${task})`);
    if (task === 'classify' || task === 'pay_signals') return { json: task === 'classify' ? site.classify : site.classify.pay_signals };
    if (task === 'critique_design') return { json: site.critique };
    throw new Error(`MockProvider does not implement task "${task}"`);
  }

  async json<T>(task: TaskName, input: LLMInput, schema: ZodType<T>, opts?: LLMCallOptions): Promise<LLMResult<T>> {
    return validatedCall({
      task,
      provider: this.name,
      model: MOCK_MODEL,
      input,
      schema,
      opts,
      log: this.log,
      complete: async (i): Promise<RawCompletion> => {
        const { json, sources } = this.answer(task, i);
        return { text: JSON.stringify(json), model: MOCK_MODEL, tokensIn: Math.ceil((i.system.length + i.user.length) / 4), tokensOut: Math.ceil(JSON.stringify(json).length / 4), sources };
      },
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const dim = env().EMBED_DIM;
    return texts.map((t) => {
      const seed = hash(t);
      const v = Array.from({ length: dim }, (_, i) => Math.sin(seed + i * 12.9898));
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}
