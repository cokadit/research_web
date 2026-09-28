export const SEGMENTS = ['villa_developer', 'fashion', 'furniture', 'hotel', 'real_estate_agency'] as const;
export type Segment = (typeof SEGMENTS)[number];

// Segments with active discovery. hotel and real_estate_agency are schema-only for now.
export const DISCOVERY_SEGMENTS = ['villa_developer', 'fashion', 'furniture'] as const satisfies readonly Segment[];

export const COMPANY_STATUSES = [
  'new',
  'enriching',
  'enriched',
  'auto_excluded',
  'not_qualified',
  'dismissed',
  'scored',
  'in_review',
  'approved',
  'rejected',
  'drafted',
  'sent',
  'replied',
  'meeting',
  'won',
  'lost',
  'suppressed',
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const SOURCES = ['grounding', 'places', 'exhibitor', 'deep_research', 'manual'] as const;
export type Source = (typeof SOURCES)[number];

export const COMPLIANCE_REGIMES = ['gdpr_pecr', 'can_spam', 'casl', 'spam_act_au', 'uu_pdp', 'default'] as const;
export type ComplianceRegime = (typeof COMPLIANCE_REGIMES)[number];

export const CONTACT_TYPES = ['named', 'role', 'generic', 'form_only'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'valid', 'invalid', 'catch_all', 'unknown'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const REASON_CODES = [
  'too_big',
  'site_already_good',
  'chain_or_group',
  'wrong_segment',
  'no_budget_signals',
  'bad_contact',
  'competitor',
  'duplicate',
  'other',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

// Tier 1 codes lead to auto_excluded, tier 2 codes to not_qualified. `rule:<id>` is added at runtime.
export const TIER1_CODES = ['major_brand', 'dead_site', 'parked_site', 'duplicate', 'suppressed'] as const;
export const TIER2_CODES = [
  'major_brand_uncertain',
  'brand_group',
  'site_already_good',
  'no_contact',
  'gate_need',
  'gate_contact',
  'marketplace_only',
  // Not in the spec: robots.txt forbids fetching the homepage, so the site could not be assessed.
  'robots_blocked',
  // Not in the spec: the classifier says the business is outside every segment I serve.
  'wrong_segment',
  // Not in the spec: a step kept failing (for example the LLM), so the lead was scored on partial data.
  'enrich_incomplete',
] as const;
export type Tier1Code = (typeof TIER1_CODES)[number];
export type Tier2Code = (typeof TIER2_CODES)[number];
export type FailCode = Tier1Code | Tier2Code | `rule:${string}`;

export interface FailReason {
  code: FailCode;
  detail: string;
}

export interface Weakness {
  code: string;
  evidence: string;
}

export const DESIGN_AGES = ['modern', 'dated', 'very_dated'] as const;
export type DesignAge = (typeof DESIGN_AGES)[number];

export const PRICE_LEVELS = ['low', 'mid', 'high', 'luxury'] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];

export interface PaySignals {
  price_level: PriceLevel | null;
  review_count: number | null;
  social_following: number | null;
  active_projects: number | null;
  is_exporter: boolean | null;
  trade_show_presence: boolean | null;
  evidence: string[];
}

export const MAJOR_BRAND_TYPES = ['intl_hotel_chain', 'well_known_fashion', 'well_known_furniture', 'brand_group'] as const;
export type MajorBrandType = (typeof MAJOR_BRAND_TYPES)[number];

export interface MajorBrand {
  is_major: boolean;
  confidence: 'high' | 'medium' | 'low';
  type: MajorBrandType | null;
  evidence: string;
}
