import robotsParser from 'robots-parser';
import { env } from '../../config/env';
import { CRAWL } from '../../config/limits';
import { politeness } from './politeness';

type Robots = ReturnType<typeof robotsParser>;

const ALLOW_ALL = robotsParser('https://allow.invalid/robots.txt', '');
const DISALLOW_ALL = robotsParser('https://deny.invalid/robots.txt', 'User-agent: *\nDisallow: /');

const cache = new Map<string, Promise<Robots>>();

/** The product token robots.txt rules are matched against, e.g. `AgungAdityaResearchBot`. */
export function robotsToken(userAgent: string): string {
  return userAgent.split(/[\s/]/)[0] || userAgent;
}

async function load(origin: string, host: string): Promise<Robots> {
  const url = `${origin}/robots.txt`;
  try {
    const res = await politeness.run(host, () =>
      fetch(url, {
        headers: { 'user-agent': env().CRAWLER_USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(CRAWL.timeoutMs),
      }),
    );
    // RFC 9309: 4xx means no restrictions, 5xx means assume everything is disallowed.
    if (res.status >= 500) return DISALLOW_ALL;
    if (!res.ok) return ALLOW_ALL;
    return robotsParser(url, await res.text());
  } catch {
    // Unreachable robots.txt. The homepage fetch decides whether the site is dead.
    return ALLOW_ALL;
  }
}

export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  const { origin, host } = new URL(targetUrl);
  let robots = cache.get(origin);
  if (!robots) {
    robots = load(origin, host);
    cache.set(origin, robots);
  }
  const parsed = await robots;
  if (parsed === ALLOW_ALL) return true;
  if (parsed === DISALLOW_ALL) return false;
  return parsed.isAllowed(targetUrl, robotsToken(env().CRAWLER_USER_AGENT)) ?? true;
}

export function clearRobotsCache(): void {
  cache.clear();
}
