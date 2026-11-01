import { describe, it, expect } from 'vitest';
import { skySteps, firstCut, medianFrameSec } from '../e2e/_firstNightSky.js';

/**
 * WHAT BEAT (e) COUNTS AS A CUT IN THE SKY (tests/e2e/first-night.spec.js (e) through tests/e2e/_firstNightSky.js;
 * DECISIONS 2026-11-01 (W3-A PR C) item 492). Phase 1 read a cut as the sun's height jumping 0.15 in one frame, which a
 * followed rush also does on a page drawing a few frames a second. Driven here on logs of the sky's clock at 60 and at
 * 5 frames a second: a followed rush is never a cut, a 60-unit snap always is, and a wrap past the cycle's end is not.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 2 tests, each observed RED:
 *   S1 plausible-wrong: the pan's bound fixed at a 60 fps frame's (no frame time) -> "a followed rush is never a cut"
 *   S2 the wrap dropped -> both tests (the rush's log crosses the cycle's end too)
 *   S3 plausible-wrong: a cut read only above 60 units (the snap's own size) -> "a 60-unit snap is a cut"
 *   I0 identity (a comment edit in _firstNightSky.js) SURVIVED.
 *
 * NOT CHECKED HERE: the sky in the game (N6a builds the followed rush; the beat reads it there).
 */
const UNITS = 1200;
const RATE = 60;
/** A log of the sky's clock from `units0`, `fps` frames a second for `sec`, moved by `step(i)` units each frame. */
const logOf = (units0, fps, sec, step) => {
  const out = [];
  let u = units0;
  for (let i = 0; i <= fps * sec; i++) {
    out.push({ at: (i * 1000) / fps, cycle: (((u % UNITS) + UNITS) % UNITS) / UNITS });
    u += step(i);
  }
  return out;
};

describe('a cut in the sky', () => {
  it('a followed rush is never a cut, at 60 or at 5 frames a second', () => {
    for (const fps of [60, 5]) {
      const steps = skySteps(logOf(1100, fps, 4, () => RATE / fps), UNITS, RATE);
      expect(firstCut(steps), `a followed rush is never a cut (${fps} fps)`).toBeNull();
      expect(medianFrameSec(steps)).toBeCloseTo(1 / fps, 6);
    }
  });

  it('a 60-unit snap is a cut at either rate, and a wrap past the cycle\'s end is not a cut', () => {
    for (const fps of [60, 5]) {
      const snap = skySteps(logOf(1100, fps, 2, (i) => (i === fps ? 60 : 2.5 / fps)), UNITS, RATE);
      expect(firstCut(snap)?.du, `a 60-unit snap is a cut (${fps} fps)`).toBeCloseTo(60, 6);
    }
    const wrap = skySteps(logOf(1195, 60, 1, () => 1), UNITS, RATE);
    expect(firstCut(wrap), 'a wrap past the cycle\'s end is not a cut').toBeNull();
    expect(skySteps([{ at: 0, cycle: null }, { at: 16, cycle: 0.5 }], UNITS, RATE), 'a frame with no clock is not read').toEqual([]);
  });
});
