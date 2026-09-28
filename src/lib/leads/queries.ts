import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { SCHEDULE_TZ } from '../../config/limits';
import { db } from '../../db/client';
import { apiCalls, companies, contacts, labels, llmCalls, scores, signals } from '../../db/schema';
import { SEGMENTS, SOURCES, type CompanyStatus, type Segment, type Source } from '../types';

export const TABS = {
  qualified: { status: 'scored', label: 'Qualified' },
  not_qualified: { status: 'not_qualified', label: 'Not qualified' },
  auto_excluded: { status: 'auto_excluded', label: 'Auto-excluded' },
} as const satisfies Record<string, { status: CompanyStatus; label: string }>;
export type TabKey = keyof typeof TABS;

export const PAGE_SIZE = 50;

export interface LeadFilters {
  tab: TabKey;
  country?: string;
  region?: string;
  segment?: Segment;
  source?: Source;
  failCode?: string;
  minScore?: number;
  q?: string;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function parseFilters(params: Params): LeadFilters {
  const tab = one(params.tab);
  const segment = one(params.segment);
  const source = one(params.source);
  const min = Number(one(params.min));
  const page = Number(one(params.page));
  return {
    tab: tab && tab in TABS ? (tab as TabKey) : 'qualified',
    country: one(params.country)?.toUpperCase().slice(0, 2),
    region: one(params.region),
    segment: (SEGMENTS as readonly string[]).includes(segment ?? '') ? (segment as Segment) : undefined,
    source: (SOURCES as readonly string[]).includes(source ?? '') ? (source as Source) : undefined,
    failCode: one(params.fail),
    minScore: Number.isFinite(min) && min > 0 ? Math.min(100, Math.round(min)) : undefined,
    q: one(params.q)?.slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function where(f: LeadFilters): SQL | undefined {
  const parts: (SQL | undefined)[] = [eq(companies.status, TABS[f.tab].status)];
  if (f.country) parts.push(eq(companies.country, f.country));
  if (f.region) parts.push(eq(companies.region, f.region));
  if (f.segment) parts.push(eq(companies.segment, f.segment));
  if (f.source) parts.push(eq(companies.source, f.source));
  if (f.minScore) parts.push(gte(scores.priority, f.minScore));
  if (f.failCode) parts.push(sql`${companies.failReasons} @> ${JSON.stringify([{ code: f.failCode }])}::jsonb`);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`;
    parts.push(or(ilike(companies.name, like), ilike(companies.domain, like)));
  }
  return and(...parts);
}

const latestSignal = (column: SQL) => sql`(select ${column} from ${signals} s where s.company_id = ${companies.id} order by s.fetched_at desc limit 1)`;

export async function listLeads(f: LeadFilters) {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      segment: companies.segment,
      country: companies.country,
      region: companies.region,
      source: companies.source,
      failReasons: companies.failReasons,
      createdAt: companies.createdAt,
      priority: scores.priority,
      need: scores.need,
      pay: scores.pay,
      contact: scores.contact,
      fit: scores.fit,
      platform: latestSignal(sql`s.platform`).mapWith(String).as('platform'),
      psiMobile: latestSignal(sql`s.psi_mobile`).mapWith(Number).as('psi_mobile'),
      bestContactType: sql<string | null>`(select k.contact_type::text from ${contacts} k where k.company_id = ${companies.id} order by k.is_primary desc, k.created_at asc limit 1)`.as('best_contact_type'),
    })
    .from(companies)
    .leftJoin(scores, eq(scores.companyId, companies.id))
    .where(where(f))
    .orderBy(sql`${scores.priority} desc nulls last`, asc(companies.createdAt))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(companies)
    .leftJoin(scores, eq(scores.companyId, companies.id))
    .where(where(f));

  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type LeadRow = Awaited<ReturnType<typeof listLeads>>['rows'][number];

/** Totals per tab, and how many of them were discovered today (Bali time). */
export async function tabCounts(): Promise<Record<TabKey, { total: number; today: number }>> {
  const today = sql`${companies.createdAt} >= date_trunc('day', now() at time zone ${SCHEDULE_TZ}) at time zone ${SCHEDULE_TZ}`;
  const rows = await db
    .select({ status: companies.status, total: sql<number>`count(*)::int`, today: sql<number>`(count(*) filter (where ${today}))::int` })
    .from(companies)
    .groupBy(companies.status);
  const out = { qualified: { total: 0, today: 0 }, not_qualified: { total: 0, today: 0 }, auto_excluded: { total: 0, today: 0 } };
  for (const [key, tab] of Object.entries(TABS) as [TabKey, (typeof TABS)[TabKey]][]) {
    const row = rows.find((r) => r.status === tab.status);
    if (row) out[key] = { total: row.total, today: row.today };
  }
  return out;
}

export async function filterOptions(tab: TabKey) {
  const status = TABS[tab].status;
  const [countries, regions, codes] = await Promise.all([
    db.selectDistinct({ v: companies.country }).from(companies).where(eq(companies.status, status)).orderBy(asc(companies.country)),
    db.selectDistinct({ v: companies.region }).from(companies).where(eq(companies.status, status)).orderBy(asc(companies.region)),
    db.execute<{ code: string }>(sql`select distinct x->>'code' as code from ${companies}, jsonb_array_elements(${companies.failReasons}) x where ${companies.status} = ${status} order by 1`),
  ]);
  return {
    countries: countries.map((c) => c.v).filter((v): v is string => Boolean(v)),
    regions: regions.map((r) => r.v).filter((v): v is string => Boolean(v)),
    failCodes: [...codes].map((c) => c.code),
  };
}

export async function getCompanyDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return null;
  const [[signal], [score], companyContacts, companyLabels] = await Promise.all([
    db.select().from(signals).where(eq(signals.companyId, id)).orderBy(desc(signals.fetchedAt)).limit(1),
    db.select().from(scores).where(eq(scores.companyId, id)),
    db.select().from(contacts).where(eq(contacts.companyId, id)).orderBy(desc(contacts.isPrimary), asc(contacts.createdAt)),
    db.select().from(labels).where(eq(labels.companyId, id)).orderBy(desc(labels.createdAt)),
  ]);
  return { company, signal: signal ?? null, score: score ?? null, contacts: companyContacts, labels: companyLabels };
}

export async function usageToday() {
  const since = sql`date_trunc('day', now() at time zone ${SCHEDULE_TZ}) at time zone ${SCHEDULE_TZ}`;
  const [llm, api] = await Promise.all([
    db
      .select({
        provider: llmCalls.provider,
        model: llmCalls.model,
        task: llmCalls.task,
        calls: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where not ${llmCalls.ok}))::int`,
        grounded: sql<number>`(count(*) filter (where ${llmCalls.grounded}))::int`,
        tokensIn: sql<number>`coalesce(sum(${llmCalls.tokensIn}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${llmCalls.tokensOut}), 0)::int`,
        avgMs: sql<number>`coalesce(avg(${llmCalls.latencyMs}), 0)::int`,
      })
      .from(llmCalls)
      .where(sql`${llmCalls.createdAt} >= ${since}`)
      .groupBy(llmCalls.provider, llmCalls.model, llmCalls.task)
      .orderBy(llmCalls.provider, llmCalls.model, llmCalls.task),
    db
      .select({
        api: apiCalls.api,
        sku: apiCalls.sku,
        today: sql<number>`(count(*) filter (where ${apiCalls.createdAt} >= ${since}))::int`,
        month: sql<number>`count(*)::int`,
        failedToday: sql<number>`(count(*) filter (where not ${apiCalls.ok} and ${apiCalls.createdAt} >= ${since}))::int`,
      })
      .from(apiCalls)
      .where(sql`${apiCalls.createdAt} >= date_trunc('month', now())`)
      .groupBy(apiCalls.api, apiCalls.sku)
      .orderBy(apiCalls.api),
  ]);
  return { llm, api };
}
