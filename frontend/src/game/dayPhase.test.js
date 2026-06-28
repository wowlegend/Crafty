import { describe, it, expect } from 'vitest';
import { halfCycleFraction, isDuskApproaching, cycleFraction, dayPhase } from './dayPhase.js';
import { HALF_CYCLE_UNITS, CYCLE_UNITS } from './dayNight.js';

// Pure day/night PHASE math for HUD legibility (dusk pre-warning + day-phase dial). Locks: positive-
// modulo fractions (robust to resumed/negative gameTime), finite-guards, the dusk-approach predicate
// (gated on the authoritative isDay + a clamped lead), and the descriptor the HUD reads verbatim.

describe('halfCycleFraction', () => {
  it('maps gameTime to [0,1) within the current half-cycle', () => {
    expect(halfCycleFraction(0)).toBe(0);
    expect(halfCycleFraction(HALF_CYCLE_UNITS / 2)).toBeCloseTo(0.5, 10);
    expect(halfCycleFraction(HALF_CYCLE_UNITS)).toBe(0); // wraps to the next half
    expect(halfCycleFraction(HALF_CYCLE_UNITS * 1.5)).toBeCloseTo(0.5, 10);
  });
  it('uses a POSITIVE modulo for negative / resumed clocks', () => {
    expect(halfCycleFraction(-HALF_CYCLE_UNITS / 2)).toBeCloseTo(0.5, 10);
  });
  it('finite-guards garbage -> 0', () => {
    expect(halfCycleFraction(NaN)).toBe(0);
    expect(halfCycleFraction(Infinity)).toBe(0);
    expect(halfCycleFraction(null)).toBe(0); // Number(null)=0 -> 0 anyway
  });
});

describe('cycleFraction', () => {
  it('maps gameTime to [0,1) around the FULL day+night cycle (0=midnight..0.5=noon)', () => {
    expect(cycleFraction(0)).toBe(0);
    expect(cycleFraction(CYCLE_UNITS / 4)).toBeCloseTo(0.25, 10);
    expect(cycleFraction(CYCLE_UNITS / 2)).toBeCloseTo(0.5, 10);
    expect(cycleFraction(CYCLE_UNITS)).toBe(0); // wraps
  });
  it('positive modulo + finite-guard', () => {
    expect(cycleFraction(-CYCLE_UNITS / 2)).toBeCloseTo(0.5, 10);
    expect(cycleFraction(NaN)).toBe(0);
  });
});

describe('isDuskApproaching', () => {
  it('never fires at night (gated on isDay)', () => {
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.99, false)).toBe(false);
  });
  it('fires only in the final leadFraction of the day half', () => {
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.5, true)).toBe(false); // mid-day
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.9, true)).toBe(true); // 0.9 >= 1-0.18
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.8, true)).toBe(false); // 0.8 < 0.82
  });
  it('clamps leadFraction to [0,1]', () => {
    expect(isDuskApproaching(0, true, 2)).toBe(true); // clamps to 1 -> threshold 0 -> any fraction
    expect(isDuskApproaching(HALF_CYCLE_UNITS * 0.99, true, -1)).toBe(false); // clamps to 0 -> threshold 1
  });
});

describe('dayPhase descriptor', () => {
  it('assembles the HUD-ready phase model', () => {
    const p = dayPhase(CYCLE_UNITS / 4, true, 2); // quarter cycle, day, night 2
    expect(p.cycleFraction).toBeCloseTo(0.25, 10);
    expect(p.isDay).toBe(true);
    expect(p.halfFraction).toBeCloseTo(0.5, 10); // CYCLE/4 == HALF/2
    expect(p.phaseRemaining).toBeCloseTo(0.5, 10);
    expect(p.duskApproaching).toBe(false);
    expect(p.nightImminent).toBe(p.duskApproaching); // alias
    expect(p.nightCount).toBe(2);
    expect(p.angleDeg).toBeCloseTo(90, 10); // 0.25 * 360
  });

  it('flags dusk + low phaseRemaining late in the day half', () => {
    const p = dayPhase(HALF_CYCLE_UNITS * 0.9, true);
    expect(p.duskApproaching).toBe(true);
    expect(p.phaseRemaining).toBeCloseTo(0.1, 10);
  });

  it('coerces isDay and floors/guards nightCount', () => {
    expect(dayPhase(0, 1).isDay).toBe(true); // truthy -> true
    expect(dayPhase(0, 0).isDay).toBe(false);
    expect(dayPhase(0, true, 3.7).nightCount).toBe(3); // floor
    expect(dayPhase(0, true, -5).nightCount).toBe(0); // clamp
    expect(dayPhase(0, true, NaN).nightCount).toBe(0);
  });
});
