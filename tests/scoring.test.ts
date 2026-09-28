import { describe, expect, it } from 'vitest';
import { scoreContact } from '../src/lib/scoring/contact';
import { scoreFit } from '../src/lib/scoring/fit';
import { evaluateGates, gatesPass } from '../src/lib/scoring/gates';
import { scoreNeed } from '../src/lib/scoring/need';
import { scorePay } from '../src/lib/scoring/pay';
import { computeScore, priority } from '../src/lib/scoring/score';

describe('priority (worked examples from the spec)', () => {
  it.each([
    { need: 85, pay: 60, contact: 100, fit: 50, expected: 77, pass: true },
    { need: 75, pay: 70, contact: 40, fit: 60, expected: 65, pass: true },
    { need: 30, pay: 90, contact: 70, fit: 60, expected: 59, pass: false },
  ])('N=$need P=$pay C=$contact F=$fit → $expected', ({ expected, pass, ...subs }) => {
    expect(priority(subs)).toBe(expected);
    expect(gatesPass(evaluateGates(subs.need, subs.contact))).toBe(pass);
  });

  it('third example fails only the Need gate', () => {
    const gates = evaluateGates(30, 70);
    expect(gates.need.pass).toBe(false);
    expect(gates.contact.pass).toBe(true);
  });
});

describe('need', () => {
  const base = { psiMobile: 90, designAge: 'modern' as const, weaknesses: [], sellsAbroad: false };

  it('is 0 for a fast modern site', () => {
    expect(scoreNeed(base).score).toBe(0);
  });
  it('adds 30 under PSI 50 and 15 for 50–69', () => {
    expect(scoreNeed({ ...base, psiMobile: 49 }).score).toBe(30);
    expect(scoreNeed({ ...base, psiMobile: 50 }).score).toBe(15);
    expect(scoreNeed({ ...base, psiMobile: 69 }).score).toBe(15);
    expect(scoreNeed({ ...base, psiMobile: 70 }).score).toBe(0);
  });
  it('adds 20 for dated and 25 for very dated', () => {
    expect(scoreNeed({ ...base, designAge: 'dated' }).score).toBe(20);
    expect(scoreNeed({ ...base, designAge: 'very_dated' }).score).toBe(25);
  });
  it('counts default theme and Linktree once', () => {
    expect(scoreNeed({ ...base, weaknesses: [{ code: 'default_theme' }, { code: 'linktree_only' }] }).score).toBe(20);
  });
  it('only counts language or currency gaps when selling abroad', () => {
    const weaknesses = [{ code: 'no_english' }];
    expect(scoreNeed({ ...base, weaknesses }).score).toBe(0);
    expect(scoreNeed({ ...base, weaknesses, sellsAbroad: true }).score).toBe(10);
  });
  it('sums every signal and keeps reasons', () => {
    const result = scoreNeed({
      psiMobile: 30,
      designAge: 'very_dated',
      weaknesses: [{ code: 'default_theme' }, { code: 'missing_key_feature' }, { code: 'no_multicurrency' }],
      sellsAbroad: true,
    });
    expect(result.score).toBe(100);
    expect(result.reasons).toHaveLength(5);
  });
  it('gives no PSI points when PSI is missing', () => {
    expect(scoreNeed({ ...base, psiMobile: null }).score).toBe(0);
  });
});

describe('pay', () => {
  const none = { price_level: null, review_count: null, social_following: null, active_projects: null, is_exporter: null, trade_show_presence: null, evidence: [] };

  it('is 0 with a reason when nothing is known', () => {
    expect(scorePay('fashion', null)).toEqual({ score: 0, reasons: ['no pay signals found'] });
  });
  it('weights exporter status heavily for furniture', () => {
    expect(scorePay('furniture', { ...none, is_exporter: true, trade_show_presence: true }).score).toBe(50);
    expect(scorePay('fashion', { ...none, is_exporter: true, trade_show_presence: true }).score).toBe(15);
  });
  it('uses active projects for villa developers', () => {
    expect(scorePay('villa_developer', { ...none, active_projects: 3, price_level: 'luxury' }).score).toBe(75);
  });
  it('never exceeds 100', () => {
    const rich = { price_level: 'luxury' as const, review_count: 9999, social_following: 999_999, active_projects: 20, is_exporter: true, trade_show_presence: true, evidence: [] };
    for (const segment of ['fashion', 'furniture', 'villa_developer', 'hotel', 'real_estate_agency'] as const) {
      expect(scorePay(segment, rich).score).toBeLessThanOrEqual(100);
    }
  });
});

describe('contact', () => {
  const c = (contactType: 'named' | 'role' | 'generic' | 'form_only', extra: Partial<{ role: string | null; mxOk: boolean; email: string | null }> = {}) => ({
    email: 'x@brand.com',
    role: null,
    mxOk: true,
    contactType,
    ...extra,
  });

  it('scores each contact type', () => {
    expect(scoreContact([c('named', { role: 'Founder' })]).score).toBe(100);
    expect(scoreContact([c('named')]).score).toBe(85);
    expect(scoreContact([c('role')]).score).toBe(70);
    expect(scoreContact([c('generic')]).score).toBe(40);
    expect(scoreContact([c('form_only', { email: null })]).score).toBe(10);
    expect(scoreContact([]).score).toBe(0);
  });
  it('uses the best contact', () => {
    expect(scoreContact([c('generic'), c('role'), c('form_only', { email: null })]).score).toBe(70);
  });
  it('ignores addresses without MX', () => {
    expect(scoreContact([c('named', { role: 'Owner', mxOk: false }), c('generic')]).score).toBe(40);
  });
});

describe('fit', () => {
  it('is 50 without portfolio items', () => {
    expect(scoreFit('fashion', []).score).toBe(50);
    expect(scoreFit('fashion', [{ segments: ['fashion'], active: false }]).score).toBe(50);
  });
  it('rises with matching items', () => {
    expect(scoreFit('fashion', [{ segments: ['furniture'], active: true }]).score).toBe(30);
    expect(scoreFit('fashion', [{ segments: ['fashion'], active: true }]).score).toBe(80);
    expect(scoreFit('fashion', [{ segments: ['fashion'], active: true }, { segments: ['fashion', 'hotel'], active: true }]).score).toBe(100);
  });
});

describe('computeScore', () => {
  it('combines sub-scores, gates and reasons', () => {
    const result = computeScore({
      segment: 'furniture',
      need: { psiMobile: 35, designAge: 'dated', weaknesses: [{ code: 'missing_key_feature' }], sellsAbroad: true },
      paySignals: { price_level: 'high', review_count: 30, social_following: 2000, active_projects: null, is_exporter: true, trade_show_presence: false, evidence: [] },
      contacts: [{ email: 'sales@teak.co.id', contactType: 'role', role: null, mxOk: true }],
      portfolio: [],
    });
    expect(result).toMatchObject({ need: 65, pay: 65, contact: 70, fit: 50 });
    expect(result.priority).toBe(65); // 26 + 19.5 + 14 + 5 = 64.5
    expect(gatesPass(result.gates)).toBe(true);
    expect(result.weightsVersion).toBeTruthy();
  });
});
