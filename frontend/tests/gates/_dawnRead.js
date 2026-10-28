// _dawnRead.js — the verdict of the dawn read in tests/e2e/light-script.spec.js, over the frames it sampled. PURE, so
// tests/gates/dawn-read-gates.test.js drives it with frames whose answer is known by construction (gates-and-probes 4b).
//
// THE READ. The game clock is a 1 Hz step (+UPS each second) and the sky follows it every frame (render/skyClock.js),
// at the clock's own rate, never past it. Each sample is one drawn frame: the store's gameTime, the sky's OWN rendered
// cycle (Atmosphere's readSkyLight.cycle), the live key light, the mood, and R3F's clock (the frame's time in seconds,
// so the clock difference of two samples is the real time the sky was given between them).
//
// TWO MEASUREMENTS, each counted only where a following sky is FORCED to show it:
//   CROSSINGS  a frame that saw a one-tick advance of the clock, drawn under FAST_S after the frame before it, with the
//              sky within a tick of the clock at that frame. A following sky is still BEHIND the clock there (it moved
//              under FAST_S of the tick's second); a stepped sky sits ON it. One on the clock is a FAIL.
//   PAIRS      two consecutive frames inside one game-second, the mood still, the sky BEHIND the clock at the first.
//              Only such a pair has to move: once the sky has caught up it is still by design, and counting those
//              pairs let a following sky read "no change" (round-2 review, MED). At least one must move the key > MOVED.
// NEITHER IS NOT MEASURED: below the frame-rate floor (a frame a second or longer catches a following sky up, so it and
// the stepped sky draw the same frames). Reported as such, never as a pass and never as a fail.
//
// "Behind" is read from the sky's own cycle against the store's clock: the lag in cycles, 0 = on the clock. The store
// is read when the sample is taken, which can be just after a tick the drawn frame predates (a frame drawn by R3F's
// own loop is sampled on the next vsync, after that turn's tasks). Such a reading sits a whole tick or more behind, and
// is placed on the tick its frame drew: a stepped sky read that way is ON its clock, never "behind".
import { GAME_UNITS_PER_SECOND, CYCLE_UNITS } from '../../src/game/dayNight.js';
import { cycleFraction } from '../../src/game/dayPhase.js';

export const UPS = GAME_UNITS_PER_SECOND;
/** One tick of the clock, in cycles. */
export const TICK = UPS / CYCLE_UNITS;
/** A crossing drawn this soon after the frame before it leaves a following sky at least 1 - FAST_S of a tick behind. */
export const FAST_S = 0.9;
/** The live key must move more than this between two frames of a pair for the pair to count as moved. */
export const MOVED = 1e-4;
/** A pair whose mood moved more than this is not read: the mood's own lerp moves the key every frame. */
export const STILL = 1e-6;
const EPS = 1e-9;

// The sky never leads the clock (followSkyClock clamps to it, and cycleFraction is monotone within a cycle), so the
// lag is in [0, 1) and a stepped sky's is exactly 0.
const lagOf = (gameTime, cycle) => (((cycleFraction(gameTime) - cycle) % 1) + 1) % 1;

/** The clock the sample's frame drew at, and how far the sky trailed it (cycles). */
export function frameOf(s) {
  const lag = lagOf(s.gameTime, s.cycle);
  if (lag < TICK - EPS) return { gameTime: s.gameTime, lag };
  return { gameTime: s.gameTime - UPS, lag: lagOf(s.gameTime - UPS, s.cycle) };
}

/**
 * @param {{ gameTime: number, cycle: number, key: number, mood: number, clock: number }[]} samples one per drawn frame
 * @returns {{ verdict: 'pass'|'fail'|'not-measured', reason: string, counts: object }}
 */
export function judgeDawnRead(samples) {
  const fr = samples.map(frameOf);
  const crossings = [];
  const pairs = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], fa = fr[i - 1], fb = fr[i];
    const dt = b.clock - a.clock;
    if (fb.gameTime - fa.gameTime === UPS && fa.lag < TICK - EPS && dt < FAST_S) crossings.push({ i, dt, lag: fb.lag });
    if (fa.gameTime === fb.gameTime && Math.abs(a.mood - b.mood) < STILL) pairs.push({ i, behind: fa.lag > EPS, step: Math.abs(b.key - a.key) });
  }
  const onClock = crossings.filter((c) => c.lag <= EPS);
  const behind = pairs.filter((p) => p.behind);
  const moved = behind.filter((p) => p.step > MOVED);
  const counts = {
    samples: samples.length, firstTick: samples.findIndex((s) => s.gameTime !== samples[0]?.gameTime),
    crossings: crossings.length, onClock: onClock.length, pairs: pairs.length, behindPairs: behind.length, moved: moved.length,
  };
  if (onClock.length) {
    const at = onClock.slice(0, 3).map((c) => `sample ${c.i} (${c.dt.toFixed(3)} s after the frame before)`).join(', ');
    return { verdict: 'fail', counts, reason: `the sky sat ON the clock right after a tick in ${onClock.length} of ${crossings.length} frames drawn under ${FAST_S} s after the one before (${at}); a following sky is still behind there: it steps with the 1 Hz clock` };
  }
  if (behind.length) {
    if (moved.length) return { verdict: 'pass', counts, reason: `${moved.length} of ${behind.length} same-second pairs with the sky behind the clock moved the live key` };
    const steps = behind.slice(0, 6).map((p) => p.step.toFixed(6)).join(' ');
    return { verdict: 'fail', counts, reason: `the sky was behind the clock in ${behind.length} same-second pairs and the live key moved over ${MOVED} in none (steps ${steps}): the light does not follow the sky` };
  }
  return {
    verdict: 'not-measured', counts,
    reason: `no two frames of one game-second with the sky still behind the clock (${pairs.length} same-second pairs, none with the sky behind) and ${crossings.length} frames drawn under ${FAST_S} s after a tick: the renderer draws below the floor here`,
  };
}
