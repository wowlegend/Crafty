import { describe, it, expect } from 'vitest';
import { moveSpeed, jumpVelocity, applyGravity, BASE_MOVE_SPEED, JUMP_VELOCITY, GRAVITY, TERMINAL_VELOCITY } from '../../src/game/locomotion.js';

describe('locomotion (S3-M5 p2) — movement math (pinned to the old inline literals)', () => {
  it('move speed = 10 * moveMult', () => {
    expect(moveSpeed({ moveMult: 1 })).toBe(10);
    expect(moveSpeed({ moveMult: 1.3 })).toBeCloseTo(13);
    expect(BASE_MOVE_SPEED).toBe(10);
  });
  it('jump velocity = 12 * jumpMult (hawk higher, golem lower)', () => {
    expect(jumpVelocity({ jumpMult: 1 })).toBe(12);
    expect(jumpVelocity({ jumpMult: 1.4 })).toBeCloseTo(16.8);
    expect(JUMP_VELOCITY).toBe(12.0);
  });
  it('gravity integrates vy += -32*gravityMult*delta', () => {
    expect(applyGravity(0, 1, 0.1)).toBeCloseTo(-3.2);
    expect(applyGravity(-3.2, 1, 0.1)).toBeCloseTo(-6.4);
    expect(GRAVITY).toBe(-32.0);
  });
  it('clamps at terminal velocity (-50)', () => {
    expect(applyGravity(-49, 5, 0.5)).toBe(TERMINAL_VELOCITY); // would overshoot -> clamped
    expect(TERMINAL_VELOCITY).toBe(-50.0);
  });
});
