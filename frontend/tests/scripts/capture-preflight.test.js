import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBrowserProducesFrames } from '../../scripts/visual/capture.mjs';

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
