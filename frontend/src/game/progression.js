/**
 * progression.js — pure, React-free RPG progression math: the XP curve, the player's stats at a level, gear's
 * bonuses on top, and the health and mana caps. Everything here is derived on read from the level and the gear, never
 * stored, so a load or a respec cannot double-count. Node-testable (no THREE / store / React imports).
 */

/** XP required to advance FROM `level` to the next. floor(100 * 1.5^(level-1)). */
export function xpForLevel(level) {
  const lv = Math.max(1, level || 1);
  return Math.floor(100 * Math.pow(1.5, lv - 1));
}

/** The player's own strength, agility and intellect at level 1 (armour comes from gear alone). */
export const BASE_ATTRIBUTES = Object.freeze({ strength: 10, agility: 10, intellect: 10, armor: 0 });

/**
 * What each level above the first adds to the player's own stats: the five attribute points a level once paid, placed
 * by rule, so damage, health and mana scale with level alone (DECISIONS 2026-10-28 W1-H item 6). The split is held inside
 * the band tests/game/levelDamage.test.js states against the builds a player could allocate before.
 */
export const LEVEL_GROWTH = Object.freeze({ strength: 2, agility: 1, intellect: 2 });

/** The player's own attributes at `level` (before gear). A non-finite or sub-1 level reads as level 1. */
export function levelAttributes(level) {
  const lv = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return {
    strength: BASE_ATTRIBUTES.strength + LEVEL_GROWTH.strength * (lv - 1),
    agility: BASE_ATTRIBUTES.agility + LEVEL_GROWTH.agility * (lv - 1),
    intellect: BASE_ATTRIBUTES.intellect + LEVEL_GROWTH.intellect * (lv - 1),
    armor: BASE_ATTRIBUTES.armor,
  };
}

/**
 * Base attributes + the sum of equipped items' EQUIPMENT_STATS bonuses. Returns a NEW
 * object (never mutates base). `equipment` is a slot->itemName map (null = empty).
 */
export function computeEffective(baseAttrs, equipment, statsTable) {
  const eff = { ...(baseAttrs || {}) };
  for (const itemName of Object.values(equipment || {})) {
    const bonuses = itemName && statsTable ? statsTable[itemName] : null;
    if (!bonuses) continue;
    if (bonuses.strength) eff.strength = (eff.strength || 0) + bonuses.strength;
    if (bonuses.agility) eff.agility = (eff.agility || 0) + bonuses.agility;
    if (bonuses.intellect) eff.intellect = (eff.intellect || 0) + bonuses.intellect;
    if (bonuses.armor) eff.armor = (eff.armor || 0) + bonuses.armor;
  }
  return eff;
}

/** Derived resource caps from level + EFFECTIVE attributes. */
export function deriveMaxStats(level, effectiveAttrs) {
  const lv = Math.max(1, level || 1);
  const str = (effectiveAttrs && effectiveAttrs.strength) || 0;
  const int = (effectiveAttrs && effectiveAttrs.intellect) || 0;
  return {
    maxHealth: 100 + (lv - 1) * 10 + str * 5,
    maxMana: 100 + (lv - 1) * 5 + int * 2,
  };
}
