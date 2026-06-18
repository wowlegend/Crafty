import { describe, it, expect } from 'vitest';
import {
  ACCEL_RATE, DECEL_RATE, COYOTE_TIME, JUMP_BUFFER,
  rampAxis, rampVelocity, coyoteOk, bufferOk,
} from './gameFeel.js';

describe('gameFeel constants', () => {
  it('exposes tuned ramp + grace windows', () => {
    expect(ACCEL_RATE).toBeGreaterThan(0);
    expect(DECEL_RATE).toBeGreaterThanOrEqual(ACCEL_RATE); // stops faster than it starts
    expect(COYOTE_TIME).toBeCloseTo(0.1);   // ~100ms grace after leaving ground
    expect(JUMP_BUFFER).toBeCloseTo(0.12);  // ~120ms pre-land queue
  });
});

describe('rampAxis', () => {
  it('moves current toward desired by accel*delta when speeding up', () => {
    // from 0 toward 10, accel 60/s, delta 0.1 -> +6
    expect(rampAxis(0, 10, 0.1, ACCEL_RATE, DECEL_RATE)).toBeCloseTo(6);
  });
  it('uses DECEL when slowing toward zero (magnitude shrinking)', () => {
    // from 10 toward 0, decel 90/s, delta 0.1 -> 10 - 9 = 1
    expect(rampAxis(10, 0, 0.1, ACCEL_RATE, DECEL_RATE)).toBeCloseTo(1);
  });
  it('never overshoots the target', () => {
    expect(rampAxis(0, 10, 100, ACCEL_RATE, DECEL_RATE)).toBe(10);
    expect(rampAxis(10, 0, 100, ACCEL_RATE, DECEL_RATE)).toBe(0);
  });
  it('uses ACCEL when reversing direction (sign flip is speeding up the new direction)', () => {
    // from +5 toward -10: magnitude not shrinking toward 0 monotonically; ramp by accel
    const v = rampAxis(5, -10, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(v).toBeLessThan(5);
    expect(v).toBeGreaterThan(-10);
  });
});

describe('rampVelocity (2D)', () => {
  it('ramps x and z independently and returns a fresh object', () => {
    const r = rampVelocity({ x: 0, z: 0 }, { x: 10, z: 0 }, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(r.x).toBeCloseTo(6);
    expect(r.z).toBeCloseTo(0);
  });
  it('decays toward zero when no desired input', () => {
    const r = rampVelocity({ x: 10, z: 10 }, { x: 0, z: 0 }, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(Math.hypot(r.x, r.z)).toBeLessThan(Math.hypot(10, 10));
  });
});

describe('coyoteOk', () => {
  it('true while within the grace window after leaving ground', () => {
    expect(coyoteOk(false, 1.05, 1.0, COYOTE_TIME)).toBe(true);  // 50ms since left ground
    expect(coyoteOk(false, 1.5, 1.0, COYOTE_TIME)).toBe(false);  // 500ms -> expired
  });
  it('true immediately when grounded (lastGroundedAt == now)', () => {
    expect(coyoteOk(true, 1.0, 1.0, COYOTE_TIME)).toBe(true);
  });
});

describe('bufferOk', () => {
  it('true when a jump was pressed within the buffer window before landing', () => {
    expect(bufferOk(0.95, 1.0, JUMP_BUFFER)).toBe(true);   // pressed 50ms ago
    expect(bufferOk(0.5, 1.0, JUMP_BUFFER)).toBe(false);   // pressed 500ms ago -> stale
  });
  it('false when no jump was ever pressed (lastPressAt null)', () => {
    expect(bufferOk(null, 1.0, JUMP_BUFFER)).toBe(false);
  });
});
