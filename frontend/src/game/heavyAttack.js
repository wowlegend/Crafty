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
let pressedBy = null; // WHICH input holds the charge: 'mouse', 'key' or 'touch' (R9.3; 'touch' since Phase 0c)

/**
 * WHEN THE INPUT HAPPENED, not when its handler ran. A handler runs when the main thread is free, so a lift that came
 * 40 ms after its press but waited behind a stall read as a charged hold and threw a heavy nobody held for
 * (tests/e2e/touch-hold.spec.js, the late lift, with the stamp ignored: input 40 ms apart, handled 1787-2300 ms apart,
 * release 40 = the heavy — measured 2026-10-27 as that spec's mutants E14 / E15 / E17). Found
 * from touch-hold CI run 40517958583, whose warm-up touch was handled 1029-7269 ms apart and threw a heavy; that run did
 * not record its input times, so whether ITS heavy was this or a genuinely long press is unknown. An event's `timeStamp` is the time it
 * happened, on performance.now()'s clock (measured 2026-10-27, a 40 ms press behind a 1.5 s stall: Chromium, a CDP
 * touch, 1506 ms on the handler clock and 71 ms on timeStamp; Playwright's macOS WebKit, a mouse click — it has no held
 * touch — 1512 and 46 ms. iOS Safari is NOT measured: Kevin's device). `stamp` is used only when it is a reading on THIS
 * clock — positive and not after `now`; anything else (no event, 0, an epoch-ms stamp from an engine on another clock)
 * keeps the handler's `now`, which is the behaviour every caller had before. (undefined and NaN fail both comparisons.)
 */
function inputTime(stamp, now) {
  return stamp > 0 && stamp <= now ? stamp : now;
}

/**
 * The melee input `source` ('mouse', 'key', or 'touch' — the overlay's held action button) went down. A second press while ANY charge is held (T key-repeat, or T
 * tapped during a mouse hold) is ignored — it must not restart the charge or take it over. `at`, when the caller has the
 * press event, is its own time (see inputTime): the charge counts from the finger, not from the handler.
 */
export function pressHeavy(now, source = 'mouse', at) {
  if (pressedAt === 0) {
    pressedAt = inputTime(at, now) || 1;
    pressedBy = source;
  }
}

/** Is a charge held (by either input)? While it is, the arm is drawn back: no light swing fires (Components). */
export function isHeavyHeld() {
  return pressedAt !== 0;
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

/**
 * The input `source` came up: true when the charge was ready — throw the heavy. Ends the hold only when `source` is
 * the input that holds it (R9.3): a T tapped during a mouse hold released the MOUSE's charge on its keyup. `at`, when
 * the caller has the lift event, is its own time: a tap whose lift is handled late is still a tap.
 */
export function releaseHeavy(now, source = 'mouse', at) {
  if (pressedAt === 0 || source !== pressedBy) return false;
  const ready = isHeavyReady(inputTime(at, now));
  pressedAt = 0;
  pressedBy = null;
  return ready;
}

/** A dodge, death or lost input drops the charge; the release then throws nothing. */
export function cancelHeavy() {
  pressedAt = 0;
  pressedBy = null;
}

/** The walk multiplier: HEAVY_WALK_MULT while CHARGING (past the hold threshold), 1 otherwise — never on a tap. */
export function heavyWalkMult(now) {
  return pressedAt !== 0 && now - pressedAt > HEAVY_HOLD_MS ? HEAVY_WALK_MULT : 1;
}
