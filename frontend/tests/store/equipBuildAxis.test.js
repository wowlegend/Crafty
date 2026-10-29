import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const reset = () => useGameStore.setState({
  level: 1,
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null, relic: null },
  inventory: { blocks: { 'Diamond Sword': 2 }, tools: {}, magic: {} },
  playerHealth: 100, maxHealth: 100, mana: 100, maxMana: 100,
});

describe('equip build axis (DRY effective + maxStats)', () => {
  beforeEach(reset);

  it('getEffectiveAttributes folds equipped bonuses', () => {
    useGameStore.getState().equipItem('weapon', 'Diamond Sword');
    const eff = useGameStore.getState().getEffectiveAttributes();
    expect(eff.strength).toBe(25); // level 1's 10 + 15
    expect(eff.agility).toBe(18);  // level 1's 10 + 8
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

});
