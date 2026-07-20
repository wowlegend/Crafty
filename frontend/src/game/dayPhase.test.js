import { describe, it, expect } from 'vitest';
import { halfCycleFraction, isDuskApproaching, cycleFraction, dayPhase, markerQuadrant } from './dayPhase.js';
import { HALF_CYCLE_UNITS, CYCLE_UNITS, isDayAtUnit } from './dayNight.js';

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

// The day-phase dial (HUD.jsx DayPhaseDial): a sun/moon marker orbits a ring whose CSS rotation is
// markerAngleDeg. The marker sits at the ring's TOP-CENTRE, so rotate(R) lands it at (sin R, -cos R)
// (y-down => clockwise). markerQuadrant is that pure geometry; this block pins the mapping from the
// GAME's REAL clock to the marker side.
//
// THE BUG THIS GUARDS (18-domain review, B5 "HUD lies"): the dial used the inline `angleDeg - 180`,
// i.e. it assumed cf=0 was MIDNIGHT. But the game's authoritative phase (dayNight.isDayAtUnit) is DAY
// for the FIRST half-cycle [0, 600) and NIGHT for [600, 1200) -> real noon is t=300, real midnight
// t=900. `- 180` was a quarter-cycle (90 deg) out of phase: the SUN glyph was drawn BELOW the horizon
// for the first quarter of the day and the MOON rode HIGH in the sky for most of the night. The fix
// moves the offset to `- 90` (markerAngleDeg in the pure kernel) -> sun above the horizon all day,
// moon below it all night.
//
// MUTATION-PROOF: change `cf * 360 - 90` back to `- 180` (or any other offset) in dayPhase.js and the
// anchor assertions below go RED (real noon no longer lands on top).
describe('day-phase dial marker — synced to the REAL day/night clock (B5)', () => {
  // Real game phase anchors: sunrise = day start, noon = mid-day, sunset = day end, midnight = mid-night.
  const SUNRISE = 0;
  const NOON = HALF_CYCLE_UNITS / 2;      // t=300, deep in the FIRST (day) half
  const SUNSET = HALF_CYCLE_UNITS;        // t=600, the day->night boundary
  const MIDNIGHT = HALF_CYCLE_UNITS * 1.5; // t=900, deep in the SECOND (night) half
  const side = (t) => markerQuadrant(dayPhase(t, isDayAtUnit(t)).markerAngleDeg);

  it('sanity: the game clock has day in the first half-cycle, night in the second', () => {
    expect(isDayAtUnit(NOON)).toBe(true);      // t=300 is day
    expect(isDayAtUnit(MIDNIGHT)).toBe(false); // t=900 is night
  });

  it('places the sun/moon marker on the documented side at each real phase', () => {
    expect(side(SUNRISE)).toBe('left');    // east on the left
    expect(side(NOON)).toBe('top');        // sun high at midday
    expect(side(SUNSET)).toBe('right');    // west on the right
    expect(side(MIDNIGHT)).toBe('bottom'); // moon below the horizon at deep night
  });

  it('keeps the sun above the horizon ALL day and the moon below it ALL night (the real fix)', () => {
    for (const t of [HALF_CYCLE_UNITS * 0.25, HALF_CYCLE_UNITS * 0.75]) {
      expect(isDayAtUnit(t)).toBe(true);
      expect(side(t)).not.toBe('bottom'); // daytime marker is never below the horizon
    }
    for (const t of [HALF_CYCLE_UNITS * 1.25, HALF_CYCLE_UNITS * 1.75]) {
      expect(isDayAtUnit(t)).toBe(false);
      expect(side(t)).not.toBe('top');    // night-time marker is never high in the sky
    }
  });

  it('markerQuadrant classifies the exact cardinal rotations (y-down clockwise from top-centre)', () => {
    expect(markerQuadrant(0)).toBe('top');
    expect(markerQuadrant(90)).toBe('right');
    expect(markerQuadrant(180)).toBe('bottom');
    expect(markerQuadrant(270)).toBe('left');
    expect(markerQuadrant(-90)).toBe('left');
  });
});
