/**
 * touchHold.js — PURE hold semantics for the touch overlay's press-and-hold controls (Phase 0c, plan
 * docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
 *
 * WHY THIS EXISTS. Two of the game's signature verbs need a HELD input, and touch could only pulse. The Wildheart
 * roar charges for ANTICIPATION_SEC (0.45 s) and cancels the frame its intent drops (game/beastTransform.js); the
 * ring pulsed the roar for TAP_HOLD_MS (120 ms) on pointerup, so the transform could never commit on a touch device.
 *
 * WHAT A HOLD IS. The intent goes up on the press and comes down on the release, but never sooner than `minMs` after
 * the press. A TAP must still present the intent long enough for a once-per-frame state machine to see its rising
 * edge (the reason TAP_HOLD_MS exists), so a tap is exactly the old 120 ms pulse, now starting at the press. A fresh
 * press cancels a clear still pending from the previous tap, or that clear would cut the new hold short. `release` is
 * idempotent because a touch delivers pointerup, lostpointercapture and pointerleave for one lift.
 *
 * A HOLD BELONGS TO ONE FINGER (review F6). It records the pointerId that pressed it: a second finger landing on the
 * same control neither restarts nor takes over the hold, and its lift does not end it. Only the owning finger's
 * release ends it, or `close` (the control went away under the finger), or `drop`. A press with no pointerId (a
 * caller that has none) owns the hold as `undefined`, and only a release with no pointerId ends it.
 *
 * Same purity contract as touchMath.js and aspectWheel.js: no React, no DOM, no Three. The clock and the scheduler are
 * injected so the timing is testable without a browser.
 */
import { TAP_HOLD_MS } from './aspectWheel.js';

/**
 * Which finger owns a held control (review F6): the first pointer to claim it, until that same pointer frees it.
 * @returns {{ claim(id: unknown): boolean, free(id: unknown): boolean, clear(): boolean, isHeld(): boolean }}
 */
export function makePointerClaim() {
  let held = false;
  let owner;
  return {
    /** True when `id` now owns the control; false while another pointer (or this one, again) already does. */
    claim(id) {
      if (held) return false;
      held = true;
      owner = id;
      return true;
    },
    /** True when `id` owned it and has let go; a pointer that does not own it frees nothing. */
    free(id) {
      if (!held || id !== owner) return false;
      held = false;
      owner = undefined;
      return true;
    },
    /** Forget the owner whoever it is (the hold was cancelled). True when something was held. */
    clear() {
      if (!held) return false;
      held = false;
      owner = undefined;
      return true;
    },
    isHeld: () => held,
  };
}

/**
 * @param {{ verb: string, setIntent: (verb: string, on: boolean) => void, now: () => number, minMs?: number,
 *           schedule?: (fn: () => void, ms: number) => unknown, unschedule?: (id: unknown) => void }} opts
 * @returns {{ press(pointerId?: unknown): boolean, release(pointerId?: unknown): boolean, close(): boolean,
 *             drop(): void, isHeld(): boolean }}
 */
export function makeIntentHold({ verb, setIntent, now, minMs = TAP_HOLD_MS, schedule = setTimeout, unschedule = clearTimeout }) {
  const claim = makePointerClaim();
  let pressedAt = 0;
  let pending = null;
  const cancelPending = () => {
    if (pending !== null) {
      unschedule(pending);
      pending = null;
    }
  };
  // Ends the hold, honouring the minimum pulse.
  const end = () => {
    const wait = Math.max(0, pressedAt + minMs - now());
    if (wait === 0) {
      setIntent(verb, false);
    } else {
      pending = schedule(() => {
        pending = null;
        setIntent(verb, false);
      }, wait);
    }
    return true;
  };
  return {
    /** Raises the intent. Returns false, changing nothing, while a finger already holds it. */
    press(pointerId) {
      if (!claim.claim(pointerId)) return false;
      cancelPending();
      pressedAt = now();
      setIntent(verb, true);
      return true;
    },
    /** The finger `pointerId` lifted. Ends the hold only if that finger owns it. Returns whether a hold was ended. */
    release(pointerId) {
      return claim.free(pointerId) ? end() : false;
    },
    /** The control went away under whichever finger holds it: ends the hold as a lift would. */
    close() {
      return claim.clear() ? end() : false;
    },
    /** Clears at once (input went dead, a panel opened, or the control unmounted). Silent when nothing is held or pending. */
    drop() {
      const wasHeld = claim.clear();
      if (!wasHeld && pending === null) return;
      cancelPending();
      setIntent(verb, false);
    },
    isHeld: () => claim.isHeld(),
  };
}

/**
 * How far a charge has run, for a radial fill: null when there is nothing to draw (no start, or a degenerate
 * duration that would divide by zero), else the elapsed share clamped to [0, 1].
 */
export function chargeFraction(startedAt, now, durationMs) {
  if (startedAt === null || startedAt === undefined || !(durationMs > 0)) return null;
  const f = (now - startedAt) / durationMs;
  if (!Number.isFinite(f)) return null;
  return Math.min(1, Math.max(0, f));
}

/**
 * A charge ring's sweep in WHOLE degrees [0, 360], or -1 when there is nothing to draw (null, undefined, NaN).
 *
 * A NUMBER, deliberately (review F5). This runs inside TouchControlsSurface's rAF tick for two rings every frame, and it
 * used to return a fresh style object holding a fresh template string, which the painter then keyed with a third
 * string: three allocations per ring per frame, for a value that changes at most once per degree. A number compares
 * without allocating, and the string it stands for is looked up in CHARGE_SWEEPS, built once.
 */
export function chargeRingDeg(frac) {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return -1;
  return Math.round(Math.min(1, Math.max(0, frac)) * 360);
}

/** Every sweep a charge ring can show, indexed by chargeRingDeg: built once at load, so the tick writes a shared
 *  string and never builds one. The ring SHAPE (a mask) is static and lives on the element. */
export const CHARGE_SWEEPS = Object.freeze(Array.from({ length: 361 },
  (_, deg) => `conic-gradient(from 0deg, rgb(var(--ui-accent, 201 168 106)) ${deg}deg, transparent ${deg}deg)`));
