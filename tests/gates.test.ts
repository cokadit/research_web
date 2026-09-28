import { describe, expect, it } from 'vitest';
import { evaluateGates, gatesPass } from '../src/lib/scoring/gates';
import { decideTier, type TierInput } from '../src/lib/scoring/tiers';

const passing: TierInput = {
  blocklisted: null,
  majorBrand: null,
  siteFailure: null,
  duplicateOf: null,
  suppressed: null,
  marketplaceOnly: null,
  agencyGrade: false,
  psiMobile: 40,
  hasUsableEmail: true,
  hasForm: false,
  gates: evaluateGates(70, 70),
  failedRules: [],
};

describe('gates', () => {
  it('passes exactly at the thresholds', () => {
    const gates = evaluateGates(50, 40);
    expect(gatesPass(gates)).toBe(true);
    expect(gates.need.reason).toBe('N 50 ≥ 50');
  });
  it('fails just below the thresholds', () => {
    expect(evaluateGates(49, 40).need.pass).toBe(false);
    expect(evaluateGates(50, 39).contact.pass).toBe(false);
  });
  it('accepts custom thresholds', () => {
    expect(gatesPass(evaluateGates(45, 40, { need: 40, contact: 40 }))).toBe(true);
  });
});

describe('two-tier filtering', () => {
  it('qualifies a lead that passes everything', () => {
    expect(decideTier(passing)).toEqual({ status: 'scored', failReasons: [] });
  });

  it('auto-excludes blocklisted, dead, parked, duplicate and suppressed leads', () => {
    expect(decideTier({ ...passing, blocklisted: 'marriott.com' }).status).toBe('auto_excluded');
    expect(decideTier({ ...passing, siteFailure: { code: 'dead_site', detail: 'HTTP 404' } }).status).toBe('auto_excluded');
    expect(decideTier({ ...passing, siteFailure: { code: 'parked_site', detail: 'domain for sale' } }).status).toBe('auto_excluded');
    expect(decideTier({ ...passing, duplicateOf: 'brand.com' }).status).toBe('auto_excluded');
    expect(decideTier({ ...passing, suppressed: 'domain on suppression list' }).status).toBe('auto_excluded');
  });

  it('auto-excludes a major brand only at high confidence and a tier 1 type', () => {
    const major = { is_major: true, evidence: 'listed on NYSE' };
    expect(decideTier({ ...passing, majorBrand: { ...major, confidence: 'high', type: 'intl_hotel_chain' } }).status).toBe('auto_excluded');

    const medium = decideTier({ ...passing, majorBrand: { ...major, confidence: 'medium', type: 'well_known_fashion' } });
    expect(medium.status).toBe('not_qualified');
    expect(medium.failReasons.map((r) => r.code)).toEqual(['major_brand_uncertain']);

    const group = decideTier({ ...passing, majorBrand: { ...major, confidence: 'high', type: 'brand_group' } });
    expect(group.status).toBe('not_qualified');
    expect(group.failReasons.map((r) => r.code)).toEqual(['brand_group']);
  });

  it('ignores major_brand when is_major is false', () => {
    const result = decideTier({ ...passing, majorBrand: { is_major: false, confidence: 'high', type: null, evidence: '' } });
    expect(result.status).toBe('scored');
  });

  it('flags site_already_good only with agency grade and PSI ≥ 85', () => {
    expect(decideTier({ ...passing, agencyGrade: true, psiMobile: 85 }).failReasons.map((r) => r.code)).toEqual(['site_already_good']);
    expect(decideTier({ ...passing, agencyGrade: true, psiMobile: 84 }).status).toBe('scored');
    expect(decideTier({ ...passing, agencyGrade: false, psiMobile: 95 }).status).toBe('scored');
  });

  it('flags no_contact only when there is neither email nor form', () => {
    expect(decideTier({ ...passing, hasUsableEmail: false, hasForm: true }).status).toBe('scored');
    expect(decideTier({ ...passing, hasUsableEmail: false, hasForm: false }).failReasons.map((r) => r.code)).toEqual(['no_contact']);
  });

  it('stores every failing code, not just the first', () => {
    const result = decideTier({
      ...passing,
      marketplaceOnly: 'redirects to etsy.com',
      agencyGrade: true,
      psiMobile: 90,
      hasUsableEmail: false,
      gates: evaluateGates(30, 10),
      failedRules: [{ id: 'r1', text: 'Skip villa rentals with under 3 units' }],
    });
    expect(result.status).toBe('not_qualified');
    expect(result.failReasons.map((r) => r.code)).toEqual([
      'marketplace_only',
      'site_already_good',
      'no_contact',
      'gate_need',
      'gate_contact',
      'rule:r1',
    ]);
  });

  it('keeps tier 2 codes when tier 1 wins', () => {
    const result = decideTier({ ...passing, blocklisted: 'hilton.com', gates: evaluateGates(10, 70) });
    expect(result.status).toBe('auto_excluded');
    expect(result.failReasons.map((r) => r.code)).toEqual(['major_brand', 'gate_need']);
  });
});
