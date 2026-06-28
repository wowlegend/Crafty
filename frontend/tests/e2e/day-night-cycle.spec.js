import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// Day/night progression + the survive-to-dawn reward, driven end-to-end through the REAL booted game
// store (the audit had these proven only by isolated pure-math unit tests, never in the running game).
// Each flow runs inside ONE page.evaluate so the real-time day/night ticker (a separate rAF) cannot
// interleave between the drive and the assert — the sequence is atomic in the browser.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('day/night: crossing a half-cycle boundary flips isDay (both directions, no false flip)', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ gameTime: 0, isDay: true }); // deterministic baseline
    g().setGameTime(650); // bucket 0 -> 1: day -> night
    const night = g().isDay;
    g().setGameTime(1250); // bucket 1 -> 2: night -> day
    const day = g().isDay;
    g().setGameTime(1260); // still bucket 2: no boundary crossed -> no flip
    const stay = g().isDay;
    return { night, day, stay };
  });
  expect(res.night).toBe(false); // crossed into night
  expect(res.day).toBe(true); // crossed back into day
  expect(res.stay).toBe(true); // no crossing -> unchanged (the crossing-fix, not exact-landing)
});

test('survive-to-dawn: grantDawnReward grants XP+coins+loot once; a re-fire for the same night is a no-op', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ lastRewardedNight: 0 });
    const startCoins = g().coins;
    const startPotions = g().inventory.blocks['Health Potion'] || 0;

    const r1 = g().grantDawnReward(1); // first dawn of night 1
    const afterCoins = g().coins;
    const afterPotions = g().inventory.blocks['Health Potion'] || 0;

    const r2 = g().grantDawnReward(1); // same night again -> guarded no-op
    return {
      startCoins, startPotions, r1, afterCoins, afterPotions, r2,
      after2Coins: g().coins,
      after2Potions: g().inventory.blocks['Health Potion'] || 0,
      lastRewardedNight: g().lastRewardedNight,
    };
  });
  expect(res.r1).toBeTruthy();
  expect(res.r1.coins).toBe(10); // DAWN_COINS_PER_NIGHT * 1
  expect(res.r1.xp).toBe(50); // DAWN_XP_PER_NIGHT * 1
  expect(res.r1.lootItem).toBe('Health Potion'); // night-1 rare tier (deterministic)
  expect(res.afterCoins).toBe(res.startCoins + 10); // coins actually granted
  expect(res.afterPotions).toBe(res.startPotions + 1); // loot actually granted
  expect(res.r2).toBeNull(); // once-per-night guard fires
  expect(res.after2Coins).toBe(res.afterCoins); // no double-grant
  expect(res.after2Potions).toBe(res.afterPotions);
  expect(res.lastRewardedNight).toBe(1);
});
