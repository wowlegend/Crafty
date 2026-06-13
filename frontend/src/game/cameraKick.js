/**
 * cameraKick.js -- PURE per-verb camera-kick impulse model (no React/Three; node-testable).
 * A kick is a transient positional offset (camera-local; the caller converts to world) injected
 * instantly via addKick and exponentially decayed toward zero by stepKick -- giving actions a brief
 * tactile lurch + fast recovery. Distinct from the random damage-jitter (cameraShakeIntensity).
 * Consumed by the Player follow-cam (added to the shake offset, below the isCaptureMode early-return,
 * so it never touches the visual baselines). Spec: docs/superpowers/plans/2026-06-13-crafty-camera-kick-juice.md
 */

/** Per-second exponential decay rate -- ~0.2s recovery (snappy). SUBTLE by design, never nauseating. */
export const KICK_DECAY = 14;

/**
 * Per-verb impulse in camera-local axes [right(+x), up(+y), forward(+z)] -- kept small (a few cm).
 * melee = a down+back thunk (recoil); cast = a slight up+forward push; slam = hard down; land = down bob.
 */
export const KICK_PROFILES = {
  melee: [0, -0.07, -0.09], // down + BACK (recoil away from look-dir)
  cast: [0, 0.03, 0.10],    // up + forward push
  slam: [0, -0.16, 0.06],   // hard down + slight forward
  land: [0, -0.12, 0],      // straight down
};

/**
 * Convert a camera-LOCAL kick profile [right, up, forward] to a WORLD impulse [x,y,z], given the
 * camera's (un-normalized) flat forward (fwdX,fwdZ). up maps to world-up directly; forward maps onto
 * the normalized flat look-dir; right onto (look x up). Pure (no Three) so it's node-testable.
 * Degenerate (zero) forward -> vertical-only (no horizontal impulse).
 */
export function localToWorldKick(fwdX, fwdZ, [lx, ly, lz]) {
  const len = Math.hypot(fwdX, fwdZ);
  if (len < 1e-6) return [0, ly, 0];
  const fx = fwdX / len, fz = fwdZ / len;
  const rx = fz, rz = -fx; // right = flatForward x worldUp
  return [rx * lx + fx * lz, ly, rz * lx + fz * lz];
}

export function makeKick() { return { x: 0, y: 0, z: 0 }; }

/** Inject an impulse (mutates k); accumulates with any in-flight kick. */
export function addKick(k, [dx, dy, dz]) { k.x += dx; k.y += dy; k.z += dz; }

/**
 * Decay the kick toward zero by one frame and return the current offset {x,y,z}.
 * Snaps sub-1e-4 components to exactly 0 so the kick settles cleanly (no lingering jitter).
 */
export function stepKick(k, delta, decay = KICK_DECAY) {
  const f = Math.exp(-decay * Math.max(0, delta)); // 0 < f < 1
  k.x *= f; k.y *= f; k.z *= f;
  if (Math.abs(k.x) < 1e-4) k.x = 0;
  if (Math.abs(k.y) < 1e-4) k.y = 0;
  if (Math.abs(k.z) < 1e-4) k.z = 0;
  return { x: k.x, y: k.y, z: k.z };
}
