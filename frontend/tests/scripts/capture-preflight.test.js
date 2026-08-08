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

  it('has exactly one bare page.screenshot, and it is inside shot()', () => {
    const bare = cap.match(/await page\.screenshot\(/g) || [];
    expect(bare).toHaveLength(1);
    // ...and it sits within the shot() body, not loose in main()
    const shotIdx = cap.indexOf('async function shot(page, name)');
    const bareIdx = cap.indexOf('await page.screenshot(');
    expect(shotIdx).toBeGreaterThan(-1);
    expect(bareIdx).toBeGreaterThan(shotIdx);
    expect(bareIdx - shotIdx).toBeLessThan(400);
  });

  it('shot() actually waits on the frame before writing it', () => {
    expect(cap).toMatch(/async function shot\(page, name\)[\s\S]{0,300}await waitForStableFrame\(/);
  });

  it('the states are captured through it -- with the denominator asserted, not assumed', () => {
    const routed = cap.match(/await shot\(page, /g) || [];
    expect(routed.length).toBeGreaterThanOrEqual(26);
  });
});
