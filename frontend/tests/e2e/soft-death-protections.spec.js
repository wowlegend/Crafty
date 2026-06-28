import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// damagePlayer's anti-unfair-death guards, driven end-to-end through the REAL booted store. The existing
// gameplay-flow death test deliberately BYPASSED these (it set _spawnTime:0 + lastDamageTime:0 to force a
// lethal hit), so the guards themselves were never proven in the running game: (1) a 5s spawn-protection
// window after (re)spawn makes the player invulnerable; (2) a 500ms damage cooldown drops a rapid second
// hit. Each flow runs in one page.evaluate (atomic — Date.now() is ~constant and no mob-AI tick can
// interleave synchronously, so the timing windows are deterministic).
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('spawn protection: damage is ignored within the 5s window, then lands after it expires', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const now = Date.now();
    // fresh spawn -> inside the 5s invulnerability window
    window.useGameStore.setState({ isAlive: true, playerHealth: 100, maxHealth: 100, _spawnTime: now, lastDamageTime: 0 });
    g().damagePlayer(50, 'test');
    const duringProtection = g().playerHealth;
    // spawned >5s ago + no recent hit -> the same blow now lands
    window.useGameStore.setState({ _spawnTime: now - 6000, lastDamageTime: 0 });
    g().damagePlayer(50, 'test');
    const afterProtection = g().playerHealth;
    return { duringProtection, afterProtection };
  });
  expect(res.duringProtection).toBe(100); // spawn invuln blocked the hit entirely
  expect(res.afterProtection).toBeLessThan(100); // post-window hit lands (mitigated, but < full)
});

test('damage cooldown: a second hit within 500ms is dropped', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const now = Date.now();
    // past spawn protection, no recent damage
    window.useGameStore.setState({ isAlive: true, playerHealth: 100, maxHealth: 100, _spawnTime: now - 6000, lastDamageTime: 0 });
    g().damagePlayer(20, 'hit1');
    const afterFirst = g().playerHealth;
    g().damagePlayer(20, 'hit2'); // < 500ms after hit1 -> ignored by the cooldown
    const afterSecond = g().playerHealth;
    return { afterFirst, afterSecond };
  });
  expect(res.afterFirst).toBeLessThan(100); // first hit landed
  expect(res.afterSecond).toBe(res.afterFirst); // cooldown dropped the rapid second hit
});

test('dead player takes no further damage (isAlive guard)', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: false, playerHealth: 0, maxHealth: 100, _spawnTime: 0, lastDamageTime: 0 });
    g().damagePlayer(50, 'post-mortem');
    return { health: g().playerHealth, alive: g().isAlive };
  });
  expect(res.health).toBe(0); // no negative / no-op while dead
  expect(res.alive).toBe(false);
});
