import { describe, it, expect } from 'vitest';
import { attackPhase, WINDUP_MS } from './attackTelegraph.js';

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
