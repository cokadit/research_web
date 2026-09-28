import type { Segment } from '../types';

export interface PlannableTemplate {
  id: string;
  segment: Segment;
  isExploration: boolean;
  runs: number;
  /** Share of the exploitation budget from query yield. Undefined means equal split. */
  share?: number;
}

export interface PlannedQuery {
  templateId: string;
  segment: Segment;
  exploration: boolean;
}

export const EXPLORATION_MAX_RUNS = 3;

export function isExplorationTemplate(t: Pick<PlannableTemplate, 'isExploration' | 'runs'>): boolean {
  return t.isExploration || t.runs < EXPLORATION_MAX_RUNS;
}

function spread<T>(items: T[], count: number, weight: (item: T) => number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  const exact = items.map((item) => ({ item, exact: total > 0 ? (weight(item) / total) * count : count / items.length }));
  const counts = exact.map((e) => Math.floor(e.exact));
  let left = count - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, rem: e.exact % 1 })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    counts[i]++;
    left--;
  }
  return exact.flatMap((e, i) => Array.from({ length: counts[i] }, () => e.item));
}

/**
 * Splits the day's queries equally across segments, then reserves
 * `explorationShare` of each segment's queries for new or rarely run templates.
 */
export function planQueries(templates: PlannableTemplate[], totalQueries: number, explorationShare: number): PlannedQuery[] {
  const segments = [...new Set(templates.map((t) => t.segment))];
  if (segments.length === 0 || totalQueries <= 0) return [];

  const perSegment = spread(segments, totalQueries, () => 1);
  const plan: PlannedQuery[] = [];

  for (const segment of segments) {
    const budget = perSegment.filter((s) => s === segment).length;
    const mine = templates.filter((t) => t.segment === segment);
    const explore = mine.filter(isExplorationTemplate);
    const exploit = mine.filter((t) => !isExplorationTemplate(t));

    let exploreCount = explore.length > 0 ? Math.round(budget * explorationShare) : 0;
    if (exploit.length === 0) exploreCount = budget;
    const exploitCount = budget - exploreCount;

    // Least-run exploration templates first, so new ones reach 3 runs quickly.
    const exploreOrdered = [...explore].sort((a, b) => a.runs - b.runs);
    for (let i = 0; i < exploreCount; i++) {
      const t = exploreOrdered[i % exploreOrdered.length];
      plan.push({ templateId: t.id, segment, exploration: true });
    }
    for (const t of spread(exploit, exploitCount, (x) => x.share ?? 1)) {
      plan.push({ templateId: t.id, segment, exploration: false });
    }
  }
  return plan;
}
