import { describe, expect, it } from 'vitest';
import { allocateBudget, allocateShares, deactivationProposals, queryYield } from '../src/lib/learning/query-yield';

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

describe('queryYield', () => {
  it('is approved ÷ candidates', () => {
    expect(queryYield({ candidates: 50, approved: 5 })).toBe(0.1);
  });
  it('is 0 without candidates', () => {
    expect(queryYield({ candidates: 0, approved: 0 })).toBe(0);
  });
});

describe('allocateShares', () => {
  it('is proportional to yield', () => {
    const shares = allocateShares([
      { templateId: 'a', candidates: 100, approved: 30 },
      { templateId: 'b', candidates: 100, approved: 10 },
    ]);
    expect(shares.get('a')).toBeCloseTo(0.75);
    expect(shares.get('b')).toBeCloseTo(0.25);
  });

  it('keeps a 5% floor for templates with no approvals', () => {
    const shares = allocateShares([
      { templateId: 'a', candidates: 100, approved: 20 },
      { templateId: 'b', candidates: 100, approved: 20 },
      { templateId: 'dead', candidates: 50, approved: 0 },
    ]);
    expect(shares.get('dead')).toBeCloseTo(0.05);
    expect(shares.get('a')).toBeCloseTo(0.475);
    expect(sum(shares.values())).toBeCloseTo(1);
  });

  it('lifts a template that would fall just under the floor', () => {
    const shares = allocateShares([
      { templateId: 'big', candidates: 100, approved: 97 },
      { templateId: 'small', candidates: 100, approved: 3 },
    ]);
    expect(shares.get('small')).toBeCloseTo(0.05);
    expect(shares.get('big')).toBeCloseTo(0.95);
  });

  it('splits equally when nothing has been approved yet', () => {
    const shares = allocateShares([
      { templateId: 'a', candidates: 10, approved: 0 },
      { templateId: 'b', candidates: 0, approved: 0 },
    ]);
    expect([...shares.values()]).toEqual([0.5, 0.5]);
  });

  it('splits equally when the floor cannot be met', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ templateId: `t${i}`, candidates: 100, approved: i }));
    const shares = allocateShares(many);
    expect(shares.get('t0')).toBeCloseTo(1 / 25);
    expect(sum(shares.values())).toBeCloseTo(1);
  });

  it('returns nothing for no templates', () => {
    expect(allocateShares([]).size).toBe(0);
  });
});

describe('allocateBudget', () => {
  it('returns whole queries that sum to the budget', () => {
    const budget = allocateBudget(
      [
        { templateId: 'a', candidates: 100, approved: 7 },
        { templateId: 'b', candidates: 100, approved: 5 },
        { templateId: 'c', candidates: 100, approved: 1 },
      ],
      10,
    );
    expect(sum(budget.values())).toBe(10);
    for (const n of budget.values()) expect(Number.isInteger(n)).toBe(true);
    expect(budget.get('a')!).toBeGreaterThan(budget.get('c')!);
  });
});

describe('deactivationProposals', () => {
  it('proposes templates with 0 approvals after 100 candidates', () => {
    expect(
      deactivationProposals([
        { templateId: 'a', candidates: 100, approved: 0 },
        { templateId: 'b', candidates: 99, approved: 0 },
        { templateId: 'c', candidates: 300, approved: 1 },
      ]),
    ).toEqual(['a']);
  });
});
