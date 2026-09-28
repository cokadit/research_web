import { ENRICH_CONCURRENCY, SCHEDULES, SCHEDULE_TZ } from '../src/config/limits';
import { env } from '../src/config/env';
import { closeDb } from '../src/db/client';
import { runDiscovery } from '../src/lib/discovery/run';
import { enrichCompany } from '../src/lib/enrich/pipeline';
import { buildQueue } from '../src/lib/leads/queue-build';
import { claudeHealth } from '../src/lib/llm';
import { shutdownRuntime } from '../src/lib/runtime';
import { scoreCompany } from '../src/lib/scoring/service';
import { ENRICH_RETRY_LIMIT, QUEUES, enqueueEnrich, enqueueScore, getBoss, stopBoss, type CompanyJob } from '../src/lib/queue';

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

async function main() {
  const e = env();
  log(`[worker] starting. LLM_MODE=${e.LLM_MODE}, PLACES_ENABLED=${e.PLACES_ENABLED}, SEND_ENABLED=${e.SEND_ENABLED}`);

  // Claude must run on the Max subscription. The key is removed from every child process either way.
  const health = await claudeHealth();
  log(`[worker] Claude CLI auth mode: ${health.authMode} (${health.detail})`);
  if (health.apiKeyInParentEnv) log('[worker] WARNING: ANTHROPIC_API_KEY is set in this environment. It is stripped before `claude` is spawned.');

  const boss = await getBoss('worker');

  await boss.work(QUEUES.discoverDaily, async () => {
    const report = await runDiscovery();
    for (const c of report.inserted) await enqueueEnrich(c.id);
    log(`[discover] ${report.queries} queries, ${report.candidates} candidates, ${report.inserted.length} new domains`);
    for (const alert of report.alerts) log(`[discover] ALERT: ${alert}`);
    for (const error of report.errors) log(`[discover] error: ${error}`);
  });

  await boss.work<CompanyJob>(QUEUES.enrichCompany, { batchSize: 1, localConcurrency: ENRICH_CONCURRENCY }, async ([job]) => {
    const outcome = await enrichCompany(job.data.companyId, { finalAttempt: job.retryCount >= ENRICH_RETRY_LIMIT });
    if (!outcome) return;
    await enqueueScore(outcome.companyId);
    log(`[enrich] ${outcome.domain}${outcome.stepErrors.length ? ` (${outcome.stepErrors.length} step error(s))` : ''}`);
  });

  await boss.work<CompanyJob>(QUEUES.scoreCompany, { batchSize: 1, localConcurrency: 2 }, async ([job]) => {
    const outcome = await scoreCompany(job.data.companyId);
    if (outcome) log(`[score] ${outcome.companyId} → ${outcome.status}, priority ${outcome.priority}`);
  });

  await boss.work(QUEUES.queueBuild, async () => {
    const result = await buildQueue();
    log(`[queue] ${result.promoted} promoted, ${result.queued} queued for review`);
  });

  await boss.schedule(QUEUES.discoverDaily, SCHEDULES.discoverDaily, {}, { tz: SCHEDULE_TZ });
  await boss.schedule(QUEUES.queueBuild, SCHEDULES.queueBuild, {}, { tz: SCHEDULE_TZ });
  log(`[worker] ready. discover ${SCHEDULES.discoverDaily}, queue build ${SCHEDULES.queueBuild} (${SCHEDULE_TZ})`);
}

async function shutdown(signal: string) {
  log(`[worker] ${signal} received, stopping`);
  await stopBoss().catch(() => {});
  await shutdownRuntime().catch(() => {});
  await closeDb().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  console.error('[worker] failed to start:', err);
  process.exit(1);
});
