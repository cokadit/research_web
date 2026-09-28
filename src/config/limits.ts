export const CRAWL = {
  timeoutMs: 20_000,
  minGapPerDomainMs: 2_000,
  maxInternalPages: 5,
  internalPagePattern: /contact|about|team|wholesale|trade|investor|story/i,
  maxTextCharsPerPage: 6_000,
} as const;

export const SCREENSHOTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  webpQuality: 80,
} as const;

export const ENRICH_CONCURRENCY = 3;
export const DISCOVERY_MAX_RESULTS_PER_QUERY = 10;
export const PAGESPEED_TIMEOUT_MS = 90_000;
export const CLAUDE_CLI_TIMEOUT_MS = 120_000;

export const SCHEDULE_TZ = 'Asia/Makassar';
export const SCHEDULES = {
  discoverDaily: '0 2 * * *',
  queueBuild: '0 6 * * *',
} as const;
