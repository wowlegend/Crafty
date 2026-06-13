import { describe, it, expect, afterEach, vi } from 'vitest';
import { isTouchDevice, isTouchUIMode } from './touchDevice.js';
import { enterCaptureMode, exitCaptureMode } from '../devtest/captureMode.js';

const setEnv = ({ maxTouchPoints, anyCoarse, ontouchstart }) => {
  vi.stubGlobal('navigator', { maxTouchPoints: maxTouchPoints ?? 0 });
  vi.stubGlobal('window', {
    PointerEvent: maxTouchPoints !== undefined ? function () {} : undefined,
    matchMedia: (q) => ({ matches: q.includes('any-pointer: coarse') ? !!anyCoarse : false }),
    ...(ontouchstart ? { ontouchstart: null } : {}),
  });
};

describe('isTouchDevice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PointerEvent path: maxTouchPoints > 0 -> touch', () => {
    setEnv({ maxTouchPoints: 5 });
    expect(isTouchDevice()).toBe(true);
  });

  it('PointerEvent path: maxTouchPoints 0 -> not touch (desktop)', () => {
    setEnv({ maxTouchPoints: 0 });
    expect(isTouchDevice()).toBe(false);
  });

  it('iPad-with-trackpad (desktop UA, fine primary) still detected via any-pointer:coarse + maxTouchPoints', () => {
    setEnv({ maxTouchPoints: 5, anyCoarse: true });
    expect(isTouchDevice()).toBe(true);
  });

  it('legacy fallback (no PointerEvent): any-pointer:coarse matches -> touch', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { matchMedia: (q) => ({ matches: q.includes('any-pointer: coarse') }) });
    expect(isTouchDevice()).toBe(true);
  });

  it('SSR / no window -> false (never crashes)', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    expect(isTouchDevice()).toBe(false);
  });
});

describe('isTouchUIMode', () => {
  afterEach(() => { exitCaptureMode(); vi.unstubAllGlobals(); });

  it('under capture: true only when showTouch is set (the mobile fixture)', () => {
    enterCaptureMode({ showTouch: true });
    expect(isTouchUIMode()).toBe(true);
  });

  it('under capture without showTouch: false (the 17 desktop baselines stay desktop-HUD)', () => {
    enterCaptureMode({});
    expect(isTouchUIMode()).toBe(false);
  });

  it('outside capture: falls back to isTouchDevice (touch hardware -> true)', () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 5 });
    vi.stubGlobal('window', { PointerEvent: function () {}, matchMedia: () => ({ matches: false }) });
    expect(isTouchUIMode()).toBe(true);
  });
});
