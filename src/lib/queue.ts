import { PgBoss } from 'pg-boss';
import { env } from '../config/env';

// pg-boss allows letters, digits, underscores, hyphens, periods and slashes in queue names. Colons are rejected.
export const QUEUES = {
  discoverDaily: 'discover.daily',
  enrichCompany: 'enrich.company',
  scoreCompany: 'score.company',
  queueBuild: 'queue.build',
} as const;

export const ENRICH_RETRY_LIMIT = 2;

export interface CompanyJob {
  companyId: string;
}

const globalForBoss = globalThis as unknown as { __boss?: Promise<PgBoss> };

async function start(role: 'worker' | 'client'): Promise<PgBoss> {
  // The dashboard only sends jobs. Scheduling and maintenance belong to the worker.
  const instance = new PgBoss({ connectionString: env().DATABASE_URL, schema: 'pgboss', ...(role === 'client' ? { schedule: false, supervise: false, max: 2 } : {}) });
  instance.on('error', (err) => console.error('[pg-boss]', err));
  await instance.start();

  const existing = new Set((await instance.getQueues()).map((q) => q.name));
  const ensure = async (name: string, options: Parameters<PgBoss['createQueue']>[1]) => {
    if (!existing.has(name)) await instance.createQueue(name, options);
  };
  await ensure(QUEUES.discoverDaily, { retryLimit: 1, retryDelay: 300, expireInSeconds: 4 * 60 * 60 });
  await ensure(QUEUES.enrichCompany, { retryLimit: ENRICH_RETRY_LIMIT, retryDelay: 60, retryBackoff: true, expireInSeconds: 15 * 60 });
  await ensure(QUEUES.scoreCompany, { retryLimit: 3, retryDelay: 10, expireInSeconds: 5 * 60 });
  await ensure(QUEUES.queueBuild, { retryLimit: 2, retryDelay: 60, expireInSeconds: 15 * 60 });
  return instance;
}

export function getBoss(role: 'worker' | 'client' = 'client'): Promise<PgBoss> {
  globalForBoss.__boss ??= start(role).catch((err) => {
    globalForBoss.__boss = undefined;
    throw err;
  });
  return globalForBoss.__boss;
}

export async function enqueueEnrich(companyId: string): Promise<void> {
  const data: CompanyJob = { companyId };
  await (await getBoss()).send(QUEUES.enrichCompany, data, { singletonKey: `enrich-${companyId}` });
}

export async function enqueueScore(companyId: string): Promise<void> {
  const data: CompanyJob = { companyId };
  await (await getBoss()).send(QUEUES.scoreCompany, data);
}

export async function stopBoss(): Promise<void> {
  const boss = globalForBoss.__boss;
  globalForBoss.__boss = undefined;
  if (boss) await (await boss).stop({ graceful: true, timeout: 30_000 });
}
