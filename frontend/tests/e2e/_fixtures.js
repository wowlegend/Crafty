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
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedFailureTracker, gameEntryOf } from './_isolatedFailures.js';
import { slimCoverage } from './_coverage.js';
import { DEFAULT_PROFILE, profileSeed, seedStorage } from '../../scripts/visual/_profile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'test-results/coverage');
// The page a test loaded is the game when it requested this: the module script index.html names.
const GAME_ENTRY = gameEntryOf(readFileSync(resolve(ROOT, 'index.html'), 'utf8'));

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

// A TOUCH CONTEXT GRANTS NO POINTER LOCK THAT NO GESTURE ASKED FOR (DECISIONS 2026-10-31 item 377). Pointer Lock 2.0
// refuses a request made without transient activation unless the document released a lock itself with exitPointerLock()
// (requestPointerLock, step 3), and the app's world-ready auto-lock (App.jsx, 100 ms after the spawn chunk) has none.
// Playwright runs every page.evaluate as a user gesture (frame-cap.spec.js says how that was found), so an auto-lock that
// fired inside the activation a read had just opened was granted on CI, and under the lock a tap's pointerdown carries
// clientX/clientY 0,0: Playwright's hit-target check reads the canvas there and blocks every retry of the tap
// (panels.spec.js:83, pause-freezes-world.spec.js:217; run 41261223279). Here a request goes through only while a trusted
// input event is being dispatched, or once the page has released a lock itself. That is STRICTER than Chromium:
// transient activation outlasts its event by a few seconds, so Chromium grants a lock asked for 1 s after a real tap and
// this refuses it (PR #76's dynamic review, arms D and DF). So no touch spec here can show a touch Chromium taking the
// world-ready auto-lock after a real tap; that path is REVIEW:start-stall:touch-start-auto-lock's. On Element.prototype,
// where the browser defines it, so a spec that deletes the API (death-pointer-lock.spec.js, the iPad) deletes this with it.
const lockOnTrustedGestureOnly = () => {
  const real = Element.prototype.requestPointerLock;
  if (typeof real !== 'function') return;
  const GESTURES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'touchend']);
  let released = false;
  const exit = Document.prototype.exitPointerLock;
  if (typeof exit === 'function') {
    Document.prototype.exitPointerLock = function exitPointerLock(...args) {
      if (document.pointerLockElement) released = true;
      return exit.apply(this, args);
    };
  }
  Element.prototype.requestPointerLock = function requestPointerLock(...args) {
    const ev = window.event;
    if (released || document.pointerLockElement === this || (ev && ev.isTrusted && GESTURES.has(ev.type))) return real.apply(this, args);
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('pointer lock refused (e2e touch context: no gesture asked for it)', 'NotAllowedError'));
  };
};

// WHO THE PLAYER IS (scripts/visual/_profile.mjs; DECISIONS 2026-11-01 (W3-A PR C) item 481): a returning player unless a
// spec says `test.use({ profile: 'fresh' })`, so a spec about something else never meets the first-session beats. An
// OPTION, written before the page's scripts run, for the same reason as the cap below.
export const test = base.extend({
  e2eDprCap: [E2E_DPR_CAP, { option: true }],
  profile: [DEFAULT_PROFILE, { option: true }],
  page: async ({ page, e2eDprCap, hasTouch, profile }, use, testInfo) => {
    await page.addInitScript(seedStorage, profileSeed(profile));
    if (e2eDprCap != null) await page.addInitScript((cap) => { window.__craftyE2eDprCap = cap; }, e2eDprCap);
    if (hasTouch) await page.addInitScript(lockOnTrustedGestureOnly);
    // What the game's isolated reactors and effects throw while this test runs (src/game/isolatedEffects.js), collected
    // here in Node by listening only: console events and requests keep coming across every reload of the page, and this
    // tracker is this test's alone. Nothing here calls into the page, because a call is a user gesture there
    // (tests/e2e/_isolatedFailures.js says how that was found).
    const isolated = isolatedFailureTracker(GAME_ENTRY);
    page.on('console', (message) => isolated.onConsole(message.type(), message.text()));
    page.on('request', (request) => isolated.onRequest(request.url()));
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

    // The verdict on what was collected, after the canvas read above (a round trip to the page, which the console events
    // it sent before are ahead of). Printed for every test, the denominator; raised after the coverage is written, so a
    // failing test still leaves its coverage file. An unread game page fails as well as a counted failure.
    const verdict = isolated.verdict(testInfo.title);
    console.log(verdict.line);

    if (started) {
      await writeCoverage(page, testInfo);
    }
    if (verdict.problem) throw new Error(verdict.problem);
  },
});

async function writeCoverage(page, testInfo) {
  try {
    // The url, and each function's name and counts (tests/e2e/_coverage.js says why each is kept or dropped).
    const slim = slimCoverage(await page.coverage.stopJSCoverage());
    mkdirSync(OUT, { recursive: true }); // FIRST — writeFileSync into a missing dir throws
    const safe = `${testInfo.title}-${seq++}`.replace(/[^a-z0-9-]+/gi, '_').slice(0, 80);
    writeFileSync(resolve(OUT, `${safe}.json`), JSON.stringify(slim));
  } catch {
    // A page that already crashed cannot report coverage. Never let the instrument fail the test it
    // is only observing — the test's own verdict is the thing that matters.
  }
}

export { expect };
