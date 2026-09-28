import type { ContactType } from '../types';
import { registrableDomain } from '../discovery/domain';

export interface ExtractedContact {
  email: string;
  name: string | null;
  role: string | null;
  contactType: ContactType;
  foundOnUrl: string;
}

const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}/gi;

const GENERIC_LOCALS = new Set([
  'info', 'hello', 'hi', 'halo', 'hallo', 'contact', 'contacts', 'contactus', 'kontak', 'admin', 'office', 'mail',
  'email', 'enquiry', 'enquiries', 'inquiry', 'inquiries', 'support', 'help', 'cs', 'care', 'customercare',
  'customerservice', 'service', 'team', 'general', 'welcome', 'ask', 'web', 'website', 'online', 'shop', 'store',
]);

const ROLE_LOCALS = new Set([
  'sales', 'marketing', 'export', 'exports', 'wholesale', 'trade', 'b2b', 'press', 'pr', 'media', 'partnership',
  'partnerships', 'business', 'bd', 'bizdev', 'reservation', 'reservations', 'booking', 'bookings', 'order',
  'orders', 'invest', 'investor', 'investors', 'investment', 'management', 'owner', 'founder', 'ceo', 'director',
  'procurement', 'purchasing', 'design', 'studio', 'projects', 'project', 'collab', 'collaboration',
]);

// Addresses that are never a real contact.
const IGNORED_LOCALS = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster', 'abuse', 'privacy', 'dpo', 'webmaster', 'hostmaster', 'example', 'user', 'name', 'you', 'your', 'youremail', 'email', 'test']);
const IGNORED_DOMAINS = new Set(['example.com', 'example.org', 'domain.com', 'email.com', 'yourdomain.com', 'sentry.io', 'wixpress.com', 'sentry-next.wixpress.com', 'godaddy.com', 'shopify.com', 'squarespace.com', 'wordpress.com', 'wordpress.org', 'w3.org', 'schema.org', 'google.com', 'gstatic.com']);
const ASSET_TLD = /\.(png|jpe?g|gif|webp|svg|avif|css|js|woff2?|ttf|ico|mp4|pdf)$/i;

const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.id', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'ymail.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'mail.com']);

const ENTITIES: Record<string, string> = { '&#64;': '@', '&#x40;': '@', '&commat;': '@', '&#46;': '.', '&#x2e;': '.', '&period;': '.', '&nbsp;': ' ', '&amp;': '&' };

function decodeEntities(text: string): string {
  return text
    .replace(/&(#64|#x40|commat|#46|#x2e|period|nbsp|amp);/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

/** Rewrites `name [at] brand (dot) com` and similar into a plain address. */
export function deobfuscate(text: string): string {
  return decodeEntities(text)
    .replace(/\s*(?:\[|\(|\{)\s*(?:at|a)\s*(?:\]|\)|\})\s*/gi, '@')
    .replace(/\s*(?:\[|\(|\{)\s*(?:dot|d|titik)\s*(?:\]|\)|\})\s*/gi, '.')
    .replace(/([a-z0-9._%+-]+)\s+(?:at|AT)\s+([a-z0-9-]+)\s+(?:dot|DOT)\s+([a-z]{2,24})\b/g, '$1@$2.$3')
    .replace(/([a-z0-9._%+-]+@[a-z0-9-]+)\s+(?:dot|DOT)\s+([a-z]{2,24})\b/gi, '$1.$2');
}

function isPlausible(email: string): boolean {
  const [local, domain] = email.split('@');
  if (!local || !domain || local.length > 64 || email.length > 254) return false;
  if (ASSET_TLD.test(domain) || /\.\./.test(email)) return false;
  // Retina image names like logo@2x.png, hashes like 3f2a...@sentry
  if (/^\d+x$/i.test(domain.split('.')[0])) return false;
  if (/^[0-9a-f]{24,}$/i.test(local)) return false;
  if (IGNORED_LOCALS.has(local) || IGNORED_DOMAINS.has(domain)) return false;
  return registrableDomain(domain) !== null;
}

function clean(email: string): string {
  return email.trim().toLowerCase().replace(/^[._%+-]+/, '').replace(/[.]+$/, '');
}

export function extractEmailsFromText(text: string): string[] {
  const found = deobfuscate(text).match(EMAIL) ?? [];
  return [...new Set(found.map(clean).filter(isPlausible))];
}

function mailtoEmails(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?]+)/gi)) {
    let value = m[1];
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep the raw value
    }
    for (const part of value.split(/[,;]/)) out.push(...extractEmailsFromText(part));
  }
  return out;
}

interface SchemaOrgContact {
  email: string;
  name: string | null;
  role: string | null;
}

const ORG_TYPES = /Organization|LocalBusiness|Store|Hotel|LodgingBusiness|RealEstateAgent|Corporation|Brand|Person/i;

function walkJsonLd(node: unknown, out: SchemaOrgContact[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const type = Array.isArray(obj['@type']) ? obj['@type'].join(' ') : String(obj['@type'] ?? '');
  if (typeof obj.email === 'string' && (ORG_TYPES.test(type) || type === 'ContactPoint')) {
    const isPerson = /Person/i.test(type);
    for (const email of extractEmailsFromText(obj.email.replace(/^mailto:/i, ''))) {
      out.push({
        email,
        name: isPerson && typeof obj.name === 'string' ? obj.name : null,
        role: isPerson && typeof obj.jobTitle === 'string' ? obj.jobTitle : typeof obj.contactType === 'string' ? obj.contactType : null,
      });
    }
  }
  for (const value of Object.values(obj)) if (value && typeof value === 'object') walkJsonLd(value, out);
}

export function extractSchemaOrgContacts(html: string): SchemaOrgContact[] {
  const out: SchemaOrgContact[] = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkJsonLd(JSON.parse(m[1].trim()), out);
    } catch {
      // malformed JSON-LD is common, skip it
    }
  }
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function classifyContactType(email: string, companyDomain?: string | null): Exclude<ContactType, 'form_only'> {
  const [local, domain] = email.toLowerCase().split('@');
  const base = local.split('+')[0];
  const compact = base.replace(/[._-]/g, '');
  if (GENERIC_LOCALS.has(base) || GENERIC_LOCALS.has(compact)) return 'generic';
  if (ROLE_LOCALS.has(base) || ROLE_LOCALS.has(compact)) return 'role';
  // sales.bali@, export-team@
  if (base.split(/[._-]/).some((part) => ROLE_LOCALS.has(part))) return 'role';
  if (base.split(/[._-]/).some((part) => GENERIC_LOCALS.has(part))) return 'generic';

  // brandname@gmail.com is the shop inbox, not a person.
  const brand = companyDomain ? registrableDomain(companyDomain)?.split('.')[0]?.replace(/[^a-z0-9]/g, '') : null;
  if (brand && brand.length >= 3 && (compact.includes(brand) || brand.includes(compact))) return 'generic';
  if (FREEMAIL.has(domain) && !/^[a-z]+([._-][a-z]+)+$/.test(base) && /\d{3,}|official|store|shop|studio|id$/.test(base)) return 'generic';
  return 'named';
}

export function hasContactForm(html: string): boolean {
  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const form = m[0];
    if (/type\s*=\s*["']?search/i.test(form) && !/<textarea/i.test(form)) continue;
    const hasMessage = /<textarea/i.test(form);
    const hasEmail = /type\s*=\s*["']?email|name\s*=\s*["'][^"']*e-?mail/i.test(form);
    const newsletter = /newsletter|subscribe|mailchimp|klaviyo/i.test(form) && !hasMessage;
    if (!newsletter && (hasMessage || (hasEmail && /name\s*=\s*["'][^"']*(message|name|phone|subject|enquiry|inquiry)/i.test(form)))) return true;
  }
  return false;
}

/** All contacts on one page. mailto and schema.org win over loose text matches for the same address. */
export function extractContacts(html: string, pageUrl: string, companyDomain?: string | null): ExtractedContact[] {
  const byEmail = new Map<string, ExtractedContact>();
  const put = (email: string, name: string | null, role: string | null) => {
    const existing = byEmail.get(email);
    if (existing) {
      existing.name ??= name;
      existing.role ??= role;
      return;
    }
    byEmail.set(email, { email, name, role, contactType: classifyContactType(email, companyDomain), foundOnUrl: pageUrl });
  };

  for (const c of extractSchemaOrgContacts(html)) put(c.email, c.name, c.role);
  for (const email of mailtoEmails(html)) put(email, null, null);
  for (const email of extractEmailsFromText(stripTags(html))) put(email, null, null);
  return [...byEmail.values()];
}
