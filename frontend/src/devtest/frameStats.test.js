import { describe, it, expect } from 'vitest';
import { quantile, frameStats, compareScenarios, withinBudget, M2_BUDGET, LONG_FRAME_MS } from './frameStats';

describe('frameStats (S2-B2-M2)', () => {
  it('quantile interpolates and handles edges', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([3, 1, 2], 0.5)).toBe(2); // unsorted input ok
    expect(quantile([10], 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('summarizes frame deltas', () => {
    const s = frameStats([16, 16, 16, 50]);
    expect(s.frames).toBe(4);
    expect(s.medianMs).toBe(16);
    expect(s.p95Ms).toBeGreaterThan(16);
    expect(s.maxMs).toBe(50);
    expect(s.longFrames).toBe(1); // 50 > LONG_FRAME_MS
    expect(LONG_FRAME_MS).toBeCloseTo(33.4, 5);
    expect(s.fps).toBeCloseTo(4 / (98 / 1000), 5);
  });

  it('empty input is all-zero (no NaN)', () => {
    const s = frameStats([]);
    expect(s.fps).toBe(0);
    expect(s.medianMs).toBe(0);
  });

  it('compareScenarios + withinBudget implement the pinned C−B gate', () => {
    const b = frameStats(Array(100).fill(16));
    const c = frameStats(Array(100).fill(17));
    const cmp = compareScenarios(b, c);
    expect(cmp.medianDeltaMs).toBeCloseTo(1, 5);
    expect(cmp.fpsDelta).toBeLessThan(0);
    expect(withinBudget(cmp)).toBe(true);
    expect(withinBudget({ medianDeltaMs: 2.0, p95DeltaMs: 0 })).toBe(false);
    expect(withinBudget({ medianDeltaMs: 0, p95DeltaMs: 3.5 })).toBe(false);
    expect(M2_BUDGET).toEqual({ medianDeltaMs: 1.5, p95DeltaMs: 3.0 });
  });
});
