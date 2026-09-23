// mobFloorProbe.js — game/mobFloor.js bound to a Rapier world. Terrain.jsx registers the result as the store's
// getMobFloor, beside the top-down getMobGroundLevel it does not replace (rain, spawns and chests want the top).
import { columnFaces, floorInColumn } from '../game/mobFloor.js';

/**
 * (x, z, feet, clearance?, reach?) -> the floor under a mover at those feet | Infinity (the column is a wall to it) |
 * null (no data). `clearance` and `reach` default to a mob's; floorUnderPoint passes clearance 0 for a point, the
 * spawn check its own reach.
 *
 * Casts meet FIXED colliders only — the chunks' terrain trimeshes. The player capsule (kinematic) and flying
 * debris cuboids (dynamic) would each add a face the alternation does not expect and flip every gap below them.
 * `solid = false` so a cast starting inside a convex shape reports where it leaves it, like a trimesh does.
 * Same +0.1 seam jitter as the top-down probe, so both read the same column for the same (x, z).
 */
export function makeMobFloorProbe(rapier, world) {
  const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const onlyFixed = rapier.QueryFilterFlags.ONLY_FIXED | rapier.QueryFilterFlags.EXCLUDE_SENSORS;
  // ONE cast function for every query: the column's x/z are set on the shared ray before the walk (it used to
  // allocate a closure per call, several times per mob per frame — review #7, R8.8).
  const castDown = (y) => {
    ray.origin.y = y;
    const hit = world.castRay(ray, y + 512, false, onlyFixed);
    return hit ? y - hit.timeOfImpact : null;
  };
  return (x, z, feet, clearance, reach) => {
    ray.origin.x = x + 0.1;
    ray.origin.z = z + 0.1;
    return floorInColumn(columnFaces(castDown, feet), feet, clearance, reach);
  };
}
