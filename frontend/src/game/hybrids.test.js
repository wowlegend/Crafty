import { describe, it, expect, afterEach } from 'vitest';
import { HYBRIDS, fuseKey, lookupHybrid, applyFusion } from './hybrids';
import { ecs, alliesQuery } from '../ecs/world';

const added = [];
const addAlly = (id, baseType, x = 0) => {
  const e = ecs.add({ isAlly: true, position: { x, y: 10, z: 0 }, type: baseType, baseType, id,
    health: 60, maxHealth: 60, color: '#3DFFB0' });
  added.push(e);
  return e;
};
afterEach(() => { while (added.length) { try { ecs.remove(added.pop()); } catch { /* gone */ } } });

describe('S2-B3-M6: the curated hybrid roster', () => {
  it('carries the 3 designed hybrids keyed by sorted base pairs', () => {
    expect(lookupHybrid('spider', 'zombie').id).toBe('dreadweaver');
    expect(lookupHybrid('zombie', 'spider').id).toBe('dreadweaver'); // order-free
    expect(lookupHybrid('cow', 'skeleton').id).toBe('bonehide_bulwark');
    expect(lookupHybrid('skeleton', 'spider').id).toBe('marrowspinner');
    expect(lookupHybrid('pig', 'pig')).toBeUndefined(); // no entry -> no fuse (the channel never starts)
  });
  it('every hybrid is complete parametric MobModel data (render-ready, no lookups at draw time)', () => {
    for (const h of Object.values(HYBRIDS)) {
      for (const k of ['id', 'name', 'color', 'bodySize', 'headSize', 'health', 'speed', 'damage']) {
        expect(h[k], `${h.id} missing ${k}`).toBeDefined();
      }
    }
  });
  it('applyFusion consumes BOTH allies and spawns the hybrid as an ALLY at their midpoint (first id reused)', () => {
    const a = addAlly(101, 'spider', 0);
    const b = addAlly(102, 'zombie', 4);
    const before = alliesQuery.entities.length;
    const hy = applyFusion(ecs, a, b);
    expect(hy).not.toBe(null);
    expect(alliesQuery.entities.length).toBe(before - 1); // two consumed, one born
    expect(hy.id).toBe(101);
    expect(hy.isAlly).toBe(true);
    expect(hy.hybridId).toBe('dreadweaver');
    expect(hy.position.x).toBeCloseTo(2); // the midpoint
    expect(hy.maxHealth).toBe(HYBRIDS.dreadweaver.health);
    added.push(hy);
  });
  it('applyFusion refuses a pair with no roster entry (defense in depth behind the start-gate)', () => {
    const a = addAlly(103, 'pig', 0);
    const b = addAlly(104, 'pig', 2);
    expect(applyFusion(ecs, a, b)).toBe(null);
    expect(alliesQuery.entities.length).toBeGreaterThanOrEqual(2); // untouched
  });
});
