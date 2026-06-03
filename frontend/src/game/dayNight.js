// dayNight.js -- PURE day/night cycle math (no React / R3F / Three imports, node-testable).
//
// The store consumes `crossedHalfCycle` to flip `isDay` on a half-cycle BOUNDARY
// CROSSING (robust to any tick step + any resumed `gameTime`), replacing the old
// brittle exact-landing `gameTime % 600 === 0` check. `isDayAtUnit` derives the
// day/night phase straight from a `gameTime` value (used in tests + as a
// resync-correctness helper; it is NOT used to override the manual `setIsDay` toggle).

/** Units of `gameTime` per half-cycle (one day half OR one night half). */
export const HALF_CYCLE_UNITS = 600;

/** Units of `gameTime` per FULL day+night cycle. */
export const CYCLE_UNITS = 1200;

/**
 * The ONE feel/balance knob (batched to Kevin): how many `gameTime` units the
 * real-time ticker advances per second. 4 units/s => HALF_CYCLE_UNITS / 4 = 150 s
 * per half => a 5-minute full cycle (2.5 min day / 2.5 min night). 600 % 4 === 0,
 * so integer landings still align on the boundary (the crossing-fix makes exact
 * landing unnecessary, but keeping the divisor clean is tidy). Kevin-tunable:
 * 8-min cozier ~= 2.5, 3-min frantic ~= 6.7.
 */
export const GAME_UNITS_PER_SECOND = 4;

/**
 * True iff advancing `gameTime` from `prevTime` to `nextTime` crosses a half-cycle
 * boundary (i.e. the floor(t / HALF) bucket index changed). Robust to any step
 * size and any non-aligned start value -- a multi-step jump that skips the exact
 * multiple still registers, and a save resumed at e.g. 437 still flips when a step
 * first lands at or past 600.
 * @param {number} prevTime
 * @param {number} nextTime
 * @returns {boolean}
 */
export function crossedHalfCycle(prevTime, nextTime) {
  return Math.floor(nextTime / HALF_CYCLE_UNITS) !== Math.floor(prevTime / HALF_CYCLE_UNITS);
}

/**
 * The day/night phase implied by a `gameTime` value: each successive half-cycle
 * bucket alternates, starting with day at t in [0, 600).
 * @param {number} t
 * @returns {boolean} true = day, false = night
 */
export function isDayAtUnit(t) {
  return Math.floor(t / HALF_CYCLE_UNITS) % 2 === 0;
}
