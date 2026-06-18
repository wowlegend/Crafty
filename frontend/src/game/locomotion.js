// Locomotion math (S3-M5 part 2) — extracted PURE from the Player loop (Components.jsx:799/1005-1022).
// The velocityY.current assignments stay in Player; these are the numbers. Pinned to the old literals.
export const BASE_MOVE_SPEED = 14;     // horizontal speed before the form move-mult (10 -> 14 2026-06-18: travel felt slow, esp. to the far Blight-Heart — Kevin)
export const JUMP_VELOCITY = 12.0;     // grounded jump impulse before the form jump-mult
export const VAULT_VELOCITY = 8.5;     // the ledge-vault hop (form-INVARIANT)
export const GLUE_VELOCITY = -0.5;     // small downward force to stay glued to slopes/stairs
export const GRAVITY = -32.0;          // per-second gravity accel before the form gravity-mult
export const TERMINAL_VELOCITY = -50.0; // fall-speed clamp

// Camera-relative WASD move velocity {x, z, moving} — extracted byte-equivalent from the Player loop.
// Planar forward + perpendicular-side basis from the camera's world XZ (the (0,0,-1) degenerate
// fallback at 0.001, same as dodge.planarBasis — unify later), combined by the move intents
// (forward = moveF-moveB, side = moveR-moveL), then normalized * speed. No input -> not moving
// (caller leaves desiredVel untouched). Pure: no THREE / store / refs.
export function moveVector(camDirX, camDirZ, { moveF = false, moveB = false, moveL = false, moveR = false } = {}, speed = BASE_MOVE_SPEED) {
  let fx = camDirX, fz = camDirZ;
  const l2 = fx * fx + fz * fz;
  if (l2 < 0.001) { fx = 0; fz = -1; }
  else { const inv = 1 / Math.sqrt(l2); fx *= inv; fz *= inv; }
  const sx = -fz, sz = fx; // perpendicular side (unit, since forward is unit)
  const f = (moveF ? 1 : 0) - (moveB ? 1 : 0);
  const s = (moveR ? 1 : 0) - (moveL ? 1 : 0);
  const x = fx * f + sx * s;
  const z = fz * f + sz * s;
  const d2 = x * x + z * z;
  if (d2 <= 0) return { x: 0, z: 0, moving: false };
  const k = speed / Math.sqrt(d2);
  return { x: x * k, z: z * k, moving: true };
}

export function moveSpeed(loco) { return BASE_MOVE_SPEED * loco.moveMult; }
export function jumpVelocity(loco) { return JUMP_VELOCITY * loco.jumpMult; }
export function applyGravity(vy, gravityMult, delta) {
  const next = vy + GRAVITY * gravityMult * delta;
  return next < TERMINAL_VELOCITY ? TERMINAL_VELOCITY : next;
}
