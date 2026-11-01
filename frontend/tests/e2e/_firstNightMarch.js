// _firstNightMarch.js — what beat (b) of tests/e2e/first-night.spec.js counts as a march on the Hearth (the brief:
// "waves ... marching on the Hearth"; the task script: "wave 1 closing 10 m on the Hearth in 20 s"; DECISIONS 2026-11-01
// (W3-A PR C) item 487). Pure, so tests/gates/first-night-march-gates.test.js drives it on tracks whose answer is known.
//
// A track is a hostile's distance to the Hearth (dH) and to the player (dP), read every 5 s for 20 s: five readings.
// A march closes 10 m on the Hearth over the 20 s, closes at every step until it is within ARRIVED_M of it, and ends
// nearer the Hearth than the player, who stands 32 m off the line, square to the bearing, so a hunter turns to them. The
// steps are there because a wanderer's random walk (game/mobWander.js: 3-8 m legs, a pause one time in three) can drift
// 10 m toward the Hearth now and then, and rarely closes at every step.

export const MARCH_M = 10;
export const STEP_MIN_M = 0.5;
export const ARRIVED_M = 4;
export const READINGS = 5;

/** Whether a track of READINGS `{ dH, dP }` (or nulls, for a mob gone) is a march on the Hearth. */
export function marches(track) {
  if (!Array.isArray(track) || track.length !== READINGS || !track.every(Boolean)) return false;
  const first = track[0], last = track[READINGS - 1];
  if (first.dH - last.dH < MARCH_M || !(last.dH < last.dP)) return false;
  return track.slice(1).every((r, i) => track[i].dH <= ARRIVED_M || track[i].dH - r.dH >= STEP_MIN_M);
}
