import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';

// A PAUSED GAME HOLDS THE WORLD: paused beside a mob that is chasing you, your health and its position do not move,
// and the moment you resume it chases again. Both pause paths the player has are driven, because the world must not
// care which one cleared the input gate:
//   - desktop ESC. The browser consumes the Escape keystroke while the pointer is locked; what reaches the page is the
//     unlock, a `pointerlockchange` event, which Components' listener turns into setActive(false). Headless Chromium
//     holds no lock, so the spec delivers that event itself (or exits a lock it does hold): the listener and everything
//     after it are the game's own. It does not exercise the browser's ESC-to-unlock step, which no page can observe.
//   - the touch Pause button, tapped as a finger would (Playwright's touchscreen tap after its hit-target check).
// Both resume through the input gate's own writer (the test bridge's forcePlay), which is where a granted lock or a tap on
// Tap to Play also lands.
//
// HOW IT SAMPLES. Everything that decides a verdict is read inside the page, once per rendered frame, in one evaluate:
// a host round-trip on a loaded runner can take seconds, so host-side timing says nothing about which frames the
// pause covered. The pause is held for PAUSE_MS of wall time AND at least MIN_FRAMES drawn frames, and every verdict
// prints that denominator: a renderer that drew nothing would also leave the mob still. The world runs on drawn
// frames, so the same mob is shown chasing before the pause and after it (the presence control), and the paused state
// itself (input dead, play started, alive) is read beside the subject so a failure names which gate was not held.
//
// Mutation-Proof: in commit trailers, not here (DECISIONS 2026-10-28 15c).

const PAUSE_MS = 5000;
const MIN_FRAMES = 3;
const CHASE_M = 0.3; // how far the mob must travel for "it is chasing" to be a reading and not noise
const HELD_M = 0.05; // drift a paused mob may show and still count as held (float noise, far under one step)

/** A hostile of our own, 5 m off the player, with nothing else hostile near and the player full and past spawn
 *  protection, so a hit while paused would show in the health bar. Returns its id, or null. */
const stageChaser = (page) => page.evaluate(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const store = window.useGameStore;
  while (Date.now() - (store.getState()._spawnTime || 0) < 5500) await frame();
  const s = store.getState();
  s.setTimeOfDay?.(0.5); // noon: the calm spawner, so no siege joins the scene
  store.setState({ isAlive: true, playerHealth: s.maxHealth });
  const cam = window.__threeCamera.position;
  for (const m of window.__craftyTest.call('readMobs')) {
    if (!m.passive && Math.hypot(m.x - cam.x, m.z - cam.z) < 24) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
  }
  const before = new Set(window.__craftyTest.call('readMobs').map((m) => m.id));
  s.spawnMob(cam.x + 5, cam.z, 'zombie');
  const added = window.__craftyTest.call('readMobs').filter((m) => !before.has(m.id));
  return added.length === 1 ? added[0].id : null;
});

/** Frames until the mob has moved CHASE_M from where it stood, or `ms` passes. */
const watchChase = (page, id, ms) => page.evaluate(async ({ id, ms, chase }) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  const mob = () => window.__craftyTest.call('readMobs').find((m) => m.id === id);
  const m0 = mob();
  if (!m0) return { present: false };
  const t0 = performance.now();
  let frames = 0, moved = 0;
  while (performance.now() - t0 < ms && moved < chase) {
    await frame();
    frames += 1;
    const m = mob();
    if (m) moved = Math.hypot(m.x - m0.x, m.z - m0.z);
  }
  const st = window.useGameStore.getState();
  return {
    present: true, moved: +moved.toFixed(3), frames, ms: Math.round(performance.now() - t0),
    gates: { active: window.__craftyTest.call('readIntents').active, started: !!st.gameStarted, alive: st.isAlive },
  };
}, { id, ms, chase: CHASE_M });

/** Hold the pause the spec just entered: settle two frames (a worker reply already in flight may land once), then
 *  sample every frame for PAUSE_MS and MIN_FRAMES. */
const holdPaused = (page, id) => page.evaluate(async ({ id, pauseMs, minFrames }) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
  const call = (n, ...a) => window.__craftyTest.call(n, ...a);
  const st = () => window.useGameStore.getState();
  const mob = () => call('readMobs').find((m) => m.id === id);
  for (let i = 0; i < 2; i++) await frame();
  const m0 = mob();
  const hp0 = st().playerHealth;
  const w0 = call('worldNow');
  const t0 = performance.now();
  let frames = 0, drift = 0, hpLow = hp0;
  while (performance.now() - t0 < pauseMs || frames < minFrames) {
    await frame();
    frames += 1;
    const m = mob();
    if (m && m0) drift = Math.max(drift, Math.hypot(m.x - m0.x, m.z - m0.z));
    hpLow = Math.min(hpLow, st().playerHealth);
  }
  return {
    present: !!m0, frames, ms: Math.round(performance.now() - t0), drift: +drift.toFixed(4), hp0, hpLow,
    worldMs: +(call('worldNow') - w0).toFixed(3),
    gates: { active: call('readIntents').active, started: !!st().gameStarted, alive: st().isAlive },
  };
}, { id, pauseMs: PAUSE_MS, minFrames: MIN_FRAMES });

const waitActive = (page, want, why) => page
  .waitForFunction((w) => window.__craftyTest.call('readIntents').active === w, want, { timeout: 15000 })
  .catch(() => { throw new Error(`SETUP: ${why}: the input gate never read active=${want}`); });

/** The chase, the pause, the hold and the resume, with `pause` and `resume` the path under test. */
async function pauseBesideChaser(page, { pause, resume }) {
  await page.evaluate(() => window.useGameStore.getState().markGameStarted());
  const id = await stageChaser(page);
  expect(id, 'SETUP: spawnMob did not add exactly one mob, so the rest would read someone else').not.toBeNull();

  const before = await watchChase(page, id, 30000);
  if (!before.present || before.moved < CHASE_M) {
    throw new Error(`SETUP: the mob never chased before the pause, so a still mob below would mean nothing: ${JSON.stringify(before)}`);
  }

  await pause();
  const held = await holdPaused(page, id);
  const where = `${held.frames} frames over ${held.ms} ms paused; gates ${JSON.stringify(held.gates)}; ` +
    `hp ${held.hp0} -> ${held.hpLow}; mob drift ${held.drift} m; world clock +${held.worldMs} ms`;
  console.log(`[pause-freezes-world] ${where}`);
  if (held.gates.active || !held.gates.started || held.gates.alive === false || !held.present) {
    throw new Error(`SETUP: the game was not in the paused state the spec meant to hold (${where})`);
  }
  expect(held.frames, `fewer than ${MIN_FRAMES} frames were drawn while paused, so nothing was measured (${where})`)
    .toBeGreaterThanOrEqual(MIN_FRAMES);
  expect.soft(held.hpLow, `the player lost health while the game was paused (${where})`).toBe(held.hp0);
  expect.soft(held.drift, `the mob moved while the game was paused (${where})`).toBeLessThan(HELD_M);
  expect.soft(held.worldMs, `the world clock ran while the game was paused (${where})`).toBe(0);

  await resume();
  const after = await watchChase(page, id, 30000);
  expect(after.moved, `the mob never moved again after the resume: ${JSON.stringify(after)}`).toBeGreaterThanOrEqual(CHASE_M);
}

test.describe('pause freezes the world', () => {
  test.setTimeout(300000);

  test('ESC: paused beside a chasing mob, the player and the mob hold; on resume it chases again', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await pauseBesideChaser(page, {
      pause: async () => {
        await page.evaluate(() => {
          if (document.pointerLockElement) document.exitPointerLock();
          else document.dispatchEvent(new Event('pointerlockchange'));
        });
        await waitActive(page, false, 'the unlock did not reach the input gate');
      },
      resume: async () => {
        await page.evaluate(() => window.__craftyTest.call('forcePlay'));
        await waitActive(page, true, 'the resume did not reach the input gate');
      },
    });
  });
});

test.describe('pause freezes the world on touch', () => {
  const IPAD = devices['iPad Pro 11 landscape'];
  test.use({ viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1 });
  test.setTimeout(300000);

  test('the touch Pause holds the world the same way, and the resume releases it', async ({ page }) => {
    await bootDev(page);
    await startPlayActive(page);
    await page
      .waitForFunction(() => !!document.querySelector('[data-testid="touch-pause"]'), null, { timeout: 20000 })
      .catch(() => { throw new Error('SETUP: the touch Pause button never attached'); });
    await pauseBesideChaser(page, {
      pause: async () => {
        await page.locator('[data-testid="touch-pause"]').tap({ timeout: 30000 });
        await waitActive(page, false, 'the Pause tap did not reach the input gate');
      },
      // Resumed through the gate's own writer, as on desktop. The paused screen's top layer here is the resume overlay,
      // and under Chromium's touch emulation its button does not hold the gate: it reads active, then the overlay is
      // back. The subject is the hold, so the resume control is not what this case measures.
      resume: async () => {
        await page.evaluate(() => window.__craftyTest.call('forcePlay'));
        await waitActive(page, true, 'the resume did not reach the input gate');
      },
    });
  });
});
