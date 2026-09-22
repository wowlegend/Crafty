// mobStateSync.js — the ONE definition of what crosses the main-thread <-> AI-worker boundary per mob.
//
// WHY THIS EXISTS. The worker is stateless between ticks: every tick, AIWorkerSystem sends each mob's state,
// the worker returns an update, and AIWorkerSystem stores it on the entity to send next tick. Any field the
// worker RETURNS but the main thread does not SEND BACK dies between ticks, silently.
//
// That had already happened before this file: `wanderRoll` was returned by the worker and stored on the
// entity, but the payload builder never sent it, so under a capture seed every re-roll was roll #1 — one
// heading forever, the very defect mobWander.js was written to remove. And the shoulder charge (QUEUE
// R1.2) needs four fields of state held across ticks, which would have died the same way. The payload
// and the merge were two hand-typed lists in AIWorkerSystem.jsx; now they read one.
//
// Gated by tests/gates/mob-charge-loop-gates.test.js, which drives the REAL worker across ticks through
// these two functions and asserts every field in MOB_STATE_FIELDS is both sent and returned.

/** Worker-owned per-mob state: returned by every tick, stored on the entity, and sent back next tick. */
export const MOB_STATE_FIELDS = Object.freeze([
  'targetX', 'targetZ', 'isMoving', 'lastAttackTime', 'windupUntil', 'moveTimer', 'wanderRoll',
  'isCoverSeeking', // output only (the worker recomputes it); sent anyway, harmlessly, to keep ONE list
  'chargeX', 'chargeZ', 'chargeAt', 'chargeReadyAt', // the latched shoulder charge (game/mobMovement.js)
]);

/**
 * What AIWorkerSystem sends the worker for one mob. `speed` and `heightGrid` are computed by the caller
 * (zone and spell slows; the terrain sample) because they depend on main-thread state this module must not
 * import.
 */
export function buildMobPayload(e, { speed, heightGrid }) {
  return {
    id: e.id,
    passive: e.passive,
    x: e.position.x,
    y: e.position.y,
    z: e.position.z,
    targetX: e.targetX,
    targetZ: e.targetZ,
    isMoving: e.isMoving,
    isAggro: e.isAggro,
    lastAttackTime: e.lastAttackTime,
    windupUntil: e.windupUntil || 0,
    moveTimer: e.moveTimer,
    wanderRoll: e.wanderRoll || 0,
    isCoverSeeking: !!e.isCoverSeeking,
    chargeX: e.chargeX || 0,
    chargeZ: e.chargeZ || 0,
    chargeAt: e.chargeAt || 0,
    chargeReadyAt: e.chargeReadyAt || 0,
    damage: e.damage,
    type: e.type,
    speed,
    rotation: e.rotation,
    health: e.health,
    maxHealth: e.maxHealth,
    heightGrid,
  };
}

/**
 * Store one worker update on its entity: the moved position and heading, the aggro flag, and every
 * worker-owned state field. Side effects that depend on the OLD value (the aggro growl edge) and on
 * main-thread services (ground snapping) stay with the caller, which runs them around this.
 */
export function applyMobUpdate(entity, u) {
  entity.position.x = u.x;
  entity.position.z = u.z;
  entity.rotation = u.rotation;
  entity.isAggro = u.isAggro;
  for (const f of MOB_STATE_FIELDS) entity[f] = u[f];
}
