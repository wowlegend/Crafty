// The extended `test` every e2e spec imports, so V8 coverage wraps the REAL playthrough.
//
// WHY A FIXTURE AND NOT A HELPER CALL. Coverage has to start BEFORE `page.goto` (module-load code runs
// during navigation and would otherwise be invisible) and stop while the page is still ALIVE. An `auto`
// fixture is the only hook Playwright gives that brackets a test on both sides without every spec
// remembering to. A spec that forgets is a spec that silently contributes nothing, which is the
// denominator failure this repo keeps shipping — so the wiring must not be opt-in per test.
//
// Specs import `test` from HERE rather than from '@playwright/test'. `expect` is re-exported so the
// import line is a one-for-one swap and nothing else in a spec changes.
import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIsolatedFailures, isolatedFailureLine, isolatedFailureProblem } from './_isolatedFailures.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'test-results/coverage');

// Set COVERAGE=0 to skip collection. Deliberately opt-OUT: the default has to be the collecting one, or
// the instrument quietly stops running the moment someone forgets a flag, and reports nothing forever.
const ENABLED = process.env.COVERAGE !== '0';

let seq = 0;

// THE SUITE'S PIXEL-RATIO CAP (src/devtest/e2eDpr.js; numbers in the note atop playwright.config.js). Written on the page
// before any of its scripts run, so both R3F canvases are created under it; a spec that needs the canvas at its own
// pixel ratio opts out with `test.use({ e2eDprCap: null })` and says why beside it. A fixture OPTION, not a constant:
// the default is the one place it is set, and an opt-out is visible in the spec it changes.
export const E2E_DPR_CAP = 0.5;

/** The live canvases' drawing-buffer ratio (device px per CSS px), read off the DOM: what the cap actually did. */
const readCanvasRatios = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('canvas')]
      .filter((c) => c.clientWidth > 0 && c.clientHeight > 0 && c.width > 1)
      .map((c) => `${c.width}x${c.height}/${c.clientWidth}x${c.clientHeight}`),
  );

export const test = base.extend({
  e2eDprCap: [E2E_DPR_CAP, { option: true }],
  page: async ({ page, e2eDprCap }, use, testInfo) => {
    if (e2eDprCap != null) await page.addInitScript((cap) => { window.__craftyE2eDprCap = cap; }, e2eDprCap);
    let started = false;
    if (ENABLED) {
      try {
        // resetOnNavigation:false — the boot sequence navigates, and resetting there would discard
        // exactly the module-load execution that proves a subsystem was constructed at all.
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
        started = true;
      } catch {
        // Chromium-only API. A non-Chromium project must not fail the test over an instrument.
      }
    }

    await use(page);

    // Every test prints what its canvases were drawn at (drawing buffer / CSS box), cap or no cap: the denominator that
    // says the cap reached the canvases, read off the DOM rather than off the setting.
    // Bounded: a page stuck in a frame must not hold the teardown (a read that does not return in 5 s prints as such).
    try {
      const canvases = await Promise.race([readCanvasRatios(page), new Promise((r) => setTimeout(() => r(null), 5000))]);
      const shown = canvases === null ? 'unread (the page did not answer in 5 s)' : canvases.join(' ') || 'none';
      console.log(`[e2e-dpr] cap ${e2eDprCap ?? 'off'} · ${testInfo.title.slice(0, 60)} · canvases ${shown}`);
    } catch {
      // A closed or crashed page has nothing to read; the test's own verdict stands.
    }

    // What the game's isolated reactors and effects threw while this test ran (src/game/isolatedEffects.js). Read before the
    // coverage is written and raised after it, so a failing test still leaves its coverage file.
    const isolated = await readIsolatedFailures(page);
    console.log(isolatedFailureLine(isolated, testInfo.title));
    const isolatedProblem = isolatedFailureProblem(isolated);

    if (started) {
      await writeCoverage(page, testInfo);
    }
    if (isolatedProblem) throw new Error(isolatedProblem);
  },
});

async function writeCoverage(page, testInfo) {
  try {
    const entries = await page.coverage.stopJSCoverage();
    // Keep url + ranges only. `source` is the FULL module text per entry, which turns a shard's
    // artifact into tens of MB of the repo's own source for no analytical gain.
    const slim = entries.map((e) => ({
      url: e.url,
      functions: (e.functions || []).map((f) => ({ ranges: (f.ranges || []).map((r) => ({ count: r.count })) })),
    }));
    mkdirSync(OUT, { recursive: true }); // FIRST — writeFileSync into a missing dir throws
    const safe = `${testInfo.title}-${seq++}`.replace(/[^a-z0-9-]+/gi, '_').slice(0, 80);
    writeFileSync(resolve(OUT, `${safe}.json`), JSON.stringify(slim));
  } catch {
    // A page that already crashed cannot report coverage. Never let the instrument fail the test it
    // is only observing — the test's own verdict is the thing that matters.
  }
}

export { expect };
