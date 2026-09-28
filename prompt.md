# Build Prompt — Lead Research & Outreach System (Agung Aditya)

> **How to use:** create an empty repo, put this file at the root, open it in VS Code, start Claude Code and say:
> `Read prompt.md fully. Then do the "Kickoff" section and stop.`

---

## 0. Role and working rules (for Claude Code)

You are building a single-user, self-hosted system for a freelance web/UI-UX designer (Agung Aditya, based in Bali) that **finds independent businesses with weak websites, scores them, drafts personalised pitches for human approval, and learns over time which leads are right or wrong.**

Rules you must follow for the whole project:

1. **Build in phases (section 12). Stop at the end of each phase** and give me a short report: what was built, how to run it, what's untested, what you need from me. Do not start the next phase until I say so.
2. **Plan before coding** each phase: list the files you will create/change and any new dependencies. Wait for my OK if you add a dependency not listed in section 2.
3. **Never hardcode model IDs, SDK method names, API field masks or prices from memory.** Check the official docs (Gemini API, Google Places API (New), PageSpeed Insights API, Gmail API, Claude Code CLI) at build time and put model IDs in config. If you cannot verify something, write `// TODO(verify): …` and tell me.
4. **No real email is sent until Phase 3 is approved.** `SEND_ENABLED=false` by default. All send paths must support dry-run.
5. Secrets only in `.env` (git-ignored). Maintain `.env.example`.
6. TypeScript strict mode. Validate every LLM output and external API response with **zod**. Invalid LLM JSON → one retry with the validation error appended, then mark the job failed.
7. Write unit tests (Vitest) for: scoring, gates, contact extraction, domain normalisation, compliance-regime mapping, query-yield calculation.
8. Create and maintain `CLAUDE.md` at the repo root with: stack, commands, folder map, conventions, and the current phase.
9. Be polite to websites: respect `robots.txt`, max 1 concurrent request per domain, ≥ 2 s between requests to the same domain, identify with a clear user agent, 20 s timeout.
10. Never scrape Instagram, marketplaces (Shopee, Tokopedia, Etsy), Airbnb or Booking.com. Those sources are manual entry only.

---

## 1. Context

- **Starting segments:** `villa_developer` (incl. villa management companies), `fashion` (independent brands of any category — apparel, bags, shoes, jewellery, modest wear, batik, etc.), `furniture` (makers, exporters, home decor).
- **Later segments (schema must support, no discovery yet):** `hotel` (non-chain 3–5★), `real_estate_agency`.
- **Geography:** worldwide. Every company is labelled with country, region, timezone, language and compliance regime.
- **Volume:** 100+ candidates researched per day → top 20–30 go to the review queue → approved ones are sent (Phase 3).
- **Hardware:** runs on a spare Windows/Linux PC at home (confirm OS with me), always on. Dashboard accessed remotely via Tailscale.
- **Most important part:** research quality and the learning loop. Sending is secondary.

---

## 2. Stack

| Layer | Choice |
|---|---|
| App + dashboard | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui |
| Database | PostgreSQL 16 + **pgvector** (run via Docker Compose) |
| ORM / migrations | **Drizzle** (native pgvector support) |
| Job queue + cron | **pg-boss** (Postgres-backed, no Redis) — separate `worker` process |
| Crawling / screenshots | **Playwright** (Chromium) |
| Tech detection | Open-source Wappalyzer fingerprint fork (evaluate `webappanalyzer`-style packages; propose one) |
| Performance | Google PageSpeed Insights API v5 (mobile + desktop) |
| LLM — bulk + vision + discovery | Gemini via `@google/genai` (Flash / Flash-Lite, Search grounding) |
| LLM — drafts | Claude via **Claude Code CLI subprocess**: `claude -p --output-format json` (uses my Max subscription) |
| Embeddings | Gemini embedding model (verify current ID + dimension) |
| Validation | zod |
| Tests | Vitest |
| Email (Phase 3) | Gmail API (OAuth, 2 mailboxes on a separate sending domain) |

Monorepo layout is fine as a single Next.js app + `worker/` entry sharing `src/lib`.

---

## 3. Folder structure (proposal — adjust if you have a better reason, tell me why)

```
/app                  Next.js routes (dashboard pages + API routes)
/src/db               drizzle schema, migrations, seed
/src/lib/llm          provider interface + gemini + claude-cli implementations, prompts/
/src/lib/discovery    query templates, gemini-grounding, places, manual import (CSV)
/src/lib/enrich       fetch, tech-detect, pagespeed, screenshot, contacts, classify, critique
/src/lib/scoring      sub-scores, gates, weights config
/src/lib/learning     labels, embeddings/examples, rules proposals, query yield, weights fit
/src/lib/outreach     drafts, portfolio matching, (Phase 3) gmail, sequences, suppression
/src/lib/compliance   country → regime map + rules
/worker               pg-boss worker + schedules
/data/screenshots     local files (git-ignored)
/tests
```

---

## 4. Environment variables (`.env.example`)

```
DATABASE_URL=postgres://...
GEMINI_API_KEY=
GOOGLE_PLACES_API_KEY=
PAGESPEED_API_KEY=
DASHBOARD_PASSWORD=
LLM_DISCOVERY_MODEL=          # verify current Gemini Flash ID
LLM_EXTRACT_MODEL=            # verify current Gemini Flash-Lite ID
LLM_VISION_MODEL=             # verify
LLM_EMBED_MODEL=              # verify, and set EMBED_DIM accordingly
EMBED_DIM=
DRAFT_PROVIDER=claude-cli     # claude-cli (Max plan) or gemini as fallback. No Anthropic API key in this project.
DAILY_CANDIDATE_TARGET=120
DAILY_REVIEW_QUEUE_SIZE=30
EXPLORATION_SHARE=0.2
SEND_ENABLED=false
PUBLIC_UNSUBSCRIBE_BASE_URL=  # Phase 3
```

**Important:** Claude is used **only through my Max plan subscription** (Claude Code CLI logged in with my claude.ai account) — never an Anthropic API key. The Claude CLI must run under my logged-in Max account. If `ANTHROPIC_API_KEY` is set in the worker's environment, Claude Code bills the API instead of the subscription — the worker must **unset it** before spawning `claude`, and log which auth mode is active at startup.

---

## 5. Data model (Drizzle)

Use UUID primary keys, `created_at`/`updated_at` everywhere.

- **companies** — `domain` (unique, normalised: lowercase, no `www.`, no path), `name`, `segment` (enum), `sub_category`, `country` (ISO-2), `region`, `timezone` (IANA), `language`, `compliance_regime` (enum), `competitor_flag` (bool), `status` (enum: `new`, `enriching`, `enriched`, `auto_excluded`, `not_qualified`, `dismissed`, `scored`, `in_review`, `approved`, `rejected`, `drafted`, `sent`, `replied`, `meeting`, `won`, `lost`, `suppressed`), `fail_reasons` (jsonb array of `{code, detail}` — every filter/gate that failed, not just the first), `promoted` (bool — set when I move a not-qualified lead into review), `source` (enum: `grounding`, `places`, `exhibitor`, `deep_research`, `manual`), `query_id` (nullable FK), `place_id` (nullable), `notes`.
- **contacts** — `company_id`, `email`, `name`, `role`, `contact_type` (`named`, `role`, `generic`, `form_only`), `found_on_url`, `mx_ok` (bool), `verification_status` (`unverified`, `valid`, `invalid`, `catch_all`, `unknown`), `is_primary`.
- **signals** — `company_id`, `fetched_at`, `http_status`, `final_url`, `platform`, `tech` (jsonb), `psi_mobile`, `psi_desktop`, `lcp_ms_mobile`, `screenshot_desktop_path`, `screenshot_mobile_path`, `has_english`, `has_multicurrency`, `has_booking_or_enquiry`, `ai_summary`, `ai_design_critique`, `weaknesses` (jsonb array of `{code, evidence}`), `pay_signals` (jsonb).
- **scores** — `company_id`, `need`, `pay`, `contact`, `fit`, `priority`, `gates` (jsonb: each gate pass/fail + reason), `weights_version`, `rules_version`, `computed_at`.
- **labels** — `company_id`, `origin` (`review_queue`, `not_qualified_table`), `decision` (`approve`, `reject` from the review queue; `promote`, `dismiss` from the Not qualified table), `reason_code` (enum below; for `dismiss` default to the failing filter/gate code, editable), `overridden_codes` (for `promote`: which fail codes I overrode), `note`, `created_at`.
- **examples** — `company_id`, `label_id`, `text` (the canonical lead description used for embedding), `embedding vector(EMBED_DIM)`. HNSW or IVFFlat index, cosine.
- **rules** — `version`, `status` (`proposed`, `approved`, `rejected`), `segment` (nullable = all), `rule_text`, `rule_json` (machine-applicable form when possible), `evidence` (label ids), `proposed_at`, `decided_at`.
- **query_templates** — `segment`, `template` (with `{placeholders}`), `params` (jsonb), `active`, `is_exploration`.
- **query_runs** — `template_id`, `rendered_query`, `run_at`, `candidates`, `new_domains`, `passed_filters`, `approved` (updated later), `grounding_sources` (jsonb).
- **portfolio_items** — `title`, `url`, `segments` (array), `summary`, `metrics`, `image_path`, `active`.
- **drafts** — `company_id`, `variant` (`a`,`b`,`c`), `angle`, `subject`, `body`, `model`, `status` (`draft`, `edited`, `approved`, `discarded`), `portfolio_item_ids`.
- **outreach** (Phase 3) — `company_id`, `contact_id`, `draft_id`, `mailbox`, `sequence_step`, `scheduled_for`, `sent_at`, `gmail_thread_id`, `status`.
- **outcomes** (Phase 3) — `company_id`, `outreach_id`, `type` (`bounced`, `unsubscribed`, `no_reply`, `negative`, `positive`, `meeting`, `won`), `occurred_at`, `raw` (jsonb).
- **suppression** — `email` or `domain`, `reason`, `created_at`. Checked before discovery insert, before queueing and before every send.
- **llm_calls** — `task`, `provider`, `model`, `tokens_in`, `tokens_out`, `grounded` (bool), `latency_ms`, `ok`, `error`. Used for cost/quota tracking.

**Reject reason codes (enum):** `too_big`, `site_already_good`, `chain_or_group`, `wrong_segment`, `no_budget_signals`, `bad_contact`, `competitor`, `duplicate`, `other` (requires note).

---

## 6. LLM provider layer

```ts
interface LLMProvider {
  json<T>(task: TaskName, input: { system: string; user: string; images?: Buffer[] }, schema: ZodSchema<T>, opts?: { grounding?: boolean }): Promise<{ data: T; sources?: GroundingSource[] }>;
  embed(texts: string[]): Promise<number[][]>;
}
```

- Task → provider/model routing lives in one config file (`src/lib/llm/routing.ts`). Tasks: `discover`, `extract_contacts_fallback`, `classify`, `critique_design` (vision), `pay_signals`, `embed`, `propose_rules`, `draft_email`.
- **GeminiProvider:** `@google/genai`; Search grounding for `discover`; structured JSON output where supported; log grounding source URLs.
- **ClaudeCliProvider:** spawn `claude -p --output-format json` with the prompt on stdin; parse the JSON envelope, extract the model's text, then zod-validate. Timeout 120 s. Concurrency 1. Unset `ANTHROPIC_API_KEY` for the child process. If the CLI reports a usage-limit error, mark the job `deferred` and retry after the reset time, don't fail silently.
- Every call writes a row to `llm_calls`. Dashboard shows today's calls per provider/model.
- All prompts live in `src/lib/llm/prompts/*.ts` as versioned constants.

---

## 7. Research engine

### 7.1 Discovery (job `discover:daily`, runs 02:00 Asia/Makassar)

Target `DAILY_CANDIDATE_TARGET` new candidate domains per day, split across segments equally, `EXPLORATION_SHARE` of queries reserved for templates with < 3 runs or newly added.

**Gemini + Search grounding** (fashion, furniture, villa_developer):
- Render a template, ask Gemini to return JSON `[{ brand_name, website_url, country, city, why_candidate }]` (max 10), **only brands that appear in the grounding sources**. Store `grounding_sources` on the query run.
- Seed templates (I will add more via the dashboard):
  - fashion: `independent {category} brand {city} order via WhatsApp`, `{category} label {country} ships worldwide small brand`, `handmade {category} brand {city} instagram shop`
  - furniture: `{material} furniture exporter {region} catalogue`, `{material} furniture manufacturer {city} wholesale inquiry`, `home decor maker {city} export`
  - villa_developer: `villa off-plan {area} investment`, `villa development company {area} leasehold`, `villa management company {area}`
  - Param lists (seed): categories `[bags, leather goods, swimwear, streetwear, modest wear, batik, jewellery, shoes, kidswear]`; materials `[teak, rattan, suar wood, bamboo, reclaimed wood]`; areas `[Canggu, Uluwatu, Ubud, Seminyak, Lombok, Sumba]`; cities/regions across Indonesia plus a configurable international list.

**Google Places (New) Text Search** (villa management, furniture showrooms/workshops):
- Use a field mask that stays on the cheapest SKU needed (verify which fields are ID-only/Essentials vs Pro/Enterprise in current docs). Persist **only `place_id`** long-term.
- If a website is needed, fetch it transiently, then derive the domain from the crawled site itself. Do not persist other Places content. `// TODO(verify)` the current Google Maps Platform terms on storage and tell me what you found.
- Hard monthly cap on Places calls in config; stop and alert when reached.

**Manual import:** CSV upload page (`name, website, segment, country, source, notes`) for exhibitor lists and Gemini Deep Research output. Quick-add form for single brands (Instagram/marketplace finds).

After any discovery: normalise domain → drop if in `companies` or `suppression` → insert with `status=new`, `source`, `query_id`.

### 7.2 Enrichment (job `enrich:company`, concurrency 3)

1. Fetch homepage with Playwright. Dead, parked or non-2xx → `auto_excluded` with reason. Redirect to a marketplace store (Shopee/Tokopedia/Etsy) → continue as `not_qualified` with code `marketplace_only` (they may need a site — my call).
2. Tech/platform detection.
3. PageSpeed Insights mobile + desktop (store scores + LCP).
4. Screenshots: desktop 1440×900 and mobile 390×844, above the fold, saved as WebP.
5. Crawl up to 5 internal pages matching `/contact|about|team|wholesale|trade|investor|story/i`.
6. Contacts: `mailto:` links, visible emails, common obfuscations (`[at]`, `(dot)`), schema.org `Organization`/`LocalBusiness` email, footer. Classify `contact_type`. MX lookup with Node `dns`. Do **not** do SMTP RCPT probing.
7. Gemini `classify` (text from pages): segment, sub_category, country, city, language, business summary, pay signals, and `major_brand: { is_major: boolean, confidence: 'high'|'medium'|'low', type: 'intl_hotel_chain'|'well_known_fashion'|'well_known_furniture'|'brand_group'|null, evidence: string }`. Also check the domain against a maintained blocklist file (`src/lib/enrich/major-brands.ts`: Marriott, Accor, Hilton, IHG, Hyatt, Wyndham, Archipelago, etc. + big fashion/furniture groups; I will extend it).
8. Gemini `critique_design` (vision, both screenshots): JSON `{ design_age: 'modern'|'dated'|'very_dated', issues: [{code, evidence}], agency_grade: boolean }`.
9. Map country → timezone, region, compliance regime.
10. `status=enriched`, enqueue scoring.

### 7.3 Two-tier filtering — only the obvious is hidden

**Every lead is scored**, whatever tier it lands in, so the Not qualified table can be sorted by priority.

**Tier 1 — `auto_excluded`** (hidden from the main tables, visible only in an "Auto-excluded" audit tab). Only these:
- On the major-brands blocklist, OR `major_brand.is_major = true` with `confidence = 'high'` and `type` in (`intl_hotel_chain`, `well_known_fashion`, `well_known_furniture`)
- Dead or parked site
- Duplicate domain
- Email/domain in `suppression`

**Tier 2 — `not_qualified`** (shown in its own table on the Leads page — **I decide**). Everything else that fails, with ALL failing codes stored in `fail_reasons`:
- `brand_group` or `major_brand` with medium/low confidence
- `site_already_good`: `agency_grade=true` AND `psi_mobile ≥ 85`
- `no_contact`: no contact with `mx_ok=true` and no form (I may find one manually — contact is editable on the detail page)
- `gate_need` (N < 50), `gate_contact` (C < 40)
- `marketplace_only`
- `rule:<id>` for any failed **approved** rule with a `rule_json`

Leads that pass everything → `scored` (Qualified).

Nothing in Tier 2 is ever deleted or auto-dismissed.

---

## 8. Scoring

```
priority = 0.40·N + 0.30·P + 0.20·C + 0.10·F      (each 0–100)
```

Weights live in `src/lib/scoring/weights.ts` with a version string.

- **Need (N)**, capped at 100: `psi_mobile < 50` +30 (50–69: +15) · `design_age` dated +20 / very_dated +25 · default theme or Linktree-only +20 · missing key feature for segment +15 (villa: investor/enquiry funnel; fashion: size guide/intl shipping info/quality product pages; furniture: online catalogue/B2B enquiry form) · no English or no multi-currency when selling abroad +10.
- **Ability to pay (P):** segment-specific rubric from `pay_signals` (price level, review count, following, active projects, exporter status, trade-show presence). Implement as a function per segment, returning 0–100 plus the reasons used.
- **Contact (C):** named verified founder/owner 100 · role address (sales@, marketing@) 70 · generic info@ 40 · form only 10. Use the best contact.
- **Fit (F):** overlap between the lead's segment and active `portfolio_items.segments`; 50 if none yet.

**Gates:** `N ≥ 50`, `C ≥ 40`. A gate failure sets `status = not_qualified` with the gate code in `fail_reasons` (section 7.3) — the lead keeps its score and is shown to me, never dropped. Store gate results in `scores.gates`. Gate thresholds live in config next to the weights.

**Required unit tests (worked example):**
| N | P | C | F | expected |
|---|---|---|---|---|
| 85 | 60 | 100 | 50 | 77, gates pass |
| 75 | 70 | 40 | 60 | 65, gates pass |
| 30 | 90 | 70 | 60 | 59, fails Need gate |

Daily job `queue:build` (06:00 Asia/Makassar): first add every lead I promoted from the Not qualified table since the last run (these don't count against the size), then pick top `DAILY_REVIEW_QUEUE_SIZE` by priority among `scored` leads, with at least 20% from exploration queries if available, move to `in_review`, generate drafts (Phase 2).

---

## 9. Learning loop

1. **Labels:** every approve/reject in the review queue writes `labels`. Reject requires a reason code. Every promote/dismiss in the Not qualified table also writes `labels` (`origin = not_qualified_table`). Both feed example memory.
   - **Gate/filter override rate (Phase 4, weekly):** for each fail code, override rate = promoted ÷ (promoted + dismissed), last 4 weeks, min 20 decisions. If > 20%, the rules job proposes loosening that filter/threshold (e.g. `N ≥ 50 → N ≥ 40`), with the promoted examples as evidence. If a code is dismissed > 95% of the time, propose moving it to Tier 1. Both are proposals only — I approve.
2. **Example memory (Phase 2):** on each label, build a canonical text for the lead (segment, country, platform, psi, design critique, pay signals, weaknesses, decision, reason), embed it, store in `examples`. During `classify` / before queueing, retrieve the 10 nearest examples (cosine) and include them in a `judge_fit` prompt that returns `{ fit_adjustment: -20..+20, rationale }`. Show the rationale and the similar examples on the lead card.
3. **Rules document (Phase 4, weekly Sunday):** job `learning:propose-rules` feeds the last 7 days of rejections (grouped by reason) + current approved rules to Gemini; it returns up to 5 proposed rules `{ segment, rule_text, rule_json?, evidence_label_ids }`. They appear on the Learning page for approve/reject. Only approved rules are applied. Every change bumps `rules_version`.
4. **Query yield (Phase 4, weekly):** yield = approved ÷ candidates per template (last 4 weeks). Allocate next week's non-exploration query budget proportionally to yield (floor 5% per active template so none dies instantly). Auto-deactivate templates with 0 approvals after 100 candidates — as a proposal, not silently.
5. **Learned weights (Phase 4+, after ≥ 30 positive outcomes):** script fits logistic regression of `positive|meeting|won` vs N/P/C/F and proposes new weights on the Learning page. Never auto-applied.
6. **Separate brand fit from email quality:** every send logs `draft.variant` and `angle`, so reply rates can be split by variant.

---

## 10. Drafting (Phase 2)

Provider: `claude-cli`. Input: lead card (summary, top 3 weaknesses with evidence, PSI numbers, segment, country, language), matched portfolio items (max 2), approved tone rules.

Output (zod): `[{ variant: 'a'|'b'|'c', angle: string, subject: string, body: string }]` — three angles, e.g. performance, conversion/booking/enquiry, visual redesign.

Constraints in the prompt: ≤ 120 words; open with **one specific, verifiable observation** about their site; no invented numbers or claims; one clear ask (a 15-minute call or a free mini-audit); plain text; sign as **Agung Aditya**; do **not** write the unsubscribe line or address (the sender appends them). English by default; Bahasa Indonesia option for `country=ID` (natural, conversational — not stiff formal Indonesian).

Review queue lets me edit a draft inline; edited drafts are saved as `status=edited` and kept as future style examples.

---

## 11. Sending (Phase 3 — do not build before I approve Phase 2)

- Gmail API with OAuth for 2 mailboxes. Per-mailbox daily cap from a **warm-up schedule** in config (week 1: 5/day → week 4: 20/day), keyed by mailbox start date.
- Schedule each send for 09:00–11:00 in the recipient's timezone, randomised within the window. Sequence: day 0 / day 4 / day 10, in the same thread. Stop on any reply, bounce or unsubscribe.
- Headers: `List-Unsubscribe` (mailto + HTTPS) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. **The dashboard is private behind Tailscale, so the unsubscribe endpoint needs a public route**: expose only `/u/*` via Tailscale Funnel or a Cloudflare Tunnel. Propose one and tell me the tradeoff.
- Footer appended by code: sender name, physical address (config), one-line unsubscribe.
- Poll threads every 15 min: classify replies (`positive`, `negative`, `out_of_office`, `unsubscribe_request`) with Gemini; bounces from DSN messages → `suppression`.
- Auto-pause a mailbox if its 7-day bounce rate > 3% or any spam complaint signal appears.
- Compliance enforcement before every send (section 11.1).

### 11.1 Compliance regimes

| Regime | Countries | Enforce |
|---|---|---|
| `gdpr_pecr` | EU/EEA, UK | Only `role`/`generic` contacts (no personal named addresses unless on a company domain and role-relevant); opt-out in every email |
| `can_spam` | US | Physical address + working unsubscribe; no deceptive subject |
| `casl` | CA | Only if the address was published on their own site (`found_on_url` present) and the pitch matches the role; otherwise skip |
| `spam_act_au` | AU | Published address only |
| `uu_pdp` | ID | Minimal personal data; suppression honoured |
| `default` | others | Unsubscribe + address; suppression honoured |

---

## 12. Phases and acceptance criteria

**Phase 1 — Research engine**
- Docker Compose (Postgres + pgvector), Drizzle schema + migrations, seed query templates.
- LLM provider layer (Gemini only for now; Claude CLI stub with a health check).
- Discovery (grounding + Places + CSV/manual), enrichment, two-tier filtering (section 7.3), scoring + gates, `llm_calls` logging.
- Dashboard: password gate, **Leads** page with three tabs, each a data table with filters (country, region, segment, score, source, fail code) and daily counts:
  - **Qualified** — `scored` leads, sorted by priority.
  - **Not qualified** — `not_qualified` leads, sorted by priority. Columns: name, domain, segment, country, priority + N/P/C/F, fail codes as chips (hover = detail), platform, PSI mobile, best contact type. Row actions + bulk actions: **Promote to review** (records which codes I overrode) and **Dismiss** (reason defaults to the fail code). Promote/dismiss writes a label.
  - **Auto-excluded** — audit only, with the exclusion reason and a "Move to Not qualified" action in case the AI was wrong.
- **Companies** detail page (screenshots, PSI, weaknesses, contacts — editable, scores with reasons, fail codes).
- ✅ Done when: one command runs a discovery+enrich+score cycle for 20 candidates; 100% end in `scored`, `not_qualified` or `auto_excluded` with reasons stored; all three tabs render; all tests pass; `CLAUDE.md` written.

**Phase 2 — Review, labels, drafts**
- Review queue page, approve/reject + reason codes, example memory + `judge_fit`, portfolio page (CRUD + segment tags), Claude CLI drafting with 3 variants, inline editing.
- ✅ Done when: I can review 30 leads in < 20 minutes, every decision is stored with a reason, and similar past decisions appear on the lead card.

**Phase 3 — Sending** (only after portfolio is live and domain warmed)
- Gmail API, warm-up caps, scheduling, sequences, reply/bounce handling, suppression, public unsubscribe route, compliance enforcement.
- ✅ Done when: dry-run of a full day logs correct schedule times per timezone; one real test send to my own inbox passes SPF/DKIM/DMARC and shows one-click unsubscribe.

**Phase 4 — Learning page**
- Rule proposals, query yield + budget allocation, metrics (approval-rate trend, approved per 100 candidates by source/template, reply and positive-reply rate by segment/country/source/variant), weights-fit script.

---

## 13. Non-goals

- No multi-user accounts, no SaaS, no public dashboard.
- No scraping of social networks, marketplaces or OTAs.
- No SMTP verification probing.
- No automatic WhatsApp or Instagram messaging.
- No auto-applying of learned rules or weights without my approval.

---

## Kickoff

1. Read this whole file.
2. Ask me up to 5 questions whose answers would change the Phase 1 design (e.g. OS of the spare PC, Docker availability, which Gemini models my key can access).
3. After I answer: write the Phase 1 plan (files, dependencies, commands) and wait for my OK.
