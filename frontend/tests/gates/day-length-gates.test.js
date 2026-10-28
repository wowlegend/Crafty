import { describe, it, expect } from 'vitest';
import { DAY_LENGTH_SECONDS, GAME_UNITS_PER_SECOND, isDayAtUnit } from '../../src/game/dayNight.js';
import { KEY_S } from '../../src/render/colourScript.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

/**
 * The day length against what it was chosen for (DECISIONS 2026-10-28 item 21). The First Night is one ten-minute
 * experience: the first minute, a day to light a Hearth, one dusk, one siege, one golden dawn
 * (docs/superpowers/plans/2026-10-28-crafty-sota-reset.md, section 1). So a fresh profile, ticked from the store's own
 * starting clock at the real ticker's rate, must see its first dusk no sooner than the day floor and its first dawn
 * inside the ten minutes. The golden blend (the sunset key to the dusk key) must last long enough to be seen.
 *
 * Not checked here: that the ticker runs (tests/gates/daynight-clock-gates.test.jsx drives it), and anything about
 * balance inside the night, which the encounter lane owns.
 */
const FIRST_MINUTE_S = 60;   // the title and the prologue, before the clock first runs
const DAY_FLOOR_S = 180;     // a fresh player reaches and lights the Hearth before dusk
const FIRST_NIGHT_S = 600;   // the First Night's ten minutes
const GOLDEN_BLEND_FLOOR_S = 15;

/** Whole seconds of ticking from `t0` until `pred(t)` first holds; a SETUP failure if it never does in two cycles. */
function secondsUntil(t0, pred) {
  let t = t0;
  for (let s = 1; s <= 2 * DAY_LENGTH_SECONDS; s++) {
    t += GAME_UNITS_PER_SECOND;
    if (pred(t)) return { s, t };
  }
  throw new Error(`SETUP: the predicate never held within two cycles from t ${t0}`);
}

describe('the day length serves the First Night', () => {
  it('a fresh profile: the first dusk after the day floor, the first dawn inside the ten minutes', () => {
    const t0 = useGameStore.getState().gameTime;
    expect(isDayAtUnit(t0), 'SETUP: a fresh profile does not start in daylight').toBe(true);
    const dusk = secondsUntil(t0, (t) => !isDayAtUnit(t));
    const dawn = secondsUntil(dusk.t, (t) => isDayAtUnit(t));
    const firstDawn = dusk.s + dawn.s;
    console.log(`[day-length] ${DAY_LENGTH_SECONDS} s day: first dusk at ${dusk.s} s of play, first dawn at ${firstDawn} s (+${FIRST_MINUTE_S} s first minute = ${firstDawn + FIRST_MINUTE_S} s)`);
    expect(dusk.s, 'night falls before a fresh player can light a Hearth').toBeGreaterThanOrEqual(DAY_FLOOR_S);
    expect(firstDawn + FIRST_MINUTE_S, 'the first dawn falls outside the First Night\'s ten minutes').toBeLessThanOrEqual(FIRST_NIGHT_S);
  });

  it('the golden blend, sunset key to dusk key, lasts long enough to see', () => {
    // The sun's normalised elevation is sin(2 pi f): the time between two elevations on the setting side.
    const span = (Math.asin(KEY_S.golden) - Math.asin(KEY_S.twilight)) / (2 * Math.PI);
    const seconds = span * DAY_LENGTH_SECONDS;
    console.log(`[day-length] golden blend: ${seconds.toFixed(1)} s (cycle fraction ${span.toFixed(4)})`);
    expect(span, 'SETUP: the dusk key is not below the sunset key').toBeGreaterThan(0);
    expect(seconds, 'the golden blend is a blink').toBeGreaterThanOrEqual(GOLDEN_BLEND_FLOOR_S);
  });
});
