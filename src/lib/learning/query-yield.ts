export interface TemplateStats {
  templateId: string;
  candidates: number;
  approved: number;
}

export const YIELD_FLOOR = 0.05;
export const DEACTIVATE_AFTER_CANDIDATES = 100;

/** yield = approved ÷ candidates. 0 when nothing was found yet. */
export function queryYield(stats: Pick<TemplateStats, 'candidates' | 'approved'>): number {
  return stats.candidates > 0 ? stats.approved / stats.candidates : 0;
}

/**
 * Share of the non-exploration query budget per template: proportional to yield,
 * with a floor so no active template drops to zero. Shares sum to 1.
 */
export function allocateShares(stats: TemplateStats[], floor: number = YIELD_FLOOR): Map<string, number> {
  const shares = new Map<string, number>();
  const n = stats.length;
  if (n === 0) return shares;

  const yields = stats.map(queryYield);
  const total = yields.reduce((a, b) => a + b, 0);
  if (total === 0 || n * floor >= 1) {
    for (const s of stats) shares.set(s.templateId, 1 / n);
    return shares;
  }

  // Pin templates that fall under the floor, split the rest proportionally, repeat until stable.
  const pinned = new Set<number>();
  for (;;) {
    const freeYield = yields.reduce((sum, y, i) => (pinned.has(i) ? sum : sum + y), 0);
    const freeShare = 1 - pinned.size * floor;
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (pinned.has(i)) continue;
      const share = freeYield > 0 ? (yields[i] / freeYield) * freeShare : 0;
      if (share < floor) {
        pinned.add(i);
        changed = true;
      }
    }
    if (!changed) {
      stats.forEach((s, i) => {
        shares.set(s.templateId, pinned.has(i) ? floor : (yields[i] / freeYield) * freeShare);
      });
      return shares;
    }
  }
}

/** Whole queries per template (largest remainder), summing exactly to `budget`. */
export function allocateBudget(stats: TemplateStats[], budget: number, floor: number = YIELD_FLOOR): Map<string, number> {
  const shares = allocateShares(stats, floor);
  const exact = [...shares].map(([id, share]) => ({ id, exact: share * budget }));
  const result = new Map(exact.map((e) => [e.id, Math.floor(e.exact)]));
  let left = budget - [...result.values()].reduce((a, b) => a + b, 0);
  const byRemainder = [...exact].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (const e of byRemainder) {
    if (left <= 0) break;
    result.set(e.id, (result.get(e.id) ?? 0) + 1);
    left--;
  }
  return result;
}

/** Templates to propose for deactivation. Never applied without approval. */
export function deactivationProposals(stats: TemplateStats[]): string[] {
  return stats.filter((s) => s.candidates >= DEACTIVATE_AFTER_CANDIDATES && s.approved === 0).map((s) => s.templateId);
}
