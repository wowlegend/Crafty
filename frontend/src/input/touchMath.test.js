import { describe, it, expect } from 'vitest';
import {
  joystickToMove, DEFAULT_DEADZONE,
  applyLook, LOOK_BASE_SENSITIVITY, MAX_PITCH,
  makeTouchRouter,
} from './touchMath.js';

// ---------------------------------------------------------------------------
// Task 1 — joystickToMove
// Screen-space convention: +x = right, +y = DOWN. Forward (moveF) = up = -y.
// ---------------------------------------------------------------------------
const noOpposingPair = (m) => {
  expect(m.moveF && m.moveB, 'never both moveF & moveB').toBe(false);
  expect(m.moveL && m.moveR, 'never both moveL & moveR').toBe(false);
};

describe('joystickToMove', () => {
  it('inside the deadzone → all false', () => {
    const m = joystickToMove(2, -1, DEFAULT_DEADZONE); // mag ~2.2 < default deadzone
    expect(m).toEqual({ moveF: false, moveB: false, moveL: false, moveR: false });
  });

  it('straight up (−y) → moveF only', () => {
    const m = joystickToMove(0, -50);
    expect(m).toEqual({ moveF: true, moveB: false, moveL: false, moveR: false });
    noOpposingPair(m);
  });

  it('straight down (+y) → moveB only', () => {
    const m = joystickToMove(0, 50);
    expect(m).toMatchObject({ moveF: false, moveB: true, moveL: false, moveR: false });
  });

  it('straight right (+x) → moveR only', () => {
    expect(joystickToMove(50, 0)).toMatchObject({ moveR: true, moveL: false, moveF: false, moveB: false });
  });

  it('straight left (−x) → moveL only', () => {
    expect(joystickToMove(-50, 0)).toMatchObject({ moveL: true, moveR: false });
  });

  it('up-right diagonal → moveF + moveR', () => {
    const m = joystickToMove(40, -40);
    expect(m).toMatchObject({ moveF: true, moveR: true, moveB: false, moveL: false });
  });

  it('down-left diagonal → moveB + moveL', () => {
    const m = joystickToMove(-40, 40);
    expect(m).toMatchObject({ moveB: true, moveL: true, moveF: false, moveR: false });
  });

  it('NEVER sets an opposing pair across a full sweep (noisy-thumb invariant)', () => {
    for (let deg = -180; deg < 180; deg += 1) {
      const r = deg * Math.PI / 180;
      noOpposingPair(joystickToMove(Math.cos(r) * 50, -Math.sin(r) * 50));
    }
  });

  it('sector boundary (22.5°) resolves to a diagonal, still no opposing pair', () => {
    const r = 22.5 * Math.PI / 180;
    noOpposingPair(joystickToMove(Math.cos(r) * 50, -Math.sin(r) * 50));
  });
});

// ---------------------------------------------------------------------------
// Task 2 — applyLook
// ---------------------------------------------------------------------------
describe('applyLook', () => {
  it('exposes the PointerLockControls-verbatim constants', () => {
    expect(LOOK_BASE_SENSITIVITY).toBe(0.002);             // three PLC base rad/px
    expect(MAX_PITCH).toBeCloseTo(Math.PI / 2 - 0.05, 10); // matches Components:1218 clamp
  });

  it('drag right (+dx) decreases yaw; drag down (+dy) decreases pitch (PLC sign convention)', () => {
    const r = applyLook(0, 0, 100, 100, 1);
    expect(r.yaw).toBeCloseTo(-100 * 0.002, 10);
    expect(r.pitch).toBeCloseTo(-100 * 0.002, 10);
  });

  it('sensitivity multiplies the base rate', () => {
    const r = applyLook(0, 0, 100, 0, 1.5);
    expect(r.yaw).toBeCloseTo(-100 * 0.002 * 1.5, 10);
  });

  it('pitch saturates at +MAX_PITCH and never wraps past the gimbal guard (look far up)', () => {
    const r = applyLook(0, 0, 0, -100000, 1); // huge upward drag
    expect(r.pitch).toBeCloseTo(MAX_PITCH, 10);
  });

  it('pitch saturates at −MAX_PITCH (look far down)', () => {
    const r = applyLook(0, 0, 0, 100000, 1);
    expect(r.pitch).toBeCloseTo(-MAX_PITCH, 10);
  });

  it('yaw is unclamped (wraps freely)', () => {
    const r = applyLook(0, 0, 100000, 0, 1);
    expect(Math.abs(r.yaw)).toBeGreaterThan(Math.PI);
  });
});

// ---------------------------------------------------------------------------
// Task 3 — makeTouchRouter (multi-touch identifier → zone)
// synthetic Touch-like objects; viewport width 1000 → split at x=500.
// ---------------------------------------------------------------------------
const T = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });

describe('makeTouchRouter', () => {
  it('left-half touchstart → move zone; right-half → look zone', () => {
    const r = makeTouchRouter();
    expect(r.onStart(T(1, 100, 400), 1000).zone).toBe('move');
    expect(r.onStart(T(2, 900, 400), 1000).zone).toBe('look');
    expect(r.activeCount).toBe(2);
  });

  it('move-zone onMove returns the vector FROM ORIGIN', () => {
    const r = makeTouchRouter();
    r.onStart(T(1, 100, 400), 1000);
    expect(r.onMove(T(1, 130, 360))).toEqual({ zone: 'move', vecX: 30, vecY: -40 });
  });

  it('look-zone onMove returns the INCREMENTAL delta since the last point', () => {
    const r = makeTouchRouter();
    r.onStart(T(2, 900, 400), 1000);
    expect(r.onMove(T(2, 910, 390))).toEqual({ zone: 'look', dx: 10, dy: -10 });
    // next move is relative to the previous point, not the origin
    expect(r.onMove(T(2, 915, 385))).toEqual({ zone: 'look', dx: 5, dy: -5 });
  });

  it('a look-drag identifier NEVER produces a move vector, even interleaved with a move finger', () => {
    const r = makeTouchRouter();
    r.onStart(T(1, 100, 400), 1000); // move finger
    r.onStart(T(2, 900, 400), 1000); // look finger
    const a = r.onMove(T(2, 950, 420)); // look finger moves
    const b = r.onMove(T(1, 120, 380)); // move finger moves
    const c = r.onMove(T(2, 960, 410)); // look finger moves again
    expect(a.zone).toBe('look');
    expect(b.zone).toBe('move');
    expect(c.zone).toBe('look');
    expect(a).not.toHaveProperty('vecX');
    expect(c).not.toHaveProperty('vecX');
  });

  it('onMove for an untracked id returns null (no crash on stray events)', () => {
    expect(makeTouchRouter().onMove(T(99, 0, 0))).toBeNull();
  });

  it('onEnd releases the id and reports its zone', () => {
    const r = makeTouchRouter();
    r.onStart(T(2, 900, 400), 1000);
    expect(r.onEnd(T(2)).zone).toBe('look');
    expect(r.activeCount).toBe(0);
    expect(r.onMove(T(2, 910, 410))).toBeNull(); // released → untracked
  });
});
