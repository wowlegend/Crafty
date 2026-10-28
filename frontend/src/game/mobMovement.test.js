// mobMovement.test.js — the chase multiplier, as the ONE reader the worker and the combat stance share.
// (tests/gates/mob-movement-gates.test.js covers movementGoal and is left alone.)
import { describe, it, expect } from 'vitest';
import { chaseSpeedMult } from './mobMovement.js';

describe('chaseSpeedMult', () => {
  it('chaseSpeedMult is the worker\'s chase multiplier: 1.0 calm, 2.0 aggro spider, 1.5 any other aggro', () => {
    expect(chaseSpeedMult('zombie', false)).toBe(1.0);
    expect(chaseSpeedMult('spider', false)).toBe(1.0);
    expect(chaseSpeedMult('spider', true)).toBe(2.0);
    const others = ['zombie', 'skeleton', 'skitterling', 'duskhound', 'moss_brute', 'emberhusk'];
    for (const t of others) expect(chaseSpeedMult(t, true), t).toBe(1.5);
    expect(others.length, 'empty denominator').toBe(6);
  });
});
