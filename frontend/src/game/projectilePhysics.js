/**
 * projectilePhysics.js — per-type downward acceleration for player spell projectiles.
 *
 * B8 (18-domain review): fireball + iceball — the DEFAULT starting spells — got `velocity.y -= 12 * delta`
 * every frame. They are launched STRAIGHT along the crosshair (camera.getWorldDirection()), exactly like
 * lightning and arcane, which have NO drop. So a level-aimed shot arced into the ground before ~12 m: the
 * starting spell could not hit anything at range. That is a functional bug (aim != hit), not a lobbed-arc
 * design — nothing compensates the aim upward for an arc.
 *
 * Fix: 0 = flies straight, so aim == hit, consistent with the other direct-fire spells. This is the ONE
 * knob: a deliberate lob-arc (fireball as an over-cover grenade) is a taste choice — bump the value here
 * and add upward aim-compensation — and is queued in KEVIN-REVIEW-BATCH rather than guessed at.
 */
import { floorUnderPoint } from './mobFloor.js';

export const PROJECTILE_GRAVITY = { fireball: 0, iceball: 0 };

/**
 * Has a spell at `pos` reached the ground, or flown into solid? Within 0.5 of the floor of the air gap it is IN
 * (game/mobFloor.js) — not of the column top: under a tree or a roof the top is the canopy, and a spell cast
 * there burst 2 m from the caster, at the muzzle (QUEUE R7.9).
 */
export function projectileGrounded(pos, getFloor, getTop) {
  const g = floorUnderPoint(getFloor, getTop, pos.x, pos.z, pos.y);
  return g !== null && !Number.isNaN(g) && pos.y <= g + 0.5;
}

/** Longest stretch of a spell's flight between two ground checks, in metres: under a block, so none is skipped. */
export const PROJECTILE_SUBSTEP = 0.5;

/**
 * Move a spell one frame along `vel`, checking `grounded(pos)` every PROJECTILE_SUBSTEP and stopping at the first
 * point that lands. The check used to run once, at the END of the frame's move: a 25 m/s fireball crosses 8 m in
 * a 3 fps frame, so on a slow device a spell flew THROUGH a thin wall, and out from under a roof before anything
 * looked (found while proving R7.9 in the running game: the frame rate hid the bug from its own test).
 * Mutates `pos`; returns whether it landed (then `pos` is the landing point).
 */
export function advanceProjectile(pos, vel, delta, grounded) {
  const n = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.y, vel.z) * delta) / PROJECTILE_SUBSTEP));
  const sx = (vel.x * delta) / n, sy = (vel.y * delta) / n, sz = (vel.z * delta) / n;
  for (let i = 0; i < n; i++) {
    pos.x += sx; pos.y += sy; pos.z += sz;
    if (grounded(pos)) return true;
  }
  return false;
}

/** Downward acceleration (units/s^2) for a projectile type. 0 (straight flight) for anything unlisted. */
export function projectileGravity(type) {
  return PROJECTILE_GRAVITY[type] || 0;
}
