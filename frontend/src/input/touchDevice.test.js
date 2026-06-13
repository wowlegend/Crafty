import { describe, it, expect, afterEach, vi } from 'vitest';
import { isTouchDevice } from './touchDevice.js';

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
