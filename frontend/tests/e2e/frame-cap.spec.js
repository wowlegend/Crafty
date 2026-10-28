import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { TITLE_FPS } from '../../src/render/canvasPace.js';

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
  // And SETTLE, measured rather than timed: no fixed wait fits every load. With 5 s alone the unlimited window then
  // caught the stall instead — 2 frames in 3 s, so "too slow for a 1 fps cap to bind" (full run, load ~40,
  // 2026-10-27). Wait, unlimited, until two consecutive 1 s windows each draw at least 3 frames, up to 60 s; a
  // renderer that never gets there fails here, named, as a precondition.
  let settled = 0;
  const settling = [];
  for (let i = 0; i < 60 && settled < 2; i++) {
    const w = await measure({ ms: 1000 });
    settling.push(w.frames);
    settled = w.frames >= 3 ? settled + 1 : 0;
  }
  expect(settled, `SETUP: the renderer never settled — frames per 1 s window, unlimited: ${JSON.stringify(settling)}`).toBe(2);
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
// That stepCap BINDS at a given rate is the test above (the 1 fps cap). This proves, through the real title flag
// MenuSystem publishes: the title SELECTS the slow pace and play releases it; the frames drawn under the title are
// DRAWN BY THE PACER (FrameCap's own advance() count, `paced`) — the declared pace alone stays 10 when the pacer is
// not running at all — and no more than TITLE_FPS of them a second; and THE TIER GOVERNOR DOES NOT SAMPLE THEM
// (review 2026-10-27: it read the 10 fps pace as a slow machine and stepped every desktop down to `low` before play).
//
// THE GOVERNOR CASE, AND ITS PRESENCE CONTROL. The tier is set to `med` on the title and must still read `med` after
// the covered canvas has drawn GOVERNOR_FRAMES more: drei judges a batch of 10 windows, a window closing on the first
// frame >= 250 ms after its first, so at <= TITLE_FPS a batch is at most 40 frames and any 60 contain a verdict —
// which, at that rate, is always a decline. Then in play, where this renderer draws far under the governor's 40 fps
// floor, the same governor must step `med` down — so "held on the title" is a governor that was off, not a dead one.
// At a small viewport, as the cap test above: at 1280x800 on a loaded machine the covered canvas drew 0.74 fps.
//
// FRAMES AGAINST DISPLAY TICKS. Measured and printed every run, and the rate bounded by TITLE_FPS. The rate bound
// can fail only on a renderer faster than the pace: CI's software rasteriser drew 6.6 fps UNLIMITED at 480x270 in play
// (frame-cap log, CI run 40514448242), so there it holds by construction and the pacer check carries the case.
//
// Mutation-Proof: via scripts/dev/mutate-e2e.sh, observed RED (identity mutant SURVIVED in the same batch):
//   Q1 MenuSystem never publishes titleCovering -> "the covered canvas drew at 60"
//   Q2 plausible-wrong: titleCovering never cleared on play -> "still paced for the title in play"
//   Q3 GameScene ignores canvasPace (the old capActive) -> "the covered canvas drew at 60"
// Q1-Q3 were recorded on 2026-09-26 on cfea7d41, before this test gained the cases below; NOT re-run since — owed.
// 2026-10-27, this test as committed, one batch (private-port copy of mutate-e2e.sh, SwiftShader, load ~40):
//   identity (a comment edit in GameScene.jsx) SURVIVED: title 64 frames, 61 by the pacer, in 81 ticks over 21.1 s
//     (3.04 fps, 0.79 per tick), tier held med; play: med -> low after 22 frames over 6.4 s.
//   M1 the governor mounted on the old harness-only guard (sampling behind the title) -> RED "the tier governor
//     stepped the tier down behind the title" (tier low after 65 title frames)
//   M3 GameScene's FrameCap `active` wired off under the title -> RED "the covered canvas was not drawn by its pacer"
//     (61 frames, 0 by the pacer: rapier kept R3F's own loop drawing, while the DECLARED pace still read 10 — the
//     reading the previous version of this test asserted)
//   M2 the governor never mounted -> RED "the tier governor never stepped down in play" (114 frames, still med)
// The rate bound (<= TITLE_FPS x 1.5) could not fail on this renderer, which drew ~3 fps behind the title; see above.
// 2026-10-28 UTC, with the pointer lock refused (below), one batch (private-port copy, SwiftShader, COVERAGE=0, load
// 75-200 from other sessions — the title drew at CI's rate here):
//   identity (a comment edit in GameScene.jsx) SURVIVED: title 61 frames, 58 by the pacer, in 73 ticks over 54.6 s
//     (1.12 fps), tier held med; play: med -> low after 30 frames over 37.8 s.
//   M1 -> RED "the tier governor stepped the tier down behind the title" (low after 62 title frames over 62.2 s; the
//     title still up at the end with the world built: active false, started false, world true)
//   M3 -> RED "the covered canvas was not drawn by its pacer" (62 frames, 0 by the pacer)
//   M2 -> RED "the tier governor never stepped down in play" (116 frames over 63.6 s, still med)
const GOVERNOR_FRAMES = 60;
// THE TITLE IS HELD FOR THE WHOLE WINDOW, BY REFUSING THE POINTER LOCK (2026-10-27). What ends the title on its own is
// the world-ready auto-lock (App.jsx: requestPointerLock 100 ms after isSpawnChunkLoaded). Granted, the lock sets
// `active` and latches gameStarted, so the title is gone for good. Behind the title CI's software renderer drew under
// 1 fps, so the 60-frame window outlasted the world build and the title went away inside it, 3 attempts of 3 (CI run
// 40551564326: title false 20 s in, at 19 frames; the HUD up at the failure; no "pointer lock denied" logged) — while
// in the same run world-hitstop's page logged "NotAllowedError: A user gesture is required to request Pointer Lock".
// The difference is this case's own reads: Playwright runs every page.evaluate AS A USER GESTURE (playwright-core
// 1.64.1, Runtime.callFunctionOn with userGesture: true), and the window reads the page once a second, so an auto-lock
// fired inside it can find the activation it needs. A local run with the refusal removed kept the title (2026-10-28,
// world built, lock not taken), so the grant is timing: the auto-lock must fire soon after one of these reads, as on
// CI, where the world landed 20 s into the window. A lock asked for with no gesture is one the game expects refused
// (GameScene.jsx requestPointerLock: "every caller is inside a real click/key gesture"), so this page refuses it from
// boot, as a refusal arrives (a pointerlockerror and a rejected promise): the title then stays up until play is forced
// below, as a player who has not pressed Start sees it. startPlayActive enters play through forcePlay, no lock asked.
const refusePointerLock = () => {
  Element.prototype.requestPointerLock = function refused() {
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('refused by frame-cap.spec.js: no user gesture', 'NotAllowedError'));
  };
};
test('behind the title the game canvas is paced down by its pacer and the tier governor is off; play releases both', async ({ page }) => {
  test.setTimeout(720000);
  await page.addInitScript(refusePointerLock);
  await bootDev(page);
  await page.setViewportSize({ width: 480, height: 270 });
  await page
    .waitForFunction(() => { try { return window.__craftyTest.call('readFrameloop') != null; } catch { return false; } }, null, { timeout: 60000 })
    .catch((e) => { throw new Error(`SETUP: the game canvas never mounted its FrameCap (readFrameloop) — ${e.message}`); });
  // `active`, `started` and `alive` are the title's own gates (ui/panelState.js shouldShowTitleMenu), read beside it so a
  // title that goes away names what took it.
  const pace = () => page.evaluate(() => {
    const g = window.useGameStore.getState();
    return { ...window.__craftyTest.call('readFrameloop'), title: g.titleCovering, cap: g.frameCap, tier: g.qualityTier, ticks: window.__ticks ?? null, active: window.__craftyTest.call('readIntents').active, started: !!g.gameStarted, alive: g.isAlive, world: g.isSpawnChunkLoaded };
  });
  await page.evaluate(() => {
    window.__ticks = 0;
    const count = () => { window.__ticks += 1; requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });
  // Draw until the canvas has drawn `want` more frames or `ms` passes; the window's frames, pacer share, ticks, rate.
  const drawn = async (want, ms) => {
    const a = await pace();
    const t0 = Date.now();
    let b = a;
    while (b.frames - a.frames < want && Date.now() - t0 < ms) {
      await page.waitForTimeout(1000);
      b = await pace();
    }
    const secs = (Date.now() - t0) / 1000;
    const frames = b.frames - a.frames, paced = b.paced - a.paced, ticks = b.ticks - a.ticks;
    return { frames, paced, ticks, secs: +secs.toFixed(1), fps: +(frames / secs).toFixed(2), perTick: ticks ? +(frames / ticks).toFixed(3) : null, title: b.title, tier: b.tier, loop: b.loop, active: b.active, started: b.started, alive: b.alive, world: b.world };
  };

  const title = await pace();
  expect(title.title, `SETUP: the title screen is not up at boot: ${JSON.stringify(title)}`).toBe(true);
  expect([title.loop, title.fps], `the covered canvas drew at ${title.fps} (${title.loop}) behind the title: ${JSON.stringify(title)}`).toEqual(['demand', TITLE_FPS]);

  // The governor case: `med` on the title (set, not inherited from selectTier: `low` is a tier a decline could not move),
  // then a long draw.
  await page.evaluate(() => window.useGameStore.getState().setQualityTier('med'));
  const covered = await drawn(GOVERNOR_FRAMES, 240000);
  const where = JSON.stringify(covered);
  console.log(`frame-cap title: ${covered.frames} frames (${covered.paced} by the pacer) in ${covered.ticks} ticks over ${covered.secs} s — ${covered.fps} fps, ${covered.perTick} per tick; tier ${covered.tier}`); // the denominator
  expect(covered.title, `SETUP: the title went away while it was being measured: ${where}`).toBe(true);
  expect(covered.frames, `the covered canvas drew nothing in ${covered.secs} s — starved behind the title (Start would pay every shader compile at once): ${where}`).toBeGreaterThan(0);
  expect(covered.paced, `the covered canvas was not drawn by its pacer — FrameCap is not running under the title: ${where}`).toBeGreaterThan(0);
  expect(covered.frames - covered.paced, `the covered canvas drew ${covered.frames - covered.paced} frames its pacer did not: ${where}`).toBeLessThanOrEqual(Math.max(2, covered.frames * 0.1));
  expect(covered.fps, `the covered canvas drew ${covered.fps} fps behind the title, over the ${TITLE_FPS} fps pace: ${where}`).toBeLessThanOrEqual(TITLE_FPS * 1.5);
  expect(covered.frames, `SETUP: the covered canvas drew only ${covered.frames} frames — too few for the governor to have judged it: ${where}`).toBeGreaterThanOrEqual(GOVERNOR_FRAMES);
  expect(covered.tier, `the tier governor stepped the tier down behind the title, reading its pace as a slow machine: ${where}`).toBe('med');

  await page.evaluate(() => window.useGameStore.getState().setFrameCap(0)); // Unlimited: the title still paces it
  await page.waitForTimeout(300);
  const titleFree = await pace();
  expect([titleFree.loop, titleFree.fps], `Unlimited drew the covered canvas at the display rate: ${JSON.stringify(titleFree)}`).toEqual(['demand', TITLE_FPS]);
  await page.evaluate(() => window.useGameStore.getState().setFrameCap(60));

  await startPlayActive(page);
  await page.waitForTimeout(300);
  const play = await pace();
  expect(play.title, `the title flag stayed up in play: ${JSON.stringify(play)}`).toBe(false);
  expect([play.loop, play.fps], `still paced for the title in play: ${JSON.stringify(play)}`).toEqual(['demand', 60]);

  // PRESENCE CONTROL: in play the governor runs, and on this renderer it must step `med` down. A tier pinned by
  // something else would read `med` on the title too, so the title case means nothing until this shows a live governor.
  // Counted in FRAMES, not seconds: under 35 fps a window holds at most 10 frames, so 110 frames hold a verdict.
  await page.evaluate(() => window.useGameStore.getState().setQualityTier('med'));
  const VERDICT_FRAMES = 110;
  const a = await pace();
  const t0 = Date.now();
  let b = a;
  while (b.tier === 'med' && b.frames - a.frames < VERDICT_FRAMES && Date.now() - t0 < 240000) {
    await page.waitForTimeout(1000);
    b = await pace();
  }
  const inPlay = { tier: b.tier, frames: b.frames - a.frames, secs: +((Date.now() - t0) / 1000).toFixed(1) };
  const playFps = inPlay.frames / inPlay.secs;
  console.log(`frame-cap play: tier med -> ${inPlay.tier} after ${inPlay.frames} frames over ${inPlay.secs} s (${playFps.toFixed(1)} fps)`);
  expect(playFps, `SETUP: this renderer drew ${playFps.toFixed(1)} fps in play — over the governor's 40 fps floor, so it has nothing to step down: ${JSON.stringify(inPlay)}`).toBeLessThan(35);
  if (inPlay.tier === 'med') {
    expect(inPlay.frames, `SETUP: only ${inPlay.frames} frames drawn in play — too few for the governor to have reached a verdict: ${JSON.stringify(inPlay)}`).toBeGreaterThanOrEqual(VERDICT_FRAMES);
  }
  expect(inPlay.tier, `the tier governor never stepped down in play at ${playFps.toFixed(1)} fps — a dead governor, so the title case measured nothing: ${JSON.stringify(inPlay)}`).toBe('low');
});
