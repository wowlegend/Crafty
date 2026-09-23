import { describe, it, expect, beforeEach } from 'vitest';
import {
  HEAVY_HOLD_MS, HEAVY_CHARGE_MS, HEAVY_MULT, HEAVY_STAGGER_MS, HEAVY_WALK_MULT,
  pressHeavy, releaseHeavy, cancelHeavy, heavyChargeLevel, isHeavyReady, heavyWalkMult,
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
  it('the walk slows only while CHARGING — never on a tap', () => {
    expect(heavyWalkMult(T0)).toBe(1);
    pressHeavy(T0);
    expect(heavyWalkMult(T0 + 100), 'a tap stuttered the walk').toBe(1);
    expect(heavyWalkMult(T0 + HEAVY_HOLD_MS + 50)).toBe(HEAVY_WALK_MULT);
    releaseHeavy(T0 + 2000);
    expect(heavyWalkMult(T0 + 2001)).toBe(1);
  });
});
