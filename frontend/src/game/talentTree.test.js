import { describe, it, expect } from 'vitest';
import { ASPECT_TREES, TALENT_LIMITS, foldTalentEffects, refundUnknownTalents } from './talentTree.js';

const allNodes = ASPECT_TREES.flatMap((t) => t.nodes);

describe('ASPECT_TREES shape', () => {
  it('has exactly 4 aspect trees', () => {
    expect(ASPECT_TREES).toHaveLength(4);
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
  it('every node has id/name/desc/limit and an effect {stat, perRank}', () => {
    for (const n of allNodes) {
      expect(typeof n.id).toBe('string');
      expect(typeof n.name).toBe('string');
      expect(n.limit).toBeGreaterThan(0);
      expect(['strength', 'agility', 'intellect', 'armor']).toContain(n.effect.stat);
      expect(n.effect.perRank).toBeGreaterThan(0);
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
