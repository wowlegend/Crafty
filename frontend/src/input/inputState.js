/**
 * inputState.js — single source-of-truth for player INPUT INTENTS.
 *
 * CONTRACT (the abstraction boundary for S2-A combat + a future touch layer):
 *
 *   READ  — call `getInput()` TRANSIENTLY inside the game loop (R3F `useFrame`).
 *           It returns the SAME object reference every call (alloc-free, no
 *           per-frame garbage). NEVER mirror these intents into React state or a
 *           reactive zustand subscription — that would couple the high-frequency
 *           imperative loop to declarative re-renders (Game-Loop Isolation, see
 *           CLAUDE.md). The loop reads the live object directly.
 *
 *   WRITE — the INPUT SOURCE writes intents via `setIntent(key, val)`. Today that
 *           is the keyboard + mouse listeners (Components.jsx, wired in Task 2);
 *           later a virtual-joystick / touch layer writes the SAME intents — the
 *           consumers downstream are source-agnostic.
 *
 *   ACTIVE — `setActive(v)` gates whether input is "live". This replaces the
 *           scattered `document.pointerLockElement` checks: the input writer sets
 *           `active` from pointer-lock (KB+mouse) now, and a touch layer sets it
 *           from its own focus model later. Consumers read `getInput().active`.
 *
 * PURE JS by design: no React / R3F / Three imports, so the module is node-testable.
 */

/**
 * The canonical set of intent keys. The keyboard/mouse listeners and any future
 * touch layer write ONLY these; `setIntent` rejects anything else (typo guard).
 *
 * Producer status today: `moveF/B/L/R`, `jump`, `dodge` are written per-frame and read by
 * the player-controller loop. `attack`/`cast` fire IMPERATIVELY (the listeners call the
 * melee/spell triggers directly, gated on `active`), so they are RESERVED here for a future
 * unified consumer + the touch layer. `interact` is a RESERVED forward-placeholder for the
 * upcoming interact verb (no producer/consumer yet — kept so the touch layer has the key).
 * @type {readonly string[]}
 */
export const INTENT_KEYS = ['moveF', 'moveB', 'moveL', 'moveR', 'jump', 'dodge', 'attack', 'cast', 'interact'];

/**
 * Module singleton — the one live intent object. Built from INTENT_KEYS (all
 * false) plus the `active` gate. Returned by-reference from getInput().
 */
const _state = { active: false };
for (const k of INTENT_KEYS) _state[k] = false;

/**
 * Transient read of the live intent object. Returns the SAME reference every
 * call — safe to call once per frame in useFrame with zero allocation.
 * @returns {typeof _state}
 */
export function getInput() {
  return _state;
}

/**
 * Set a single intent. Throws on an unknown key to catch typos at the call site.
 * @param {string} key  one of INTENT_KEYS
 * @param {*} val        coerced to boolean
 */
export function setIntent(key, val) {
  if (!INTENT_KEYS.includes(key)) throw new Error('unknown intent: ' + key);
  _state[key] = !!val;
}

/**
 * Set the `active` gate (replaces scattered document.pointerLockElement checks).
 * @param {*} v  coerced to boolean
 */
export function setActive(v) {
  _state.active = !!v;
}

/**
 * Restore defaults: all intents false, inactive. Mutates the same singleton
 * (does NOT replace the reference, so existing getInput() holders stay valid).
 */
export function resetInput() {
  for (const k of INTENT_KEYS) _state[k] = false;
  _state.active = false;
}
