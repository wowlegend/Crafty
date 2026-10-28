// skyClock.js — the clock the SKY renders at: the game clock, followed every frame. PURE: no scene, no store.
//
// WHY IT EXISTS (review of the light-colour lane, 2026-10-27, HIGH). The game clock is a 1 Hz setInterval
// (game/useDayNightClock.js: +GAME_UNITS_PER_SECOND each second; a per-frame store write would be a render storm), and
// <Atmosphere> rendered the colour script and the key light straight from it. So the whole sky STEPPED once a second:
// at dawn and dusk, where the key ramps from 0 to full in a few seconds (render/keyLight.js HORIZON_FADE), the light,
// the exposure and every colour jumped three times instead of ramping. A 1 Hz value may drive a per-frame visual only
// through a per-frame interpolation; this is that interpolation.
//
// THE RULE. Each frame the sky clock moves TOWARD the game clock at the game clock's own rate (GAME_UNITS_PER_SECOND
// per real second), faster only when it has fallen more than one tick behind, and NEVER past it. So between two ticks
// the sky keeps moving at a constant speed, it lags the game clock by at most about one tick (one real second of the
// cycle), and a paused clock (a menu, death, the pause) is caught up to and held, never extrapolated past.
// A step backwards or a jump larger than SKY_CLOCK_SNAP (setTimeOfDay, a save load, sleeping through the night) is a
// cut, not a pan: the sky snaps to it.
import { GAME_UNITS_PER_SECOND } from '../game/dayNight.js';

/** A step larger than this (game units) is a jump, never followed: two ticks' worth. */
export const SKY_CLOCK_SNAP = 2 * GAME_UNITS_PER_SECOND;

/** A fresh sky clock. `t` is the game time the sky last rendered at; null = not yet following (snap next frame). */
export function makeSkyClock() {
  return { t: null };
}

/** Forget the followed time, so the next frame snaps to the game clock (capture renders a declared fraction instead). */
export function resetSkyClock(clock) {
  clock.t = null;
  return clock;
}

/**
 * Advance `clock` one frame of `dt` real seconds toward `gameTime` and return the game time the sky renders at.
 * A non-finite or non-number `gameTime` is returned as it is (render/mood.js liveCycle maps it to noon) and resets the
 * clock.
 */
export function followSkyClock(clock, gameTime, dt) {
  if (typeof gameTime !== 'number' || !Number.isFinite(gameTime)) {
    clock.t = null;
    return gameTime;
  }
  const gap = clock.t === null ? Infinity : gameTime - clock.t;
  if (gap > SKY_CLOCK_SNAP) {
    clock.t = gameTime; // the first frame, or a jump forward: a cut
  } else {
    // Following. A step BACKWARDS lands at once too: the clamp to the game clock takes it, so there is no backwards pan.
    const step = Number.isFinite(dt) && dt > 0 ? dt * Math.max(GAME_UNITS_PER_SECOND, gap) : 0;
    clock.t = Math.min(gameTime, clock.t + step);
  }
  return clock.t;
}
