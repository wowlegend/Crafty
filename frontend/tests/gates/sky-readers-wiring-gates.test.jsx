// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';

/**
 * THE SKY FRAME'S READERS, DRIVEN (review of the light-colour lane, 2026-10-27, MED: no gate saw this wiring).
 *
 * Task 3b made every sky reader read the one published frame (render/mood.js skyFrameRef). The sky-readers gate proves
 * by source text that only Atmosphere calls sampleMood; nothing proved what each reader DOES with the frame, and the
 * review's mutants on that wiring all survived the suite. Each reader here is mounted through R3F's own reconciler
 * (tests/gates/_r3f.jsx: real THREE objects, a renderer that draws nothing) and stepped, and what its useFrame wrote
 * is read back from the live object:
 *
 *   Sun.jsx            the billboard stands along the frame's SUN direction (not the key's, which is the moon's for
 *                      every s < 0), takes the SUN's colour, and hides once the sun is more than 0.05 under the horizon.
 *                      Read at f 0.512: the sun is just under the horizon and still shown, and the key is the moon, so
 *                      a billboard reading the key is seen in both its direction and its colour.
 *   MoodGradeDriver    the live HueSaturation and BrightnessContrast effects take the frame's grade, all three values,
 *                      at two grades that differ from noon's in every component (midnight's, the boss's).
 *   Atmosphere         the dome's painted moon (uMoonDir) rides the frame's moonDir, read where the moon is far from its
 *                      own noon (the uniform's initial value); and under capture the frame is noon or midnight by
 *                      isDay.
 *
 * Expected values come from the pure functions the frame must agree with (sunArcDirection, moonArcDirection,
 * sampleScript), never from the frame the reader read.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 2026-10-27 — receipts in the commit (the review's names where it had one):
 *   MI the billboard aimed down the key's direction                 -> billboard RED
 *   MJ the billboard takes keyColor                                 -> billboard RED
 *   MH the billboard hides at y 0 instead of -0.05                  -> billboard RED
 *   MG1 MoodGradeDriver drops bc.brightness                         -> grade RED
 *   MG2 MoodGradeDriver drops bc.contrast                           -> grade RED
 *   MQ the grade re-sampled from the script at noon                 -> grade RED
 *   MK the dome's uMoonDir never written                            -> dome RED
 *   W0 identity (a comment edit in Sun.jsx)                         -> SURVIVED
 *
 * BLIND SPOT: nothing is drawn. The dome shader's horizon mask on the painted moon (mutant MT) is GLSL, so it is read
 * on a real renderer by the e2e (tests/e2e/light-script.spec.js, the dome sampler). Whether the App's exitCapture hook
 * still calls setCaptureMode(false) is not driven here (App.jsx cannot be mounted in a unit test).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { Sun } = await import('../../src/render/Sun.jsx');
const { MoodGradeDriver } = await import('../../src/render/MoodGradeDriver.jsx');
const { Atmosphere } = await import('../../src/render/Atmosphere.jsx');
const { EffectComposerContext } = await import('@react-three/postprocessing');
const { sampleMood, publishSkyFrame, skyFrameRef, moodRef, MOOD_SCALARS, MOOD_GRADE } = await import('../../src/render/mood.js');
const { sunArcDirection } = await import('../../src/render/sunArc.js');
const { moonArcDirection, MOON_NOON } = await import('../../src/render/keyLight.js');
const { sampleScript } = await import('../../src/render/colourScript.js');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { enterCaptureMode, exitCaptureMode } = await import('../../src/devtest/captureMode.js');
const { CYCLE_UNITS } = await import('../../src/game/dayNight.js');
const { TIERS } = await import('../../src/render/quality.js');

const NOON_SUN = MOOD_SCALARS.explore.sunPos;
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const angleDeg = (a, b) => {
  const ua = unit(a), ub = unit(b);
  return (Math.acos(Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]))) * 180) / Math.PI;
};

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  exitCaptureMode();
  publishSkyFrame(sampleMood(0)); // leave the module's frame as the module loaded it (the noon frame)
});

describe('the sun billboard reads the SUN from the frame', () => {
  it('stands along sunDir and takes sunColor while the key is the moon (f 0.512: the sun just under the horizon)', async () => {
    const f = 0.512;
    publishSkyFrame(sampleMood(0, f));
    const frame = skyFrameRef.current;
    const sun = sunArcDirection(NOON_SUN, f), sunColor = sampleScript(f).sun.color;
    // The case can see both mutants: the key is the moon, so its direction and colour are not the sun's.
    expect(frame.keyIsMoon, 'SETUP: the key is the sun at this fraction').toBe(true);
    expect(angleDeg(frame.keyDir, sun), 'SETUP: the key and the sun share a direction').toBeGreaterThan(30);
    expect(frame.keyColor.getHex(), 'SETUP: the key and the sun share a colour').not.toBe(sunColor.getHex());
    expect(sun[1], 'SETUP: the sun is not in the shown-below-the-horizon window').toBeLessThan(0);
    expect(sun[1]).toBeGreaterThan(-0.05);

    let mesh = null;
    r = await mountR3F(<Sun onReady={(m) => { mesh = m; }} />);
    await r.step(1);
    expect(mesh?.isMesh, 'SETUP: Sun mounted no mesh').toBe(true);
    const cam = r.three().camera.position;
    const off = mesh.position.clone().sub(cam);
    expect(off.length()).toBeCloseTo(380, 6);
    expect(angleDeg(off.toArray(), sun), 'the billboard is not along the SUN\'s direction').toBeLessThan(1e-4);
    expect(mesh.material.color.getHex(), 'the billboard is not the SUN\'s colour').toBe(sunColor.getHex());
    expect(mesh.visible, 'the billboard hid while the sun was within 0.05 of the horizon').toBe(true);
  });

  it('hides once the sun is more than 0.05 under the horizon, and shows again above that', async () => {
    let mesh = null;
    r = await mountR3F(<Sun onReady={(m) => { mesh = m; }} />);
    const seen = [];
    for (const f of [0.512, 0.52, 0.3]) {
      publishSkyFrame(sampleMood(0, f));
      await r.step(1);
      seen.push([f, sunArcDirection(NOON_SUN, f)[1], mesh.visible]);
    }
    expect(seen.map((s) => s[2]), `visibility by fraction (f, sun y, visible): ${JSON.stringify(seen)}`).toEqual([true, false, true]);
    expect(seen[1][1], 'SETUP: f 0.52 does not put the sun under -0.05').toBeLessThan(-0.05);
  });
});

describe('MoodGradeDriver writes the frame\'s grade onto the live effects', () => {
  it('saturation, brightness and contrast, at two grades that differ from noon\'s in every component', async () => {
    const hue = new HueSaturationEffect(), bc = new BrightnessContrastEffect();
    const composer = { passes: [{ effects: [hue, bc] }] };
    r = await mountR3F(<EffectComposerContext.Provider value={{ composer }}><MoodGradeDriver /></EffectComposerContext.Provider>);
    const noon = sampleScript(0.25).grade;
    let n = 0;
    for (const [label, mood, f] of [['midnight', 0, 0.75], ['the boss', 2, 0.25]]) {
      publishSkyFrame(sampleMood(mood, f));
      const g = { ...skyFrameRef.current.grade };
      for (const k of ['saturation', 'brightness', 'contrast']) {
        expect(Math.abs(g[k] - noon[k]), `SETUP: ${label}'s ${k} equals noon's, so a noon re-sample would pass`).toBeGreaterThan(0.005);
      }
      await r.step(1);
      expect(hue.saturation, `${label}: saturation`).toBeCloseTo(g.saturation, 6);
      expect(bc.brightness, `${label}: brightness`).toBeCloseTo(g.brightness, 6);
      expect(bc.contrast, `${label}: contrast`).toBeCloseTo(g.contrast, 6);
      n++;
    }
    expect(n).toBe(2);
    expect(MOOD_GRADE.obsidian.contrast).toBeCloseTo(bc.contrast, 6); // the last read was the boss's own grade
  });
});

describe('Atmosphere: the dome\'s moon and capture\'s fraction by isDay', () => {
  const shadowConfig = { mapSize: [TIERS.low.shadowMapSize, TIERS.low.shadowMapSize], extent: 40, camera: { left: -40, right: 40, top: 40, bottom: -40, near: 0.1, far: 400 } };
  const dome = (scene) => {
    let mat = null;
    scene.traverse((o) => { if (o.material?.uniforms?.uMoonDir) mat = o.material; });
    return mat;
  };
  const live = (over) => {
    exitCaptureMode();
    moodRef.current = 0;
    useGameStore.setState({ weatherMoodBoost: 0, dangerLevel: 0, playerPosition: { x: 0, y: 60, z: 0 }, captureStudio: false, ...over });
  };

  it('the painted moon rides the frame\'s moonDir (f 0.62: far from the moon\'s own noon)', async () => {
    const f = 0.62;
    live({ gameTime: f * CYCLE_UNITS, isDay: false });
    r = await mountR3F(<Atmosphere shadowConfig={shadowConfig} />);
    const mat = dome(r.three().scene);
    expect(mat, 'SETUP: Atmosphere mounted no dome').not.toBeNull();
    const before = mat.uniforms.uMoonDir.value.toArray();
    await r.step(1);
    const want = moonArcDirection(f);
    expect(angleDeg(before, want), 'SETUP: the uniform\'s initial value is already where the moon is').toBeGreaterThan(10);
    expect(angleDeg(MOON_NOON, want)).toBeGreaterThan(10);
    expect(angleDeg(mat.uniforms.uMoonDir.value.toArray(), want), 'the dome\'s moon is not on the moon\'s arc').toBeLessThan(1e-4);
    expect(angleDeg(skyFrameRef.current.moonDir, want), 'the published frame\'s moonDir is not the moon\'s arc').toBeLessThan(1e-4);
  });

  it('under capture the frame is noon for a day state and midnight for a night state, whatever the clock', async () => {
    // The clock sits at 0.3, away from both declared fractions, so a capture that read the clock fails both reads.
    live({ gameTime: 0.3 * CYCLE_UNITS, isDay: false });
    enterCaptureMode();
    r = await mountR3F(<Atmosphere shadowConfig={shadowConfig} />);
    await r.step(1);
    const clock = sunArcDirection(NOON_SUN, 0.3), noon = sunArcDirection(NOON_SUN, 0.25), midnight = sunArcDirection(NOON_SUN, 0.75);
    expect(angleDeg(clock, noon), 'SETUP: the clock is indistinguishable from noon').toBeGreaterThan(10);
    expect(angleDeg(skyFrameRef.current.sunDir, midnight), 'capture is not midnight for a night state').toBeLessThan(1e-4);
    useGameStore.setState({ isDay: true });
    await r.step(1);
    expect(angleDeg(skyFrameRef.current.sunDir, noon), 'capture is not noon for a day state').toBeLessThan(1e-4);
  });
});
