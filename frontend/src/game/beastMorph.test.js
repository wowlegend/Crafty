import { describe, it, expect } from 'vitest';
import { MORPH_SEC, BURST_SEC, morphEntrance, burstFlash, chargeGlow } from './beastMorph.js';

// S2-B1-M7c: the morph choreography is PURE timing/easing -> the entrance pop, the swap-masking burst,
// and the anticipation glow are unit-testable. BeastAvatar tracks the clock + applies them; capture
// freezes to the SETTLED state.

describe('morphEntrance (the scale-pop + entry flash)', () => {
  it('starts small + bright-flashing, settles to scale 1 + no flash', () => {
    const start = morphEntrance(0);
    expect(start.scale).toBeLessThan(1);   // pops in from small
    expect(start.flash).toBeCloseTo(1, 5); // brightest at entry
    const settled = morphEntrance(MORPH_SEC);
    expect(settled).toEqual({ scale: 1, flash: 0 });
  });
  it('past the window + non-finite = the SETTLED state (what capture renders, deterministic)', () => {
    expect(morphEntrance(MORPH_SEC + 5)).toEqual({ scale: 1, flash: 0 });
    expect(morphEntrance(NaN)).toEqual({ scale: 1, flash: 0 });
    expect(morphEntrance(undefined)).toEqual({ scale: 1, flash: 0 });
  });
  it('overshoots past 1 mid-entrance (the pop), then comes back to 1', () => {
    const mid = morphEntrance(MORPH_SEC * 0.7);
    expect(mid.scale).toBeGreaterThan(1); // easeOutBack overshoot
  });
});

describe('burstFlash (the swap-masking flash)', () => {
  it('bright + present at the swap instant, gone by the end', () => {
    const at0 = burstFlash(0);
    expect(at0.active).toBe(true);
    expect(at0.opacity).toBeCloseTo(1, 5);
    expect(burstFlash(BURST_SEC).active).toBe(false);
    expect(burstFlash(BURST_SEC + 1).active).toBe(false);
    expect(burstFlash(NaN).active).toBe(false); // settled frame has NO burst
  });
  it('expands + fades over the window', () => {
    const a = burstFlash(BURST_SEC * 0.25);
    const b = burstFlash(BURST_SEC * 0.75);
    expect(b.scale).toBeGreaterThan(a.scale);   // expanding
    expect(b.opacity).toBeLessThan(a.opacity);  // fading
  });
});

describe('chargeGlow (the anticipation)', () => {
  it('grows + brightens as the charge fills; clamps', () => {
    expect(chargeGlow(0).intensity).toBe(0);
    expect(chargeGlow(1).intensity).toBe(1);
    expect(chargeGlow(0.5).scale).toBeGreaterThan(chargeGlow(0).scale);
    expect(chargeGlow(2).intensity).toBe(1);   // clamped
    expect(chargeGlow(-1).intensity).toBe(0);
  });
});
