import { describe, it, expect } from 'vitest';
import { solveChainTargets } from './chainLightning';

const mob = (id, x, y = 0, z = 0, extra = {}) => ({ id, health: 50, position: { x, y, z }, ...extra });
const OPTS = { excludeId: 99, baseDamage: 100, maxChains: 3, range: 10, damageReduction: 0.3 };
const ORIGIN = { x: 0, y: 0, z: 0 };

describe('solveChainTargets', () => {
  it('chains nearest-next, in order', () => {
    const mobs = [mob(1, 5), mob(2, 12), mob(3, 20)];
    const hits = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(hits.map((h) => h.id)).toEqual([1, 2, 3]); // each hop within 10 of the last
  });
  it('nearest is measured in all three axes', () => {
    // Mob 4 is nearest in 3D (12 vs 16); with any one axis dropped, the mob on that axis wins.
    const mobs = [mob(1, 4, 0, 0), mob(2, 0, 4, 0), mob(3, 0, 0, 4), mob(4, 2, 2, 2)];
    const [first] = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(first.id).toBe(4);
  });
  it('the per-hop falloff: the arcs are weak echoes — first arc = base*r, then x(1-r), floored', () => {
    const mobs = [mob(1, 5), mob(2, 12), mob(3, 20)];
    const hits = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(hits.map((h) => h.damage)).toEqual([30, 21, 14]); // 100*.3=30, *.7=21, *.7=14.7->14
  });
  it('the range cutoff ends the chain', () => {
    const mobs = [mob(1, 5), mob(2, 30)];
    const hits = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(hits.map((h) => h.id)).toEqual([1]); // 25u to the next > range 10
  });
  it('excludeId (the direct-hit victim) is never chained', () => {
    const mobs = [mob(99, 1), mob(2, 5)];
    const hits = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(hits.map((h) => h.id)).toEqual([2]);
  });
  it('maxChains bounds the chain; a mob is never hit twice', () => {
    const mobs = [mob(1, 5), mob(2, 8), mob(3, 11), mob(4, 14), mob(5, 17)];
    const hits = solveChainTargets(mobs, ORIGIN, { ...OPTS, maxChains: 3 });
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((h) => h.id)).size).toBe(3);
  });
  it('a dead or dissolving mob is skipped, and the chain goes on to the live one beyond it', () => {
    const mobs = [mob(1, 2, 0, 0, { health: 0 }), mob(2, 3, 0, 0, { dyingUntil: 1 }), mob(3, 6)];
    const hits = solveChainTargets(mobs, ORIGIN, OPTS);
    expect(hits.map((h) => h.id)).toEqual([3]);
  });
  it('a hop reports where its mob stands', () => {
    const [hop] = solveChainTargets([mob(1, 5, 1, -2)], ORIGIN, OPTS);
    expect([hop.position.x, hop.position.y, hop.position.z]).toEqual([5, 1, -2]);
  });
  it('empty/null mobs -> []', () => {
    expect(solveChainTargets([], ORIGIN, OPTS)).toEqual([]);
    expect(solveChainTargets(null, ORIGIN, OPTS)).toEqual([]);
  });
});
