import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE FRAME CAP, IN THE RUNNING CANVAS (plan 2026-09-23-crafty-perf-heat-ipad, Task 4).
//
// tests/gates/frame-cap-gates drives the pacing maths over simulated displays. What it cannot see: that the cap is
// MOUNTED (the live R3F loop switched to 'demand'), that it BINDS — the loop really draws only as often as the cap
// says — that it still draws at the full rate when the display is slower than the cap, and that it lets go when the
// player picks Unlimited or the capture harness runs.
//
// WHY FRAMES PER TICK, AND A TEST CAP. Headless rAF is ~60 Hz and this renderer draws a few frames a second, so the
// real 60 cap never binds here. And the demand loop is NOT idle without the cap — @react-three/rapier invalidates from
// inside its step for every awake body, and the player's never sleeps — so "frames were drawn under the cap" is true
// even when the cap draws nothing. So the store is set straight to 1 fps (bypassing setFrameCap, which admits only
// 0 / 60), below this renderer's rate, and the spec counts R3F frames against DISPLAY TICKS (a page rAF counter): a
// cap that binds draws on a small fraction of ticks and the skipped ticks run fast; a loop that draws on every tick
// has a ratio near 1 however slow the renderer is. A frame rate alone cannot tell those apart on a slow machine.
//
// Mutation-Proof: via scripts/dev/mutate-e2e.sh (and its scratchpad prototype), one batch under one load, each RED,
// with two IDENTITY mutants (a comment edit; whitespace in a comment) in the same batch, both of which SURVIVED:
//   C1 FrameCap never renders -> "the 1 fps cap starved the loop" (0.17 fps; under the 60 cap, 3 frames in 97 ticks).
//      The first two versions of this spec compared frames under the 60 cap with Unlimited, and C1 SURVIVED both (a
//      world-clock check, then a render-call ratio): rapier kept the loop drawing, so a cap that never rendered could
//      not be told from a working one.
//   C3 plausible-wrong: invalidate() in place of advance() — the first version's REAL bug (it drew HALF the uncapped
//      rate in the run that found it) -> "starved the loop" (0 fps: the next skipped tick clears the invalidation)
//   C5 plausible-wrong: stepCap ignores fps (every tick renders) -> "did not bind" (58 of 58 ticks)
//   C6 a skipped tick leaves R3F's pending frames alone -> "did not bind" (63 of 63 ticks). The shipped cap had this
//      defect until an IDENTITY mutant (a comment edit, which must survive) went red at 2.7 fps under the 1 fps cap: a
//      commit restarted R3F's loop and rapier kept it drawing until the next capped frame. It showed only when a
//      commit happened to land in the window, so the window now invalidates the canvas every 100 ms itself.
//   C2 the Canvas frameloop prop pinned to 'always' (the first version's other real bug: the mode set from inside
//      FrameCap was overwritten by R3F on the next Canvas render) -> "the loop modes were not demand under the cap"
//   C4 the setFrameloop wrapper removed -> "the R3F clock jumped back" (R3F zeroes it on every loop switch)
//   C7 (review #2, 2026-09-26) Show Stats back on drei's <Stats> -> "the Show Stats readout is not on screen"
//   C8 plausible-wrong: the readout counts display ticks instead of drawn frames -> 'Show Stats read "5 FPS drawn"
//      under a 1 fps cap'
// Re-run after the window order changed (Unlimited first) on 2026-09-26: C6 -> "did not bind" (22 of 22 ticks); C1 ->
// RED at the readout check (nothing drawn, so the readout is never written); identity SURVIVED. C2-C5 were proven on
// the previous order; their assertions are unchanged.
//
// BLIND SPOT: 60-of-120 itself — no display here is faster than the cap; that is stepCap's, over simulated displays.
const WINDOW_MS = 3000;
const TEST_CAP = 1;
test('capped by default; the cap binds, costs nothing below it, and lets go for Unlimited and capture; the clock never jumps back', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await startPlayActive(page);
  // A small viewport at the low tier: the pacing does not depend on either, and a software rasteriser on a loaded
  // machine drew under 1 fps at the default size — below the 1 fps test cap, where nothing is measurable.
  await page.setViewportSize({ width: 480, height: 270 });
  await page.evaluate(() => window.useGameStore.setState({ qualityTier: 'low' }));
  await page.evaluate(() => {
    window.__ticks = 0;
    const count = () => { window.__ticks += 1; requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });
  const state = () => page.evaluate(() => ({ ...window.__craftyTest.call('readFrameloop'), cap: window.useGameStore.getState().frameCap, ticks: window.__ticks }));
  const setCap = async (fps) => {
    const before = await state();
    // setState, not setFrameCap: the test cap is a rate the setting itself never admits.
    await page.evaluate((v) => window.useGameStore.setState({ frameCap: v }), fps);
    await page.waitForTimeout(500);
    const after = await state();
    // R3F's setFrameloop zeroes its clock on every switch; the player's timers compare that clock to stored starts.
    expect(after.clock, `the R3F clock jumped back on a loop switch (${before.loop} -> ${after.loop}): ${JSON.stringify({ before, after })}`).toBeGreaterThanOrEqual(before.clock);
  };
  const measure = async ({ commits = false, ms = WINDOW_MS } = {}) => {
    // `commits`: invalidate the canvas every 100 ms through the window, as React commits do (applyProps invalidates).
    // Each one restarts R3F's own loop, and rapier's in-step invalidations keep it drawing — the leak a cap must stop.
    if (commits) await page.evaluate(() => { window.__commits = setInterval(() => window.__craftyTest.call('invalidateCanvas'), 100); });
    const a = await state();
    const t0 = Date.now();
    await page.waitForTimeout(ms);
    const b = await state();
    if (commits) await page.evaluate(() => clearInterval(window.__commits));
    const frames = b.frames - a.frames, ticks = b.ticks - a.ticks;
    return { loop: b.loop, frames, ticks, fps: frames / ((Date.now() - t0) / 1000), perTick: ticks ? frames / ticks : NaN };
  };

  await page.waitForTimeout(5000); // the resize and the tier change recompile and reallocate: let that stall pass
  const first = await state();
  expect(first.cap, `SETUP: the default cap is not 60 — ${JSON.stringify(first)}`).toBe(60);
  // Unlimited first: the first window after boot still catches the world's warm-up, and the 60-cap reading needs a
  // settled renderer to mean anything (it starved twice as the first window at a load of 40).
  await setCap(0);
  const free = await measure();
  await setCap(60);
  const at60 = await measure();
  await setCap(TEST_CAP);
  const test1 = await measure({ commits: true, ms: WINDOW_MS * 2 });
  // The Show Stats readout (F3), under the same 1 fps cap: it must report frames DRAWN. drei's stats.js counted R3F
  // loop iterations, and under the cap the loop runs empty iterations — it read the display rate (review #2).
  await page.keyboard.press('F3');
  await page.waitForTimeout(2500);
  const readout = await page.evaluate(() => document.querySelector('[data-testid="frame-stats"]')?.textContent ?? null);
  await page.keyboard.press('F3');
  await setCap(60);
  const r = { at60, free, test1 };
  const where = JSON.stringify(r);
  const line = (k) => `${r[k].loop} ${r[k].fps.toFixed(1)} fps, ${r[k].frames}/${r[k].ticks} ticks`;
  console.log(`frame-cap: cap 60 [${line('at60')}] · unlimited [${line('free')}] · cap ${TEST_CAP} [${line('test1')}]`); // the denominator, every run

  expect([at60.loop, free.loop, test1.loop].join('/'), `the loop modes were not demand under the cap and always without it: ${where}`).toBe('demand/always/demand');
  expect(at60.ticks, `SETUP: the page ticked only ${at60.ticks} times in the 60-cap window — starved, nothing measurable: ${where}`).toBeGreaterThanOrEqual(6);
  expect(free.perTick, `SETUP: the instrument — unlimited drew on ${free.frames} of ${free.ticks} ticks, not ~all of them: ${where}`).toBeGreaterThan(0.75);
  expect(free.fps, `SETUP: this renderer drew ${free.fps.toFixed(1)} fps unlimited — too slow for a ${TEST_CAP} fps cap to bind: ${where}`).toBeGreaterThan(TEST_CAP * 1.5);
  // A cap that binds leaves the skipped ticks cheap, so they come fast; a page ticking a handful of times in six seconds
  // is starved by something else on this machine, and no ratio over it means anything.
  expect(test1.ticks, `SETUP: the page ticked only ${test1.ticks} times in ${WINDOW_MS * 2} ms — the main thread is starved, nothing about the cap is measurable: ${where}`).toBeGreaterThanOrEqual(12);
  expect(test1.perTick, `the ${TEST_CAP} fps cap did not bind — it drew on ${test1.frames} of ${test1.ticks} display ticks: ${where}`).toBeLessThan(0.5);
  expect(test1.fps, `the ${TEST_CAP} fps cap leaked — ${test1.fps.toFixed(2)} fps drawn while the canvas was invalidated from outside: ${where}`).toBeLessThan(TEST_CAP * 1.5);
  expect(readout, `the Show Stats readout is not on screen after F3: ${where}`).not.toBeNull();
  const shownFps = Number((readout.match(/^(\d+) FPS/) || [])[1]);
  expect(shownFps, `Show Stats read "${readout}" under a ${TEST_CAP} fps cap — it counts something other than frames drawn: ${where}`).toBeLessThanOrEqual(TEST_CAP + 1);
  expect(test1.fps, `the ${TEST_CAP} fps cap starved the loop — ${test1.fps.toFixed(2)} fps: ${where}`).toBeGreaterThan(TEST_CAP * 0.4);
  // Below the 60 cap the renderer is the limit, so every tick must draw: the halved-rate bug drew on every other one.
  expect(at60.perTick, `under the 60 cap the loop drew on ${at60.frames} of ${at60.ticks} display ticks — a slow renderer's every tick should draw: ${where}`).toBeGreaterThan(0.75);

  await page.evaluate(() => window.__craftyTest.call('enterCapture'));
  await page.waitForTimeout(500);
  const d = await state();
  expect(d.loop, `the capture harness ran capped ('${d.loop}') — it steps its own frames: ${JSON.stringify(d)}`).toBe('always');
});

// THE TITLE SCREEN PACES THE CANVAS IT COVERS (plan Task 3). The title is an opaque layer with its own WebGL canvas,
// and behind it the game canvas drew the whole world at the display rate. render/canvasPace.js paces it at TITLE_FPS
// while the title covers it — not zero: stopping it would move every shader compile to the instant Start is pressed.
// That the pace BINDS is the test above (the 1 fps cap); this proves the title SELECTS the slow pace and releases it,
// through the real title flag MenuSystem publishes.
//
// Mutation-Proof: via scripts/dev/mutate-e2e.sh, observed RED (identity mutant SURVIVED in the same batch):
//   Q1 MenuSystem never publishes titleCovering -> "the covered canvas drew at 60"
//   Q2 plausible-wrong: titleCovering never cleared on play -> "still paced for the title in play"
//   Q3 GameScene ignores canvasPace (the old capActive) -> "the covered canvas drew at 60"
test('behind the title the game canvas is paced down, whatever the setting; play releases it', async ({ page }) => {
  test.setTimeout(300000);
  await bootDev(page);
  await page
    .waitForFunction(() => { try { return window.__craftyTest.call('readFrameloop') != null; } catch { return false; } }, null, { timeout: 60000 })
    .catch((e) => { throw new Error(`SETUP: the game canvas never mounted its FrameCap (readFrameloop) — ${e.message}`); });
  const pace = () => page.evaluate(() => ({ ...window.__craftyTest.call('readFrameloop'), title: window.useGameStore.getState().titleCovering, cap: window.useGameStore.getState().frameCap }));

  const title = await pace();
  expect(title.title, `SETUP: the title screen is not up at boot: ${JSON.stringify(title)}`).toBe(true);
  expect([title.loop, title.fps], `the covered canvas drew at ${title.fps} (${title.loop}) behind the title: ${JSON.stringify(title)}`).toEqual(['demand', 10]);

  await page.evaluate(() => window.useGameStore.getState().setFrameCap(0)); // Unlimited: the title still paces it
  await page.waitForTimeout(300);
  const titleFree = await pace();
  expect([titleFree.loop, titleFree.fps], `Unlimited drew the covered canvas at the display rate: ${JSON.stringify(titleFree)}`).toEqual(['demand', 10]);
  await page.evaluate(() => window.useGameStore.getState().setFrameCap(60));

  await startPlayActive(page);
  await page.waitForTimeout(300);
  const play = await pace();
  expect(play.title, `the title flag stayed up in play: ${JSON.stringify(play)}`).toBe(false);
  expect([play.loop, play.fps], `still paced for the title in play: ${JSON.stringify(play)}`).toEqual(['demand', 60]);
});
