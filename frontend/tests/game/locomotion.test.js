import { describe, it, expect } from 'vitest';
import { moveSpeed, jumpVelocity, applyGravity, moveVector, BASE_MOVE_SPEED, JUMP_VELOCITY, GRAVITY, TERMINAL_VELOCITY } from '../../src/game/locomotion.js';

describe('locomotion (S3-M5 p2) — movement math (pinned to the old inline literals)', () => {
  it('move speed = 14 * moveMult (base bumped 10 -> 14 for snappier travel, Kevin 2026-06-18)', () => {
    expect(moveSpeed({ moveMult: 1 })).toBe(14);
    expect(moveSpeed({ moveMult: 1.3 })).toBeCloseTo(18.2);
    expect(BASE_MOVE_SPEED).toBe(14);
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

describe('moveVector (iter 168) — camera-relative WASD velocity (byte-equiv to the old Player inline math)', () => {
  const speed = 10;
  it('no input -> not moving, zero velocity', () => {
    const m = moveVector(0, -1, {}, speed);
    expect(m.moving).toBe(false);
    expect(m.x).toBe(0); expect(m.z).toBe(0);
  });
  it('moveF (looking -Z) -> full speed -Z', () => {
    const m = moveVector(0, -1, { moveF: true }, speed);
    expect(m.moving).toBe(true);
    expect(m.x).toBeCloseTo(0); expect(m.z).toBeCloseTo(-10);
  });
  it('moveR (looking -Z) -> full speed +X (right)', () => {
    const m = moveVector(0, -1, { moveR: true }, speed);
    expect(m.x).toBeCloseTo(10); expect(m.z).toBeCloseTo(0);
  });
  it('diagonal (moveF+moveR) is normalized to `speed` magnitude (no diagonal speed boost)', () => {
    const m = moveVector(0, -1, { moveF: true, moveR: true }, speed);
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(10);
    expect(m.x).toBeCloseTo(10 * Math.SQRT1_2); expect(m.z).toBeCloseTo(-10 * Math.SQRT1_2);
  });
  it('opposing inputs (W+S) cancel -> not moving', () => {
    const m = moveVector(0, -1, { moveF: true, moveB: true }, speed);
    expect(m.moving).toBe(false);
  });
  it('scales by the passed speed (form move-mult lives in `speed`)', () => {
    const m = moveVector(0, -1, { moveF: true }, 13);
    expect(m.z).toBeCloseTo(-13);
  });
  it('degenerate camera (straight up) falls back to forward (0,0,-1)', () => {
    const m = moveVector(0, 0, { moveF: true }, speed);
    expect(m.x).toBeCloseTo(0); expect(m.z).toBeCloseTo(-10);
  });
});
