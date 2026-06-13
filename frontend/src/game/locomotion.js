// Locomotion math (S3-M5 part 2) — extracted PURE from the Player loop (Components.jsx:799/1005-1022).
// The velocityY.current assignments stay in Player; these are the numbers. Pinned to the old literals.
export const BASE_MOVE_SPEED = 10;     // horizontal speed before the form move-mult
export const JUMP_VELOCITY = 12.0;     // grounded jump impulse before the form jump-mult
export const VAULT_VELOCITY = 8.5;     // the ledge-vault hop (form-INVARIANT)
export const GLUE_VELOCITY = -0.5;     // small downward force to stay glued to slopes/stairs
export const GRAVITY = -32.0;          // per-second gravity accel before the form gravity-mult
export const TERMINAL_VELOCITY = -50.0; // fall-speed clamp

export function moveSpeed(loco) { return BASE_MOVE_SPEED * loco.moveMult; }
export function jumpVelocity(loco) { return JUMP_VELOCITY * loco.jumpMult; }
export function applyGravity(vy, gravityMult, delta) {
  const next = vy + GRAVITY * gravityMult * delta;
  return next < TERMINAL_VELOCITY ? TERMINAL_VELOCITY : next;
}
