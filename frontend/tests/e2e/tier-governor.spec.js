import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE TIER GOVERNOR SETTLES, AND NEVER SAMPLES A PACED-DOWN CANVAS (plan 2026-10-27-crafty-steady-cool, item d; F7).
//
// tests/gates/tier-governor-gates drives the pure governor on a fake clock. What it cannot see: that GameScene routes
// drei's PerformanceMonitor through it, that the store's tier then stops moving under an oscillating signal, and that
// the monitor is not mounted while the title paces the canvas to 10 fps (where it used to read a slow GPU and decline).
//
// THREE PHASES, each with its own presence control:
//   A. a synthetic slow frame (injectFrameStall, a busy-wait in every frame) must make the REAL monitor decline through
//      the governor — the wiring is live (the governor's own decline count moves);
//   B. an oscillating signal (decline, incline, every 2.5 s for 75 s, through governorSignal — the same step the
//      monitor calls) must leave at most 1 tier change in any minute after the first 20 s, and none after 60 s. The
//      signal is driven directly because CI's software renderer may never reach the incline bound on its own, so a
//      monitor-only oscillation could not be produced there; the monitor's own decisions still land in the same
//      governor and are counted too;
//   C. with the title covering the canvas for 8 s at tier high, the governor must record no decline.
//
// Mutation-Proof: NOT YET RUN — this lane does not run e2e (port 4179 and the browser belong to the command session).
// Intended batch, via scripts/dev/mutate-e2e.sh:
//   E1 governorIncline ignores the block and the settle (tierGovernor.js)            -> RED expected: "tier changes in the minute"
//   E2 the monitor mounted whatever the pace (governorSamples(...) -> true, GameScene) -> RED expected: "declined behind the title"
//   E3 onDecline back to a direct setQualityTier (GameScene)                          -> RED expected: "the monitor never declined through the governor"
//   E0 identity (a comment edit in tierGovernor.js)                                   -> must SURVIVE
test('the governor settles under an oscillating signal and ignores the paced-down title', async ({ page }) => {
  test.setTimeout(360000);
  await bootDev(page);
  await startPlayActive(page);
  const gov = () => page.evaluate(() => window.__craftyTest.call('readGovernor'));
  const setTier = (t) => page.evaluate((x) => window.__craftyTest.call('setQualityTier', x), t);
  await page.evaluate(() => {
    window.__tierLog = [];
    window.useGameStore.subscribe((s, p) => {
      if (s.qualityTier !== p.qualityTier) window.__tierLog.push({ t: performance.now(), from: p.qualityTier, to: s.qualityTier });
    });
  });
  const pace = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(pace.loop === 'always' || pace.fps === 60, `SETUP: the canvas is not at its play pace (${JSON.stringify(pace)}) — the monitor is not mounted`).toBe(true);

  // A. The real monitor, driven below its bounds.
  await setTier('high');
  const a0 = await gov();
  await page.evaluate(() => window.__craftyTest.call('injectFrameStall', 70));
  await page.waitForTimeout(10000);
  await page.evaluate(() => window.__craftyTest.call('injectFrameStall', 0));
  const a1 = await gov();
  expect(a1.declines, `the monitor never declined through the governor under 70 ms frames: ${JSON.stringify({ a0, a1 })}`).toBeGreaterThan(a0.declines);

  // B. An oscillating signal through the same step.
  await setTier('high');
  const b0 = await page.evaluate(() => performance.now());
  for (let i = 0; i < 30; i++) {
    await page.evaluate((k) => window.__craftyTest.call('governorSignal', k), i % 2 === 0 ? 'decline' : 'incline');
    await page.waitForTimeout(2500);
  }
  const log = await page.evaluate((t0) => window.__tierLog.filter((e) => e.t >= t0).map((e) => ({ ...e, s: (e.t - t0) / 1000 })), b0);
  const list = log.map((e) => `${e.s.toFixed(1)}s ${e.from}->${e.to}`).join(', ');
  console.log(`tier-governor: phase B changes [${list}] · governor ${JSON.stringify(await gov())}`);
  for (let w = 20; w + 60 <= 75; w += 2.5) {
    const n = log.filter((e) => e.s >= w && e.s < w + 60).length;
    expect(n, `${n} tier changes in the minute from ${w} s of an oscillating signal: ${list}`).toBeLessThanOrEqual(1);
  }
  expect(log.filter((e) => e.s >= 60), `tier changes after 60 s of an oscillating signal: ${list}`).toEqual([]);

  // C. The title paces the canvas to 10 fps; the governor must not read that as a slow GPU.
  await setTier('high');
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: true }));
  await page.waitForTimeout(800);
  const titled = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(titled.fps, `SETUP: the title did not pace the canvas down: ${JSON.stringify(titled)}`).toBe(10);
  const c0 = await gov(); // read once the title is up, so a play-pace decision just before it cannot be counted here
  await page.waitForTimeout(8000);
  const c1 = await gov();
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: false }));
  expect(c1.declines, `the governor declined behind the title (10 fps by design): ${JSON.stringify({ c0, c1 })}`).toBe(c0.declines);
});
