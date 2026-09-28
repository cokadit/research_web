import 'dotenv/config';
import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().finite());

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  GEMINI_API_KEY: optional,
  GOOGLE_PLACES_API_KEY: optional,
  PAGESPEED_API_KEY: optional,
  DASHBOARD_PASSWORD: optional,
  SESSION_SECRET: optional,

  LLM_MODE: z.enum(['live', 'mock']).default('mock'),
  LLM_DISCOVERY_MODEL: optional,
  LLM_EXTRACT_MODEL: optional,
  LLM_VISION_MODEL: optional,
  LLM_EMBED_MODEL: optional,
  EMBED_DIM: num(768),
  DRAFT_PROVIDER: z.enum(['claude-cli', 'gemini']).default('claude-cli'),
  CLAUDE_BIN: z.string().default('claude'),

  DAILY_CANDIDATE_TARGET: num(120),
  DAILY_REVIEW_QUEUE_SIZE: num(30),
  EXPLORATION_SHARE: num(0.2),

  PLACES_ENABLED: bool(false),
  PLACES_MONTHLY_CAP: num(500),

  CRAWLER_USER_AGENT: z.string().default('AgungAdityaResearchBot/1.0 (+contact: set CRAWLER_USER_AGENT in .env)'),
  SCREENSHOT_DIR: z.string().default('data/screenshots'),

  SEND_ENABLED: bool(false),
  PUBLIC_UNSUBSCRIBE_BASE_URL: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
