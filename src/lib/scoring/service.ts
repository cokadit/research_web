import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companies, contacts, portfolioItems, queryRuns, rules, scores, signals } from '../../db/schema';
import { rulesVersion } from '../state';
import { TIER1_CODES, type CompanyStatus, type FailReason } from '../types';
import { bestContact } from './contact';
import { failedRules } from './rules';
import { computeScore } from './score';
import { decideTier } from './tiers';

// Scoring only moves leads that are still inside the pipeline. A lead I reviewed keeps its status.
const PIPELINE_STATUSES: CompanyStatus[] = ['new', 'enriching', 'enriched', 'scored', 'not_qualified', 'auto_excluded'];
// Statuses that count as "passed the filters" for query_runs.passed_filters.
const PASSED: CompanyStatus[] = ['scored', 'in_review', 'approved', 'drafted', 'sent', 'replied', 'meeting', 'won', 'lost', 'rejected'];

const PRE_CODES = new Set<string>(['major_brand', 'suppressed', 'dead_site', 'parked_site', 'duplicate', 'marketplace_only', 'robots_blocked', 'wrong_segment', 'enrich_incomplete']);

export interface ScoreOutcome {
  companyId: string;
  status: CompanyStatus;
  priority: number;
  failReasons: FailReason[];
}

export async function scoreCompany(companyId: string): Promise<ScoreOutcome | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) return null;

  const [signal] = await db.select().from(signals).where(eq(signals.companyId, companyId)).orderBy(desc(signals.fetchedAt)).limit(1);
  const companyContacts = await db.select().from(contacts).where(eq(contacts.companyId, companyId));
  const portfolio = await db.select({ segments: portfolioItems.segments, active: portfolioItems.active }).from(portfolioItems);
  const approvedRules = await db.select().from(rules).where(eq(rules.status, 'approved'));

  const scorable = companyContacts.map((c) => ({ id: c.id, email: c.email, contactType: c.contactType, role: c.role, mxOk: c.mxOk }));
  const result = computeScore({
    segment: company.segment,
    need: {
      psiMobile: signal?.psiMobile ?? null,
      designAge: signal?.aiDesignCritique?.design_age ?? null,
      weaknesses: signal?.weaknesses ?? [],
      sellsAbroad: signal?.sellsAbroad ?? false,
    },
    paySignals: signal?.paySignals ?? null,
    contacts: scorable,
    portfolio,
  });

  const best = bestContact(scorable);
  const failed = failedRules(
    approvedRules.map((r) => ({ id: r.id, segment: r.segment, ruleText: r.ruleText, ruleJson: r.ruleJson })),
    {
      segment: company.segment,
      sub_category: company.subCategory,
      country: company.country,
      region: company.region,
      language: company.language,
      platform: signal?.platform ?? null,
      source: company.source,
      psi_mobile: signal?.psiMobile ?? null,
      psi_desktop: signal?.psiDesktop ?? null,
      design_age: signal?.aiDesignCritique?.design_age ?? null,
      need: result.need,
      pay: result.pay,
      contact: result.contact,
      fit: result.fit,
      priority: result.priority,
      best_contact_type: best?.contactType ?? null,
      price_level: signal?.paySignals?.price_level ?? null,
    },
  );

  // Reasons found during enrichment are kept. Codes scoring owns are recomputed every time.
  const pre = company.failReasons.filter((r) => PRE_CODES.has(r.code));
  const find = (code: string) => pre.find((r) => r.code === code) ?? null;
  const siteFailure = find('dead_site') ?? find('parked_site');

  const decision = decideTier({
    blocklisted: find('major_brand')?.detail.replace(/^on blocklist: /, '') ?? null,
    majorBrand: signal?.majorBrand ?? null,
    siteFailure: siteFailure ? { code: siteFailure.code as 'dead_site' | 'parked_site', detail: siteFailure.detail } : null,
    duplicateOf: find('duplicate')?.detail ?? null,
    suppressed: find('suppressed')?.detail ?? null,
    marketplaceOnly: find('marketplace_only')?.detail ?? null,
    agencyGrade: signal?.aiDesignCritique?.agency_grade ?? null,
    psiMobile: signal?.psiMobile ?? null,
    hasUsableEmail: companyContacts.some((c) => c.email && c.mxOk),
    hasForm: Boolean(signal?.hasContactForm) || companyContacts.some((c) => c.contactType === 'form_only'),
    gates: result.gates,
    failedRules: failed,
  });

  // decideTier rewrites some details. Put back the exact text enrichment stored, and add the codes it does not know.
  const failReasons: FailReason[] = decision.failReasons.map((r) => find(r.code) ?? r);
  for (const code of ['robots_blocked', 'wrong_segment', 'enrich_incomplete']) {
    const reason = find(code);
    if (reason && !failReasons.some((r) => r.code === code)) failReasons.push(reason);
  }

  let status: CompanyStatus = failReasons.some((r) => (TIER1_CODES as readonly string[]).includes(r.code)) ? 'auto_excluded' : failReasons.length > 0 ? 'not_qualified' : 'scored';
  // I moved this lead out of Auto-excluded myself. It stays visible.
  if (status === 'auto_excluded' && company.manualTier) status = 'not_qualified';

  const version = await rulesVersion();
  const values = {
    need: result.need,
    pay: result.pay,
    contact: result.contact,
    fit: result.fit,
    priority: result.priority,
    gates: result.gates,
    reasons: result.reasons,
    weightsVersion: result.weightsVersion,
    rulesVersion: version,
    computedAt: new Date(),
  };

  const movable = PIPELINE_STATUSES.includes(company.status);
  await db.transaction(async (tx) => {
    await tx.insert(scores).values({ companyId, ...values }).onConflictDoUpdate({ target: scores.companyId, set: values });
    if (best && 'id' in best) {
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.companyId, companyId));
      await tx.update(contacts).set({ isPrimary: true }).where(eq(contacts.id, best.id));
    }
    await tx
      .update(companies)
      .set(movable ? { status, failReasons } : { failReasons })
      .where(eq(companies.id, companyId));

    if (company.queryId) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(companies)
        .where(and(eq(companies.queryId, company.queryId), inArray(companies.status, PASSED)));
      await tx.update(queryRuns).set({ passedFilters: n }).where(eq(queryRuns.id, company.queryId));
    }
  });

  return { companyId, status: movable ? status : company.status, priority: result.priority, failReasons };
}
