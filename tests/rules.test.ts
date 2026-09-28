import { describe, expect, it } from 'vitest';
import { failedRules } from '../src/lib/scoring/rules';
import { pickInternalLinks } from '../src/lib/enrich/site';
import { pickPlatform } from '../src/lib/enrich/tech';
import { parsePsiResponse } from '../src/lib/enrich/pagespeed-parse';

const facts = { segment: 'villa_developer', country: 'ID', psi_mobile: 88, platform: 'Wix' };

describe('failedRules', () => {
  it('fires when the condition matches', () => {
    const rule = { id: 'r1', segment: null, ruleText: 'Skip fast sites', ruleJson: { field: 'psi_mobile', op: 'gt', value: 80 } };
    expect(failedRules([rule], facts)).toEqual([{ id: 'r1', text: 'Skip fast sites' }]);
  });
  it('supports all and any', () => {
    const all = { id: 'a', segment: null, ruleText: 'a', ruleJson: { all: [{ field: 'country', op: 'eq', value: 'id' }, { field: 'platform', op: 'in', value: ['Wix', 'Weebly'] }] } };
    const any = { id: 'b', segment: null, ruleText: 'b', ruleJson: { any: [{ field: 'country', op: 'eq', value: 'US' }, { field: 'psi_mobile', op: 'lt', value: 50 }] } };
    expect(failedRules([all, any], facts).map((r) => r.id)).toEqual(['a']);
  });
  it('skips rules for another segment', () => {
    const rule = { id: 'r', segment: 'fashion', ruleText: 'x', ruleJson: { field: 'psi_mobile', op: 'gt', value: 80 } };
    expect(failedRules([rule], facts)).toEqual([]);
  });
  it('skips rules without a usable rule_json', () => {
    expect(failedRules([{ id: 'r', segment: null, ruleText: 'free text only', ruleJson: null }, { id: 's', segment: null, ruleText: 'bad', ruleJson: { field: 'nope', op: 'eq', value: 1 } }], facts)).toEqual([]);
  });
  it('never fires on missing data', () => {
    const rule = { id: 'r', segment: null, ruleText: 'x', ruleJson: { field: 'pay', op: 'lt', value: 20 } };
    expect(failedRules([rule], facts)).toEqual([]);
  });
});

describe('pickInternalLinks', () => {
  it('keeps same-site matching pages, best first, up to the limit', () => {
    const links = [
      'https://brand.com/',
      'https://brand.com/products/bag',
      'https://brand.com/pages/our-story',
      'https://brand.com/contact/',
      'https://brand.com/contact',
      'https://other.com/about',
      'https://brand.com/about-us',
      'https://brand.com/wholesale.pdf',
      'mailto:hi@brand.com',
      'https://brand.com/team',
    ];
    expect(pickInternalLinks(links, 'https://brand.com/', /contact|about|team|wholesale|trade|investor|story/i, 3)).toEqual([
      'https://brand.com/contact/',
      'https://brand.com/about-us',
      'https://brand.com/team',
    ]);
  });
});

describe('pickPlatform', () => {
  it('prefers the shop system or builder', () => {
    expect(pickPlatform([{ name: 'PHP', categories: ['Programming languages'] }, { name: 'WordPress', categories: ['CMS'] }, { name: 'WooCommerce', categories: ['Ecommerce'] }])).toBe('WooCommerce');
    expect(pickPlatform([{ name: 'Joomla', categories: ['CMS'] }])).toBe('Joomla');
    expect(pickPlatform([{ name: 'jQuery', categories: ['JavaScript libraries'] }])).toBeNull();
  });
});

describe('parsePsiResponse', () => {
  it('reads score and LCP', () => {
    const json = { lighthouseResult: { finalUrl: 'https://brand.com/', categories: { performance: { score: 0.42 } }, audits: { 'largest-contentful-paint': { numericValue: 6123.7, displayValue: '6.1 s' } } } };
    expect(parsePsiResponse(json)).toEqual({ score: 42, lcpMs: 6124 });
  });
  it('handles a null score and missing audits', () => {
    expect(parsePsiResponse({ lighthouseResult: { categories: { performance: { score: null } } } })).toEqual({ score: null, lcpMs: null });
  });
  it('throws on a Lighthouse runtime error', () => {
    expect(() => parsePsiResponse({ lighthouseResult: { runtimeError: { code: 'FAILED_DOCUMENT_REQUEST', message: 'could not load' } } })).toThrow(/FAILED_DOCUMENT_REQUEST/);
  });
  it('throws on an unexpected shape', () => {
    expect(() => parsePsiResponse({ nope: true })).toThrow();
  });
});
