import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { resolveCastManaCost } from '../../src/utils/spellCast.js';
import { SPELL_MANA_COSTS } from '../../src/GameSystems.jsx';

// W1 TASK 9 (mana-wire): the cast used to read the LEVELED damage from getSpellStats but charge the STATIC
// SPELL_MANA_COSTS, so L2/L3 mana upgrades were free. The original version of THIS test was a rubber-stamp:
// it stubbed getSpellStats, re-read that same stubbed value, and fed it into useMana(18) directly — it never
// touched the production resolution expression, so reverting the source to charge the static base left it
// green. It only re-proved that useMana subtracts its argument (covered elsewhere).
//
// This rewrite guards the actual fix. It exercises the REAL production seam (resolveCastManaCost — the exact
// function EnhancedMagicSystem.jsx feeds into useMana) against the REAL static fallback table, then drives
// the result through the REAL useMana store action. The branch coverage of the seam itself lives in
// tests/unit/spellCast.test.js; the source-wiring (that EnhancedMagicSystem actually calls this seam) is
// locked by tests/gates/spell-cast-level-wire-gates.test.js. Together those fail closed on a revert.
describe('cast charges the leveled mana cost (production seam, end-to-end)', () => {
  beforeEach(() => useGameStore.setState({ mana: 100, maxMana: 100, isAlive: true }));

  it('an UPGRADED fireball (leveled manaCost 18) drains 18, not the static 15', () => {
    // getSpellStats mirrors the spell-upgrade hook; an L2 fireball reports a higher manaCost than the base.
    const getSpellStats = (t) => ({ fireball: { damage: 80, manaCost: 18 } }[t]);
    // resolve via the SAME seam the production castSpell uses, with the SAME static fallback table.
    const manaCost = resolveCastManaCost(getSpellStats, 'fireball', SPELL_MANA_COSTS.fireball);
    expect(manaCost).toBe(18); // leveled cost, NOT the static SPELL_MANA_COSTS.fireball (15)
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(82); // 100 - 18; the static path would have left 85
  });

  it('a pre-mount cast (getSpellStats not yet pushed) falls back to the static base', () => {
    // getSpellStats is undefined before EnhancedMagicSystem mounts — the cast must still charge the base.
    const manaCost = resolveCastManaCost(undefined, 'fireball', SPELL_MANA_COSTS.fireball);
    expect(manaCost).toBe(15); // static fireball base
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(85);
  });

  it('an unmapped spell (no upgrade-table entry) charges the static base', () => {
    const getSpellStats = () => null; // this spell has no entry in the upgrade table
    const manaCost = resolveCastManaCost(getSpellStats, 'arcane', SPELL_MANA_COSTS.arcane);
    expect(manaCost).toBe(18); // static arcane base
    useGameStore.getState().useMana(manaCost);
    expect(useGameStore.getState().mana).toBe(82);
  });
});
