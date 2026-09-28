export const QUEUE_EXPLORATION_MIN = 0.2;

export interface Ranked {
  id: string;
  priority: number;
  fromExploration: boolean;
}

/** Top `size` by priority, with at least `minShare` from exploration queries when enough exist. Input must be sorted by priority, best first. */
export function pickQueue(ranked: Ranked[], size: number, minShare: number = QUEUE_EXPLORATION_MIN): Ranked[] {
  const picked = ranked.slice(0, size);
  const wanted = Math.min(Math.ceil(size * minShare), ranked.filter((r) => r.fromExploration).length);
  let have = picked.filter((r) => r.fromExploration).length;
  if (have >= wanted) return picked;

  const reserve = ranked.slice(size).filter((r) => r.fromExploration);
  for (let i = picked.length - 1; i >= 0 && have < wanted && reserve.length > 0; i--) {
    if (picked[i].fromExploration) continue;
    picked[i] = reserve.shift()!;
    have++;
  }
  return picked.sort((a, b) => b.priority - a.priority);
}
