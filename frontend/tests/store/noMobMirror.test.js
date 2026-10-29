import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// THE MOB MIRROR IS GONE (reset plan row 9; the HUD lane's task script, decision 2). A 250 ms copy of the ECS's mobs in
// the store fed the minimap, the compass and chain lightning, and a copy can be read stale: chain lightning was already
// moved to the live query, and the minimap and compass now read it too. The one scalar that stays is the hostile count
// the music subscribes to (systems/hostileCount.js, written by SpawnerSystem's 1 s pass).
describe('the store holds no copy of the mobs', () => {
  it('no mirror field or setter, and the hostile count the music reads is still there', () => {
    const s = useGameStore.getState();
    expect(typeof s.setActiveHostilesCount, 'SETUP: the store under test is not the game store').toBe('function');
    expect(s.activeHostilesCount).toBe(0);
    for (const k of ['mobEntities', 'setMobEntities', 'npcEntities', 'setNpcEntities', '_lastMinimapUpdate']) {
      expect(k in s, `the store holds ${k} again: a second, stale copy of the ECS mobs`).toBe(false);
    }
  });
});
