import { describe, it, expect } from 'vitest';
import { shouldProbeGround, PROBE_NEAR_Y, PROBE_STRIDE } from './particleProbe.js';

describe('shouldProbeGround (pure)', () => {
  it('never probes above the near-ground band', () => {
    expect(shouldProbeGround(PROBE_NEAR_Y, 0, 0)).toBe(false);
    expect(shouldProbeGround(25, 3, 12)).toBe(false);
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

  it('constants pinned', () => { expect(PROBE_NEAR_Y).toBe(12); expect(PROBE_STRIDE).toBe(4); });
});
