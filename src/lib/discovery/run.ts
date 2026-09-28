import { eq, sql } from 'drizzle-orm';
import { env } from '../../config/env';
import { CRAWL, DISCOVERY_MAX_RESULTS_PER_QUERY } from '../../config/limits';
import { db } from '../../db/client';
import { queryRuns, queryTemplates } from '../../db/schema';
import { politeness } from '../enrich/politeness';
import { isAllowedByRobots } from '../enrich/robots';
import { llmFor } from '../llm';
import { DISCOVER_SYSTEM, discoverSchema, discoverUser } from '../llm/prompts/discover';
import type { Segment } from '../types';
import { isNoCrawlHost, normaliseDomain } from './domain';
import { insertCandidates, type Candidate } from './insert';
import { PlacesCapReached, PlacesDisabled, searchPlaces } from './places';
import { planQueries, type PlannableTemplate } from './plan';
import { pickValues, renderTemplate } from './templates';

export interface DiscoveryReport {
  queries: number;
  candidates: number;
  inserted: { id: string; domain: string }[];
  errors: string[];
  alerts: string[];
}

interface TemplateRow extends PlannableTemplate {
  template: string;
  params: Record<string, string[]>;
  kind: 'grounding' | 'places';
}

// Templates written for Places carry this marker in params, so one table holds both kinds.
export const PLACES_MARKER = '__places';

async function loadTemplates(): Promise<TemplateRow[]> {
  const rows = await db
    .select({
      id: queryTemplates.id,
      segment: queryTemplates.segment,
      template: queryTemplates.template,
      params: queryTemplates.params,
      isExploration: queryTemplates.isExploration,
      runs: sql<number>`(select count(*)::int from ${queryRuns} where ${queryRuns.templateId} = ${queryTemplates.id})`,
    })
    .from(queryTemplates)
    .where(eq(queryTemplates.active, true));
  return rows.map((r) => ({ ...r, kind: PLACES_MARKER in r.params ? 'places' : 'grounding' }));
}

async function groundedQuery(query: string, segment: Segment): Promise<{ candidates: Candidate[]; sources: { uri: string; title: string | null }[] }> {
  const { data, sources } = await llmFor('discover').json('discover', { system: DISCOVER_SYSTEM, user: discoverUser(query, segment) }, discoverSchema, { grounding: true });
  const candidates = data.slice(0, DISCOVERY_MAX_RESULTS_PER_QUERY).map((d) => ({
    name: d.brand_name,
    websiteUrl: d.website_url,
    segment,
    country: d.country ?? null,
    city: d.city ?? null,
    whyCandidate: d.why_candidate || null,
  }));
  return { candidates, sources: sources ?? [] };
}

/**
 * Follows the Places website link once to learn the site's own domain.
 * The link itself and every other Places field are dropped; only place_id is kept.
 */
async function domainFromSite(transientUrl: string): Promise<string | null> {
  const first = normaliseDomain(transientUrl);
  if (!first || isNoCrawlHost(first)) return null;
  try {
    const home = `https://${first}/`;
    if (!(await isAllowedByRobots(home))) return null;
    const res = await politeness.run(first, () =>
      fetch(home, { headers: { 'user-agent': env().CRAWLER_USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(CRAWL.timeoutMs) }),
    );
    await res.body?.cancel().catch(() => {});
    const final = normaliseDomain(res.url);
    return final && !isNoCrawlHost(final) ? final : null;
  } catch {
    return null;
  }
}

async function placesQuery(query: string, segment: Segment): Promise<Candidate[]> {
  const places = await searchPlaces(query);
  const candidates: Candidate[] = [];
  for (const place of places) {
    if (!place.transientWebsiteUri) continue;
    const domain = await domainFromSite(place.transientWebsiteUri);
    if (domain) candidates.push({ name: null, websiteUrl: `https://${domain}/`, segment, placeId: place.placeId });
  }
  return candidates;
}

/** Runs queries until `target` new domains are inserted or the query budget is spent. */
export async function runDiscovery(opts: { target?: number; random?: () => number } = {}): Promise<DiscoveryReport> {
  const target = opts.target ?? env().DAILY_CANDIDATE_TARGET;
  const report: DiscoveryReport = { queries: 0, candidates: 0, inserted: [], errors: [], alerts: [] };

  const all = await loadTemplates();
  const placesOn = env().PLACES_ENABLED && Boolean(env().GOOGLE_PLACES_API_KEY) && env().LLM_MODE === 'live';
  let templates = all.filter((t) => t.kind === 'grounding' || placesOn);
  if (templates.length === 0) {
    report.errors.push('No active query templates. Run `npm run db:seed`.');
    return report;
  }
  const byId = new Map(templates.map((t) => [t.id, t]));

  // A query yields a handful of new domains at best. Plan in rounds and stop early once the target is met.
  const maxQueries = Math.max(3, target);
  for (let round = 0; round < 4 && report.inserted.length < target && report.queries < maxQueries; round++) {
    const remaining = target - report.inserted.length;
    const batch = Math.min(maxQueries - report.queries, Math.max(templates.length >= 3 ? 3 : 1, Math.ceil(remaining / 4)));
    const plan = planQueries(templates, batch, env().EXPLORATION_SHARE);

    for (const planned of plan) {
      if (report.inserted.length >= target) break;
      const t = byId.get(planned.templateId);
      if (!t) continue;
      const params = Object.fromEntries(Object.entries(t.params).filter(([key]) => key !== PLACES_MARKER));
      const rendered = renderTemplate(t.template, pickValues(t.template, params, opts.random));
      report.queries++;

      let candidates: Candidate[] = [];
      let sources: { uri: string; title: string | null }[] = [];
      let error: string | null = null;
      try {
        if (t.kind === 'places') candidates = await placesQuery(rendered, t.segment);
        else ({ candidates, sources } = await groundedQuery(rendered, t.segment));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        if (err instanceof PlacesCapReached || err instanceof PlacesDisabled) {
          report.alerts.push(error);
          templates = templates.filter((x) => x.kind !== 'places');
        } else {
          report.errors.push(`"${rendered}": ${error}`);
        }
      }

      const [run] = await db
        .insert(queryRuns)
        .values({ templateId: t.id, renderedQuery: rendered, source: t.kind === 'places' ? 'places' : 'grounding', candidates: candidates.length, groundingSources: sources, error })
        .returning({ id: queryRuns.id });

      t.runs++;
      if (candidates.length === 0) continue;

      const room = target - report.inserted.length;
      const result = await insertCandidates(candidates.slice(0, Math.max(room, 0)), {
        source: t.kind === 'places' ? 'places' : 'grounding',
        queryId: run.id,
        fromExploration: planned.exploration,
      });
      report.candidates += candidates.length;
      report.inserted.push(...result.inserted);
      await db.update(queryRuns).set({ newDomains: result.inserted.length }).where(eq(queryRuns.id, run.id));
    }
    if (templates.length === 0) break;
  }
  return report;
}
