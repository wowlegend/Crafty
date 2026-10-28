// meleeString.js — the light attack becomes a three-step string that ends in a finisher (masterpiece Phase 1,
// close-quarters combat). Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 8.
//
// PURE and module-level, the heavyAttack.js pattern: the controller (src/Components.jsx) presses, takes, cancels and
// ends it from input events and the frame, and the FPV hand reads it transiently. Times are the REAL clock
// (performance.now), so a hitstop does not stretch a string.
//
// THE RULES. A swing fired within STRING_WINDOW_MS of the previous one continues the string (1, 2, 3); the third is
// the FINISHER (a wider arc, 1.5x, a harder shove), after which the string starts again at 1 and the next swing waits
// FINISHER_RECOVERY_MS. A press with at most BUFFER_MS of cooldown left is BUFFERED and fires the moment the cooldown
// ends, so a player who clicks a hair early is not punished; earlier presses drop. A dodge keeps the string alive
// (it restarts an OPEN window, never a lapsed one); lost input, a form, death or a thrown heavy ends it.

/** The string's length: the third swing is the finisher. */
export const STRING_STEPS = 3;
/** The light swing's cooldown, ms (the controller's MELEE_COOLDOWN before the string). */
export const SWING_COOLDOWN_MS = 300;
/** The next swing must START within this of the previous one, else the string restarts at step 1. */
export const STRING_WINDOW_MS = 650;
/** A press with this much cooldown left, or less, is buffered and fires when the cooldown ends. */
export const BUFFER_MS = 200;
/** After a finisher, the next swing waits this long (the commitment). */
export const FINISHER_RECOVERY_MS = 500;
/** The finisher's damage, x the light swing's. */
export const FINISHER_MULT = 1.5;
/** The finisher's full arc: a mob 60 degrees off the view axis is inside it, and outside the 90 degree light cone. */
export const FINISHER_ARC_RAD = (140 * Math.PI) / 180;
/** The finisher's shove, x the light swing's knockback. */
export const FINISHER_SHOVE_MULT = 2.0;
/** The walk slows while a swing is thrown: 0.6 for 120 ms after a light swing, 0.4 for 220 ms after a finisher. */
export const SWING_WALK_MULT = 0.6;
export const SWING_WALK_MS = 120;
export const FINISHER_WALK_MULT = 0.4;
export const FINISHER_WALK_MS = 220;

// The state. `last` is the step of the string so far (0 = none; it resets to 0 after a finisher), `lastSwingStep` the
// step of the most recent swing fired (3 after a finisher). Read-only to callers (readString returns it).
const S = {
  last: 0,
  readyAt: 0,
  windowEndsAt: 0,
  buffered: false,
  lastSwingAt: 0,
  lastSwingStep: 0,
  cancelAt: 0,
  walkUntil: 0,
  walkMult: 1,
};

const nextStep = (now) => (now <= S.windowEndsAt && S.last < STRING_STEPS ? S.last + 1 : 1);

function fire(now) {
  const step = nextStep(now);
  const finisher = step === STRING_STEPS;
  S.readyAt = now + (finisher ? FINISHER_RECOVERY_MS : SWING_COOLDOWN_MS);
  S.windowEndsAt = now + STRING_WINDOW_MS;
  S.last = finisher ? 0 : step;
  S.lastSwingAt = now;
  S.lastSwingStep = step;
  S.walkUntil = now + (finisher ? FINISHER_WALK_MS : SWING_WALK_MS);
  S.walkMult = finisher ? FINISHER_WALK_MULT : SWING_WALK_MULT;
  return step;
}

// Shared results, so a press allocates nothing.
const result = (action, step) => Object.freeze({ action, step });
const FIRE = [null, result('fire', 1), result('fire', 2), result('fire', 3)];
const BUFFER = [null, result('buffer', 1), result('buffer', 2), result('buffer', 3)];
const DROP = result('drop', 0);

/** What a press at `now` does (no side effect): 'fire' now, 'buffer' until readyAt, or 'drop'. */
function classify(now) {
  if (now >= S.readyAt) return 'fire';
  const left = S.readyAt - now;
  if (left > 0 && left <= BUFFER_MS && !S.buffered) return 'buffer';
  return 'drop';
}

/**
 * The player pressed the light attack at `now`.
 * @returns {{action:'fire'|'buffer'|'drop', step:0|1|2|3}} a shared, frozen-shape result; do not mutate it
 */
export function pressSwing(now) {
  const kind = classify(now);
  if (kind === 'fire') return FIRE[fire(now)];
  if (kind === 'buffer') {
    S.buffered = true;
    return BUFFER[nextStep(S.readyAt)];
  }
  return DROP;
}

/** Called every frame: a buffered press fires once its cooldown has run. @returns the step it fired as, or 0 */
export function takeBufferedSwing(now) {
  if (!S.buffered || now < S.readyAt) return 0;
  S.buffered = false;
  return fire(now);
}

/** The step a press at `now` WOULD fire or buffer as, with no side effect; 0 for a press that would drop. */
export function peekStep(now) {
  const kind = classify(now);
  if (kind === 'fire') return nextStep(now);
  if (kind === 'buffer') return nextStep(S.readyAt);
  return 0;
}

/**
 * A dodge started at `now`: the buffer and the walk slow are dropped, and an OPEN window restarts (the step is kept),
 * so a dodge mid-string keeps it alive. A lapsed window is not revived: a dodge seconds after step 2 must not make the
 * next click a finisher.
 */
export function cancelIntoDodge(now) {
  S.buffered = false;
  S.walkUntil = 0;
  S.walkMult = 1;
  S.cancelAt = now;
  if (now <= S.windowEndsAt) S.windowEndsAt = now + STRING_WINDOW_MS;
}

/**
 * The string ends: the next swing is step 1 and any buffered press is dropped (lost input, a beast form, death). With
 * `now`, a heavy was thrown at `now`, so no light swing lands within SWING_COOLDOWN_MS of it.
 */
export function endString(now = 0) {
  S.last = 0;
  S.buffered = false;
  if (now > 0) S.readyAt = Math.max(S.readyAt, now + SWING_COOLDOWN_MS);
}

/**
 * triggerMeleeAttack's gate (Components.jsx): does a press swing now, and as which string step?
 *   heavy        a charged release (the human sword's only)
 *   form         a beast form is active
 *   bufferedStep a press the string buffered earlier: it has been through the string already, so it skips the rest
 *   heavyHeld    a heavy is charging (heavyAttack.isHeavyHeld): the arm is drawn back, no light swing
 *   refused      heavyAttack.meleeRefusal's verdict for a heavy or a form's swing, which keep their own cooldown
 * A heavy or a form's swing ENDS THE STRING AT `now`, holding the next light swing SWING_COOLDOWN_MS, because the light
 * path consults only the string's readyAt. Round-1 review g: a form's swing stamped only the controller's
 * lastAttackTime, so the first human light swing after a form ended could land inside the 300 ms cooldown.
 * @returns {number} the string step (1-3) of a light swing, 0 for a heavy or a form's swing, -1 for no swing
 */
export function gateSwing(now, { heavy = false, form = false, bufferedStep = 0, heavyHeld = false, refused = null } = {}) {
  if (!heavy && !form) {
    if (bufferedStep) return bufferedStep;
    if (heavyHeld) return -1;
    const press = pressSwing(now);
    return press.action === 'fire' ? press.step : -1;
  }
  if (refused) return -1;
  endString(now);
  return 0;
}

/** The walk multiplier the string applies at `now` (1 when no swing is being thrown). */
export function stringWalkMult(now) {
  return now < S.walkUntil ? S.walkMult : 1;
}

const LIGHT_SHAPE = Object.freeze({ arcRad: Math.PI / 2, damageMult: 1, shoveMult: 1, finisher: false });
const FINISHER_SHAPE = Object.freeze({ arcRad: FINISHER_ARC_RAD, damageMult: FINISHER_MULT, shoveMult: FINISHER_SHOVE_MULT, finisher: true });
/** The swing's cone and weight for string step `step`. */
export function swingShape(step) {
  return step === STRING_STEPS ? FINISHER_SHAPE : LIGHT_SHAPE;
}

const SWEEPS = [
  Object.freeze({ dir: 1, durationS: 0.2, widthMult: 1 }),   // step 1 (and no string swing): today's sweep
  Object.freeze({ dir: -1, durationS: 0.2, widthMult: 1 }),  // step 2: the arc comes back
  Object.freeze({ dir: 1, durationS: 0.28, widthMult: 1.5 }), // step 3: the finisher sweeps wide
];
/** The FPV hand's sweep for string step `step`: the arc alternates, and the finisher is wider and longer. */
export function slashSweep(step) {
  return step === 2 ? SWEEPS[1] : step === STRING_STEPS ? SWEEPS[2] : SWEEPS[0];
}

/** The live state, for the DEV hook (which copies it) and the hand. Read-only. */
export function readString() {
  return S;
}

export function _resetStringForTest() {
  S.last = 0;
  S.readyAt = 0;
  S.windowEndsAt = 0;
  S.buffered = false;
  S.lastSwingAt = 0;
  S.lastSwingStep = 0;
  S.cancelAt = 0;
  S.walkUntil = 0;
  S.walkMult = 1;
}
