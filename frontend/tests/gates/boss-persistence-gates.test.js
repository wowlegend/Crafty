import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { BOSS_CONFIG } from '../../src/game/bossConfig.js';
import { phaseForHealth } from '../../src/game/bossPersistence.js';

// A-bis B2g — BEHAVIOURAL, not a source-grep.
//
// bossPersistence.test.js proves the pure rules. This file proves the WIRING, by driving the real store
// through the real serializer and the real `loadWorldData`. Without it the module could be perfect and
// simply never reached — which is the failure mode this repo keeps paying for: 85% of its gate corpus
// asserts source TEXT, and `save-consolidation-gates.test.js` next door checks that saveSchema.js merely
// CONTAINS the string "progression". A grep like that stays green if the field is written to a payload
// nobody loads.
//
// Deleting the `bossState` line from saveSchema, the hydrate from the store, or either field from the
// restored slice turns these red.

const MAX = BOSS_CONFIG.health;
const roundTrip = (overrides) => {
  useGameStore.setState(overrides);
  const payload = buildSaveData(useGameStore.getState(), { position: { x: 0, y: 18, z: 0 } });
  // Through JSON, exactly as it reaches disk — a value that cannot survive stringify is not persisted.
  const onDisk = JSON.parse(JSON.stringify(payload));
  useGameStore.setState({ bossHealth: MAX, bossActive: false, bossDefeated: false, gameWon: false });
  useGameStore.getState().loadWorldData(onDisk);
  return useGameStore.getState();
};

describe('B2g — the boss fight survives a reload', () => {
  beforeEach(() => {
    useGameStore.setState({ bossHealth: MAX, bossActive: false, bossDefeated: false, gameWon: false });
  });

  it('restores a fight in progress at the HP it was left at — the whole bug', () => {
    // Before this, the encounter was hook-local React state seeded from BOSS_CONFIG.health, so a refresh
    // at 5% HP handed the player back a full-health 700 HP dragon.
    const after = roundTrip({ bossHealth: 35, bossActive: true, bossDefeated: false });
    expect(after.bossHealth).toBe(35);
    expect(after.bossActive).toBe(true);
    expect(after.bossDefeated).toBe(false);
  });

  it('actually writes the encounter into the save payload', () => {
    useGameStore.setState({ bossHealth: 35, bossActive: true, bossDefeated: false });
    const payload = buildSaveData(useGameStore.getState(), {});
    expect(payload.game_state.bossState).toEqual({ health: 35, active: true, defeated: false });
  });

  it('does NOT persist the derived phase — one source for one fact', () => {
    useGameStore.setState({ bossHealth: 35, bossActive: true });
    expect(buildSaveData(useGameStore.getState(), {}).game_state.bossState).not.toHaveProperty('phase');
  });

  it('keeps a defeated dragon dead across the reload', () => {
    const after = roundTrip({ bossHealth: 0, bossActive: false, bossDefeated: true });
    expect(after.bossDefeated).toBe(true);
    expect(after.bossActive).toBe(false);
  });

  it('NEVER re-arms the dragon in a won game', () => {
    // S9c persists gameWon; a payload carrying active:true must not resurrect the boss into a beaten run.
    const after = roundTrip({ bossHealth: 300, bossActive: true, bossDefeated: false, gameWon: true });
    expect(after.bossActive).toBe(false);
    expect(after.bossDefeated).toBe(true);
  });

  it('reads a save written BEFORE boss state existed as a fresh encounter, not a half-dead dragon', () => {
    // Forward-compat: every save on disk today has no game_state.bossState at all.
    useGameStore.setState({ bossHealth: 1, bossActive: true, bossDefeated: false });
    const legacy = JSON.parse(JSON.stringify(buildSaveData(useGameStore.getState(), {})));
    delete legacy.game_state.bossState;
    useGameStore.getState().loadWorldData(legacy);
    const after = useGameStore.getState();
    expect(after.bossHealth).toBe(MAX);
    expect(after.bossActive).toBe(false);
    expect(after.bossDefeated).toBe(false);
  });

  it('clamps a payload whose health exceeds the configured max', () => {
    useGameStore.setState({ bossHealth: 1, bossActive: true });
    const tampered = JSON.parse(JSON.stringify(buildSaveData(useGameStore.getState(), {})));
    tampered.game_state.bossState.health = 999999;
    useGameStore.getState().loadWorldData(tampered);
    expect(useGameStore.getState().bossHealth).toBe(MAX);
  });

  it('never restores a NaN-HP dragon from a corrupted save', () => {
    // A NaN reaches disk as null through JSON. Restored as HP it makes the boss unkillable: every
    // comparison against it is false, so it can never cross zero.
    useGameStore.setState({ bossHealth: 1, bossActive: true });
    const corrupt = JSON.parse(JSON.stringify(buildSaveData(useGameStore.getState(), {})));
    corrupt.game_state.bossState.health = null;
    useGameStore.getState().loadWorldData(corrupt);
    expect(Number.isFinite(useGameStore.getState().bossHealth)).toBe(true);
  });
});

describe('B2g — the restored fight is phase-consistent', () => {
  it('the phase the hook seeds matches the restored health', () => {
    // The hook seeds bossPhase with phaseForHealth(store.bossHealth) rather than 0, so mounting mid-fight
    // does not fire the phase effect's "PHASE 3: ENRAGED!" banner for a transition already passed.
    useGameStore.setState({ bossHealth: MAX * 0.17, bossActive: true, bossDefeated: false, gameWon: false });
    const payload = JSON.parse(JSON.stringify(buildSaveData(useGameStore.getState(), {})));
    useGameStore.getState().loadWorldData(payload);
    expect(phaseForHealth(useGameStore.getState().bossHealth, MAX)).toBe(2);
  });
});
