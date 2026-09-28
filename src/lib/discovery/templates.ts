import type { Segment } from '../types';

export interface SeedTemplate {
  segment: Segment;
  template: string;
  params: Record<string, string[]>;
}

const CATEGORIES = ['bags', 'leather goods', 'swimwear', 'streetwear', 'modest wear', 'batik', 'jewellery', 'shoes', 'kidswear'];
const MATERIALS = ['teak', 'rattan', 'suar wood', 'bamboo', 'reclaimed wood'];
const AREAS = ['Canggu', 'Uluwatu', 'Ubud', 'Seminyak', 'Lombok', 'Sumba'];

// Cities and regions across Indonesia.
const ID_CITIES = ['Jakarta', 'Bandung', 'Yogyakarta', 'Surabaya', 'Denpasar', 'Semarang', 'Solo', 'Malang', 'Medan', 'Makassar'];
const ID_FURNITURE_CITIES = ['Jepara', 'Cirebon', 'Solo', 'Yogyakarta', 'Semarang', 'Surabaya', 'Denpasar', 'Pasuruan'];
const ID_REGIONS = ['Central Java', 'East Java', 'West Java', 'Bali', 'Yogyakarta'];

// International list. Edit in the dashboard or in the query_templates.params column.
const INTL_CITIES = ['Singapore', 'Kuala Lumpur', 'Bangkok', 'Ho Chi Minh City', 'Manila', 'Melbourne', 'Sydney', 'Lisbon', 'Barcelona', 'Cape Town'];
const INTL_COUNTRIES = ['Indonesia', 'Malaysia', 'Thailand', 'Vietnam', 'Philippines', 'Australia', 'Portugal', 'Spain', 'Mexico', 'South Africa'];
const INTL_FURNITURE_REGIONS = ['Vietnam', 'Philippines', 'Thailand', 'Malaysia', 'India'];

export const SEED_TEMPLATES: SeedTemplate[] = [
  { segment: 'fashion', template: 'independent {category} brand {city} order via WhatsApp', params: { category: CATEGORIES, city: [...ID_CITIES, ...INTL_CITIES] } },
  { segment: 'fashion', template: '{category} label {country} ships worldwide small brand', params: { category: CATEGORIES, country: INTL_COUNTRIES } },
  { segment: 'fashion', template: 'handmade {category} brand {city} instagram shop', params: { category: CATEGORIES, city: [...ID_CITIES, ...INTL_CITIES] } },

  { segment: 'furniture', template: '{material} furniture exporter {region} catalogue', params: { material: MATERIALS, region: [...ID_REGIONS, ...INTL_FURNITURE_REGIONS] } },
  { segment: 'furniture', template: '{material} furniture manufacturer {city} wholesale inquiry', params: { material: MATERIALS, city: ID_FURNITURE_CITIES } },
  { segment: 'furniture', template: 'home decor maker {city} export', params: { city: [...ID_FURNITURE_CITIES, ...INTL_CITIES] } },

  { segment: 'villa_developer', template: 'villa off-plan {area} investment', params: { area: AREAS } },
  { segment: 'villa_developer', template: 'villa development company {area} leasehold', params: { area: AREAS } },
  { segment: 'villa_developer', template: 'villa management company {area}', params: { area: AREAS } },
];

// Places Text Search queries. Only used when PLACES_ENABLED=true.
export const SEED_PLACES_TEMPLATES: SeedTemplate[] = [
  { segment: 'villa_developer', template: 'villa management company in {area}', params: { area: AREAS } },
  { segment: 'furniture', template: '{material} furniture showroom in {city}', params: { material: MATERIALS, city: ID_FURNITURE_CITIES } },
  { segment: 'furniture', template: 'furniture workshop in {city}', params: { city: ID_FURNITURE_CITIES } },
];

export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1]))];
}

/** Fills placeholders. Throws when a placeholder has no value, so a broken template never reaches the API. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{([a-z_]+)\}/gi, (_, key: string) => {
      const value = values[key];
      if (!value) throw new Error(`Template "${template}" has no value for {${key}}`);
      return value;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Picks one value per placeholder. `random` is injectable for tests. */
export function pickValues(template: string, params: Record<string, string[]>, random: () => number = Math.random): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of placeholders(template)) {
    const options = params[key] ?? [];
    if (options.length === 0) throw new Error(`Template "${template}" has no options for {${key}}`);
    values[key] = options[Math.floor(random() * options.length)];
  }
  return values;
}
