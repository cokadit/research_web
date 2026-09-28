import { z, type ZodType } from 'zod';
import type { LlmCallLogger } from './log';
import { LLMDeferredError, LLMValidationError, type LLMCallOptions, type LLMInput, type LLMResult, type ProviderName, type RawCompletion, type TaskName } from './types';

/** Pulls the JSON value out of a model reply that may be wrapped in a code fence or prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [trimmed, fenced?.[1]?.trim()];

  const firstObject = trimmed.indexOf('{');
  const firstArray = trimmed.indexOf('[');
  const starts = [firstObject, firstArray].filter((i) => i >= 0).sort((a, b) => a - b);
  for (const start of starts) {
    const close = trimmed[start] === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(close);
    if (end > start) candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new Error('reply is not valid JSON');
}

function describeError(err: unknown): string {
  if (err instanceof z.ZodError) return z.prettifyError(err);
  return err instanceof Error ? err.message : String(err);
}

export interface ValidatedCallArgs<T> {
  task: TaskName;
  provider: ProviderName;
  input: LLMInput;
  schema: ZodType<T>;
  opts?: LLMCallOptions;
  complete: (input: LLMInput) => Promise<RawCompletion>;
  log: LlmCallLogger;
  /** Used for the log row when the call throws before a model name is known. */
  model: string;
}

/**
 * Rule 6: validate every model output. On invalid JSON, retry once with the
 * validation error appended, then fail. Every attempt writes an llm_calls row.
 */
export async function validatedCall<T>(args: ValidatedCallArgs<T>): Promise<LLMResult<T>> {
  let input = args.input;
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    let raw: RawCompletion;
    try {
      raw = await args.complete(input);
    } catch (err) {
      await args.log({
        task: args.task,
        provider: args.provider,
        model: args.model,
        tokensIn: null,
        tokensOut: null,
        grounded: Boolean(args.opts?.grounding),
        latencyMs: Date.now() - started,
        ok: false,
        error: describeError(err),
        companyId: args.opts?.companyId,
      });
      throw err;
    }

    const base = {
      task: args.task,
      provider: args.provider,
      model: raw.model,
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensOut,
      grounded: Boolean(args.opts?.grounding),
      latencyMs: Date.now() - started,
      companyId: args.opts?.companyId,
    };

    try {
      const data = args.schema.parse(extractJson(raw.text));
      await args.log({ ...base, ok: true });
      return { data, sources: raw.sources };
    } catch (err) {
      lastError = describeError(err);
      await args.log({ ...base, ok: false, error: `invalid output (attempt ${attempt + 1}): ${lastError}` });
      input = {
        ...args.input,
        user: `${args.input.user}\n\nYour previous reply was rejected:\n${lastError}\n\nReply again with JSON only, matching the required shape exactly.`,
      };
    }
  }
  throw new LLMValidationError(args.task, lastError);
}

export { LLMDeferredError };
