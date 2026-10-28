// lightning.js — storm lightning, pure (plan docs/superpowers/plans/2026-09-23-crafty-storm-lightning.md;
// EXTERNAL-BASELINE-R2 #4). The storm darkened the sky and hissed; it never flashed. This holds every number the
// driver reads — the schedule, the flash's shape, the thunder's delay — where a node test can drive it.
//
// Times are WORLD ms (game/worldClock.js), so a hitstop holds a flash and a schedule like the rest of the world.

/** Never two strikes closer than this — the photosensitivity floor, and the storm's rhythm. */
export const MIN_STRIKE_GAP_MS = 4000;
/** The spread above the floor a strike waits: one every MIN_STRIKE_GAP_MS .. + STRIKE_SPREAD_MS. */
export const STRIKE_SPREAD_MS = 14000;
/** The speed of sound, m/ms — the thunder follows the flash by the time sound takes to arrive. */
export const SOUND_M_PER_MS = 0.343;
/** The flash's shape, ms: a fast attack, a decay, one re-strike flicker inside it, dark by FLASH_END_MS. */
export const FLASH_ATTACK_MS = 40;
export const FLASH_FLICKER_MS = 130;
export const FLASH_END_MS = 360;
/** The flash's peak at juiceIntensity 1 — the value the driver publishes, read by the dome and the hemisphere. */
export const FLASH_PEAK = 1.6;
/** The flash's own colour, a cold white: the light of the bolt, never the colour of the night sky it lights. */
export const FLASH_COLOR = '#E6ECFF';
/** The hemisphere's sky term gains FLASH_HEMI_GAIN x the flash, in FLASH_COLOR — at FLASH_PEAK ~3.0 of white, which
 *  takes an up-facing grass face past the night grade's black point (tests/gates/lightning-gates.test.js). */
export const FLASH_HEMI_GAIN = 1.9;

/** World ms until the next strike, from a [0, 1) rng; Infinity when no strike may come (clear sky, or capture). */
export function nextStrikeIn(rng, { storm, capture }) {
  if (!storm || capture) return Infinity;
  return MIN_STRIKE_GAP_MS + rng() * STRIKE_SPREAD_MS;
}

/** The flash, 0..1, `ms` after a strike: up in FLASH_ATTACK_MS, down, a flicker back up, dark by FLASH_END_MS. */
export function flashAt(ms) {
  if (!(ms >= 0) || ms >= FLASH_END_MS) return 0;
  if (ms < FLASH_ATTACK_MS) return ms / FLASH_ATTACK_MS;
  const decay = 1 - (ms - FLASH_ATTACK_MS) / (FLASH_END_MS - FLASH_ATTACK_MS); // 1 -> 0, linear
  const flicker = ms >= FLASH_FLICKER_MS && ms < FLASH_FLICKER_MS + 50 ? 0.35 * Math.sin(((ms - FLASH_FLICKER_MS) / 50) * Math.PI) : 0;
  return Math.max(0, Math.min(1, decay * decay + flicker));
}

/** The light the flash adds, `ms` after a strike, scaled by the juice dial (0 = none). */
export function flashLight(ms, juiceIntensity = 1) {
  return FLASH_PEAK * flashAt(ms) * Math.max(0, juiceIntensity);
}

/**
 * PURE. The hemisphere light for this frame with the flash added as WHITE sky light: afterwards
 * `out.color x out.intensity = sky x intensity + flashColor x flash x FLASH_HEMI_GAIN`, and the ground term
 * `out.groundColor x out.intensity = ground x intensity`, unchanged.
 *
 * The first version added the flash to the light's INTENSITY, which multiplies the light's colour — at night the
 * night sky's (#2E4A6E, linear luminance ~0.07). The ground's radiance rose ~2.7x and stayed under the night grade's
 * black point (0.08 linear), so the bytes stayed black while the sky dome flashed (CI: ground 6.8 -> 6.4).
 * With no flash it writes exactly `sky`, `ground` and `intensity`, so a frame without one is byte-identical to before.
 * `out` is three's HemisphereLight (or anything with `color`, `groundColor`, `intensity`); colours carry r, g, b.
 */
export function hemiWithFlash(out, sky, ground, intensity, flash, flashColor) {
  const f = Math.max(0, flash) * FLASH_HEMI_GAIN;
  const total = intensity + f;
  if (!(f > 0) || !(total > 0)) {
    out.color.r = sky.r; out.color.g = sky.g; out.color.b = sky.b;
    out.groundColor.r = ground.r; out.groundColor.g = ground.g; out.groundColor.b = ground.b;
    out.intensity = intensity;
    return out;
  }
  out.color.r = (sky.r * intensity + flashColor.r * f) / total;
  out.color.g = (sky.g * intensity + flashColor.g * f) / total;
  out.color.b = (sky.b * intensity + flashColor.b * f) / total;
  const keep = intensity / total; // the ground bounce keeps its own light: the bolt lights from above
  out.groundColor.r = ground.r * keep; out.groundColor.g = ground.g * keep; out.groundColor.b = ground.b * keep;
  out.intensity = total;
  return out;
}

/** How long the thunder waits after the flash, for a strike `distanceM` away. */
export function thunderDelayMs(distanceM) {
  return Math.max(0, distanceM) / SOUND_M_PER_MS;
}
