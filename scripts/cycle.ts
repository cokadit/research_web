// One discovery + enrich + score cycle, run inline without the queue.
// Usage: npm run cycle -- --limit 20 [--mock]
const args = process.argv.slice(2);
if (args.includes('--mock')) process.env.LLM_MODE = 'mock';
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 20;

async function main() {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive whole number');

  // Imported after LLM_MODE is set, because the environment is read once.
  const { env } = await import('../src/config/env');
  const { ENRICH_CONCURRENCY } = await import('../src/config/limits');
  const { closeDb, db } = await import('../src/db/client');
  const { companies } = await import('../src/db/schema');
  const { runDiscovery } = await import('../src/lib/discovery/run');
  const { enrichCompany } = await import('../src/lib/enrich/pipeline');
  const { shutdownRuntime } = await import('../src/lib/runtime');
  const { scoreCompany } = await import('../src/lib/scoring/service');
  const { inArray } = await import('drizzle-orm');

  try {
    console.log(`Cycle: ${limit} candidates, LLM_MODE=${env().LLM_MODE}`);
    const started = Date.now();

    const discovery = await runDiscovery({ target: limit });
    console.log(`Discovery: ${discovery.queries} queries, ${discovery.candidates} candidates, ${discovery.inserted.length} new domains`);
    for (const alert of discovery.alerts) console.log(`  ALERT: ${alert}`);
    for (const error of discovery.errors) console.log(`  error: ${error}`);

    const queue = [...discovery.inserted];
    const failures: string[] = [];
    const work = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          // First try fails fast on a step error, the second records it and carries on.
          const outcome = (await enrichCompany(c.id, { finalAttempt: false }).catch(() => enrichCompany(c.id, { finalAttempt: true })));
          if (outcome) await scoreCompany(c.id);
          console.log(`  done ${c.domain}`);
        } catch (err) {
          failures.push(`${c.domain}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: ENRICH_CONCURRENCY }, work));

    const ids = discovery.inserted.map((c) => c.id);
    const rows = ids.length ? await db.select({ domain: companies.domain, status: companies.status, failReasons: companies.failReasons }).from(companies).where(inArray(companies.id, ids)) : [];
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

    console.log(`\nResult after ${Math.round((Date.now() - started) / 1000)} s:`);
    for (const [status, n] of counts) console.log(`  ${status.padEnd(14)} ${n}`);

    const terminal = ['scored', 'not_qualified', 'auto_excluded'];
    const stuck = rows.filter((r) => !terminal.includes(r.status));
    const noReason = rows.filter((r) => r.status !== 'scored' && terminal.includes(r.status) && r.failReasons.length === 0);
    for (const f of failures) console.log(`  FAILED ${f}`);
    for (const r of stuck) console.log(`  STUCK ${r.domain} in status ${r.status}`);
    for (const r of noReason) console.log(`  NO REASON ${r.domain} is ${r.status} without a fail reason`);

    const ok = rows.length > 0 && stuck.length === 0 && noReason.length === 0 && failures.length === 0;
    console.log(ok ? `\nPASS: all ${rows.length} leads ended in scored, not_qualified or auto_excluded with reasons stored.` : '\nFAIL: see the lines above.');
    if (rows.length < limit) console.log(`Note: ${rows.length} new domains found, ${limit} requested.`);
    if (!ok) process.exitCode = 1;
  } finally {
    await shutdownRuntime();
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
