import { describe, it, expect } from 'vitest';
import { resolveCastBaseDamage, resolveCastManaCost } from '../../src/utils/spellCast.js';

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

// W1 #9 (mana-wire): castSpell read the leveled DAMAGE but charged the STATIC SPELL_MANA_COSTS, so the
// L2/L3 manaCost upgrade was never spent (mana upgrades were free). resolveCastManaCost is the pure,
// gate-able seam mirroring resolveCastBaseDamage: it charges the leveled manaCost from the store-mirrored
// getSpellStats, falling back to the static base (passed as staticBase) for an unmapped spell or a pre-mount
// cast. These three branches are exactly the fix's behavior — reverting the source to charge the static base
// would flip the leveled-cost assertion below to red.
describe('resolveCastManaCost (#9 mana-wire)', () => {
  it('charges the LEVELED manaCost when the hook provides it (L2/L3), NOT the static base', () => {
    const getSpellStats = (t) => (t === 'fireball' ? { damage: 80, manaCost: 18 } : null);
    // static base for fireball is 15; the leveled cost is 18 — must charge 18.
    expect(resolveCastManaCost(getSpellStats, 'fireball', 15)).toBe(18);
  });

  it('falls back to the static base when getSpellStats is null/undefined (pre-mount)', () => {
    expect(resolveCastManaCost(null, 'fireball', 15)).toBe(15);
    expect(resolveCastManaCost(undefined, 'fireball', 15)).toBe(15);
  });

  it('falls back to the static base for an unmapped spell (shield/heal not in the upgrade table)', () => {
    const getSpellStats = () => null; // shield/heal are absent from the upgrade table
    expect(resolveCastManaCost(getSpellStats, 'shield', 30)).toBe(30);
    expect(resolveCastManaCost(getSpellStats, 'heal', 40)).toBe(40);
  });

  it('falls back to the static base when the leveled entry omits manaCost', () => {
    const getSpellStats = () => ({ damage: 80 }); // no manaCost field
    expect(resolveCastManaCost(getSpellStats, 'fireball', 15)).toBe(15);
  });
});
