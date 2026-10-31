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
 * past PICKUP_CULL_RANGE from the player, a pickup OUTSIDE ITS MAGNET reports `{ collected: true, expired: true }`: what it
 * carries is OWED to the player, so the system banks it (silently, with no pop at a spot they are not at) rather than
 * dropping it. A pickup inside its magnet is the player's to collect in hand whatever its age, so what is banked is always
 * out of reach. The pool's size bound (MAX_XP_ORBS, MAX_LOOT_DROPS) is enforced by cutXPOrbs and cutLootDrops, which cut
 * the pickups out of reach first and collect in hand any they must cut within it.
 */

/** World seconds a pickup waits for the player (it ages on the world clock, so a pause or a hitstop does not spend it). */
export const PICKUP_LIFETIME_S = 90;
/** Metres from the player past which a pickup outside its magnet is banked at once: the mobs' own cull range (SpawnerSystem maxDistance). */
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

/** What a cut does to a pickup out of reach: owed to the player, banked quietly. */
const BANKED = Object.freeze({ collected: true, expired: true });
/** What a cut does to a pickup within reach: an ordinary collect, with the pop and the sound; the player is about to have it. */
const IN_HAND = Object.freeze({ collected: true });

const ORB_PARAMS = Object.freeze({ magnetRange: 12, pullBase: 80, pullFloor: 4 });
const DROP_PARAMS = Object.freeze({ magnetRange: 7, pullBase: 40, pullFloor: 3 });

// How far the player is from a pickup: the distance the magnet and the collect are both read at (a point 0.5 below the camera).
function distanceToPlayer(orb, pp) {
  const p = orb.position;
  const dx = pp.x - p.x, dy = (pp.y - 0.5) - p.y, dz = pp.z - p.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The pickups to cut so that at most `max` stay, each with what the cut does to it, or null while the pool is within its
 * bound (the frame that needs no cut allocates nothing). The pickups out of reach go first, the oldest first: they are the
 * ones the player is not about to collect, and banking them is silent. If the overflow is larger than they are, the oldest
 * within reach are cut too and COLLECTED IN HAND: a pickup the player is standing in is theirs with its sound and its number,
 * and banking it in silence would take both from a player who is looking at it.
 * @param {{age:number, position:{x:number,y:number,z:number}}[]} entities  a pickup query's entities
 * @param {number} max
 * @param {{x:number,y:number,z:number}} playerPos
 * @param {number} magnetRange  the kind's magnet: within it, a pickup is within reach
 * @returns {Map<object, {collected:boolean, expired?:boolean}>|null}
 */
function cutOverBound(entities, max, playerPos, magnetRange) {
  const over = entities.length - max;
  if (over <= 0) return null;
  const ranked = entities.map((e) => ({ e, near: distanceToPlayer(e, playerPos) < magnetRange }));
  ranked.sort((a, b) => (a.near === b.near ? 0 : a.near ? 1 : -1) || b.e.age - a.e.age);
  const cut = new Map();
  for (let i = 0; i < over; i++) cut.set(ranked[i].e, ranked[i].near ? IN_HAND : BANKED);
  return cut;
}

/** The XP orbs to cut past MAX_XP_ORBS, with what the cut does to each (see cutOverBound). */
export const cutXPOrbs = (entities, playerPos) => cutOverBound(entities, MAX_XP_ORBS, playerPos, ORB_PARAMS.magnetRange);
/** The loot drops to cut past MAX_LOOT_DROPS, with what the cut does to each (see cutOverBound). */
export const cutLootDrops = (entities, playerPos) => cutOverBound(entities, MAX_LOOT_DROPS, playerPos, DROP_PARAMS.magnetRange);

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
  const dist = distanceToPlayer(orb, pp);
  if (dist >= magnetRange && (orb.age >= PICKUP_LIFETIME_S || dist > PICKUP_CULL_RANGE)) {
    return BANKED; // before the ground probe: it is leaving the world, and only from outside its magnet
  }
  if (dist < magnetRange) {
    const dx = pp.x - p.x, dy = (pp.y - 0.5) - p.y, dz = pp.z - p.z;
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
  return _stepMagnet(orb, delta, ctx, ORB_PARAMS);
}

/** Loot drop: magnet range 7, pull base 40, floor 3 (the original LootSystem params). */
export function stepLootDrop(orb, delta, ctx) {
  return _stepMagnet(orb, delta, ctx, DROP_PARAMS);
}
