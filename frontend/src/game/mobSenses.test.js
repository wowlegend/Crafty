import { describe, it, expect } from 'vitest';
import { dist2D, dist3D, withinSense, canReach, VERTICAL_REACH } from './mobSenses.js';

// A-bis B4 — the mob brain reasoned on the XZ plane only, so a mob 200 blocks below you and three blocks
// away horizontally was inside MELEE_RANGE and hit you. Pillaring up, walling in and going underground all
// gave ZERO protection, which makes building strategically pointless in a game whose whole loop is
// build-by-day / survive-the-night.
//
// The worker's own constants, so the cases below are the real ones rather than round numbers.
const AGGRO_RANGE = 20;
const MELEE_RANGE = 2.5;

describe('distance', () => {
  it('dist2D ignores height, dist3D does not — the whole bug in one assertion', () => {
    expect(dist2D(3, 4)).toBe(5);
    expect(dist3D(3, 0, 4)).toBe(5);
    expect(dist3D(3, 200, 4)).toBeGreaterThan(200);
  });

  it('is symmetric in sign — below and above are equally far', () => {
    expect(dist3D(1, -50, 1)).toBeCloseTo(dist3D(1, 50, 1), 10);
  });
});

describe('withinSense — height is real cover', () => {
  it('does NOT aggro a player 200 blocks overhead, 3 blocks away horizontally', () => {
    // The literal reported symptom: a mob melees you "through 200 blocks of vertical separation". It should
    // not even notice you.
    expect(withinSense(3, 200, 0, AGGRO_RANGE)).toBe(false);
  });

  it('does NOT aggro a player deep underground directly below', () => {
    expect(withinSense(0, -40, 0, AGGRO_RANGE)).toBe(false);
  });

  it('STILL aggros a player at normal fighting height — the fix must not blind the mobs', () => {
    // The canary. It would be trivial to "fix" this by making mobs never aggro; that breaks the night siege
    // entirely, and this is the assertion that fails if the sense radius collapses.
    expect(withinSense(10, 0, 10, AGGRO_RANGE)).toBe(true);
    expect(withinSense(5, 2, 5, AGGRO_RANGE)).toBe(true);
    expect(withinSense(0, 0, 19.9, AGGRO_RANGE)).toBe(true);
  });

  it('aggros a player standing on a modest wall — a 3-block ledge is cover from BLOWS, not from being seen', () => {
    expect(withinSense(4, 3, 0, AGGRO_RANGE)).toBe(true);
  });

  it('treats the range as inclusive at the boundary', () => {
    expect(withinSense(AGGRO_RANGE, 0, 0, AGGRO_RANGE)).toBe(true);
    expect(withinSense(AGGRO_RANGE + 0.01, 0, 0, AGGRO_RANGE)).toBe(false);
  });
});

describe('canReach — building finally does something', () => {
  it('CANNOT hit a player 200 blocks up, 1 block away horizontally', () => {
    // Under the old 2D-only test this returned true. This single case is the core-fantasy fix.
    expect(canReach(1, 200, 0, MELEE_RANGE)).toBe(false);
  });

  it('CANNOT hit a player standing on a 3-block wall', () => {
    expect(canReach(1, 3, 0, MELEE_RANGE)).toBe(false);
  });

  it('CAN still hit a player on the same level, or on a small step', () => {
    // The canary in the other direction: melee that can never land makes the night trivial.
    expect(canReach(1, 0, 1, MELEE_RANGE)).toBe(true);
    expect(canReach(2, 1, 0, MELEE_RANGE)).toBe(true);
    expect(canReach(0, 2, 0, MELEE_RANGE)).toBe(true);
  });

  it('CANNOT hit a player who is close vertically but far horizontally', () => {
    // 2D range still has to hold — vertical proximity alone must not grant reach.
    expect(canReach(40, 0, 0, MELEE_RANGE)).toBe(false);
  });

  it('is symmetric above and below — a mob on a roof reaches down as far as one below reaches up', () => {
    expect(canReach(1, VERTICAL_REACH, 0, MELEE_RANGE)).toBe(canReach(1, -VERTICAL_REACH, 0, MELEE_RANGE));
  });

  it('takes an explicit verticalReach so a leaping mob can differ from a swinging one', () => {
    expect(canReach(1, 5, 0, MELEE_RANGE, 6)).toBe(true);
    expect(canReach(1, 5, 0, MELEE_RANGE, 2)).toBe(false);
  });

  it('requires BOTH conditions — neither alone grants a hit', () => {
    expect(canReach(1, 99, 0, MELEE_RANGE)).toBe(false); // near in 2D, far in Y
    expect(canReach(99, 0, 0, MELEE_RANGE)).toBe(false); // near in Y, far in 2D
    expect(canReach(1, 0, 0, MELEE_RANGE)).toBe(true); // near in both
  });
});
