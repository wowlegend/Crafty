import { describe, it, expect } from 'vitest';
import { SPELL_TIERS, spellStatsAt } from './spellTiers.js';
import { SPELL_TYPES } from './spells.js';
import { SPELL_MANA_COSTS } from '../GameSystems';

// Spells scale with level (DECISIONS 2026-10-28 W1-H item 6): a spell casts at the highest tier its caster's level has
// reached. The levels are the ones the retired free mastery click allowed, so no player loses a tier they could buy.
const SPELLS = ['fireball', 'iceball', 'lightning', 'arcane'];
// The level each tier opened at under the click (requiredLevelForUpgrade over xpCost at main c3a0a7cb).
const CLICK_LEVELS = { fireball: [1, 2, 5], iceball: [1, 2, 5], lightning: [1, 3, 5], arcane: [1, 3, 5] };

describe('spellStatsAt', () => {
  it('casts every spell at the tier its level reached, at every level from 1 to 30', () => {
    let checked = 0;
    for (const spell of SPELLS) {
      for (let level = 1; level <= 30; level++) {
        const tierIndex = CLICK_LEVELS[spell].filter((m) => level >= m).length - 1;
        expect(spellStatsAt(spell, level), `${spell} at level ${level}`).toBe(SPELL_TIERS[spell].tiers[tierIndex]);
        checked++;
      }
    }
    expect(checked).toBe(SPELLS.length * 30);
  });

  it('casts tier I at level 1 with the static base damage and mana cost, so an unlevelled cast is unchanged', () => {
    for (const spell of SPELLS) {
      const row = spellStatsAt(spell, 1);
      expect(row.damage, spell).toBe(SPELL_TYPES[spell].damage);
      expect(row.manaCost, spell).toBe(SPELL_MANA_COSTS[spell]);
    }
  });

  it('has tiers that rise in damage and cost, and opens at levels that rise', () => {
    for (const spell of SPELLS) {
      const tiers = SPELL_TIERS[spell].tiers;
      expect(tiers.length, spell).toBe(3);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].damage, spell).toBeGreaterThan(tiers[i - 1].damage);
        expect(tiers[i].manaCost, spell).toBeGreaterThan(tiers[i - 1].manaCost);
        expect(tiers[i].minLevel, spell).toBeGreaterThan(tiers[i - 1].minLevel);
      }
    }
  });

  it('reads a non-finite level as level 1, and a spell with no tiers as null', () => {
    expect(spellStatsAt('fireball', NaN)).toBe(SPELL_TIERS.fireball.tiers[0]);
    expect(spellStatsAt('fireball', undefined)).toBe(SPELL_TIERS.fireball.tiers[0]);
    expect(spellStatsAt('shield', 10)).toBeNull();
  });
});
