// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { dawnReward, DAWN_XP_PER_NIGHT, DAWN_COINS_PER_NIGHT } from '../../src/game/dayNight.js';
import { getItemRarity } from '../../src/data/items.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';

// M3b-T3: survive-to-dawn reward. dawnReward(nightNumber) is the PURE reward-math
// helper: XP + coins scale linearly with the night survived, and a single guaranteed
// loot item is picked from a rarity tier that climbs by night. grantDawnReward wires
// it: grantXP + addCoins + one addToInventory drop, once per dawn.

describe('dawnReward(nightNumber) — pure reward math', () => {
  it('XP + coins scale linearly with the night number', () => {
    expect(dawnReward(1).xp).toBe(DAWN_XP_PER_NIGHT * 1);     // 50
    expect(dawnReward(1).coins).toBe(DAWN_COINS_PER_NIGHT * 1); // 10
    expect(dawnReward(3).xp).toBe(DAWN_XP_PER_NIGHT * 3);     // 150
    expect(dawnReward(3).coins).toBe(DAWN_COINS_PER_NIGHT * 3); // 30
  });

  it('loot rarity climbs by night tier (rare -> epic -> legendary)', () => {
    expect(dawnReward(1).lootRarity).toBe('rare');
    expect(dawnReward(2).lootRarity).toBe('rare');
    expect(dawnReward(3).lootRarity).toBe('epic');
    expect(dawnReward(4).lootRarity).toBe('epic');
    expect(dawnReward(5).lootRarity).toBe('legendary');
    expect(dawnReward(99).lootRarity).toBe('legendary'); // plateau at the top tier
  });

  it('the chosen loot item actually has the claimed rarity (registry-consistent)', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      const r = dawnReward(n);
      expect(getItemRarity(r.lootItem)).toBe(r.lootRarity);
    }
  });

  it('clamps a nullish / <=0 / NaN night number to night 1 (never a zero/negative reward)', () => {
    expect(dawnReward(0).xp).toBe(DAWN_XP_PER_NIGHT);
    expect(dawnReward(-3).coins).toBe(DAWN_COINS_PER_NIGHT);
    expect(dawnReward(undefined).xp).toBe(DAWN_XP_PER_NIGHT);
    expect(dawnReward(NaN).lootRarity).toBe('rare');
  });
});

describe('store.grantDawnReward — grants XP + coins + one loot drop', () => {
  beforeEach(() => useGameStore.setState({
    level: 1, currentXP: 0, totalXP: 0,
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 0, unlockedTalents: {}, spellLevels: {},
    coins: 0, nightCount: 0, lastRewardedNight: 0,
    inventory: { blocks: {}, tools: {}, magic: {} },
  }));

  it('grants the scaled XP, coins, and exactly one guaranteed loot item (night 3)', () => {
    const expected = dawnReward(3);
    const before = useGameStore.getState().totalXP;
    useGameStore.getState().grantDawnReward(3);
    const s = useGameStore.getState();
    expect(s.totalXP).toBe(before + expected.xp);              // XP granted
    expect(s.coins).toBe(expected.coins);                      // coins granted
    expect(s.inventory.blocks[expected.lootItem]).toBe(1);     // one loot drop
  });

  it('returns the reward descriptor so the caller can render a toast', () => {
    const r = useGameStore.getState().grantDawnReward(2);
    expect(r.xp).toBe(dawnReward(2).xp);
    expect(r.coins).toBe(dawnReward(2).coins);
    expect(r.lootItem).toBe(dawnReward(2).lootItem);
  });

  it('is once-per-night: a second grant for the same (or lower) night is a no-op returning null', () => {
    // The once-per-night guard now lives IN the store (lastRewardedNight, persisted) so
    // it survives a hook remount / reload. First grant succeeds; a repeat for the same
    // night returns null and does NOT stack loot or re-grant coins/XP.
    const item = dawnReward(1).lootItem;
    const first = useGameStore.getState().grantDawnReward(1);
    expect(first).not.toBeNull();
    expect(useGameStore.getState().inventory.blocks[item]).toBe(1);
    expect(useGameStore.getState().coins).toBe(dawnReward(1).coins);

    const second = useGameStore.getState().grantDawnReward(1);
    expect(second).toBeNull();
    expect(useGameStore.getState().inventory.blocks[item]).toBe(1); // no stack
    expect(useGameStore.getState().coins).toBe(dawnReward(1).coins); // no double coins
  });

  it('grants a HIGHER night after a lower one (monotonic progression) + tracks lastRewardedNight', () => {
    useGameStore.getState().grantDawnReward(1);
    const r2 = useGameStore.getState().grantDawnReward(2);
    expect(r2).not.toBeNull();
    expect(r2.xp).toBe(dawnReward(2).xp);
    expect(useGameStore.getState().lastRewardedNight).toBe(2);
  });
});

describe('siege progression persists across save/reload', () => {
  it('nightCount + lastRewardedNight survive a buildSaveData -> loadWorldData round-trip', () => {
    // The escalating-siege difficulty (siegeParams(nightCount)) + the reward guard must
    // be durable, else a reload silently resets the "harder every night" loop to night 0.
    useGameStore.setState({ nightCount: 7, lastRewardedNight: 5 });
    const save = buildSaveData(useGameStore.getState(), { position: [0, 0, 0] });
    useGameStore.setState({ nightCount: 0, lastRewardedNight: 0 }); // simulate a fresh boot
    useGameStore.getState().loadWorldData(save);
    expect(useGameStore.getState().nightCount).toBe(7);
    expect(useGameStore.getState().lastRewardedNight).toBe(5);
  });
});
