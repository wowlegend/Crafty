// inputLive.js — the one answer to "may the player's input act on the world right now".
//
// The input gate (input/inputState.js `active`) says whether the game has the input: the pointer lock on desktop, play
// on touch. It does not say what is on the screen, and an opener need not drop it: a chest opened from the world on touch
// has no lock to lose, and VICTORY goes up as a store write under a held lock. Read alone, the gate leaves the world
// running and the verbs live behind such a surface. So the answer is derived from what is up, whatever put it there:
// the world clock's pause (game/worldClock.js), the verb seams (performVerb, the primary press, the express keys, the
// panel and spell keys, the wheel, the touch router, the Player loop) and the relock (input/pointerLock.js) all read it.
//
// Pure: no store, no React. Callers pass the store's state and getInput().active.
import { coveringSurfaceUp } from '../ui/panelState.js';

/** Any surface that takes the player's input: a covering surface (ui/panelState.js), or the death screen. */
export function blockingSurfaceUp(s) {
  return !!s && (s.isAlive === false || coveringSurfaceUp(s));
}

/**
 * May input act on the world: the game has the input, the player is alive, and no surface is up. Not gameStarted:
 * in play `active` is raised only by a granted lock or the touch entry, both of which mark the game started, and the
 * e2e suite's forcePlay raises it without starting the game (tests/e2e/_boot.js).
 * @param {object} s the store's state
 * @param {boolean} active getInput().active
 */
export function isInputLive(s, active) {
  return !!active && !blockingSurfaceUp(s);
}
