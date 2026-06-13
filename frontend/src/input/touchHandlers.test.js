import { describe, it, expect, vi } from 'vitest';
import { makeTouchRouter } from './touchMath.js';
import { handleTouchMove, handleTouchEnd, MOVE_KEYS } from './touchHandlers.js';

const T = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
const fakeCamera = () => ({ rotation: { x: 0, y: 0, order: 'YXZ' } });

describe('handleTouchMove (DI glue)', () => {
  it('move-zone drag writes the quantized move intents (up -> moveF, clears others)', () => {
    const router = makeTouchRouter();
    router.onStart(T(1, 100, 400), 1000); // left -> move
    const setIntent = vi.fn();
    handleTouchMove(router, [T(1, 100, 340)], { camera: fakeCamera(), setIntent, sensitivity: 1 });
    // up drag (dy -60) -> moveF true, the other three false (each move key written every frame)
    expect(setIntent).toHaveBeenCalledWith('moveF', true);
    expect(setIntent).toHaveBeenCalledWith('moveB', false);
    expect(setIntent).toHaveBeenCalledWith('moveL', false);
    expect(setIntent).toHaveBeenCalledWith('moveR', false);
  });

  it('move-zone inside deadzone clears all four move intents (no chatter)', () => {
    const router = makeTouchRouter();
    router.onStart(T(1, 100, 400), 1000);
    const setIntent = vi.fn();
    handleTouchMove(router, [T(1, 102, 401)], { camera: fakeCamera(), setIntent, sensitivity: 1 });
    for (const k of MOVE_KEYS) expect(setIntent).toHaveBeenCalledWith(k, false);
  });

  it('look-zone drag writes camera.rotation (yaw/pitch) and NEVER calls setIntent', () => {
    const router = makeTouchRouter();
    router.onStart(T(2, 900, 400), 1000); // right -> look
    const setIntent = vi.fn();
    const camera = fakeCamera();
    handleTouchMove(router, [T(2, 850, 420)], { camera, setIntent, sensitivity: 1 });
    expect(camera.rotation.y).toBeCloseTo(-(-50) * 0.002, 10); // dx = 850-900 = -50 -> yaw -= dx*k
    expect(camera.rotation.x).toBeCloseTo(-(20) * 0.002, 10);  // dy = 420-400 = 20 -> pitch -= dy*k
    expect(setIntent).not.toHaveBeenCalled();
  });

  it('a null camera is tolerated (look no-ops, no throw)', () => {
    const router = makeTouchRouter();
    router.onStart(T(2, 900, 400), 1000);
    expect(() => handleTouchMove(router, [T(2, 850, 420)], { camera: null, setIntent: vi.fn(), sensitivity: 1 })).not.toThrow();
  });
});

describe('handleTouchEnd', () => {
  it('releasing a MOVE-zone touch clears all four move intents', () => {
    const router = makeTouchRouter();
    router.onStart(T(1, 100, 400), 1000);
    const setIntent = vi.fn();
    handleTouchEnd(router, [T(1, 100, 400)], { setIntent });
    for (const k of MOVE_KEYS) expect(setIntent).toHaveBeenCalledWith(k, false);
  });

  it('releasing a LOOK-zone touch does NOT touch move intents', () => {
    const router = makeTouchRouter();
    router.onStart(T(2, 900, 400), 1000);
    const setIntent = vi.fn();
    handleTouchEnd(router, [T(2, 900, 400)], { setIntent });
    expect(setIntent).not.toHaveBeenCalled();
  });
});
