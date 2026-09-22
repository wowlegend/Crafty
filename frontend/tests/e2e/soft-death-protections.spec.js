import { test, expect } from './_fixtures.js';
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

test('damage cooldown: the SAME attacker hitting twice within 500ms is dropped', async ({ page }) => {
  // This used two DIFFERENT source strings ('hit1', 'hit2') and relied on the cooldown being GLOBAL.
  // It is now per-ATTACKER: `lastDamageTime` was one number for the whole game, so a pack of six mobs
  // dealt the damage of one. Two different attackers inside one window both land — that is the fix, and
  // the row below asserts it. The invariant here is unchanged: ONE attacker cannot machine-gun you.
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    const now = Date.now();
    // past spawn protection, no recent damage from anyone
    window.useGameStore.setState({ isAlive: true, playerHealth: 100, maxHealth: 100, _spawnTime: now - 6000, lastDamageTime: 0, damageLockouts: {} });
    g().damagePlayer(20, 'melee', null, 'mob:1');
    const afterFirst = g().playerHealth;
    g().damagePlayer(20, 'melee', null, 'mob:1'); // SAME attacker, < 500ms -> its own cooldown drops it
    const afterSame = g().playerHealth;
    g().damagePlayer(20, 'melee', null, 'mob:2'); // a DIFFERENT attacker in the same window -> lands
    const afterOther = g().playerHealth;
    return { afterFirst, afterSame, afterOther };
  });
  expect(res.afterFirst).toBeLessThan(100); // first hit landed
  expect(res.afterSame).toBe(res.afterFirst); // the same attacker's rapid second hit was dropped
  expect(res.afterOther).toBeLessThan(res.afterFirst); // a second ATTACKER is not rate-limited by the first
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
