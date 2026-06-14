import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { halfCycleFraction, isDuskApproaching } from '../../src/game/dayPhase.js';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';

// Dusk pre-warning (2026-06-14, next-levers #2). The onboarding promises "build by day, survive the night
// siege" but nothing warned the player BEFORE dusk — 'Night has fallen' only fires AT nightfall (too late to
// prepare). This adds the actionable lead-time warning that completes the loop: prepare -> siege horn + night
// -> survive -> dawn chime + reward. Pure phase math + a 1s-poll watcher (NOT a per-tick gameTime subscription).
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const dusk = read('ui/DuskWarning.jsx');
const hud = read('HUD.jsx');

describe('day-phase math (pure)', () => {
  it('halfCycleFraction runs 0..1 across a half-cycle and wraps', () => {
    expect(halfCycleFraction(0)).toBe(0);
    expect(halfCycleFraction(HALF_CYCLE_UNITS / 2)).toBeCloseTo(0.5, 6);
    expect(halfCycleFraction(HALF_CYCLE_UNITS)).toBe(0);          // wraps to the next half
    expect(halfCycleFraction(HALF_CYCLE_UNITS * 2.25)).toBeCloseTo(0.25, 6);
  });
  it('halfCycleFraction handles negative / nullish gameTime safely', () => {
    expect(halfCycleFraction(-1)).toBeGreaterThanOrEqual(0);
    expect(halfCycleFraction(-1)).toBeLessThan(1);
    expect(halfCycleFraction(undefined)).toBe(0);
    expect(halfCycleFraction(NaN)).toBe(0);
  });
  it('isDuskApproaching is true only in the final lead-fraction of the DAY half', () => {
    const lead = 0.18;
    // deep day -> not approaching
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.5, true, lead)).toBe(false);
    // last sliver of day -> approaching
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.95, true, lead)).toBe(true);
    // just inside the window -> approaching; just before it -> not (robust, avoids knife-edge float equality)
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.83, true, lead)).toBe(true);
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.80, true, lead)).toBe(false);
  });
  it('never warns at night (already dark) regardless of fraction', () => {
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.95, false, 0.18)).toBe(false);
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.99, false, 0.18)).toBe(false);
  });
});

describe('DuskWarning watcher is wired + Game-Loop-safe + capture-safe', () => {
  it('polls on an interval (NOT a reactive per-tick gameTime subscription)', () => {
    expect(dusk).toMatch(/setInterval/);
    expect(dusk).not.toMatch(/useGameStore\(\s*\(s\)\s*=>\s*s\.gameTime/); // no high-frequency subscription
  });
  it('fires a single notification on the dusk rising edge + re-arms at night', () => {
    expect(dusk).toMatch(/isDuskApproaching/);
    expect(dusk).toMatch(/addNotification/);
    expect(dusk).toMatch(/armed/);
  });
  it('is a no-op under capture (frozen clock -> no edge anyway) and renders nothing', () => {
    expect(dusk).toMatch(/isCaptureMode\(\)/);
    expect(dusk).toMatch(/return null/);
  });
  it('is mounted in the HUD', () => {
    expect(hud).toMatch(/import DuskWarning from '\.\/ui\/DuskWarning'/);
    expect(hud).toMatch(/<DuskWarning \/>/);
  });
});
