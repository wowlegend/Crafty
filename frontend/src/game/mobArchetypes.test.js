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
    // RE-POINTED 2026-09-22 (C5/Q25). This asserted every value was a finite NUMBER, which was right
    // while the table held only numbers. `movement` is a STRING kind now, so the assertion is split
    // rather than relaxed: the numeric fields keep their NaN guard, and the new field gets a stronger
    // one than a blanket finite-check ever gave it — it must name a movement that actually exists.
    const MOVEMENTS = new Set(['beeline', 'flank', 'shoulder']);
    for (const [k, v] of Object.entries(archetypeFor(undefined))) {
      if (k === 'movement') {
        expect(MOVEMENTS.has(v), `unknown movement kind '${v}' — mobMovement would silently beeline`).toBe(true);
      } else {
        expect(Number.isFinite(v), `${k} is not a finite number`).toBe(true);
      }
    }
    // And EVERY designed archetype must name a real movement, not just the default. A typo here is
    // silent: movementGoal falls back to beeline, so the mob plays as undesigned and nothing errors.
    for (const type of ['moss_brute', 'skitterling', 'duskhound']) {
      expect(MOVEMENTS.has(archetypeFor(type).movement), `${type} names an unknown movement`).toBe(true);
    }
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
