export interface FetchedPage {
  url: string;
  title: string;
  html: string;
  /** Visible text, whitespace collapsed. */
  text: string;
  /** Absolute same-site links found on the page. */
  links: string[];
}

export type HomepageOutcome = 'ok' | 'dead' | 'parked' | 'marketplace' | 'linktree' | 'robots_blocked';

export interface HomepageResult {
  outcome: HomepageOutcome;
  detail: string;
  httpStatus: number | null;
  finalUrl: string | null;
  headers: Record<string, string>;
  page: FetchedPage | null;
  /** WebP, above the fold. */
  screenshots: { desktop: Buffer | null; mobile: Buffer | null };
}

export interface SiteSession {
  homepage(): Promise<HomepageResult>;
  /** Fetches one internal page. Returns null when robots.txt forbids it or the fetch fails. */
  page(url: string): Promise<FetchedPage | null>;
  close(): Promise<void>;
}

export interface SiteFetcher {
  open(domain: string): Promise<SiteSession>;
  shutdown(): Promise<void>;
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Internal links worth reading for contacts and context, best matches first, at most `limit`. */
export function pickInternalLinks(links: string[], homepageUrl: string, pattern: RegExp, limit: number): string[] {
  let origin: string;
  try {
    origin = new URL(homepageUrl).origin;
  } catch {
    return [];
  }
  const seen = new Set<string>([new URL(homepageUrl).pathname.replace(/\/+$/, '')]);
  const picked: { url: string; rank: number }[] = [];
  const order = ['contact', 'about', 'team', 'story', 'wholesale', 'trade', 'investor'];

  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link, homepageUrl);
    } catch {
      continue;
    }
    if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|webp|gif|zip|mp4|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const path = u.pathname.replace(/\/+$/, '');
    if (seen.has(path) || !pattern.test(path)) continue;
    seen.add(path);
    const lower = path.toLowerCase();
    const rank = order.findIndex((word) => lower.includes(word));
    // Shallow paths first: /contact beats /blog/2019/contact-lens-story.
    picked.push({ url: `${u.origin}${u.pathname}`, rank: (rank === -1 ? order.length : rank) + path.split('/').length * 0.1 });
  }
  return picked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((p) => p.url);
}
