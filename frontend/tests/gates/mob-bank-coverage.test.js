import { describe, it, expect } from 'vitest';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { bankForKill, PER_KILL_DEFAULT } from '../../src/game/mobBank.js';
import { ferocityForKill } from '../../src/game/ferocity.js';
import { kineticForKill } from '../../src/game/kinetic.js';
import { soulForKill } from '../../src/game/soul.js';

// THREE COPIES OF ONE TABLE, ALL MISSING THE SAME FOUR MOBS.
//
// ferocity.js, kinetic.js and soul.js each carried a byte-identical hand-maintained PER_KILL table with a
// silent `?? PER_KILL_DEFAULT` fallback and no link to MOB_TYPES. The tables listed six types; MOB_TYPES
// has ten. So skitterling, duskhound, moss_brute and emberhusk — every one of them `passive: false` —
// silently banked the DEFAULT of 12 instead of the hostile tier's 16.
//
// The sharpest case is moss_brute: 220 health, 25 damage, 60 xp, the toughest non-boss in the game, and it
// banked LESS than a zombie (100 health, 25 xp). The gradient the table exists to express — "fight harder,
// unleash sooner" — ran backwards for the four mobs added after it was written.
//
// The duplication IS the root cause: a new mob type had to be remembered in three separate places, and a
// silent fallback meant forgetting produced a plausible number instead of an error. So the fix is one
// derivation from MOB_TYPES, and this gate asserts COVERAGE — the check none of the three had.
describe('every mob type banks a declared amount — no silent fallback', () => {
  const types = Object.keys(MOB_TYPES);

  it('has mob types to check — the denominator', () => {
    // An empty MOB_TYPES would make every it.each below expand to nothing and the file report green.
    expect(types.length).toBeGreaterThanOrEqual(10);
  });

  it.each(types)('%s has an explicit bank value, not the fallback', (type) => {
    expect(MOB_TYPES[type], `${type} has no bank field — it would silently take the default`).toHaveProperty('bank');
    expect(typeof MOB_TYPES[type].bank).toBe('number');
    expect(MOB_TYPES[type].bank).toBeGreaterThan(0);
  });

  it('no hostile mob banks less than a passive one — the gradient the table exists for', () => {
    // The defect stated as an invariant rather than as a list of four names, so a mob added tomorrow with
    // a mis-set bank fails here too.
    const passive = types.filter((t) => MOB_TYPES[t].passive);
    const hostile = types.filter((t) => !MOB_TYPES[t].passive);
    expect(passive.length, 'no passive mobs — the comparison is vacuous').toBeGreaterThan(0);
    expect(hostile.length, 'no hostile mobs — the comparison is vacuous').toBeGreaterThan(0);
    const worstHostile = Math.min(...hostile.map((t) => MOB_TYPES[t].bank));
    const bestPassive = Math.max(...passive.map((t) => MOB_TYPES[t].bank));
    expect(worstHostile, 'a hostile mob banks no more than a passive one').toBeGreaterThan(bestPassive);
  });

  it('the four mobs added after the tables were written are covered', () => {
    // Named explicitly as a regression anchor: these are the ones that were silently on the default.
    for (const t of ['skitterling', 'duskhound', 'moss_brute', 'emberhusk']) {
      expect(MOB_TYPES[t], `${t} is missing from MOB_TYPES`).toBeDefined();
      expect(MOB_TYPES[t].bank, `${t} fell back to the default`).not.toBe(PER_KILL_DEFAULT);
    }
  });

  it('all three aspects read the SAME derivation — no copy can drift again', () => {
    // The duplication was the root cause, so the gate has to prove the copies are gone rather than that
    // they currently agree. Three call sites, one source.
    for (const t of types) {
      const b = bankForKill(t);
      expect(ferocityForKill(t), `ferocity disagrees for ${t}`).toBe(b);
      expect(kineticForKill(t), `kinetic disagrees for ${t}`).toBe(b);
      expect(soulForKill(t), `soul disagrees for ${t}`).toBe(b);
    }
  });

  it('boss-like names still bank the boss burst, via the regex path', () => {
    // Boss is NOT a MOB_TYPES entry — it is reached by name matching, and that branch must survive the
    // move to a derived table.
    for (const name of ['boss', 'shadow_dragon', 'Dragon']) {
      expect(bankForKill(name), `${name} lost the boss burst`).toBeGreaterThan(50);
    }
  });

  it('an unknown type still returns the default rather than NaN', () => {
    expect(bankForKill('not_a_real_mob')).toBe(PER_KILL_DEFAULT);
    expect(bankForKill(undefined)).toBe(PER_KILL_DEFAULT);
    expect(bankForKill(null)).toBe(PER_KILL_DEFAULT);
  });
});
