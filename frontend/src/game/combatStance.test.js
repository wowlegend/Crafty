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
//   Task 2, re-run clean on the committed 90863cc6 content (the first run shared this file with a second builder's
//   mutate.sh): every verdict above reproduced. Added plausible-wrong kills: S2d2 the floor tested against the
//   pursuit speed, `lo < RETREAT_FLOOR` -> RED (the slug test); S2e strafe from the SLOWEST, `lo + STRAFE_MARGIN`
//   (3.5) -> RED; S2f `MIN_CLOSING_RATE / 2` (retreat 2.5) -> RED; S2g the margin dropped from the fastest (6.0) -> RED.
//   Task 3 (stanceVelocity; RED first with "stanceVelocity is not a function", 9 of 15). S3a the retreat clamp dropped
//   -> RED. S3b the blend weight `1 - w` -> RED. S3c the tangential axis sign-flipped -> SURVIVED, an EQUIVALENT
//   mutant (the clamp is symmetric in t), not a hole. S3d formMult ignored (absolute strafe/advance) -> RED (keeps
//   the pace). S3e the retreat scaled by formMult -> RED (form-invariant). S3f the advance clamp dropped -> RED.
//   S3g the w = 0 early return dropped -> RED (the -0 / non-finite case only: the lerp alone returns finite input).
//   S3h the no-direction cap dropped -> RED. S3i the no-direction cap at the retreat cap -> RED. S3j the walk slow
//   not applied to the retreat -> RED. S3k the negative strafe clamp dropped -> RED. S3l a quadratic blend `w * w`
//   -> RED. S3m the advance cap not scaled by formMult -> RED. S3n identity (a comment edit) -> survived.
import { describe, it, expect } from 'vitest';
import {
  STANCE_CAPS, MIN_CLOSING_RATE, NON_PURSUERS, pursuitSpeed, pursuers, deriveStanceCaps, BASE_MOVE_SPEED,
  stanceVelocity,
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

describe('stanceVelocity — the radial clamp (Task 3)', () => {
  const FORMS = [0.6, 0.7, 1, 1.25, 1.4], HEAVY = [1, 0.55], DIRS = Array.from({ length: 360 }, (_, d) => d * Math.PI / 180);
  it('at w = 0 it is the identity, exactly, for every input (out-of-combat speed unchanged)', () => {
    let n = 0;
    for (const a of DIRS) for (const m of FORMS) {
      const vx = Math.cos(a) * 14 * m, vz = Math.sin(a) * 14 * m;
      const o = stanceVelocity(vx, vz, 0.6, 0.8, 0); expect(o.x).toBe(vx); expect(o.z).toBe(vz); n++;
    }
    expect(n, 'empty denominator').toBe(360 * 5);
  });
  // The lerp alone would ALSO return the input at w = 0 for finite input (v + (c - v) x 0 = v), so the case above
  // cannot tell the early return from a float coincidence. These can: a garbage away vector must not poison travel
  // out of combat, and a negative zero must pass through as itself.
  it('at w = 0 a non-finite away vector cannot reach the output, and -0 passes through as -0', () => {
    const o = stanceVelocity(5, -0, NaN, NaN, 0);
    expect(o.x).toBe(5); expect(Object.is(o.z, -0)).toBe(true);
    const p = stanceVelocity(-3, 4, Infinity, 0, 0);
    expect(p.x).toBe(-3); expect(p.z).toBe(4);
  });
  it('at w = 1 the AWAY component never exceeds the retreat cap — any key, any heading, any form, charging or not', () => {
    let n = 0;
    for (const a of DIRS) for (const m of FORMS) for (const h of HEAVY) for (const b of [0, 1.3, 2.9]) {
      const ax = Math.cos(b), az = Math.sin(b), s = 14 * m * h;
      const o = stanceVelocity(Math.cos(a) * s, Math.sin(a) * s, ax, az, 1, m, h);
      expect(o.x * ax + o.z * az).toBeLessThanOrEqual(STANCE_CAPS.retreat * h + 1e-9);
      expect(Math.abs(-o.x * az + o.z * ax)).toBeLessThanOrEqual(STANCE_CAPS.strafe * m * h + 1e-9);
      expect(-(o.x * ax + o.z * az)).toBeLessThanOrEqual(STANCE_CAPS.advance * m * h + 1e-9);
      n++;
    }
    expect(n, 'empty denominator').toBe(360 * 5 * 2 * 3);
  });
  it('a straight backpedal at 14 comes out at exactly the retreat cap; a pure strafe at exactly the strafe cap', () => {
    const b = stanceVelocity(14, 0, 1, 0, 1); expect(b.x).toBeCloseTo(2.0, 12); expect(b.z).toBeCloseTo(0, 12);
    const s = stanceVelocity(0, 14, 1, 0, 1); expect(s.x).toBeCloseTo(0, 12); expect(s.z).toBeCloseTo(6.5, 12);
  });
  // The bounds above are upper bounds only, so absolute caps would pass them. These pin the LOWER side: the clamp keeps
  // each form's pace and each walk slow instead of flattening them to 6.5 (review finding 5).
  it('the clamp keeps the pace: a pure strafe comes out at strafe x moveMult x walkMult for every form and walk slow', () => {
    for (const m of FORMS) for (const h of HEAVY) {
      const o = stanceVelocity(0, 14 * m * h, 1, 0, 1, m, h); expect(o.z).toBeCloseTo(STANCE_CAPS.strafe * m * h, 9);
    }
    expect(stanceVelocity(0, 14 * 0.6, 1, 0, 1, 0.6, 1).z).toBeLessThan(stanceVelocity(0, 14 * 1.4, 1, 0, 1, 1.4, 1).z); // golem < comet
  });
  it('the retreat is form-invariant and the walk slow survives it: a straight backpedal is retreat x walkMult for every form', () => {
    for (const m of FORMS) for (const h of HEAVY) expect(stanceVelocity(14 * m * h, 0, 1, 0, 1, m, h).x).toBeCloseTo(STANCE_CAPS.retreat * h, 9);
  });
  it('a threat with no direction caps the total speed and makes no NaN', () => {
    const o = stanceVelocity(14, 0, 0, 0, 1); expect(Number.isFinite(o.x) && Number.isFinite(o.z)).toBe(true);
    expect(Math.hypot(o.x, o.z)).toBeCloseTo(6.5, 9);
  });
  it('blends linearly in w', () => expect(stanceVelocity(14, 0, 1, 0, 0.5).x).toBeCloseTo(8.0, 9));
  it('writes into the `out` it is handed (allocation-free) and returns it', () => {
    const out = { x: 0, z: 0 };
    expect(stanceVelocity(14, 0, 1, 0, 1, 1, 1, STANCE_CAPS, out)).toBe(out);
    expect(out.x).toBeCloseTo(2.0, 12);
    expect(stanceVelocity(3, 4, 1, 0, 0, 1, 1, STANCE_CAPS, out)).toBe(out);
    expect(out).toEqual({ x: 3, z: 4 });
  });
});
