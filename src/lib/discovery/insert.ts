import { inArray, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { companies, suppression } from '../../db/schema';
import { regionForCountry, timezoneForCountry } from '../compliance/geo';
import { normaliseCountry, regimeForCountry } from '../compliance/regimes';
import type { Segment, Source } from '../types';
import { normaliseCandidate } from './domain';

export interface Candidate {
  name: string | null;
  websiteUrl: string;
  segment: Segment;
  country?: string | null;
  city?: string | null;
  whyCandidate?: string | null;
  notes?: string | null;
  placeId?: string | null;
}

export interface InsertContext {
  source: Source;
  queryId?: string | null;
  fromExploration?: boolean;
  /** Manual entries may sit on Instagram or a marketplace. Discovered ones may not. */
  allowNoCrawl?: boolean;
}

export interface InsertResult {
  inserted: { id: string; domain: string }[];
  skipped: { input: string; reason: 'invalid_url' | 'no_crawl_host' | 'duplicate_in_batch' | 'already_known' | 'suppressed' }[];
}

/** Section 7.1: normalise domain → drop if known or suppressed → insert with status=new. */
export async function insertCandidates(candidates: Candidate[], ctx: InsertContext): Promise<InsertResult> {
  const result: InsertResult = { inserted: [], skipped: [] };
  const batch = new Map<string, { candidate: Candidate; registrable: string; noCrawl: boolean }>();

  for (const candidate of candidates) {
    const norm = normaliseCandidate(candidate.websiteUrl);
    if (!norm) {
      result.skipped.push({ input: candidate.websiteUrl, reason: 'invalid_url' });
    } else if (norm.noCrawl && !ctx.allowNoCrawl) {
      result.skipped.push({ input: candidate.websiteUrl, reason: 'no_crawl_host' });
    } else if (batch.has(norm.domain)) {
      result.skipped.push({ input: candidate.websiteUrl, reason: 'duplicate_in_batch' });
    } else {
      batch.set(norm.domain, { candidate, registrable: norm.registrable, noCrawl: norm.noCrawl });
    }
  }
  if (batch.size === 0) return result;

  const domains = [...batch.keys()];
  const registrables = [...new Set([...batch.values()].filter((b) => !b.noCrawl).map((b) => b.registrable))];

  const known = await db.select({ domain: companies.domain }).from(companies).where(inArray(companies.domain, domains));
  const suppressed = await db
    .select({ domain: suppression.domain })
    .from(suppression)
    .where(or(inArray(suppression.domain, domains), registrables.length ? inArray(suppression.domain, registrables) : undefined));

  const knownSet = new Set(known.map((k) => k.domain));
  const suppressedSet = new Set(suppressed.map((s) => s.domain));

  for (const [domain, { candidate, registrable, noCrawl }] of batch) {
    if (knownSet.has(domain)) {
      result.skipped.push({ input: candidate.websiteUrl, reason: 'already_known' });
      continue;
    }
    if (suppressedSet.has(domain) || (!noCrawl && suppressedSet.has(registrable))) {
      result.skipped.push({ input: candidate.websiteUrl, reason: 'suppressed' });
      continue;
    }
    const country = normaliseCountry(candidate.country);
    const [row] = await db
      .insert(companies)
      .values({
        domain,
        name: candidate.name,
        segment: candidate.segment,
        country,
        city: candidate.city ?? null,
        region: regionForCountry(country),
        timezone: timezoneForCountry(country, candidate.city),
        complianceRegime: regimeForCountry(country),
        status: 'new',
        source: ctx.source,
        queryId: ctx.queryId ?? null,
        placeId: candidate.placeId ?? null,
        notes: candidate.notes ?? null,
        whyCandidate: candidate.whyCandidate ?? null,
        noCrawl,
        fromExploration: ctx.fromExploration ?? false,
      })
      // Two discovery jobs can find the same brand at the same moment.
      .onConflictDoNothing({ target: companies.domain })
      .returning({ id: companies.id, domain: companies.domain });
    if (row) result.inserted.push(row);
    else result.skipped.push({ input: candidate.websiteUrl, reason: 'already_known' });
  }
  return result;
}
