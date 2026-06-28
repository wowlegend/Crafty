import { describe, it, expect } from 'vitest';
import { tierRarityBonus, tierLootChance, RARITY_BONUS_CAP } from './lootTier.js';

// Pure S7 loot-ramp math (the Ember-Frontier reward lever, Kevin-tunable). Locks the contract:
// non-common drops get rarer-the-farther-out, common staples are untouched, tier 0 == legacy, all capped.

describe('tierRarityBonus', () => {
  it('is 0 at spawn (tier 0) — legacy behaviour, no regression', () => {
    expect(tierRarityBonus(0)).toBe(0);
  });

  it('rises +25% (relative) per tier', () => {
    expect(tierRarityBonus(1)).toBeCloseTo(0.25, 10);
    expect(tierRarityBonus(2)).toBeCloseTo(0.5, 10);
    expect(tierRarityBonus(3)).toBeCloseTo(0.75, 10);
  });

  it('caps at +100% (2x) far out', () => {
    expect(tierRarityBonus(4)).toBe(RARITY_BONUS_CAP); // 4 * 0.25 = 1.0 == cap
    expect(tierRarityBonus(5)).toBe(RARITY_BONUS_CAP); // would be 1.25 -> capped
    expect(tierRarityBonus(100)).toBe(RARITY_BONUS_CAP);
  });

  it('floors fractional tiers and clamps non-positive/garbage to 0', () => {
    expect(tierRarityBonus(1.9)).toBeCloseTo(0.25, 10); // floor(1.9) = 1
    expect(tierRarityBonus(-3)).toBe(0);
    expect(tierRarityBonus(NaN)).toBe(0);
    expect(tierRarityBonus(null)).toBe(0);
    expect(tierRarityBonus(undefined)).toBe(0);
  });
});

describe('tierLootChance', () => {
  it('leaves common (or nullish) rarity unchanged at any tier — staples still feed crafting', () => {
    expect(tierLootChance(0.4, 'common', 4)).toBe(0.4);
    expect(tierLootChance(0.4, null, 4)).toBe(0.4);
    expect(tierLootChance(0.4, undefined, 4)).toBe(0.4);
  });

  it('leaves non-common unchanged at tier 0 (== legacy)', () => {
    expect(tierLootChance(0.2, 'rare', 0)).toBeCloseTo(0.2, 10);
  });

  it('boosts a non-common row by the tier bonus', () => {
    expect(tierLootChance(0.2, 'rare', 2)).toBeCloseTo(0.2 * 1.5, 10); // +50%
    expect(tierLootChance(0.1, 'epic', 4)).toBeCloseTo(0.1 * 2.0, 10); // +100% (cap)
  });

  it('clamps the effective chance to <= 1 (never a >100% drop chance)', () => {
    expect(tierLootChance(0.8, 'epic', 4)).toBe(1); // 0.8 * 2.0 = 1.6 -> clamped
    expect(tierLootChance(1, 'rare', 1)).toBe(1); // 1 * 1.25 -> clamped
  });
});
