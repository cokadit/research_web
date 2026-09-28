import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';
import {
  COMPANY_STATUSES,
  COMPLIANCE_REGIMES,
  CONTACT_TYPES,
  REASON_CODES,
  SEGMENTS,
  SOURCES,
  VERIFICATION_STATUSES,
  type FailReason,
  type MajorBrand,
  type PaySignals,
  type Weakness,
} from '../lib/types';
import type { GateResults } from '../lib/scoring/gates';

// Must match the output dimension of LLM_EMBED_MODEL. Changing it needs a new migration.
export const EMBED_DIM = Number(process.env.EMBED_DIM) || 768;

export const segmentEnum = pgEnum('segment', SEGMENTS);
export const companyStatusEnum = pgEnum('company_status', COMPANY_STATUSES);
export const sourceEnum = pgEnum('source', SOURCES);
export const complianceRegimeEnum = pgEnum('compliance_regime', COMPLIANCE_REGIMES);
export const contactTypeEnum = pgEnum('contact_type', CONTACT_TYPES);
export const verificationStatusEnum = pgEnum('verification_status', VERIFICATION_STATUSES);
export const reasonCodeEnum = pgEnum('reason_code', REASON_CODES);
export const labelOriginEnum = pgEnum('label_origin', ['review_queue', 'not_qualified_table']);
export const labelDecisionEnum = pgEnum('label_decision', ['approve', 'reject', 'promote', 'dismiss']);
export const ruleStatusEnum = pgEnum('rule_status', ['proposed', 'approved', 'rejected']);
export const draftVariantEnum = pgEnum('draft_variant', ['a', 'b', 'c']);
export const draftStatusEnum = pgEnum('draft_status', ['draft', 'edited', 'approved', 'discarded']);
export const outreachStatusEnum = pgEnum('outreach_status', ['scheduled', 'dry_run', 'sent', 'failed', 'cancelled']);
export const outcomeTypeEnum = pgEnum('outcome_type', ['bounced', 'unsubscribed', 'no_reply', 'negative', 'positive', 'meeting', 'won']);

const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const companyRef = () =>
  uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' });

export const queryTemplates = pgTable('query_templates', {
  id: id(),
  segment: segmentEnum('segment').notNull(),
  template: text('template').notNull(),
  params: jsonb('params').$type<Record<string, string[]>>().notNull().default({}),
  active: boolean('active').notNull().default(true),
  isExploration: boolean('is_exploration').notNull().default(false),
  ...timestamps,
});

export const queryRuns = pgTable(
  'query_runs',
  {
    id: id(),
    templateId: uuid('template_id').references(() => queryTemplates.id, { onDelete: 'set null' }),
    renderedQuery: text('rendered_query').notNull(),
    source: sourceEnum('source').notNull().default('grounding'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    candidates: integer('candidates').notNull().default(0),
    newDomains: integer('new_domains').notNull().default(0),
    passedFilters: integer('passed_filters').notNull().default(0),
    approved: integer('approved').notNull().default(0),
    groundingSources: jsonb('grounding_sources').$type<{ uri: string; title: string | null }[]>().notNull().default([]),
    error: text('error'),
    ...timestamps,
  },
  (t) => [index('query_runs_template_idx').on(t.templateId, t.runAt)],
);

export const companies = pgTable(
  'companies',
  {
    id: id(),
    domain: text('domain').notNull(),
    name: text('name'),
    segment: segmentEnum('segment').notNull(),
    subCategory: text('sub_category'),
    country: text('country'),
    city: text('city'),
    region: text('region'),
    timezone: text('timezone'),
    language: text('language'),
    complianceRegime: complianceRegimeEnum('compliance_regime').notNull().default('default'),
    competitorFlag: boolean('competitor_flag').notNull().default(false),
    status: companyStatusEnum('status').notNull().default('new'),
    failReasons: jsonb('fail_reasons').$type<FailReason[]>().notNull().default([]),
    promoted: boolean('promoted').notNull().default(false),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
    source: sourceEnum('source').notNull(),
    queryId: uuid('query_id').references(() => queryRuns.id, { onDelete: 'set null' }),
    placeId: text('place_id'),
    notes: text('notes'),
    // Why discovery suggested this lead. Shown on the detail page.
    whyCandidate: text('why_candidate'),
    // Set for manual entries that live on a host we never fetch (Instagram, marketplaces).
    noCrawl: boolean('no_crawl').notNull().default(false),
    // Set when I move a lead out of Auto-excluded. Scoring then never hides it again.
    manualTier: boolean('manual_tier').notNull().default(false),
    // Exploration flag copied from the query template at discovery time, for queue:build.
    fromExploration: boolean('from_exploration').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('companies_domain_uq').on(t.domain),
    index('companies_status_idx').on(t.status),
    index('companies_segment_idx').on(t.segment),
    index('companies_created_idx').on(t.createdAt),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    companyId: companyRef(),
    email: text('email'),
    name: text('name'),
    role: text('role'),
    contactType: contactTypeEnum('contact_type').notNull(),
    foundOnUrl: text('found_on_url'),
    mxOk: boolean('mx_ok').notNull().default(false),
    verificationStatus: verificationStatusEnum('verification_status').notNull().default('unverified'),
    isPrimary: boolean('is_primary').notNull().default(false),
    // True when I typed or edited this contact. Re-enrichment never overwrites it.
    manual: boolean('manual').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('contacts_company_idx').on(t.companyId), uniqueIndex('contacts_company_email_uq').on(t.companyId, t.email)],
);

export interface DesignCritique {
  design_age: 'modern' | 'dated' | 'very_dated';
  issues: Weakness[];
  agency_grade: boolean;
}

export const signals = pgTable(
  'signals',
  {
    id: id(),
    companyId: companyRef(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer('http_status'),
    finalUrl: text('final_url'),
    platform: text('platform'),
    tech: jsonb('tech').$type<{ name: string; categories: string[] }[]>().notNull().default([]),
    psiMobile: integer('psi_mobile'),
    psiDesktop: integer('psi_desktop'),
    lcpMsMobile: integer('lcp_ms_mobile'),
    screenshotDesktopPath: text('screenshot_desktop_path'),
    screenshotMobilePath: text('screenshot_mobile_path'),
    hasEnglish: boolean('has_english'),
    hasMulticurrency: boolean('has_multicurrency'),
    hasBookingOrEnquiry: boolean('has_booking_or_enquiry'),
    hasContactForm: boolean('has_contact_form'),
    sellsAbroad: boolean('sells_abroad'),
    aiSummary: text('ai_summary'),
    aiDesignCritique: jsonb('ai_design_critique').$type<DesignCritique>(),
    weaknesses: jsonb('weaknesses').$type<Weakness[]>().notNull().default([]),
    paySignals: jsonb('pay_signals').$type<PaySignals>(),
    majorBrand: jsonb('major_brand').$type<MajorBrand>(),
    // Steps that failed during enrichment, e.g. PSI timeout. The lead is still scored.
    errors: jsonb('errors').$type<{ step: string; message: string }[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index('signals_company_idx').on(t.companyId, t.fetchedAt)],
);

export const scores = pgTable(
  'scores',
  {
    id: id(),
    companyId: companyRef(),
    need: integer('need').notNull(),
    pay: integer('pay').notNull(),
    contact: integer('contact').notNull(),
    fit: integer('fit').notNull(),
    priority: integer('priority').notNull(),
    gates: jsonb('gates').$type<GateResults>().notNull(),
    reasons: jsonb('reasons').$type<{ need: string[]; pay: string[]; contact: string[]; fit: string[] }>().notNull(),
    weightsVersion: text('weights_version').notNull(),
    rulesVersion: integer('rules_version').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('scores_company_uq').on(t.companyId), index('scores_priority_idx').on(t.priority)],
);

export const labels = pgTable(
  'labels',
  {
    id: id(),
    companyId: companyRef(),
    origin: labelOriginEnum('origin').notNull(),
    decision: labelDecisionEnum('decision').notNull(),
    // Review-queue rejections use the reject enum. Dismissals default to the failing filter code.
    reasonCode: text('reason_code'),
    overriddenCodes: jsonb('overridden_codes').$type<string[]>().notNull().default([]),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('labels_company_idx').on(t.companyId), index('labels_created_idx').on(t.createdAt)],
);

export const examples = pgTable(
  'examples',
  {
    id: id(),
    companyId: companyRef(),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBED_DIM }).notNull(),
    ...timestamps,
  },
  (t) => [index('examples_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops'))],
);

export const rules = pgTable('rules', {
  id: id(),
  version: integer('version').notNull(),
  status: ruleStatusEnum('status').notNull().default('proposed'),
  segment: segmentEnum('segment'),
  ruleText: text('rule_text').notNull(),
  ruleJson: jsonb('rule_json').$type<Record<string, unknown>>(),
  evidence: jsonb('evidence').$type<string[]>().notNull().default([]),
  proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  ...timestamps,
});

export const portfolioItems = pgTable('portfolio_items', {
  id: id(),
  title: text('title').notNull(),
  url: text('url'),
  segments: text('segments').array().notNull().default(sql`'{}'::text[]`),
  summary: text('summary'),
  metrics: text('metrics'),
  imagePath: text('image_path'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const drafts = pgTable(
  'drafts',
  {
    id: id(),
    companyId: companyRef(),
    variant: draftVariantEnum('variant').notNull(),
    angle: text('angle').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    model: text('model').notNull(),
    status: draftStatusEnum('status').notNull().default('draft'),
    portfolioItemIds: uuid('portfolio_item_ids').array().notNull().default(sql`'{}'::uuid[]`),
    ...timestamps,
  },
  (t) => [index('drafts_company_idx').on(t.companyId)],
);

// Phase 3. Defined now so later migrations only add behaviour, not tables.
export const outreach = pgTable(
  'outreach',
  {
    id: id(),
    companyId: companyRef(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    draftId: uuid('draft_id').references(() => drafts.id, { onDelete: 'set null' }),
    mailbox: text('mailbox').notNull(),
    sequenceStep: integer('sequence_step').notNull().default(0),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    gmailThreadId: text('gmail_thread_id'),
    status: outreachStatusEnum('status').notNull().default('scheduled'),
    ...timestamps,
  },
  (t) => [index('outreach_company_idx').on(t.companyId), index('outreach_scheduled_idx').on(t.status, t.scheduledFor)],
);

export const outcomes = pgTable(
  'outcomes',
  {
    id: id(),
    companyId: companyRef(),
    outreachId: uuid('outreach_id').references(() => outreach.id, { onDelete: 'set null' }),
    type: outcomeTypeEnum('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index('outcomes_company_idx').on(t.companyId)],
);

export const suppression = pgTable(
  'suppression',
  {
    id: id(),
    email: text('email'),
    domain: text('domain'),
    reason: text('reason').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('suppression_email_uq').on(t.email), uniqueIndex('suppression_domain_uq').on(t.domain)],
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: id(),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    grounded: boolean('grounded').notNull().default(false),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    error: text('error'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('llm_calls_created_idx').on(t.createdAt)],
);

// Non-LLM paid or rate-limited API calls (Places, PageSpeed). Backs the Places monthly cap.
export const apiCalls = pgTable(
  'api_calls',
  {
    id: id(),
    api: text('api').notNull(),
    sku: text('sku'),
    ok: boolean('ok').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    error: text('error'),
    ...timestamps,
  },
  (t) => [index('api_calls_api_created_idx').on(t.api, t.createdAt)],
);

// Single-row key/value state, e.g. the last queue:build run and the current rules version.
export const appState = pgTable('app_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type QueryTemplate = typeof queryTemplates.$inferSelect;
export type QueryRun = typeof queryRuns.$inferSelect;
