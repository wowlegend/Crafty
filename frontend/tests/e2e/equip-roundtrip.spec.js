import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// The inventory <-> equipment round-trip, driven end-to-end through the REAL booted store. equipItem
// consumes the item from its category and, if the slot was occupied, returns the DISPLACED item to
// inventory (the swap contract); unequipItem returns the slot item; both no-op safely (equip an item you
// don't hold / unequip an empty slot). The equipment-stats spec only proved the armor stat moved — this
// proves the item bookkeeping. One atomic page.evaluate per flow.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('equip -> swap -> unequip conserves items (displaced gear returns to inventory)', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // clean baseline: empty weapon slot + no test swords in inventory (starting loadout varies)
    window.useGameStore.setState({
      equipment: { ...g().equipment, weapon: null },
      inventory: { ...g().inventory, blocks: { ...g().inventory.blocks, 'Iron Sword': 0, 'Diamond Sword': 0 } },
    });

    // 1. equip consumes from inventory + occupies the slot
    g().addToInventory('Iron Sword', 1);
    g().equipItem('weapon', 'Iron Sword');
    const afterEquip = { weapon: g().equipment.weapon, ironInInv: g().inventory.blocks['Iron Sword'] || 0 };

    // 2. swap: equipping a new weapon returns the displaced one to inventory
    g().addToInventory('Diamond Sword', 1);
    g().equipItem('weapon', 'Diamond Sword');
    const afterSwap = {
      weapon: g().equipment.weapon,
      ironBack: g().inventory.blocks['Iron Sword'] || 0,
      diamondInInv: g().inventory.blocks['Diamond Sword'] || 0,
    };

    // 3. unequip returns the equipped item to inventory + clears the slot
    g().unequipItem('weapon');
    const afterUnequip = { weapon: g().equipment.weapon, diamondBack: g().inventory.blocks['Diamond Sword'] || 0 };

    return { afterEquip, afterSwap, afterUnequip };
  });
  expect(res.afterEquip.weapon).toBe('Iron Sword');
  expect(res.afterEquip.ironInInv).toBe(0); // consumed from inventory on equip
  expect(res.afterSwap.weapon).toBe('Diamond Sword');
  expect(res.afterSwap.ironBack).toBe(1); // displaced sword returned to inventory
  expect(res.afterSwap.diamondInInv).toBe(0); // new sword consumed
  expect(res.afterUnequip.weapon).toBeNull(); // slot cleared
  expect(res.afterUnequip.diamondBack).toBe(1); // unequipped sword returned
});

test('equip/unequip no-ops: equipping an unheld item and unequipping an empty slot change nothing', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({
      equipment: { ...g().equipment, weapon: null },
      inventory: { ...g().inventory, blocks: { ...g().inventory.blocks, 'Ghost Blade': 0 } },
    });
    g().equipItem('weapon', 'Ghost Blade'); // not in inventory -> no-op
    const equipMissing = g().equipment.weapon;
    g().unequipItem('weapon'); // empty slot -> no-op, no phantom item minted
    const ghostInInv = g().inventory.blocks['Ghost Blade'] || 0;
    return { equipMissing, ghostInInv };
  });
  expect(res.equipMissing).toBeNull(); // can't equip what you don't have
  expect(res.ghostInInv).toBe(0); // unequip on an empty slot mints no phantom item
});
