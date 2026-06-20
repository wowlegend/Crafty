// S7 Slice 3 (REWARD side of the Ember Frontier loop): far from spawn = rarer drops, so braving the
// higher-tier zones pays off. Boosts the drop CHANCE of NON-common loot rows by the kill-position zone
// tier; common staples are left unchanged so crafting still feeds. Pure (no state, no item-registry
// import -- the caller passes the row's rarity) -> unit-testable + capture-safe (loot is runtime, never
// in the visual baselines). zoneTier 0 (near spawn) is identical to the legacy behaviour (no regression).
// Numbers are a Kevin-tunable feel/balance knob (KEVIN-REVIEW-BATCH).
const RARITY_BONUS_PER_TIER = 0.25; // each zone tier adds +25% RELATIVE chance to a non-common row (module-internal)
export const RARITY_BONUS_CAP = 1.0;       // capped at +100% (2x) far out

/** Relative drop-chance boost for non-common loot at a given zone tier. 0 at tier 0, rising, capped. */
export function tierRarityBonus(zoneTier) {
  const z = Math.max(0, Math.floor(Number(zoneTier) || 0));
  return Math.min(z * RARITY_BONUS_PER_TIER, RARITY_BONUS_CAP);
}

/**
 * Effective drop chance for a loot row given its item rarity + the kill-position zone tier.
 * common (or nullish) rarity -> unchanged. non-common -> base * (1 + tierRarityBonus), clamped to 1.
 * @param {number} baseChance the row's intrinsic drop chance (0..1]
 * @param {string|null} rarity the item's rarity ('common'|'rare'|'epic'|...) from getItemRarity
 * @param {number} zoneTier distance zone-tier 0..MAX_TIER (see world/zoneTier.js)
 * @returns {number} effective chance, clamped to <= 1
 */
export function tierLootChance(baseChance, rarity, zoneTier) {
  if (rarity == null || rarity === 'common') return baseChance;
  return Math.min(1, baseChance * (1 + tierRarityBonus(zoneTier)));
}
