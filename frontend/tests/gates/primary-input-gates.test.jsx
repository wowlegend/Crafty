// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, createEvent, screen, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { cancelHeavy, isHeavyHeld, HEAVY_HOLD_MS, HEAVY_CHARGE_MS } from '../../src/game/heavyAttack.js';
import { installPrimaryInput } from '../../src/input/primaryInput.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// THE PRIMARY'S SEAM — the wiring the input-time hold rides on (touch-hold lane, review round 3).
//
// heavy-melee-gates proves heavyAttack reads a hold on the stamp it is GIVEN; touch-hold-gates proves the overlay HANDS
// the store the event's stamp. Between them sat Components.jsx's press / release / store publication, gated by nothing:
// a store wrapper that dropped the lift's time (`releasePrimary: (source) => releaseHeavySwing(source)`, K12) and a call
// with its arguments swapped (K13) stayed green across the whole suite, and that wiring carries the whole fix. It lives in
// input/primaryInput.js now (as round 2 moved the mouse pair into compatMouse.installPrimaryMouse), and this drives the
// seams it PUBLISHES — the ones the overlay calls — against the REAL heavyAttack module under an injected clock, then
// once more end to end: the real overlay, the real store, stamped pointer events.
//
// Every case states its PRESENCE first: the same handler times WITHOUT a stamp give the other answer, so the stamp is
// what the verdict measures, and a seam that drops it cannot pass.
//
// Mutation-Proof: via scripts/dev/mutate.sh against src/input/primaryInput.js (10 tests), each observed RED:
//   K12 the store's releasePrimary drops the lift's time (the review's wrapper)   K12b the store's pressPrimary drops
//   the press's time   K13a pressHeavy's now / at swapped   K13b releaseHeavy's now / at swapped   K13c pressHeavy's
//   source / at swapped   K13d releaseHeavy's source / at swapped   K14 dead input leaves the charge held
//   K15 plausible-wrong: dead input throws the heavy   K16 the beast-form check dropped   K17 the voidhand check dropped
//   K18 any button charges   K19 any verb charges   K20 remove() leaves releasePrimary   K21 presses not counted
//   K0 identity (a comment edit) SURVIVED, as it must.
//
// BLIND SPOT: that Components.jsx CALLS installPrimaryInput with the real performVerb, store, liveness and heavy throw
// (rather than publishing its own seams beside it) is tests/e2e/touch-hold.spec.js — the action button's late lift and
// late press in the running game. jsdom has no frame loop, so nothing here proves the heavy LANDS on a mob.

const T0 = 10000;
const READY = HEAVY_HOLD_MS + HEAVY_CHARGE_MS;

/** A rig: the module installed on a plain store object, a settable handler clock, and a record of every heavy thrown. */
function rig({ verb = 'attack', live = true, state = {} } = {}) {
  let clock = T0;
  const store = {};
  const thrown = [];
  const verbs = [];
  const opts = { live };
  const primary = installPrimaryInput({
    performVerb: (button) => { verbs.push(button); return verb; },
    setState: (patch) => Object.assign(store, patch),
    getState: () => state,
    isInputLive: () => opts.live,
    throwHeavy: () => thrown.push(clock),
    now: () => clock,
  });
  return { primary, store, thrown, verbs, opts, at: (t) => { clock = t; } };
}

beforeEach(() => cancelHeavy());
afterEach(() => cancelHeavy());

describe('installPrimaryInput publishes the seams the overlay calls', () => {
  it('the store gets performVerb, pressPrimary and releasePrimary; remove() clears all three', () => {
    const r = rig();
    expect(Object.keys(r.store).sort()).toEqual(['performVerb', 'pressPrimary', 'releasePrimary']);
    expect(r.store.pressPrimary(0, 'touch'), 'pressPrimary does not return the verb it ran').toBe('attack');
    expect(r.verbs, 'pressPrimary did not run the verb').toEqual([0]);
    r.primary.remove();
    expect(r.store).toEqual({ performVerb: null, pressPrimary: null, releasePrimary: null });
  });
});

describe('the PUBLISHED seams read the hold on the event\'s own time', () => {
  it('a 40 ms tap whose lift is HANDLED a second late is still a tap — no heavy', () => {
    // PRESENCE: the same handler times with no stamp ARE a charged hold.
    const p = rig();
    p.store.pressPrimary(0, 'touch');
    p.at(T0 + 1029);
    p.store.releasePrimary('touch');
    expect(p.thrown.length, 'SETUP: a 1029 ms handler gap with no stamp threw no heavy — the case cannot discriminate').toBe(1);
    const r = rig();
    r.store.pressPrimary(0, 'touch', T0 - 5);
    r.at(T0 + 1029);
    r.store.releasePrimary('touch', T0 + 35);
    expect(r.thrown, 'a 40 ms tap threw the heavy: the published release lost the lift\'s own time').toEqual([]);
    expect(isHeavyHeld(), 'the late lift did not end the hold').toBe(false);
  });

  it('a hold whose PRESS was handled late charges from the finger — the heavy is thrown', () => {
    // PRESENCE: the same handler times with no stamp are only a 320 ms hold.
    const p = rig();
    p.at(T0 + 400);
    p.store.pressPrimary(0, 'touch');
    p.at(T0 + 720);
    p.store.releasePrimary('touch');
    expect(p.thrown, 'SETUP: a 320 ms handler hold threw the heavy — the case cannot discriminate').toEqual([]);
    const r = rig();
    r.at(T0 + 400);
    r.store.pressPrimary(0, 'touch', T0);
    r.at(T0 + 720);
    r.store.releasePrimary('touch', T0 + READY + 10);
    expect(r.thrown.length, `a ${READY + 10} ms hold whose press ran late threw nothing: the published press lost its own time`).toBe(1);
  });

  it('a caller with no stamp (or one from another clock) keeps the handler\'s clock: a full hold throws, a tap does not (4 of 4)', () => {
    const stamps = [undefined, 0, T0 + 99999, 1.7e12];
    let checked = 0;
    for (const stamp of stamps) {
      const full = rig();
      full.store.pressPrimary(0, 'mouse', stamp);
      full.at(T0 + READY + 10);
      full.store.releasePrimary('mouse', stamp);
      expect(full.thrown.length, `stamp ${stamp}: a full hold on the handler clock threw nothing`).toBe(1);
      const tap = rig();
      tap.store.pressPrimary(0, 'mouse', stamp);
      tap.at(T0 + 150);
      tap.store.releasePrimary('mouse', stamp);
      expect(tap.thrown, `stamp ${stamp}: a 150 ms tap on the handler clock threw the heavy`).toEqual([]);
      checked += 1;
    }
    expect(checked).toBe(stamps.length);
  });

  it('only the input holding the charge releases it (R9.3): a stray release ends nothing, the holder\'s throws', () => {
    const r = rig();
    r.store.pressPrimary(0, 'touch', T0);
    r.at(T0 + READY + 10);
    r.store.releasePrimary('key', T0 + READY + 10);
    expect(r.thrown, 'another input\'s release threw the touch\'s heavy').toEqual([]);
    expect(isHeavyHeld(), 'another input\'s release ended the touch\'s charge').toBe(true);
    r.store.releasePrimary('touch', T0 + READY + 10);
    expect(r.thrown.length, 'PRESENCE: the holder\'s release must throw').toBe(1);
  });

  it('input gone dead (paused, a panel, death) CANCELS the charge — never thrown, and the next release throws nothing', () => {
    const r = rig();
    r.store.pressPrimary(0, 'touch', T0);
    r.at(T0 + READY + 10);
    r.opts.live = false;
    r.store.releasePrimary('touch', T0 + READY + 10);
    expect(r.thrown, 'a release with input dead threw the heavy').toEqual([]);
    expect(isHeavyHeld(), 'a release with input dead left the charge held').toBe(false);
    r.opts.live = true;
    r.store.releasePrimary('touch', T0 + READY + 20);
    expect(r.thrown, 'a cancelled charge threw on the next release').toEqual([]);
  });

  it('a press charges only on a LEFT press that ATTACKED, out of a beast form and with the voidhand empty (4 of 4)', () => {
    // PRESENCE: the plain case charges.
    const ok = rig();
    ok.store.pressPrimary(0, 'touch', T0);
    expect(isHeavyHeld(), 'SETUP: a left attack press did not charge').toBe(true);
    cancelHeavy();
    const refused = [
      ['a right press', { button: 2 }],
      ['a press that mined', { verb: 'mine' }],
      ['a press in a beast form', { state: { beastFormActive: true } }],
      ['a press with the voidhand full', { state: { voidhandHeld: true } }],
    ];
    let checked = 0;
    for (const [name, c] of refused) {
      const r = rig({ verb: c.verb, state: c.state });
      r.store.pressPrimary(c.button ?? 0, 'touch', T0);
      expect(isHeavyHeld(), `${name} charged the heavy`).toBe(false);
      cancelHeavy();
      checked += 1;
    }
    expect(checked).toBe(refused.length);
  });

  it('presses are counted per source (the e2e F2 case reads them through the dev bridge)', () => {
    const r = rig();
    r.store.pressPrimary(0, 'touch');
    r.store.pressPrimary(2, 'mouse');
    r.store.pressPrimary(0, 'touch');
    expect(r.primary.presses()).toEqual({ mouse: 1, touch: 2 });
  });
});

vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

// END TO END in jsdom: the real overlay dispatching through the real store into the module, the events carrying their
// own time as a browser stamps it. This is the path a touch takes; the unit cases above pin each branch.
describe('the action button, through the real store, reads the finger\'s time', () => {
  let thrown;
  let primary;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    Element.prototype.setPointerCapture = function setPointerCapture() {};
    setActive(true);
    thrown = 0;
    primary = installPrimaryInput({
      performVerb: () => 'attack',
      setState: useGameStore.setState,
      getState: useGameStore.getState,
      isInputLive: () => true,
      throwHeavy: () => { thrown += 1; },
      now: () => performance.now(),
    });
  });
  afterEach(() => {
    cleanup();
    primary.remove();
    vi.useRealTimers();
    delete Element.prototype.setPointerCapture;
    setActive(false);
  });
  const stamped = (kind, ts) => {
    const el = screen.getByTestId('touch-action');
    const ev = createEvent[kind](el, { pointerId: 5, pointerType: 'touch' });
    if (ts !== undefined) Object.defineProperty(ev, 'timeStamp', { value: ts });
    fireEvent(el, ev);
  };
  const late = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  it('a 40 ms touch whose lift is handled a second late throws nothing; unstamped, the same handling throws', () => {
    render(<TouchControls isWorldBuilt />);
    const t0 = performance.now();
    stamped('pointerDown');
    late(1029);
    stamped('pointerUp');
    expect(thrown, 'SETUP: an unstamped 1029 ms handler hold threw nothing — the case cannot discriminate').toBe(1);
    thrown = 0;
    const t1 = performance.now();
    stamped('pointerDown', t1);
    late(1029);
    stamped('pointerUp', t1 + 40);
    expect(thrown, `a 40 ms touch threw the heavy on the late lift (pressed at ${t0}, ${t1})`).toBe(0);
  });

  it('a touch whose press is handled late throws the heavy its finger held for', () => {
    render(<TouchControls isWorldBuilt />);
    late(1000);
    const finger = performance.now() - 400; // the finger landed 400 ms before the press ran
    stamped('pointerDown', finger);
    late(320);
    stamped('pointerUp', finger + READY + 10);
    expect(thrown, `a ${READY + 10} ms hold whose press ran late threw nothing`).toBe(1);
  });
});
