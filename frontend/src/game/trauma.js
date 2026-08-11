// trauma.js -- the pure game-feel core (no React/Three; node-testable + capture-deterministic).
// The "trauma" screenshake model (Squirrel Eiserloh / the 2026 SOTA standard): a single 0..1 trauma value
// is ADDED to per impactful event and DECAYED every frame; the actual shake magnitude scales with
// trauma^2, so a light tick barely shakes while a heavy/crit hit PUNCHES. Uses SEEDED value-noise (NOT
// Math.random) so the shake is deterministic -> identical capture frames + unit-testable. Also the source
// of the weight-tiered HITSTOP table that replaces the old flat 28ms freeze.

// Hitstop (freeze-frame) duration in ms, keyed by hit weight. Tiered so heavier/crit/boss hits read with
// more impact (the audit's #1 game-feel gap: a flat 28ms collapsed the light/heavy/crit hierarchy).
export const HITSTOP = { light: 45, heavy: 90, crit: 130, boss: 160 };

// Add trauma from an event (clamped to [0,1]).
//
// This is the model the header describes, and until now nothing called it. Producers wrote an absolute
// value straight into the store instead, which broke the model twice over: values of 1.4-1.8 went in
// unclamped and were then SQUARED, putting the camera 1.78 world units off-centre at peak; and because a
// write REPLACED rather than accumulated, a light tick landing during a heavy shake CUT THE SHAKE SHORT
// instead of adding to it. Accumulate-and-clamp is what makes trauma^2 mean anything.
export function addTrauma(trauma, amount) {
  return Math.max(0, Math.min(1, trauma + amount));
}

/**
 * The loudest impact weight any producer passes (BossEntity's phase-1 roar is 1.8).
 *
 * Producers do not speak in trauma; they speak in HOW HARD THE HIT WAS -- 0.4 for a spell that missed,
 * 1.6 for a melee crit. Clamping those to 1.0 at the door would flatten the entire hierarchy the trauma^2
 * curve exists to express, so the weight is mapped into the model's declared [0,1] range instead. The
 * consumer scales its intensity by this squared, which makes the conversion EXACTLY feel-preserving at
 * one hit: mag = (w/2)^2 * (0.55 * 2^2) = w^2 * 0.55, the number that shipped.
 */
export const SHAKE_WEIGHT_MAX = 2;

/** Impact weight -> trauma in [0,1]. */
export function traumaFromWeight(weight) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.min(1, w / SHAKE_WEIGHT_MAX);
}

/**
 * Decay constant, per SECOND. Chosen as -ln(0.85) * 60 so the settle curve is identical to the
 * multiply-by-0.85-per-frame the game shipped -- ON A 60Hz DISPLAY, which was the whole problem: that
 * decay had no delta term, so shake lasted 0.52s at 60Hz and 0.26s at 120Hz. The same useFrame already
 * damps knockback with Math.exp(-delta * 8.0), so dt-independence is a pattern this file's caller knows.
 */
export const SHAKE_DECAY_K = 9.749;

/**
 * EXPONENTIAL decay, frame-rate independent. This replaced a LINEAR `trauma - rate*dt`, which was never
 * called: dropping it in would have changed the feel curve, not merely fixed the dt dependence.
 * Snaps to 0 below `floor` so the shake ends cleanly instead of asymptoting forever.
 */
export function decayTrauma(trauma, dt, k = SHAKE_DECAY_K, floor = 0.01) {
  if (!(trauma > 0)) return 0;
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const next = trauma * Math.exp(-d * k);
  return next < floor ? 0 : next;
}

// Seeded value-noise in [-1, 1] (deterministic; replaces Math.random so capture frames + tests are stable).
function noise1(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// A 3-axis shake offset whose magnitude = trauma^2 * intensity. `seed` (e.g. clock * speed) animates the
// seeded noise frame to frame; (dirX,dirZ) biases the shake toward a hit direction (normalized internally),
// so a hit from +x reads as a +x recoil rather than pure omnidirectional jitter; `intensity` = max offset
// at full trauma. Returns {x,y,z}. trauma 0 -> {0,0,0}.
export function shakeOffset(trauma, seed, dirX = 0, dirZ = 0, intensity = 0.5) {
  const mag = trauma * trauma * intensity;
  if (mag === 0) return { x: 0, y: 0, z: 0 };
  let x = noise1(seed) * mag;
  const y = noise1(seed + 17.3) * mag;
  let z = noise1(seed + 41.7) * mag;
  const dl = Math.hypot(dirX, dirZ);
  if (dl > 0) {
    x += (dirX / dl) * mag * 0.6;
    z += (dirZ / dl) * mag * 0.6;
  }
  return { x, y, z };
}
