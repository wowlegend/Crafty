import { describe, it, expect } from 'vitest';
import { tierRarityBonus, tierLootChance, RARITY_BONUS_CAP } from '../../src/game/lootTier.js';

// S7 Slice 3 (REWARD side): far from spawn = rarer drops. The zone-tier boosts the drop CHANCE of
// NON-common loot rows (common staples unchanged so crafting still feeds). Pure -> testable +
// capture-safe (loot is runtime). tier 0 (near spawn) MUST be identical to the legacy behaviour.
describe('tierRarityBonus(zoneTier) — relative drop-chance boost for rare loot', () => {
  it('is 0 at tier 0 (near spawn = no change)', () => {
    expect(tierRarityBonus(0)).toBe(0);
  });
  it('rises with tier and caps', () => {
    expect(tierRarityBonus(1)).toBeGreaterThan(0);
    expect(tierRarityBonus(2)).toBeGreaterThan(tierRarityBonus(1));
    expect(tierRarityBonus(99)).toBe(RARITY_BONUS_CAP);
  });
  it('is robust to nullish / negative / NaN (treated as 0)', () => {
    expect(tierRarityBonus(undefined)).toBe(0);
    expect(tierRarityBonus(-3)).toBe(0);
    expect(tierRarityBonus(NaN)).toBe(0);
  });
});

describe('tierLootChance(baseChance, rarity, zoneTier) — effective drop chance', () => {
  it('common rows are UNCHANGED at any tier (staples still feed crafting)', () => {
    expect(tierLootChance(0.8, 'common', 0)).toBe(0.8);
    expect(tierLootChance(0.8, 'common', 4)).toBe(0.8);
  });
  it('non-common rows are UNCHANGED at tier 0 (no regression near spawn)', () => {
    expect(tierLootChance(0.05, 'epic', 0)).toBe(0.05);
    expect(tierLootChance(0.5, 'rare', 0)).toBe(0.5);
  });
  it('non-common rows rise with tier', () => {
    expect(tierLootChance(0.05, 'epic', 2)).toBeGreaterThan(0.05);
    expect(tierLootChance(0.05, 'epic', 4)).toBeGreaterThan(tierLootChance(0.05, 'epic', 2));
  });
  it('clamps the effective chance to 1.0 (never > certain)', () => {
    expect(tierLootChance(0.9, 'epic', 4)).toBeLessThanOrEqual(1);
  });
  it('treats a nullish rarity as common (safe default, unchanged)', () => {
    expect(tierLootChance(0.3, null, 4)).toBe(0.3);
    expect(tierLootChance(0.3, undefined, 4)).toBe(0.3);
  });
});
