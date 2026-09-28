import { describe, expect, it } from 'vitest';
import { pickQueue, type Ranked } from '../src/lib/leads/pick-queue';

const lead = (id: string, priority: number, fromExploration = false): Ranked => ({ id, priority, fromExploration });

describe('pickQueue', () => {
  it('takes the top leads by priority', () => {
    const ranked = [lead('a', 90), lead('b', 80), lead('c', 70)];
    expect(pickQueue(ranked, 2).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('swaps in exploration leads to reach 20%', () => {
    const ranked = [...Array.from({ length: 10 }, (_, i) => lead(`n${i}`, 90 - i)), lead('e1', 40, true), lead('e2', 30, true), lead('e3', 20, true)];
    const picked = pickQueue(ranked, 10);
    expect(picked).toHaveLength(10);
    expect(picked.filter((r) => r.fromExploration).map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(picked.map((r) => r.id)).not.toContain('n9');
    expect(picked.map((r) => r.id)).toContain('n0');
  });

  it('leaves the queue alone when exploration is already well represented', () => {
    const ranked = [lead('e1', 95, true), lead('a', 90), lead('e2', 85, true), lead('b', 80), lead('c', 70)];
    expect(pickQueue(ranked, 4).map((r) => r.id)).toEqual(['e1', 'a', 'e2', 'b']);
  });

  it('uses what exists when there are few exploration leads', () => {
    const ranked = [...Array.from({ length: 10 }, (_, i) => lead(`n${i}`, 90 - i)), lead('e1', 10, true)];
    expect(pickQueue(ranked, 10).filter((r) => r.fromExploration)).toHaveLength(1);
  });
});
