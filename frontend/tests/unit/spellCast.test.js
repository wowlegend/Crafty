import { describe, it, expect } from 'vitest';
import { resolveCastBaseDamage } from '../../src/utils/spellCast.js';

// #51 S1 (cast-wire): castSpell used the static SPELL_TYPES base damage and never read the leveled value,
// so spell upgrades had ZERO combat effect. resolveCastBaseDamage is the pure, gate-able seam: it reads the
// leveled base from the store-mirrored getSpellStats with a null-safe fallback to the static base (so a
// pre-mount cast or an unmapped spell is byte-identical to today). Balance-safe: L1 leveled == static base.
describe('resolveCastBaseDamage (#51 cast-wire)', () => {
  const spell = { damage: 50 };

  it('falls back to the static base when getSpellStats is null (pre-mount)', () => {
    expect(resolveCastBaseDamage(null, spell, 'fireball')).toBe(50);
    expect(resolveCastBaseDamage(undefined, spell, 'fireball')).toBe(50);
  });

  it('reads the leveled damage when the hook provides it (L3)', () => {
    const getSpellStats = (t) => (t === 'fireball' ? { damage: 120, manaCost: 22 } : null);
    expect(resolveCastBaseDamage(getSpellStats, spell, 'fireball')).toBe(120);
  });

  it('falls back to base for an unknown/unmapped spell (getSpellStats returns null)', () => {
    const getSpellStats = () => null;
    expect(resolveCastBaseDamage(getSpellStats, { damage: 30 }, 'shield')).toBe(30);
  });
});
