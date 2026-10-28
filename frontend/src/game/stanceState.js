// stanceState.js — the live combat stance and its stall clocks, without the caps (game/combatStance.js).
//
// The store teleports the body on a save load and must leave the fight behind with it, but it must not load
// combatStance.js: that module imports worldClock.js, which imports the store, so the two would form an import cycle,
// in which a top-level read of the other's exports meets a binding not yet initialised. So the state and the two calls
// the store needs live here, with no roster or store import, and combatStance.js steps the same objects.

/** The live stance (combatStance.js stanceStep documents each field). Never subscribed: read transiently. */
export const stance = {
  w: 0, engaged: false, threatId: null, awayX: 0, awayZ: 0, gap: 0, lastEngagedAt: -Infinity,
  threatX: 0, threatZ: 0, playerX: 0, playerY: 0, playerZ: 0, frame: 0, atS: 0, stepS: 0,
  // where stanceFrame last saw the body, and the real seconds of that frame's step: a body further from it than any
  // mover covers in that step was teleported (combatStance.js stanceFrame)
  bodyX: 0, bodyY: 0, bodyZ: 0, bodyStepS: 0, bodySeen: false,
};

/** The stall clocks: mob id -> { ax, az, at, seen } (combatStance.js stanceStep). */
export const stallAnchors = new Map();

/** No weight, no engagement, no threat, no calm carried over, and every stall clock dropped. */
export function resetStance() {
  stance.w = 0; stance.engaged = false; stance.threatId = null; stance.awayX = 0; stance.awayZ = 0; stance.gap = 0;
  stance.lastEngagedAt = -Infinity;
  stallAnchors.clear();
}

/**
 * A NON-DEATH TELEPORT: the void-fall guard (Components.jsx) and a save load (useGameStore loadWorldData). The body is
 * moved, stopped when `stop` (the void guard's falling body; a load's kinematic body carries none), and the stance is
 * reset: the fight it was in is somewhere else now.
 */
export function teleportPlayer(rb, pos, stop = false) {
  rb.setTranslation(pos, true);
  if (stop) rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  resetStance();
}
