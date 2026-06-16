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
export function addTrauma(trauma, amount) {
  return Math.max(0, Math.min(1, trauma + amount));
}

// Linear decay; rate = trauma units per second (default 1.5 -> a full-trauma settle in ~0.67s).
export function decayTrauma(trauma, dt, rate = 1.5) {
  return Math.max(0, trauma - rate * dt);
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
