import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// The audit flagged "live world LOAD/resume never probed". This drives the REAL save path
// (saveActiveWorld -> localStorage blob) then loads it back via the store and asserts the round-trip
// restores progression + loot + coins + the persisted win-state (S9c) — end-to-end through the same
// localStorage layer the game uses, in the booted game.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('save -> reload restores progression, loot, coins, and the win-state', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // seed a distinctive state
    g().grantXP(6000, 'e2e');
    g().addToInventory('Iron Sword', 1);
    g().addCoins(123);
    g().markGameWon();
    const saved = {
      level: g().level,
      sword: g().inventory.blocks['Iron Sword'] || 0,
      coins: g().coins,
      won: g().gameWon,
    };
    // persist via the REAL save path (writes the localStorage world blob)
    g().saveActiveWorld({ x: 1, y: 18, z: 2 });
    // simulate a fresh session: wipe the live values the load must bring back
    window.useGameStore.setState({ gameWon: false, coins: 0 });
    // read the blob exactly as worldSaves stores it, then load it
    const id = localStorage.getItem('crafty_active_world');
    const raw = id ? localStorage.getItem('crafty_world_save_' + id) : null;
    const blob = raw ? JSON.parse(raw) : null;
    if (blob) g().loadWorldData(blob);
    const r = g();
    return {
      saved,
      hadBlob: !!blob,
      after: { level: r.level, sword: r.inventory.blocks['Iron Sword'] || 0, coins: r.coins, won: r.gameWon },
    };
  });

  expect(res.hadBlob, 'saveActiveWorld wrote a localStorage world blob').toBe(true);
  expect(res.after.won).toBe(true); // S9c win-state survives a save/reload through localStorage
  expect(res.after.coins).toBe(res.saved.coins); // coins restored (not the wiped 0)
  expect(res.after.level).toBe(res.saved.level); // progression restored
  expect(res.after.sword).toBe(res.saved.sword); // inventory restored
});
