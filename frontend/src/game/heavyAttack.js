// heavyAttack.js — HOLD TO CHARGE a heavy melee swing (spec docs/superpowers/specs/2026-09-23-crafty-heavy-melee-design.md).
//
// EXTERNAL-BASELINE-R2's #1 gap: three genre leaders shipped a held/charged heavy attack beside the light one this year,
// and Crafty's melee was one instant cone check. The tap stays EXACTLY today's light swing, fired on press — a light
// attack that waited for the release would feel late on every click. KEEPING the button held past HEAVY_HOLD_MS begins
// a charge; releasing once it has run HEAVY_CHARGE_MS throws the heavy (Components.jsx triggerMeleeAttack({heavy})).
//
// Module state, read transiently (Game-Loop Isolation): the controller presses/releases/cancels it from input events,
// the walk and the FPV hand read it per frame. Times are the REAL clock (performance.now): the player's hold is real
// time, and a hitstop must not stretch a charge.

/** Held past a tap before the charge begins, ms — a deliberate hold, not a slow click. */
export const HEAVY_HOLD_MS = 280;
/** The charge, ms: the heavy is ready HEAVY_HOLD_MS + HEAVY_CHARGE_MS after the press. */
export const HEAVY_CHARGE_MS = 420;
/** The heavy's damage, x the light swing's. */
export const HEAVY_MULT = 2;
/** How long a heavy staggers a (non-boss) mob, world ms — the perfect dodge's stagger, so the riposte follows. */
export const HEAVY_STAGGER_MS = 800;
/** The heavy's shove, x the light swing's knockback. */
export const HEAVY_SHOVE_MULT = 2.5;
/** Walk speed while charging — the commitment. */
export const HEAVY_WALK_MULT = 0.55;

let pressedAt = 0; // 0 = nothing held

/** The melee button went down. A second press while held (T key-repeat) is ignored — it must not restart the charge. */
export function pressHeavy(now) {
  if (pressedAt === 0) pressedAt = now || 1;
}

/** The charge so far, in [0, 1]: 0 until HEAVY_HOLD_MS, 1 once ready. */
export function heavyChargeLevel(now) {
  if (pressedAt === 0) return 0;
  const t = now - pressedAt - HEAVY_HOLD_MS;
  return t <= 0 ? 0 : Math.min(1, t / HEAVY_CHARGE_MS);
}

/** Is a heavy ready to throw? */
export function isHeavyReady(now) {
  return pressedAt !== 0 && now - pressedAt >= HEAVY_HOLD_MS + HEAVY_CHARGE_MS;
}

/** The button came up: true when the charge was ready — throw the heavy. Always ends the hold. */
export function releaseHeavy(now) {
  const ready = isHeavyReady(now);
  pressedAt = 0;
  return ready;
}

/** A dodge, death or lost input drops the charge; the release then throws nothing. */
export function cancelHeavy() {
  pressedAt = 0;
}

/** The walk multiplier: HEAVY_WALK_MULT while CHARGING (past the hold threshold), 1 otherwise — never on a tap. */
export function heavyWalkMult(now) {
  return pressedAt !== 0 && now - pressedAt > HEAVY_HOLD_MS ? HEAVY_WALK_MULT : 1;
}
