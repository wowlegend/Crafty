/**
 * mobSenses.js — how far away a mob thinks you are, and whether it can actually reach you (A-bis B4).
 *
 * THE BUG. `workers/ai.worker.js` computed one number, `distToPlayer2D = sqrt(dx*dx + dz*dz)`, and used it
 * for aggro, de-aggro, archery, the leap and the melee strike. Line 119 destructured the player position as
 * `const [playerX, , playerZ] = playerPos` — the Y was being sent from the main thread and thrown away, with
 * a comment explaining that "the mob brain reasons on the XZ plane only".
 *
 * The consequence is not a rounding error. **Pillaring up, walling in, or going underground gave ZERO
 * protection**: a mob 200 blocks below you, three blocks away horizontally, was inside MELEE_RANGE and hit
 * you. In a voxel game whose core loop is "build by day, survive the night", building was strategically
 * pointless — which the 18-domain review called the single finding that most damages the core fantasy.
 *
 * WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT.
 *   - SENSING (aggro / de-aggro / archery) becomes 3D. A mob thirty blocks below should not notice you.
 *   - REACHING (melee, leap) additionally requires VERTICAL proximity. 3D distance alone is not enough: a
 *     mob directly below you at dy=2.4 is within 2.5 of you in every axis, and should still be able to
 *     swing; one at dy=6 should not, even though it could if it were standing on your level.
 *   - MOVEMENT stays 2D. Mobs walk the ground toward your XZ and the A* height-grid steering already
 *     handles terrain. Making pathing 3D is a different, much larger change and is NOT attempted here.
 *
 * VERTICAL_REACH = 2.5 is a TASTE CALL, noted veto-ably. It means a player standing on a 2-block ledge can
 * still be hit, and a 3-block wall keeps melee out. That is the number that makes the simplest defensive
 * structure a voxel player actually builds — a wall taller than they are — do something, without making a
 * single step onto a rock into invulnerability. Kevin may want it tighter or looser once the siege is felt.
 *
 * Pure: no worker globals, no store, no Three. Every function takes deltas and returns a number or a bool.
 */

/** How far above or below itself a mob can land a melee blow or a leap, in blocks. Taste call — see above. */
export const VERTICAL_REACH = 2.5;

/** Straight-line distance, all three axes. The honest "how far away is the player" number. */
export function dist3D(dx, dy, dz) {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Ground-plane distance. Still what movement and steering want. */
export function dist2D(dx, dz) {
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Can this mob SEE you from here? 3D, so height is real cover. Used for aggro, the de-aggro leash and
 * archery range.
 */
export function withinSense(dx, dy, dz, range) {
  return dist3D(dx, dy, dz) <= range;
}

/**
 * Can this mob actually TOUCH you? Ground-plane distance within `range` AND within arm's reach vertically.
 *
 * Both conditions are required, and each catches a case the other misses: 2D-only is the original bug (hit
 * through 200 blocks of rock); 3D-only would let a mob standing directly beneath a 2-block overhang be
 * counted as adjacent when it has no way to swing upward that far.
 */
export function canReach(dx, dy, dz, range, verticalReach = VERTICAL_REACH) {
  return dist2D(dx, dz) <= range && Math.abs(dy) <= verticalReach;
}
