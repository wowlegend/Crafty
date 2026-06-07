import { describe, it, expect } from 'vitest';
import { ASPECT_TREES, TALENT_LIMITS, foldTalentEffects, refundUnknownTalents } from './talentTree.js';

const allNodes = ASPECT_TREES.flatMap((t) => t.nodes);

describe('ASPECT_TREES shape', () => {
  it('has exactly 4 aspect trees', () => {
    expect(ASPECT_TREES).toHaveLength(4);
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
  it('every node has id/name/limit; effect is OPTIONAL (M6 signature/unlock nodes may omit it) and when present is {stat, perRank}', () => {
    for (const n of allNodes) {
      expect(typeof n.id).toBe('string');
      expect(typeof n.name).toBe('string');
      expect(n.limit).toBeGreaterThan(0);
      if (n.effect) { // effect-ful stat node
        expect(['strength', 'agility', 'intellect', 'armor']).toContain(n.effect.stat);
        expect(n.effect.perRank).toBeGreaterThan(0);
      }
    }
  });
  it('node ids are unique', () => {
    const ids = allNodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every prereq references a real node id', () => {
    const ids = new Set(allNodes.map((n) => n.id));
    for (const n of allNodes) if (n.prereq) expect(ids.has(n.prereq)).toBe(true);
  });
  it('TALENT_LIMITS is derived from the trees (single source — no dual map)', () => {
    for (const n of allNodes) expect(TALENT_LIMITS[n.id]).toBe(n.limit);
  });
});

describe('foldTalentEffects (derive, never mutate base)', () => {
  it('adds perRank * rank to the matching effective stat', () => {
    const base = { strength: 10, agility: 10, intellect: 10, armor: 0 };
    const out = foldTalentEffects(base, { voidhand_force: 2 }); // +3 STR/rank
    expect(out.strength).toBe(16);
    expect(base.strength).toBe(10); // base untouched
  });
  it('sums multiple talents + ignores unknown ids', () => {
    const out = foldTalentEffects({ strength: 10, agility: 10, intellect: 10, armor: 0 },
      { voidhand_ward: 3, wildheart_swift: 1, bogus_id: 5 }); // +18 armor, +4 agi
    expect(out.armor).toBe(18);
    expect(out.agility).toBe(14);
  });
  it('is read-idempotent (folding twice off the same base gives the same result)', () => {
    const base = { strength: 10, agility: 10, intellect: 10, armor: 0 };
    expect(foldTalentEffects(base, { soulbind_aegis: 2 }).armor).toBe(10);
    expect(foldTalentEffects(base, { soulbind_aegis: 2 }).armor).toBe(10);
  });
});

describe('refundUnknownTalents (migration)', () => {
  it('refunds ranks of stale (non-ASPECT_TREES) ids back into points + drops them', () => {
    const { unlockedTalents, talentPoints } = refundUnknownTalents({ frost_shield: 2, voidhand_force: 1 }, 0);
    expect(unlockedTalents).toEqual({ voidhand_force: 1 });
    expect(talentPoints).toBe(2);
  });
  it('no-op when all ids are valid', () => {
    const r = refundUnknownTalents({ voidhand_force: 1 }, 3);
    expect(r.unlockedTalents).toEqual({ voidhand_force: 1 });
    expect(r.talentPoints).toBe(3);
  });
});

describe('M6 signature nodes + effect-less fold-tolerance', () => {
  const wild = ASPECT_TREES.find((t) => t.aspect === 'wildheart');
  const roar = wild.nodes.find((n) => n.id === 'wildheart_roar');
  const endurance = wild.nodes.find((n) => n.id === 'wildheart_endurance');

  it('wildheart_roar is a pure unlock (effect-less, limit 1, prereq Beast Vigor)', () => {
    expect(roar).toBeDefined();
    expect(roar.effect).toBeUndefined();
    expect(roar.limit).toBe(1);
    expect(roar.prereq).toBe('wildheart_vigor');
  });

  it('wildheart_endurance is an effect-less ability-lever (prereq Primal Roar)', () => {
    expect(endurance).toBeDefined();
    expect(endurance.effect).toBeUndefined();
    expect(endurance.prereq).toBe('wildheart_roar');
    expect(endurance.limit).toBeGreaterThan(0);
  });

  it('TALENT_LIMITS includes the new nodes', () => {
    expect(TALENT_LIMITS.wildheart_roar).toBe(1);
    expect(TALENT_LIMITS.wildheart_endurance).toBe(endurance.limit);
  });

  it('REGRESSION: foldTalentEffects does NOT throw with an effect-less node unlocked (the crash fix)', () => {
    const base = { strength: 10, agility: 10, intellect: 10, armor: 0 };
    expect(() => foldTalentEffects(base, { wildheart_roar: 1 })).not.toThrow();
    expect(foldTalentEffects(base, { wildheart_roar: 1 })).toEqual(base); // the unlock folds to NOTHING (skipped)
    // ...and a co-unlocked stat node still folds normally (the unlock doesn't break the fold)
    const out = foldTalentEffects(base, { wildheart_roar: 1, wildheart_vigor: 2 });
    expect(out.strength).toBe(10 + 3 * 2); // Beast Vigor +3 STR/rank
  });

  it('refundUnknownTalents KEEPS the new nodes (they are known) + still drops stale ids', () => {
    const { unlockedTalents, talentPoints } = refundUnknownTalents({ wildheart_roar: 1, wildheart_endurance: 2, stale_id: 3 }, 0);
    expect(unlockedTalents.wildheart_roar).toBe(1);
    expect(unlockedTalents.wildheart_endurance).toBe(2);
    expect(unlockedTalents.stale_id).toBeUndefined();
    expect(talentPoints).toBe(3);
  });
});
