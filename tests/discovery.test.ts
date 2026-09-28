import { describe, expect, it } from 'vitest';
import { parseLeadCsv } from '../src/lib/discovery/csv';
import { planQueries, type PlannableTemplate } from '../src/lib/discovery/plan';
import { SEED_PLACES_TEMPLATES, SEED_TEMPLATES, pickValues, placeholders, renderTemplate } from '../src/lib/discovery/templates';
import { blocklistedBrand } from '../src/lib/enrich/major-brands';
import { detectParked } from '../src/lib/enrich/parked';
import { PolitenessGate } from '../src/lib/enrich/politeness';
import { robotsToken } from '../src/lib/enrich/robots';

describe('templates', () => {
  it('renders placeholders', () => {
    expect(renderTemplate('independent {category} brand {city} order via WhatsApp', { category: 'batik', city: 'Solo' })).toBe(
      'independent batik brand Solo order via WhatsApp',
    );
  });
  it('throws on a missing value', () => {
    expect(() => renderTemplate('villa off-plan {area} investment', {})).toThrow(/\{area\}/);
  });
  it('every seed template can be rendered from its own params', () => {
    for (const t of [...SEED_TEMPLATES, ...SEED_PLACES_TEMPLATES]) {
      expect(placeholders(t.template).every((p) => t.params[p]?.length > 0)).toBe(true);
      expect(renderTemplate(t.template, pickValues(t.template, t.params, () => 0))).not.toMatch(/[{}]/);
    }
  });
});

describe('planQueries', () => {
  const t = (id: string, segment: PlannableTemplate['segment'], runs: number, share?: number): PlannableTemplate => ({ id, segment, runs, share, isExploration: false });

  it('splits equally across segments and reserves the exploration share', () => {
    const plan = planQueries(
      [t('f1', 'fashion', 10), t('f-new', 'fashion', 0), t('u1', 'furniture', 10), t('u-new', 'furniture', 1), t('v1', 'villa_developer', 10), t('v-new', 'villa_developer', 2)],
      30,
      0.2,
    );
    expect(plan).toHaveLength(30);
    for (const segment of ['fashion', 'furniture', 'villa_developer']) {
      const mine = plan.filter((p) => p.segment === segment);
      expect(mine).toHaveLength(10);
      expect(mine.filter((p) => p.exploration)).toHaveLength(2);
    }
  });

  it('spends everything on established templates when none are new', () => {
    const plan = planQueries([t('a', 'fashion', 5), t('b', 'fashion', 9)], 10, 0.2);
    expect(plan.filter((p) => p.exploration)).toHaveLength(0);
    expect(plan).toHaveLength(10);
  });

  it('spends everything on exploration on the first day', () => {
    const plan = planQueries([t('a', 'fashion', 0), t('b', 'fashion', 0)], 4, 0.2);
    expect(plan.every((p) => p.exploration)).toBe(true);
    expect(plan.filter((p) => p.templateId === 'a')).toHaveLength(2);
  });

  it('follows yield shares for established templates', () => {
    const plan = planQueries([t('hi', 'fashion', 9, 0.75), t('lo', 'fashion', 9, 0.25)], 8, 0.2);
    expect(plan.filter((p) => p.templateId === 'hi')).toHaveLength(6);
    expect(plan.filter((p) => p.templateId === 'lo')).toHaveLength(2);
  });
});

describe('parseLeadCsv', () => {
  it('parses valid rows and reports bad ones with line numbers', () => {
    const csv = [
      'Name, Website, Segment, Country, Source, Notes',
      'Teak House,https://teakhouse.co.id,furniture,id,exhibitor,IFEX 2026',
      'No Segment,https://x.com,shoes,ID,manual,',
      ',https://y.com,fashion,ID,manual,',
      '"Villa, Co",villaco.com,villa_developer,,,',
    ].join('\n');
    const result = parseLeadCsv(csv);
    expect(result.rows).toEqual([
      { name: 'Teak House', website: 'https://teakhouse.co.id', segment: 'furniture', country: 'ID', source: 'exhibitor', notes: 'IFEX 2026' },
      { name: 'Villa, Co', website: 'villaco.com', segment: 'villa_developer', country: null, source: 'manual', notes: null },
    ]);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});

describe('major brand blocklist', () => {
  it('matches domains and subdomains', () => {
    expect(blocklistedBrand('marriott.com')).toBe('Marriott');
    expect(blocklistedBrand('bali.hilton.com')).toBe('Hilton');
    expect(blocklistedBrand('www.ikea.co.id')).toBe('IKEA');
    expect(blocklistedBrand('smallbrand.co.id')).toBeNull();
  });
});

describe('detectParked', () => {
  it('detects parking pages', () => {
    expect(detectParked({ html: '<html></html>', text: 'This domain is for sale. Buy this domain today.', finalUrl: 'https://brand.com/' }).parked).toBe(true);
    expect(detectParked({ html: '', text: 'x', finalUrl: 'https://www.hugedomains.com/domain_profile.cfm?d=brand.com' }).parked).toBe(true);
    expect(detectParked({ html: '<html><body></body></html>', text: '', finalUrl: 'https://brand.com/' }).parked).toBe(true);
  });
  it('does not flag a real site that mentions coming soon', () => {
    const text = `${'Handmade leather bags from Bali. '.repeat(40)} New collection coming soon.`;
    expect(detectParked({ html: '<img src="a.jpg">', text, finalUrl: 'https://brand.com/' }).parked).toBe(false);
  });
  it('does not flag an image-only homepage', () => {
    expect(detectParked({ html: '<img src="hero.jpg">', text: 'Brand', finalUrl: 'https://brand.com/' }).parked).toBe(false);
  });
});

describe('politeness', () => {
  it('runs one request per domain at a time with a 2 s gap', async () => {
    let clock = 1_000;
    const waits: number[] = [];
    const gate = new PolitenessGate(2_000, () => clock, async (ms) => {
      waits.push(ms);
      clock += ms;
    });

    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      starts.push(clock);
      await Promise.resolve();
      clock += 500;
      active--;
    };

    await Promise.all([gate.run('brand.com', task), gate.run('brand.com', task), gate.run('brand.com', task)]);
    expect(maxActive).toBe(1);
    expect(waits).toEqual([2_000, 2_000]);
    expect(starts).toEqual([1_000, 3_500, 6_000]);
  });

  it('does not delay other domains', async () => {
    const waits: number[] = [];
    const gate = new PolitenessGate(2_000, () => 5_000, async (ms) => void waits.push(ms));
    await gate.run('a.com', async () => {});
    await gate.run('b.com', async () => {});
    expect(waits).toEqual([]);
  });

  it('releases the domain after a failure', async () => {
    const gate = new PolitenessGate(0);
    await expect(gate.run('a.com', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(gate.run('a.com', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('robotsToken', () => {
  it('extracts the product token', () => {
    expect(robotsToken('AgungAdityaResearchBot/1.0 (+https://example.com/bot)')).toBe('AgungAdityaResearchBot');
  });
});
