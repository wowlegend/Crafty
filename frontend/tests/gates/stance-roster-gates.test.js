// stance-roster-gates.test.js — the SHIPPED roster leaves every pursuer able to close on the combat stance's retreat.
//
// game/combatStance.js derives the retreat cap from the slowest pursuer (its pursuit speed minus MIN_CLOSING_RATE)
// and never refuses a roster when it loads: that module is on App's import chain, so a throw there boots the game to
// a blank page. A roster that breaks RETREAT_FLOOR is held at the floor instead, where the slowest pursuer closes
// slower than MIN_CLOSING_RATE, or not at all, and that fight can be outwalked. This gate is where such a roster is
// refused: it fails game/mobTypes.js as shipped and names every pursuer under the floor.
//
// WHAT THIS DOES NOT CHECK: the speed the AI worker actually moves a mob at (tests/gates/stance-pursuit-gates.test.js
// measures that), the strafe and advance caps, and that a broken roster still loads
// (tests/store/stance-roster-load.test.js).
import { describe, it, expect } from 'vitest';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import {
  MIN_CLOSING_RATE, RETREAT_FLOOR, STANCE_ROSTER_VIOLATION, deriveStanceCaps, pursuers, pursuitSpeed,
} from '../../src/game/combatStance.js';

/** Each pursuer whose own retreat cap (pursuit speed - MIN_CLOSING_RATE) is under RETREAT_FLOOR, as "type retreat". */
function floorBreakers(roster) {
  return pursuers(roster)
    .map((t) => [t, pursuitSpeed(t, roster) - MIN_CLOSING_RATE])
    .filter(([, retreat]) => retreat < RETREAT_FLOOR)
    .map(([t, retreat]) => `${t} retreat ${retreat} m/s`);
}

describe('the shipped roster against RETREAT_FLOOR', () => {
  it('SETUP: the check sees a pursuer slowed under the floor, and names it', () => {
    const slowed = { ...MOB_TYPES, zombie: { ...MOB_TYPES.zombie, speed: MOB_TYPES.zombie.speed / 2 } };
    expect(floorBreakers(slowed), 'the check is blind to a slowed pursuer').toEqual(expect.arrayContaining([expect.stringMatching(/^zombie retreat 0\.5 m\/s$/)]));
    expect(deriveStanceCaps(slowed).violation, 'the derivation did not name the slowed pursuer').toMatch(/zombie pursues at/);
  });

  it('every pursuer\'s retreat cap clears the floor, and the stance loaded with no violation', () => {
    const ps = pursuers();
    console.log(`stance-roster-gates: ${ps.length} pursuers checked against RETREAT_FLOOR ${RETREAT_FLOOR}`);
    expect(ps.length, 'empty denominator: the roster lost its pursuers').toBeGreaterThanOrEqual(6);
    expect(floorBreakers(MOB_TYPES), `pursuers under RETREAT_FLOOR ${RETREAT_FLOOR} m/s: retune the mob or the floor`).toEqual([]);
    expect(STANCE_ROSTER_VIOLATION, 'the stance clamped its caps when it loaded').toBeNull();
  });
});
