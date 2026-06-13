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
