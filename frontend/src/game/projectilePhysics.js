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
export const PROJECTILE_GRAVITY = { fireball: 0, iceball: 0 };

/** Downward acceleration (units/s^2) for a projectile type. 0 (straight flight) for anything unlisted. */
export function projectileGravity(type) {
  return PROJECTILE_GRAVITY[type] || 0;
}
