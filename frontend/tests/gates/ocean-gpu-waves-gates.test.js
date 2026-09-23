import { describe, it, expect } from 'vitest';
import { gerstnerGlsl, WAVES, STEEPNESS, gerstnerDisplace, gerstnerNormal, SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE WAVES MOVE TO THE GPU (EXTERNAL-BASELINE runner-up: "Gerstner into the vertex shader").
 *
 * Ocean.jsx displaced ~9,400 vertices on the CPU every frame (its own comment measured ~14% of the frame
 * budget) and re-uploaded position, normal and foam. The GLSL is GENERATED from the same WAVES table the
 * JS functions read, with every constant substituted by value — so the GPU surface cannot drift from the
 * tested JS one by a retuned row.
 *
 * The generator is checked the strongest way node allows: an INTERPRETER for the exact arithmetic shape it
 * emits evaluates the generated text and must agree with gerstnerDisplace / gerstnerNormal at sample points.
 * A sign flip, a swapped axis or a dropped wave in the GLSL makes the interpreted numbers disagree.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED: W1 plausible-wrong: the height's sign
 * flipped; W2 plausible-wrong: x and z swapped in the phase; W3 a wave dropped; W4 plausible-wrong: the
 * steepness left out of the normal (survived until the driven case checked the normal at Q = 0.8 — the
 * shipped Q = 1 makes it an equivalent mutant); W5 phase speed not scaled by k; W6 Ocean: capture time
 * unfrozen (structural).
 *
 * BLIND SPOT: the interpreter reads this generator's own statement shapes, not GLSL in general, and nothing
 * here compiles the shader — a browser does (the capture A/B, with wave time frozen, is the visual oracle).
 */
const G = gerstnerGlsl();

// Evaluate the generated body. It is a flat list of `a op= expr;` statements over floats p.x, p.y, t and the
// locals it declares, plus cos/sin/sqrt — a JS-evaluable subset once `vec`-typed locals are split into
// components by name. The generator emits scalar locals only for exactly this reason.
function runGlsl(src, px, pz, t) {
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  const js = body
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\bp\.x\b/g, 'PX').replace(/\bp\.y\b/g, 'PZ')
    .replace(/\bcos\(/g, 'Math.cos(').replace(/\bsin\(/g, 'Math.sin(').replace(/\binversesqrt\(/g, '1/Math.sqrt(')
    .replace(/disp = vec3\(([^;]+)\);/, 'DISP = [$1];')
    .replace(/nrm = vec3\(([^;]+)\);/, 'NRM = [$1];');
  return new Function('PX', 'PZ', 't', `let DISP, NRM; ${js}; return { DISP, NRM };`)(px, pz, t);
}

describe('gerstnerGlsl — the GPU surface is the tested JS surface', () => {
  it('declares the one function the ocean vertex shader calls', () => {
    expect(G).toMatch(/void gerstnerWave\(vec2 p, float t, out vec3 disp, out vec3 nrm\)/);
  });

  it('interpreted, it reproduces gerstnerDisplace and gerstnerNormal at sample points and times', () => {
    let checked = 0;
    for (const [x, z, t] of [[0, 0, 0], [12.5, -7.25, 3.1], [-40, 91, 17.7], [203.3, 5.5, 4.0]]) {
      const { DISP, NRM } = runGlsl(G, x, z, t);
      const d = gerstnerDisplace(x, z, t);
      const n = gerstnerNormal(x, z, t);
      expect(DISP[0]).toBeCloseTo(d.x - x, 4);          // horizontal shift, not position
      expect(DISP[1]).toBeCloseTo(d.y - SEA_LEVEL, 4);  // height above sea level
      expect(DISP[2]).toBeCloseTo(d.z - z, 4);
      for (let k = 0; k < 3; k++) expect(NRM[k]).toBeCloseTo(n[k], 4);
      checked++;
    }
    expect(checked).toBe(4);
  });

  it('every wave is in it, and a driven table moves it — a typed literal cannot pass', () => {
    const one = gerstnerGlsl([[1, 0, Math.PI * 2, 0.5, 3]], 0.8);
    const { DISP, NRM } = runGlsl(one, 0.25, 0, 0); // k = 1, phase = 0.25
    expect(DISP[1]).toBeCloseTo(0.5 * Math.sin(0.25), 6);
    expect(DISP[0]).toBeCloseTo(0.8 * 0.5 * Math.cos(0.25), 6);
    // The NORMAL with a steepness that is not 1 — the shipped table's Q = 1 makes a dropped Q invisible.
    const nx = -0.5 * Math.cos(0.25), ny = 1 - 0.8 * 0.5 * Math.sin(0.25), len = Math.hypot(nx, ny);
    expect(NRM[0]).toBeCloseTo(nx / len, 6);
    expect(NRM[1]).toBeCloseTo(ny / len, 6);
    expect((G.match(/\bph\d+ =/g) || []).length).toBe(WAVES.length);
    expect(STEEPNESS).toBeGreaterThan(0);
  });
});

describe('Ocean.jsx uses it and stops doing the work on the CPU (weak, structural)', () => {
  it('the vertex shader splices the generated waves; no per-vertex frame loop remains', () => {
    expect(carriersOf(/\$\{GERSTNER_GLSL\}/)).toEqual(['render/Ocean.jsx']);
    expect(carriersOf(/for \(let i = 0; i < pos\.count; i\+\+\)/), 'the CPU per-vertex loop is back in Ocean.jsx').not.toContain('render/Ocean.jsx');
    expect(carriersOf(/needsUpdate = true/), 'Ocean.jsx re-uploads geometry every frame again').not.toContain('render/Ocean.jsx');
    expect(carriersOf(/gerstnerWave\(gWp, uTime, gDisp, gNrm\)/)).toEqual(['render/Ocean.jsx']);
  });

  it('wave time is the frozen capture phase under capture, so ocean frames stay deterministic', () => {
    expect(carriersOf(/oceanUniforms\.uTime\.value = isCaptureMode\(\) \? CAPTURE_TIME : state\.clock\.elapsedTime;/))
      .toEqual(['render/Ocean.jsx']);
  });
});
