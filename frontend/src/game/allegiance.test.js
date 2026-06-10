import { describe, it, expect, afterEach } from 'vitest';
import { ecs, mobsQuery, alliesQuery } from '../ecs/world';
import { convertMobToAlly } from './allegiance';

const added = [];
const addMob = (props = {}) => {
  const e = ecs.add({ isMob: true, position: { x: 0, y: 1, z: 0 }, type: 'zombie', id: 9001,
    health: 12, maxHealth: 60, isAggro: true, color: '#4a7023', ...props });
  added.push(e);
  return e;
};
afterEach(() => { while (added.length) { try { ecs.remove(added.pop()); } catch { /* already removed */ } } });

describe('S2-B3-M3: the allegiance seam (query-exit conversion)', () => {
  it('conversion atomically exits mobsQuery and enters alliesQuery (the five-surface exclusion)', () => {
    const e = addMob();
    expect(mobsQuery.entities).toContain(e);
    const ally = convertMobToAlly(ecs, e);
    expect(ally).toBe(e); // IN PLACE — same entity object (position/type/color preserved)
    expect(mobsQuery.entities).not.toContain(e); // worker serializer + apply map + cull + cap + minimap + cone ALL read this query
    expect(alliesQuery.entities).toContain(e);
  });
  it('conversion heals to full, clears aggro, and records the base type (the fusion key)', () => {
    const e = addMob();
    convertMobToAlly(ecs, e);
    expect(e.health).toBe(e.maxHealth);
    expect(e.isAggro).toBe(false);
    expect(e.baseType).toBe('zombie');
  });
  it('refuses non-mobs and the villager (the quest-NPC blocklist)', () => {
    expect(convertMobToAlly(ecs, null)).toBe(null);
    const v = addMob({ type: 'villager' });
    expect(convertMobToAlly(ecs, v)).toBe(null);
    expect(mobsQuery.entities).toContain(v); // untouched
  });
  it('a stale worker update cannot stomp a converted ally (the fresh-entityMap construction, pinned)', () => {
    const e = addMob();
    convertMobToAlly(ecs, e);
    // the apply loop builds its map from mobsQuery.entities per message (:753-757) — simulate it:
    const entityMap = new Map();
    for (const m of mobsQuery.entities) { if (m.health > 0) entityMap.set(m.id, m); }
    expect(entityMap.get(e.id)).toBeUndefined(); // the stale TICK_RESULT for this id finds nothing
  });
});
