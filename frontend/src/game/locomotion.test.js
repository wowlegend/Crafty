import { describe, it, expect } from 'vitest';
import {
  moveVector, moveSpeed, jumpVelocity, applyGravity,
  BASE_MOVE_SPEED, JUMP_VELOCITY, GRAVITY, TERMINAL_VELOCITY,
} from './locomotion.js';

// Pure locomotion math extracted from the Player loop. Locks: camera-relative WASD basis, diagonal
// normalization (no diagonal speed boost), opposing-input cancel, the degenerate-camera fallback, and
// the gravity terminal-velocity clamp.

const mag = (v) => Math.hypot(v.x, v.z);

describe('moveVector', () => {
  // camera looking down -Z (forward = -Z, right = +X)
  it('forward maps to -Z at full speed', () => {
    const v = moveVector(0, -1, { moveF: true }, 10);
    expect(v.moving).toBe(true);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-10, 10);
  });

  it('strafe-right maps to +X (perpendicular to forward)', () => {
    const v = moveVector(0, -1, { moveR: true }, 10);
    expect(v.x).toBeCloseTo(10, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('no input -> not moving', () => {
    expect(moveVector(0, -1, {}, 10)).toEqual({ x: 0, z: 0, moving: false });
  });

  it('opposing inputs cancel to not-moving', () => {
    expect(moveVector(0, -1, { moveF: true, moveB: true }, 10)).toEqual({ x: 0, z: 0, moving: false });
    expect(moveVector(0, -1, { moveL: true, moveR: true }, 10)).toEqual({ x: 0, z: 0, moving: false });
  });

  it('diagonal is normalized to exactly `speed` (no diagonal speed boost)', () => {
    const v = moveVector(0, -1, { moveF: true, moveR: true }, 10);
    expect(v.moving).toBe(true);
    expect(mag(v)).toBeCloseTo(10, 10);
  });

  it('normalizes a non-unit camera direction before applying', () => {
    // camDir (0,-5) -> normalized (0,-1); forward should still be -Z at full speed
    const v = moveVector(0, -5, { moveF: true }, 10);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-10, 10);
  });

  it('falls back to forward=-Z when the camera direction is degenerate (near zero)', () => {
    const v = moveVector(0, 0, { moveF: true }, 10);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-10, 10);
  });

  it('defaults speed to BASE_MOVE_SPEED', () => {
    const v = moveVector(0, -1, { moveF: true });
    expect(v.z).toBeCloseTo(-BASE_MOVE_SPEED, 10);
  });
});

describe('moveSpeed / jumpVelocity (form multipliers)', () => {
  it('scales the base constants by the form mult', () => {
    expect(moveSpeed({ moveMult: 1.4 })).toBeCloseTo(BASE_MOVE_SPEED * 1.4, 10);
    expect(jumpVelocity({ jumpMult: 0.8 })).toBeCloseTo(JUMP_VELOCITY * 0.8, 10);
    expect(moveSpeed({ moveMult: 1 })).toBe(BASE_MOVE_SPEED);
  });
});

describe('applyGravity', () => {
  it('accelerates downward by GRAVITY*mult*delta', () => {
    expect(applyGravity(0, 1, 0.1)).toBeCloseTo(GRAVITY * 0.1, 10); // -3.2
    expect(applyGravity(0, 1.2, 0.5)).toBeCloseTo(GRAVITY * 1.2 * 0.5, 10); // -19.2
  });

  it('clamps to TERMINAL_VELOCITY on a long fall', () => {
    expect(applyGravity(-49, 1, 1)).toBe(TERMINAL_VELOCITY); // -49 + (-32) = -81 -> clamped
    expect(applyGravity(TERMINAL_VELOCITY, 1, 0.1)).toBe(TERMINAL_VELOCITY); // already terminal
  });
});
