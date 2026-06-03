import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { xpForLevel } from '../../src/game/progression.js';

const reset = () => useGameStore.setState({
  level: 1, currentXP: 0, totalXP: 0,
  attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
  talentPoints: 0, unlockedTalents: {},
  playerHealth: 50, maxHealth: 150, mana: 50, maxMana: 120,
});

describe('store grantXP / level-up', () => {
  beforeEach(reset);

  it('adds XP below the threshold without leveling', () => {
    useGameStore.getState().grantXP(50, 'test');
    const s = useGameStore.getState();
    expect(s.level).toBe(1); expect(s.currentXP).toBe(50); expect(s.totalXP).toBe(50);
  });
  it('levels up at the threshold, carries overflow, awards points', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + 30, 'test'); // 100 + 30
    const s = useGameStore.getState();
    expect(s.level).toBe(2); expect(s.currentXP).toBe(30); expect(s.totalXP).toBe(130);
    expect(s.attributes.attributePoints).toBe(5); expect(s.talentPoints).toBe(1);
  });
  it('handles a multi-level grant in one call', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + xpForLevel(2) + 10, 'big'); // 100 + 150 + 10
    const s = useGameStore.getState();
    expect(s.level).toBe(3); expect(s.currentXP).toBe(10);
    expect(s.attributes.attributePoints).toBe(10); expect(s.talentPoints).toBe(2);
  });
  it('recomputes maxHealth/maxMana and heals to new max on level-up', () => {
    useGameStore.getState().grantXP(xpForLevel(1), 'ding'); // -> level 2
    const s = useGameStore.getState();
    expect(s.maxHealth).toBe(100 + 10 + 50); // 160 (level2, STR10)
    expect(s.playerHealth).toBe(s.maxHealth);
  });
  it('getPlayerLevel()/getPlayerXP() reflect the store fields', () => {
    useGameStore.getState().grantXP(120, 'x');
    expect(useGameStore.getState().getPlayerLevel()).toBe(2);
    const xp = useGameStore.getState().getPlayerXP();
    expect(xp.level).toBe(2); expect(xp.current).toBe(20); expect(xp.total).toBe(120);
  });
});

describe('talent effects derived (not baked) via ASPECT_TREES', () => {
  beforeEach(() => useGameStore.setState({
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 5, unlockedTalents: {},
  }));
  it('does not mutate base attributes when spending a talent', () => {
    useGameStore.getState().spendTalentPoint('voidhand_ward'); // +6 armor/rank
    expect(useGameStore.getState().attributes.armor).toBe(0); // base stays clean
  });
  it('derives the talent stat bonus in getEffectiveAttributes', () => {
    useGameStore.getState().spendTalentPoint('voidhand_ward');
    useGameStore.getState().spendTalentPoint('voidhand_ward');
    expect(useGameStore.getState().getEffectiveAttributes().armor).toBe(12); // 2 ranks * 6
  });
  it('enforces the per-node limit from ASPECT_TREES (voidhand_crush limit 2)', () => {
    for (let i = 0; i < 9; i++) useGameStore.getState().spendTalentPoint('voidhand_crush');
    expect(useGameStore.getState().unlockedTalents.voidhand_crush).toBe(2);
  });
  it('an unknown/stale talent id cannot be spent (limit 0)', () => {
    useGameStore.getState().spendTalentPoint('frost_shield'); // old id, no longer in trees
    expect(useGameStore.getState().unlockedTalents.frost_shield).toBeUndefined();
    expect(useGameStore.getState().talentPoints).toBe(5); // not consumed
  });
});

describe('loadWorldData refunds stale talent ids (pre-A4 saves)', () => {
  beforeEach(() => useGameStore.setState({ terrainWorker: null, playerRigidBodyRef: null }));
  it('drops non-tree ids on load and refunds their ranks into talentPoints', () => {
    useGameStore.getState().loadWorldData({
      progression: { talentPoints: 1, unlockedTalents: { frost_shield: 2, voidhand_force: 1 } },
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {},
    });
    const s = useGameStore.getState();
    expect(s.unlockedTalents.frost_shield).toBeUndefined(); // stale dropped
    expect(s.unlockedTalents.voidhand_force).toBe(1);        // valid kept
    expect(s.talentPoints).toBe(3);                           // 1 + 2 refunded
  });
});

describe('talent STR/INT feed maxHealth/maxMana (review-gap fix)', () => {
  beforeEach(() => useGameStore.setState({
    level: 1, attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 5, unlockedTalents: {}, playerHealth: 100, maxHealth: 150, mana: 100, maxMana: 120,
  }));
  it('spending Beast Vigor (+3 STR/rank) raises maxHealth (+15/rank)', () => {
    const before = useGameStore.getState().maxHealth; // L1 STR10 -> 150
    useGameStore.getState().spendTalentPoint('wildheart_vigor');
    expect(useGameStore.getState().maxHealth).toBe(before + 15); // STR 13 -> 100 + 65 = 165
  });
  it('spending Elemental Focus (+4 INT/rank) raises maxMana (+8/rank)', () => {
    const before = useGameStore.getState().maxMana; // L1 INT10 -> 120
    useGameStore.getState().spendTalentPoint('elemancer_focus');
    expect(useGameStore.getState().maxMana).toBe(before + 8); // INT 14 -> 100 + 28 = 128
  });
  it('talent-spend does NOT heal current health (only raises the cap)', () => {
    useGameStore.setState({ playerHealth: 100 });
    useGameStore.getState().spendTalentPoint('wildheart_vigor');
    expect(useGameStore.getState().playerHealth).toBe(100); // unchanged
  });
  it('getEffectiveAttributes + maxHealth agree (talent STR reaches both damage and HP)', () => {
    useGameStore.getState().spendTalentPoint('wildheart_vigor'); // +3 STR
    const eff = useGameStore.getState().getEffectiveAttributes();
    expect(eff.strength).toBe(13);
    expect(useGameStore.getState().maxHealth).toBe(100 + 13 * 5); // 165
  });
});
