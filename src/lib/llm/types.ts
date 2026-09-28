import type { ZodType } from 'zod';

export const TASK_NAMES = [
  'discover',
  'extract_contacts_fallback',
  'classify',
  'critique_design',
  'pay_signals',
  'embed',
  'propose_rules',
  'draft_email',
] as const;
export type TaskName = (typeof TASK_NAMES)[number];

export type ProviderName = 'gemini' | 'claude-cli' | 'mock';

export interface GroundingSource {
  uri: string;
  title: string | null;
}

export interface LLMImage {
  data: Buffer;
  mimeType: 'image/webp' | 'image/png' | 'image/jpeg';
}

export interface LLMInput {
  system: string;
  user: string;
  images?: LLMImage[];
}

export interface LLMCallOptions {
  grounding?: boolean;
  /** Stored on the llm_calls row so usage can be traced to a lead. */
  companyId?: string;
}

export interface LLMResult<T> {
  data: T;
  sources?: GroundingSource[];
}

export interface LLMProvider {
  readonly name: ProviderName;
  json<T>(task: TaskName, input: LLMInput, schema: ZodType<T>, opts?: LLMCallOptions): Promise<LLMResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

/** What a provider returns before validation. */
export interface RawCompletion {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  sources?: GroundingSource[];
}

/** The job should be retried later, not failed. Thrown on subscription usage limits. */
export class LLMDeferredError extends Error {
  constructor(
    message: string,
    public readonly retryAt: Date | null,
  ) {
    super(message);
    this.name = 'LLMDeferredError';
  }
}

export class LLMValidationError extends Error {
  constructor(
    public readonly task: TaskName,
    message: string,
  ) {
    super(`${task}: model output failed validation twice: ${message}`);
    this.name = 'LLMValidationError';
  }
}
