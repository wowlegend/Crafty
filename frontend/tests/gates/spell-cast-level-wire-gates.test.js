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
    expect(ems).toMatch(/import \{ resolveCastBaseDamage \} from '\.\/utils\/spellCast'/);
    expect(ems).toMatch(/const baseDamage = resolveCastBaseDamage\(useGameStore\.getState\(\)\.getSpellStats, spell, spellType\)/);
    expect(ems).toMatch(/solveSpellDamage\(effectiveStats, baseDamage, spellType\)/);
  });

  it('the dev spawnDeterministicCast injector stays on the static base (spell-cast capture byte-stable)', () => {
    expect(ems).toMatch(/damage: spell\.damage/);
  });
});
