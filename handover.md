# Handover — set up on the Windows PC

This file is for Claude Code running on the spare Windows PC. Open this folder in VS Code, start Claude Code and say:

> Read handover.md and CLAUDE.md, then do the setup steps in order. Stop and tell me when a step needs me.

## Context

- Phase 1 (research engine) was built on a Mac and verified in **mock mode only**.
- Nothing has been run on Windows, with Docker, with pgvector, or against real APIs.
- Target: Windows native (no WSL workflow), always on, dashboard reached over Tailscale.
- Do not start Phase 2. Do not set `SEND_ENABLED=true`.
- Spec: `prompt.md`. Conventions and folder map: `CLAUDE.md`. Plan: `docs/phase-1-plan.md`.

## Rules for this setup

- Use commands that work in PowerShell. No bash-only syntax.
- Never print or commit the contents of `.env`.
- If a step fails, diagnose and fix the cause. Report what changed.
- Ask the user before installing system software or changing Windows settings.

## Step 0 — get the code onto this PC

The repo on the Mac has uncommitted work. One of these must have happened before this file is read on Windows:

- the folder was copied over (without `node_modules`, `.next`, `data/screenshots/*`), or
- it was committed and pushed to a private Git remote, then cloned here.

Check: `prompt.md`, `CLAUDE.md`, `package.json`, `src/db/migrations/0000_init.sql` exist.

## Step 1 — prerequisites (needs the user)

Check each and report the version. Install only what is missing, after asking.

| Tool | Check | Need |
|---|---|---|
| Node.js | `node -v` | 22.12 or later |
| Git | `git --version` | any recent |
| Docker Desktop | `docker --version` and `docker compose version` | running, needs WSL2 or Hyper-V enabled |
| Claude Code | `claude --version` | signed in with the Max account |
| Tailscale | `tailscale status` | optional now, needed for remote access |

Then run `claude auth status`. Expected: `loggedIn: true`, `authMethod: "claude.ai"`, `subscriptionType: "max"`.

Check that `ANTHROPIC_API_KEY` is **not** set in the user or system environment (`echo $env:ANTHROPIC_API_KEY`). If it is, tell the user to remove it.

## Step 2 — install

```
npm install
npm run browsers:install
```

`sharp` and Playwright download Windows binaries here. If `npm install` fails on a native module, report the exact error.

## Step 3 — database

```
docker compose up -d
docker compose ps
```

Wait until the `db` service is `healthy`. Postgres listens on `127.0.0.1:5432`. If port 5432 is taken, change the host port in `docker-compose.yml` and in `DATABASE_URL`.

## Step 4 — `.env` (needs the user)

Copy `.env.example` to `.env`. Ask the user for the values; do not invent them.

| Variable | Value |
|---|---|
| `DATABASE_URL` | keep the default unless the port changed |
| `DASHBOARD_PASSWORD` | user chooses |
| `SESSION_SECRET` | generate 48 random characters, e.g. `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` |
| `CRAWLER_USER_AGENT` | `AgungAdityaResearchBot/1.0 (+<user's URL or email>)` |
| `CLAUDE_BIN` | full path to `claude.exe`, find it with `where.exe claude` |
| `LLM_MODE` | `mock` for now |

Leave the API keys empty until Step 8.

Then:

```
npm run check:env
```

Expected: `Environment OK.` and `Claude CLI: subscription`.

## Step 5 — migrate and seed

```
npm run db:migrate
npm run db:seed
```

**This is the first time the migration runs with pgvector.** The `examples` table and its HNSW index were never applied on the Mac. If it fails, fix the schema or migration and report it.

Expected seed output: `12 template(s) added`.

## Step 6 — checks

```
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: 148 tests pass, no type or lint errors, build succeeds.

Watch for Windows-only failures: path separators, screenshot paths, spawning `claude.exe`.

## Step 7 — mock cycle and dashboard

```
npm run cycle -- --limit 20 --mock
```

Expected: `PASS: all 20 leads ended in scored, not_qualified or auto_excluded with reasons stored.` On the Mac the split was 6 scored, 11 not qualified, 3 auto-excluded.

Then start both processes in separate terminals:

```
npm run dev
npm run worker
```

Worker must log `[worker] ready`. Dashboard: http://localhost:3000.

Ask the user to check in the browser:

- sign in with the password
- Leads: all three tabs show rows, fail-code chips show detail on hover
- Not qualified: Promote and Dismiss work, single and bulk
- Auto-excluded: "Move to Not qualified" works
- a company page shows screenshots, scores with reasons, and lets them add a contact
- Import: quick add one brand; the worker log shows it enriched and scored
- Usage: shows today's mock LLM calls

## Step 8 — live acceptance run (needs the user)

Needs from the user:

1. **Gemini API key on a billing-enabled project.** Search grounding is not available on the free tier.
2. **PageSpeed Insights API key.**

Set in `.env`: `LLM_MODE=live`, `GEMINI_API_KEY`, `PAGESPEED_API_KEY`. Keep `PLACES_ENABLED=false`.

Before the run, clear the mock data so fixture leads do not mix with real ones. Ask the user first, then truncate: `companies`, `contacts`, `signals`, `scores`, `labels`, `query_runs`, `llm_calls`, `api_calls` (cascade). Keep `query_templates`.

```
npm run check:env
npm run cycle -- --limit 20
```

Phase 1 is done when this prints `PASS` for 20 real candidates and all three tabs render.

During this run, resolve the three `TODO(verify)` items and report findings:

| Item | File | What to confirm |
|---|---|---|
| Grounding + JSON | `src/lib/llm/gemini.ts` | Grounded discovery returns parseable JSON and grounding sources are stored on `query_runs` |
| PageSpeed LCP | `src/lib/enrich/pagespeed-parse.ts` | `audits['largest-contentful-paint'].numericValue` exists; `lcp_ms_mobile` is filled |
| Claude CLI envelope | `src/lib/llm/claude-cli.ts` | Not needed until Phase 2. Leave as is |

Also judge on real sites and report:

- tech detection quality (`platform` filled for Shopify, WordPress, Wix sites)
- contact extraction quality
- whether classify and critique output looks sensible
- time per lead and total cost shown on the Usage page

## Step 9 — keep it running (needs the user)

Propose, do not apply without approval:

- Docker Desktop set to start at login
- dashboard (`npm run build` then `npm run start`) and worker (`npm run worker`) started at boot, via Task Scheduler or NSSM
- Windows sleep disabled
- Tailscale installed, dashboard reached at `http://<tailnet-name>:3000`
- a scheduled `pg_dump` backup of the database

## Open decisions for the user

1. **Places.** Google's terms allow storing only `place_id`. A domain derived from the Places website link is not covered by any exception. Places stays off until the user decides.
2. **Approve Phase 1** or ask for changes. Phase 2 starts only after that.

## Known differences from the spec

- Queue names use dots (`discover.daily`), because pg-boss rejects colons.
- Extra fail codes: `robots_blocked`, `wrong_segment`, `enrich_incomplete`.
- Promote moves a lead to review immediately.
- A named contact with unknown role scores 85.
- Instagram or marketplace links from quick add are stored as `instagram.com/brand` and never crawled.

## Report back

When done, give the user a short report: which steps passed, what was changed to make Windows work, findings from the live run, and what is still open.
