import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// M5 #15 (inventory correctness): VERIFY-BEFORE-ASSERT found the inventory is a guarded count-map (no
// slot/stack-overflow model), so the correctness contract is COUNT MATH: add increments, remove floors at
// 0 (never negative), chest transfer CONSERVES the total + refuses over-transfer (no dupe/loss), and
// equip<->unequip round-trips the item. This locks those invariants against regression.
const reset = (inv = { blocks: {}, tools: {}, magic: {} }) => useGameStore.setState({
  equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
  attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  inventory: inv,
  chests: new Map(),
  playerHealth: 100, maxHealth: 100, mana: 100, maxMana: 100, level: 1,
});

describe('M5 #15 inventory correctness invariants', () => {
  beforeEach(() => reset());

  it('addToInventory increments the block count', () => {
    const s = useGameStore.getState();
    s.addToInventory('stone', 3);
    s.addToInventory('stone', 2);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(5);
  });

  it('removeFromInventory floors at 0 (never negative -- no underflow dupe)', () => {
    reset({ blocks: { stone: 2 }, tools: {}, magic: {} });
    useGameStore.getState().removeFromInventory('stone', 5);
    expect(useGameStore.getState().inventory.blocks.stone).toBe(0);
  });

  it('chest transfer CONSERVES the total + refuses over-transfer (no dupe, no loss)', () => {
    reset({ blocks: { iron: 4 }, tools: {}, magic: {} });
    const coords = '0,0,0';
    useGameStore.setState({ chests: new Map([[coords, { inventory: {} }]]) });
    const s = useGameStore.getState();
    s.transferItem(coords, 'iron', 3, 'to_chest');
    let st = useGameStore.getState();
    expect(st.inventory.blocks.iron).toBe(1);
    expect(st.chests.get(coords).inventory.iron).toBe(3); // total conserved at 4
    // over-transfer is refused (player has 1, asks 5 -> no change)
    useGameStore.getState().transferItem(coords, 'iron', 5, 'to_chest');
    st = useGameStore.getState();
    expect(st.inventory.blocks.iron).toBe(1);
    expect(st.chests.get(coords).inventory.iron).toBe(3);
  });

  it('equip then unequip restores the item to inventory (round-trip, no loss/dupe)', () => {
    reset({ blocks: { 'Diamond Sword': 1 }, tools: {}, magic: {} });
    const s = useGameStore.getState();
    s.equipItem('weapon', 'Diamond Sword');
    expect(useGameStore.getState().inventory.blocks['Diamond Sword']).toBe(0);
    useGameStore.getState().unequipItem('weapon');
    expect(useGameStore.getState().inventory.blocks['Diamond Sword']).toBe(1);
    expect(useGameStore.getState().equipment.weapon).toBe(null);
  });
});
