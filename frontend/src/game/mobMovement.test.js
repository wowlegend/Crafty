// mobMovement.test.js — the chase multiplier, as the ONE reader the worker and the combat stance share.
// (tests/gates/mob-movement-gates.test.js covers movementGoal and is left alone.)
//
// Mutation-Proof: (scripts/dev/mutate.sh, observed 2026-10-27) K1 the aggro spider `? 2.0 :` -> `? 1.5 :` ->
// RED; K1c the calm multiplier `return 1.0` -> `return 1.5` -> RED; K0 identity (a comment edit) -> survived.
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
