import type { CompanyStatus, FailReason, MajorBrand } from '../types';
import type { GateResults } from './gates';
import { SITE_ALREADY_GOOD_PSI } from './weights';

export interface TierInput {
  blocklisted: string | null;
  majorBrand: MajorBrand | null;
  /** Set by the homepage fetch when the site is dead or parked. */
  siteFailure: { code: 'dead_site' | 'parked_site'; detail: string } | null;
  duplicateOf: string | null;
  suppressed: string | null;
  marketplaceOnly: string | null;
  agencyGrade: boolean | null;
  psiMobile: number | null;
  hasUsableEmail: boolean;
  hasForm: boolean;
  gates: GateResults;
  /** Approved rules with a rule_json that this lead failed. */
  failedRules: { id: string; text: string }[];
}

export interface TierDecision {
  status: Extract<CompanyStatus, 'auto_excluded' | 'not_qualified' | 'scored'>;
  failReasons: FailReason[];
}

const TIER1_MAJOR_TYPES = new Set(['intl_hotel_chain', 'well_known_fashion', 'well_known_furniture']);

/** Section 7.3. Collects every failing code, then picks the tier. Tier 1 wins over tier 2. */
export function decideTier(input: TierInput): TierDecision {
  const tier1: FailReason[] = [];
  const tier2: FailReason[] = [];
  const mb = input.majorBrand;

  if (input.blocklisted) tier1.push({ code: 'major_brand', detail: `on blocklist: ${input.blocklisted}` });
  if (mb?.is_major) {
    if (mb.confidence === 'high' && mb.type && TIER1_MAJOR_TYPES.has(mb.type)) {
      if (!input.blocklisted) tier1.push({ code: 'major_brand', detail: `${mb.type}: ${mb.evidence}` });
    } else if (mb.type === 'brand_group') {
      tier2.push({ code: 'brand_group', detail: `${mb.confidence} confidence: ${mb.evidence}` });
    } else {
      tier2.push({ code: 'major_brand_uncertain', detail: `${mb.type ?? 'unknown type'}, ${mb.confidence} confidence: ${mb.evidence}` });
    }
  }
  if (input.siteFailure) tier1.push(input.siteFailure);
  if (input.duplicateOf) tier1.push({ code: 'duplicate', detail: `same site as ${input.duplicateOf}` });
  if (input.suppressed) tier1.push({ code: 'suppressed', detail: input.suppressed });

  if (input.marketplaceOnly) tier2.push({ code: 'marketplace_only', detail: input.marketplaceOnly });
  if (input.agencyGrade === true && input.psiMobile !== null && input.psiMobile >= SITE_ALREADY_GOOD_PSI) {
    tier2.push({ code: 'site_already_good', detail: `agency-grade design, PSI mobile ${input.psiMobile}` });
  }
  if (!input.hasUsableEmail && !input.hasForm) {
    tier2.push({ code: 'no_contact', detail: 'no email with working MX and no contact form' });
  }
  if (!input.gates.need.pass) tier2.push({ code: 'gate_need', detail: input.gates.need.reason });
  if (!input.gates.contact.pass) tier2.push({ code: 'gate_contact', detail: input.gates.contact.reason });
  for (const rule of input.failedRules) tier2.push({ code: `rule:${rule.id}`, detail: rule.text });

  const failReasons = [...tier1, ...tier2];
  if (tier1.length > 0) return { status: 'auto_excluded', failReasons };
  if (tier2.length > 0) return { status: 'not_qualified', failReasons };
  return { status: 'scored', failReasons };
}
