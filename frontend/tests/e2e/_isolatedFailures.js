// What an e2e test collects from its page while it runs: every isolated reactor or effect that threw, over every load of
// the page, and whether the instrument was there to see it.
//
// The page prints each failure in a dev server (src/game/isolatedEffects.js: console.error, under ISOLATED_PREFIX), and
// every game page fetches that module. The fixture only LISTENS: it hands this tracker the page's console events and its
// requests, both of which a page keeps sending across reloads, so a failure before a reload is kept, and it makes one
// tracker per test, so the count is that test's. It never calls into the page: Playwright delivers a binding's result,
// and runs page.evaluate, with Runtime.callFunctionOn and userGesture: true (playwright-core 1.64.1 lib/coreBundle.js),
// so a call into the page is a user gesture there, and a page handed one at boot starts its music before any key press
// (CI run 41226199357, music-bus.spec.js, when this helper armed through a binding).
// Isolation exists so one throwing sound or quest reactor cannot strand the rest; the count is what keeps that from also
// hiding the throw from every test (AUDIT:debt:isolation-swallows-errors, lane L12).
// Unit-tested in tests/scripts/e2e-isolated-failures.test.js, since a Playwright fixture cannot run in the unit suite.

/** What src/game/isolatedEffects.js prints first on a failure's console.error line. */
export const ISOLATED_PREFIX = 'isolated failure in ';

/** The module that reports: a game page that fetched it has the instrument. */
export const PRODUCER_PATH = '/src/game/isolatedEffects.js';

/** The module script an HTML page loads (`<script type="module" src="...">`), or null: the game's entry, from index.html. */
export function gameEntryOf(html) {
  const m = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/i.exec(String(html));
  return m ? m[1] : null;
}

const pathOf = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return null; // not a URL with a path (data:, blob:)
  }
};

/**
 * One test's tracker. `onConsole(type, text)` takes each console message the page printed, `onRequest(url)` the URL of
 * every request it made. `verdict(title)` is the line the test prints and the error it ends with, or null: any failure
 * fails the test; a game page (it requested the entry) that never fetched the reporting module is unread, and unread
 * fails the test too; a page that never requested the entry is not the game and is printed as such.
 * @param {string|null} gameEntry  the entry's path, from gameEntryOf(index.html)
 */
export function isolatedFailureTracker(gameEntry, producerPath = PRODUCER_PATH) {
  const failures = [];
  let loads = 0;
  let gamePage = false;
  return {
    onConsole(type, text) {
      if (type !== 'error' || typeof text !== 'string' || !text.startsWith(ISOLATED_PREFIX)) return;
      failures.push(text.slice(ISOLATED_PREFIX.length).split('\n')[0]);
    },
    onRequest(url) {
      const path = pathOf(url);
      if (path === null) return;
      if (gameEntry && path === gameEntry) gamePage = true;
      if (path === producerPath) loads++;
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
          line: `[isolated-failures] unread: the game page loaded and its reporting module never loaded · ${t}`,
          problem: `The game page loaded (${gameEntry} was requested) and ${producerPath} never loaded, so nothing saw whether a reactor threw: an unread page is not a pass.`,
        };
      }
      return { line: `[isolated-failures] not a game page (${gameEntry} was never requested) · ${t}`, problem: null };
    },
  };
}
