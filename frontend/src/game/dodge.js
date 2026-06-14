// dodge.js — pure dodge-mechanic math, extracted from the Player loop (Components.jsx) characterization-
// first (S3 de-monolith; the spawnPlacement/locomotion precedent). No THREE / no store / no refs — just
// the planar direction + the i-frame burst curve + the invincibility window. The Player loop keeps the
// dodge STATE (isActive/timeElapsed/duration/cooldown/iframeDuration) + the imperative velocity writes;
// these pure helpers own the math so it is unit-locked and reusable.

// The dodge i-frame burst speed (world u/s): fast at the start, eased to slow by the end. Form-INVARIANT
// by design (not scaled by the beast-form move multiplier) — a reliable defensive escape in every form.
const DODGE_SPEED_FAST = 28;
const DODGE_SPEED_SLOW = 10;

// Planar forward + perpendicular-side UNIT vectors from the camera's world-space XZ direction.
// Mirrors the Player loop's `new THREE.Vector3(camDir.x, 0, camDir.z).normalize()` + the
// `(-fwd.z, 0, fwd.x)` side; degenerate XZ (camera straight up/down) falls back to forward (0,0,-1).
// Threshold 0.001 matches the original `lengthSq() < 0.001` guard exactly.
export function planarBasis(camDirX, camDirZ) {
  let fx = camDirX, fz = camDirZ;
  const len2 = fx * fx + fz * fz;
  if (len2 < 0.001) { fx = 0; fz = -1; }
  else { const inv = 1 / Math.sqrt(len2); fx *= inv; fz *= inv; }
  return { fwdX: fx, fwdZ: fz, sideX: -fz, sideZ: fx };
}

// Dodge direction (UNIT vector {x,z}): combine the planar basis by the 4 move intents
// (forward = moveF − moveB, side = moveR − moveL); with no directional input, dodge FORWARD.
// Matches the Player loop's addScaledVector combine + the `lengthSq() < 0.001 -> copy(forward)` fallback.
export function dodgeDirection(camDirX, camDirZ, { moveF = false, moveB = false, moveL = false, moveR = false } = {}) {
  const b = planarBasis(camDirX, camDirZ);
  const f = (moveF ? 1 : 0) - (moveB ? 1 : 0);
  const s = (moveR ? 1 : 0) - (moveL ? 1 : 0);
  const x = b.fwdX * f + b.sideX * s;
  const z = b.fwdZ * f + b.sideZ * s;
  const len2 = x * x + z * z;
  if (len2 < 0.001) return { x: b.fwdX, z: b.fwdZ }; // no input -> forward
  const inv = 1 / Math.sqrt(len2);
  return { x: x * inv, z: z * inv };
}

// Dodge burst speed over normalized progress p∈[0,1]: lerp(FAST, SLOW, p), p clamped.
export function dodgeSpeed(progress) {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  return DODGE_SPEED_FAST + (DODGE_SPEED_SLOW - DODGE_SPEED_FAST) * p;
}

// The i-frame window: invincible while the dodge is active AND still within the i-frame duration.
export function isDodgeInvincible(isActive, timeElapsed, iframeDuration) {
  return !!isActive && timeElapsed <= iframeDuration;
}
