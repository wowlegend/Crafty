import { describe, it, expect } from 'vitest';
import { archetypeFor, ARCHETYPES, DEFAULT_ARCHETYPE } from './mobArchetypes.js';
import { MOB_TYPES } from './mobTypes.js';

// STATUS §E3 — ten silhouettes, three behaviour arms. Five hostiles (zombie, skitterling, duskhound,
// moss_brute, emberhusk) shared one beeline-and-bonk brain, so the moss-brute looked like a tank and played
// like a zombie.

describe('the defaults reproduce the worker exactly — the safety property', () => {
  // This is the assertion that makes the change shippable. Every number below is the literal ai.worker.js
  // used before the table existed; if one drifts, EVERY mob in the game is silently re-tuned by a
  // one-line edit. It is asserted rather than trusted because that failure would be invisible in play
  // until the balance felt wrong for reasons nobody could trace.
  it('matches the original module-scope constants', () => {
    expect(DEFAULT_ARCHETYPE.aggroRange).toBe(20);
    expect(DEFAULT_ARCHETYPE.leashMult).toBe(1.5);
    expect(DEFAULT_ARCHETYPE.meleeRange).toBe(2.5);
    expect(DEFAULT_ARCHETYPE.attackCooldown).toBe(1500);
    expect(DEFAULT_ARCHETYPE.verticalReach).toBe(2.5);
  });

  it('leaves an untuned hostile exactly at the baseline', () => {
    // zombie and emberhusk are deliberately undesigned: a baseline must exist or "distinct" means nothing.
    for (const t of ['zombie', 'emberhusk']) {
      expect(archetypeFor(t), `${t} should be baseline`).toEqual(DEFAULT_ARCHETYPE);
    }
  });

  it('falls back for an unknown type rather than returning undefined fields', () => {
    // A new MOB_TYPES entry must play as the baseline, never with NaN ranges.
    const a = archetypeFor('not-a-mob');
    expect(a).toEqual(DEFAULT_ARCHETYPE);
    for (const v of Object.values(archetypeFor(undefined))) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('the designed archetypes actually differ, and in the argued direction', () => {
  it('the moss brute is relentless: longer leash, longer reach, slower swing', () => {
    const b = archetypeFor('moss_brute');
    expect(b.leashMult).toBeGreaterThan(DEFAULT_ARCHETYPE.leashMult);
    expect(b.meleeRange).toBeGreaterThan(DEFAULT_ARCHETYPE.meleeRange);
    expect(b.attackCooldown).toBeGreaterThan(DEFAULT_ARCHETYPE.attackCooldown); // slower, so it is dodgeable
  });

  it('the skitterling swarms: quick bites, tiny reach, and it gives up', () => {
    const s = archetypeFor('skitterling');
    expect(s.attackCooldown).toBeLessThan(DEFAULT_ARCHETYPE.attackCooldown);
    expect(s.meleeRange).toBeLessThan(DEFAULT_ARCHETYPE.meleeRange);
    expect(s.leashMult).toBeLessThan(DEFAULT_ARCHETYPE.leashMult); // escapable, unlike the brute
  });

  it('the duskhound hunts: it finds you from further away and bites faster', () => {
    const d = archetypeFor('duskhound');
    expect(d.aggroRange).toBeGreaterThan(DEFAULT_ARCHETYPE.aggroRange);
    expect(d.attackCooldown).toBeLessThan(DEFAULT_ARCHETYPE.attackCooldown);
  });

  it('no two designed archetypes are the same creature', () => {
    // The whole point is differentiation, so identical profiles would be a silent no-op.
    const seen = new Set(Object.keys(ARCHETYPES).map((k) => JSON.stringify(archetypeFor(k))));
    expect(seen.size).toBe(Object.keys(ARCHETYPES).length);
  });

  it('every designed archetype names a REAL mob type', () => {
    // A typo'd key would sit here looking designed and never apply to anything.
    for (const key of Object.keys(ARCHETYPES)) {
      expect(MOB_TYPES, `${key} is not in MOB_TYPES`).toHaveProperty(key);
      expect(MOB_TYPES[key].passive, `${key} is passive — an archetype cannot apply`).toBeFalsy();
    }
  });

  it('every value stays physically sane — no zero cooldowns or negative reach', () => {
    for (const key of [...Object.keys(ARCHETYPES), 'zombie']) {
      const a = archetypeFor(key);
      expect(a.attackCooldown).toBeGreaterThan(0);
      expect(a.meleeRange).toBeGreaterThan(0);
      expect(a.aggroRange).toBeGreaterThan(0);
      expect(a.leashMult).toBeGreaterThanOrEqual(1); // a leash inside aggro range would thrash on/off
      expect(a.verticalReach).toBeGreaterThan(0);
    }
  });
});
