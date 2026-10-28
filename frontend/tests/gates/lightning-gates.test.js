import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  MIN_STRIKE_GAP_MS, STRIKE_SPREAD_MS, FLASH_ATTACK_MS, FLASH_END_MS, FLASH_PEAK, FLASH_COLOR, FLASH_HEMI_GAIN,
  nextStrikeIn, flashAt, flashLight, thunderDelayMs, hemiWithFlash,
} from '../../src/game/lightning.js';
import { sampleMood, MOOD_GRADE } from '../../src/render/mood.js';
import { sharedVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';

/**
 * STORM LIGHTNING, the pure part (plan 2026-09-23-crafty-storm-lightning, Task 1; EXTERNAL-BASELINE-R2 #4).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   N1 the strike floor dropped (strikes may come back to back) -> the spacing case
 *   N2 plausible-wrong: thunder delay in the wrong unit (m / 343, seconds read as ms) -> the delay case
 *   N3 the capture gate dropped -> the no-strike case
 *   N4 the envelope never returns to dark -> the envelope case
 *   N5 the juice dial ignored (0 still flashes — the photosensitivity control) -> the dial case
 *   and N0, an identity mutant (a comment edit in lightning.js, same harness and batch), SURVIVED.
 * The hemisphere (2026-10-27: at night the flash never lit the ground — it scaled the night sky's blue, and the ground
 * stayed under the night grade's black point), same harness, each observed RED:
 *   H1 the flash not added to the hemisphere (f = 0) -> "the flash is not in the sky term" and the night case
 *   H2 plausible-wrong: the first version — the flash as intensity on the sky's own colour -> "the flash is not in
 *      the sky term" and the night case
 *   H3 plausible-wrong: the flash colour is the night sky's (#2E4A6E) -> the night case
 *   H4 plausible-wrong: the gain at 1 (the flash at FLASH_PEAK of white) -> the night case
 *   H5 the ground term left un-normalised (the bolt lights the ground bounce too) -> "the ground bounce moved"
 *   H6 plausible-wrong: with no flash, intensity + 1e-6 (not byte-identical) -> "a frame with no flash moved"
 *   and H0, an identity mutant (a comment edit in lightning.js), SURVIVED.
 *
 * BLIND SPOT: nothing here renders or plays. Whether the driver reaches the light and the voice is Task 3's e2e
 * (tests/e2e/lightning.spec.js), which is also the lived proof that the ground brightens; the night case below is a
 * MODEL of three's Lambert indirect term (irradiance x albedo / pi) through the grade's own formula, not a render.
 */
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('the schedule', () => {
  it('never closer than the floor, never further than floor + spread, averaging inside the band', () => {
    const rng = seeded(7);
    const gaps = Array.from({ length: 2000 }, () => nextStrikeIn(rng, { storm: true, capture: false }));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_STRIKE_GAP_MS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(MIN_STRIKE_GAP_MS + STRIKE_SPREAD_MS);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(8000);
    expect(mean).toBeLessThan(20000);
  });
  it('no strike in a clear sky, and none under capture — even in a storm', () => {
    const rng = seeded(3);
    expect(nextStrikeIn(rng, { storm: false, capture: false })).toBe(Infinity);
    expect(nextStrikeIn(rng, { storm: true, capture: true })).toBe(Infinity);
  });
});

describe('the flash', () => {
  it('dark at the strike, lit within 60 ms, dark again by FLASH_END_MS, and dark after', () => {
    expect(flashAt(0)).toBe(0);
    let peak = 0;
    for (let t = 0; t <= 60; t += 5) peak = Math.max(peak, flashAt(t));
    expect(peak).toBeGreaterThan(0.9);
    expect(flashAt(FLASH_END_MS)).toBe(0);
    for (const t of [FLASH_END_MS + 1, 1000, 60000]) expect(flashAt(t)).toBe(0);
    expect(flashAt(-5), 'a strike in the future is dark').toBe(0);
    for (let t = 0; t < FLASH_END_MS; t += 3) {
      expect(flashAt(t)).toBeGreaterThanOrEqual(0);
      expect(flashAt(t)).toBeLessThanOrEqual(1);
    }
  });
  it('the juice dial scales the light, and 0 is none at all', () => {
    expect(flashLight(40, 1)).toBeCloseTo(FLASH_PEAK, 6);
    expect(flashLight(40, 0.5)).toBeCloseTo(FLASH_PEAK / 2, 6);
    expect(flashLight(40, 0)).toBe(0);
  });
});

describe('the flash on the hemisphere light — white sky light, never the night sky\'s blue turned up', () => {
  const rgb = (c) => [c.r, c.g, c.b];
  const fresh = () => ({ color: new THREE.Color(), groundColor: new THREE.Color(), intensity: 0 });
  const flashCol = new THREE.Color(FLASH_COLOR);
  // Three moods with different sky hues (day, night, boss): a check against one hue cannot tell "add white" from
  // "scale the sky's own colour".
  const moods = [0, 1, 2].map((mood) => {
    const m = sampleMood(mood);
    return { mood, sky: m.hemiSky.clone(), ground: m.hemiGround.clone(), intensity: m.hemiIntensity };
  });

  it('with no flash it writes exactly the mood — a frame without one is byte-identical to before', () => {
    for (const { mood, sky, ground, intensity } of moods) {
      for (const flash of [0, -1]) {
        const out = hemiWithFlash(fresh(), sky, ground, intensity, flash, flashCol);
        const why = `a frame with no flash moved (mood ${mood}, flash ${flash})`;
        expect(rgb(out.color), why).toEqual(rgb(sky));
        expect(rgb(out.groundColor), why).toEqual(rgb(ground));
        expect(out.intensity, why).toBe(intensity);
      }
    }
  });

  it('a flash adds FLASH_COLOR x flash x gain to the sky term, in every mood, and leaves the ground bounce alone', () => {
    let checked = 0;
    for (const { mood, sky, ground, intensity } of moods) {
      for (const flash of [0.2, 1, FLASH_PEAK]) {
        const out = hemiWithFlash(fresh(), sky, ground, intensity, flash, flashCol);
        const f = flash * FLASH_HEMI_GAIN;
        for (const k of ['r', 'g', 'b']) {
          expect(out.color[k] * out.intensity, `the flash is not in the sky term (mood ${mood}, flash ${flash}, ${k})`)
            .toBeCloseTo(sky[k] * intensity + flashCol[k] * f, 6);
          expect(out.groundColor[k] * out.intensity, `the ground bounce moved (mood ${mood}, flash ${flash}, ${k})`)
            .toBeCloseTo(ground[k] * intensity, 6);
        }
        checked += 1;
      }
    }
    expect(checked).toBe(9);
  });

  it('at midnight the peak flash alone takes an up-facing grass face past the night grade\'s black point', () => {
    // The night grade (postprocessing's BrightnessContrastEffect: y = (x + b - 0.5) / (1 - c) + 0.5, installed
    // node_modules/postprocessing/build/index.js) maps every linear value below 0.5c - b to black. Dusk: 0.08.
    const { brightness: b, contrast: c } = MOOD_GRADE.dusk;
    const blackPoint = 0.5 * c - b;
    expect(blackPoint, 'SETUP: the dusk grade has no black point to clear').toBeGreaterThan(0);
    // The grass tile's mean linear albedo, from the REAL bytes the terrain samples.
    const tex = sharedVoxelTextures();
    const S = tex.image.width, d = tex.image.data;
    const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); // the sRGB EOTF
    const albedo = [0, 0, 0];
    for (let i = 0; i < S * S; i++) {
      const o = (BLOCK_ID.grass * S * S + i) * 4;
      for (let k = 0; k < 3; k++) albedo[k] += toLinear(d[o + k] / 255) / (S * S);
    }
    expect(albedo[1], 'SETUP: the grass tile is not green').toBeGreaterThan(albedo[0]);
    const { sky, ground, intensity } = moods[1];
    const lit = hemiWithFlash(fresh(), sky, ground, intensity, flashLight(FLASH_ATTACK_MS, 1), flashCol); // the peak
    const dark = hemiWithFlash(fresh(), sky, ground, intensity, 0, flashCol);
    // An up-facing face sees the hemisphere's sky term; three's indirect diffuse is irradiance x albedo / pi.
    const added = ['r', 'g', 'b'].map((k, i) => (lit.color[k] * lit.intensity - dark.color[k] * dark.intensity) * albedo[i] / Math.PI);
    const strongest = Math.max(...added);
    expect(strongest, `the peak flash adds ${strongest.toFixed(4)} linear to the grass face, under the night grade's black point ${blackPoint.toFixed(3)} x 1.25 — the ground stays black: ${added.map((x) => x.toFixed(4))}`)
      .toBeGreaterThan(blackPoint * 1.25);
  });
});

describe('the thunder', () => {
  it('arrives a second after the flash for a strike 343 m away, and in proportion', () => {
    expect(thunderDelayMs(343)).toBeCloseTo(1000, 6);
    expect(thunderDelayMs(686)).toBeCloseTo(2000, 6);
    expect(thunderDelayMs(0)).toBe(0);
    expect(thunderDelayMs(-10)).toBe(0);
  });
});
