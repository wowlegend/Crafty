import { describe, it, expect } from 'vitest';
import { AFFIX_POOL, rollAffixes, foldAffixStats } from './affixes.js';

describe('AFFIX_POOL', () => {
  it('is a small fixed pool of {id,label,stat,value} (YAGNI first cut)', () => {
    expect(Array.isArray(AFFIX_POOL)).toBe(true);
    expect(AFFIX_POOL.length).toBeGreaterThanOrEqual(4);
    for (const a of AFFIX_POOL) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.label).toBe('string');
      expect(typeof a.stat).toBe('string');
      expect(typeof a.value).toBe('number');
    }
  });
});

describe('rollAffixes', () => {
  it('is deterministic for a given seed (same seed -> same affixes)', () => {
    const a = rollAffixes('iron_sword', 1, 12345);
    const b = rollAffixes('iron_sword', 1, 12345);
    expect(a).toEqual(b);
  });
  it('rolls the requested count, drawn from the pool, no duplicates', () => {
    const rolled = rollAffixes('iron_sword', 2, 7);
    expect(rolled.length).toBe(2);
    const ids = rolled.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rolled) expect(AFFIX_POOL.some((p) => p.id === r.id)).toBe(true);
  });
  it('clamps count to the pool size and floors at 0', () => {
    expect(rollAffixes('x', 999, 1).length).toBe(AFFIX_POOL.length);
    expect(rollAffixes('x', -3, 1).length).toBe(0);
  });
});

describe('foldAffixStats', () => {
  it('sums affix stat values into a stat delta map', () => {
    const delta = foldAffixStats([{ id: 'keen', stat: 'strength', value: 3 }, { id: 'tough', stat: 'armor', value: 5 }]);
    expect(delta.strength).toBe(3);
    expect(delta.armor).toBe(5);
  });
  it('stacks duplicate stats and returns {} for empty/nullish', () => {
    expect(foldAffixStats([{ id: 'a', stat: 'armor', value: 2 }, { id: 'b', stat: 'armor', value: 3 }]).armor).toBe(5);
    expect(foldAffixStats(null)).toEqual({});
    expect(foldAffixStats([])).toEqual({});
  });
});
