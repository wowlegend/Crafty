// hurl.js — S2-B2-M3: the PURE hurl/slam core (twin of enemyProjectiles.js — no React/Three/
// Rapier/store, node-testable, gate-clean). Mobs are COLLIDER-LESS, so impact is proximity math
// over the caller's mob snapshot, never physics contacts. The hit event carries pos + normalized
// flight dir — the seam M4's base-as-anvil wall ray consumes (this module stays wall-agnostic).

export const HURL_SPEED = 22;        // m/s along camera-forward (M2 stand-in ballpark)
export const HURL_LIFT = 2;          // small initial vy lift -> readable arc
export const HURL_GRAVITY = 9;       // mild pull-down (full 30 reads like a brick)
export const HURL_TTL_SEC = 1.5;     // max flight
export const HURL_HIT_RADIUS = 1.4;  // 0.85 cube + mob body
export const HURL_DAMAGE = 30;       // base; element type re-skins via damageMob's spark switch
export const HURL_KNOCK = 12;        // entity.knockback magnitude (leap precedent = 15)
export const SLAM_RADIUS = 3;        // AoE around the phantom's orbit point
export const SLAM_DAMAGE_MULT = 1.3;

export function makeHurl(origin, dir) {
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: { x: dir.x * HURL_SPEED, y: dir.y * HURL_SPEED + HURL_LIFT, z: dir.z * HURL_SPEED },
    age: 0,
  };
}

/** Advance one frame. Returns { done, hit: { id, pos, dir } | null }. Mutates h in place (GLI). */
export function stepHurl(h, dt, mobs) {
  h.velocity.y -= HURL_GRAVITY * dt;
  h.position.x += h.velocity.x * dt;
  h.position.y += h.velocity.y * dt;
  h.position.z += h.velocity.z * dt;
  h.age += dt;

  let nearest = null;
  let nearestD = HURL_HIT_RADIUS;
  for (const m of mobs) {
    const dx = m.position.x - h.position.x;
    const dy = m.position.y - h.position.y;
    const dz = m.position.z - h.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < nearestD) { nearestD = d; nearest = m; }
  }
  if (nearest) {
    const vmag = Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) || 1;
    return {
      done: true,
      hit: {
        id: nearest.id,
        pos: { x: h.position.x, y: h.position.y, z: h.position.z },
        dir: { x: h.velocity.x / vmag, y: h.velocity.y / vmag, z: h.velocity.z / vmag },
      },
    };
  }
  return { done: h.age >= HURL_TTL_SEC, hit: null };
}

/** SLAM: radial horizontal knock events for mobs within radius of the orbit point. */
export function resolveSlam(center, mobs, radius = SLAM_RADIUS) {
  const events = [];
  for (const m of mobs) {
    const dx = m.position.x - center.x;
    const dy = m.position.y - center.y;
    const dz = m.position.z - center.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > radius) continue;
    const hmag = Math.hypot(dx, dz);
    // directly-under fallback: push +x (deterministic, finite)
    const dir = hmag > 1e-6 ? { x: dx / hmag, y: 0, z: dz / hmag } : { x: 1, y: 0, z: 0 };
    events.push({ id: m.id, dir });
  }
  return events;
}
