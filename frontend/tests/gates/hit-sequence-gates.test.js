import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  hitSequence, squashAmp, mobLook, applyMobLook, FLASH_MS, MIN_SQUASH_FRAMES, SQUASH_MS, CONTACT,
} from '../../src/render/feedbackGrammar.js';
import { installRim, FLASH_GLSL, OUTLINE } from '../../src/render/characterStyle.js';

// CONTACT (feedback-grammar plan M2; W3-A PR A F2). A blow that lands used to white out the whole mob for 300 ms
// (colour and emissive), hiding its shape exactly when the player looks at it. Now the side facing the key light goes
// white for about 70 ms, its ink outline goes white, and it squashes for about 50 ms; reduced motion keeps the outline
// only. The phases run on the wall clock AND on rendered frames, so a 5 fps device still renders one flash frame and a
// 120 Hz display does not halve the squash. The shader term is generated here (FLASH_GLSL) and spliced into the one
// rim program every mob, the beast and the props share; that it whitens the lit band in the running game is the e2e's
// pixel check (tests/e2e/feedback-grammar.spec.js), because no node test can run GLSL.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 11 tests, each observed RED, an identity mutant SURVIVED:
//   K3a FLASH_MS 300 -> "FLASH lasts FLASH_MS ... at 60 fps"
//   K3b MIN_FLASH_FRAMES dropped (0) -> "holds FLASH for one rendered frame"
//   K3d the squash ignores juice -> "reduced motion keeps the white outline"
//   K3e plausible-wrong: SQUASH counted as 3 frames -> "SQUASH lasts SQUASH_MS ... at 120 and 30 fps"
//   K3f applyMobLook writes the flash into material.color -> "the flash never writes material.color"
//   K3g the GLSL mix without the key-light band -> "the generated GLSL"
//   K3h a second stamp ignored mid-sequence -> "a second stamp during SQUASH restarts FLASH"

const run = (dt, until = 1300) => {
  const seq = {}; const trace = [];
  for (let t = 1000; t < until; t += dt) trace.push([t, hitSequence(seq, t, 1000)]);
  return trace;
};

describe('hitSequence: FLASH, then SQUASH, then rest, on the wall clock and on rendered frames', () => {
  it('FLASH lasts FLASH_MS of wall clock at 60 fps, then SQUASH for 3 frames (50 ms)', () => {
    const phases = run(16.7, 1200).map(([, p]) => p);
    expect(phases.filter((p) => p === 'flash')).toHaveLength(5); // 0 .. 66.8 ms < 70
    expect(phases.slice(5, 8)).toEqual(['squash', 'squash', 'squash']);
    expect(phases[8]).toBe('rest');
    expect(FLASH_MS).toBe(70);
  });

  it('SQUASH lasts SQUASH_MS, not a frame count, at 120 and 30 fps', () => {
    for (const [dt, frames] of [[8.33, 7], [33.3, 2]]) { // 120 Hz: squash frames at 0 .. 49.98 ms; 30 fps: the two it must draw
      const squash = run(dt).filter(([, p]) => p === 'squash');
      expect(squash, `at ${dt} ms frames`).toHaveLength(frames);
      expect(squash.length).toBeGreaterThanOrEqual(MIN_SQUASH_FRAMES);
      expect(squash.at(-1)[0] - squash[0][0]).toBeLessThan(SQUASH_MS + dt);
    }
  });

  it('holds FLASH for one rendered frame when the frame interval exceeds FLASH_MS', () => {
    const seq = {};
    expect(hitSequence(seq, 1200, 1000)).toBe('flash'); // the first frame after the hit is 200 ms late
    expect(hitSequence(seq, 1400, 1000)).toBe('squash');
    expect(hitSequence(seq, 1600, 1000)).toBe('squash'); // the second of MIN_SQUASH_FRAMES
    expect(hitSequence(seq, 1800, 1000)).toBe('rest');
  });

  it('a second stamp during SQUASH restarts FLASH; no stamp is rest', () => {
    const seq = {};
    for (let t = 1000; t < 1080; t += 16) hitSequence(seq, t, 1000);
    expect(hitSequence(seq, 1085, 1000)).toBe('squash');
    expect(hitSequence(seq, 1090, 1088)).toBe('flash');
    expect(hitSequence({}, 5000, 0)).toBe('rest');
  });

  it('the squash curve runs 1, 0.6, 0.25 across its window and ends at 0', () => {
    const seq = { squashStart: 1000 };
    expect(squashAmp(seq, 1000)).toBeCloseTo(1, 5);
    expect(squashAmp(seq, 1000 + SQUASH_MS / 3)).toBeCloseTo(0.6, 5);
    expect(squashAmp(seq, 1000 + (2 * SQUASH_MS) / 3)).toBeCloseTo(0.25, 5);
    expect(squashAmp(seq, 1000 + SQUASH_MS / 6)).toBeCloseTo(0.8, 5);
    expect(squashAmp(seq, 1000 + SQUASH_MS)).toBe(0);
  });
});

const look = () => ({ telegraph: 0, flash: 0, squash: 0, outline: new THREE.Color(), rim: new THREE.Color() });

describe('mobLook: contact is the lit band and a white edge', () => {
  it('a fresh hit flashes the body by juice, whitens the outline, and wins over a windup', () => {
    const o = mobLook({ lastHit: 1000, windupUntil: 99999 }, 1010, 50000, 1, {}, look());
    expect(o.phase).toBe('flash');
    expect(o.flash).toBe(1);
    expect(o.telegraph).toBe(0);
    expect(o.outline.getHexString()).toBe(new THREE.Color(CONTACT).getHexString());
  });

  it('reduced motion keeps the white outline and drops the body flash and the squash', () => {
    const seq = {};
    const o = mobLook({ lastHit: 1000 }, 1010, 0, 0, seq, look());
    expect(o.flash).toBe(0);
    expect(o.outline.getHexString()).toBe('ffffff');
    const s = mobLook({ lastHit: 1000 }, 1075, 0, 0, seq, look());
    expect(s.phase).toBe('squash');
    expect(s.squash).toBe(0);
    const full = mobLook({ lastHit: 1000 }, 1075, 0, 1, {}, look()); // the same moment at full juice squashes
    expect(full.phase).toBe('flash'); // a fresh sequence starts in FLASH
  });
});

describe('applyMobLook: what a frame writes into a mob\'s materials', () => {
  it('the flash never writes material.color or emissive; the rim takes uFlash, the hull the edge colour', () => {
    const toon = installRim(new THREE.MeshToonMaterial({ color: '#228b22' }));
    toon.emissive.set('#331100'); // an authored emissive (an elite's crest) must survive
    const hull = { uniforms: { thickness: { value: 5 }, color: { value: new THREE.Color(OUTLINE.color) } } };
    const eye = new THREE.MeshBasicMaterial({ color: '#ff0000' });
    const writes = { color: 0 };
    const real = toon.color;
    Object.defineProperty(toon, 'color', { get: () => real, set: () => { writes.color += 1; } });
    const seq = {};
    let frames = 0;
    for (let t = 1000; t < 1150; t += 16.7, frames++) {
      const o = mobLook({ lastHit: 1000 }, t, 0, 1, seq, look());
      for (const m of [toon, hull, eye]) applyMobLook(m, o);
      if (t === 1000) {
        expect(toon.userData.rim.uFlash.value).toBe(1);
        expect(hull.uniforms.color.value.getHexString()).toBe('ffffff');
      }
    }
    expect(frames, 'the denominator: one flash cycle of 9 frames').toBe(9);
    expect(writes.color).toBe(0);
    expect(real.getHexString()).toBe('228b22');
    expect(toon.emissive.getHexString()).toBe('331100');
    expect(eye.color.getHexString()).toBe('ff0000');
    expect(toon.userData.rim.uFlash.value, 'rest again').toBe(0);
    expect(hull.uniforms.color.value.getHexString()).toBe(new THREE.Color(OUTLINE.color).getHexString());
  });

  it('the generated GLSL: one flash mix gated by the key-light band, spliced into the one rim program', () => {
    expect(FLASH_GLSL.decl).toBe('uniform float uFlash;');
    expect(FLASH_GLSL.apply.match(/mix\(gl_FragColor\.rgb, vec3\(1\.0\), uFlash \* fgLit\)/g)).toHaveLength(1);
    expect(FLASH_GLSL.apply).toMatch(/fgLit = step\(0\.0, dot\(normal, directionalLights\[0\]\.direction\)\)/);
    const a = installRim(new THREE.MeshToonMaterial());
    const b = installRim(new THREE.MeshToonMaterial());
    expect([a.customProgramCacheKey(), b.customProgramCacheKey()]).toEqual(['mobToonRim', 'mobToonRim']);
    const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.toon.fragmentShader };
    a.onBeforeCompile(shader);
    expect(shader.uniforms.uFlash.value).toBe(0);
    const f = shader.fragmentShader;
    const rimAt = f.indexOf('gl_FragColor.rgb += uRimColor');
    const flashAt = f.indexOf(FLASH_GLSL.apply);
    expect(rimAt).toBeGreaterThan(0);
    expect(flashAt, 'after the rim, before dithering').toBeGreaterThan(rimAt);
    expect(f.indexOf('#include <dithering_fragment>')).toBeGreaterThan(flashAt);
    expect(f.indexOf(FLASH_GLSL.decl)).toBeGreaterThan(0);
  });
});
