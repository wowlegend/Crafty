// mobSteering.js — pure reference for the mob AI's height-aware A* STEER GOAL cell (the Step-3 path target
// in workers/ai.worker.js). The worker is a CLASSIC Worker (can't import), so it inline-mirrors this; the
// archer-kite-steer gate pins the two in sync.
//
// The bug this exists to prevent (holistic review, ai.worker.js:302): Step-3 resolved the A* goal from the
// PLAYER position unconditionally, silently overriding the tactical target the archer branch had just set.
// A retreating skeleton (target set AWAY from the player to kite) was re-steered straight back INTO melee,
// so archers never actually kited. The goal cell MUST be resolved from the TACTICAL (targetX,targetZ) the
// mob decided — which equals the player for chasers, but points away for a retreating archer.

/**
 * Resolve the local 9x9 A* goal cell for a mob steering toward its TACTICAL world target.
 * The grid is centered on the mob: cell (4,4) is the mob; cells are clamped to [0,8].
 * @param {number} targetX tactical target world X (NOT necessarily the player)
 * @param {number} targetZ tactical target world Z
 * @param {number} mobX mob world X
 * @param {number} mobZ mob world Z
 * @returns {{gx:number, gz:number}} clamped local grid goal cell
 */
export function steerGoalCell(targetX, targetZ, mobX, mobZ) {
  const startXGrid = Math.round(mobX) - 4;
  const startZGrid = Math.round(mobZ) - 4;
  const gx = Math.max(0, Math.min(8, Math.round(targetX - startXGrid)));
  const gz = Math.max(0, Math.min(8, Math.round(targetZ - startZGrid)));
  return { gx, gz };
}
