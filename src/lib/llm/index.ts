import { env } from '../../config/env';
import { ClaudeCliProvider } from './claude-cli';
import { GeminiProvider } from './gemini';
import { MockProvider } from './mock';
import { routeFor } from './routing';
import type { LLMProvider, TaskName } from './types';

const providers: Partial<Record<LLMProvider['name'], LLMProvider>> = {};

function get(name: LLMProvider['name']): LLMProvider {
  providers[name] ??= name === 'gemini' ? new GeminiProvider() : name === 'claude-cli' ? new ClaudeCliProvider() : new MockProvider();
  return providers[name];
}

/** The provider for a task. LLM_MODE=mock overrides routing for every task. */
export function llmFor(task: TaskName): LLMProvider {
  if (env().LLM_MODE === 'mock') return get('mock');
  return get(routeFor(task).provider);
}

export * from './types';
export { claudeHealth } from './claude-cli';
