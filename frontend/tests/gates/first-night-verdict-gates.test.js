import { describe, it, expect } from 'vitest';
import { FIRST_NIGHT_BEATS, PRESSURE_BAND, beatVerdicts, pressureVerdict, firstNightVerdict, aimStep } from '../../scripts/visual/_firstNight.mjs';
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
