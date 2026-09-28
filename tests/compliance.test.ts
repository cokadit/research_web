import { describe, expect, it } from 'vitest';
import { regionForCountry, timezoneForCountry } from '../src/lib/compliance/geo';
import { regimeForCountry } from '../src/lib/compliance/regimes';

describe('regimeForCountry', () => {
  it.each([
    ['DE', 'gdpr_pecr'],
    ['FR', 'gdpr_pecr'],
    ['NO', 'gdpr_pecr'],
    ['IS', 'gdpr_pecr'],
    ['GB', 'gdpr_pecr'],
    ['UK', 'gdpr_pecr'],
    ['US', 'can_spam'],
    ['CA', 'casl'],
    ['AU', 'spam_act_au'],
    ['ID', 'uu_pdp'],
    ['SG', 'default'],
    ['CH', 'default'],
    ['JP', 'default'],
  ])('%s → %s', (country, regime) => {
    expect(regimeForCountry(country)).toBe(regime);
  });

  it('is case and whitespace tolerant', () => {
    expect(regimeForCountry(' id ')).toBe('uu_pdp');
  });

  it('falls back to default for missing or invalid input', () => {
    expect(regimeForCountry(null)).toBe('default');
    expect(regimeForCountry('')).toBe('default');
    expect(regimeForCountry('Indonesia')).toBe('default');
  });
});

describe('geo', () => {
  it('maps country to region', () => {
    expect(regionForCountry('ID')).toBe('Southeast Asia');
    expect(regionForCountry('it')).toBe('Europe');
    expect(regionForCountry('ZZ')).toBe('Other');
    expect(regionForCountry(null)).toBeNull();
  });
  it('maps country to an IANA timezone', () => {
    expect(timezoneForCountry('ID')).toBe('Asia/Jakarta');
    expect(timezoneForCountry('ID', 'Canggu, Bali')).toBe('Asia/Makassar');
    expect(timezoneForCountry('SG')).toBe('Asia/Singapore');
    expect(timezoneForCountry('US')).toBe('America/New_York');
    expect(timezoneForCountry(null)).toBeNull();
  });
});
