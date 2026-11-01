import { describe, it, expect } from 'vitest';
import { AWAITS, BEATS, LANDED, compareReds, staleReds, redLine, unitsOf } from '../e2e/_firstNightAwaits.js';

/**
 * THE FIRST NIGHT'S RECORD OF WHAT IS NOT BUILT YET (tests/e2e/_firstNightAwaits.js; DECISIONS 2026-11-01 (W3-A PR C)
 * items 485 and 488). Two decisions are pure and are driven here on inputs whose answer is known by construction:
 * compareReds, which an awaiting beat's run under FIRST_NIGHT_AWAITING=1 must pass (exactly its recorded reds, one per
 * check, each matching its reason), and staleReds, which fails the record while a listed red belongs to a unit that has
 * landed. Whether a unit HAS landed is read off the repo by tests/scripts/first-night-awaits.test.js.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 8 tests, each observed RED:
 *   A1 compareReds lets a run with no reds through its first guard -> "a green run while listed fails"
 *   A2 plausible-wrong: compareReds reads only the first red (the phase-1 shape) -> "passes a run that shows every
 *      recorded red" and "an extra red, a red twice"
 *   A3 compareReds ignores a red the record does not hold -> "an extra red, a red twice"
 *   A4 compareReds matches a reason under any check -> "a red under the wrong check"
 *   A5 staleReds reads each beat's first red only -> "names every listed red whose unit has landed"
 *   A6 staleReds lets an empty entry stand -> "a beat with no red is named"
 *   I0 identity (a comment edit in _firstNightAwaits.js) SURVIVED.
 *
 * NOT CHECKED HERE: whether the reasons are what the beats show today (the opt-in run, recorded in DECISIONS item 485),
 * and what "landed" means for each unit (the repo check).
 */
const REC = Object.freeze([
  { unit: 'L2', check: 'slot', reason: /^no lantern slot/ },
  { unit: 'N8', check: 'near', reason: /^a death 12 m from the lantern/ },
]);
const line = (check, why) => redLine('f', check, why);

describe('compareReds', () => {
  it('passes a run that shows every recorded red once, each with its reason', () => {
    expect(compareReds('f', REC, [line('slot', 'no lantern slot on the hotbar'), line('near', 'a death 12 m from the lantern rose 20 m from it')])).toBeNull();
  });

  it('a green run while listed fails, naming the units', () => {
    expect(compareReds('f', REC, [])).toMatch(/^\(f\) is GREEN while AWAITS still lists it \(L2, N8\)/);
  });

  it('every recorded check must show: one that went green is named', () => {
    expect(compareReds('f', REC, [line('slot', 'no lantern slot on the hotbar')])).toMatch(/near \(N8\) showed no red: it is green now/);
  });

  it('an extra red, a red twice, and a red with another reason each fail', () => {
    expect(compareReds('f', REC, [line('slot', 'no lantern slot'), line('near', 'a death 12 m from the lantern'), line('mine', 'did not mine')]))
      .toMatch(/mine is red and the record holds no such check/);
    expect(compareReds('f', REC, [line('slot', 'no lantern slot'), line('slot', 'no lantern slot'), line('near', 'a death 12 m from the lantern')]))
      .toMatch(/slot red twice/);
    expect(compareReds('f', REC, [line('slot', 'the slot is there but empty'), line('near', 'a death 12 m from the lantern')]))
      .toMatch(/slot \(L2\) is not its recorded/);
  });

  it('a red under the wrong check, or another beat\'s red, fails', () => {
    // The reason of `near` written under `slot`: matching the whole line would pass it.
    expect(compareReds('f', REC, [line('slot', 'a death 12 m from the lantern'), line('near', 'no lantern slot')])).toMatch(/slot \(L2\) is not its recorded/);
    expect(compareReds('f', REC, [redLine('g', 'slot', 'no lantern slot'), line('near', 'a death 12 m from the lantern')])).toMatch(/not a red of \(f\)/);
  });
});

describe('staleReds', () => {
  it('names every listed red whose unit has landed, and nothing while none has', () => {
    const awaits = { f: REC, g: [{ unit: 'L2', check: 'slot', reason: /x/ }, { unit: 'N2', check: 'hook', reason: /y/ }] };
    expect(staleReds(awaits, new Set())).toEqual([]);
    expect(staleReds(awaits, new Set(['N2'])).map((s) => `${s.beat}.${s.check}`)).toEqual(['g.hook']);
    expect(staleReds(awaits, new Set(['L2', 'N8'])).map((s) => `${s.beat}.${s.check}`), 'every landed unit\'s red').toEqual(['f.slot', 'f.near', 'g.slot']);
    expect(staleReds(awaits, new Set(['N8']))[0].why).toMatch(/N8 has landed: run the beat with FIRST_NIGHT_AWAITING=1/);
  });

  it('a beat with no red is named', () => {
    expect(staleReds({ c: [] }, new Set())).toEqual([{ beat: 'c', why: '(c) is listed with no red: delete its entry' }]);
  });
});

describe('the record', () => {
  it('lists only the eight beats, a check once per beat, and a probe for every unit it names', () => {
    expect(Object.keys(AWAITS).filter((id) => !BEATS.includes(id))).toEqual([]);
    for (const [id, reds] of Object.entries(AWAITS)) {
      const checks = reds.map((r) => r.check);
      expect(new Set(checks).size, `(${id}) names a check twice: ${checks}`).toBe(checks.length);
      for (const r of reds) expect(r.reason, `(${id}) ${r.check}`).toBeInstanceOf(RegExp);
    }
    const units = [...new Set(Object.values(AWAITS).flatMap(unitsOf))];
    expect(units.filter((u) => !LANDED[u]), 'a unit with no landing probe').toEqual([]);
  });
});
