import { describe, it, expect } from 'vitest';
import { resolveCastBaseDamage, resolveCastManaCost } from './spellCast.js';

// Pure cast-resolution seam: the gameplay cast must read the LEVELED damage + manaCost from the
// store-mirrored getSpellStats (so spell upgrades actually affect combat), falling back to the static
// base when getSpellStats is absent (pre-mount) or the spell is unmapped (shield/heal). Locks the exact
// fallback semantics — damage uses `??` (0 is a real value), manaCost uses `||` (0 falls through).

const stats = (obj) => () => obj; // a getSpellStats stub returning the same object

describe('resolveCastBaseDamage', () => {
  it('prefers the leveled damage from getSpellStats', () => {
    expect(resolveCastBaseDamage(stats({ damage: 30 }), { damage: 20 }, 'fireball')).toBe(30);
  });
  it('falls back to the static spell base when getSpellStats is missing/null', () => {
    expect(resolveCastBaseDamage(null, { damage: 20 }, 'fireball')).toBe(20); // not a function
    expect(resolveCastBaseDamage(stats(null), { damage: 20 }, 'fireball')).toBe(20); // returns null
    expect(resolveCastBaseDamage(undefined, { damage: 20 }, 'shield')).toBe(20);
  });
  it('falls back when the leveled object has no damage field (?? on undefined)', () => {
    expect(resolveCastBaseDamage(stats({}), { damage: 20 }, 'fireball')).toBe(20);
  });
  it('honors a leveled damage of 0 (?? does NOT treat 0 as missing)', () => {
    expect(resolveCastBaseDamage(stats({ damage: 0 }), { damage: 20 }, 'fireball')).toBe(0);
  });
});

describe('resolveCastManaCost', () => {
  it('prefers the leveled manaCost from getSpellStats', () => {
    expect(resolveCastManaCost(stats({ manaCost: 20 }), 'fireball', 15)).toBe(20);
  });
  it('falls back to the static base when getSpellStats is missing/null', () => {
    expect(resolveCastManaCost(null, 'fireball', 15)).toBe(15); // not a function
    expect(resolveCastManaCost(stats(null), 'fireball', 15)).toBe(15); // returns null
    expect(resolveCastManaCost(stats({}), 'fireball', 15)).toBe(15); // no manaCost field
  });
  it('a leveled manaCost of 0 falls THROUGH to the static base (|| semantics)', () => {
    expect(resolveCastManaCost(stats({ manaCost: 0 }), 'fireball', 15)).toBe(15);
  });
  it('uses the documented final fallback of 15 when nothing else resolves', () => {
    expect(resolveCastManaCost(null, 'unmapped', undefined)).toBe(15);
    expect(resolveCastManaCost(null, 'unmapped', 0)).toBe(15); // 0 static also falls through
  });
});
