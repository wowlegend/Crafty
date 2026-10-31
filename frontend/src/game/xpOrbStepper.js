/**
 * xpOrbStepper.js -- PURE per-frame magnet-pickup physics (no THREE/React; node-testable). Extracted
 * byte-equivalent from SimplifiedNPCSystem's XPOrbSystem + LootSystem (the god-file de-monolith,
 * charter S3). The XP-orb and loot steppers are the SAME physics with DIFFERENT params (spec S3-M6),
 * now unified behind `_stepMagnet`. Mutates orb.position/velocity/age via .x/.y/.z arithmetic (works
 * on a THREE.Vector3 entity AND a plain test object) and returns {collected, expired?} -- the component owns the
 * (different) collect side-effects. ctx = { playerPos:{x,y,z}, groundYAt:(x,z,y)=>number|null } — `y` is the
 * orb's own height, so the caller can answer with the floor of the air gap the orb is in (QUEUE R7.9: the column
 * top under a tree is the canopy, and a drop there snapped up onto the leaves).
 *
 * A pickup is a POOL entry with a lifetime (AUDIT:leaks:stranded-pickups-never-despawn): one the player never walks to
 * paid a floor probe and a render callback every frame for the whole session. Past PICKUP_LIFETIME_S of world time, or
 * past PICKUP_CULL_RANGE from the player, a pickup out of reach reports `{ collected: true, expired: true }`: what it
 * carries is OWED to the player, so the system banks it (silently, with no pop at a spot they are not at) rather than
 * dropping it. The pool's size bound (MAX_XP_ORBS, MAX_LOOT_DROPS) is enforced by the systems, oldest banked first.
 */

/** World seconds a pickup waits for the player (it ages on the world clock, so a pause or a hitstop does not spend it). */
export const PICKUP_LIFETIME_S = 90;
/** Metres from the player past which a pickup is banked at once: the mobs' own cull range (SpawnerSystem maxDistance). */
export const PICKUP_CULL_RANGE = 100;
/**
 * Pickups alive at once, XP orbs and loot drops each. One kill is at most 6 orbs and a drop, so 64 orbs is ten kills
 * stranded out of reach and 32 drops a few chests' worth. Each pickup is a shadow-casting mesh and a floor probe a frame,
 * and the iPad-class budget is what the bound protects (the cost reading is in DECISIONS 2026-10-30, lane L9).
 */
export const MAX_XP_ORBS = 64;
export const MAX_LOOT_DROPS = 32;

/** A pickup within this of the player is in their hands. */
const COLLECT_DIST = 1.2;

/**
 * The pickups to bank so that at most `max` stay in the world: the oldest by age. null while the pool is within its
 * bound, so the frame that needs no cut allocates nothing.
 * @param {{age:number}[]} entities  a pickup query's entities
 * @param {number} max
 * @returns {Set<object>|null}
 */
export function oldestOverBound(entities, max) {
  const over = entities.length - max;
  if (over <= 0) return null;
  return new Set([...entities].sort((a, b) => b.age - a.age).slice(0, over));
}

/** What a step reports for a pickup the bound cut: owed to the player, banked quietly. */
export const BANKED = Object.freeze({ collected: true, expired: true });

// Shared magnet-pickup step. params = { magnetRange, pullBase, pullFloor }.
function _stepMagnet(orb, delta, ctx, { magnetRange, pullBase, pullFloor }) {
  const p = orb.position, v = orb.velocity;
  orb.age += delta;
  if (orb.age < 0.8) {
    // explosion phase: gravity + ground bounce (identical for both pickups)
    v.y -= 12 * delta;
    p.x += v.x * delta; p.y += v.y * delta; p.z += v.z * delta;
    const gy = ctx.groundYAt ? ctx.groundYAt(p.x, p.z, p.y) : null;
    if (gy !== null && Number.isFinite(gy) && p.y < gy + 0.1) {
      p.y = gy + 0.1;
      v.y = -v.y * 0.4;       // bounce damping
      v.x *= 0.7; v.z *= 0.7; // friction
    }
    return { collected: false };
  }
  // magnetic pull phase
  const pp = ctx.playerPos;
  const dx = pp.x - p.x, dy = (pp.y - 0.5) - p.y, dz = pp.z - p.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist >= COLLECT_DIST && (orb.age >= PICKUP_LIFETIME_S || dist > PICKUP_CULL_RANGE)) {
    return BANKED; // before the pull and the ground probe: it is leaving the world
  }
  if (dist < magnetRange) {
    const inv = 1 / (dist || 1e-6);
    const pullSpeed = Math.max(pullFloor, pullBase / (dist + 0.2));
    p.x += dx * inv * pullSpeed * delta;
    p.y += dy * inv * pullSpeed * delta;
    p.z += dz * inv * pullSpeed * delta;
  } else if (ctx.groundYAt) {
    const gy = ctx.groundYAt(p.x, p.z, p.y);
    if (gy !== null && Number.isFinite(gy)) p.y = gy + 0.1;
  }
  return { collected: dist < COLLECT_DIST };
}

/** XP-orb: magnet range 12, pull base 80, floor 4 (the original XPOrbSystem params). */
export function stepXPOrb(orb, delta, ctx) {
  return _stepMagnet(orb, delta, ctx, { magnetRange: 12, pullBase: 80, pullFloor: 4 });
}

/** Loot drop: magnet range 7, pull base 40, floor 3 (the original LootSystem params). */
export function stepLootDrop(orb, delta, ctx) {
  return _stepMagnet(orb, delta, ctx, { magnetRange: 7, pullBase: 40, pullFloor: 3 });
}
