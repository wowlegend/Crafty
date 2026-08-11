// Pure stepper for enemy (skeleton) projectiles — extracted so the React system can be a thin
// transient wrapper. The old component called setState EVERY frame (fresh array even when empty),
// re-rendering at render rate forever + cloning velocity per projectile per frame
// (STATE-REVIEW-2026-06-10 BLOCKING #1 — Game-Loop-Isolation breach).
// Mutates position/age IN PLACE (no per-projectile allocation — addScaledVector replaced the old
// velocity.clone(); the per-call survivors[] + result object remain, negligible at these counts).
// Membership changed iff survivors.length !== list.length — the caller's only setState transition.
export const ENEMY_PROJECTILE_SPEED_SCALE = 60; // legacy tuning: velocity is per-frame-at-60fps units
export const ENEMY_PROJECTILE_HIT_RADIUS = 1.5;
export const ENEMY_PROJECTILE_TTL_SEC = 3;

/**
 * Largest slice integrated in one go, and the ceiling on a single frame's worth.
 *
 * This is the twin of hurl.js and had the defect hurl.js was rewritten to fix. An arrow travels
 * 0.4 * 60 = 24 u/s against a 1.5 u hit radius, tested by a SINGLE post-advance point sample -- so a
 * dead-centre pass is missed entirely once dt exceeds ~0.125 s, and a 1.4 u grazing pass (chord 1.08 u)
 * needs only ~0.045 s. R3F does not clamp: @react-three/fiber 9.5.0 passes `clock.getDelta()` straight
 * through with no cap, EnemyProjectileSystem forwards it raw, and there is no project-level clamp -- and
 * hurl.js's own header records dt = 0.50 s OBSERVED in this repo at nearly identical geometry.
 *
 * The step is well under the time to cross the hit radius; the frame cap stops a tab-restore spike from
 * turning one frame into a hundred substeps.
 */
export const ENEMY_PROJECTILE_MAX_STEP_SEC = 0.02;
export const ENEMY_PROJECTILE_FRAME_CAP_SEC = 0.25;

export function stepEnemyProjectiles(list, dt, playerPos) {
  const survivors = [];
  let hits = 0;
  // SUBSTEPPED. Each projectile is advanced in slices small enough that it cannot pass through the
  // player between two samples. Hits are counted at most ONCE per projectile -- a substepped loop that
  // counted per slice would turn one arrow into several hits on a long frame, which is the opposite
  // error and just as invisible.
  const total = Math.min(Number.isFinite(dt) && dt > 0 ? dt : 0, ENEMY_PROJECTILE_FRAME_CAP_SEC);
  for (const p of list) {
    let remaining = total;
    let hit = false;
    while (remaining > 1e-9 && !hit) {
      const step = Math.min(remaining, ENEMY_PROJECTILE_MAX_STEP_SEC);
      p.position.addScaledVector(p.velocity, step * ENEMY_PROJECTILE_SPEED_SCALE);
      p.age += step;
      if (p.position.distanceTo(playerPos) < ENEMY_PROJECTILE_HIT_RADIUS) hit = true;
      remaining -= step;
    }
    if (hit) { hits++; continue; }
    if (p.age < ENEMY_PROJECTILE_TTL_SEC) survivors.push(p);
  }
  return { survivors, hits };
}
