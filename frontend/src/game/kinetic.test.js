import { describe, it, expect } from 'vitest';
import { KINETIC_MAX, GRAB_COST, kineticForKill, clampKinetic, canGrab } from './kinetic.js';

// S2-B2-M1: the VOIDHAND Kinetic economy (pure). Twin of ferocity.js — bank in the day, spend per grab.

describe('kineticForKill — per-tier bank (passive < hostile < boss)', () => {
  it('grades by mob toughness + falls back to a default', () => {
    expect(kineticForKill('pig')).toBeLessThan(kineticForKill('zombie'));
    expect(kineticForKill('zombie')).toBeLessThan(kineticForKill('boss'));
    expect(kineticForKill('shadow_dragon')).toBe(kineticForKill('boss')); // boss|dragon regex
    expect(kineticForKill('unknown_mob')).toBeGreaterThan(0);             // default, not 0
    expect(kineticForKill(undefined)).toBeGreaterThan(0);
  });
});

describe('clampKinetic — rounded + clamped to [0, KINETIC_MAX]', () => {
  it('clamps, rounds, and zeroes non-finite', () => {
    expect(clampKinetic(-50)).toBe(0);
    expect(clampKinetic(9999)).toBe(KINETIC_MAX);
    expect(clampKinetic(42.6)).toBe(43);
    expect(clampKinetic(NaN)).toBe(0);
    expect(clampKinetic(undefined)).toBe(0);
  });
});

describe('canGrab — bank has at least GRAB_COST', () => {
  it('true at/above GRAB_COST, false below', () => {
    expect(canGrab(GRAB_COST)).toBe(true);
    expect(canGrab(GRAB_COST - 1)).toBe(false);
    expect(canGrab(KINETIC_MAX)).toBe(true);
    expect(canGrab(0)).toBe(false);
    expect(GRAB_COST).toBeLessThan(KINETIC_MAX); // spent-per-grab => multiple grabs per full bank
  });
});
