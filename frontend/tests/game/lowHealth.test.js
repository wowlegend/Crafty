import { describe, it, expect } from 'vitest';
import { lowHealthIntensity, LOW_HEALTH_THRESHOLD } from '../../src/game/lowHealth.js';

// The danger-vignette gate: 0 while safe (>= threshold), ramping 0->1 as health falls to 0.
describe('lowHealthIntensity', () => {
  it('is 0 at full health (no false alarm; capture full-HP -> null -> baselines unchanged)', () => {
    expect(lowHealthIntensity(100, 100)).toBe(0);
    expect(lowHealthIntensity(50, 100)).toBe(0); // 50% > 35% threshold
  });

  it('is 0 exactly at the threshold (boundary)', () => {
    expect(lowHealthIntensity(35, 100, 0.35)).toBe(0);
  });

  it('ramps linearly from 0 at the threshold to 1 at zero HP', () => {
    expect(lowHealthIntensity(17.5, 100, 0.35)).toBeCloseTo(0.5, 6); // halfway between threshold and 0
    expect(lowHealthIntensity(0, 100)).toBe(1);
  });

  it('is monotonic: lower health -> higher intensity (below threshold)', () => {
    const a = lowHealthIntensity(30, 100);
    const b = lowHealthIntensity(20, 100);
    const c = lowHealthIntensity(5, 100);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('clamps to [0,1] and is guard-safe (zero/NaN/negative maxHealth)', () => {
    expect(lowHealthIntensity(-5, 100)).toBe(1); // negative HP -> max danger, clamped
    expect(lowHealthIntensity(50, 0)).toBe(0);   // no max -> no cue
    expect(lowHealthIntensity(NaN, 100)).toBe(0);
    expect(lowHealthIntensity(50, NaN)).toBe(0);
    expect(lowHealthIntensity(undefined, undefined)).toBe(0);
  });

  it('exposes the default threshold', () => {
    expect(LOW_HEALTH_THRESHOLD).toBe(0.35);
  });
});
