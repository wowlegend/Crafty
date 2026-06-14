import { describe, it, expect } from 'vitest';
import { planarBasis, dodgeDirection, dodgeSpeed, isDodgeInvincible } from './dodge.js';

// Characterization of the dodge-mechanic math extracted from the Player loop (S3 de-monolith).
// Pins the exact behavior so the extraction is byte-equivalent + the math is locked going forward.

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('planarBasis', () => {
  it('camera looking -Z -> forward (0,-1), side (1,0)', () => {
    const b = planarBasis(0, -1);
    expect(near(b.fwdX, 0) && near(b.fwdZ, -1)).toBe(true);
    expect(near(b.sideX, 1) && near(b.sideZ, 0)).toBe(true);
  });
  it('camera looking +X -> forward (1,0), side (0,1)', () => {
    const b = planarBasis(1, 0);
    expect(near(b.fwdX, 1) && near(b.fwdZ, 0)).toBe(true);
    expect(near(b.sideX, 0) && near(b.sideZ, 1)).toBe(true);
  });
  it('normalizes an arbitrary XZ direction to unit length', () => {
    const b = planarBasis(3, 4); // |(3,4)| = 5
    expect(near(b.fwdX, 0.6) && near(b.fwdZ, 0.8)).toBe(true);
    expect(near(Math.hypot(b.fwdX, b.fwdZ), 1)).toBe(true);
  });
  it('degenerate XZ (camera straight up/down) falls back to forward (0,0,-1)', () => {
    const b = planarBasis(0, 0);
    expect(near(b.fwdX, 0) && near(b.fwdZ, -1)).toBe(true);
  });
});

describe('dodgeDirection', () => {
  it('no directional input dodges FORWARD', () => {
    const d = dodgeDirection(0, -1, {});
    expect(near(d.x, 0) && near(d.z, -1)).toBe(true);
  });
  it('moveF (looking -Z) dodges -Z (forward)', () => {
    const d = dodgeDirection(0, -1, { moveF: true });
    expect(near(d.x, 0) && near(d.z, -1)).toBe(true);
  });
  it('moveB dodges backward (+Z when looking -Z)', () => {
    const d = dodgeDirection(0, -1, { moveB: true });
    expect(near(d.x, 0) && near(d.z, 1)).toBe(true);
  });
  it('moveR dodges to the right (+X when looking -Z)', () => {
    const d = dodgeDirection(0, -1, { moveR: true });
    expect(near(d.x, 1) && near(d.z, 0)).toBe(true);
  });
  it('moveL dodges to the left (-X when looking -Z)', () => {
    const d = dodgeDirection(0, -1, { moveL: true });
    expect(near(d.x, -1) && near(d.z, 0)).toBe(true);
  });
  it('diagonal (moveF + moveR) is the normalized 45° vector', () => {
    const d = dodgeDirection(0, -1, { moveF: true, moveR: true });
    const k = Math.SQRT1_2;
    expect(near(d.x, k) && near(d.z, -k)).toBe(true);
    expect(near(Math.hypot(d.x, d.z), 1)).toBe(true);
  });
  it('opposing inputs cancel to FORWARD (W+S, looking -Z)', () => {
    const d = dodgeDirection(0, -1, { moveF: true, moveB: true });
    expect(near(d.x, 0) && near(d.z, -1)).toBe(true);
  });
});

describe('dodgeSpeed', () => {
  it('starts fast (28) at progress 0, eases to slow (10) at progress 1', () => {
    expect(dodgeSpeed(0)).toBe(28);
    expect(dodgeSpeed(1)).toBe(10);
  });
  it('is the linear midpoint (19) at progress 0.5', () => {
    expect(dodgeSpeed(0.5)).toBe(19);
  });
  it('clamps progress outside [0,1]', () => {
    expect(dodgeSpeed(-1)).toBe(28);
    expect(dodgeSpeed(2)).toBe(10);
  });
});

describe('isDodgeInvincible', () => {
  it('invincible while active AND within the i-frame window (inclusive)', () => {
    expect(isDodgeInvincible(true, 0.1, 0.2)).toBe(true);
    expect(isDodgeInvincible(true, 0.2, 0.2)).toBe(true); // <= boundary
  });
  it('not invincible once past the i-frame window', () => {
    expect(isDodgeInvincible(true, 0.3, 0.2)).toBe(false);
  });
  it('not invincible when the dodge is inactive', () => {
    expect(isDodgeInvincible(false, 0.0, 0.2)).toBe(false);
  });
});
