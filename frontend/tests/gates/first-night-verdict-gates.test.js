import { describe, it, expect } from 'vitest';
import {
  FIRST_NIGHT_BEATS, PRESSURE_BAND, beatVerdicts, pressureVerdict, firstNightVerdict, aimStep, tickBeats, isHornKey, exitCodeFor, CouldNotCheck, EXIT,
} from '../../scripts/visual/_firstNight.mjs';
import { applyLook } from '../../src/input/touchMath.js';

/**
 * THE FIRST NIGHT PROBE'S VERDICT (scripts/visual/first-night.mjs through scripts/visual/_firstNight.mjs; the W3-A
 * brief's acceptance 2; DECISIONS 2026-11-01 (W3-A PR C) item 484). The probe plays ten minutes in real time and exits
 * non-zero when a beat misses or the pressure leaves its band; that decision is pure, so it is driven here on logs whose
 * answer is known by construction, each edge from both sides. The pointer step that aims the eye is checked against the
 * game's own look maths (input/touchMath.js applyLook), not against a copy of itself.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 6 tests, each observed RED:
 *   V1 the kindle's deadline inclusive the wrong way (< for <=) -> "each beat at its edge"
 *   V2 plausible-wrong: the horn's window read from the wrong side (t - at <= within, no abs) -> the same
 *   V3 a second horn not counted against the beat -> "two horns miss"
 *   V4 the beast read from the first entry, not the longest hold -> "the longest hold"
 *   V5 the health band's top edge dropped -> "the pressure band"
 *   V6 plausible-wrong: a build with no flame passes the flame -> "no flame is a miss"
 *   V7 aimStep's sign flipped on the pitch -> "turns the real look toward the target"
 *   V8 the step not clamped -> "at most maxPx a step"
 *   I0 identity (a comment edit in _firstNight.mjs) SURVIVED.
 *
 * NOT CHECKED HERE: whether the probe's log is true of the game (it reads the lookbook seam, tests/e2e/lookbook-seam.spec.js
 * case 5), and whether a lived night lands in band (that is the run, judged by a reviewer).
 */
const GOOD_LOG = [
  { beat: 'kindle', t: 58 }, { beat: 'horn', t: 241 }, { beat: 'beast', t: 300, heldSec: 9 }, { beat: 'beast', t: 400, heldSec: 14 },
  { beat: 'dawn', t: 470 },
];
const GOOD_PRESSURE = { lowestHealth: 0.5, engagedSec: 90, flameLow: 0.5, flameAtDawn: 0.5 };
const byId = (vs) => Object.fromEntries(vs.map((v) => [v.id, v.ok]));

describe('the beats', () => {
  it('a good night shows all four, the longest hold counting', () => {
    expect(FIRST_NIGHT_BEATS.map((b) => b.id)).toEqual(['kindle', 'horn', 'beast', 'dawn']);
    expect(byId(beatVerdicts(GOOD_LOG))).toEqual({ kindle: true, horn: true, beast: true, dawn: true });
    expect(byId(beatVerdicts([{ beat: 'beast', t: 1, heldSec: 14 }, { beat: 'beast', t: 2, heldSec: 3 }])).beast, 'the longest hold').toBe(true);
  });

  it('each beat at its edge, from both sides', () => {
    const at = (beat, t, extra = {}) => byId(beatVerdicts([{ beat, t, ...extra }]))[beat];
    expect([at('kindle', 60), at('kindle', 60.1)]).toEqual([true, false]);
    expect([at('horn', 237), at('horn', 243), at('horn', 236.9), at('horn', 243.1)]).toEqual([true, true, false, false]);
    expect([at('beast', 1, { heldSec: 13.5 }), at('beast', 1, { heldSec: 13.4 })]).toEqual([true, false]);
    expect([at('dawn', 485), at('dawn', 485.1)]).toEqual([true, false]);
  });

  it('two horns miss, and a beat never seen misses', () => {
    expect(byId(beatVerdicts([{ beat: 'horn', t: 240 }, { beat: 'horn', t: 241 }])).horn, 'two horns miss').toBe(false);
    expect(byId(beatVerdicts([]))).toEqual({ kindle: false, horn: false, beast: false, dawn: false });
  });
});

describe('the pressure band', () => {
  it('health inside the band, engagement over its floor; each edge from both sides', () => {
    const health = (h) => byId(pressureVerdict({ ...GOOD_PRESSURE, lowestHealth: h })).lowestHealth;
    expect([health(0.3), health(0.85), health(0.29), health(0.86), health(NaN)]).toEqual([true, true, false, false, false]);
    const engaged = (s) => byId(pressureVerdict({ ...GOOD_PRESSURE, engagedSec: s })).engaged;
    expect([engaged(PRESSURE_BAND.engagedSec), engaged(PRESSURE_BAND.engagedSec - 1)]).toEqual([true, false]);
  });
  it('the flame must dip and hold; no flame is a miss', () => {
    const flame = (low, dawn) => byId(pressureVerdict({ ...GOOD_PRESSURE, flameLow: low, flameAtDawn: dawn })).flame;
    expect([flame(0.5, 0.25), flame(1, 1), flame(0.5, 0), flame(null, null)]).toEqual([true, false, false, false]);
  });
});

describe('the verdict', () => {
  it('ok only when every beat and every number holds, misses listed first', () => {
    expect(firstNightVerdict({ log: GOOD_LOG, pressure: GOOD_PRESSURE }).ok).toBe(true);
    const missed = firstNightVerdict({ log: GOOD_LOG.slice(1), pressure: GOOD_PRESSURE });
    expect(missed.ok).toBe(false);
    expect(missed.lines[0]).toMatch(/^MISS beat kindle/);
    expect(firstNightVerdict({ log: GOOD_LOG, pressure: { ...GOOD_PRESSURE, lowestHealth: 0.95 } }).ok).toBe(false);
  });
});

describe('aimStep', () => {
  it('turns the real look toward the target, and at most maxPx a step', () => {
    // The game's look from a camera facing north, level: yaw 0, pitch 0 (heading = -yaw in degrees, pitch = rotation.x).
    const look = (from, step) => {
      const r = applyLook((-from.heading * Math.PI) / 180, (from.pitch * Math.PI) / 180, step.dx, step.dy, 1);
      return { heading: ((-r.yaw * 180) / Math.PI + 360) % 360, pitch: (r.pitch * 180) / Math.PI };
    };
    const from = { heading: 10, pitch: 0 };
    const to = { heading: 30, pitch: -12 };
    const s = aimStep(from, to, { maxPx: 10000 });
    const landed = look(from, s);
    expect(landed.heading).toBeCloseTo(30, 6);
    expect(landed.pitch).toBeCloseTo(-12, 6);
    expect(aimStep({ heading: 350, pitch: 0 }, { heading: 10, pitch: 0 }, { maxPx: 10000 }).dx, 'the short way round').toBeGreaterThan(0);
    const capped = aimStep(from, { heading: 190, pitch: 60 }, { maxPx: 50 });
    expect([Math.abs(capped.dx), Math.abs(capped.dy)]).toEqual([50, 50]);
  });
});

// THE TICK, THE FLAME'S DECLARATION AND THE EXIT CODE (DECISIONS 2026-11-01 (W3-A PR C) item 489). The probe's loop hands
// each tick's readings to tickBeats; what it logs is the beat log the verdict above reads.
//
// Mutation-Proof: via scripts/dev/mutate.sh, 4 tests, each observed RED:
//   T1 the kindle logged on any lit reading (no cold one before it) -> "the kindle is a transition from cold"
//   T2 plausible-wrong: the horn read off the clock's flip, as phase 1 did -> "the horn is the notice, never the flip"
//   T3 the declaration passes a flame that dipped -> "declared off, the flame must not dip"
//   T4 a crash given the miss code -> "a crash is never a miss"
//   I0 identity (a comment edit in _firstNight.mjs) SURVIVED.
const reading = (t, n, horns = 0) => ({ t, n: { isDay: true, nightCount: 0, hearthLit: null, gameTime: 0, siege: null, ...n }, horns });

describe('tickBeats', () => {
  it('the kindle is a transition from cold: a lit first reading, or lit after unknown, logs none', () => {
    expect(tickBeats(reading(1, { hearthLit: false }), reading(2, { hearthLit: true }))).toEqual([{ beat: 'kindle', t: 2 }]);
    expect(tickBeats(null, reading(1, { hearthLit: true })), 'the first tick').toEqual([]);
    expect(tickBeats(reading(1, { hearthLit: null }), reading(2, { hearthLit: true })), 'lit after a build with no field').toEqual([]);
    expect(tickBeats(reading(1, { hearthLit: true }), reading(2, { hearthLit: true }))).toEqual([]);
  });

  it('the horn is the notice, never the flip: the flip logs as dusk, and each new notice as a horn', () => {
    const flip = tickBeats(reading(239, { isDay: true }), reading(240, { isDay: false, nightCount: 1, gameTime: 600 }));
    expect(flip.map((e) => e.beat), 'the clock flipped with no notice').toEqual(['dusk']);
    const horn = tickBeats(reading(240, { isDay: false, nightCount: 1 }, 0), reading(241, { isDay: false, nightCount: 1, gameTime: 602 }, 1));
    expect(horn).toEqual([{ beat: 'horn', t: 241, night: 1, clock: 602 }]);
    expect(tickBeats(reading(1, {}, 1), reading(2, {}, 3)).map((e) => e.beat), 'two notices in one tick are two horns').toEqual(['horn', 'horn']);
  });

  it('dawn and each new wave, once', () => {
    expect(tickBeats(reading(1, { isDay: false, nightCount: 1 }), reading(2, { isDay: true, nightCount: 1 })).map((e) => e.beat)).toEqual(['dawn']);
    expect(tickBeats(reading(1, { siege: { wave: 1 } }), reading(2, { siege: { wave: 2 } }))).toEqual([{ beat: 'wave', t: 2, wave: 2 }]);
    expect(tickBeats(reading(1, { siege: { wave: 2 } }), reading(2, { siege: { wave: 2 } }))).toEqual([]);
  });

  it('isHornKey reads the siege tiers and nothing else', () => {
    expect(['notice.siege.first', 'notice.siege.relentless', 'notice.siegeWarning', 'notice.dusk', ''].map(isHornKey)).toEqual([true, true, false, false, false]);
  });
});

describe('the flame, declared off', () => {
  it('declared off, the flame must not dip: a flat or absent flame passes, a dip misses', () => {
    const flame = (p) => byId(pressureVerdict({ ...GOOD_PRESSURE, flameOff: true, ...p })).flame;
    expect([flame({ flameLow: 1, flameAtDawn: 1 }), flame({ flameLow: null, flameAtDawn: null }), flame({ flameLow: 0.75, flameAtDawn: 0.75 })])
      .toEqual([true, true, false]);
    expect(byId(pressureVerdict({ ...GOOD_PRESSURE, flameLow: 1, flameAtDawn: 1 })).flame, 'undeclared, a flat flame still misses').toBe(false);
  });
});

describe('the exit code', () => {
  it('a crash is never a miss: COULD NOT CHECK is 3, any other error 2', () => {
    expect(exitCodeFor(new CouldNotCheck('no build'))).toBe(EXIT.couldNotCheck);
    expect(exitCodeFor(new Error('page.goto: net::ERR_UNSAFE_PORT'))).toBe(EXIT.crashed);
    expect(EXIT).toEqual({ pass: 0, miss: 1, crashed: 2, couldNotCheck: 3 });
  });
});
