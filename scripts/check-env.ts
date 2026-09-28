import { loadEnv } from '../src/config/env';
import { claudeHealth } from '../src/lib/llm/claude-cli';

async function main() {
  const e = loadEnv();
  const problems: string[] = [];
  const warn: string[] = [];

  if (!e.DASHBOARD_PASSWORD) problems.push('DASHBOARD_PASSWORD is empty. The dashboard refuses every login until it is set.');
  if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be at least 32 characters.');
  if (e.LLM_MODE === 'live') {
    if (!e.GEMINI_API_KEY) problems.push('GEMINI_API_KEY is empty (needed when LLM_MODE=live).');
    if (!e.PAGESPEED_API_KEY) problems.push('PAGESPEED_API_KEY is empty (needed when LLM_MODE=live).');
    for (const key of ['LLM_DISCOVERY_MODEL', 'LLM_EXTRACT_MODEL', 'LLM_VISION_MODEL'] as const) if (!e[key]) problems.push(`${key} is empty.`);
    if (/set CRAWLER_USER_AGENT/.test(e.CRAWLER_USER_AGENT)) problems.push('CRAWLER_USER_AGENT still has the placeholder. Put a contact URL or email in it.');
  }
  if (e.PLACES_ENABLED && !e.GOOGLE_PLACES_API_KEY) problems.push('PLACES_ENABLED=true but GOOGLE_PLACES_API_KEY is empty.');
  if (e.SEND_ENABLED) problems.push('SEND_ENABLED must stay false until Phase 3 is approved.');
  if (!e.LLM_EMBED_MODEL) warn.push('LLM_EMBED_MODEL is empty. Fine for Phase 1, needed in Phase 2.');

  const claude = await claudeHealth();
  console.log(`LLM_MODE:        ${e.LLM_MODE}`);
  console.log(`Places:          ${e.PLACES_ENABLED ? `on, cap ${e.PLACES_MONTHLY_CAP}/month` : 'off'}`);
  console.log(`Claude CLI:      ${claude.authMode} (${claude.detail})`);
  if (claude.apiKeyInParentEnv) warn.push('ANTHROPIC_API_KEY is set in this shell. It is stripped before `claude` is spawned, but remove it to be safe.');
  if (!claude.ok) warn.push('Claude CLI is not on a claude.ai subscription login. Needed from Phase 2.');

  for (const w of warn) console.log(`WARN  ${w}`);
  for (const p of problems) console.log(`ERROR ${p}`);
  console.log(problems.length ? `\n${problems.length} problem(s).` : '\nEnvironment OK.');
  if (problems.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
