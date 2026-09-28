import type { ComplianceRegime } from '../types';

// EU member states + EEA (IS, LI, NO) + UK.
const GDPR_PECR = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB',
]);

export function regimeForCountry(country: string | null | undefined): ComplianceRegime {
  const iso = normaliseCountry(country);
  if (!iso) return 'default';
  if (GDPR_PECR.has(iso)) return 'gdpr_pecr';
  if (iso === 'US') return 'can_spam';
  if (iso === 'CA') return 'casl';
  if (iso === 'AU') return 'spam_act_au';
  if (iso === 'ID') return 'uu_pdp';
  return 'default';
}

export function normaliseCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const iso = country.trim().toUpperCase();
  if (iso === 'UK') return 'GB';
  return /^[A-Z]{2}$/.test(iso) ? iso : null;
}
