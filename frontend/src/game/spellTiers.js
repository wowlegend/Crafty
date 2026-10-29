/**
 * spellTiers.js — the four spells' tiers and the player level that unlocks each (pure data and one lookup). A spell
 * casts at the highest tier its caster's level has reached, so spells scale with level and no click buys a tier
 * (DECISIONS 2026-10-28 W1-H item 6). The levels are the ones the retired free mastery click allowed: II at level 2
 * (fireball, iceball) or 3 (lightning, arcane), III at level 5. Tier I equals SPELL_TYPES' base damage and
 * SPELL_MANA_COSTS, so a level-1 cast is what an unlevelled one was.
 */
export const SPELL_TIERS = Object.freeze({
  fireball: Object.freeze({
    name: 'Fireball',
    tiers: Object.freeze([
      Object.freeze({ minLevel: 1, damage: 50, manaCost: 15, name: 'Fireball I' }),
      Object.freeze({ minLevel: 2, damage: 80, manaCost: 18, name: 'Fireball II' }),
      Object.freeze({ minLevel: 5, damage: 120, manaCost: 22, name: 'Fireball III' }),
    ]),
  }),
  iceball: Object.freeze({
    name: 'Iceball',
    tiers: Object.freeze([
      Object.freeze({ minLevel: 1, damage: 40, manaCost: 12, name: 'Iceball I' }),
      Object.freeze({ minLevel: 2, damage: 65, manaCost: 15, name: 'Iceball II' }),
      Object.freeze({ minLevel: 5, damage: 100, manaCost: 19, name: 'Iceball III' }),
    ]),
  }),
  lightning: Object.freeze({
    name: 'Lightning',
    tiers: Object.freeze([
      Object.freeze({ minLevel: 1, damage: 75, manaCost: 25, name: 'Lightning I' }),
      Object.freeze({ minLevel: 3, damage: 110, manaCost: 30, name: 'Lightning II' }),
      Object.freeze({ minLevel: 5, damage: 160, manaCost: 35, name: 'Lightning III' }),
    ]),
  }),
  arcane: Object.freeze({
    name: 'Arcane',
    tiers: Object.freeze([
      Object.freeze({ minLevel: 1, damage: 60, manaCost: 18, name: 'Arcane I' }),
      Object.freeze({ minLevel: 3, damage: 90, manaCost: 22, name: 'Arcane II' }),
      Object.freeze({ minLevel: 5, damage: 140, manaCost: 28, name: 'Arcane III' }),
    ]),
  }),
});

/** The tier row `spellType` casts at for a caster of `level`, or null for a spell with no tiers. */
export function spellStatsAt(spellType, level) {
  if (!Object.prototype.hasOwnProperty.call(SPELL_TIERS, spellType)) return null;
  const spell = SPELL_TIERS[spellType];
  const lv = Number.isFinite(level) ? level : 1;
  let row = spell.tiers[0];
  for (const t of spell.tiers) if (lv >= t.minLevel) row = t;
  return row;
}
