import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';
import { aoFloorColor, AO_FLOOR, AO_SKY_STRENGTH } from '../../src/world/biomeTable.js';

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * S11 — sky-coloured ambient occlusion. A contact shadow is lit by the sky, not by grey paint.
 *
 * The AO term was `mix(0.55, 1.0, vAO/3.0)`: a flat grey multiply, which reads as DIRT rather than as
 * shadow. Real occlusion takes the colour of whatever light still reaches it, and in an open world that
 * is the sky — blue at noon, warm at dusk.
 *
 * WHY NOT `skyMid * 0.55`, WHICH IS THE OBVIOUS FORM AND IS WHAT THE QUEUE PRESCRIBED. Multiplying by a
 * sky colour also multiplies by its BRIGHTNESS, and skyMid is dark at dusk and darker under the obsidian
 * mood. Crevices would crush toward black exactly when the scene is already dim — which is the defect
 * already logged as L1 in the SOTA queue: on a LOCKED bold-flat direction a near-black surface stops
 * reading as a material and reads as a hole. Taking the sky's HUE while pinning its LUMINANCE to the old
 * floor gives the intended effect and cannot make L1 worse. That is the invariant the first three cases
 * below exist for, and it is a property over all inputs rather than a sampled example.
 *
 * BLIND SPOT, stated (R7), and it is most of the claim: this drives the CPU-side derivation. The shader
 * that consumes it is GLSL inside a JS template literal, which `npm run test:unit` cannot compile and no
 * gate in this repo can execute. Whether the mix is wired to the right uniform, whether the uniform
 * updates, and above all whether the result LOOKS like shadow rather than dirt are all unchecked here —
 * the last one is a judgement no test can hold. The shader was compiled in a real browser via
 * scripts/visual/grass-probe.mjs before this shipped, and the frame was opened.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('S11 sky-coloured AO', () => {
  // Real mood samples: daylight, dusk, and the obsidian/night end where the naive form fails worst.
  const SKIES = {
    day: [0.53, 0.73, 0.93],
    dusk: [0.35, 0.20, 0.28],
    night: [0.05, 0.06, 0.12],
    black: [0, 0, 0],
  };

  it('strength 0 is an EXACT no-op — reverting is one number', () => {
    expect(aoFloorColor(SKIES.day, 0)).toEqual([AO_FLOOR, AO_FLOOR, AO_FLOOR]);
    // ...and the shipped strength is NOT the no-op, or every other case here passes with the feature off.
    expect(AO_SKY_STRENGTH).toBeGreaterThan(0);
    expect(aoFloorColor(SKIES.day)).not.toEqual([AO_FLOOR, AO_FLOOR, AO_FLOOR]);
  });

  it('LUMINANCE IS CONSTANT across every mood — the invariant that keeps crevices off black', () => {
    // The whole reason this is not `skyMid * 0.55`. A crevice is exactly as dark at midnight as at noon;
    // only its hue moves. Checked against the naive form in the same breath so the difference is on the
    // record rather than asserted in a comment.
    for (const [name, sky] of Object.entries(SKIES)) {
      expect(lum(aoFloorColor(sky)), `AO luminance drifted in ${name}`).toBeCloseTo(AO_FLOOR, 10);
      const naive = sky.map((c) => c * AO_FLOOR);
      if (name === 'night') {
        expect(lum(naive), 'the naive form is supposed to be far darker at night — if not, this case is moot')
          .toBeLessThan(AO_FLOOR * 0.3);
      }
    }
  });

  it('a BLACK sky cannot produce a black floor — the degenerate input', () => {
    // skyMid can go very dark; a zero-luminance input must fall back to neutral grey rather than to
    // black, or the obsidian mood would paint every crevice as a hole.
    expect(aoFloorColor(SKIES.black)).toEqual([AO_FLOOR, AO_FLOOR, AO_FLOOR]);
  });

  it('the HUE actually moves, and in the right direction per mood', () => {
    const day = aoFloorColor(SKIES.day);
    const dusk = aoFloorColor(SKIES.dusk);
    expect(day[2], 'daylight AO must lean BLUE — it is lit by a blue sky').toBeGreaterThan(day[0]);
    expect(dusk[0], 'dusk AO must lean WARM — it is lit by a warm sky').toBeGreaterThan(dusk[2]);
  });

  it('the shader CONSUMES the uniform, and the old grey scalar is gone', () => {
    // A source assertion, and the weakest thing here — but the derivation above is worth nothing if the
    // fragment shader still multiplies by a constant. Both directions: the new form present, the old
    // form absent anywhere in the file.
    const t = strip(readFileSync(resolve(SRC, 'world/Terrain.jsx'), 'utf8'));
    expect(t, 'the AO term no longer mixes toward the uniform').toMatch(/mix\(uAoFloor, vec3\(1\.0\), clamp\(vAO/);
    expect(t, 'the flat grey AO multiply is back').not.toMatch(/mix\(0\.55, 1\.0, clamp\(vAO/);
    expect(t, 'the uniform is declared but never written per-frame').toMatch(/uniforms\.uAoFloor\.value\.setRGB/);
    expect(t, 'the AO floor is derived from a different mood sample than the haze — they can disagree')
      .toMatch(/aoFloorColor\(\[sampled\.skyMid\.r/);
  });
});
