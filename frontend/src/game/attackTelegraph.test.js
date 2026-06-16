import { describe, it, expect } from 'vitest';
import { attackPhase, windupRamp, WINDUP_MS } from './attackTelegraph.js';

describe('attackPhase (the dodgeable windup->strike machine)', () => {
  it('idle when not in range / on cooldown (no intent)', () => {
    expect(attackPhase(1000, 0, false)).toEqual({ action: 'idle', windupUntil: 0 });
  });
  it('begins a windup when intent appears', () => {
    expect(attackPhase(1000, 0, true)).toEqual({ action: 'windup', windupUntil: 1000 + WINDUP_MS });
  });
  it('charges (does nothing) mid-windup, even if intent flickers', () => {
    expect(attackPhase(1100, 1380, true)).toEqual({ action: 'charge', windupUntil: 1380 });
    expect(attackPhase(1100, 1380, false)).toEqual({ action: 'charge', windupUntil: 1380 });
  });
  it('STRIKES when the windup elapses and intent still holds', () => {
    expect(attackPhase(1380, 1380, true)).toEqual({ action: 'strike', windupUntil: 0 });
  });
  it('CANCELS (whiff) when the windup elapses but the target dodged out of intent', () => {
    expect(attackPhase(1380, 1380, false)).toEqual({ action: 'cancel', windupUntil: 0 });
  });
  it('honors a custom windup window', () => {
    expect(attackPhase(0, 0, true, 500).windupUntil).toBe(500);
  });
});

describe('windupRamp (0 at windup start -> 1 at the strike, for the render pose/emissive)', () => {
  it('is 0 at the start of the windup', () => {
    expect(windupRamp(1000, 1380, 380)).toBeCloseTo(0);
  });
  it('is 0.5 halfway through', () => {
    expect(windupRamp(1190, 1380, 380)).toBeCloseTo(0.5);
  });
  it('is 1 at the strike moment', () => {
    expect(windupRamp(1380, 1380, 380)).toBeCloseTo(1);
  });
  it('clamps to 1 past the strike and 0 with no windup', () => {
    expect(windupRamp(2000, 1380, 380)).toBe(1);
    expect(windupRamp(1000, 0, 380)).toBe(0);
    expect(windupRamp(500, 1380, 380)).toBe(0); // before the window even opens
  });
});
