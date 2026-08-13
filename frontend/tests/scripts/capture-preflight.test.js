import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBrowserProducesFrames, flushFrames } from '../../scripts/visual/capture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// THE PREFLIGHT THAT TURNS A THREE-MINUTE SILENCE INTO A NAMED CAUSE.
//
// capture.mjs's flushFrames() awaits requestAnimationFrame inside a page.evaluate. When the browser stops
// producing frames, that evaluate never returns, and puppeteer's default 180s protocolTimeout eventually
// reports `ProtocolError: Runtime.callFunctionOn timed out` with a stack pointing into puppeteer internals
// and nothing else. On 2026-08-02 that outage was misdiagnosed three separate ways — machine load, then a
// code regression, then a broken Chrome install — before a probe showed rAF firing 0 times in 2s and
// Page.captureScreenshot hanging on a bare data: URL with no app loaded.
//
// The preflight asks that question directly and aborts. These tests pin BOTH branches of its decision
// against a stub page, which matters because the failing branch is the only one reproducible on a machine
// whose compositor is wedged — the passing branch cannot be exercised there at all. Injecting the frame
// count removes the browser from the question entirely.
const stubPage = (frames) => ({ evaluate: async () => frames });

describe('capture preflight — browser frame production', () => {
  it('aborts when the browser produced no frames', async () => {
    await expect(assertBrowserProducesFrames(stubPage(0))).rejects.toThrow(/not producing frames/);
  });

  it('names the cause as an ENVIRONMENT fault, not a code regression', async () => {
    // The whole point is legibility. If this message degrades, the next outage costs hours again.
    await expect(assertBrowserProducesFrames(stubPage(0))).rejects.toThrow(/ENVIRONMENT fault/);
    await expect(assertBrowserProducesFrames(stubPage(0))).rejects.toThrow(/REBOOT/);
  });

  it('passes on a SINGLE frame — the weakest bar that still detects total death', async () => {
    // Deliberately not a throughput check. A stricter bar would block capture on a merely slow machine,
    // which is the false diagnosis this file has already been bitten by twice.
    await expect(assertBrowserProducesFrames(stubPage(1))).resolves.toBe(1);
  });

  it('passes on a healthy frame rate', async () => {
    await expect(assertBrowserProducesFrames(stubPage(72))).resolves.toBe(72);
  });
});

// Added 2026-08-08 with the shot() wrapper. The stability check that makes the visual gate
// deterministic used to live in waitForStableTerrain, but every state then moves the camera and sleeps
// before its screenshot -- and a chunk landing in THAT gap was unguarded, which is where explore-day's
// residual 0.201% self-diff came from. The fix only holds if EVERY frame goes through the one door, and
// there were 27 call sites and no helper. This asserts the door stays the only way through.
describe('capture: every gated frame goes through shot(), which waits for a stable frame', () => {
  const cap = readFileSync(resolve(HERE, '../../scripts/visual/capture.mjs'), 'utf8');

  // Both assertions below used to be CHARACTER-DISTANCE proxies ("the bare screenshot is within 400
  // chars of `shot(`", "waitForStableFrame within 300 chars"). That is not the invariant — it is a
  // correlate of it, and it fails for the wrong reason the moment anyone adds a comment inside shot().
  // It did exactly that on 2026-08-09 when a WebGL context-loss check was added to the function, at
  // which point the only ways to go green were to shrink a comment or to raise the number. Raising it
  // would have been relaxing a gate to pass. Brace-matching the real body is strictly STRONGER: it
  // cannot be satisfied by proximity, and it is indifferent to how much prose the function carries.
  const bodyOf = (src, signature) => {
    const at = src.indexOf(signature);
    if (at === -1) return null;
    const open = src.indexOf('{', at);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return { start: open, end: i, text: src.slice(open, i + 1) };
      }
    }
    return null;
  };

  it('has exactly one bare page.screenshot, and it is INSIDE the shot() body', () => {
    const bare = cap.match(/await page\.screenshot\(/g) || [];
    expect(bare, 'a second bare page.screenshot means a frame can bypass the stability wait')
      .toHaveLength(1);
    const body = bodyOf(cap, 'async function shot(page, name)');
    expect(body, 'shot(page, name) not found — the single door was renamed or removed').not.toBeNull();
    const bareIdx = cap.indexOf('await page.screenshot(');
    expect(bareIdx, 'the only screenshot is OUTSIDE shot() — it bypasses the stability wait')
      .toBeGreaterThan(body.start);
    expect(bareIdx, 'the only screenshot is AFTER shot() ends — it bypasses the stability wait')
      .toBeLessThan(body.end);
  });

  it('shot() waits on the frame BEFORE writing it, in that order', () => {
    const body = bodyOf(cap, 'async function shot(page, name)');
    expect(body).not.toBeNull();
    const waitAt = body.text.indexOf('await waitForStableFrame(');
    const shotAt = body.text.indexOf('await page.screenshot(');
    expect(waitAt, 'shot() does not wait for a stable frame at all').toBeGreaterThan(-1);
    expect(shotAt, 'shot() does not take a screenshot').toBeGreaterThan(-1);
    expect(waitAt, 'shot() screenshots BEFORE waiting — the wait is decorative')
      .toBeLessThan(shotAt);
  });

  it('the states are captured through it -- with the denominator asserted, not assumed', () => {
    const routed = cap.match(/await shot\(page, /g) || [];
    expect(routed.length).toBeGreaterThanOrEqual(26);
  });
});

// PHASE C — THE HARNESS MUST DECLARE THE PHASE IT PHOTOGRAPHS.
//
// `stepCaptureFrames` and the deterministic clock shipped on 2026-08-09 under a commit titled
// "step-then-shoot", and its body said it was "wired to the test bridge as a hook so the harness can
// drive it". It touched three files: App.jsx, captureClock.js, and that module's gate. capture.mjs --
// 766 lines and 31 screenshot sites -- contained zero references to it. The primitive and the hook
// existed; nothing called them. That is this repo's own most-repeated defect class (shipped, compiling,
// gated green, never RUN) sitting inside the harness built to catch it, and it survived because no gate
// asserted the CALLER.
//
// Reading capture.mjs's source is the correct tool here and not a proxy: the thing being asserted is
// that one particular script calls one particular hook in one particular order. Executing capture.mjs
// means launching a browser and a vite server, which is the harness itself, not a test of it.
describe('capture: every gated frame is shot at a DECLARED clock phase', () => {
  const cap = readFileSync(resolve(HERE, '../../scripts/visual/capture.mjs'), 'utf8');
  const shotBody = (() => {
    const at = cap.indexOf('async function shot(page, name)');
    if (at === -1) return null;
    const open = cap.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < cap.length; i++) {
      if (cap[i] === '{') depth++;
      else if (cap[i] === '}' && --depth === 0) return cap.slice(open, i + 1);
    }
    return null;
  })();

  it('shot() pins the phase, and does it BEFORE the frame it will photograph is rendered', () => {
    expect(shotBody, 'shot(page, name) not found — the single door was renamed').not.toBeNull();
    const pinAt = shotBody.indexOf("'setCaptureFrame'");
    const waitAt = shotBody.indexOf('await waitForStableFrame(');
    const shotAt = shotBody.indexOf('await page.screenshot(');
    expect(pinAt, 'shot() never pins the capture phase — the clock is free-running and the phase is whatever the machine drew').toBeGreaterThan(-1);
    expect(pinAt, 'shot() pins the phase AFTER the stability wait, so the wait rendered the OLD phase').toBeLessThan(waitAt);
    expect(pinAt, 'shot() pins the phase after the screenshot, which is too late to be in the picture').toBeLessThan(shotAt);
  });

  it('the phase is one named constant, not a literal repeated per call site', () => {
    // A per-state phase is one more thing a baseline diff can disagree about for a reason nobody
    // remembers. Anchored to the declaration, not to a number, so retuning the phase does not red this.
    expect(cap).toMatch(/const CAPTURE_PHASE_FRAMES = \d+;/);
    expect(shotBody).toContain('CAPTURE_PHASE_FRAMES');
  });

  it('the run reports the phase DENOMINATOR and fails on an undeclared one', () => {
    // "Every frame was posed at t=1.5s" is a claim. A claim nothing counts is how this harness once
    // reported a clean pass over 42% of a corpus it never examined.
    // AND THE RECORDED PHASE MUST BE WHAT THE PAGE RETURNED, NOT WHAT WE ASKED FOR. Found by a mutation
    // that stayed GREEN: this test originally asserted only that `phases.push(` existed, so replacing
    // the recorded value with the constant we requested passed cleanly — a denominator that reports the
    // request rather than the result, which is the "status pill nothing can falsify" defect wearing a
    // count. The recorded value has to trace back to the awaited bridge call.
    const push = shotBody.match(/phases\.push\(([^)]*)\)/);
    expect(push, 'nothing records which frames were pinned').not.toBeNull();
    expect(push[1], 'the recorded phase is the value we REQUESTED, not the one the page confirmed')
      .not.toContain('CAPTURE_PHASE_FRAMES');
    expect(push[1], 'the recorded phase does not reference the awaited result at all').toMatch(/\bphase\b/);
    expect(shotBody.indexOf('const phase = await'), 'the recorded phase is not bound from an awaited call')
      .toBeGreaterThan(-1);
    expect(cap, 'the summary never prints how many frames were pinned').toMatch(/frames pinned at/);
    const wrongBlock = cap.indexOf('UNDECLARED phase');
    expect(wrongBlock, 'a frame shot at an unexpected phase is not reported').toBeGreaterThan(-1);
    expect(cap.slice(wrongBlock, wrongBlock + 400), 'an undeclared phase is reported but does not fail the run').toContain('process.exitCode = 1');
  });
});

// A SKIPPED GATED FRAME MUST REACH THE SENTINEL, NOT ONLY THE CONSOLE.
//
// The title-mascot shot is wrapped in a try/catch that falls through to the CLEAN end by design — the
// other 30 frames should still land. But the run then writes `complete: true, crashes: 0` over a capture
// that never photographed a gated frame, and the only thing that caught it was the leftover png's mtime:
// a symptom, in another file, that fires by coincidence rather than because anything recorded the skip.
//
// THIS GATE EXISTS BECAUSE ITS ABSENCE WAS MEASURED. Deleting `skippedGated.push` from the catch left the
// whole suite GREEN — the recorder was wired and nothing proved it was invoked, which is this repo's
// signature defect and the reason `evaluateCaptureFreshness`'s own unit test cannot close it: that test
// is handed a `skipped` array, and says nothing about whether capture.mjs ever fills one.
//
// Anchored to the CATCH BLOCK, not to a global token. A previous structural gate here claimed to prove
// "the freezer reads every run directory" and stayed green under a mutation, because it matched an
// unrelated second occurrence. A slice cannot do that.
describe('capture: a gated frame it fails to take is RECORDED, not just logged', () => {
  const cap = readFileSync(resolve(HERE, '../../scripts/visual/capture.mjs'), 'utf8');

  it('records the skip inside the title-mascot catch block itself', () => {
    const at = cap.indexOf("captureStage = 'title-mascot';");
    expect(at, 'the title-mascot stage is gone — this gate is asserting over nothing').toBeGreaterThan(-1);
    const close = cap.indexOf('} finally {', at);
    expect(close, 'no finally after the title-mascot stage — the slice below would run to EOF').toBeGreaterThan(at);
    const stage = cap.slice(at, close);

    const catchAt = stage.indexOf('} catch (e) {');
    expect(catchAt, 'the title-mascot shot is no longer wrapped in a catch').toBeGreaterThan(-1);
    const catchBody = stage.slice(catchAt);
    expect(catchBody, 'the catch swallows a missed GATED frame without recording it — the sentinel will say complete')
      .toMatch(/skippedGated\.push\(/);
  });

  it('every sentinel write carries the skip list, so no exit path can drop it', () => {
    // Three writes: the crashed end, the fatal-GL end, and the clean end. A skip recorded on only one of
    // them is a hole shaped exactly like the one this replaces.
    // Matched per LINE: the object literal contains `Date.now()`, so a `[^)]*` body regex stops at the
    // first paren and silently matches nothing — which reads as "zero writes" rather than as a broken
    // pattern. That mistake was made here first, and it is the same shape as the gate above.
    const writes = cap.split('\n').filter((l) => l.includes('writeFileSync(META'));
    const withFinish = writes.filter((w) => w.includes('finishedAt'));
    expect(withFinish.length, 'the end-of-run sentinel writes have moved — recount before trusting this').toBe(3);
    for (const w of withFinish) {
      expect(w, `a sentinel write omits the skip list: ${w.slice(0, 90)}…`).toMatch(/skipped:/);
    }
  });
});

// AND THE PRODUCER, per the lesson two describes above: machineHeadroom.test.js is HANDED readings, so
// it says nothing about whether capture.mjs ever takes any. That is the exact split that let a deleted
// `skippedGated.push` sail through a green suite earlier today.
describe('capture: the machine it ran on is RECORDED, on every exit path', () => {
  const cap = readFileSync(resolve(HERE, '../../scripts/visual/capture.mjs'), 'utf8');

  it('actually reads the machine, rather than importing the evaluator and not calling it', () => {
    expect(cap, 'the headroom evaluator is not imported').toMatch(/evaluateMachineHeadroom/);
    expect(cap, 'imported and never called — the sentinel would carry no machine state')
      .toMatch(/evaluateMachineHeadroom\(\{/);
    // The readings must come from the OS, not from a literal: a hardcoded 20000MB would satisfy every
    // other assertion here and record a machine nobody ran on.
    const at = cap.indexOf('evaluateMachineHeadroom({');
    const call = cap.slice(at, at + 260);
    expect(call, 'free memory is not read from the OS').toMatch(/freemem\(\)/);
    expect(call, 'total memory is not read from the OS').toMatch(/totalmem\(\)/);
    expect(call, 'load is not read from the OS').toMatch(/loadavg\(\)/);
    expect(call, 'core count is not read from the OS').toMatch(/cpus\(\)/);
  });

  it('records it on every sentinel write, start and end alike', () => {
    // A run that dies mid-way is precisely the one whose machine state matters, so the START write has
    // to carry it too — recording only at a clean end would omit every crash.
    const writes = cap.split('\n').filter((l) => l.includes('writeFileSync(META'));
    expect(writes.length, 'the sentinel writes have moved — recount before trusting this').toBe(4);
    for (const w of writes) {
      expect(w, `a sentinel write omits the machine state: ${w.trim().slice(0, 80)}…`).toMatch(/machine/);
    }
  });

  it('WARNS without aborting — the threshold is a guess and a refused run is a datapoint not collected', () => {
    const at = cap.indexOf('for (const w of machine.warnings)');
    expect(at, 'the warnings are computed and never surfaced').toBeGreaterThan(-1);
    expect(cap.slice(at, at + 200), 'a headroom warning kills the run — it must not, see machineHeadroom.js')
      .not.toMatch(/process\.exit|throw /);
  });
});

// A WEDGED COMPOSITOR MUST ABORT, NOT HANG — and the cost of not doing so was measured.
//
// 2026-08-13: a capture wedged at the achievements-open stage with 28 of 31 frames written. node sat at
// 4.7 SECONDS of CPU across 31 minutes while the SwiftShader GPU helper burned 917% CPU and 231 MINUTES
// of CPU time. Nothing was emitted — no error, no timeout, no log line. puppeteer's default 180s
// protocolTimeout never fired either. It was found only by comparing PNG mtimes against the run start.
//
// flushFrames' docblock forbade "fixing" this with a setTimeout, and that rule is right about the thing
// it was protecting: a fallback that lets the run CONTINUE screenshots blank frames and produces a green
// gate over pictures of nothing. But its own last sentence names the alternative — abort rather than
// degrade — and the rule was being read as forbidding both. So the deadline THROWS.
//
// Driven against a stub page whose evaluate never settles, which is precisely a wedged compositor and
// cannot be reproduced on demand any other way.
describe('capture: a wedged compositor aborts loudly instead of hanging forever', () => {
  const neverResolves = { evaluate: () => new Promise(() => {}) };

  it('throws when rAF never comes back, rather than waiting forever', async () => {
    await expect(flushFrames(neverResolves, 8, { deadlineMs: 40, label: 'achievements-open' }))
      .rejects.toThrow(/CAPTURE ABORTED/);
  });

  it('names the STAGE, so the failure points somewhere', async () => {
    // The 2026-08-13 hang was illegible precisely because nothing said where it stopped.
    await expect(flushFrames(neverResolves, 8, { deadlineMs: 40, label: 'achievements-open' }))
      .rejects.toThrow(/achievements-open/);
  });

  it('describes the SIGNATURE, since the cause is invisible from node', async () => {
    // node is idle during this failure; the evidence is a GPU helper pinned across several cores. A
    // reader who does not know that will look at the wrong process.
    await expect(flushFrames(neverResolves, 8, { deadlineMs: 40 }))
      .rejects.toThrow(/GPU helper process pinned/);
  });

  it('does NOT throw when the page answers — the presence case', async () => {
    // Without this, an implementation that threw unconditionally would pass every assertion above.
    const healthy = { evaluate: async () => undefined };
    await expect(flushFrames(healthy, 8, { deadlineMs: 40 })).resolves.toBeUndefined();
  });

  it('clears its timer, so a healthy flush cannot leave the process alive', async () => {
    // A dangling 120s timer per flush would keep node from exiting after the last frame — a capture that
    // finishes and then appears to hang, which is the same symptom this whole block is about.
    //
    // FIRST DRAFT OF THIS WAS BLIND: it compared process._getActiveHandles().length before and after,
    // which does not track timers at all, so before === after unconditionally and the assertion passed
    // against a version that never called clearTimeout. Counting the timers directly is the fix; a
    // green mutation is the finding, and this is the third instance of it today.
    const healthy = { evaluate: async () => undefined };
    vi.useFakeTimers();
    try {
      await flushFrames(healthy, 8, { deadlineMs: 120_000 });
      expect(vi.getTimerCount(), 'flushFrames leaked a pending timer').toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
