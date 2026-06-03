// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { dawnReward, DAWN_XP_PER_NIGHT, DAWN_COINS_PER_NIGHT } from '../../src/game/dayNight.js';
import { getItemRarity } from '../../src/data/items.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

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
    coins: 0,
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

  it('a second grant for the same night stacks the loot qty (caller guards double-grant)', () => {
    // grantDawnReward itself is idempotent-free (a pure action); the ONCE-per-dawn
    // guard lives in useSurvivalMode. Two calls => two drops (proves no internal dedupe
    // that would mask a caller bug).
    const item = dawnReward(1).lootItem;
    useGameStore.getState().grantDawnReward(1);
    useGameStore.getState().grantDawnReward(1);
    expect(useGameStore.getState().inventory.blocks[item]).toBe(2);
  });
});
