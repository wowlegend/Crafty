/**
 * debrisPark.js — retiring a dead block-particle body.
 *
 * WHAT IT USED TO DO. `api.at(i).setTranslation(hidePosition, true)` — teleport to y=-1000 and WAKE IT,
 * leaving the velocity untouched. So every dead debris chunk kept free-falling forever, accumulating
 * speed, and could never reach the sleep threshold. Rapier steps an awake body every tick whether or not
 * anything can see it, so the cost of one mining session persisted for the rest of the run.
 *
 * ORDER MATTERS, which is why this is a function rather than three lines at the call site: waking the
 * body to move it and THEN zeroing would leave it awake until the sleep threshold elapsed all over again.
 * Velocities first, with wakeUp=false throughout, then an explicit sleep.
 */

/** Shared zero vector. Frozen so a physics binding cannot write through it into every later park. */
export const REST = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * @param {{setLinvel:Function,setAngvel:Function,setTranslation:Function,sleep?:Function}} body
 * @param {{x:number,y:number,z:number}} hidePosition
 */
export function parkDeadDebris(body, hidePosition) {
  if (!body) return false;
  body.setLinvel(REST, false);
  body.setAngvel(REST, false);
  body.setTranslation(hidePosition, false);
  body.sleep?.();
  return true;
}
