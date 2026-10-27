import { describe, it, expect } from 'vitest';
import { Vector2 } from 'three';
import { EffectComposer, Pass } from 'postprocessing';
import { syncComposerToPixelRatio } from '../../src/render/postFx.js';

/**
 * THE COMPOSER FOLLOWS THE PIXEL RATIO (plan 2026-10-27-crafty-steady-cool, item b; refute F8 "Composer resize premise,
 * CONFIRMED").
 *
 * @react-three/postprocessing 3.0.4 resizes its composer in an effect keyed on R3F's CSS `size` only. A pixel-ratio
 * change at the same CSS size — exactly what the pixel budget (item a) does on every tier step, and what the browser
 * does when a window moves to another display — leaves every composer buffer at the OLD resolution: the scene is drawn
 * into a buffer of the wrong size and stretched (the upstream N8AO "ghosting" symptom, #280), and after a step DOWN the
 * chain keeps paying for the larger buffer, so the budget's saving never lands.
 *
 * This drives the REAL postprocessing EffectComposer (its setSize sizes buffers from renderer.getDrawingBufferSize) over
 * a renderer stand-in that implements exactly the five methods the composer calls, so the assertion reads the
 * composer's own buffers, not a model of them.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/postFx.js, see the commit for the receipts:
 *   S1 the sync never resizes                                         -> RED expected (the ratio-change case)
 *   S2 plausible-wrong: compares the CSS size, as upstream does        -> RED expected (the ratio-change case)
 *   S3 plausible-wrong: compares the width only                        -> RED expected (the height-only case)
 *   S4 plausible-wrong: resizes every frame whether stale or not       -> RED expected (the in-sync case)
 *   S0 identity (a comment edit)                                      -> must SURVIVE
 */

function fakeRenderer({ width, height, ratio }) {
  const r = {
    width, height, ratio,
    autoClear: true,
    outputColorSpace: 'srgb',
    capabilities: { maxSamples: 4 },
    getContext: () => ({ getContextAttributes: () => ({ alpha: false }) }),
    getSize: (v) => v.set(r.width, r.height),
    getDrawingBufferSize: (v) => v.set(Math.floor(r.width * r.ratio), Math.floor(r.height * r.ratio)),
    setSize: (w, h) => { r.width = w; r.height = h; },
    getPixelRatio: () => r.ratio,
    setPixelRatio: (x) => { r.ratio = x; },
  };
  return r;
}

class SizeRecorder extends Pass {
  constructor() { super('SizeRecorder'); this.sizes = []; }
  setSize(w, h) { this.sizes.push([w, h]); }
}

const drawing = (gl) => gl.getDrawingBufferSize(new Vector2());

describe('syncComposerToPixelRatio', () => {
  const setup = () => {
    const gl = fakeRenderer({ width: 1728, height: 1117, ratio: 2 });
    const composer = new EffectComposer(gl, { multisampling: 0 });
    const pass = new SizeRecorder();
    composer.addPass(pass);
    return { gl, composer, pass };
  };

  it('the presence control: the composer starts at the drawing-buffer size, and does NOT follow a ratio change on its own', () => {
    const { gl, composer } = setup();
    expect(composer.inputBuffer.width).toBe(3456);
    gl.setPixelRatio(1.475); // the budget's step: same CSS size, fewer pixels
    expect(composer.inputBuffer.width, 'the composer followed the ratio with no help — the defect this gate exists for is gone upstream').toBe(3456);
  });

  it('a pixel-ratio change at the same CSS size resizes every composer buffer and every pass', () => {
    const { gl, composer, pass } = setup();
    gl.setPixelRatio(1.475);
    const v = new Vector2();
    expect(syncComposerToPixelRatio(composer, gl, v), 'a stale composer was not resized').toBe(true);
    const d = drawing(gl);
    expect([composer.inputBuffer.width, composer.inputBuffer.height]).toEqual([d.x, d.y]);
    expect([composer.outputBuffer.width, composer.outputBuffer.height]).toEqual([d.x, d.y]);
    expect(pass.sizes.at(-1), 'the passes were not told the new size').toEqual([d.x, d.y]);
    expect(gl.width, 'the sync must not change the CSS size').toBe(1728);
  });

  it('a height-only drift is caught too', () => {
    const { gl, composer } = setup();
    gl.setSize(1728, 900); // R3F resized the canvas; the package's own effect has not run yet
    expect(syncComposerToPixelRatio(composer, gl, new Vector2())).toBe(true);
    expect(composer.inputBuffer.height).toBe(1800);
  });

  it('in sync, it does nothing — no per-frame resize', () => {
    const { gl, composer, pass } = setup();
    const before = pass.sizes.length;
    const v = new Vector2();
    for (let i = 0; i < 5; i++) expect(syncComposerToPixelRatio(composer, gl, v)).toBe(false);
    expect(pass.sizes.length, 'an in-sync frame resized the passes').toBe(before);
  });

  it('no composer yet (the first frame) is not an error', () => {
    const gl = fakeRenderer({ width: 10, height: 10, ratio: 1 });
    expect(syncComposerToPixelRatio(null, gl, new Vector2())).toBe(false);
  });
});
