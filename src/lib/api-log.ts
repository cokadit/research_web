import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { apiCalls } from '../db/schema';

export async function logApiCall(row: { api: string; sku?: string; ok: boolean; latencyMs: number; error?: string }): Promise<void> {
  try {
    await db.insert(apiCalls).values({ api: row.api, sku: row.sku ?? null, ok: row.ok, latencyMs: Math.round(row.latencyMs), error: row.error?.slice(0, 2000) ?? null });
  } catch (err) {
    // Logging must never break the pipeline.
    console.error('[api-log] could not write api_calls row:', err);
  }
}

/** Calls to one API since the start of the current UTC month. Failed calls count too, they may still be billed. */
export async function callsThisMonth(api: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(apiCalls)
    .where(and(eq(apiCalls.api, api), gte(apiCalls.createdAt, monthStart)));
  return row?.n ?? 0;
}
