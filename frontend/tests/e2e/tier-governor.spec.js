import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import {
  A_FRAMES, A_MIN_MS, A_CAP_MS, B_SIGNALS, B_CAP_MS, C_PACE_MS, C_MIN_MS, C_CAP_MS, TEST_TIMEOUT_MS,
  oscillation, fireOscillation, phaseBVerdict, cFramesFor,
} from './_governorPhases.js';

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
//   B. an oscillating signal (decline, incline, every 2.5 s for 82.5 s, through governorSignal — the same step the
//      monitor calls) must leave at most 1 tier change in any minute after the first 20 s, and none after 60 s. The
//      signal is driven directly because CI's software renderer may never reach the incline bound on its own, so a
//      monitor-only oscillation could not be produced there; the monitor's own decisions still land in the same
//      governor and are counted too. The PAGE fires the whole schedule in one evaluate, each signal at its own offset
//      (_governorPhases.js fireOscillation), and the verdict is phaseBVerdict;
//   C. with the title covering the canvas, at tier med, for as many frames as phase A needed to see a decline (never
//      fewer than 60), the governor must record no decline.
//
// PHASE B USED TO COST 316 s ON CI, NOT 75 (PR run 40637608377, shard 7, the trace; 2026-10-28). It sent one Playwright
// round trip per signal, and on CI's software renderer 28 of the 30 governorSignal evaluates took 2.3-8.1 s, with ~3 s more per
// iteration, so the signals ran ~10.5 s apart. Phases A (a decline by 70 frames, 132.1 s) and B (two changes, then
// settled) passed, and phase C's frame wait began at 502 s of the 600 s timeout, with a 180 s cap of its own; the
// timeout fired inside it, naming nothing, and the shard's 25 minutes cut off the retry. The governor did nothing wrong
// that the run could see: behind the title it recorded no decline in the 98 s it was given. That was the SPEC: a
// wall-clock assumption on a frame-starved runner, the class f0c9618c fixed in phase A. Also found: the minute-window
// loop (`for (let w = 20; w + 60 <= 75; ...)`) never ran an iteration, so only "no change after 60 s" was ever asserted.
// The schedule, the verdict, phase C's frame budget and the caps' fit inside TEST_TIMEOUT_MS are now
// tests/gates/governor-phases-gates, which also shows a governor that never settles (E1) FAILS phase B's verdict on
// that schedule, on a page as stalled as CI's.
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
//   Not run here: E1 (the settle removed) in a browser; tests/gates/governor-phases-gates drives E1 through phase B's
//   schedule and verdict and it FAILS there. Phase B's new one-evaluate schedule has had no browser run on CI yet: the
//   spec-to-helper seam is OWED to CI. The single-guard E2 cannot be killed by this spec since #22 landed: the title
//   case has two mount guards (render/canvasPace.js `governor`, render/tierGovernor.js governorSamples), each with its
//   own unit gate (canvas-pace-gates' title case went RED under its mutant in the #22 merge).
test('the governor settles under an oscillating signal and ignores the paced-down title', async ({ page }) => {
  // Boot (42 s on CI's last run) + phase A (frame-bounded, 132.1 s there, capped at 3 min) + phase B (82.5 s of signals,
  // capped at 100 s) + phase C (frame-bounded, capped at 30 s + 3 min): the caps fit TEST_TIMEOUT_MS (the gate), so a
  // slow phase fails naming itself.
  test.setTimeout(TEST_TIMEOUT_MS);
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
  // headroom; it costs time only on a red run, since the wait ends at the decline. On CI (run 40637608377) it came at
  // 70 frames, 132.1 s. A_FRAMES, A_MIN_MS and A_CAP_MS live in _governorPhases.js with the budget they must fit.
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

  // B. An oscillating signal through the same step, fired by the PAGE on an absolute schedule in one evaluate: one
  // round trip per signal cost 316 s on CI, and spaced the signals ~10.5 s apart instead of 2.5 (header).
  await setTier('high');
  const b = await page.evaluate(fireOscillation, { schedule: oscillation(), capMs: B_CAP_MS });
  const log = await page.evaluate((t0) => window.__tierLog.filter((e) => e.t >= t0).map((e) => ({ ...e, s: (e.t - t0) / 1000 })), b.t0);
  const list = log.map((e) => `${e.s.toFixed(1)}s ${e.from}->${e.to}`).join(', ');
  const endS = b.fired.length ? b.fired[b.fired.length - 1].s : 0;
  const gapS = Math.max(0, ...b.fired.slice(1).map((f, i) => f.s - b.fired[i].s));
  console.log(`tier-governor: phase B — ${b.fired.length}/${B_SIGNALS} signals in ${endS.toFixed(1)} s (largest gap ` +
    `${gapS.toFixed(1)} s); changes [${list}] · governor ${JSON.stringify(await gov())}`); // the denominator
  expect(b.fired.length, `SETUP: the page fired only ${b.fired.length} of ${B_SIGNALS} signals within ${B_CAP_MS} ms — ` +
    `the oscillation was never delivered whole, so its verdict means nothing (changes: ${list})`).toBe(B_SIGNALS);
  const verdictB = phaseBVerdict(log, endS);
  expect(verdictB.windows.length, `no minute-window after 20 s was checked (last signal at ${endS.toFixed(1)} s)`).toBeGreaterThan(0);
  for (const w of verdictB.windows) {
    expect(w.n, `${w.n} tier changes in the minute from ${w.from} s of an oscillating signal: ${list}`).toBeLessThanOrEqual(1);
  }
  expect(verdictB.late, `tier changes after 60 s of an oscillating signal: ${list}`).toEqual([]);

  // C. The title paces the canvas to 10 fps; the governor must not read that as a slow GPU. From `med`, for phase A's reason.
  // THE ABSENCE NEEDS A DENOMINATOR (mutation 2026-10-28: with BOTH mount guards removed — `pace.governor` and
  // governorSamples — this phase's old flat 8 s stayed GREEN: on a software renderer 8 s is less than the two monitor
  // windows a decline takes, so it could not fail). It now waits for as many frames behind the title as phase A needed to
  // see a decline in THIS run (44-46 locally, 70 on CI: the fixed 60 it used to wait was fewer than CI's decline took),
  // never fewer than 60, ending early only on a decline (_governorPhases.js cFramesFor).
  await setTier('med');
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: true }));
  // The pace is applied by a React render of the Canvas, which on CI's renderer can wait out a multi-second frame.
  await page.waitForFunction(() => window.__craftyTest.call('readFrameloop').fps === 10, null, { timeout: C_PACE_MS, polling: 250 }).catch(() => {});
  const titled = await page.evaluate(() => window.__craftyTest.call('readFrameloop'));
  expect(titled.fps, `SETUP: the title did not pace the canvas down: ${JSON.stringify(titled)}`).toBe(10);
  const c0 = await gov(); // read once the title is up, so a play-pace decision just before it cannot be counted here
  const C_FRAMES = cFramesFor(drawn);
  const t0 = await at();
  await page.waitForFunction(({ d, s, F, M }) => window.__craftyTest.call('readGovernor').declines > d
    || (window.__craftyTest.call('readFrameloop').frames - s.frames >= F && performance.now() - s.t >= M),
  { d: c0.declines, s: t0, F: C_FRAMES, M: C_MIN_MS }, { timeout: C_CAP_MS, polling: 500 }).catch(() => {});
  const c1 = await gov();
  const t1 = await at();
  await page.evaluate(() => window.useGameStore.setState({ titleCovering: false }));
  const drawnC = t1.frames - t0.frames;
  const secsC = ((t1.t - t0.t) / 1000).toFixed(1);
  console.log(`tier-governor: phase C — ${drawnC} of ${C_FRAMES} frames in ${secsC} s behind the title, declines ${c0.declines} -> ${c1.declines}`); // the denominator
  const whereC = JSON.stringify({ c0, c1, drawnC, needed: C_FRAMES, secsC });
  expect(c1.declines, `the governor declined behind the title (10 fps by design): ${whereC}`).toBe(c0.declines);
  expect(drawnC, `SETUP: only ${drawnC} frames drawn behind the title in ${secsC} s — fewer than a decline needs, so its absence says nothing: ${whereC}`).toBeGreaterThanOrEqual(C_FRAMES);
});
