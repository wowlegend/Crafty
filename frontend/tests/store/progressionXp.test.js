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

describe('frost_shield derived (not baked) armor', () => {
  beforeEach(() => useGameStore.setState({
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
    equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    talentPoints: 3, unlockedTalents: {},
  }));
  it('does not mutate base armor when spending frost_shield', () => {
    useGameStore.getState().spendTalentPoint('frost_shield');
    expect(useGameStore.getState().attributes.armor).toBe(0); // base stays clean
  });
  it('derives +5 armor per frost_shield rank in getEffectiveAttributes', () => {
    useGameStore.getState().spendTalentPoint('frost_shield');
    useGameStore.getState().spendTalentPoint('frost_shield');
    expect(useGameStore.getState().getEffectiveAttributes().armor).toBe(10); // 2 ranks * 5
  });
  it('frost_shield armor survives a re-derive without doubling (idempotent on read)', () => {
    useGameStore.getState().spendTalentPoint('frost_shield');
    const a = useGameStore.getState().getEffectiveAttributes().armor;
    const b = useGameStore.getState().getEffectiveAttributes().armor;
    expect(a).toBe(5);
    expect(b).toBe(5); // reading twice doesn't accumulate
  });
});
