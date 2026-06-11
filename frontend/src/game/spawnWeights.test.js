import { describe, it, expect } from 'vitest';
import { weightedPick } from './spawnWeights';

describe('the weighted spawn pick (the mob-variety pass)', () => {
  const entries = [['a', 1], ['b', 2], ['c', 1]];
  it('partitions [0,1) by weight', () => {
    expect(weightedPick(entries, 0.0)).toBe('a');
    expect(weightedPick(entries, 0.26)).toBe('b');  // 1/4 boundary crossed
    expect(weightedPick(entries, 0.74)).toBe('b');
    expect(weightedPick(entries, 0.76)).toBe('c');
    expect(weightedPick(entries, 0.999)).toBe('c');
  });
  it('zero/empty weights degrade safely', () => {
    expect(weightedPick([['x', 0]], 0.5)).toBe('x');
    expect(weightedPick([], 0.5)).toBe(null);
  });
});
