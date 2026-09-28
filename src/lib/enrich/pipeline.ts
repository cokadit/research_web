import { and, eq, inArray, ne } from 'drizzle-orm';
import { CRAWL } from '../../config/limits';
import { db } from '../../db/client';
import { companies, contacts, signals, suppression, type Company, type DesignCritique } from '../../db/schema';
import { regionForCountry, timezoneForCountry } from '../compliance/geo';
import { regimeForCountry } from '../compliance/regimes';
import { normaliseDomain, registrableDomain } from '../discovery/domain';
import { llmFor } from '../llm';
import { CLASSIFY_SYSTEM, classifySchema, classifyUser, type ClassifyResult } from '../llm/prompts/classify';
import { CRITIQUE_SYSTEM, critiqueSchema, critiqueUser } from '../llm/prompts/critique';
import { getRuntime } from '../runtime';
import { NEED_CODES } from '../scoring/need';
import { SEGMENTS, type FailReason, type Segment, type Weakness } from '../types';
import { extractContacts, hasContactForm, type ExtractedContact } from './contacts';
import { blocklistedBrand } from './major-brands';
import { saveScreenshot } from './screenshot';
import { pickInternalLinks, type FetchedPage, type HomepageResult } from './site';
import { detectTech, type DetectedTech } from './tech';

export interface EnrichOptions {
  /** On the last attempt a failing step is recorded and the lead is scored on partial data. Earlier attempts rethrow so the job retries. */
  finalAttempt: boolean;
}

export interface EnrichOutcome {
  companyId: string;
  domain: string;
  crawled: boolean;
  /** Tier 1 or tier 2 reasons found during enrichment. Scoring adds the rest. */
  preReasons: FailReason[];
  stepErrors: { step: string; message: string }[];
}

// Statuses enrichment may start from. A lead I already decided on is never re-enriched by a stray job.
const ENRICHABLE = ['new', 'enriching', 'enriched', 'scored', 'not_qualified', 'auto_excluded'] as const;

async function isSuppressed(domain: string): Promise<string | null> {
  const reg = registrableDomain(domain.split('/')[0]);
  const keys = [...new Set([domain, reg].filter((v): v is string => Boolean(v)))];
  const [hit] = await db.select().from(suppression).where(inArray(suppression.domain, keys)).limit(1);
  return hit ? `domain on suppression list: ${hit.reason}` : null;
}

function weaknessesFrom(classify: ClassifyResult | null, critique: DesignCritique | null, home: HomepageResult): Weakness[] {
  const out: Weakness[] = [];
  const push = (code: string, evidence: string) => {
    if (!out.some((w) => w.code === code)) out.push({ code, evidence });
  };
  if (home.outcome === 'linktree') push(NEED_CODES.linktreeOnly, home.detail);
  for (const issue of critique?.issues ?? []) push(issue.code, issue.evidence);
  if (classify) {
    for (const f of classify.missing_key_features) {
      // One Need code, but every missing feature is kept as evidence for the pitch.
      const existing = out.find((w) => w.code === NEED_CODES.missingKeyFeature);
      if (existing) existing.evidence += ` · ${f.feature}: ${f.evidence}`;
      else push(NEED_CODES.missingKeyFeature, `${f.feature}: ${f.evidence}`);
    }
    if (!classify.has_english) push(NEED_CODES.noEnglish, 'No English content found on the crawled pages.');
    if (!classify.has_multicurrency) push(NEED_CODES.noMulticurrency, 'Prices are shown in one currency only.');
  }
  return out;
}

async function saveContacts(company: Company, found: ExtractedContact[], formOnly: boolean, mx: (email: string) => Promise<boolean>): Promise<void> {
  // Contacts I typed or edited stay. Everything enrichment found earlier is replaced.
  await db.delete(contacts).where(and(eq(contacts.companyId, company.id), eq(contacts.manual, false)));
  const manual = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.companyId, company.id));
  const taken = new Set(manual.map((m) => m.email));

  for (const c of found) {
    if (taken.has(c.email)) continue;
    taken.add(c.email);
    await db
      .insert(contacts)
      .values({ companyId: company.id, email: c.email, name: c.name, role: c.role, contactType: c.contactType, foundOnUrl: c.foundOnUrl, mxOk: await mx(c.email) })
      .onConflictDoNothing();
  }
  if (found.length === 0 && formOnly && manual.length === 0) {
    await db.insert(contacts).values({ companyId: company.id, email: null, contactType: 'form_only', foundOnUrl: `https://${company.domain}/`, mxOk: false });
  }
}

/** Section 7.2. Ends with status=enriched and a signals row, whatever happened on the way. */
export async function enrichCompany(companyId: string, opts: EnrichOptions): Promise<EnrichOutcome | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company || !(ENRICHABLE as readonly string[]).includes(company.status)) return null;

  const rt = getRuntime();
  const outcome: EnrichOutcome = { companyId, domain: company.domain, crawled: false, preReasons: [], stepErrors: [] };
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      if (!opts.finalAttempt) throw err;
      outcome.stepErrors.push({ step: name, message: (err instanceof Error ? err.message : String(err)).slice(0, 500) });
      return null;
    }
  };

  await db.update(companies).set({ status: 'enriching' }).where(eq(companies.id, companyId));

  // Checks that need no crawl come first, so excluded leads cost no quota and no requests to their site.
  const blocklisted = blocklistedBrand(company.domain);
  const suppressed = await isSuppressed(company.domain);
  if (blocklisted) outcome.preReasons.push({ code: 'major_brand', detail: `on blocklist: ${blocklisted}` });
  if (suppressed) outcome.preReasons.push({ code: 'suppressed', detail: suppressed });
  if (company.noCrawl) outcome.preReasons.push({ code: 'marketplace_only', detail: `only known presence is ${company.domain}, which is never crawled` });

  let home: HomepageResult | null = null;
  let pages: FetchedPage[] = [];
  let tech: { tech: DetectedTech[]; platform: string | null } = { tech: [], platform: null };
  let psiMobile: { score: number | null; lcpMs: number | null } | null = null;
  let psiDesktop: { score: number | null; lcpMs: number | null } | null = null;
  let classify: ClassifyResult | null = null;
  let critique: DesignCritique | null = null;
  const shots: { desktop: string | null; mobile: string | null } = { desktop: null, mobile: null };
  let formFound = false;
  let duplicateOf: string | null = null;

  if (outcome.preReasons.length === 0) {
    const session = await rt.sites.open(company.domain);
    try {
      home = await session.homepage();
      outcome.crawled = true;

      if (home.outcome === 'dead') outcome.preReasons.push({ code: 'dead_site', detail: home.detail });
      if (home.outcome === 'parked') outcome.preReasons.push({ code: 'parked_site', detail: home.detail });
      if (home.outcome === 'marketplace') outcome.preReasons.push({ code: 'marketplace_only', detail: home.detail });
      if (home.outcome === 'robots_blocked') outcome.preReasons.push({ code: 'robots_blocked', detail: home.detail });

      // The site redirected to a domain we already hold: same business, second address.
      const finalDomain = home.finalUrl ? normaliseDomain(home.finalUrl) : null;
      if (finalDomain && finalDomain !== company.domain) {
        const [other] = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.domain, finalDomain), ne(companies.id, companyId)));
        if (other) {
          duplicateOf = other.domain;
          outcome.preReasons.push({ code: 'duplicate', detail: `redirects to ${other.domain}, which is already a lead` });
        }
      }

      if (home.outcome === 'ok' && home.page && !duplicateOf) {
        const homepage = home.page;
        const finalUrl = home.finalUrl ?? `https://${company.domain}/`;

        tech = (await step('tech', () => detectTech({ url: finalUrl, headers: home!.headers, html: homepage.html }))) ?? tech;

        // PageSpeed runs on Google's servers, so it can overlap with our own crawl.
        const psi = Promise.all([step('psi_mobile', () => rt.pageSpeed(finalUrl, 'mobile')), step('psi_desktop', () => rt.pageSpeed(finalUrl, 'desktop'))]);

        if (home.screenshots.desktop) shots.desktop = await saveScreenshot(companyId, 'desktop', home.screenshots.desktop);
        if (home.screenshots.mobile) shots.mobile = await saveScreenshot(companyId, 'mobile', home.screenshots.mobile);

        for (const url of pickInternalLinks(homepage.links, finalUrl, CRAWL.internalPagePattern, CRAWL.maxInternalPages)) {
          const page = await session.page(url);
          if (page) pages.push(page);
        }
        pages = [homepage, ...pages];
        [psiMobile, psiDesktop] = await psi;

        const found = new Map<string, ExtractedContact>();
        for (const page of pages) {
          for (const c of extractContacts(page.html, page.url, company.domain)) if (!found.has(c.email)) found.set(c.email, c);
          formFound ||= hasContactForm(page.html);
        }
        await saveContacts(company, [...found.values()], formFound, rt.mx);

        classify = await step('classify', async () => {
          const res = await llmFor('classify').json(
            'classify',
            {
              system: CLASSIFY_SYSTEM,
              user: classifyUser({
                domain: company.domain,
                discoveredSegment: company.segment,
                platform: tech.platform,
                pages: pages.map((p) => ({ url: p.url, title: p.title, text: p.text.slice(0, CRAWL.maxTextCharsPerPage) })),
              }),
            },
            classifySchema,
            { companyId },
          );
          return res.data;
        });

        const { desktop, mobile } = home.screenshots;
        if (desktop && mobile) {
          critique = await step('critique_design', async () => {
            const res = await llmFor('critique_design').json(
              'critique_design',
              {
                system: CRITIQUE_SYSTEM,
                user: critiqueUser({ domain: company.domain, platform: tech.platform }),
                images: [
                  { data: desktop, mimeType: 'image/webp' },
                  { data: mobile, mimeType: 'image/webp' },
                ],
              },
              critiqueSchema,
              { companyId },
            );
            return res.data;
          });
        } else {
          outcome.stepErrors.push({ step: 'screenshot', message: 'screenshot failed, design critique skipped' });
        }
      }
    } finally {
      await session.close();
    }
  }

  if (classify?.segment === 'other') {
    outcome.preReasons.push({ code: 'wrong_segment', detail: `classifier: ${classify.sub_category ?? 'outside every segment'}. ${classify.summary}` });
  }
  if (outcome.stepErrors.some((e) => e.step === 'classify' || e.step === 'critique_design')) {
    outcome.preReasons.push({ code: 'enrich_incomplete', detail: outcome.stepErrors.map((e) => `${e.step}: ${e.message}`).join(' | ').slice(0, 500) });
  }

  const segment: Segment = classify && classify.segment !== 'other' && (SEGMENTS as readonly string[]).includes(classify.segment) ? classify.segment : company.segment;
  const country = classify?.country ?? company.country;
  const city = classify?.city ?? company.city;

  await db.transaction(async (tx) => {
    await tx.insert(signals).values({
      companyId,
      httpStatus: home?.httpStatus ?? null,
      finalUrl: home?.finalUrl ?? null,
      platform: tech.platform,
      tech: tech.tech,
      psiMobile: psiMobile?.score ?? null,
      psiDesktop: psiDesktop?.score ?? null,
      lcpMsMobile: psiMobile?.lcpMs ?? null,
      screenshotDesktopPath: shots.desktop,
      screenshotMobilePath: shots.mobile,
      hasEnglish: classify?.has_english ?? null,
      hasMulticurrency: classify?.has_multicurrency ?? null,
      hasBookingOrEnquiry: classify?.has_booking_or_enquiry ?? null,
      hasContactForm: home?.outcome === 'ok' ? formFound : null,
      sellsAbroad: classify?.sells_abroad ?? null,
      aiSummary: classify?.summary ?? null,
      aiDesignCritique: critique,
      weaknesses: home ? weaknessesFrom(classify, critique, home) : [],
      paySignals: classify?.pay_signals ?? null,
      majorBrand: classify?.major_brand ?? null,
      errors: outcome.stepErrors,
    });
    await tx
      .update(companies)
      .set({
        name: classify?.name ?? company.name,
        segment,
        subCategory: classify?.sub_category ?? company.subCategory,
        country,
        city,
        language: classify?.language ?? company.language,
        region: regionForCountry(country),
        timezone: timezoneForCountry(country, city),
        complianceRegime: regimeForCountry(country),
        // Scoring reads these and adds the gate and filter codes.
        failReasons: outcome.preReasons,
        status: 'enriched',
      })
      .where(eq(companies.id, companyId));
  });

  return outcome;
}
