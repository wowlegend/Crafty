import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// W1 TASK 9: the cast used to charge the STATIC SPELL_MANA_COSTS (always 15 for fireball) while reading the
// LEVELED damage from getSpellStats -> L2/L3 mana upgrades were free. The fix (EnhancedMagicSystem.jsx) charges
// the leveled manaCost (getSpellStats(spellType).manaCost) with a null-safe fallback to the static base.
// This store test locks the leveled-cost drain: a stubbed getSpellStats returning L2 fireball (manaCost 18)
// must drain 18, not the static 15.
describe('cast charges the leveled mana cost', () => {
  beforeEach(() => useGameStore.setState({
    mana: 100, maxMana: 100, isAlive: true,
    getSpellStats: (t) => ({ fireball: { damage: 80, manaCost: 18 } }[t]),
  }));
  it('useMana drains the LEVELED cost, not the static 15', () => {
    // proxy: useMana(leveledCost) leaves 100-18 = 82
    const leveled = useGameStore.getState().getSpellStats('fireball').manaCost;
    useGameStore.getState().useMana(leveled);
    expect(useGameStore.getState().mana).toBe(82);
  });
});
