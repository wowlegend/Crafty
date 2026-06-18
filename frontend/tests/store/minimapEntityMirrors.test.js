import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// W3 M-HUD.8 spec-review fix: the RadialMinimap consumer reads BOTH `mobEntities` and `npcEntities`
// from the store. The static radial-minimap gate only asserts source string-presence (false-green —
// it passed even while the `npcEntities` mirror did not exist, so NPC blips never rendered live).
// This is the RUNTIME assertion: the store must actually expose the npcEntities field + setNpcEntities
// setter, mirroring the mobEntities path the spec ("plots mob + NPC blips from the store mirrors")
// requires. Rapier-free / store-only, so it runs in the unit suite.

beforeEach(() => {
  useGameStore.setState({ mobEntities: [], npcEntities: [] });
});

describe('minimap store mirrors (mob + NPC blip sources)', () => {
  it('exposes both entity mirrors as arrays with their setters', () => {
    const s = useGameStore.getState();
    expect(Array.isArray(s.mobEntities)).toBe(true);
    expect(Array.isArray(s.npcEntities)).toBe(true);
    expect(typeof s.setMobEntities).toBe('function');
    expect(typeof s.setNpcEntities).toBe('function');
  });

  it('setNpcEntities mirrors the mob path: replaces the array AND accepts an updater fn', () => {
    const npc = { id: 1, type: 'villager', position: [3, 0, -7] };
    useGameStore.getState().setNpcEntities([npc]);
    expect(useGameStore.getState().npcEntities).toEqual([npc]);

    // functional-updater form (same contract as setMobEntities)
    useGameStore.getState().setNpcEntities((prev) => [...prev, { id: 2, type: 'pig', position: [0, 0, 0] }]);
    expect(useGameStore.getState().npcEntities).toHaveLength(2);
  });

  it('the npc mirror carries the position the RadialMinimap consumer plots', () => {
    useGameStore.getState().setNpcEntities([{ id: 9, type: 'villager', position: [12, 0, 34] }]);
    const n = useGameStore.getState().npcEntities[0];
    expect(n.position[0]).toBe(12);
    expect(n.position[2]).toBe(34);
  });
});
