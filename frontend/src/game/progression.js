/**
 * progression.js — pure, React-free RPG progression math. The single home for the
 * three formulas that were duplicated across useGameStore + GameSystems. Persist BASE
 * data; DERIVE effective attributes + max stats on read (never bake), so save/reload
 * and respec never double-count. Node-testable (no THREE / store / React imports).
 */

/** XP required to advance FROM `level` to the next. floor(100 * 1.5^(level-1)). */
export function xpForLevel(level) {
  const lv = Math.max(1, level || 1);
  return Math.floor(100 * Math.pow(1.5, lv - 1));
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
