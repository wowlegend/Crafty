import { describe, it, expect } from 'vitest';
import { detileSources, formulaConstants } from '../_support/detileSources.js';
import { tileValueOffset } from '../../src/world/detile.js';

// A SINGLE-SOURCE INVARIANT THAT NOTHING ENFORCED.
//
// detile.js's own header says "the GLSL terrain shader mirrors this exact formula ... so the JS unit test
// and the GPU agree on the same numbers". They are two hand-written copies, and no test compared them --
// `tileValueOffset` has no importer outside its own test, so the JS side could drift to any value at all
// and every assertion about it would keep passing while the GPU rendered something else.
//
// The shader cannot be executed from node, so this compares the CONSTANTS: they ARE the formula, and a
// divergence in any one of them is a visible change in terrain texture that no frame diff would attribute
// to this file.
const { js: JS, glsl } = detileSources();

describe('de-tile — the JS and the GLSL are the same formula', () => {
  it('finds both copies — a missing one would make this gate vacuous', () => {
    expect(glsl.length, 'the shader de-tile block was not found; this gate is comparing nothing').toBeGreaterThan(80);
    expect(JS).toContain('export function tileValueOffset');
  });

  it('shares every constant: the three axis multipliers, the hash scale, and the amplitude', () => {
    for (const n of ['12.989', '78.233', '37.719', '43758.5453', '0.16']) {
      expect(JS, `the JS copy lost ${n}`).toContain(n);
      expect(glsl, `the SHADER copy lost ${n} — the GPU now jitters differently from the unit test`).toContain(n);
    }
  });

  it('the shader introduces no constant the JS does not have', () => {
    // Drift runs both ways: a tweak made only in the shader is just as invisible.
    const extra = formulaConstants(glsl).filter((n) => !JS.includes(n));
    expect(extra, 'the shader carries a constant the JS copy has never heard of').toEqual([]);
  });

  it('both centre on zero and stay inside the declared +/-0.08', () => {
    // The property the constants encode, asserted on the JS side where it can actually be run.
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    for (let x = -20; x <= 20; x += 3) {
      for (let y = 0; y <= 60; y += 7) {
        for (let z = -20; z <= 20; z += 3) {
          const v = tileValueOffset(x, y, z);
          min = Math.min(min, v);
          max = Math.max(max, v);
          sum += v;
          n++;
        }
      }
    }
    expect(n, 'no cells were sampled').toBeGreaterThan(500);
    expect(min).toBeGreaterThanOrEqual(-0.08);
    expect(max).toBeLessThanOrEqual(0.08);
    expect(Math.abs(sum / n), 'the jitter is biased, so a field of one block reads uniformly darker or lighter').toBeLessThan(0.01);
  });

  it('is a function of the INTEGER cell — the reason it is capture-deterministic', () => {
    // Both copies floor their inputs. If the JS stopped, the same block would shimmer as the player moved
    // within it, and the capture frames would stop reproducing.
    expect(tileValueOffset(3.0, 4.0, 5.0)).toBe(tileValueOffset(3.9, 4.9, 5.9));
    expect(JS).toContain('Math.floor');
    expect(glsl).toContain('floor(');
  });
});
