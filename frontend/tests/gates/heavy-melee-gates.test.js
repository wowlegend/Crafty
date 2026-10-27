import { describe, it, expect, beforeEach } from 'vitest';
import {
  HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT, HEAVY_STAGGER_MS, HEAVY_WALK_MULT,
  pressHeavy, releaseHeavy, cancelHeavy, heavyChargeLevel, isHeavyReady, isHeavyHeld, heavyWalkMult, meleeRefusal,
} from '../../src/game/heavyAttack.js';

/**
 * HEAVY MELEE — hold to charge (spec 2026-09-23-crafty-heavy-melee-design, plan Task 1).
 *
 * The tap stays today's light swing, fired on PRESS. Keeping the button held past HEAVY_HOLD_MS begins a charge;
 * releasing it once the charge has run HEAVY_CHARGE_MS throws the heavy. This pins the state machine; the wiring and
 * the running-game proof are the plan's later tasks.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   H1 the hold threshold ignored (a tap starts charging)   H2 plausible-wrong: a release before ready throws the heavy
 *   H3 cancel ignored   H4 plausible-wrong: a second press (key repeat) restarts the charge
 *   H5 the walk is slowed before the hold threshold (every tap would stutter the player)
 *   H6 (R9.3) releaseHeavy ignores which input holds the charge -> the mouse/T case
 *   H7 (R9.3) plausible-wrong: a second press by another input takes the charge over -> the mouse/T case
 *   The input-time hold (2026-10-27, 11 tests):
 *   H8 releaseHeavy reads the handler clock -> "a quick tap whose lift is HANDLED a second late is still a tap"
 *   H9 pressHeavy ignores its stamp -> "a press HANDLED late still charges from the touch"
 *   H10 plausible-wrong: a stamp after `now` (another clock) accepted -> the foreign-stamp case
 *   H11 plausible-wrong: a zero / negative stamp accepted -> the foreign-stamp case
 *   H0 identity (a comment edit in heavyAttack.js) SURVIVED, as it must.
 *   The charged release and the cooldown (review round 3, item 3; 14 tests), each observed RED:
 *   Z1 the charged release's exemption removed -> "the late press lifted quickly"
 *   Z2 plausible-wrong: every swing exempt from the cooldown   Z3 plausible-wrong: the cooldown outlasts itself (<=)
 *   Z4 the drawn-back arm no longer refuses a light swing   Z0 identity (a comment edit) SURVIVED.
 *
 * BLIND SPOT: nothing here proves a real mouse hold reaches the machine (plan Task 4's e2e does).
 */
const T0 = 10000;
beforeEach(() => cancelHeavy());

describe('the numbers are the design', () => {
  it('a deliberate hold, a readable charge, a heavy worth the wait', () => {
    expect([HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT, HEAVY_STAGGER_MS]).toEqual([280, 420, 2, 800]);
    expect(HEAVY_WALK_MULT).toBeGreaterThan(0.3);
    expect(HEAVY_WALK_MULT).toBeLessThan(1);
  });
});

describe('press, hold, release', () => {
  it('a TAP (released before the hold threshold) throws nothing extra and never charges', () => {
    pressHeavy(T0);
    expect(heavyChargeLevel(T0 + 150)).toBe(0);
    expect(releaseHeavy(T0 + 150)).toBe(false);
  });
  it('released while charging but not ready: nothing; released ready: the heavy', () => {
    pressHeavy(T0);
    const mid = T0 + HEAVY_HOLD_MS + HEAVY_CHARGE_MS / 2;
    expect(heavyChargeLevel(mid)).toBeCloseTo(0.5, 6);
    expect(isHeavyReady(mid)).toBe(false);
    expect(releaseHeavy(mid)).toBe(false);
    pressHeavy(T0);
    const ready = T0 + HEAVY_HOLD_MS + HEAVY_CHARGE_MS;
    expect(heavyChargeLevel(ready + 500)).toBe(1);
    expect(isHeavyReady(ready)).toBe(true);
    expect(releaseHeavy(ready + 10)).toBe(true);
    expect(releaseHeavy(ready + 20), 'one hold threw two heavies').toBe(false);
  });
  it('a cancel (a dodge, death, input lost) drops the charge: the release throws nothing', () => {
    pressHeavy(T0);
    cancelHeavy();
    expect(heavyChargeLevel(T0 + 2000)).toBe(0);
    expect(releaseHeavy(T0 + 2000)).toBe(false);
  });
  it('a second press while held (T key-repeat) does not restart the charge', () => {
    pressHeavy(T0);
    pressHeavy(T0 + 500);
    expect(releaseHeavy(T0 + HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 5)).toBe(true);
  });
  it('R9.3: a charge belongs to the input that pressed it — T tapped during a mouse hold neither takes it nor ends it', () => {
    pressHeavy(T0, 'mouse');
    pressHeavy(T0 + 200, 'key'); // T down mid-hold: ignored
    expect(releaseHeavy(T0 + 250, 'key'), "T's keyup ended the mouse's charge").toBe(false);
    expect(heavyChargeLevel(T0 + HEAVY_HOLD_MS + 10), 'the mouse charge was dropped').toBeGreaterThan(0);
    expect(releaseHeavy(T0 + HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 5, 'mouse'), 'the mouse release lost its heavy').toBe(true);
    // ...and the mirror: a held T is released by T, not by a stray mouseup
    pressHeavy(T0, 'key');
    expect(releaseHeavy(T0 + 2000, 'mouse')).toBe(false);
    expect(releaseHeavy(T0 + 2000, 'key')).toBe(true);
  });
  it('isHeavyHeld: true from the press to the release or a cancel, whichever input holds it', () => {
    expect(isHeavyHeld()).toBe(false);
    pressHeavy(T0, 'key');
    expect(isHeavyHeld()).toBe(true);
    releaseHeavy(T0 + 50, 'mouse'); // not the holder
    expect(isHeavyHeld(), 'a stray release ended the hold').toBe(true);
    releaseHeavy(T0 + 60, 'key');
    expect(isHeavyHeld()).toBe(false);
    pressHeavy(T0, 'mouse');
    cancelHeavy();
    expect(isHeavyHeld()).toBe(false);
  });
  it('the walk slows only while CHARGING — never on a tap', () => {
    expect(heavyWalkMult(T0)).toBe(1);
    pressHeavy(T0);
    expect(heavyWalkMult(T0 + 100), 'a tap stuttered the walk').toBe(1);
    expect(heavyWalkMult(T0 + HEAVY_HOLD_MS + 50)).toBe(HEAVY_WALK_MULT);
    releaseHeavy(T0 + 2000);
    expect(heavyWalkMult(T0 + 2001)).toBe(1);
  });
});

// THE HOLD IS THE FINGER'S, NOT THE HANDLER'S. A handler runs when the main thread is free, not when the finger moved:
// a lift that came 40 ms after its press but was HANDLED 1787-2300 ms later read as a charged hold and threw a heavy
// (tests/e2e/touch-hold.spec.js, the late lift with the stamp ignored — its mutants E14 / E15 / E17; found from
// touch-hold CI run 40517958583, whose warm-up touch was handled 1029-7269 ms apart). A pointer event carries the time it happened (`timeStamp`, on performance.now()'s clock — measured, a 40 ms
// press behind a 1.5 s stall: Chromium CDP touch 1506 ms handler / 71 ms timeStamp, WebKit mouse 1512 / 46; iOS Safari
// unmeasured). A caller that has the stamp passes it; one that has none, or a stamp from another clock, keeps the
// handler's time. BLIND SPOT: these drive the module; the overlay handing it the stamp is touch-hold-gates, and the
// running game reading it (Components' seams) is tests/e2e/touch-hold.spec.js's late-lift and late-press phases.
describe('the hold is read on the input\'s own time when the caller has it', () => {
  const READY = HEAVY_HOLD_MS + HEAVY_CHARGE_MS;
  it('a quick tap whose lift is HANDLED a second late is still a tap', () => {
    // PRESENCE: the same late handler time with no stamp IS a charged hold — the stamp is what changes the answer.
    pressHeavy(T0, 'touch');
    expect(releaseHeavy(T0 + 1029, 'touch'), 'SETUP: a 1029 ms handler gap is not a charged hold — the case cannot discriminate').toBe(true);
    pressHeavy(T0, 'touch', T0 - 5); // the press handled 5 ms after the touch
    expect(releaseHeavy(T0 + 1029, 'touch', T0 + 35), 'a 40 ms tap threw the heavy because its lift was handled 1 s late').toBe(false);
    expect(isHeavyHeld(), 'the late lift did not end the hold').toBe(false);
  });
  it('a press HANDLED late still charges from the touch: the full hold throws, and the ring reads it from the touch', () => {
    pressHeavy(T0 + 400, 'touch', T0); // a long frame: the press ran 400 ms after the finger landed
    // 490 ms after the touch (90 after the handler): half-way through the charge, not still inside the tap window.
    expect(heavyChargeLevel(T0 + 490), 'the charge counted from the handler, not the touch')
      .toBeCloseTo((490 - HEAVY_HOLD_MS) / HEAVY_CHARGE_MS, 6);
    expect(releaseHeavy(T0 + 720, 'touch', T0 + READY + 10), `a ${READY + 10} ms hold whose press ran late threw nothing`).toBe(true);
  });
  it('a stamp that is not a reading on this clock is ignored — the handler\'s time stands (6 of 6)', () => {
    // undefined (a caller with no event), 0 and negative (no stamp), NaN, a future reading, an epoch-ms reading.
    const foreign = [undefined, 0, -3, NaN, T0 + 5000, 1.7e12];
    let checked = 0;
    for (const stamp of foreign) {
      pressHeavy(T0, 'touch', stamp);
      expect(releaseHeavy(T0 + READY + 10, 'touch', stamp), `stamp ${stamp}: a full hold on the handler clock threw nothing`).toBe(true);
      pressHeavy(T0, 'touch', stamp);
      expect(releaseHeavy(T0 + 150, 'touch', stamp), `stamp ${stamp}: a tap on the handler clock threw the heavy`).toBe(false);
      checked += 1;
    }
    expect(checked).toBe(foreign.length);
  });
});

// A CHARGED RELEASE IS NOT EATEN BY THE LIGHT SWING'S COOLDOWN (review round 3, item 3). The melee cooldown (300 ms in
// Components) runs on the HANDLER clock, while the charge is read on the input's: a press handled late behind a stall
// and lifted soon after is a full charge on the finger, but its light swing (at the press) and the heavy (at the release)
// land inside one cooldown on the handler clock, and the heavy was dropped silently. The heavy's own gate is the charge
// — at least HEAVY_HOLD_MS + HEAVY_CHARGE_MS of hold, longer than the cooldown — so it is refused by neither rule.
// BLIND SPOT: that Components' triggerMeleeAttack hands meleeRefusal the HEAVY flag is tests/e2e/touch-hold.spec.js's
// "late press lifted quickly".
describe('meleeRefusal: the light swing\'s cooldown and the drawn-back arm refuse light swings, never a charged release', () => {
  const CD = 300;
  it('a light swing inside the cooldown is refused; at its edge and past it, it goes', () => {
    expect(meleeRefusal(false, T0 + CD - 1, T0, CD)).toBe('cooldown');
    expect(meleeRefusal(false, T0 + CD, T0, CD), 'the cooldown outlasted itself').toBeNull();
    expect(meleeRefusal(false, T0 + CD + 500, T0, CD)).toBeNull();
  });
  it('a light swing while a heavy CHARGES is refused, even past the cooldown (the arm is drawn back)', () => {
    pressHeavy(T0, 'mouse');
    expect(meleeRefusal(false, T0 + 5000, 0, CD)).toBe('charging');
    cancelHeavy();
    expect(meleeRefusal(false, T0 + 5000, 0, CD), 'PRESENCE: with nothing held the same swing goes').toBeNull();
  });
  it('the late press lifted quickly: a full charge on the finger, inside one cooldown on the handler clock, throws', () => {
    // The finger lands at T0; the press runs 1400 ms late and swings light; the lift is handled 100 ms after it.
    pressHeavy(T0 + 1400, 'touch', T0);
    const lightAt = T0 + 1400;
    const liftHandled = T0 + 1500;
    expect(releaseHeavy(liftHandled, 'touch', liftHandled), 'SETUP: the 1500 ms hold on the finger is not a charge').toBe(true);
    expect(meleeRefusal(false, liftHandled, lightAt, CD), 'SETUP: a LIGHT swing 100 ms after another is not refused — the case cannot discriminate').toBe('cooldown');
    expect(meleeRefusal(true, liftHandled, lightAt, CD), 'the charged release was eaten by the light swing\'s cooldown').toBeNull();
  });
});
