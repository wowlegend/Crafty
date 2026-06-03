// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';

// M3b-T1: currency (coins). The store holds a single `coins` wallet (distinct from
// the `gold:8` block mining-XP value). addCoins(n) mutates it and CLAMPS at >= 0 so
// a reward never drives a negative balance and a (future) spend can't underflow.
// Persisted in the saveSchema progression slice + restored by loadWorldData (mirrors
// talentPoints), so a survived-night payout survives a save/reload.

describe('store coins wallet (addCoins)', () => {
  beforeEach(() => useGameStore.setState({ coins: 0 }));

  it('defaults to 0', () => {
    expect(useGameStore.getState().coins).toBe(0);
  });

  it('addCoins adds a positive amount', () => {
    useGameStore.getState().addCoins(25);
    expect(useGameStore.getState().coins).toBe(25);
    useGameStore.getState().addCoins(10);
    expect(useGameStore.getState().coins).toBe(35);
  });

  it('clamps the wallet at >= 0 (a negative amount can never drive it below zero)', () => {
    useGameStore.getState().addCoins(5);
    useGameStore.getState().addCoins(-100);
    expect(useGameStore.getState().coins).toBe(0);
  });

  it('tolerates a nullish/NaN amount as a no-op (does not corrupt the wallet)', () => {
    useGameStore.getState().addCoins(20);
    useGameStore.getState().addCoins(undefined);
    useGameStore.getState().addCoins(NaN);
    expect(useGameStore.getState().coins).toBe(20);
  });
});

describe('coins persistence (buildSaveData -> loadWorldData round-trip)', () => {
  beforeEach(() => useGameStore.setState({ terrainWorker: null, playerRigidBodyRef: null }));

  it('buildSaveData includes coins in the progression slice', () => {
    useGameStore.setState({ coins: 77 });
    const save = buildSaveData(useGameStore.getState(), { position: { x: 0, y: 18, z: 0 } });
    expect(save.progression.coins).toBe(77);
  });

  it('loadWorldData restores coins from the progression slice', () => {
    useGameStore.setState({ coins: 3 });
    const save = JSON.parse(JSON.stringify(buildSaveData({
      ...useGameStore.getState(),
      coins: 142,
    }, { position: { x: 0, y: 18, z: 0 } })));
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().coins).toBe(142);
  });

  it('a pre-coins save (no coins in progression) falls back to current coins (not wiped)', () => {
    useGameStore.setState({ coins: 9 });
    useGameStore.getState().loadWorldData({
      progression: { level: 4 }, // no coins key
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {},
    });
    expect(useGameStore.getState().coins).toBe(9); // fell back, not zeroed
  });
});
