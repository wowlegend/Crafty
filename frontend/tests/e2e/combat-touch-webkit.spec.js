import { test, expect } from './_fixtures.js';
import { devices } from '@playwright/test';
import { bootDev, startPlayActive } from './_boot.js';

// THE CHEVRONS UNDER WEBKIT, BY EYE — @local-only (docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 11).
//
// Kevin's report is about WebKit on iPad, and tests/e2e/combat-touch.spec.js runs Chromium emulation. The repo's WebKit
// instrument, scripts/visual/ipad-probe.mjs, serves the PRODUCTION bundle, where the DEV bridge (and so plantWindup)
// does not exist, so it cannot stage a windup. This runs Playwright's WebKit against the DEV server instead, at both
// iPad orientations, with a planted windup behind the player, and saves one frame per orientation under
// test-results/ to be OPENED BY EYE and recorded in the commit that cites it. It asserts only that the chevron is on
// and inside the viewport; the overlap verdicts are combat-touch.spec.js's.
//
// It is its own file because Playwright refuses `browserName` inside a describe group (it forces a new worker), and
// it is tagged @local-only because CI installs and runs Chromium only (`--grep-invert @local-only`, ci.yml).
// A WebKit run on macOS is not iPadOS (ipad-probe.mjs's own blind-spot note), and the DEV server is not the shipped
// bundle; the chevron is DOM, so neither difference touches its layout.
//
// Mutation-Proof: OWED — C1 (<WindupChevrons /> removed from src/HUD.jsx) must turn its chevron assertion RED, and an
// identity edit must survive. It is @local-only, so CI never observes it: the command session runs it with the by-eye
// frames, and until then the OWED grep (plan Task 12 Step 5) blocks the merge.

const IPAD = devices['iPad Pro 11 landscape'];
test.use({
  browserName: 'webkit',
  viewport: IPAD.viewport, userAgent: IPAD.userAgent, isMobile: IPAD.isMobile, hasTouch: IPAD.hasTouch, deviceScaleFactor: 1,
  launchOptions: { args: [] }, // the config's flags are Chromium's
});

test.describe('chevrons under WebKit @local-only', () => {
  test.setTimeout(420000);

  test('a windup behind the player shows a chevron at both iPad orientations (frames saved for a by-eye look)', async ({ page }, testInfo) => {
    await bootDev(page);
    await startPlayActive(page);
    await page.waitForFunction(() => window.__craftyTest?.call('readMobs') && window.__threeCamera && window.useGameStore.getState().spawnMob
      && window.useGameStore.getState().getMobFloor, null, { timeout: 90000 })
      .catch((e) => { throw new Error(`SETUP: the mob hooks and the spawner never came up — ${e.message}`); });
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      while (Date.now() - (window.useGameStore.getState()._spawnTime || 0) < 5500) await frame();
      window.useGameStore.getState().triggerHitstop(600000);
    });
    try {
      for (const [name, vp] of [['landscape', IPAD.viewport], ['portrait', { width: 834, height: 1194 }]]) {
        await page.setViewportSize(vp);
        const r = await page.evaluate(async () => {
          const call = (n, ...a) => window.__craftyTest.call(n, ...a);
          const frame = () => new Promise((res) => requestAnimationFrame(res));
          const s = window.useGameStore.getState(), c = window.__threeCamera;
          c.rotation.order = 'YXZ'; c.rotation.x = 0; c.updateMatrixWorld();
          for (const m of call('readMobs')) if (!m.passive && m.health > 0 && Math.hypot(m.x - c.position.x, m.z - c.position.z) < 40) window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
          const yaw = c.rotation.y, x = c.position.x + Math.sin(yaw) * 2, z = c.position.z + Math.cos(yaw) * 2; // 2 m behind
          const before = new Set(call('readMobs').map((m) => m.id));
          s.spawnMob(x, z, 'zombie', s.getMobFloor(x, z, c.position.y + 3));
          for (let i = 0; i < 3; i++) await frame();
          const m = call('readMobs').find((e) => !before.has(e.id));
          if (!m) return { why: 'SETUP: no zombie spawned behind' };
          call('plantWindup', m.id, 2000);
          let on = [];
          for (let i = 0; i < 30 && !on.length; i++) { await frame(); on = [...document.querySelectorAll('[data-testid="windup-chevron"][data-on="1"]')]; }
          if (on.length !== 1) return { count: on.length };
          const b = on[0].getBoundingClientRect();
          return { count: 1, angle: Number(on[0].dataset.angle), rect: [b.left, b.top, b.right, b.bottom].map(Math.round), vw: innerWidth, vh: innerHeight };
        });
        expect(r.why, r.why).toBeUndefined();
        expect(r.count, `${name}: a windup behind got ${r.count} chevrons under WebKit`).toBe(1);
        expect(r.rect[0] >= 0 && r.rect[1] >= 0 && r.rect[2] <= r.vw && r.rect[3] <= r.vh, `${name}: the chevron left the viewport — ${JSON.stringify(r)}`).toBe(true);
        const path = testInfo.outputPath(`combat-touch-webkit-${name}.png`);
        await page.screenshot({ path });
        console.log(`combat-touch-webkit: ${name}: chevron at ${JSON.stringify(r.rect)} angle ${r.angle}; frame saved to ${path} — open it by eye`);
      }
    } finally {
      await page.evaluate(() => window.useGameStore.setState({ hitstopUntil: performance.now() })).catch(() => {});
    }
  });
});
