import { describe, it, expect } from 'vitest';
import { RESONANCE_MAX, ZONE_COST, MINE_GAIN, PLACE_GAIN, clampResonance, canIgnite } from './resonance';

describe('S2-B4-M2: the Resonance economy (the BUILD-verb meter — the novel slot)', () => {
  it('constants: 100 bank, 30 per zone, mine 1 / place 2 (design §2)', () => {
    expect(RESONANCE_MAX).toBe(100); expect(ZONE_COST).toBe(30);
    expect(MINE_GAIN).toBe(1); expect(PLACE_GAIN).toBe(2);
  });
  it('clampResonance: rounds, clamps [0,MAX], swallows non-finite', () => {
    expect(clampResonance(150)).toBe(100); expect(clampResonance(-5)).toBe(0);
    expect(clampResonance(49.6)).toBe(50); expect(clampResonance(NaN)).toBe(0);
  });
  it('canIgnite gates on ZONE_COST', () => {
    expect(canIgnite(30)).toBe(true); expect(canIgnite(29)).toBe(false);
  });
});
