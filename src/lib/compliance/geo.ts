import { getCountry } from 'countries-and-timezones';
import { normaliseCountry } from './regimes';

const REGIONS: Record<string, string[]> = {
  'Southeast Asia': ['ID', 'MY', 'SG', 'TH', 'VN', 'PH', 'KH', 'LA', 'MM', 'BN', 'TL'],
  'East Asia': ['JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'MN'],
  'South Asia': ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV'],
  'Middle East': ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO', 'LB', 'TR', 'EG', 'IQ', 'IR'],
  Oceania: ['AU', 'NZ', 'FJ', 'PG'],
  'North America': ['US', 'CA', 'MX'],
  'Latin America': ['BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'EC', 'CR', 'PA', 'DO', 'GT', 'BO', 'PY', 'VE'],
  Europe: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
    'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH', 'RS', 'UA', 'AL', 'BA',
    'ME', 'MK', 'MD', 'MC', 'AD', 'SM',
  ],
  Africa: ['ZA', 'NG', 'KE', 'MA', 'GH', 'TZ', 'ET', 'TN', 'DZ', 'SN', 'UG', 'RW', 'MU'],
};

const REGION_BY_COUNTRY = new Map<string, string>(
  Object.entries(REGIONS).flatMap(([region, list]) => list.map((c) => [c, region] as const)),
);

// Countries with several timezones: the zone where most businesses sit.
const MAIN_TIMEZONE: Record<string, string> = {
  ID: 'Asia/Jakarta',
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  RU: 'Europe/Moscow',
  CN: 'Asia/Shanghai',
  ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
  NZ: 'Pacific/Auckland',
  CL: 'America/Santiago',
  AR: 'America/Argentina/Buenos_Aires',
};

// Central Indonesia time (WITA).
const WITA_PLACES = /\b(bali|denpasar|canggu|uluwatu|ubud|seminyak|kuta|sanur|jimbaran|lombok|sumba|labuan bajo|flores|makassar|balikpapan)\b/i;

export function regionForCountry(country: string | null | undefined): string | null {
  const iso = normaliseCountry(country);
  return iso ? (REGION_BY_COUNTRY.get(iso) ?? 'Other') : null;
}

export function timezoneForCountry(country: string | null | undefined, city?: string | null): string | null {
  const iso = normaliseCountry(country);
  if (!iso) return null;
  if (iso === 'ID' && city && WITA_PLACES.test(city)) return 'Asia/Makassar';
  if (MAIN_TIMEZONE[iso]) return MAIN_TIMEZONE[iso];
  return getCountry(iso)?.timezones[0] ?? null;
}
