// combatStance.test.js — the combat stance's numbers and decisions, as pure properties.
// Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md (Tasks 2-4). What the REAL worker does with the
// same roster is measured in tests/gates/stance-pursuit-gates.test.js.
//
// Mutation-Proof: (scripts/dev/mutate.sh on src/game/combatStance.js unless noted, observed 2026-10-27)
//   Task 2. S2a `Math.min(...speeds)` -> `Math.max` (retreat from the spider, 5.0) -> RED. S2b the NON_PURSUERS
//   skeleton entry deleted -> RED (the pursuer count reads 7). S2d the RETREAT_FLOOR throw disabled -> RED (the slug
//   test). S2c `chaseSpeedMult(type, true)` -> `1` -> mutate.sh COULD NOT CHECK (0 collected): the module itself
//   throws "retreat 1 m/s (zombie pursues at 2) is under RETREAT_FLOOR 1.5" at load, observed by hand (cp backup,
//   cmp-verified restore), so the file fails to import. S2c2 the same call -> `1.5` (the spider's 2.0 lost, no throw)
//   -> RED (strafe 6.2). S0 identity (a comment edit) -> survived.
import { describe, it, expect } from 'vitest';
import {
  STANCE_CAPS, MIN_CLOSING_RATE, NON_PURSUERS, pursuitSpeed, pursuers, deriveStanceCaps, BASE_MOVE_SPEED,
} from './combatStance.js';
import { MOB_TYPES } from './mobTypes.js';
import { chaseSpeedMult } from './mobMovement.js';

describe('the stance caps, derived from the roster (Task 2)', () => {
  it('derives retreat 2.0 / strafe 6.5 / advance 6.5 from today\'s roster (husk 3.0 slowest, spider 6.0 fastest)', () => {
    expect(STANCE_CAPS).toMatchObject({ retreat: 2.0, strafe: 6.5, advance: 6.5, slowest: 'zombie', fastest: 'spider' });
  });
  it('for EVERY pursuer in the roster, the retreat cap is at least MIN_CLOSING_RATE below its pursuit speed', () => {
    const ps = pursuers();
    expect(ps.length, 'empty denominator').toBe(6); // zombie spider skitterling duskhound moss_brute emberhusk
    for (const t of ps) expect(pursuitSpeed(t) - STANCE_CAPS.retreat, t).toBeGreaterThanOrEqual(MIN_CLOSING_RATE - 1e-9);
  });
  it('every hostile is either a pursuer or a NAMED non-pursuer; passives are neither', () => {
    const entries = Object.entries(MOB_TYPES);
    expect(entries.length, 'empty denominator').toBeGreaterThan(0);
    for (const [t, d] of entries) expect(d.passive ? false : (pursuers().includes(t) || t in NON_PURSUERS), t).toBe(!d.passive);
    for (const [t, d] of entries) if (d.passive) expect(pursuers().includes(t), `passive ${t} counted as a pursuer`).toBe(false);
  });
  it('the brute pursues at its charge (5.4), and walks slower than the retreat cap — a named, intended exception', () => {
    expect(pursuitSpeed('moss_brute')).toBeCloseTo(5.4, 9);
    expect(MOB_TYPES.moss_brute.speed * chaseSpeedMult('moss_brute', true)).toBeLessThan(STANCE_CAPS.retreat);
  });
  it('a slower pursuer added later fails the floor instead of making the backpedal a crawl', () => {
    expect(() => deriveStanceCaps({ ...MOB_TYPES, slug: { speed: 1.2, passive: false } })).toThrow(/RETREAT_FLOOR/);
  });
  it('out of combat travel is untouched: BASE_MOVE_SPEED is still 14', () => expect(BASE_MOVE_SPEED).toBe(14));
});
