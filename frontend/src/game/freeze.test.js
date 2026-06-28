import { describe, it, expect } from 'vitest';
import { freezeSlowMult, spellSlowFactor } from './freeze.js';

describe('iceball freeze secondary', () => {
  it('freezeSlowMult: a roll under the full-stop chance fully freezes (0)', () => {
    expect(freezeSlowMult(70, 0.05, 0.2)).toBe(0);
  });
  it('freezeSlowMult: otherwise it slows to (100-slowPercent)% speed', () => {
    expect(freezeSlowMult(70, 0.5, 0.2)).toBeCloseTo(0.3, 5);
    expect(freezeSlowMult(50, 0.99, 0.2)).toBeCloseTo(0.5, 5);
  });
  it('freezeSlowMult clamps to [0,1]', () => {
    expect(freezeSlowMult(150, 0.9, 0.2)).toBe(0);
    expect(freezeSlowMult(-50, 0.9, 0.2)).toBe(1);
  });

  it('spellSlowFactor: 1 when there is no active freeze, the mult while active, 1 after expiry', () => {
    expect(spellSlowFactor(null, 100)).toBe(1);
    expect(spellSlowFactor({}, 100)).toBe(1);
    expect(spellSlowFactor({ spellSlowMult: 0.3, spellSlowUntil: 200 }, 100)).toBeCloseTo(0.3, 5);
    expect(spellSlowFactor({ spellSlowMult: 0.3, spellSlowUntil: 200 }, 200)).toBe(1); // expired
    expect(spellSlowFactor({ spellSlowMult: 5, spellSlowUntil: 200 }, 100)).toBe(1); // malformed mult ignored
  });
});
