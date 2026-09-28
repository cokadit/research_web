import { env } from '../../config/env';
import type { ProviderName, TaskName } from './types';

export interface Route {
  provider: Exclude<ProviderName, 'mock'>;
  /** Env var that holds the model ID. Model IDs are never written in code. */
  modelEnv: 'LLM_DISCOVERY_MODEL' | 'LLM_EXTRACT_MODEL' | 'LLM_VISION_MODEL' | 'LLM_EMBED_MODEL' | null;
  grounding: boolean;
}

export const ROUTES: Record<TaskName, Route> = {
  discover: { provider: 'gemini', modelEnv: 'LLM_DISCOVERY_MODEL', grounding: true },
  extract_contacts_fallback: { provider: 'gemini', modelEnv: 'LLM_EXTRACT_MODEL', grounding: false },
  classify: { provider: 'gemini', modelEnv: 'LLM_EXTRACT_MODEL', grounding: false },
  critique_design: { provider: 'gemini', modelEnv: 'LLM_VISION_MODEL', grounding: false },
  pay_signals: { provider: 'gemini', modelEnv: 'LLM_EXTRACT_MODEL', grounding: false },
  embed: { provider: 'gemini', modelEnv: 'LLM_EMBED_MODEL', grounding: false },
  propose_rules: { provider: 'gemini', modelEnv: 'LLM_DISCOVERY_MODEL', grounding: false },
  // Phase 2. The CLI picks the model from the logged-in subscription.
  draft_email: { provider: 'claude-cli', modelEnv: null, grounding: false },
};

export function routeFor(task: TaskName): Route {
  const route = ROUTES[task];
  if (task === 'draft_email' && env().DRAFT_PROVIDER === 'gemini') {
    return { provider: 'gemini', modelEnv: 'LLM_DISCOVERY_MODEL', grounding: false };
  }
  return route;
}

export function modelFor(task: TaskName): string {
  const route = routeFor(task);
  if (!route.modelEnv) return 'claude-cli-default';
  const model = env()[route.modelEnv];
  if (!model) throw new Error(`${route.modelEnv} is not set. It is needed for the "${task}" task.`);
  return model;
}
