import { spawn } from 'node:child_process';
import { z, type ZodType } from 'zod';
import { env } from '../../config/env';
import { CLAUDE_CLI_TIMEOUT_MS } from '../../config/limits';
import { logLlmCall, type LlmCallLogger } from './log';
import { LLMDeferredError, type LLMCallOptions, type LLMInput, type LLMProvider, type LLMResult, type RawCompletion, type TaskName } from './types';
import { validatedCall } from './validate';

// Flags and field names verified 2026-09-28 against Claude Code 2.1.283 (`claude --help`, `claude auth status`).
// TODO(verify): the JSON envelope was read from the CLI's schema, not from a live run. Confirm with one real call in Phase 2.
const envelopeSchema = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  errors: z.array(z.string()).optional(),
  usage: z.looseObject({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

const authStatusSchema = z.looseObject({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  subscriptionType: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const USAGE_LIMIT = /you've hit your .*limit|usage limit|rate.?limit|temporarily limiting requests/i;
// TODO(verify): how far ahead to retry when the CLI gives no reset time. Session limits reset within 5 hours.
const DEFAULT_DEFER_MS = 60 * 60 * 1000;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** The child never sees ANTHROPIC_API_KEY, so the CLI bills the subscription, not the API. */
export function childEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...source };
  delete copy.ANTHROPIC_API_KEY;
  delete copy.ANTHROPIC_AUTH_TOKEN;
  return copy;
}

function run(args: string[], stdin: string | null, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // No shell: arguments are passed as an array. On Windows set CLAUDE_BIN to the full path of claude.exe.
    const child = spawn(env().CLAUDE_BIN, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${timeoutMs / 1000} s`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start "${env().CLAUDE_BIN}": ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin ?? '');
  });
}

export interface ClaudeHealth {
  ok: boolean;
  authMode: 'subscription' | 'api_key' | 'not_logged_in' | 'unknown';
  detail: string;
  apiKeyInParentEnv: boolean;
}

/** Runs `claude auth status`. Sends no prompt and uses no quota. */
export async function claudeHealth(): Promise<ClaudeHealth> {
  const apiKeyInParentEnv = Boolean(process.env.ANTHROPIC_API_KEY);
  try {
    const res = await run(['auth', 'status'], null, 15_000);
    const parsed = authStatusSchema.safeParse(JSON.parse(res.stdout));
    if (!parsed.success) return { ok: false, authMode: 'unknown', detail: 'unexpected output from `claude auth status`', apiKeyInParentEnv };
    const s = parsed.data;
    if (!s.loggedIn) return { ok: false, authMode: 'not_logged_in', detail: 'Claude Code is not logged in. Run `claude` and sign in with the Max account.', apiKeyInParentEnv };
    const subscription = s.authMethod === 'claude.ai';
    return {
      ok: subscription,
      authMode: subscription ? 'subscription' : 'api_key',
      detail: subscription ? `claude.ai login (${s.subscriptionType ?? 'plan unknown'})` : `auth method "${s.authMethod}" is not a claude.ai subscription`,
      apiKeyInParentEnv,
    };
  } catch (err) {
    return { ok: false, authMode: 'unknown', detail: err instanceof Error ? err.message : String(err), apiKeyInParentEnv };
  }
}

/** One prompt at a time. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

export class ClaudeCliProvider implements LLMProvider {
  readonly name = 'claude-cli' as const;

  constructor(private readonly log: LlmCallLogger = logLlmCall) {}

  private async complete(input: LLMInput): Promise<RawCompletion> {
    if (input.images?.length) throw new Error('ClaudeCliProvider does not accept images');
    const args = ['-p', '--output-format', 'json', '--tools', '', '--max-turns', '1', '--no-session-persistence', '--system-prompt', input.system];
    const res = await serial(() => run(args, input.user, CLAUDE_CLI_TIMEOUT_MS));

    let envelope: z.infer<typeof envelopeSchema> | null = null;
    try {
      envelope = envelopeSchema.parse(JSON.parse(res.stdout));
    } catch {
      envelope = null;
    }

    const failureText = [envelope?.result, ...(envelope?.errors ?? []), res.stderr].filter(Boolean).join(' ');
    const failed = res.code !== 0 || !envelope || envelope.is_error;
    if (failed && USAGE_LIMIT.test(failureText)) {
      throw new LLMDeferredError(`Claude usage limit reached: ${failureText.slice(0, 300)}`, new Date(Date.now() + DEFAULT_DEFER_MS));
    }
    if (failed || !envelope?.result) {
      throw new Error(`claude exited with code ${res.code}: ${failureText.slice(0, 500) || 'no output'}`);
    }

    return {
      text: envelope.result,
      model: Object.keys(envelope.modelUsage ?? {})[0] ?? 'claude-cli-default',
      tokensIn: envelope.usage?.input_tokens ?? null,
      tokensOut: envelope.usage?.output_tokens ?? null,
    };
  }

  async json<T>(task: TaskName, input: LLMInput, schema: ZodType<T>, opts?: LLMCallOptions): Promise<LLMResult<T>> {
    return validatedCall({ task, provider: this.name, model: 'claude-cli-default', input, schema, opts, log: this.log, complete: (i) => this.complete(i) });
  }

  async embed(): Promise<number[][]> {
    throw new Error('ClaudeCliProvider does not provide embeddings');
  }
}
