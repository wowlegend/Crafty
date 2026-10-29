import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { xpForLevel, levelAttributes } from '../../src/game/progression.js';

const reset = () => useGameStore.setState({
  level: 1, currentXP: 0, totalXP: 0,
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null, relic: null },
  talentPoints: 0, unlockedTalents: {},
  playerHealth: 50, maxHealth: 150, mana: 50, maxMana: 120,
});

// A level pays exactly one talent point and no attribute points (DECISIONS 2026-10-28 W1-H item 6); its stats come from
// the level itself (game/progression.js levelAttributes).
describe('store grantXP / level-up', () => {
  beforeEach(reset);

  it('adds XP below the threshold without leveling', () => {
    useGameStore.getState().grantXP(50, 'test');
    const s = useGameStore.getState();
    expect(s.level).toBe(1); expect(s.currentXP).toBe(50); expect(s.totalXP).toBe(50);
    expect(s.talentPoints).toBe(0);
  });
  it('levels up at the threshold, carries overflow, and pays exactly one talent point and no attribute point', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + 30, 'test'); // 100 + 30
    const s = useGameStore.getState();
    expect(s.level).toBe(2); expect(s.currentXP).toBe(30); expect(s.totalXP).toBe(130);
    expect(s.talentPoints, 'a level paid other than one talent point').toBe(1);
    expect('attributes' in s, 'the store holds attribute points again').toBe(false);
    expect('allocateAttribute' in s, 'hand allocation came back').toBe(false);
  });
  it('pays one talent point per level across a multi-level grant', () => {
    useGameStore.getState().grantXP(xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + 10, 'big');
    const s = useGameStore.getState();
    expect(s.level).toBe(4); expect(s.currentXP).toBe(10);
    expect(s.talentPoints).toBe(3);
  });
  it('raises maxHealth and maxMana from the level\'s own stats and heals to the new max on level-up', () => {
    useGameStore.getState().grantXP(xpForLevel(1), 'ding'); // -> level 2
    const s = useGameStore.getState();
    const own = levelAttributes(2);
    expect(own.strength, 'level 2 strength').toBe(12);
    expect(s.maxHealth).toBe(100 + 10 + own.strength * 5); // 170
    expect(s.maxMana).toBe(100 + 5 + own.intellect * 2); // 129
    expect(s.playerHealth).toBe(s.maxHealth);
    expect(s.getEffectiveAttributes()).toEqual(own);
  });
  it('gear folds on top of the level\'s own stats', () => {
    useGameStore.setState({ level: 3, equipment: { head: null, chest: null, boots: null, weapon: 'Iron Sword', offhand: null, relic: null } });
    const eff = useGameStore.getState().getEffectiveAttributes();
    expect(eff.strength).toBe(levelAttributes(3).strength + 8);
    expect(eff.agility).toBe(levelAttributes(3).agility + 4);
  });
  it('casts each spell at the tier its level reached', () => {
    const s = useGameStore.getState();
    expect(s.getSpellStats('fireball').damage).toBe(50);
    useGameStore.setState({ level: 2 });
    expect(useGameStore.getState().getSpellStats('fireball').damage).toBe(80);
    expect(useGameStore.getState().getSpellStats('lightning').damage).toBe(75);
    useGameStore.setState({ level: 5 });
    expect(useGameStore.getState().getSpellStats('lightning').damage).toBe(160);
  });
  it('getPlayerLevel()/getPlayerXP() reflect the store fields', () => {
    useGameStore.getState().grantXP(120, 'x');
    expect(useGameStore.getState().getPlayerLevel()).toBe(2);
    const xp = useGameStore.getState().getPlayerXP();
    expect(xp.level).toBe(2); expect(xp.current).toBe(20); expect(xp.total).toBe(120);
  });
});

describe('talent ranks through the store (limits, prerequisites, unknown ids)', () => {
  beforeEach(() => useGameStore.setState({
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null, relic: null },
    talentPoints: 5, unlockedTalents: {},
  }));
  it('enforces the per-node limit from ASPECT_TREES (voidhand_reach limit 2)', () => {
    useGameStore.getState().spendTalentPoint('voidhand_grasp');
    expect(useGameStore.getState().unlockedTalents.voidhand_grasp, 'the prereq itself must be takeable').toBe(1);
    for (let i = 0; i < 9; i++) useGameStore.getState().spendTalentPoint('voidhand_reach');
    expect(useGameStore.getState().unlockedTalents.voidhand_reach).toBe(2);
  });

  it('the store REFUSES a node whose prereq is untaken — it used to allow it', () => {
    expect(useGameStore.getState().unlockedTalents.voidhand_grasp || 0).toBe(0);
    useGameStore.getState().spendTalentPoint('voidhand_reach');
    expect(useGameStore.getState().unlockedTalents.voidhand_reach, 'a gated node was ranked with no prereq')
      .toBeUndefined();
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
      progression: { talentPoints: 1, unlockedTalents: { frost_shield: 2, voidhand_grasp: 1 } },
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {},
    });
    const s = useGameStore.getState();
    expect(s.unlockedTalents.frost_shield).toBeUndefined(); // stale dropped
    expect(s.unlockedTalents.voidhand_grasp).toBe(1);        // valid kept
    expect(s.talentPoints).toBe(3);                           // 1 + 2 refunded
  });
});
