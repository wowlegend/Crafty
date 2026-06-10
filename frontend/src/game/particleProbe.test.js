import { describe, it, expect } from 'vitest';
import { shouldProbeGround, PROBE_NEAR_Y, PROBE_STRIDE, PROBE_ABOVE_BAND_MULT } from './particleProbe.js';

describe('shouldProbeGround (pure)', () => {
  it('above the near-ground band, probes at the SLOW stride (bounded clip vs high terrain — never zero)', () => {
    // review-fix 2026-06-10: a pure band cutoff let rain clip terrain >12u above the player for
    // UNBOUNDED frames. Above-band now probes every stride*mult frames: bounded <=16-frame clip.
    const slow = PROBE_STRIDE * PROBE_ABOVE_BAND_MULT; // 16
    const probed = Array.from({ length: slow * 2 }, (_, f) => f).filter(f => shouldProbeGround(25, 0, f));
    expect(probed).toEqual([0, slow]);                            // exactly once per slow window
    expect(shouldProbeGround(PROBE_NEAR_Y, 1, 0)).toBe(false);    // boundary value uses the slow stride
  });

  it('inside the band, probes exactly 1-in-stride particles per frame, rotating by frame', () => {
    const y = 0;
    const probedAtFrame0 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => shouldProbeGround(y, i, 0));
    expect(probedAtFrame0).toEqual([0, 4]);                       // (i+0) % 4 === 0
    const probedAtFrame1 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => shouldProbeGround(y, i, 1));
    expect(probedAtFrame1).toEqual([3, 7]);                       // (i+1) % 4 === 0
  });

  it('every particle in the band is probed at least once per stride window', () => {
    for (let i = 0; i < 16; i++) {
      const hit = [0, 1, 2, 3].some(f => shouldProbeGround(0, i, f));
      expect(hit).toBe(true);
    }
  });

  it('constants pinned', () => {
    expect(PROBE_NEAR_Y).toBe(12);
    expect(PROBE_STRIDE).toBe(4);
    expect(PROBE_ABOVE_BAND_MULT).toBe(4);
  });
});
