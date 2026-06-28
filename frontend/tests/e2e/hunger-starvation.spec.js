import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// The hunger -> starvation loop, driven end-to-end through the REAL booted store. consumeHunger drains
// (clamped at 0) and, once empty, routes a 1-damage 'starvation' hit through damagePlayer; feedPlayer
// refills (clamped at 100). Because starvation goes through damagePlayer, it also inherits the spawn
// protection — so this proves the hunger + damage + guard systems compose. mitigateDamage is
// Math.max(1, ...) so a 1-damage starvation hit always lands exactly 1 (health 100 -> 99). Each flow is
// one atomic page.evaluate (no hunger/regen ticker can interleave synchronously).
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('hunger: consumeHunger drains and clamps at 0; feedPlayer refills and clamps at 100', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, hunger: 10 });
    g().consumeHunger(4); // 10 -> 6
    const afterConsume = g().hunger;
    g().consumeHunger(100); // floors at 0
    const floored = g().hunger;
    g().feedPlayer(30); // 0 -> 30
    const afterFeed = g().hunger;
    g().feedPlayer(1000); // caps at 100
    const capped = g().hunger;
    return { afterConsume, floored, afterFeed, capped };
  });
  expect(res.afterConsume).toBe(6);
  expect(res.floored).toBe(0);
  expect(res.afterFeed).toBe(30);
  expect(res.capped).toBe(100);
});

test('starvation: consuming hunger at zero chips exactly 1 HP (past the spawn-protection window)', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const now = Date.now();
    // empty stomach, alive, past spawn protection + cooldown so the starvation hit can land
    window.useGameStore.setState({ isAlive: true, hunger: 0, playerHealth: 100, maxHealth: 100, _spawnTime: now - 6000, lastDamageTime: 0 });
    g().consumeHunger(1); // stays 0 -> damagePlayer(1, 'starvation'); mitigateDamage is max(1, ...) -> exactly 1
    return { health: g().playerHealth, hunger: g().hunger };
  });
  expect(res.hunger).toBe(0);
  expect(res.health).toBe(99); // exactly 1 starvation damage
});

test('starvation respects spawn protection: an empty stomach in the invuln window does not chip HP', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    // fresh spawn -> inside the 5s invulnerability window
    window.useGameStore.setState({ isAlive: true, hunger: 0, playerHealth: 100, maxHealth: 100, _spawnTime: Date.now(), lastDamageTime: 0 });
    g().consumeHunger(1); // routes to damagePlayer, but spawn protection ignores it
    return { health: g().playerHealth };
  });
  expect(res.health).toBe(100); // hunger + damage + guard compose: no starvation while invulnerable
});
