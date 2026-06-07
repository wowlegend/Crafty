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
 * `roar` (S2-B1-M3) is a REAL consumed intent: the keyboard listener writes it (KeyR) and the
 * beast-transform state machine reads `getInput().roar` transiently inside the player loop —
 * a deeper abstraction than the reserved attack/cast (which fire imperatively), and touch-ready.
 * @type {readonly string[]}
 */
export const INTENT_KEYS = ['moveF', 'moveB', 'moveL', 'moveR', 'jump', 'dodge', 'attack', 'cast', 'interact', 'roar'];

/**
 * Module singleton — the one live intent object. Built from INTENT_KEYS (all
 * false) plus the `active` gate. Returned by-reference from getInput().
 */
const _state = { active: false };
for (const k of INTENT_KEYS) _state[k] = false;

/**
 * Subscribers for `active`-gate changes. `active` is transition-state (changes
 * only on a rare pointer-lock enter/exit gesture, NOT per-frame), so a reactive
 * subscription on it is SAFE under Game-Loop Isolation — the per-frame moveF/B/L/R
 * intents stay transient getInput() reads and are NEVER subscribed. This bridge
 * lets React project `active` via useSyncExternalStore (see useActiveInput.js).
 * @type {Set<() => void>}
 */
const _subs = new Set();

/** Notify all `active` subscribers. */
function _notifyActive() {
  for (const cb of _subs) cb();
}

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
 * ONLY notifies subscribers when the value actually CHANGES — the changed-check
 * prevents redundant React renders on optimistic-then-authoritative same-value
 * writes (e.g. an optimistic setActive(true) followed by the authoritative
 * pointerlockchange setActive(true)).
 * @param {*} v  coerced to boolean
 */
export function setActive(v) {
  const next = !!v;
  if (_state.active === next) return;
  _state.active = next;
  _notifyActive();
}

/**
 * Subscribe to `active`-gate changes. Returns an unsubscribe fn.
 * @param {() => void} cb  invoked (no args) whenever `active` changes.
 * @returns {() => void}   unsubscribe
 */
export function subscribeActive(cb) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

/**
 * Current `active` value. Primitive bool - stable for useSyncExternalStore's
 * Object.is snapshot equality check (no per-call alloc).
 * @returns {boolean}
 */
export function getActiveSnapshot() {
  return _state.active;
}

/**
 * Restore defaults: all intents false, inactive. Mutates the same singleton
 * (does NOT replace the reference, so existing getInput() holders stay valid).
 * Routes the active reset through setActive so subscribers are notified on a
 * true-to-false transition (test/teardown consumers stay consistent).
 */
export function resetInput() {
  for (const k of INTENT_KEYS) _state[k] = false;
  setActive(false);
}
