// Declared REST POSES for capture, and the resets that restore them.
//
// A capture guard must RESET to a declared value, never early-`return`. Stopping an animation leaves it
// wherever it happened to get to, and capture is enabled AFTER a boot whose length varies 1.68-10.43 s
// between processes — so a freeze is itself run-dependent. The value must be DECLARED (and the markup must
// read the same constant) or the rest pose and the seam drift apart silently, which is the failure the
// mascot's `MASCOT_REST` was introduced to end.
//
// Pure functions, no React and no THREE import: they take the objects and mutate them, so a unit test can
// drive them with real `THREE.Object3D`s — or plain stubs — and assert the resulting numbers.

import { STEP_UP, CLIMBERS, walkAgainstWalls } from './localPath.js';

/**
 * The dragon's declared rest pose. `rotation` is the part that was MISSING: the old capture branch reset
 * the wings and the position and left `rotation` alone, while the flight loop writes `rotation.y` (turn)
 * and `rotation.x` (pitch) every frame. So the captured dragon held whatever heading it happened to have
 * when the flag flipped — a different one per run, which is exactly what the guard existed to prevent.
 */
export const BOSS_REST = Object.freeze({
  rotation: Object.freeze([0, 0, 0]),
  leftWingZ: 0.2,
  rightWingZ: -0.2,
});

/**
 * Put the boss into its declared rest pose. Returns the number of objects it actually reset, so a caller
 * or a test can assert it saw something — a reset that silently found every ref null is indistinguishable
 * from a reset that worked.
 *
 * @param {{mesh?: object, leftWing?: object, rightWing?: object}} refs  live THREE objects (any may be null)
 * @param {number[]|null} spawnPos  the forced spawn position, or null to leave position alone
 * @returns {number} how many objects were reset
 */
export function bossCaptureReset(refs, spawnPos) {
  let n = 0;
  const { mesh, leftWing, rightWing } = refs || {};
  if (leftWing && rightWing) {
    leftWing.rotation.z = BOSS_REST.leftWingZ;
    rightWing.rotation.z = BOSS_REST.rightWingZ;
    n += 2;
  }
  if (mesh) {
    if (spawnPos) mesh.position.set(spawnPos[0], spawnPos[1], spawnPos[2]);
    // The line the old guard did not have. Without it the frame samples a run-dependent heading.
    mesh.rotation.set(BOSS_REST.rotation[0], BOSS_REST.rotation[1], BOSS_REST.rotation[2]);
    n += 1;
  }
  return n;
}

/**
 * How far a knockback impulse carries, per unit of impulse: the displacement the old `impulse * delta * 4` gave at
 * 60 fps, now the SAME at any frame rate. The impulse is one-shot, spent by one frame, so scaling it by that frame's
 * delta made a shove twice as long at 30 fps and six blocks long on a 10 fps hitch — and a spider's leap (the same
 * impulse, magnitude 15) jump six metres (review #6, R7.4).
 */
export const KNOCKBACK_SHOVE_S = 4 / 60;

/**
 * Walk `pos` toward (tx, tz) through THE sub-step walk (localPath.walkAgainstWalls — with its slide), refusing any
 * column whose floor (game/mobFloor.js, seen from the mob's feet) is more than STEP_UP above the one it leaves, or
 * that has no floor it fits in (Infinity). The floor is probed once per COLUMN crossed, not per sub-step: an AoE on a
 * slow frame cast hundreds of rays (review #6, R7.5, R7.6).
 */
function shoveAgainstWalls(pos, tx, tz, floorAt) {
  const feet = pos.y - 0.5; // y is not touched until the next ground snap
  const seen = new Map();
  const floor = (x, z) => {
    const key = Math.floor(x + 0.1) * 73856093 ^ Math.floor(z + 0.1) * 19349663;
    if (!seen.has(key)) seen.set(key, floorAt(x, z, feet));
    return seen.get(key);
  };
  // The floor it STANDS on is tracked from the feet, never re-probed at the point it is leaving: that point can sit
  // on a column seam (x + 0.1 whole) and read the neighbour's floor — a canopy read there made the canopy look level.
  // walkAgainstWalls takes every step canEnter allows, so `here` follows the walk exactly.
  let here = feet;
  const canEnter = (fx, fz, nx, nz) => {
    const next = floor(nx, nz);
    if (next === Infinity) return false;
    if (next != null && !Number.isNaN(next) && next - here > STEP_UP) return false;
    if (next != null && Number.isFinite(next)) here = next;
    return true;
  };
  const r = walkAgainstWalls(pos.x, pos.z, tx, tz, canEnter);
  pos.x = r.x; pos.z = r.z;
}

/**
 * Drain pending knockback impulses.
 *
 * Under capture the impulse is CLEARED WITHOUT DISPLACING — that is the declared reset. The old code
 * returned before this loop entirely, so an impulse stamped in the instant before the flag flipped was
 * never cleared: this loop is its only reader, so it sat on the entity for the whole capture session and
 * then fired on the way out. Whether any entity carries one at capture time is a race, which is precisely
 * the run-dependence the guard was meant to remove.
 *
 * A SHOVE RESPECTS WALLS (review #5, R6.2/R6.8). A long frame makes one shove several blocks long, and it used to
 * land wherever it pointed — through a one-block wall onto the ground beyond, which the 15 Hz ground snap accepts
 * because it compares only where the mob ENDS. So when a ground probe is given, the shove is walked in sub-steps
 * under a cell and stops before the first column more than STEP_UP above the one it is leaving — the same rule
 * the AI's own moves obey (game/localPath.js). Climbers are shoved freely. The probe is the mob FLOOR probe
 * (game/mobFloor.js): the column top would call a tree canopy a wall and stop a shove under it (R7.1).
 *
 * @param {Iterable<object>} entities
 * @param {boolean} capture  true to clear without moving (there is no frame delta: the shove is a fixed distance,
 *   KNOCKBACK_SHOVE_S per unit of impulse — R7.4)
 * @param {(x:number, z:number, feet:number) => number|null} [floorAt]  the mob floor probe, optional
 * @returns {number} eligible entities drained — the DENOMINATOR, so "nothing moved" can be told apart
 *                   from "nothing was looked at"
 */
export function drainKnockback(entities, capture, floorAt = null) {
  let drained = 0;
  for (const e of entities || []) {
    if (!e || e.health <= 0 || e.isStatic || !e.knockback) continue;
    if (!capture) {
      const tx = e.position.x + e.knockback[0] * KNOCKBACK_SHOVE_S;
      const tz = e.position.z + e.knockback[2] * KNOCKBACK_SHOVE_S;
      if (floorAt && !CLIMBERS.has(e.type)) shoveAgainstWalls(e.position, tx, tz, floorAt);
      else { e.position.x = tx; e.position.z = tz; }
      e.snapSync = true; // MobModel exact-copies this frame so the shove reads instant, not damped
    }
    e.knockback = null;
    drained++;
  }
  return drained;
}

/**
 * PURE. Resolve chest heights against live ground, returning the SAME array reference when nothing
 * changed.
 *
 * The identity matters more than the work. The original was `prev.map(...)` running on a 3s interval, and
 * `map` always allocates — so every tick produced a new array, a new React state value and a re-render of
 * every consumer, forever, whether or not a single chest had moved. A no-op tick was indistinguishable
 * from a real one because nothing in the function distinguished "I resolved a chest" from "I looked and
 * there was nothing to do".
 *
 * @param {Array<{resolved?: boolean, position: number[]}>} chests
 * @param {(x: number, z: number) => number|null} getLevel
 * @returns {{chests: Array, changed: number}} the same array when changed === 0
 */
export function resolveChestHeights(chests, getLevel) {
  if (!Array.isArray(chests) || typeof getLevel !== 'function') return { chests: chests, changed: 0 };
  let changed = 0;
  const next = chests.map((chest) => {
    if (!chest || chest.resolved) return chest;
    const h = getLevel(chest.position[0], chest.position[2]);
    if (typeof h !== 'number' || isNaN(h) || h <= 0) return chest;
    changed++;
    return { ...chest, position: [chest.position[0], h + 1, chest.position[2]], resolved: true };
  });
  return { chests: changed ? next : chests, changed };
}
