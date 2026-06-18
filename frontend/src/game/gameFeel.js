// gameFeel.js — PURE movement game-feel math (W4). No THREE / no store / no refs — the Player loop
// (Components.jsx) keeps the velocity + timer REFS and the imperative writes; these own the numbers so
// they are unit-locked and reusable. Style twin of game/dodge.js + game/locomotion.js.

// Horizontal accel/decel rates (world u/s^2 of velocity change). DECEL >= ACCEL so the avatar settles
// faster than it spins up — weighty start, crisp stop (no skating). Tuned against BASE_MOVE_SPEED=10.
export const ACCEL_RATE = 60;
export const DECEL_RATE = 90;

// Jump grace windows (seconds). Coyote: still jumpable ~100ms after walking off a ledge. Buffer: a jump
// pressed ~120ms before landing still fires on touchdown. Both are platformer-standard feel improvements.
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;

// Ramp ONE velocity axis from `current` toward `desired` this frame. Uses DECEL when the move is purely
// shrinking the magnitude toward 0 (same sign, |desired| < |current|, or desired 0); ACCEL otherwise
// (speeding up or reversing). Clamps so it never overshoots `desired`.
export function rampAxis(current, desired, delta, accel = ACCEL_RATE, decel = DECEL_RATE) {
  const slowing = desired === 0 || (Math.sign(desired) === Math.sign(current) && Math.abs(desired) < Math.abs(current));
  const rate = slowing ? decel : accel;
  const step = rate * delta;
  const diff = desired - current;
  if (Math.abs(diff) <= step) return desired;
  return current + Math.sign(diff) * step;
}

// Ramp a 2D planar velocity {x,z} toward a desired {x,z}. Returns a FRESH object (no mutation).
export function rampVelocity(current, desired, delta, accel = ACCEL_RATE, decel = DECEL_RATE) {
  return {
    x: rampAxis(current.x, desired.x, delta, accel, decel),
    z: rampAxis(current.z, desired.z, delta, accel, decel),
  };
}

// Coyote-time gate: a jump is allowed if grounded now OR within COYOTE_TIME of the last grounded moment.
export function coyoteOk(isGrounded, now, lastGroundedAt, coyote = COYOTE_TIME) {
  if (isGrounded) return true;
  if (lastGroundedAt == null) return false;
  return now - lastGroundedAt <= coyote;
}

// Jump-buffer gate: a buffered jump fires if the last jump-press was within JUMP_BUFFER of `now`.
export function bufferOk(lastPressAt, now, buffer = JUMP_BUFFER) {
  if (lastPressAt == null) return false;
  return now - lastPressAt <= buffer;
}
