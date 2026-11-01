// buildRay.js — the build ray: the one per-click ray the verb router and the executors read (Terrain.jsx hands it to
// GameMethods.castBuildRay), and the nearest-hit query it and the target outline share.
//
// A RAY MUST SEE A CELL PLACED SINCE THE LAST STEP. Rapier answers world.castRay from a broad-phase BVH that only a world
// step updates (rapier3d-compat 0.19.2), so a placed cell's cuboid and a rebuilt chunk's trimesh are missed by every ray
// until the next step (world/placedCellColliders.js lists them as `unindexed`). Two clicks between one pair of frames
// aimed the second through the first click's new cell, at the ground behind it. So the query also casts against each of
// those colliders by itself (Collider.castRayAndGetNormal reads the shape, not the BVH) and takes the nearer hit.
// Lives here, not in Terrain.jsx, so a unit drives it with no terrain worker (tests/gates/build-ray-unindexed-gates.test.js).
// Terrain.jsx's own wiring, the click's ray and the target outline each handing it placedCells.unindexed(), is driven in
// the mounted world with the worker stood in for (tests/gates/verb-ledger-gates.test.jsx).
//
// Cost: one pairwise ray cast per unindexed collider, on a frame that has any (a placement or a chunk landing makes one);
// none otherwise.
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { chestHasItems } from '../game/chestState.js';
import { mineTarget } from './buildTarget.js';

const BUILD_REACH = 8.0;

/**
 * The nearest solid hit along `ray` within `maxToi`: the world's query (the BVH), or a collider made since the last step,
 * whichever is nearer. Returns { timeOfImpact, normal } or null.
 *   flags, excludeBody, filter  the world query's filterFlags, filterExcludeRigidBody and filterPredicate
 *   unindexed                   the colliders made since the last world step (world/placedCellColliders.js), or undefined
 */
export function castRayNearest(world, ray, maxToi, flags, excludeBody, filter, unindexed) {
  let best = world.castRayAndGetNormal(ray, maxToi, true, flags, undefined, undefined, excludeBody, filter);
  if (!unindexed) return best;
  for (const c of unindexed) {
    // A collider removed since it was listed (a chunk re-meshed twice between steps) has no shape left to cast against.
    if (!c.isValid() || (filter && !filter(c))) continue;
    const h = c.castRayAndGetNormal(ray, best ? best.timeOfImpact : maxToi, true);
    if (h && (!best || h.timeOfImpact < best.timeOfImpact)) best = h;
  }
  return best;
}

/** The player's own body is never in the way of their ray. */
function excludingPlayer(playerHandle) {
  return (collider) => {
    if (playerHandle === undefined) return true;
    const parent = collider.parent();
    return !parent || parent.handle !== playerHandle;
  };
}

/**
 * The single per-click build ray from the camera. null on no hit; else everything the router needs (toi, chestTargeted)
 * and everything the executors need (hitPoint, normal, coords).
 * NOTE (preserved quirk): multiplyScalar MUTATES `direction` to dir * toi, and the delete and place fallback offsets use
 * that scaled vector.
 *   unindexed  the colliders made since the last world step (world/placedCellColliders.js unindexed())
 */
export function castBuildRay(world, rapier, camera, unindexed) {
  const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const rayStart = camera.position.clone();

  const ray = new rapier.Ray(
    { x: rayStart.x, y: rayStart.y, z: rayStart.z },
    { x: direction.x, y: direction.y, z: direction.z }
  );

  // EXCLUDE_DYNAMIC: the only dynamic bodies are the block-break debris (world/BlockParticleSystem.jsx).
  const hit = castRayNearest(world, ray, BUILD_REACH, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, playerRigidBody, excludingPlayer(playerRigidBody?.handle), unindexed);
  if (!hit) return null;

  // This rapier build exposes `timeOfImpact`; the legacy `hit.toi` is undefined at runtime and gave NaN coordinates.
  const toi = hit.timeOfImpact;
  const hitPoint = rayStart.clone().add(direction.multiplyScalar(toi));

  const store = useGameStore.getState();
  const { x: targetedX, y: targetedY, z: targetedZ } = mineTarget(hitPoint, direction, store);
  const targetCoords = `${targetedX}_${targetedY}_${targetedZ}`;

  return {
    toi,
    normal: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null,
    direction,
    hitPoint,
    targetedX,
    targetedY,
    targetedZ,
    targetCoords,
    chestTargeted: !!(store.chests && store.chests.has(targetCoords)),
    // Whether that chest still holds anything. The router refuses a left-click MINE on a loaded chest (mine() deletes the
    // chest and drops nothing), but lets you remove an empty one you placed: so the guard needs the contents.
    chestHasItems: chestHasItems(store.chests && store.chests.get(targetCoords)),
  };
}
