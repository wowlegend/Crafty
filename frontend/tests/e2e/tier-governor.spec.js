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
//      the governor, from med — the wiring is live (the governor's own decline count moves). Its budget is counted in
//      frames drawn, not seconds, and a renderer too slow to supply two monitor windows fails as SETUP;
//   B. an oscillating signal (decline, incline, every 2.5 s for 75 s, through governorSignal — the same step the
//      monitor calls) must leave at most 1 tier change in any minute after the first 20 s, and none after 60 s. The
//      signal is driven directly because CI's software renderer may never reach the incline bound on its own, so a
//      monitor-only oscillation could not be produced there; the monitor's own decisions still land in the same
//      governor and are counted too;
//   C. with the title covering the canvas, at tier med, for as many frames as phase A needed to see a decline, the
//      governor must record no decline.
//
// Mutation-Proof: (2026-10-28, run on this spec as it stands: single-spec local runs through a throwaway config on a free
// port, --retries=0, the software renderer on a loaded machine):
//   E3  onDecline back to a direct setQualityTier (GameScene)                 -> RED: "the monitor never declined through
//       the governor under 70 ms frames, over 81 frames" (run before phase C took its frame budget; E3 dies in phase A,
//       unchanged since)
//   E2c BOTH mount guards removed (`{pace.governor && (` and governorSamples(...) -> true, GameScene)
//                                                                            -> RED: "the governor declined behind the
//       title" (its decline came at 41 frames). With the old flat 8 s wait this same mutant stayed GREEN.
//   E0  identity (a comment edit in tierGovernor.js), twice                   -> SURVIVED (phase A declined at 36-46
//       frames; phase C drew its 60 with no decline)
//   Not run here: E1 (the settle removed). The single-guard E2 cannot be killed by this spec since #22 landed: the title
//   case has two mount guards (render/canvasPace.js `governor`, render/tierGovernor.js governorSamples), each with its
//   own unit gate (canvas-pace-gates' title case went RED under its mutant in the #22 merge).
test('the governor settles under an oscillating signal and ignores the paced-down title', async ({ page }) => {
  // Boot (~1-2 min on CI) + phases A and C (each frame-bounded: about a minute on CI's renderer, capped at 3) + phase B
  // (75 s of signals, each read waiting out a frame).
  test.setTimeout(600000);
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

  // A. The real monitor, driven below its bounds — from `med`, not `high`: any tier above the floor can decline, and med
  // draws faster on the software renderer (render distance 3, not 4), so CI pays fewer seconds per monitor sample.
  await setTier('med');
  const a0 = await gov();
  await page.evaluate(() => window.__craftyTest.call('injectFrameStall', 70));
  // THE BUDGET IS IN FRAMES, NOT SECONDS (CI run 40615649137: 0 declines after a flat 60 s, three attempts of three). A
  // fresh monitor's first window is warm-up and ignored (render/tierGovernor.js rule 4, review 2026-10-27 MED 4), so a
  // decline needs TWO windows after the setTier above remounts the monitor. A window is ten samples, and a sample closes
  // on the first frame >= 250 ms after its first (drei PerformanceMonitor), so two windows take at least 40 frames and at
  // least 5 s. On CI's software renderer (~1-3 fps) 40 frames is most of a minute, and the step's own cost lands in the
  // same wait, which is why 60 s ran out. So: wait until the governor declines, or until the monitor has had well over
  // two windows (A_FRAMES frames AND A_MIN_MS) — only then is "no decline" about the governor. A_CAP_MS bounds a renderer
  // too slow to give it that many, and that case fails as SETUP, naming the frames it drew.
  // Measured locally 2026-10-28 (software renderer, loaded machine): the decline came at 46 frames, 24.9 s. 80 is the
  // headroom; it costs time only on a red run, since the wait ends at the decline.
  const A_FRAMES = 80, A_MIN_MS = 12000, A_CAP_MS = 180000;
  const at = () => page.evaluate(() => ({ frames: window.__craftyTest.call('readFrameloop').frames, t: performance.now() }));
  const s0 = await at();
  await page.waitForFunction(({ d, s, F, M }) => window.__craftyTest.call('readGovernor').declines > d
    || (window.__craftyTest.call('readFrameloop').frames - s.frames >= F && performance.now() - s.t >= M),
  { d: a0.declines, s: s0, F: A_FRAMES, M: A_MIN_MS }, { timeout: A_CAP_MS, polling: 500 }).catch(() => {});
  await page.evaluate(() => window.__craftyTest.call('injectFrameStall', 0));
  const a1 = await gov();
  const s1 = await at();
  const drawn = s1.frames - s0.frames;
  const secs = ((s1.t - s0.t) / 1000).toFixed(1);
  console.log(`tier-governor: phase A — ${drawn} frames in ${secs} s under the stall, declines ${a0.declines} -> ${a1.declines}`); // the denominator
  const whereA = JSON.stringify({ a0, a1, drawn, secs });
  expect(a1.declines > a0.declines || drawn >= A_FRAMES, `SETUP: the renderer drew only ${drawn} frames in ${secs} s — two monitor windows need at least 40, so the governor was never given a decision to make: ${whereA}`).toBe(true);
  expect(a1.declines, `the monitor never declined through the governor under 70 ms frames, over ${drawn} frames: ${whereA}`).toBeGreaterThan(a0.declines);

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

  // C. The title paces the canvas to 10 fps; the governor must not read that as a slow GPU. From `med`, for phase A's reason.
  // THE ABSENCE NEEDS A DENOMINATOR (mutation 2026-10-28: with BOTH mount guards removed — `pace.governor` and
  // governorSamples — this phase's old flat 8 s stayed GREEN: on a software renderer 8 s is less than the two monitor
  // windows a decline takes, so it could not fail). It now waits for as many frames behind the title as phase A needed to
  // see a decline (44-46 measured locally), with headroom, ending early only on a decline.
  await setTier('med');
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: true }));
  // The pace is applied by a React render of the Canvas, which on CI's renderer can wait out a multi-second frame.
  await page.waitForFunction(() => window.__craftyTest.call('readFrameloop').fps === 10, null, { timeout: 30000, polling: 250 }).catch(() => {});
  const titled = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(titled.fps, `SETUP: the title did not pace the canvas down: ${JSON.stringify(titled)}`).toBe(10);
  const c0 = await gov(); // read once the title is up, so a play-pace decision just before it cannot be counted here
  const C_FRAMES = 60, C_MIN_MS = 12000, C_CAP_MS = 180000;
  const t0 = await at();
  await page.waitForFunction(({ d, s, F, M }) => window.__craftyTest.call('readGovernor').declines > d
    || (window.__craftyTest.call('readFrameloop').frames - s.frames >= F && performance.now() - s.t >= M),
  { d: c0.declines, s: t0, F: C_FRAMES, M: C_MIN_MS }, { timeout: C_CAP_MS, polling: 500 }).catch(() => {});
  const c1 = await gov();
  const t1 = await at();
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: false }));
  const drawnC = t1.frames - t0.frames;
  const secsC = ((t1.t - t0.t) / 1000).toFixed(1);
  console.log(`tier-governor: phase C — ${drawnC} frames in ${secsC} s behind the title, declines ${c0.declines} -> ${c1.declines}`); // the denominator
  const whereC = JSON.stringify({ c0, c1, drawnC, secsC });
  expect(c1.declines, `the governor declined behind the title (10 fps by design): ${whereC}`).toBe(c0.declines);
  expect(drawnC, `SETUP: only ${drawnC} frames drawn behind the title in ${secsC} s — fewer than a decline needs, so its absence says nothing: ${whereC}`).toBeGreaterThanOrEqual(C_FRAMES);
});
