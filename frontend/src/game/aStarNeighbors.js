/**
 * aStarNeighbors.js — the 8-way traversal offsets, hoisted out of the A* expansion loop.
 *
 * They were built INSIDE that loop as a fresh array of eight fresh pairs: nine allocations per expanded
 * node, per aggro mob, at 15 Hz, to hold eight constants. Its home is ai.worker.js, which assigns
 * `self.onmessage` at module scope and therefore cannot be imported under vitest -- so the constant
 * lived somewhere no test could reach, which is the same reason the mesher and the wander re-roll were
 * pulled out. A module makes it both shared and assertable.
 */

/** Frozen so a consumer cannot write through it into every later expansion. */
export const NEIGHBOR_OFFSETS = Object.freeze([
  Object.freeze([0, 1]), Object.freeze([0, -1]), Object.freeze([1, 0]), Object.freeze([-1, 0]),
  Object.freeze([1, 1]), Object.freeze([1, -1]), Object.freeze([-1, 1]), Object.freeze([-1, -1]),
]);

/**
 * OCTILE distance — the admissible heuristic for the 8-way grid these offsets describe.
 *
 * The worker searched with MANHATTAN (`|dx| + |dz|`) while moving diagonally at a cost of 1.414. A
 * diagonal step therefore costs 1.414 and Manhattan charges the heuristic 2 for it, so h could EXCEED
 * the true remaining cost — which is exactly the definition of an inadmissible heuristic, and with one
 * A* stops guaranteeing an optimal path. The visible symptom is a mob taking a longer route than the one
 * a player can see, or expanding the wrong frontier and giving up early on a reachable target.
 *
 * Octile is the standard admissible form for this movement model: travel `min(dx, dz)` steps diagonally
 * and the remainder straight.
 *
 *   h = (dx + dz) + (DIAG - 2) * min(dx, dz)
 *
 * With DIAG = 1.414 that is (dx + dz) - 0.586 * min(dx, dz), which equals the true cost on any obstacle
 * free grid and is never above it — the two properties admissibility needs.
 */
export const DIAG_COST = 1.414;

export function octileHeuristic(ax, az, bx, bz) {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return (dx + dz) + (DIAG_COST - 2) * Math.min(dx, dz);
}
