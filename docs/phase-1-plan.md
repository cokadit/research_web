# Phase 1 plan — Research engine

Status: **waiting for approval**. Nothing is built yet.

## Inputs from kickoff

| Question | Answer | Design consequence |
|---|---|---|
| Target OS | Windows native (no WSL workflow) | All scripts are Node/TypeScript, no bash. Paths via `node:path`. Claude CLI binary path is configurable. |
| Postgres | Runs on the spare PC only | Code is written on the Mac; anything needing the database runs on the PC. Unit tests need no database. |
| Gemini key | None yet | Providers get a `mock` mode backed by fixtures. Live run waits for a key. |
| Places / PageSpeed keys | None yet | Both are built against recorded fixtures. Places is off behind `PLACES_ENABLED=false`. |

Note: Docker Desktop on Windows still uses WSL2 or Hyper-V internally. You do not work inside WSL, but one of them must be enabled for Docker to install.

## Build order

Each step ends with something runnable.

1. **Scaffold** — Next.js app, TypeScript strict, Tailwind, shadcn/ui, Vitest, `.env.example`, `.gitignore`, `CLAUDE.md`, `docker-compose.yml` (image `pgvector/pgvector:pg16`).
2. **Pure logic + unit tests** — domain normalisation, contact extraction, scoring, gates, compliance map, query-yield calculation. Runs on the Mac.
3. **Database** — Drizzle schema for every table in section 5 (including Phase 3 tables, unused), migrations, seed for query templates and param lists.
4. **LLM layer** — `LLMProvider` interface, routing config, `GeminiProvider`, `MockProvider`, `ClaudeCliProvider` stub with health check, `llm_calls` logging, zod validation with one retry.
5. **Discovery** — grounding, Places (disabled by default, monthly cap), CSV import, quick-add, dedupe against `companies` and `suppression`.
6. **Enrichment** — polite fetcher (robots.txt, 1 concurrent per domain, 2 s gap, 20 s timeout, user agent), tech detection, PageSpeed, screenshots, contact crawl, MX lookup, classify, critique, country mapping.
7. **Filtering + scoring** — two tiers from section 7.3, all fail codes stored, every lead scored.
8. **Worker** — pg-boss queues `discover:daily`, `enrich:company`, `score:company`, `queue:build`; schedules in `Asia/Makassar`.
9. **Dashboard** — password gate, Leads page (3 tabs, filters, daily counts, promote/dismiss, bulk actions), Company detail page (editable contacts), LLM calls panel, CSV upload, quick-add.
10. **Cycle command + acceptance run** on the spare PC.

## Files

```
CLAUDE.md
docker-compose.yml
.env.example
drizzle.config.ts
vitest.config.ts

app/
  login/page.tsx
  (dashboard)/layout.tsx
  (dashboard)/leads/page.tsx
  (dashboard)/companies/[id]/page.tsx
  (dashboard)/import/page.tsx
  (dashboard)/usage/page.tsx
  api/screenshots/[...path]/route.ts
proxy.ts                         password gate (verify file name for current Next.js)

src/config/
  env.ts                         zod-validated env
  limits.ts                      Places monthly cap, crawl limits
src/db/
  schema.ts  client.ts  seed.ts  migrations/
src/lib/llm/
  types.ts  routing.ts  gemini.ts  claude-cli.ts  mock.ts  log.ts  validate.ts
  prompts/discover.ts  prompts/classify.ts  prompts/critique.ts  prompts/pay-signals.ts
src/lib/discovery/
  templates.ts  grounding.ts  places.ts  csv.ts  quick-add.ts  insert.ts  domain.ts
src/lib/enrich/
  fetcher.ts  robots.ts  homepage.ts  tech.ts  pagespeed.ts  screenshot.ts
  crawl.ts  contacts.ts  mx.ts  classify.ts  critique.ts  major-brands.ts
  marketplaces.ts  pipeline.ts
src/lib/scoring/
  weights.ts  need.ts  pay.ts  contact.ts  fit.ts  gates.ts  tiers.ts  score.ts
src/lib/learning/
  labels.ts  query-yield.ts      (labels written in Phase 1; yield is calc + test only)
src/lib/compliance/
  regimes.ts  geo.ts
src/lib/leads/
  queries.ts  actions.ts         table queries, promote/dismiss/move server actions
worker/
  index.ts  schedules.ts  jobs/discover.ts  jobs/enrich.ts  jobs/score.ts  jobs/queue-build.ts
scripts/
  cycle.ts  check-env.ts
tests/
  scoring.test.ts  gates.test.ts  contacts.test.ts  domain.test.ts
  compliance.test.ts  query-yield.test.ts  tiers.test.ts
  fixtures/
```

## Dependencies

Versions are the current npm releases checked on 2026-09-28.

**Listed in section 2**

| Package | Version |
|---|---|
| next | 16.3.6 |
| react / react-dom | 19.3.0 |
| tailwindcss | 4.3.3 |
| shadcn (CLI) | 4.21.0 |
| drizzle-orm / drizzle-kit | 0.45.3 / 0.31.11 |
| pg-boss | 12.35.0 |
| playwright | 1.63.0 |
| @google/genai | 2.24.0 |
| zod | 4.6.5 |
| vitest | 5.0.2 |

**Not listed in section 2 — need your OK**

| Package | Why |
|---|---|
| postgres (3.4.9) | Database driver for Drizzle. pg-boss brings its own `pg`. |
| sharp (0.35.5) | Playwright cannot save WebP. Converts PNG screenshots to WebP. |
| tldts (7.4.16) | Correct registrable domain for `.co.id`, `.com.au` and similar. |
| robots-parser (3.0.1) | robots.txt parsing. |
| csv-parse (7.0.3) | CSV import. |
| countries-and-timezones (3.10.0) | Country to IANA timezone. |
| tsx (4.23.15) | Runs the worker and scripts in TypeScript, same command on Windows and macOS. |
| dotenv (18.0.4) | Loads `.env` for the worker and scripts. |
| simple-wappalyzer (1.1.106) | Tech detection, see below. |

The password gate uses a signed cookie with `node:crypto`, so no auth package.

### Tech detection proposal

**Recommended: `simple-wappalyzer`** — MIT, released this month, takes HTML + headers + URL that Playwright already has, so no second browser.

Rejected: `wappalyzer-core` and `wapalyzer` (both last published in 2023, fingerprints are stale).

Fallback if its fingerprints prove outdated when tested: vendor the `enthec/webappanalyzer` fingerprint JSON and run it with a small matcher. I will check its licence before doing that.

## Commands

| Command | Does |
|---|---|
| `docker compose up -d` | Start Postgres + pgvector |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed query templates and param lists |
| `npm run dev` | Dashboard |
| `npm run worker` | pg-boss worker and schedules |
| `npm run cycle -- --limit 20` | One discovery + enrich + score cycle, prints a status summary |
| `npm run cycle -- --limit 20 --mock` | Same, with fixture LLM/PSI responses |
| `npm test` | Vitest |
| `npm run check:env` | Validates `.env`, prints Claude CLI auth mode |

Extra env vars beyond section 4: `LLM_MODE` (`live` / `mock`), `PLACES_ENABLED`, `PLACES_MONTHLY_CAP`, `CLAUDE_BIN`, `CRAWLER_USER_AGENT`, `SESSION_SECRET`.

## To verify against official docs during the build

Nothing below is written from memory. Each is checked at the step that needs it, or marked `// TODO(verify)`.

- Gemini model IDs for discovery, extraction, vision and embeddings, and the embedding dimension.
- Whether Search grounding and structured JSON output can be combined in one call. If not, discovery becomes two calls: grounded search, then extraction.
- Places API (New) Text Search field mask and which SKU each field bills to.
- Google Maps Platform terms on storing `place_id` and other Places content.
- PageSpeed Insights v5 response fields for score and LCP.
- pg-boss 12 schedule and timezone API.
- Claude Code CLI JSON envelope and usage-limit error shape, including on Windows.

## Decisions I made, tell me if you disagree

- **Villa management and furniture showrooms rely on Places.** With Places off, those come only from grounding and CSV until you add a key.
- **`fail_reasons` codes** are a fixed list plus `rule:<id>`: `major_brand_uncertain`, `brand_group`, `site_already_good`, `no_contact`, `gate_need`, `gate_contact`, `marketplace_only`.
- **Status during scoring:** Tier 1 checks that need no enrichment (blocklist, duplicate, suppression) run before enrichment to save quota. Those leads are still scored with whatever data exists.
- **`queue:build` in Phase 1** moves leads to `in_review` but generates no drafts.
- **Screenshots** are served through an authenticated API route, not the public folder.

## Acceptance run

The Phase 1 "done" check (20 real candidates end in `scored`, `not_qualified` or `auto_excluded`) needs a Gemini key and a PageSpeed key on the spare PC. Until then I can only prove the pipeline with `--mock`.

## What I need from you

1. OK on this plan and on the 9 extra dependencies.
2. How code reaches the spare PC: a private GitHub repo, or you run Claude Code on the PC directly.
3. On the spare PC: Docker Desktop, Node 22 or later, Git, Claude Code logged in with your Max account.
4. Before the acceptance run: a Gemini API key and a PageSpeed Insights key. Places can wait.
5. Save `prompt.md` into the repo root. The folder is currently empty.
