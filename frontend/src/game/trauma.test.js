import { describe, it, expect } from 'vitest';
import { addTrauma, decayTrauma, shakeOffset, HITSTOP } from './trauma';

// SOTA M1 game-feel core (audit #1). The "trauma" screenshake model: shake magnitude = trauma^2 * intensity
// (small hits barely shake, big hits PUNCH), trauma added per event + decayed per frame. Seeded value-noise
// (NOT Math.random) keeps it capture-deterministic + unit-testable. Plus the weight-tiered HITSTOP table
// that replaces the flat 28ms.
describe('trauma — game-feel core', () => {
  it('addTrauma clamps to [0,1] and is additive', () => {
    expect(addTrauma(0.2, 0.3)).toBeCloseTo(0.5, 6);
    expect(addTrauma(0.9, 0.5)).toBe(1);      // clamps at 1
    expect(addTrauma(0.1, -0.5)).toBe(0);     // never negative
    expect(addTrauma(0, 0)).toBe(0);
  });

  it('decayTrauma reduces over dt and never goes negative', () => {
    expect(decayTrauma(1, 0.1)).toBeLessThan(1);
    expect(decayTrauma(1, 0.1)).toBeGreaterThan(0);
    expect(decayTrauma(0.05, 1)).toBe(0);     // a big dt floors at 0
    expect(decayTrauma(0, 0.5)).toBe(0);
  });

  it('shakeOffset is zero at zero trauma and scales with trauma^2', () => {
    const z = shakeOffset(0, 5, 0, 0, 0.5);
    expect(z.x).toBe(0); expect(z.y).toBe(0); expect(z.z).toBe(0);
    // same seed + no direction: magnitude is linear in (trauma^2*intensity), so trauma 1 vs 0.5 -> 4x
    const a = shakeOffset(1.0, 5, 0, 0, 0.5);
    const b = shakeOffset(0.5, 5, 0, 0, 0.5);
    expect(b.x).not.toBe(0);
    expect(Math.abs(a.x) / Math.abs(b.x)).toBeCloseTo(4, 4); // 1^2 / 0.5^2 = 4
  });

  it('shakeOffset biases along the hit direction (directional, not pure random)', () => {
    const right = shakeOffset(0.8, 5, 1, 0, 0.5).x;
    const left = shakeOffset(0.8, 5, -1, 0, 0.5).x;
    expect(right).toBeGreaterThan(left); // a +x hit recoils more +x than a -x hit
  });

  it('HITSTOP is weight-tiered, ascending light < heavy < crit < boss (not the old flat 28ms)', () => {
    expect(HITSTOP.light).toBeLessThan(HITSTOP.heavy);
    expect(HITSTOP.heavy).toBeLessThan(HITSTOP.crit);
    expect(HITSTOP.crit).toBeLessThan(HITSTOP.boss);
    expect(HITSTOP.light).toBeGreaterThan(28); // every tier punchier than the old flat value
  });
});
