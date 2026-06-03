import { describe, it, expect } from 'vitest';
import { xpForLevel, computeEffective, deriveMaxStats } from './progression.js';

const STATS = {
  'Diamond Sword': { strength: 15, agility: 8 },
  'Iron Shield': { armor: 15, strength: 3 },
};
const BASE = { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 };

describe('xpForLevel', () => {
  it('matches the exponential curve floor(100 * 1.5^(level-1))', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(150);
    expect(xpForLevel(3)).toBe(225);
    expect(xpForLevel(5)).toBe(506); // floor(100 * 1.5^4 = 506.25)
  });
  it('clamps a non-positive level to 1', () => {
    expect(xpForLevel(0)).toBe(100);
    expect(xpForLevel(-3)).toBe(100);
  });
});

describe('computeEffective', () => {
  it('returns a copy of base when no equipment', () => {
    const eff = computeEffective(BASE, {}, STATS);
    expect(eff).toEqual(BASE);
    expect(eff).not.toBe(BASE); // must not mutate the base object
  });
  it('folds equipment bonuses additively across all slots', () => {
    const eff = computeEffective(BASE, { weapon: 'Diamond Sword', offhand: 'Iron Shield' }, STATS);
    expect(eff.strength).toBe(10 + 15 + 3);
    expect(eff.agility).toBe(10 + 8);
    expect(eff.intellect).toBe(10);
    expect(eff.armor).toBe(0 + 15);
  });
  it('ignores null slots and unknown item names', () => {
    const eff = computeEffective(BASE, { weapon: null, head: 'Nonexistent' }, STATS);
    expect(eff).toEqual(BASE);
  });
});

describe('deriveMaxStats', () => {
  it('maxHealth = 100 + (level-1)*10 + STR*5; maxMana = 100 + (level-1)*5 + INT*2', () => {
    expect(deriveMaxStats(1, { strength: 10, intellect: 10 })).toEqual({ maxHealth: 150, maxMana: 120 });
    expect(deriveMaxStats(5, { strength: 20, intellect: 15 })).toEqual({ maxHealth: 100 + 40 + 100, maxMana: 100 + 20 + 30 });
  });
  it('treats a missing level as 1 and missing attrs as 0-contribution', () => {
    expect(deriveMaxStats(undefined, {})).toEqual({ maxHealth: 100, maxMana: 100 });
  });
});
