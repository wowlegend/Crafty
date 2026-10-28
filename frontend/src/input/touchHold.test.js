import { describe, it, expect, beforeEach } from 'vitest';
import { makeIntentHold, makePointerClaim, chargeFraction, chargeRingDeg, CHARGE_SWEEPS } from './touchHold.js';
import { TAP_HOLD_MS } from './aspectWheel.js';

// touchHold.js — the PURE hold semantics behind the touch overlay's press-and-hold roar (Phase 0c, plan
// docs/superpowers/plans/2026-10-27-crafty-touch-hold.md). The clock and the scheduler are injected, so every timing
// claim below is exact rather than raced against a real timer.
//
// Mutation-Proof: via scripts/dev/mutate.sh against src/input/touchHold.js (12 tests), each observed RED:
//   T1a the minimum pulse ignored (wait = 0)   T1b plausible-wrong: the pulse timed from the release, not the press
//   T2 a re-press does not cancel the pending clear   T3 chargeFraction unclamped   T4 release not idempotent
//   T5 plausible-wrong: a constant full sweep   T6 drop writes while idle
//   T0 identity (a comment edit) SURVIVED, as it must.
// Review F6 + F5, 2026-10-27, against this file's final form (17 tests), each observed RED:
//   P1 makePointerClaim.claim ignores an existing owner   P2 plausible-wrong: free ignores which pointer owns it
//   R1 chargeRingDeg returns an object again (the per-frame allocation)   R3 plausible-wrong: floored, not rounded
//   R4 the sweep table left mutable   I1 identity (a comment edit in touchHold.js) SURVIVED, as it must.
// (T5's sweep cases now live in the chargeRingDeg block: chargeRingStyle was replaced by it for F5.)
//
// BLIND SPOT: this proves the module. Whether TouchControls binds it to the right pointer events is
// tests/gates/touch-hold-gates.test.jsx; whether a held touch commits the beast form in the running game is
// tests/e2e/touch-hold.spec.js.

/** A fake clock plus a scheduler that runs due callbacks when the clock is advanced. */
function rig() {
  let t = 1000;
  let seq = 0;
  const due = new Map(); // id -> { at, fn }
  const writes = [];
  const hold = makeIntentHold({
    verb: 'roar',
    setIntent: (verb, v) => writes.push([verb, v]),
    now: () => t,
    schedule: (fn, ms) => { seq += 1; due.set(seq, { at: t + ms, fn }); return seq; },
    unschedule: (id) => { due.delete(id); },
  });
  const advance = (ms) => {
    t += ms;
    for (const [id, d] of [...due].sort((a, b) => a[1].at - b[1].at)) {
      if (d.at <= t) { due.delete(id); d.fn(); }
    }
  };
  const last = () => (writes.length ? writes[writes.length - 1][1] : undefined);
  return { hold, advance, writes, last, pending: () => due.size };
}

describe('a press-and-hold intent', () => {
  let r;
  beforeEach(() => { r = rig(); });

  it('the press raises the intent at once, for the verb it was made for', () => {
    r.hold.press();
    expect(r.writes).toEqual([['roar', true]]);
    expect(r.hold.isHeld()).toBe(true);
  });

  it('a HOLD keeps it up for as long as the finger is down — past the old 120 ms pulse', () => {
    r.hold.press();
    r.advance(600); // the roar needs 450 ms; the old pulse dropped it at 120
    expect(r.last(), 'the intent dropped while the finger was still down').toBe(true);
    expect(r.hold.release()).toBe(true);
    expect(r.last(), 'a release after the minimum pulse must clear at once').toBe(false);
    expect(r.pending()).toBe(0);
  });

  it('a TAP is exactly the old pulse: up for TAP_HOLD_MS from the press, then down', () => {
    r.hold.press();
    r.advance(30);
    r.hold.release();
    expect(r.last(), 'a quick tap cleared before a once-per-frame consumer could see it').toBe(true);
    r.advance(TAP_HOLD_MS - 30 - 1);
    expect(r.last(), 'cleared before TAP_HOLD_MS').toBe(true);
    r.advance(1);
    expect(r.last()).toBe(false);
  });

  it('a second press inside the first tap\'s pending clear is NOT cut short by it', () => {
    r.hold.press();
    r.advance(20);
    r.hold.release(); // clear pending at +120
    r.advance(40);
    r.hold.press(); // the finger comes back down at +60
    r.advance(500); // past the first tap's clear time
    expect(r.last(), 'the earlier tap\'s pending clear dropped a live hold').toBe(true);
    expect(r.hold.isHeld()).toBe(true);
  });

  it('release is idempotent: pointerup, lostpointercapture and pointerleave all arrive; one hold ends once', () => {
    r.hold.press();
    r.advance(600);
    expect(r.hold.release()).toBe(true);
    expect(r.hold.release()).toBe(false);
    expect(r.hold.release()).toBe(false);
    expect(r.writes.filter(([, v]) => v === false)).toHaveLength(1);
  });

  it('a release with no press writes nothing (a hover leaving the button is not a release)', () => {
    expect(r.hold.release()).toBe(false);
    expect(r.writes).toEqual([]);
  });

  it('drop clears at once — a held finger, or a tap\'s pending clear — and is silent when idle', () => {
    r.hold.drop();
    expect(r.writes, 'drop wrote while nothing was held').toEqual([]);
    r.hold.press();
    r.hold.drop();
    expect(r.last()).toBe(false);
    expect(r.hold.isHeld()).toBe(false);
    r.hold.press();
    r.advance(10);
    r.hold.release(); // pending
    r.hold.drop();
    expect(r.last()).toBe(false);
    expect(r.pending(), 'drop left the tap\'s clear scheduled').toBe(0);
  });
});

describe('a hold belongs to ONE finger (review F6)', () => {
  let r;
  beforeEach(() => { r = rig(); });

  it('a second finger\'s press neither restarts nor takes over the hold, and its lift does not end it', () => {
    expect(r.hold.press(7)).toBe(true);
    r.advance(300);
    expect(r.hold.press(8), 'a second finger took the hold').toBe(false);
    expect(r.writes, 'the second press wrote — a restart').toEqual([['roar', true]]);
    expect(r.hold.release(8), 'the second finger\'s lift ended the first finger\'s hold').toBe(false);
    r.advance(300);
    expect(r.last(), 'the roar dropped while its own finger was still down').toBe(true);
    expect(r.hold.release(7), 'PRESENCE: the owning finger\'s lift must end it').toBe(true);
    expect(r.last()).toBe(false);
  });

  it('after the owner lifts, the next finger can hold it — ownership is per press, not forever', () => {
    r.hold.press(7);
    r.advance(200);
    r.hold.release(7);
    expect(r.hold.press(8)).toBe(true);
    r.advance(200);
    expect(r.hold.release(7), 'the old owner\'s stray lift ended the new hold').toBe(false);
    expect(r.hold.release(8)).toBe(true);
  });

  it('close ends the hold whichever finger owns it (the control went away under it), honouring the minimum pulse', () => {
    expect(r.hold.close(), 'close with nothing held reported an end').toBe(false);
    r.hold.press(7);
    r.advance(30);
    expect(r.hold.close()).toBe(true);
    expect(r.last(), 'close cut a tap below the minimum pulse').toBe(true);
    r.advance(TAP_HOLD_MS);
    expect(r.last()).toBe(false);
    expect(r.hold.release(7), 'the closed hold was still owned').toBe(false);
  });
});

describe('makePointerClaim — which finger owns a control', () => {
  it('the first claim wins; another pointer can neither claim nor free it; the owner frees it; clear forgets it', () => {
    const c = makePointerClaim();
    expect(c.free(3), 'freed with nothing claimed').toBe(false);
    expect(c.claim(3)).toBe(true);
    expect(c.claim(4)).toBe(false);
    expect(c.claim(3), 'a duplicate press re-claimed').toBe(false);
    expect(c.free(4)).toBe(false);
    expect(c.isHeld()).toBe(true);
    expect(c.free(3)).toBe(true);
    expect(c.isHeld()).toBe(false);
    expect(c.claim(4)).toBe(true);
    expect(c.clear()).toBe(true);
    expect(c.clear()).toBe(false);
    expect(c.free(4), 'clear left the owner able to free').toBe(false);
  });
});

describe('chargeFraction — what a radial fill draws', () => {
  it('nothing to draw without a start', () => {
    expect(chargeFraction(null, 500, 450)).toBeNull();
    expect(chargeFraction(undefined, 500, 450)).toBeNull();
  });
  it('a degenerate duration draws nothing rather than NaN or Infinity', () => {
    expect(chargeFraction(0, 500, 0)).toBeNull();
    expect(chargeFraction(0, 500, -1)).toBeNull();
  });
  it('0 at the start, the share elapsed half-way, 1 at the end and clamped past it', () => {
    expect(chargeFraction(1000, 1000, 450)).toBe(0);
    expect(chargeFraction(1000, 1225, 450)).toBeCloseTo(0.5, 9);
    expect(chargeFraction(1000, 1450, 450)).toBe(1);
    expect(chargeFraction(1000, 9000, 450)).toBe(1);
    expect(chargeFraction(1000, 900, 450)).toBe(0); // a clock read just before the stamp
  });
});

describe('chargeRingDeg + CHARGE_SWEEPS — what a charge ring paints, with nothing allocated per frame (review F5)', () => {
  it('a NUMBER: -1 when there is nothing to draw (null, undefined, NaN)', () => {
    expect(chargeRingDeg(null)).toBe(-1);
    expect(chargeRingDeg(undefined)).toBe(-1);
    expect(chargeRingDeg(NaN)).toBe(-1);
    // A primitive is what lets the painter's cache compare by value: a fresh object per frame never equals the last.
    expect(typeof chargeRingDeg(0.5)).toBe('number');
  });
  it('whole degrees of frac x 360 — distinct at 0.25 and 0.75, so a constant sweep cannot pass — clamped to [0, 360]', () => {
    expect(chargeRingDeg(0)).toBe(0);
    expect(chargeRingDeg(0.25)).toBe(90);
    expect(chargeRingDeg(0.75)).toBe(270);
    expect(chargeRingDeg(1)).toBe(360);
    expect(chargeRingDeg(0.499)).toBe(180); // 179.64, ROUNDED (not floored): a tick writes at most once per degree
    expect(chargeRingDeg(1.7)).toBe(360);
    expect(chargeRingDeg(-0.2)).toBe(0);
  });
  it('the sweep table is built once: 361 frozen entries, entry d sweeping d degrees', () => {
    expect(CHARGE_SWEEPS).toHaveLength(361);
    expect(Object.isFrozen(CHARGE_SWEEPS)).toBe(true);
    expect(CHARGE_SWEEPS[90]).toContain(') 90deg, transparent 90deg');
    expect(CHARGE_SWEEPS[270]).toContain(') 270deg, transparent 270deg');
    expect(CHARGE_SWEEPS[360]).toContain(') 360deg');
    expect(CHARGE_SWEEPS[chargeRingDeg(0.25)], 'the deg indexes a different sweep').toBe(CHARGE_SWEEPS[90]);
  });
});
