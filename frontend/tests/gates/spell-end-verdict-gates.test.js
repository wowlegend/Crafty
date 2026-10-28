// THE MOB-FLOOR FIREBALL'S VERDICT RULE (tests/e2e/_spellEnd.js) — which casts it judges, and which it sets aside.
//
// mob-floor.spec.js casts a fireball under a roof and judges it by where the spell's own record says it ENDED. A cast a
// mob or the boss ended used to be set aside and recast WHATEVER the distance — so a spell that flew 6 m before a mob
// stopped it, a flight that had already passed the ground test at every half-metre substep, was thrown away, and three
// in a row failed the spec as SETUP on a spell that flew (review, 2026-10-27). The rule now sets aside only a mob or
// boss end WITHIN the burst distance, where the end cannot show whether the spell flies.
//
// The spec runs only in a browser, where the cases that decide this rule — a mob ending a flight 6 m out, the boss
// ending one at 2 m — come down to luck and frame length (a local construction on a machine at load ~50-230 held every
// flight in one frame over 3 s, so it ended by 'age' and never reached the mob test). So the rule lives in one helper
// the spec imports, and this drives it directly. WHAT THIS DOES NOT CHECK: that the spec calls it (the spec's own
// mutants do), or that the end record is right (tests/gates/spent-spell-record-gates.test.jsx).
//
// Mutation-Proof: by hand through scripts/dev/mutate.sh against tests/e2e/_spellEnd.js, 6 tests collected each time,
//   every RED confirmed against a green baseline — identity (a comment edit) SURVIVED; all of these RED:
//   M1 THE OLD RULE — the distance clause dropped (every mob or boss end set aside) -> RED "past the burst distance"
//   M2 `<= BURST_M` -> `< BURST_M` (an end at exactly 4 m judged, and it fails the verdict) -> RED "exactly one" — it
//      SURVIVED the first draft, whose 4 m samples lay a float hair off 4; the exact axis-aligned edge sample kills it
//   M3 the boss dropped from the set-aside -> RED "within"
//   M4 an age end set aside too (`by === 'mob' || by === 'boss'` -> `by !== 'ground'`) -> RED "never set aside"
//   M5 BURST_M 4 -> 3 -> RED "within"; BURST_M 4 -> 5 -> RED "past the burst distance"
//   M6 flown reads the muzzle's z for its y -> RED "flown is the 3D distance"
//   M7 the null guard dropped (`!!cast.end &&` removed) -> RED "no end record"
import { describe, it, expect } from 'vitest';
import { BURST_M, flown, stoppedShort } from '../e2e/_spellEnd.js';

// A muzzle off the origin and a heading off every axis, with three different magnitudes: a crossed or dropped axis in
// `flown` cannot produce the same distance.
const MUZZLE = { x: 10, y: 65, z: -3 };
const DIR = { x: 0.48, y: -0.36, z: -0.8 }; // unit length
const ending = (by, d) => ({
  muzzle: MUZZLE,
  end: { by, x: MUZZLE.x + DIR.x * d, y: MUZZLE.y + DIR.y * d, z: MUZZLE.z + DIR.z * d },
});
const STOPPERS = ['mob', 'boss'];

describe('the fireball verdict: which ends it judges', () => {
  it('flown is the 3D distance from the muzzle to the recorded end', () => {
    for (const d of [0.5, 4, 6.5, 19]) expect(flown(ending('ground', d))).toBeCloseTo(d, 9);
  });

  it('a mob or boss end PAST the burst distance is a flight, judged — the ground test passed all the way out', () => {
    for (const by of STOPPERS) {
      for (const d of [4.5, 6, 11]) {
        expect(stoppedShort(ending(by, d)), `a ${by} end ${d} m out was set aside — a valid flight thrown away`).toBe(false);
      }
    }
  });

  it('a mob or boss end WITHIN the burst distance is set aside — it cannot show whether the spell flies', () => {
    for (const by of STOPPERS) {
      for (const d of [0.5, 2, 3.9, 4]) {
        expect(stoppedShort(ending(by, d)), `a ${by} end ${d} m out was judged — it would read as a muzzle burst`).toBe(true);
      }
    }
  });

  it('every mob or boss end is either set aside or passes the verdict — exactly one', () => {
    let checked = 0;
    for (const by of STOPPERS) {
      for (let q = 0; q <= 48; q++) {
        const c = ending(by, q / 4); // 0 to 12 m, every quarter metre
        expect(stoppedShort(c) !== (flown(c) > BURST_M),`a ${by} end ${(q / 4).toFixed(2)} m out`).toBe(true);
        checked++;
      }
      // The boundary itself, EXACTLY: along an axis, so the distance is 4 with no rounding (DIR's 4 m lands a float
      // hair either side, which cannot tell <= from <). The verdict fails an end at 4 m, so it must be set aside.
      const edge = { muzzle: MUZZLE, end: { by, x: MUZZLE.x, y: MUZZLE.y, z: MUZZLE.z - BURST_M } };
      expect(flown(edge)).toBe(BURST_M);
      expect(stoppedShort(edge), `a ${by} end exactly ${BURST_M} m out was judged — it would read as a muzzle burst`).toBe(true);
      checked++;
    }
    expect(checked).toBe(100);
  });

  it('a ground or age end is never set aside — that is where a muzzle burst lands, and it must reach the verdict', () => {
    for (const by of ['ground', 'age']) {
      for (const d of [0.5, 2, 6]) expect(stoppedShort(ending(by, d)), `a ${by} end ${d} m out was set aside`).toBe(false);
      expect(flown(ending(by, 0.5)) > BURST_M, `a ${by} end at the muzzle passed the verdict`).toBe(false);
    }
  });

  it('no end record is not a stopped cast: the spec\'s own presence check fails it instead', () => {
    expect(stoppedShort({ muzzle: MUZZLE, end: null })).toBe(false);
  });
});
