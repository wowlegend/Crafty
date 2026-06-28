import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { buildSaveData } from '../../src/game/saveSchema';

// S9c WIN-STATE (2026-06-28 audit): the VictoryOverlay gates on bossSystem.bossDefeated, which is
// transient useState — so a win was FORGOTTEN on reload AND the slain dragon became spawn-eligible
// again. gameWon is now a persisted, one-way store flag serialized in game_state.
describe('win-state persistence (S9c gameWon)', () => {
  beforeEach(() => useGameStore.setState({ gameWon: false }));

  it('starts false and markGameWon latches it true (one-way)', () => {
    expect(useGameStore.getState().gameWon).toBe(false);
    useGameStore.getState().markGameWon();
    expect(useGameStore.getState().gameWon).toBe(true);
    useGameStore.getState().markGameWon(); // idempotent
    expect(useGameStore.getState().gameWon).toBe(true);
  });

  it('buildSaveData serializes gameWon into game_state', () => {
    expect(buildSaveData({ gameWon: true }).game_state.gameWon).toBe(true);
    expect(buildSaveData({ gameWon: false }).game_state.gameWon).toBe(false);
  });

  it('loadWorldData restores a persisted win across reload', () => {
    useGameStore.setState({ gameWon: false });
    const save = buildSaveData({ ...useGameStore.getState(), gameWon: true }, { position: { x: 0, y: 18, z: 0 } });
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().gameWon).toBe(true);
  });
});
