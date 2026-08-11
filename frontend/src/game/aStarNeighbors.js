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
