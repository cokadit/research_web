import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LlmCallRow } from '../src/lib/llm/log';
import { LLMValidationError, type LLMInput, type RawCompletion } from '../src/lib/llm/types';
import { extractJson, validatedCall } from '../src/lib/llm/validate';

const schema = z.object({ n: z.number() });
const input: LLMInput = { system: 's', user: 'u' };
const reply = (text: string): RawCompletion => ({ text, model: 'test-model', tokensIn: 10, tokensOut: 5 });

function setup(replies: string[]) {
  const rows: LlmCallRow[] = [];
  const seen: LLMInput[] = [];
  const complete = vi.fn(async (i: LLMInput) => {
    seen.push(i);
    return reply(replies[seen.length - 1]);
  });
  const run = () => validatedCall({ task: 'classify', provider: 'mock', model: 'test-model', input, schema, complete, log: async (r) => void rows.push(r) });
  return { rows, seen, complete, run };
}

describe('extractJson', () => {
  it('reads plain, fenced and wrapped JSON', () => {
    expect(extractJson('{"n":1}')).toEqual({ n: 1 });
    expect(extractJson('```json\n{"n":1}\n```')).toEqual({ n: 1 });
    expect(extractJson('Here you go:\n[{"n":1}]\nDone.')).toEqual([{ n: 1 }]);
  });
  it('throws on non-JSON', () => {
    expect(() => extractJson('sorry, no')).toThrow();
  });
});

describe('validatedCall', () => {
  it('returns valid output after one call', async () => {
    const t = setup(['{"n":1}']);
    await expect(t.run()).resolves.toEqual({ data: { n: 1 }, sources: undefined });
    expect(t.complete).toHaveBeenCalledTimes(1);
    expect(t.rows).toMatchObject([{ ok: true, tokensIn: 10, model: 'test-model' }]);
  });

  it('retries once with the validation error appended', async () => {
    const t = setup(['{"n":"one"}', '{"n":2}']);
    await expect(t.run()).resolves.toMatchObject({ data: { n: 2 } });
    expect(t.complete).toHaveBeenCalledTimes(2);
    expect(t.seen[1].user).toContain('Your previous reply was rejected');
    expect(t.seen[1].user).toContain('n');
    expect(t.rows.map((r) => r.ok)).toEqual([false, true]);
  });

  it('fails after the second invalid reply', async () => {
    const t = setup(['nope', '{"n":null}']);
    await expect(t.run()).rejects.toBeInstanceOf(LLMValidationError);
    expect(t.complete).toHaveBeenCalledTimes(2);
    expect(t.rows.map((r) => r.ok)).toEqual([false, false]);
  });

  it('logs and rethrows provider errors without retrying', async () => {
    const rows: LlmCallRow[] = [];
    const complete = vi.fn(async () => {
      throw new Error('HTTP 500');
    });
    await expect(validatedCall({ task: 'classify', provider: 'mock', model: 'm', input, schema, complete, log: async (r) => void rows.push(r) })).rejects.toThrow('HTTP 500');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(rows).toMatchObject([{ ok: false, error: 'HTTP 500' }]);
  });
});
