import { parse } from 'tldts';

// Rule 10: these hosts are never fetched. Leads found there are manual entry only.
export const NO_CRAWL_HOSTS = [
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'shopee.co.id',
  'shopee.com',
  'shopee.sg',
  'shopee.com.my',
  'tokopedia.com',
  'etsy.com',
  'airbnb.com',
  'booking.com',
  'linktr.ee',
] as const;

export const MARKETPLACE_HOSTS = ['shopee', 'tokopedia', 'etsy'] as const;

export interface NormalisedCandidate {
  /** Unique key stored in companies.domain. */
  domain: string;
  /** Registrable domain, e.g. brand.co.id for shop.brand.co.id. */
  registrable: string;
  /** True when the host must never be fetched (social network, marketplace, OTA). */
  noCrawl: boolean;
}

function withProtocol(input: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
}

/** Lowercase host without `www.`, port, path or query. Returns null for anything that is not a public hostname. */
export function normaliseDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const parsed = parse(withProtocol(raw), { allowPrivateDomains: false });
  if (!parsed.hostname || parsed.isIp || !parsed.domain || !parsed.isIcann) return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
}

export function registrableDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const parsed = parse(withProtocol(raw), { allowPrivateDomains: false });
  if (parsed.isIp || !parsed.domain || !parsed.isIcann) return null;
  return parsed.domain.toLowerCase();
}

export function isNoCrawlHost(domainOrUrl: string): boolean {
  const reg = registrableDomain(domainOrUrl);
  if (!reg) return false;
  if ((NO_CRAWL_HOSTS as readonly string[]).includes(reg)) return true;
  // Shopee runs one ccTLD per country.
  return /^shopee\.[a-z.]+$/.test(reg);
}

export function isMarketplaceUrl(url: string): boolean {
  const reg = registrableDomain(url);
  if (!reg) return false;
  const label = reg.split('.')[0];
  return (MARKETPLACE_HOSTS as readonly string[]).includes(label);
}

/**
 * Turns a discovered or typed URL into the key stored in companies.domain.
 * A brand that only lives on a no-crawl host keeps its first path segment
 * (instagram.com/brand) so two brands on the same host stay distinct.
 */
export function normaliseCandidate(input: string): NormalisedCandidate | null {
  const domain = normaliseDomain(input);
  const registrable = registrableDomain(input);
  if (!domain || !registrable) return null;
  if (!isNoCrawlHost(domain)) return { domain, registrable, noCrawl: false };

  let handle = '';
  try {
    const { pathname } = new URL(withProtocol(input.trim()));
    handle = pathname.split('/').filter(Boolean)[0]?.toLowerCase().replace(/^@/, '') ?? '';
  } catch {
    return null;
  }
  if (!handle) return null;
  return { domain: `${domain}/${handle}`, registrable, noCrawl: true };
}
