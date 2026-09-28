import type { ClassifyResult } from '../llm/prompts/classify';
import type { CritiqueResult } from '../llm/prompts/critique';
import type { HomepageOutcome } from '../enrich/site';
import type { Segment } from '../types';

/**
 * Made-up businesses for `LLM_MODE=mock`. Nothing here touches the network.
 * Domains sit under example.org, which is reserved and can never be a real lead.
 */
export interface FixtureSite {
  domain: string;
  name: string;
  segment: Segment;
  country: string;
  city: string;
  outcome: HomepageOutcome;
  platform: string | null;
  psiMobile: number | null;
  psiDesktop: number | null;
  lcpMsMobile: number | null;
  mxOk: boolean;
  emails: string[];
  hasForm: boolean;
  classify: ClassifyResult;
  critique: CritiqueResult;
}

interface Profile {
  label: string;
  outcome: HomepageOutcome;
  psiMobile: number;
  designAge: CritiqueResult['design_age'];
  agencyGrade: boolean;
  defaultTheme: boolean;
  missingFeature: boolean;
  emails: (slug: string) => string[];
  mxOk: boolean;
  hasForm: boolean;
  major: ClassifyResult['major_brand'];
  price: ClassifyResult['pay_signals']['price_level'];
  following: number | null;
  exporter: boolean;
}

const INDEPENDENT: ClassifyResult['major_brand'] = { is_major: false, confidence: 'high', type: null, evidence: 'small independent business' };

// Ten profiles per segment, chosen so every tier and most fail codes appear in a 20-lead run.
const PROFILES: Profile[] = [
  { label: 'slow dated site, founder email', outcome: 'ok', psiMobile: 32, designAge: 'very_dated', agencyGrade: false, defaultTheme: false, missingFeature: true, emails: (s) => [`made@${s}`, `info@${s}`], mxOk: true, hasForm: true, major: INDEPENDENT, price: 'high', following: 24_000, exporter: true },
  { label: 'default theme, sales address', outcome: 'ok', psiMobile: 45, designAge: 'dated', agencyGrade: false, defaultTheme: true, missingFeature: true, emails: (s) => [`sales@${s}`], mxOk: true, hasForm: false, major: INDEPENDENT, price: 'mid', following: 8_000, exporter: true },
  { label: 'dated site, generic inbox', outcome: 'ok', psiMobile: 58, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: true, emails: (s) => [`info@${s}`], mxOk: true, hasForm: true, major: INDEPENDENT, price: 'mid', following: 3_000, exporter: false },
  { label: 'agency-grade fast site', outcome: 'ok', psiMobile: 93, designAge: 'modern', agencyGrade: true, defaultTheme: false, missingFeature: false, emails: (s) => [`hello@${s}`], mxOk: true, hasForm: true, major: INDEPENDENT, price: 'luxury', following: 90_000, exporter: true },
  { label: 'needs work, contact form only', outcome: 'ok', psiMobile: 38, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: true, emails: () => [], mxOk: false, hasForm: true, major: INDEPENDENT, price: 'mid', following: 5_000, exporter: false },
  { label: 'needs work, no contact at all', outcome: 'ok', psiMobile: 41, designAge: 'very_dated', agencyGrade: false, defaultTheme: true, missingFeature: true, emails: () => [], mxOk: false, hasForm: false, major: INDEPENDENT, price: 'low', following: null, exporter: false },
  { label: 'part of a brand group', outcome: 'ok', psiMobile: 47, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: true, emails: (s) => [`marketing@${s}`], mxOk: true, hasForm: true, major: { is_major: true, confidence: 'medium', type: 'brand_group', evidence: 'footer says "a member of Nusantara Holdings"' }, price: 'high', following: 40_000, exporter: true },
  { label: 'dead site', outcome: 'dead', psiMobile: 0, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: false, emails: () => [], mxOk: false, hasForm: false, major: INDEPENDENT, price: null, following: null, exporter: false },
  { label: 'parked domain', outcome: 'parked', psiMobile: 0, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: false, emails: () => [], mxOk: false, hasForm: false, major: INDEPENDENT, price: null, following: null, exporter: false },
  { label: 'redirects to a marketplace store', outcome: 'marketplace', psiMobile: 0, designAge: 'dated', agencyGrade: false, defaultTheme: false, missingFeature: false, emails: () => [], mxOk: false, hasForm: false, major: INDEPENDENT, price: null, following: null, exporter: false },
];

const SEGMENT_DATA: Record<'fashion' | 'furniture' | 'villa_developer', { slug: string; names: string[]; sub: string; cities: [string, string][] }> = {
  fashion: {
    slug: 'fashion',
    names: ['Kanaya Leather', 'Lurik Studio', 'Sora Swim', 'Arunika Batik', 'Tala Jewellery', 'Rupa Modest', 'Bumi Kids', 'Senja Shoes', 'Kala Street', 'Nira Bags'],
    sub: 'independent fashion label',
    cities: [['ID', 'Bandung'], ['ID', 'Yogyakarta'], ['ID', 'Denpasar'], ['MY', 'Kuala Lumpur'], ['AU', 'Melbourne']],
  },
  furniture: {
    slug: 'furniture',
    names: ['Jati Makmur', 'Rotan Lestari', 'Suar Living', 'Bambu Karya', 'Reclaim Java', 'Teak Harbour', 'Anyam Decor', 'Kayu Tua', 'Java Outdoor', 'Ukir Jepara'],
    sub: 'furniture maker and exporter',
    cities: [['ID', 'Jepara'], ['ID', 'Cirebon'], ['ID', 'Solo'], ['VN', 'Ho Chi Minh City'], ['ID', 'Surabaya']],
  },
  villa_developer: {
    slug: 'villa',
    names: ['Canggu Estates', 'Uluwatu Cliff Villas', 'Ubud Ridge', 'Seminyak Homes', 'Lombok Bay', 'Sumba Horizon', 'Pererenan Living', 'Bingin Collective', 'Tegal Villas', 'Kuta Mandalika'],
    sub: 'off-plan villa developer',
    cities: [['ID', 'Canggu'], ['ID', 'Uluwatu'], ['ID', 'Ubud'], ['ID', 'Seminyak'], ['ID', 'Lombok']],
  },
};

function build(segment: keyof typeof SEGMENT_DATA, index: number): FixtureSite {
  const data = SEGMENT_DATA[segment];
  const profile = PROFILES[index % PROFILES.length];
  const name = data.names[index % data.names.length];
  const [country, city] = data.cities[index % data.cities.length];
  const domain = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${data.slug}.example.org`;
  const sellsAbroad = profile.exporter || country !== 'ID';

  const issues: CritiqueResult['issues'] = [];
  if (profile.designAge !== 'modern') issues.push({ code: 'outdated_style', evidence: 'Hero uses a fixed-width layout with bevelled buttons.' });
  if (profile.defaultTheme) issues.push({ code: 'default_theme', evidence: 'Header, fonts and footer credit match the stock theme unchanged.' });
  if (profile.psiMobile < 50) issues.push({ code: 'text_too_small_mobile', evidence: 'Body text on the mobile screenshot is unreadable without zooming.' });

  return {
    domain,
    name,
    segment,
    country,
    city,
    outcome: profile.outcome,
    platform: profile.defaultTheme ? 'WordPress' : index % 2 === 0 ? 'Shopify' : 'Wix',
    psiMobile: profile.outcome === 'ok' ? profile.psiMobile : null,
    psiDesktop: profile.outcome === 'ok' ? Math.min(100, profile.psiMobile + 25) : null,
    lcpMsMobile: profile.outcome === 'ok' ? Math.round(9000 - profile.psiMobile * 70) : null,
    mxOk: profile.mxOk,
    emails: profile.emails(domain),
    hasForm: profile.hasForm,
    classify: {
      name,
      segment,
      sub_category: data.sub,
      country,
      city,
      language: country === 'ID' ? 'id' : 'en',
      summary: `${name} is a ${data.sub} based in ${city}. Fixture profile: ${profile.label}.`,
      sells_abroad: sellsAbroad,
      has_english: country !== 'ID' || index % 3 !== 0,
      has_multicurrency: false,
      has_booking_or_enquiry: profile.hasForm,
      missing_key_features: profile.missingFeature ? [{ feature: 'key feature for segment', evidence: 'No such page or section in the navigation.' }] : [],
      pay_signals: {
        price_level: profile.price,
        review_count: profile.following ? Math.round(profile.following / 200) : null,
        social_following: profile.following,
        active_projects: segment === 'villa_developer' && profile.price ? (index % 3) + 1 : null,
        is_exporter: profile.exporter,
        trade_show_presence: profile.exporter && index % 2 === 0,
        evidence: profile.price ? [`prices suggest ${profile.price} positioning`] : [],
      },
      major_brand: profile.major,
    },
    critique: { design_age: profile.designAge, issues, agency_grade: profile.agencyGrade },
  };
}

export const FIXTURE_SITES: FixtureSite[] = (['fashion', 'furniture', 'villa_developer'] as const).flatMap((segment) =>
  Array.from({ length: PROFILES.length }, (_, i) => build(segment, i)),
);

const BY_DOMAIN = new Map(FIXTURE_SITES.map((s) => [s.domain, s]));

export function fixtureFor(domain: string): FixtureSite | null {
  return BY_DOMAIN.get(domain.toLowerCase()) ?? null;
}

export function fixtureHomepageHtml(site: FixtureSite): string {
  const mailtos = site.emails.map((e) => `<a href="mailto:${e}">${e}</a>`).join(' ');
  const form = site.hasForm ? '<form action="/enquiry" method="post"><input name="name"><input type="email" name="email"><textarea name="message"></textarea></form>' : '';
  const owner = site.emails[0]?.startsWith('made@')
    ? `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Made Wirawan', jobTitle: 'Founder', email: site.emails[0] })}</script>`
    : '';
  const generator = site.platform === 'WordPress' ? '<meta name="generator" content="WordPress 6.4">' : '';
  return `<!doctype html><html lang="en"><head><title>${site.name}</title>${generator}${owner}</head>
<body><header><a href="/about">About</a> <a href="/contact">Contact</a></header>
<main><h1>${site.name}</h1><p>${site.classify.summary}</p></main>
<footer>${mailtos}${form}</footer></body></html>`;
}
