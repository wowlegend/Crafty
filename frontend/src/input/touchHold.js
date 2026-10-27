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
 * Same purity contract as touchMath.js and aspectWheel.js: no React, no DOM, no Three. The clock and the scheduler are
 * injected so the timing is testable without a browser.
 */
import { TAP_HOLD_MS } from './aspectWheel.js';

/**
 * @param {{ verb: string, setIntent: (verb: string, on: boolean) => void, now: () => number, minMs?: number,
 *           schedule?: (fn: () => void, ms: number) => unknown, unschedule?: (id: unknown) => void }} opts
 * @returns {{ press(): void, release(): boolean, drop(): void, isHeld(): boolean }}
 */
export function makeIntentHold({ verb, setIntent, now, minMs = TAP_HOLD_MS, schedule = setTimeout, unschedule = clearTimeout }) {
  let down = false;
  let pressedAt = 0;
  let pending = null;
  const cancelPending = () => {
    if (pending !== null) {
      unschedule(pending);
      pending = null;
    }
  };
  return {
    press() {
      cancelPending();
      down = true;
      pressedAt = now();
      setIntent(verb, true);
    },
    /** Ends the hold, honouring the minimum pulse. Returns whether a hold was actually ended. */
    release() {
      if (!down) return false;
      down = false;
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
    },
    /** Clears at once (input went dead, or the control unmounted). Silent when nothing is held or pending. */
    drop() {
      if (!down && pending === null) return;
      cancelPending();
      down = false;
      setIntent(verb, false);
    },
    isHeld: () => down,
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
 * The inline style a charge ring takes: hidden for null, else a gold conic sweep of `frac` x 360 degrees (whole
 * degrees, so a rAF writes a new value at most once per degree). The ring SHAPE (a mask) is static and lives on the
 * element; this is only what changes per frame.
 */
export function chargeRingStyle(frac) {
  if (frac === null || frac === undefined) return { opacity: '0' };
  const deg = Math.round(frac * 360);
  return {
    opacity: '1',
    background: `conic-gradient(from 0deg, rgb(var(--ui-accent, 201 168 106)) ${deg}deg, transparent ${deg}deg)`,
  };
}
