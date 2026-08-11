import { describe, it, expect, afterEach } from 'vitest';
import { enterCaptureMode, exitCaptureMode, getCaptureOpts, isCaptureMode } from './captureMode.js';

describe('captureMode showTouch opt-in', () => {
  afterEach(() => exitCaptureMode());

  it('defaults showTouch falsy (the 17 baselines never render the touch overlay)', () => {
    enterCaptureMode({});
    expect(!!getCaptureOpts().showTouch).toBe(false);
  });

  it('enterCaptureMode({showTouch:true}) sets the flag (the mobile fixture opts in)', () => {
    enterCaptureMode({ showTouch: true });
    expect(getCaptureOpts().showTouch).toBe(true);
    expect(isCaptureMode()).toBe(true);
  });

  it('camera opts still merge alongside showTouch (no regression)', () => {
    enterCaptureMode({ showTouch: true, camera: { position: [1, 2, 3] } });
    expect(getCaptureOpts().camera.position).toEqual([1, 2, 3]);
    expect(getCaptureOpts().showTouch).toBe(true);
  });

  it('exitCaptureMode clears showTouch (a showTouch fixture does not leak into later frames)', () => {
    enterCaptureMode({ showTouch: true });
    exitCaptureMode();
    expect(!!getCaptureOpts().showTouch).toBe(false);
  });
});

// AN OPT THE COMPONENT BRANCHED ON AND NOTHING COULD EVER SET.
//
// DamageDirection reads `getCaptureOpts().hitDir` and renders a fixed-opacity screen-edge cue from it,
// and its docblock describes the opt as though it worked. enterCaptureMode merged `camera` and
// `showTouch` and SILENTLY DROPPED everything else, so the branch was unreachable dead code and a fixture
// author calling enterCapture({ hitDir: Math.PI / 2 }) got an empty frame with no error at all.
describe('capture opts — a declared opt actually arrives', () => {
  afterEach(() => exitCaptureMode());

  it('carries hitDir through to the component that reads it', () => {
    enterCaptureMode({ hitDir: Math.PI / 2 });
    expect(getCaptureOpts().hitDir).toBeCloseTo(Math.PI / 2, 10);
  });

  it('rests at null rather than undefined, so "not set" is part of the contract', () => {
    // An opt that only exists once someone passes it reads as "never part of the contract" -- which is
    // how this one went unbuilt while a component branched on it.
    enterCaptureMode({});
    expect(getCaptureOpts().hitDir).toBe(null);
    expect(getCaptureOpts().showTouch).toBe(false);
  });

  it('refuses a non-finite angle instead of feeding NaN into a gradient', () => {
    for (const bad of [NaN, Infinity, 'left', {}]) {
      enterCaptureMode({ hitDir: bad });
      expect(getCaptureOpts().hitDir, `${String(bad)} was accepted`).toBe(null);
    }
  });

  it('does not leak a fixture opt into the NEXT frame', () => {
    // Both opts are opt-IN per shot. Leaving either set would paint the following baselines with a cue
    // that frame never asked for -- 30 silent diffs from one fixture.
    enterCaptureMode({ hitDir: 1.2, showTouch: true });
    exitCaptureMode();
    expect(getCaptureOpts().hitDir).toBe(null);
    expect(getCaptureOpts().showTouch).toBe(false);
  });

  it('leaves the camera pose alone — it is a standing default, not a per-shot fixture', () => {
    enterCaptureMode({ hitDir: 1 });
    expect(Array.isArray(getCaptureOpts().camera.position)).toBe(true);
  });
});
