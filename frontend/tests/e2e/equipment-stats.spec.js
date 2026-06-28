import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// Equipping gear must flow through to the DERIVED combat stats (not just set the slot). The loot->equip
// spec proves the slot is set; this proves the stat EFFECT — equip Iron Chestplate (+15 armor) and the
// live getEffectiveAttributes().armor rises by exactly that, in the booted game.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('equipping armor raises the effective armor stat by the item value', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // clear the chest slot for a deterministic baseline (starting loadout may vary)
    window.useGameStore.setState({ equipment: { ...g().equipment, chest: null } });
    const before = g().getEffectiveAttributes().armor || 0;
    g().addToInventory('Iron Chestplate', 1);
    g().equipItem('chest', 'Iron Chestplate');
    return { before, equipped: g().equipment?.chest, after: g().getEffectiveAttributes().armor || 0 };
  });
  expect(res.equipped).toBe('Iron Chestplate');
  expect(res.after).toBeGreaterThan(res.before);
  expect(res.after - res.before).toBe(15); // Iron Chestplate = +15 armor (EQUIP_STATS)
});
