// localPath.js — how a hostile mob gets around, and NOT over, a wall (QUEUE P1).
//
// The AI worker moved a mob's x, z with no height check, and the main thread snapped y to the TOP surface (a ray
// cast down from y = 255). So whenever the 9x9 A* found no path — the player behind a wall, or inside a built
// enclosure — the mob walked straight at the player and rose onto the wall top. A player-built wall stopped
// nothing that was not already pathing around it.
//
// Two rules, pure so they are testable outside the worker (workers/ai.worker.js imports them):
//  - findLocalPath: the local A*, which now returns the path to the reached cell NEAREST the goal when the goal
//    itself is unreachable, so a blocked mob goes to the wall face rather than beelining at it;
//  - clampMove: a move may not enter a cell more than STEP_UP above the one it leaves (the same rule A* uses);
//    a blocked move slides along the free axis, and any step DOWN is allowed.
//
// ONE GRID FRAMING, used by everything that touches the grid (review #4, R5.1): the grid is centred on the
// COLUMN the mob stands on — the column its ground snap probes, floor(x + 0.1), because getMobGroundLevel casts
// at (x + 0.1, z + 0.1). So cell (gx, gz) is world column (gridOrigin(mobX) + gx, gridOrigin(mobZ) + gz),
// row-major gz * GRID + gx, and the mob is always cell (4, 4). It used to be round(mobX): for frac(x) in
// [0.5, 0.9) the mob stood on column floor(x) while A* believed it stood on round(x) — against a wall, on the
// wall top — and planned straight over the wall it was pressed against.
/** The world column whose cell is (0, 0) in a grid centred on the column containing `v`. */
export function gridOrigin(v) {
  return Math.floor(v + 0.1) - 4;
}
/** The grid cell index (may lie outside 0..8) of the column containing `v`. */
export function cellOf(v, origin) {
  return Math.floor(v + 0.1) - origin;
}
/** Where to steer for cell g: the middle of the span of positions whose snap probes that column. */
export function cellCentre(g, origin) {
  return origin + g + 0.4;
}
import { NEIGHBOR_OFFSETS, octileHeuristic, DIAG_COST } from './aStarNeighbors.js';

/** Cells per side of the mob-centred grid; the mob is at (4, 4). */
export const GRID = 9;
/** A rise of more than this, in blocks, is a wall: walked around, never stepped up. */
export const STEP_UP = 1.25;
/** Mobs that climb walls anyway — the genre's spiders. Everything else is stopped by them. */
export const CLIMBERS = new Set(['spider']);
/** Longest sub-step clampMove checks, in metres: under a cell, so a fast move cannot jump a 1-block wall. */
const SUBSTEP = 0.5;

/** Can a diagonal's swept path pass through an orthogonal cell of height `ho` from `hFrom` to `hTo`? */
function cornerOk(hFrom, ho, hTo) {
  return ho - hFrom <= STEP_UP && hTo - ho <= STEP_UP;
}

/**
 * A* on the local grid from (sx, sz) to (ex, ez). Returns the cell path (start first) to the goal, or — when the
 * goal cannot be reached — to the reached cell nearest it (octile distance, then fewest steps); null when no
 * other cell is reachable at all.
 */
export function findLocalPath(heightGrid, sx, sz, ex, ez) {
  const openSet = [];
  const closedSet = new Set();
  const startIdx = sx + sz * GRID;
  const endIdx = ex + ez * GRID;
  const nodeData = {};
  nodeData[startIdx] = { g: 0, f: octileHeuristic(sx, sz, ex, ez), parent: null, x: sx, z: sz };
  openSet.push(startIdx);

  const pathTo = (idx) => {
    const path = [];
    for (let curr = idx; curr !== null; curr = nodeData[curr].parent) path.push([nodeData[curr].x, nodeData[curr].z]);
    return path.reverse();
  };

  let best = startIdx, bestH = octileHeuristic(sx, sz, ex, ez);
  let iterations = 0;
  // Safety cap to prevent worker stalls (the 81-cell grid completes in very few steps).
  while (openSet.length > 0 && iterations++ < 120) {
    openSet.sort((a, b) => nodeData[a].f - nodeData[b].f);
    const currentIdx = openSet.shift();
    if (currentIdx === endIdx) return pathTo(currentIdx);

    closedSet.add(currentIdx);
    const currNode = nodeData[currentIdx];
    const h = octileHeuristic(currNode.x, currNode.z, ex, ez);
    if (h < bestH || (h === bestH && currNode.g < nodeData[best].g)) { best = currentIdx; bestH = h; }
    const ch = heightGrid[currentIdx];

    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = currNode.x + dx;
      const nz = currNode.z + dz;
      if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
      const nIdx = nx + nz * GRID;
      if (closedSet.has(nIdx)) continue;
      const heightDiff = heightGrid[nIdx] - ch;
      if (heightDiff > STEP_UP) continue; // a wall: walked around, never stepped up
      // No cutting a corner (review #4 R5.2, review #5 R6.1): a diagonal sweeps through one of its two orthogonal
      // cells, so BOTH legs of each — into the orthogonal, and out of it to the target — must be climbable, or the
      // mover (clampMove, which checks the real swept path) refuses it and the mob wedges at the corner forever.
      // A wall beside the corner fails the first leg; a trench beside it fails the second.
      if (dx !== 0 && dz !== 0 && (!cornerOk(ch, heightGrid[nx + currNode.z * GRID], heightGrid[nIdx])
        || !cornerOk(ch, heightGrid[currNode.x + nz * GRID], heightGrid[nIdx]))) continue;
      // Diagonal cost is sqrt(2); a deep drop adds a caution penalty.
      const gScore = currNode.g + (dx !== 0 && dz !== 0 ? DIAG_COST : 1.0) + (heightDiff < -2.0 ? 1.5 : 0.0);
      if (!nodeData[nIdx] || gScore < nodeData[nIdx].g) {
        nodeData[nIdx] = { g: gScore, f: gScore + octileHeuristic(nx, nz, ex, ez), parent: currentIdx, x: nx, z: nz };
        if (!openSet.includes(nIdx)) openSet.push(nIdx);
      }
    }
  }
  return best === startIdx ? null : pathTo(best);
}

/**
 * Move a mob from (fromX, fromZ) toward (toX, toZ) without stepping UP more than STEP_UP into a cell, checked
 * in sub-steps so a fast move cannot jump a wall. A blocked sub-step slides along whichever axis is free.
 * Cells outside the grid are unknown and allowed. `climber` skips the rule.
 * @returns {{x:number, z:number, blocked:boolean}} blocked: some part of the move was refused
 */
export function clampMove(heightGrid, fromX, fromZ, toX, toZ, climber = false) {
  if (climber) return { x: toX, z: toZ, blocked: false };
  const ox = gridOrigin(fromX), oz = gridOrigin(fromZ);
  const heightAt = (x, z) => {
    const gx = cellOf(x, ox), gz = cellOf(z, oz);
    return gx < 0 || gx >= GRID || gz < 0 || gz >= GRID ? null : heightGrid[gz * GRID + gx];
  };
  const canEnter = (fx, fz, tx, tz) => {
    const a = heightAt(fx, fz), b = heightAt(tx, tz);
    return a === null || b === null || b - a <= STEP_UP;
  };
  const n = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / SUBSTEP));
  const sx = (toX - fromX) / n, sz = (toZ - fromZ) / n;
  let x = fromX, z = fromZ, blocked = false;
  for (let i = 0; i < n; i++) {
    if (canEnter(x, z, x + sx, z + sz)) { x += sx; z += sz; continue; }
    blocked = true;
    if (sx !== 0 && canEnter(x, z, x + sx, z)) x += sx;       // slide along x
    else if (sz !== 0 && canEnter(x, z, x, z + sz)) z += sz;  // or along z
  }
  return { x, z, blocked };
}

/**
 * THE GROUND SNAP, with the step rule — the ONE choke point every mover passes through (review #4, R5.3/R5.6).
 *
 * The main thread snaps a mob's y to the top of the column it stands on (the probe casts down from y = 255).
 * The worker's clampMove only covers aggro mobs that carry a height grid; wandering mobs, the first aggro tick,
 * knockback shoves and spawns set x/z with no check, and the snap then lifted them onto any wall. So the snap
 * itself refuses: if the column's top is more than STEP_UP above the mob's feet, the mob goes back to the last
 * position that stood on reachable ground, and its y is left alone. Any step DOWN is taken. Climbers climb.
 * Mutates `e.position` and the entity's `footX/footZ` memory; returns whether the move was refused.
 */
export function settleOnGround(e, groundY, climber = false) {
  const feet = e.position.y - 0.5;
  // Blocks placed on the column the mob ALREADY stands on (a build footprint) lift it: refusing would rewind it
  // to the same spot forever, embedded in the new blocks (review #5, R6.4).
  const sameColumn = e.footX !== undefined
    && Math.floor(e.position.x + 0.1) === Math.floor(e.footX + 0.1) && Math.floor(e.position.z + 0.1) === Math.floor(e.footZ + 0.1);
  if (!climber && e.footX !== undefined && !sameColumn && groundY - feet > STEP_UP) {
    e.position.x = e.footX;
    e.position.z = e.footZ;
    // And it STOPS: a refused mover kept walking into the wall every tick, and a wanderer kept its heading until
    // its timer ran out. isMoving and moveTimer round-trip to the worker, which re-rolls a wander at once (R6.3).
    e.isMoving = false;
    e.moveTimer = 0;
    return true;
  }
  e.position.y = groundY + 0.5;
  e.footX = e.position.x;
  e.footZ = e.position.z;
  return false;
}
