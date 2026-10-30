// impulseLog.js — DEV only: every impulse handed to the player's applyImpulse (Components.jsx), for an e2e that must
// see a shove the moment it is given. The player is a kinematic body and the shove decays into refs every frame, so a
// velocity read afterwards depends on frame timing; a log of the calls does not. Capped, so a long session cannot grow it.
const MAX_LOGGED = 64;
const log = [];

/** Record one impulse ({ x, y, z }). */
export function logImpulse(i) {
  if (log.length < MAX_LOGGED) log.push({ x: i.x, y: i.y, z: i.z });
}

/** The impulses logged since the last clear. */
export function readImpulses() {
  return log.map((i) => ({ ...i }));
}

/** Forget them. */
export function clearImpulses() {
  log.length = 0;
}
