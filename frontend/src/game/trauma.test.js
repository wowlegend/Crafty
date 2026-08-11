import { describe, it, expect } from 'vitest';
import { addTrauma, decayTrauma, shakeOffset, HITSTOP, traumaFromWeight, SHAKE_WEIGHT_MAX, SHAKE_DECAY_K } from './trauma';

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

// THE MODEL THIS FILE DOCUMENTS WAS NEVER THE MODEL THAT RAN.
//
// addTrauma and decayTrauma had zero callers. Producers wrote an absolute value straight into the store
// -- unclamped, so 1.4-1.8 went in and got SQUARED (a 1.78-world-unit camera offset against a header that
// declares [0,1]); replacing rather than accumulating, so a light tick during a heavy shake cut it short;
// and the decay was a bare multiply by 0.85 per FRAME, so shake lasted 0.52s at 60Hz and 0.26s at 120Hz.
describe('trauma — the weight-to-trauma boundary', () => {
  it('maps every real producer weight into the declared [0,1] range', () => {
    // The five live producers: 0.4/0.5/0.8 spells, 1.0/1.6 melee, 1.4 hurl + boss fireball, 1.8 roar.
    for (const w of [0.4, 0.5, 0.8, 1.0, 1.4, 1.6, 1.8]) {
      const t = traumaFromWeight(w);
      expect(t, `weight ${w} left the range`).toBeGreaterThan(0);
      expect(t, `weight ${w} left the range`).toBeLessThanOrEqual(1);
    }
  });

  it('PRESERVES the producer hierarchy — a crit still outshakes a whiffed spell', () => {
    // Clamping the weights at 1.0 instead would satisfy the range assertion above and flatten 1.6 and 1.8
    // onto the same value, destroying the ordering the trauma^2 curve exists to express.
    expect(traumaFromWeight(1.8)).toBeGreaterThan(traumaFromWeight(1.6));
    expect(traumaFromWeight(1.6)).toBeGreaterThan(traumaFromWeight(0.4));
  });

  it('is FEEL-PRESERVING at one hit: the offset equals what shipped', () => {
    // The old path: shakeOffset(weight, seed, ..., 0.55). The new one: shakeOffset(weight/MAX, seed, ...,
    // 0.55 * MAX^2). If this drifts, every impact in the game silently changes strength.
    for (const w of [0.4, 1.0, 1.6]) {
      const before = shakeOffset(w, 3.5, 0, 0, 0.55);
      const after = shakeOffset(traumaFromWeight(w), 3.5, 0, 0, 0.55 * SHAKE_WEIGHT_MAX * SHAKE_WEIGHT_MAX);
      expect(after.x, `weight ${w} changed strength`).toBeCloseTo(before.x, 10);
      expect(after.y, `weight ${w} changed strength`).toBeCloseTo(before.y, 10);
    }
  });

  it('rejects a garbage weight rather than poisoning trauma with NaN', () => {
    for (const bad of [undefined, null, NaN, -1, 'big']) expect(traumaFromWeight(bad)).toBe(0);
  });
});

describe('trauma — decay is frame-rate independent', () => {
  it('reaches the same trauma after one second regardless of frame rate', () => {
    // THE defect: identical wall-clock, different displays, different shake duration.
    const step = (frames, dt) => {
      let t = 1;
      for (let i = 0; i < frames; i++) t = decayTrauma(t, dt, SHAKE_DECAY_K, 0);
      return t;
    };
    const at60 = step(60, 1 / 60);
    const at120 = step(120, 1 / 120);
    const at30 = step(30, 1 / 30);
    expect(at120).toBeCloseTo(at60, 6);
    expect(at30).toBeCloseTo(at60, 6);
  });

  it('matches the curve that shipped on a 60Hz display — this is a fix, not a re-tune', () => {
    // The old decay was trauma * 0.85 every frame. On 60Hz the new one must be indistinguishable, or the
    // "no feel change" claim in the commit is false.
    let neu = 1;
    let old = 1;
    for (let i = 0; i < 20; i++) {
      neu = decayTrauma(neu, 1 / 60, SHAKE_DECAY_K, 0);
      old *= 0.85;
    }
    expect(neu).toBeCloseTo(old, 4);
  });

  it('settles to exactly zero instead of asymptoting, and survives a garbage dt', () => {
    expect(decayTrauma(0.005, 1 / 60)).toBe(0);
    expect(decayTrauma(1, NaN)).toBe(1);   // a bad dt must not wipe the shake
    expect(decayTrauma(1, -5)).toBe(1);    // nor a negative one amplify it
  });
});
