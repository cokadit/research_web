CREATE TYPE "public"."company_status" AS ENUM('new', 'enriching', 'enriched', 'auto_excluded', 'not_qualified', 'dismissed', 'scored', 'in_review', 'approved', 'rejected', 'drafted', 'sent', 'replied', 'meeting', 'won', 'lost', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."compliance_regime" AS ENUM('gdpr_pecr', 'can_spam', 'casl', 'spam_act_au', 'uu_pdp', 'default');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('named', 'role', 'generic', 'form_only');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'edited', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."draft_variant" AS ENUM('a', 'b', 'c');--> statement-breakpoint
CREATE TYPE "public"."label_decision" AS ENUM('approve', 'reject', 'promote', 'dismiss');--> statement-breakpoint
CREATE TYPE "public"."label_origin" AS ENUM('review_queue', 'not_qualified_table');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('bounced', 'unsubscribed', 'no_reply', 'negative', 'positive', 'meeting', 'won');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('scheduled', 'dry_run', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reason_code" AS ENUM('too_big', 'site_already_good', 'chain_or_group', 'wrong_segment', 'no_budget_signals', 'bad_contact', 'competitor', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."segment" AS ENUM('villa_developer', 'fashion', 'furniture', 'hotel', 'real_estate_agency');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('grounding', 'places', 'exhibitor', 'deep_research', 'manual');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'valid', 'invalid', 'catch_all', 'unknown');--> statement-breakpoint
CREATE TABLE "api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api" text NOT NULL,
	"sku" text,
	"ok" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"segment" "segment" NOT NULL,
	"sub_category" text,
	"country" text,
	"city" text,
	"region" text,
	"timezone" text,
	"language" text,
	"compliance_regime" "compliance_regime" DEFAULT 'default' NOT NULL,
	"competitor_flag" boolean DEFAULT false NOT NULL,
	"status" "company_status" DEFAULT 'new' NOT NULL,
	"fail_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"promoted_at" timestamp with time zone,
	"source" "source" NOT NULL,
	"query_id" uuid,
	"place_id" text,
	"notes" text,
	"why_candidate" text,
	"no_crawl" boolean DEFAULT false NOT NULL,
	"manual_tier" boolean DEFAULT false NOT NULL,
	"from_exploration" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text,
	"name" text,
	"role" text,
	"contact_type" "contact_type" NOT NULL,
	"found_on_url" text,
	"mx_ok" boolean DEFAULT false NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"variant" "draft_variant" NOT NULL,
	"angle" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"model" text NOT NULL,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"portfolio_item_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"origin" "label_origin" NOT NULL,
	"decision" "label_decision" NOT NULL,
	"reason_code" text,
	"overridden_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"grounded" boolean DEFAULT false NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"outreach_id" uuid,
	"type" "outcome_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"draft_id" uuid,
	"mailbox" text NOT NULL,
	"sequence_step" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"gmail_thread_id" text,
	"status" "outreach_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"segments" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"metrics" text,
	"image_path" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"rendered_query" text NOT NULL,
	"source" "source" DEFAULT 'grounding' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"candidates" integer DEFAULT 0 NOT NULL,
	"new_domains" integer DEFAULT 0 NOT NULL,
	"passed_filters" integer DEFAULT 0 NOT NULL,
	"approved" integer DEFAULT 0 NOT NULL,
	"grounding_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment" "segment" NOT NULL,
	"template" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_exploration" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" "rule_status" DEFAULT 'proposed' NOT NULL,
	"segment" "segment",
	"rule_text" text NOT NULL,
	"rule_json" jsonb,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"need" integer NOT NULL,
	"pay" integer NOT NULL,
	"contact" integer NOT NULL,
	"fit" integer NOT NULL,
	"priority" integer NOT NULL,
	"gates" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"weights_version" text NOT NULL,
	"rules_version" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer,
	"final_url" text,
	"platform" text,
	"tech" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"psi_mobile" integer,
	"psi_desktop" integer,
	"lcp_ms_mobile" integer,
	"screenshot_desktop_path" text,
	"screenshot_mobile_path" text,
	"has_english" boolean,
	"has_multicurrency" boolean,
	"has_booking_or_enquiry" boolean,
	"has_contact_form" boolean,
	"sells_abroad" boolean,
	"ai_summary" text,
	"ai_design_critique" jsonb,
	"weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pay_signals" jsonb,
	"major_brand" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"domain" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_query_id_query_runs_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."query_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examples" ADD CONSTRAINT "examples_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_outreach_id_outreach_id_fk" FOREIGN KEY ("outreach_id") REFERENCES "public"."outreach"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_template_id_query_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."query_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_calls_api_created_idx" ON "api_calls" USING btree ("api","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_domain_uq" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "companies_status_idx" ON "companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "companies_segment_idx" ON "companies" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "companies_created_idx" ON "companies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_email_uq" ON "contacts" USING btree ("company_id","email");--> statement-breakpoint
CREATE INDEX "drafts_company_idx" ON "drafts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "examples_embedding_idx" ON "examples" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "labels_company_idx" ON "labels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "labels_created_idx" ON "labels" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outcomes_company_idx" ON "outcomes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "outreach_company_idx" ON "outreach" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "outreach_scheduled_idx" ON "outreach" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "query_runs_template_idx" ON "query_runs" USING btree ("template_id","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_company_uq" ON "scores" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scores_priority_idx" ON "scores" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "signals_company_idx" ON "signals" USING btree ("company_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_email_uq" ON "suppression" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_domain_uq" ON "suppression" USING btree ("domain");