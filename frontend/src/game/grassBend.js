// grassBend.js — PURE selection of the entities the grass shader bends around.
//
// WHY IT IS A SEAM. The shader takes 8 `entityPositions` slots and pushes grass away from each one.
// Filling them used to happen inside a per-chunk `useFrame`, where it was untestable, and it was WRONG:
// it read `entity.position[0]` from live ECS entities whose `position` is a `THREE.Vector3`.
//
// That mistake is not careless — this codebase carries BOTH shapes on purpose:
//   - ECS entities (`mobsQuery`) store a THREE.Vector3   -> SpawnerSystem.jsx:58, npcSpawn.js:32
//   - the store mirror (`mobEntities`) stores an [x,y,z] -> MinimapSyncSystem.jsx:20
// Array-indexing is correct for the mirror and silently wrong for the entity. So this module accepts
// EITHER and is tested against both, which is the only version of the fix that cannot regress the next
// time a caller passes the other one.
//
// How the bug hid: indexing a Vector3 yields `undefined`, which reaches the uniform as NaN. In the
// shader the guard is `if (pos.y > 9990.0) continue;` — NaN > 9990.0 is FALSE, so the dead slot is not
// skipped; then `if (dist < 2.2)` is also false, so nothing bends. The result is silence, not an error:
// mob grass-bending never worked, and consumed up to 7 of the 8 slots doing it.

/** Slot count the shader declares (`uniform vec3 entityPositions[8]`). */
export const BEND_SLOTS = 8;

/** Sentinel the shader tests with `pos.y > 9990.0` to skip an unused slot. */
export const INACTIVE = 9999;

/**
 * Read an {x,y,z} out of either supported position shape.
 * Returns null for anything that would produce a non-finite component, so a malformed entity is
 * DROPPED rather than being written as NaN — the failure mode that made this silent before.
 */
export function readPosition(p) {
  if (!p) return null;
  const x = Array.isArray(p) ? p[0] : p.x;
  const y = Array.isArray(p) ? p[1] : p.y;
  const z = Array.isArray(p) ? p[2] : p.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

/**
 * Choose the up-to-8 world positions the grass should bend around: the player first, then mobs.
 *
 * Pure — no THREE, no store, no ECS import — so the selection is node-testable. The caller writes the
 * result into the uniform's Vector3 slots.
 *
 * @param {{x:number,y:number,z:number}|null} playerPos
 * @param {Iterable<{position?:any}>} mobs
 * @returns {Array<[number,number,number]>} exactly BEND_SLOTS entries; unused ones are INACTIVE
 */
export function collectBendSources(playerPos, mobs) {
  const out = [];
  const player = readPosition(playerPos);
  if (player) out.push([player.x, player.y, player.z]);

  for (const m of mobs || []) {
    if (out.length >= BEND_SLOTS) break;
    const p = readPosition(m && m.position);
    if (p) out.push([p.x, p.y, p.z]);
  }

  while (out.length < BEND_SLOTS) out.push([INACTIVE, INACTIVE, INACTIVE]);
  return out;
}
