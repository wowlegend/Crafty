import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ems = readFileSync(resolve(HERE, '../../src/EnhancedMagicSystem.jsx'), 'utf8');

// #51 S1: the gameplay castSpell now reads the LEVELED base damage (resolveCastBaseDamage -> getSpellStats)
// instead of the static spell.damage, so spell upgrades affect combat. The dev-only spawnDeterministicCast
// injector MUST stay on the static base so the spell-cast visual-capture frame is byte-stable.
describe('#51 S1 cast-wire (gameplay cast reads leveled damage)', () => {
  it('imports + uses resolveCastBaseDamage for the gameplay cast damage', () => {
    expect(ems).toMatch(/import \{ resolveCastBaseDamage(, resolveCastManaCost)? \} from '\.\/utils\/spellCast'/);
    expect(ems).toMatch(/const baseDamage = resolveCastBaseDamage\(useGameStore\.getState\(\)\.getSpellStats, spell, spellType\)/);
    expect(ems).toMatch(/solveSpellDamage\(effectiveStats, baseDamage, spellType\)/);
  });

  it('the dev spawnDeterministicCast injector stays on the static base (spell-cast capture byte-stable)', () => {
    expect(ems).toMatch(/damage: spell\.damage/);
  });
});

// W1 #9: the gameplay castSpell now CHARGES the LEVELED manaCost (resolveCastManaCost -> getSpellStats)
// instead of the static SPELL_MANA_COSTS, so L2/L3 mana upgrades are spent. This static gate fails closed if
// the source reverts to charging the static base directly (the rubber-stamp the original store-test missed).
describe('#9 mana-wire (gameplay cast charges leveled manaCost)', () => {
  it('imports + uses resolveCastManaCost for the gameplay cast mana charge', () => {
    expect(ems).toMatch(/import \{ resolveCastBaseDamage, resolveCastManaCost \} from '\.\/utils\/spellCast'/);
    // B7: resolveCastManaCost now feeds `baseManaCost`, which applyWandFocus reduces into the final
    // `manaCost` (the leveled-cost wiring is preserved — this gate still fails closed if the leveled
    // resolve is dropped for the static base).
    expect(ems).toMatch(/const baseManaCost = resolveCastManaCost\(useGameStore\.getState\(\)\.getSpellStats, spellType, SPELL_MANA_COSTS\[spellType\]\)/);
  });

  it('feeds the resolved manaCost into the useMana spend (not a re-read static base)', () => {
    expect(ems).toMatch(/useGameStore\.getState\(\)\.useMana\(manaCost\)/);
  });
});
