import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { SHAKE_WEIGHT_MAX } from '../../src/game/trauma.js';

// THE STORE SEAM, NOT THE PURE MODULE.
//
// trauma.js had a green test file the whole time its two exports had zero callers. The clamp and the
// accumulate live in the STORE, because that is where the game actually writes — so this asserts there,
// against the real zustand store the producers call, rather than against the reducer in isolation. That
// distinction is the entire reason the defect survived: a passing unit test over an unreached function.
describe('store camera shake — trauma stays in its declared range', () => {
  beforeEach(() => useGameStore.setState({ cameraShakeIntensity: 0, cameraShakeDir: [0, 0] }));

  const shake = () => useGameStore.getState().cameraShakeIntensity;

  it('the loudest single producer in the game cannot exceed 1', () => {
    // BossEntity's phase-1 roar, every 4200ms. It used to store 1.8, which shakeOffset then SQUARED.
    useGameStore.getState().triggerCameraShake(1.8);
    expect(shake()).toBeLessThanOrEqual(1);
    expect(shake()).toBeGreaterThan(0);
  });

  it('ACCUMULATES — a second hit adds to the first instead of replacing it', () => {
    // The old setter overwrote, so a light tick landing mid-shake CUT THE SHAKE SHORT. Two 0.4 spells
    // should read harder than one, which is the whole point of a trauma model.
    useGameStore.getState().triggerCameraShake(0.4);
    const one = shake();
    useGameStore.getState().triggerCameraShake(0.4);
    expect(shake()).toBeGreaterThan(one);
  });

  it('a weak hit during a heavy shake never REDUCES the shake', () => {
    useGameStore.getState().triggerCameraShake(1.6);
    const heavy = shake();
    useGameStore.getState().triggerCameraShake(0.4);
    expect(shake()).toBeGreaterThanOrEqual(heavy);
  });

  it('saturates at exactly 1 under a barrage rather than climbing', () => {
    for (let i = 0; i < 20; i++) useGameStore.getState().triggerCameraShake(1.8);
    expect(shake()).toBe(1);
  });

  it('preserves the hit direction across the falloff, and only overwrites when a dir is passed', () => {
    useGameStore.getState().triggerCameraShake(1.0, 0.6, -0.8);
    expect(useGameStore.getState().cameraShakeDir).toEqual([0.6, -0.8]);
    useGameStore.getState().decayCameraShake(1 / 60);
    useGameStore.getState().triggerCameraShake(0.5); // no dir
    expect(useGameStore.getState().cameraShakeDir).toEqual([0.6, -0.8]);
  });

  it('decays the same amount per SECOND regardless of frame rate', () => {
    // The shipped decay was a bare multiply by 0.85 per frame: 0.52s of shake at 60Hz, 0.26s at 120Hz.
    const runFor1s = (frames) => {
      useGameStore.setState({ cameraShakeIntensity: 1 });
      for (let i = 0; i < frames; i++) useGameStore.getState().decayCameraShake(1 / frames);
      return shake();
    };
    const at60 = runFor1s(60);
    const at120 = runFor1s(120);
    expect(at120).toBeCloseTo(at60, 5);
  });

  it('settles to exactly zero, so the shake branch stops running', () => {
    useGameStore.setState({ cameraShakeIntensity: 0.005 });
    useGameStore.getState().decayCameraShake(1 / 60);
    expect(shake()).toBe(0);
  });

  it('the weight ceiling is the one the consumer compensates for', () => {
    // If SHAKE_WEIGHT_MAX ever changes without Components' 0.55 * MAX^2 changing with it, every impact in
    // the game silently changes strength. This pins them together at the value the producers need.
    expect(SHAKE_WEIGHT_MAX).toBeGreaterThanOrEqual(1.8);
  });
});
