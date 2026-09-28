# Lead research and outreach system

Finds independent businesses with weak websites, scores them, and queues them for review. Single user, self-hosted. The full specification is in [prompt.md](prompt.md).

Phase 1 (research engine) is built. Sending email is not built and stays off.

## Requirements

- Node.js 22.12 or later
- Docker Desktop (on Windows it needs WSL2 or Hyper-V enabled)
- Git
- Claude Code, signed in with the Max account (used from Phase 2)

## First-time setup

Run these in the project folder. They work the same in PowerShell, Git Bash and macOS Terminal.

```
npm install
npm run browsers:install
docker compose up -d
```

Copy `.env.example` to `.env`, then set at least:

| Variable | Value |
|---|---|
| `DASHBOARD_PASSWORD` | The password for the dashboard |
| `SESSION_SECRET` | 32 or more random characters |
| `CRAWLER_USER_AGENT` | Replace the placeholder with a way to reach you |
| `CLAUDE_BIN` | On Windows, the full path to `claude.exe` |

Then:

```
npm run check:env
npm run db:migrate
npm run db:seed
```

## Try it without any API key

```
npm run cycle -- --limit 20 --mock
npm run dev
```

Open http://localhost:3000 and sign in. Mock mode uses made-up businesses under `example.org` and never touches the network.

## Run it for real

1. In `.env` set `LLM_MODE=live`, `GEMINI_API_KEY` and `PAGESPEED_API_KEY`.
2. Run `npm run check:env`.
3. Run `npm run cycle -- --limit 20`.

The Gemini project needs billing enabled. Search grounding is not available on the free tier.

For daily operation keep two processes running:

```
npm run build
npm run start
npm run worker
```

The worker runs discovery at 02:00 and builds the review queue at 06:00, Bali time.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Dashboard in development mode |
| `npm run worker` | Background jobs and schedules |
| `npm run cycle -- --limit 20` | One discovery, enrichment and scoring cycle |
| `npm run check:env` | Checks `.env` and the Claude login |
| `npm test` | Unit tests |
| `npm run db:migrate` | Applies database migrations |
| `npm run db:seed` | Adds the starting query templates |

## Places discovery

Off by default. To turn it on set `PLACES_ENABLED=true` and `GOOGLE_PLACES_API_KEY`. `PLACES_MONTHLY_CAP` stops calls once reached; the Usage page shows the count.
