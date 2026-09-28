import { and, desc, eq, inArray } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { companies, scores } from '../../db/schema';
import { setState } from '../state';

import { pickQueue } from './pick-queue';

export async function buildQueue(): Promise<{ promoted: number; queued: number }> {
  // Promoted leads first. They do not count against the queue size.
  const promoted = await db
    .update(companies)
    .set({ status: 'in_review' })
    .where(and(eq(companies.promoted, true), eq(companies.status, 'not_qualified')))
    .returning({ id: companies.id });

  const ranked = await db
    .select({ id: companies.id, priority: scores.priority, fromExploration: companies.fromExploration })
    .from(companies)
    .innerJoin(scores, eq(scores.companyId, companies.id))
    .where(eq(companies.status, 'scored'))
    .orderBy(desc(scores.priority), companies.createdAt);

  const picked = pickQueue(ranked, env().DAILY_REVIEW_QUEUE_SIZE);
  if (picked.length > 0) {
    await db
      .update(companies)
      .set({ status: 'in_review' })
      .where(and(inArray(companies.id, picked.map((p) => p.id)), eq(companies.status, 'scored')));
  }
  // Drafts are generated here from Phase 2 on.
  await setState('queue_build_last_run', new Date().toISOString());
  return { promoted: promoted.length, queued: picked.length };
}
