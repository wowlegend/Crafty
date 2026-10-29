import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { resolveCastManaCost } from '../../src/utils/spellCast.js';
import { SPELL_MANA_COSTS } from '../../src/GameSystems.jsx';

// A cast charges the manaCost of the tier row its caster's level reached (the store's getSpellStats, game/spellTiers.js),
// not the static SPELL_MANA_COSTS. This drives the production seam (resolveCastManaCost, the function
// EnhancedMagicSystem.jsx feeds into useMana) against the real static fallback table, then through the real useMana.
// The seam's branches are tests/unit/spellCast.test.js; that EnhancedMagicSystem calls it is
// tests/gates/spell-cast-level-wire-gates.test.js.
describe('cast charges the leveled mana cost (production seam, end-to-end)', () => {
  beforeEach(() => useGameStore.setState({ mana: 100, maxMana: 100, isAlive: true }));

  it('a higher tier\'s manaCost (18) drains 18, not the static 15', () => {
    // A stand-in tier row whose manaCost is above the static base, so the two paths give different numbers.
    const getSpellStats = (t) => ({ fireball: { damage: 80, manaCost: 18 } }[t]);
    // resolve via the SAME seam the production castSpell uses, with the SAME static fallback table.
    const manaCost = resolveCastManaCost(getSpellStats, 'fireball', SPELL_MANA_COSTS.fireball);
    expect(manaCost).toBe(18); // leveled cost, NOT the static SPELL_MANA_COSTS.fireball (15)
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(82); // 100 - 18; the static path would have left 85
  });

  it('with no getSpellStats to read, the cast falls back to the static base', () => {
    // resolveCastManaCost accepts a missing reader; the store always provides one, so this is the seam's own fallback.
    const manaCost = resolveCastManaCost(undefined, 'fireball', SPELL_MANA_COSTS.fireball);
    expect(manaCost).toBe(15); // static fireball base
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(85);
  });

  it('a null getSpellStats (pre-mount / no leveled stats) charges the static base', () => {
    const getSpellStats = () => null; // hook not mounted yet -> null -> fall back to the static base
    const manaCost = resolveCastManaCost(getSpellStats, 'arcane', SPELL_MANA_COSTS.arcane);
    expect(manaCost).toBe(18); // static arcane base
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(82);
  });
});
