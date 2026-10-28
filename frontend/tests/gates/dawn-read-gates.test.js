import { describe, it, expect } from 'vitest';
import { judgeDawnRead, MOVED, FAST_S, UPS } from './_dawnRead.js';
import { followSkyClock, makeSkyClock } from '../../src/render/skyClock.js';
import { liveCycle, sampleMood } from '../../src/render/mood.js';

/**
 * THE DAWN READ'S VERDICT, DRIVEN (round-2 review of the light-colour lane, MED).
 *
 * tests/e2e/light-script.spec.js samples every drawn frame for six seconds from dawn and decides whether the sky
 * ramps between the 1 Hz clock's ticks. Its verdict counted EVERY pair of frames sharing one game-second, including
 * pairs where the sky had already caught up with the clock, which are still by design: a following sky drawn as a
 * long frame and then a short one reads "no change" and failed as if it stepped. The verdict now lives in
 * tests/gates/_dawnRead.js, so it can be driven here with frames whose answer is known by construction: each fixture is
 * the REAL followSkyClock (or the stepped clock) at chosen frame times, read the way the e2e reads it.
 *
 * Fixtures (the ticker adds UPS at every whole second; a frame's clock is its R3F time in seconds):
 *   follow60     a following sky at 60 fps                                    -> pass
 *   step60       the stepped sky (liveCycle(gameTime)) at 60 fps                -> fail (on the clock after a tick)
 *   step60race   the same, every tick read after a frame that predates it       -> fail (the old count PASSED it)
 *   follow1_8    a following sky at 1.8 fps (frames 0.55 s apart: CI's range)   -> pass
 *   longShort    a following sky whose same-second pairs all follow a 1.25 s
 *                frame, so the sky is on the clock in each (THE REVIEW CASE)    -> not measured (the old count FAILED it)
 *   follow0_8    a following sky at 0.8 fps                                     -> not measured
 *   frozenLight  the sky follows, the live key reads the 1 Hz clock            -> fail (the light does not follow)
 *   moodLight    the same, with a decaying mood moving the key for 3 s         -> fail (a moving mood is not the ramp)
 *   staleStart   follow60 with a first sample read before the jump to dawn     -> pass (no false crossing)
 *   doubleTick   two ticks inside one short frame while the sky trailed: a cut   -> pass (not a one-tick crossing)
 *
 * RED FIRST: with the e2e's old inline count copied into the helper, longShort read 'fail' ("no pair moved", 4 pairs)
 * and step60race read 'pass' (6 of 296 pairs "moved": the steps themselves, read across the race).
 *
 * DENOMINATORS: 10 fixtures (asserted); the 60 fps following sky crosses every tick it spans (asserted equal to the
 * ticks counted from the fixture, at least 5) and every one of its behind pairs moves.
 *
 * Mutation-Proof: tests/gates/_dawnRead.js via scripts/dev/mutate.sh (12 tests), 2026-10-28, each RED against a green
 * baseline:
 *   D1  every same-second pair counts (the behind filter dropped)          -> longShort, denominators
 *   D2  no crossing check                                                   -> step60, step60race
 *   D3  no race normalization (frameOf returns the store's clock)           -> step60race
 *   D4  FAST_S 1.5 (a 1.25 s frame counted as fast)                          -> longShort, follow0_8, SETUP
 *   D5  a crossing without the sky-within-a-tick guard                       -> staleStart
 *   D6  no mood filter                                                       -> moodLight
 *   D7  MOVED = 1                                                            -> follow60, follow1_8, staleStart, doubleTick
 *   D8  any clock advance is a crossing (not exactly one tick)               -> doubleTick
 *   D9  "on the clock" read as under half a tick behind                      -> follow1_8
 *   D10 behind pairs that never moved pass                                   -> frozenLight, moodLight
 *   D0  identity (a comment in _dawnRead.js)                                 -> SURVIVED
 *
 * BLIND SPOT: the frames are synthetic. That the running game's samples look like these (the sky's cycle, the store's
 * clock and R3F's clock per drawn frame) is the e2e's, which also proves the stepped sky (SC1e) RED on a real renderer.
 */

/**
 * Frames at `times` (s); `sky` follow | step; `light` sky | clock; `race(T)` true = the read lands after the next tick;
 * `ticks` the real times the ticker fired (default: every whole second).
 */
function frames({ times, sky = 'follow', light = 'sky', race = () => false, mood = () => 0, stale = null, ticks = null }) {
  const c = makeSkyClock();
  let prev = null;
  const out = [];
  if (stale) out.push({ frame: 0, ...stale });
  times.forEach((T, i) => {
    const gameTime = UPS * (ticks ? ticks.filter((k) => k <= T + 1e-9).length : Math.floor(T + 1e-9));
    const dt = prev === null ? 0 : T - prev;
    prev = T;
    const cycle = liveCycle(sky === 'follow' ? followSkyClock(c, gameTime, dt) : gameTime);
    const m = mood(T);
    const key = sampleMood(0, light === 'sky' ? cycle : liveCycle(gameTime)).keyIntensity + m;
    out.push({ frame: i + 1, gameTime: race(T) ? gameTime + UPS : gameTime, cycle, key, mood: m, clock: T });
  });
  return out;
}
const every = (dt, from = 0.05, to = 6) => {
  const t = [];
  for (let T = from; T < to; T += dt) t.push(Math.round(T * 1e6) / 1e6);
  return t;
};
const lastBeforeTick = (T) => T % 1 > 0.97; // the last 60 fps frame before each whole second

const FIXTURES = {
  follow60: { f: frames({ times: every(1 / 60) }), want: 'pass' },
  step60: { f: frames({ times: every(1 / 60), sky: 'step' }), want: 'fail' },
  step60race: { f: frames({ times: every(1 / 60), sky: 'step', race: lastBeforeTick }), want: 'fail' },
  follow1_8: { f: frames({ times: every(0.55) }), want: 'pass' },
  longShort: { f: frames({ times: [0.05, 1.3, 1.6, 2.85, 2.95, 4.2, 4.5, 5.75, 5.85] }), want: 'not-measured' },
  follow0_8: { f: frames({ times: every(1.25) }), want: 'not-measured' },
  frozenLight: { f: frames({ times: every(1 / 60), light: 'clock' }), want: 'fail' },
  moodLight: { f: frames({ times: every(1 / 60), light: 'clock', mood: (T) => (T < 3 ? 0.01 * (3 - T) * 60 : 0) }), want: 'fail' },
  // The sampler's first read is synchronous: the store already says dawn, the sky still shows the midnight it drew.
  staleStart: { f: frames({ times: every(1 / 60), stale: { gameTime: 0, cycle: 0.75, key: 0.3, mood: 0, clock: 0.01 } }), want: 'pass' },
  // A late tick and the next on time inside one 0.2 s frame while the sky trailed: two ticks plus the lag is past
  // SKY_CLOCK_SNAP, so the following sky CUTS to the clock there by design. Not a one-tick crossing, never a fail.
  doubleTick: { f: frames({ times: [...every(1 / 60, 0.05, 2.85), 3.05, ...every(1 / 60, 3.0667, 6)], ticks: [1, 2, 2.9, 3, 4, 5] }), want: 'pass' },
};

describe('the dawn read counts only what a following sky is forced to show', () => {
  it('SETUP: ten fixtures, each with frames after a tick', () => {
    const names = Object.keys(FIXTURES);
    expect(names.length).toBe(10);
    for (const n of names) expect(FIXTURES[n].f.some((s) => s.gameTime > 0), `${n} never ticks`).toBe(true);
    expect(MOVED).toBeGreaterThan(0);
    expect(FAST_S).toBeLessThan(1); // a frame a second long catches a following sky up: it cannot tell the two apart
  });

  it.each(Object.keys(FIXTURES))('%s', (name) => {
    const { f, want } = FIXTURES[name];
    const read = judgeDawnRead(f);
    expect(read.verdict, `${name}: ${read.reason} ${JSON.stringify(read.counts)}`).toBe(want);
  });

  it('the verdict carries its denominators: a 60 fps following sky crosses every tick behind the clock and moves in its pairs', () => {
    const { f } = FIXTURES.follow60;
    const read = judgeDawnRead(f);
    const ticks = new Set(f.map((s) => s.gameTime)).size - 1; // every tick the frames span, each drawn 1/60 s after the last
    expect(ticks).toBeGreaterThanOrEqual(5);
    expect(read.counts.crossings, JSON.stringify(read.counts)).toBe(ticks);
    expect(read.counts.onClock).toBe(0);
    expect(read.counts.behindPairs).toBeGreaterThan(200);
    expect(read.counts.moved).toBe(read.counts.behindPairs);
  });
});
