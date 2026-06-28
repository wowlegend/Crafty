import { describe, it, expect } from 'vitest';
import { lowHealthIntensity, heartbeatPeriod, LOW_HEALTH_THRESHOLD } from './lowHealth.js';

// Pure critical-health legibility math: the danger-vignette intensity + the heartbeat pulse period.
// Locks the contract — silent at safe HP (so capture frames stay byte-identical), ramps 0->1 as HP
// falls, and the heartbeat quickens with danger; all garbage-guarded.

describe('lowHealthIntensity', () => {
  it('is 0 at or above the threshold (no cue at safe HP)', () => {
    expect(lowHealthIntensity(100, 100)).toBe(0); // full
    expect(lowHealthIntensity(50, 100)).toBe(0); // well above 35%
    expect(lowHealthIntensity(35, 100)).toBe(0); // exactly at threshold -> still silent (>=)
  });

  it('ramps 0->1 as health falls below the threshold to 0', () => {
    // ratio 0.175 -> (0.35 - 0.175) / 0.35 = 0.5
    expect(lowHealthIntensity(17.5, 100)).toBeCloseTo(0.5, 10);
    // just below threshold -> near 0
    expect(lowHealthIntensity(34.9, 100)).toBeCloseTo((0.35 - 0.349) / 0.35, 6);
    expect(lowHealthIntensity(0, 100)).toBe(1); // 0 HP -> full intensity
    expect(lowHealthIntensity(-5, 100)).toBe(1); // negative clamps to full
  });

  it('honors a custom threshold', () => {
    // threshold 0.5: ratio 0.25 -> (0.5 - 0.25)/0.5 = 0.5
    expect(lowHealthIntensity(25, 100, 0.5)).toBeCloseTo(0.5, 10);
    expect(lowHealthIntensity(60, 100, 0.5)).toBe(0); // above custom threshold
  });

  it('guards garbage / non-positive max -> 0', () => {
    expect(lowHealthIntensity(50, 0)).toBe(0); // maxHealth 0
    expect(lowHealthIntensity(50, -100)).toBe(0); // negative max
    expect(lowHealthIntensity(NaN, 100)).toBe(0);
    expect(lowHealthIntensity(50, NaN)).toBe(0);
    expect(lowHealthIntensity(Infinity, 100)).toBe(0);
  });

  it('exports the documented default threshold', () => {
    expect(LOW_HEALTH_THRESHOLD).toBe(0.35);
  });
});

describe('heartbeatPeriod', () => {
  it('is a slow ~1.3s pulse at zero danger and a frantic ~0.55s at full danger', () => {
    expect(heartbeatPeriod(0)).toBeCloseTo(1.3, 10);
    expect(heartbeatPeriod(1)).toBeCloseTo(0.55, 10);
    expect(heartbeatPeriod(0.5)).toBeCloseTo(1.3 - 0.375, 10); // 0.925
  });

  it('clamps intensity to [0,1] and guards garbage', () => {
    expect(heartbeatPeriod(-1)).toBeCloseTo(1.3, 10); // clamps to 0
    expect(heartbeatPeriod(2)).toBeCloseTo(0.55, 10); // clamps to 1
    expect(heartbeatPeriod(NaN)).toBeCloseTo(1.3, 10); // -> 0
  });
});
