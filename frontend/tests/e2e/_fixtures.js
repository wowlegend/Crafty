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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'test-results/coverage');

// Set COVERAGE=0 to skip collection. Deliberately opt-OUT: the default has to be the collecting one, or
// the instrument quietly stops running the moment someone forgets a flag, and reports nothing forever.
const ENABLED = process.env.COVERAGE !== '0';

let seq = 0;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
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

    if (!started) return;
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
  },
});

export { expect };
