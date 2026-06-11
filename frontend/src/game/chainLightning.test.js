import { describe, it, expect } from 'vitest';
import { solveChainTargets } from './chainLightning';

// S3-M2 T3: the chain-targeting algorithm pure + characterized (extraction-only — the
// first-hop damage being pre-reduced by damageReduction is the LIVE behavior, kept as-is).
const mob = (id, x, y = 0, z = 0) => ({ id, position: [x, y, z] });
const OPTS = { excludeId: 99, baseDamage: 100, maxChains: 3, range: 10, damageReduction: 0.3 };

describe('solveChainTargets', () => {
  it('chains nearest-next, in order', () => {
    const mobs = [mob(1, 5), mob(2, 12), mob(3, 20)];
    const hits = solveChainTargets(mobs, { x: 0, y: 0, z: 0 }, OPTS);
    expect(hits.map((h) => h.id)).toEqual([1, 2, 3]); // each hop within 10 of the last
  });
  it('the per-hop falloff: the arcs are weak ECHOES — first arc = base*r, then x(1-r), floored', () => {
    const mobs = [mob(1, 5), mob(2, 12), mob(3, 20)];
    const hits = solveChainTargets(mobs, { x: 0, y: 0, z: 0 }, OPTS);
    expect(hits.map((h) => h.damage)).toEqual([30, 21, 14]); // 100*.3=30, *.7=21, *.7=14.7->14
  });
  it('the range cutoff ends the chain', () => {
    const mobs = [mob(1, 5), mob(2, 30)];
    const hits = solveChainTargets(mobs, { x: 0, y: 0, z: 0 }, OPTS);
    expect(hits.map((h) => h.id)).toEqual([1]); // 25u to the next > range 10
  });
  it('excludeId (the direct-hit victim) is never chained', () => {
    const mobs = [mob(99, 1), mob(2, 5)];
    const hits = solveChainTargets(mobs, { x: 0, y: 0, z: 0 }, OPTS);
    expect(hits.map((h) => h.id)).toEqual([2]);
  });
  it('maxChains bounds the chain; a mob is never hit twice', () => {
    const mobs = [mob(1, 5), mob(2, 8), mob(3, 11), mob(4, 14), mob(5, 17)];
    const hits = solveChainTargets(mobs, { x: 0, y: 0, z: 0 }, { ...OPTS, maxChains: 3 });
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((h) => h.id)).size).toBe(3);
  });
  it('empty/null mobs -> []', () => {
    expect(solveChainTargets([], { x: 0, y: 0, z: 0 }, OPTS)).toEqual([]);
    expect(solveChainTargets(null, { x: 0, y: 0, z: 0 }, OPTS)).toEqual([]);
  });
});
