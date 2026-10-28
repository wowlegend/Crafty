// sunArc.js — the sun's (and, half a cycle later, the moon's) path across the sky. PURE: no three import, no state.
//
// Its own module so render/keyLight.js can use it without importing mood.js, which itself imports keyLight.js to
// compose the sky frame: a module cycle in which mood.js's module-load publish of the first frame would call into a
// keyLight.js not yet evaluated. mood.js re-exports both names.

/**
 * PURE. Rotate a mood's NOON sun direction onto the day/night arc.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (QUEUE.md B1 — "the biggest one and it is mostly already written")
 *
 * `game/dayPhase.js` has exported `cycleFraction(gameTime)` all along — 0 = dawn, 0.25 = noon, 0.5 = dusk,
 * 0.75 = midnight — and its own comment says it "drives the day-phase dial's sun/moon orbit angle". But
 * `grep -rn cycleFraction src` found references ONLY inside dayPhase.js itself. Meanwhile `MOOD_SCALARS`
 * held `sunPos` as three fixed constants. So the HUD dial showed a sun travelling dawn -> noon -> dusk
 * while the sun in the sky did not move: the game contradicted its own instrument.
 *
 * The arc is applied in render/mood.js's sampleMood, the one place the frame's `sunPos` is written, and in
 * render/keyLight.js, which resolves the sun's and the moon's directions for the one directional light.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE MAPPING, and why not a great-circle rotation
 *
 * The obvious construction — Rodrigues-rotate the noon vector about a horizontal axis — is wrong for this
 * game. The moods sit at ~33 degrees of elevation, so a 90-degree rotation overshoots well past the
 * horizon and the sun would set less than a quarter of the way through the day half. `isDayAtUnit` makes
 * fraction 0..0.5 the DAY, so the sun has to be above the horizon across exactly that span.
 *
 * So elevation and azimuth are driven separately, which also keeps the mood's own look exact at noon:
 *   elevation:  e = sin(elev_noon) * sin(2*pi*f)     f=0 -> 0 (dawn, horizon) · f=0.25 -> the mood's own
 *                                                    noon elevation · f=0.5 -> 0 (dusk) · then below
 *   azimuth:    a = a_noon + SWING * cos(2*pi*f)     f=0 -> one side, f=0.5 -> the other: it rises and
 *                                                    sets on opposite horizons
 *
 * At f = 0.25 this returns the mood vector's own direction unchanged, so every existing look is preserved
 * at noon and the arc is a strict addition rather than a re-tune.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * @param {number[]} noon   the mood's sunPos, treated as the NOON direction (magnitude ignored)
 * @param {number} fraction cycleFraction(gameTime) in [0,1)
 * @param {number[]} [out]  optional 3-array to write into (avoids an allocation in the frame loop)
 * @returns {number[]} a unit-length direction
 */
export const SUN_ARC_SWING = Math.PI / 2; // 90 degrees each side of the noon azimuth

export function sunArcDirection(noon, fraction, out = [0, 0, 0]) {
  const v = Array.isArray(noon) && noon.length === 3 && noon.every(Number.isFinite) ? noon : [0, 1, 0];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const nx = v[0] / len, ny = v[1] / len, nz = v[2] / len;

  const f = Number.isFinite(fraction) ? ((fraction % 1) + 1) % 1 : 0.25; // NaN -> noon, never a dead sun
  const theta = 2 * Math.PI * f;

  // The mood's noon elevation (as a sine) and noon azimuth, recovered from the vector itself.
  const sinNoonElev = Math.min(1, Math.max(-1, ny));
  const aNoon = Math.atan2(nx, nz);

  const e = sinNoonElev * Math.sin(theta);
  const a = aNoon + SUN_ARC_SWING * Math.cos(theta);
  const horiz = Math.sqrt(Math.max(0, 1 - e * e));

  out[0] = horiz * Math.sin(a);
  out[1] = e;
  out[2] = horiz * Math.cos(a);
  return out;
}
