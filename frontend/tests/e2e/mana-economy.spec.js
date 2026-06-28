import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// The mana/cast economy resource layer, driven end-to-end through the REAL booted store. useMana is the
// cast-affordability gate the spell paths call (spend + return true only if affordable; reject + spend
// nothing otherwise); restoreMana is the regen, clamped to maxMana and a no-op while dead. The audit had
// these proven only by isolated store units; this exercises them in the running game. Each flow runs in
// one page.evaluate (atomic — any mana-regen ticker is a separate rAF that can't interleave mid-evaluate).
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('mana: useMana gates spends (afford -> deduct+true, over-budget -> reject+unchanged); restore clamps to max', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, mana: 100, maxMana: 100 });
    const ok = g().useMana(30); // afford -> true, mana 70
    const afterSpend = g().mana;
    const tooMuch = g().useMana(80); // 80 > 70 -> reject, spend nothing
    const afterReject = g().mana;
    g().restoreMana(50); // 70 + 50 = 120 -> clamps to maxMana 100
    const afterRestore = g().mana;
    return { ok, afterSpend, tooMuch, afterReject, afterRestore };
  });
  expect(res.ok).toBe(true);
  expect(res.afterSpend).toBe(70);
  expect(res.tooMuch).toBe(false); // unaffordable cast is rejected
  expect(res.afterReject).toBe(70); // ...and spends nothing
  expect(res.afterRestore).toBe(100); // clamp to maxMana, not 120
});

test('mana: exact-cost spend drains to zero; restoreMana is a no-op while dead', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // cost == mana is affordable (the gate is >=), drains to exactly 0
    window.useGameStore.setState({ isAlive: true, mana: 25, maxMana: 100 });
    const exact = g().useMana(25);
    const afterExact = g().mana;
    // dead -> no mana regen
    window.useGameStore.setState({ isAlive: false, mana: 10, maxMana: 100 });
    g().restoreMana(50);
    const deadRestore = g().mana;
    return { exact, afterExact, deadRestore };
  });
  expect(res.exact).toBe(true); // cost == current mana is affordable
  expect(res.afterExact).toBe(0);
  expect(res.deadRestore).toBe(10); // dead player does not regen mana
});
