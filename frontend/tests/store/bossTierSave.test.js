import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { buildSaveData } from '../../src/game/saveSchema';
import { bossTierStats } from '../../src/game/bossTier.js';

// QUEUE C3 — the boss tier survives a reload through the REAL save path (buildSaveData -> loadWorldData),
// not just the pure serialize/hydrate pair: a field the store never hands to the schema, or the load path
// never writes back, is dropped silently by either side.
//
// Mutation-Proof: by hand (cp backup, byte-verified restore), each RED:
//   S1 loadWorldData drops bossTier on the floor      S2 the load path stops passing nightCount
//   S3 plausible-wrong: the load path still pins maxHealth to BOSS_CONFIG.health (a tier-1 fight clamps to 700)
const POS = { position: { x: 0, y: 18, z: 0 } };
const reload = (over) => {
  const save = buildSaveData({ ...useGameStore.getState(), ...over }, POS);
  useGameStore.getState().loadWorldData(JSON.parse(JSON.stringify(save)));
  return useGameStore.getState();
};

describe('boss tier save round-trip (C3)', () => {
  beforeEach(() => useGameStore.setState({
    gameWon: false, bossTier: 0, bossKillNight: 0, bossActive: false, bossDefeated: false, nightCount: 0,
    bossHealth: bossTierStats(0).health,
  }));

  it('a slain tier and its kill night come back exactly', () => {
    const s = reload({ gameWon: true, bossTier: 2, bossKillNight: 17, bossDefeated: true, bossHealth: 0, nightCount: 18 });
    expect(s.bossTier).toBe(2);
    expect(s.bossKillNight).toBe(17);
    expect(s.bossDefeated).toBe(true);
  });

  it('a RETURN fight in progress comes back at its own HP, above the tier-0 max', () => {
    const hp = bossTierStats(1).health - 50; // > 700
    const s = reload({ gameWon: true, bossTier: 1, bossKillNight: 4, bossActive: true, bossDefeated: false, bossHealth: hp, nightCount: 9 });
    expect(s.bossActive).toBe(true);
    expect(s.bossHealth).toBe(hp);
  });

  it('a won save from BEFORE tiers loads as one kill, its return counted from the night it was loaded on', () => {
    const save = buildSaveData({ ...useGameStore.getState(), gameWon: true, nightCount: 11 }, POS);
    delete save.game_state.bossState.tier;
    delete save.game_state.bossState.killNight;
    useGameStore.getState().loadWorldData(save);
    const s = useGameStore.getState();
    expect(s.bossTier).toBe(1);
    expect(s.bossKillNight).toBe(11);
    expect(s.bossActive).toBe(false);
  });
});
