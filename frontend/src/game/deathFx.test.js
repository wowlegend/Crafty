import { describe, it, expect } from 'vitest';
import { dissolvePose, DEATH_DISSOLVE_MS } from './deathFx.js';

describe('dissolvePose (the mob death dissolve -- shrink + spin)', () => {
  it('is full-size, no spin at the moment of death (t=0)', () => {
    expect(dissolvePose(0)).toEqual({ scale: 1, spin: 0 });
  });
  it('is gone (scale 0) + fully spun at removal (t=1)', () => {
    const d = dissolvePose(1);
    expect(d.scale).toBeCloseTo(0);
    expect(d.spin).toBeCloseTo(2.0);
  });
  it('shrinks linearly through the dissolve', () => {
    expect(dissolvePose(0.5).scale).toBeCloseTo(0.5);
  });
  it('clamps out-of-range t', () => {
    expect(dissolvePose(-0.5).scale).toBe(1);
    expect(dissolvePose(2).scale).toBe(0);
  });
  it('has a sane dissolve window', () => {
    expect(DEATH_DISSOLVE_MS).toBeGreaterThanOrEqual(200);
    expect(DEATH_DISSOLVE_MS).toBeLessThanOrEqual(500);
  });
});
