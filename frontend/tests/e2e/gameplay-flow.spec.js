import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// Gameplay-LOGIC flows driven through the REAL booted game store (not a mocked unit). These close
// the audit's biggest E2E gap: damage->death->respawn, XP->level, loot->equip, and the coin sink
// were proven only by isolated unit tests (or not at all) — never end-to-end in the running game.
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('XP grant levels the player up (and full-heals, per the documented design)', async ({ page }) => {
  const before = await store(page, () => {
    const s = window.useGameStore.getState();
    return { level: s.level };
  });
  const after = await store(page, () => {
    window.useGameStore.getState().grantXP(100000, 'e2e');
    const s = window.useGameStore.getState();
    return { level: s.level, health: Math.round(s.playerHealth), maxHealth: Math.round(s.maxHealth) };
  });
  expect(after.level).toBeGreaterThan(before.level);
  expect(after.health).toBe(after.maxHealth); // grantXP doubles as a full-heal (audit-noted behavior)
});

test('loot -> inventory -> equip wires through to the equipment slot', async ({ page }) => {
  // inventory is categorized (blocks/tools/magic); addToInventory lands items in `blocks`,
  // and equipItem consumes from any category + sets equipment[slot] (real slot is `weapon`).
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    g().addToInventory('Iron Sword', 1);
    const inInventory = (g().inventory.blocks['Iron Sword'] || 0) >= 1;
    g().equipItem('weapon', 'Iron Sword');
    return { inInventory, weapon: g().equipment?.weapon };
  });
  expect(res.inInventory).toBe(true);
  expect(res.weapon).toBe('Iron Sword');
});

test('coin sink: earning then spending adjusts the balance correctly', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const start = g().coins;
    g().addCoins(100);
    const earned = g().coins;
    g().spendCoins(30);
    return { start, earned, after: g().coins };
  });
  expect(res.earned).toBe(res.start + 100);
  expect(res.after).toBe(res.start + 70);
});

test('soft-death + respawn: a lethal hit kills, respawn revives and KEEPS progression/loot/coins', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // seed progression + loot + coins to prove respawn preserves them
    g().grantXP(5000, 'e2e');
    g().addToInventory('Iron Sword', 1);
    g().addCoins(42);
    const pre = { level: g().level, sword: g().inventory.blocks['Iron Sword'] || 0, coins: g().coins };
    // deterministically bypass the 5s spawn-protection + 500ms damage cooldown, then a lethal hit
    window.useGameStore.setState({ _spawnTime: 0, lastDamageTime: 0 });
    g().damagePlayer(999999, 'test-lethal');
    const aliveAfterHit = g().isAlive;
    g().respawn();
    const r = g();
    return {
      pre,
      aliveAfterHit,
      alive: r.isAlive,
      health: Math.round(r.playerHealth),
      maxHealth: Math.round(r.maxHealth),
      level: r.level,
      sword: r.inventory.blocks['Iron Sword'] || 0,
      coins: r.coins,
    };
  });
  expect(res.aliveAfterHit).toBe(false); // the lethal hit registered death
  expect(res.alive).toBe(true); // respawn revived
  expect(res.health).toBe(res.maxHealth); // vitals restored
  expect(res.level).toBe(res.pre.level); // progression preserved
  expect(res.sword).toBe(res.pre.sword); // inventory preserved
  expect(res.coins).toBe(res.pre.coins); // coins preserved
});
