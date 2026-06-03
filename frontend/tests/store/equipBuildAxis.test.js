import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const reset = () => useGameStore.setState({
  attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
  inventory: { blocks: { 'Diamond Sword': 2 }, tools: {}, magic: {} },
  playerHealth: 100, maxHealth: 100, mana: 100, maxMana: 100,
});

describe('equip build axis (DRY effective + maxStats)', () => {
  beforeEach(reset);

  it('getEffectiveAttributes folds equipped bonuses', () => {
    useGameStore.getState().equipItem('weapon', 'Diamond Sword');
    const eff = useGameStore.getState().getEffectiveAttributes();
    expect(eff.strength).toBe(25); // 10 base + 15
    expect(eff.agility).toBe(18);  // 10 base + 8
  });

  it('equip recomputes maxHealth via the shared formula (level 1, STR 25 -> 100 + 125)', () => {
    useGameStore.getState().equipItem('weapon', 'Diamond Sword');
    expect(useGameStore.getState().maxHealth).toBe(225);
  });

  it('equip/unequip is idempotent — no maxHealth ratchet across cycles', () => {
    const s = useGameStore.getState();
    s.equipItem('weapon', 'Diamond Sword');
    expect(useGameStore.getState().maxHealth).toBe(225);
    s.unequipItem('weapon');
    const afterFirst = useGameStore.getState().maxHealth; // L1 STR10 -> 150
    expect(afterFirst).toBe(150);
    s.equipItem('weapon', 'Diamond Sword');
    s.unequipItem('weapon');
    expect(useGameStore.getState().maxHealth).toBe(afterFirst); // identical, no accumulation
  });

  it('allocateAttribute spends a point and recomputes caps', () => {
    useGameStore.setState({ attributes: { ...useGameStore.getState().attributes, attributePoints: 1 } });
    useGameStore.getState().allocateAttribute('strength');
    expect(useGameStore.getState().attributes.strength).toBe(11);
    expect(useGameStore.getState().attributes.attributePoints).toBe(0);
    expect(useGameStore.getState().maxHealth).toBe(155); // 100 + 11*5
  });
});
