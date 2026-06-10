// Pure stepper for enemy (skeleton) projectiles — extracted so the React system can be a thin
// transient wrapper. The old component called setState EVERY frame (fresh array even when empty),
// re-rendering at render rate forever + cloning velocity per projectile per frame
// (STATE-REVIEW-2026-06-10 BLOCKING #1 — Game-Loop-Isolation breach).
// Mutates position/age IN PLACE (hot path, zero allocation). Membership changed iff
// survivors.length !== list.length — that's the caller's only setState transition.
export const ENEMY_PROJECTILE_SPEED_SCALE = 60; // legacy tuning: velocity is per-frame-at-60fps units
export const ENEMY_PROJECTILE_HIT_RADIUS = 1.5;
export const ENEMY_PROJECTILE_TTL_SEC = 3;

export function stepEnemyProjectiles(list, dt, playerPos) {
  const survivors = [];
  let hits = 0;
  for (const p of list) {
    p.position.addScaledVector(p.velocity, dt * ENEMY_PROJECTILE_SPEED_SCALE);
    p.age += dt;
    if (p.position.distanceTo(playerPos) < ENEMY_PROJECTILE_HIT_RADIUS) { hits++; continue; }
    if (p.age < ENEMY_PROJECTILE_TTL_SEC) survivors.push(p);
  }
  return { survivors, hits };
}
