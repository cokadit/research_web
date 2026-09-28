import { db } from '../../db/client';
import { llmCalls } from '../../db/schema';
import type { ProviderName, TaskName } from './types';

export interface LlmCallRow {
  task: TaskName;
  provider: ProviderName;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  grounded: boolean;
  latencyMs: number;
  ok: boolean;
  error?: string;
  companyId?: string;
}

export type LlmCallLogger = (row: LlmCallRow) => Promise<void>;

export const logLlmCall: LlmCallLogger = async (row) => {
  try {
    await db.insert(llmCalls).values({
      task: row.task,
      provider: row.provider,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      grounded: row.grounded,
      latencyMs: Math.round(row.latencyMs),
      ok: row.ok,
      error: row.error?.slice(0, 2000) ?? null,
      companyId: row.companyId ?? null,
    });
  } catch (err) {
    // Logging must never break the pipeline.
    console.error('[llm-log] could not write llm_calls row:', err);
  }
};
