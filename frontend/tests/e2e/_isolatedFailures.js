// What an e2e test collects from its page while it runs: every isolated reactor or effect that threw, over every load of
// the page, and whether the instrument was there to see it.
//
// The page reports in a dev server (src/game/isolatedEffects.js): it calls the binding the fixture exposes, once with
// { kind: 'armed' } when the module loads and once per failure with { kind: 'failure', where, message }. A binding survives
// navigation, so a failure before a reload is kept, and the fixture makes one tracker per test, so the count is that
// test's. Isolation exists so one throwing sound or quest reactor cannot strand the rest; the count is what keeps that
// from also hiding the throw from every test (AUDIT:debt:isolation-swallows-errors, lane L12).
// Unit-tested in tests/scripts/e2e-isolated-failures.test.js, since a Playwright fixture cannot run in the unit suite.

/** The name of the function the fixture exposes on the page; src/game/isolatedEffects.js calls it by this name. */
export const ISOLATED_BINDING = '__craftyIsolatedFailure';

/** The module script an HTML page loads (`<script type="module" src="...">`), or null: the game's entry, from index.html. */
export function gameEntryOf(html) {
  const m = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/i.exec(String(html));
  return m ? m[1] : null;
}

/**
 * One test's tracker. `onEvent` takes what the page sent through the binding, `onRequest` the URL of every request the page
 * made (a page that requested the game entry is the game). `verdict(title)` is the line the test prints and the error it
 * ends with, or null: any failure fails the test; a game page whose instrument never armed is unread, and unread fails the
 * test too; a page that never requested the entry is not the game and is printed as such.
 * @param {string|null} gameEntry  the entry's path, from gameEntryOf(index.html)
 */
export function isolatedFailureTracker(gameEntry) {
  const failures = [];
  let loads = 0;
  let gamePage = false;
  return {
    onEvent(event) {
      if (!event || typeof event !== 'object') return;
      if (event.kind === 'armed') loads++;
      else if (event.kind === 'failure' && typeof event.where === 'string') failures.push(`${event.where}: ${event.message}`);
    },
    onRequest(url) {
      try {
        if (gameEntry && new URL(url).pathname === gameEntry) gamePage = true;
      } catch {
        // not a URL with a path (data:, blob:): not the entry
      }
    },
    verdict(title) {
      const t = String(title).slice(0, 60);
      if (!gameEntry) {
        return { line: `[isolated-failures] unread: no game entry · ${t}`, problem: 'There is no game entry (index.html names no module script), so the isolated-failure check cannot tell a game page (tests/e2e/_isolatedFailures.js gameEntryOf).' };
      }
      if (failures.length) {
        return {
          line: `[isolated-failures] ${failures.length} over ${loads} page load(s) · ${t}`,
          problem: `${failures.length} isolated failure(s) while this test ran (over ${loads} page load(s)), the last: ${failures[failures.length - 1]}. A reactor or effect threw and the game carried on; the console has each one (src/game/isolatedEffects.js).`,
        };
      }
      if (loads > 0) return { line: `[isolated-failures] 0 over ${loads} page load(s) · ${t}`, problem: null };
      if (gamePage) {
        return {
          line: `[isolated-failures] unread: the game page loaded and its counter never armed · ${t}`,
          problem: `The game page loaded (${gameEntry} was requested) and src/game/isolatedEffects.js never reported in, so nothing saw whether a reactor threw: an unread page is not a pass.`,
        };
      }
      return { line: `[isolated-failures] not a game page (${gameEntry} was never requested) · ${t}`, problem: null };
    },
  };
}
