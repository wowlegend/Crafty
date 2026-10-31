// What an e2e test asks the page at its end: how many isolated reactors or effects threw while it ran.
//
// The page counts them in a dev server (src/game/isolatedEffects.js publishes window.__isolatedFailures at load and
// raises it per failure). Isolation exists so one throwing sound or quest reactor cannot strand the rest; the count is
// what keeps that from also hiding the throw from every test (AUDIT:debt:isolation-swallows-errors, lane L12).
// Unit-tested in tests/scripts/e2e-isolated-failures.test.js, since a Playwright fixture cannot run in the unit suite.

/**
 * The page's counter, or null when it cannot be read: a page that crashed or closed, one that did not answer inside `ms`,
 * or one without the counter. Null is "unread" and is printed as such; it is never a pass.
 * @returns {Promise<{count: number, last: string} | null>}
 */
export async function readIsolatedFailures(page, ms = 5000) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  try {
    const read = await Promise.race([page.evaluate(() => window.__isolatedFailures ?? null), timeout]);
    return read && typeof read.count === 'number' ? read : null;
  } catch {
    return null; // a closed or crashed page has nothing to read; the test's own verdict stands
  } finally {
    clearTimeout(timer);
  }
}

/** The line a test prints for what it read: the denominator, so "unread" on every test shows the instrument is dead. */
export function isolatedFailureLine(read, title) {
  return `[isolated-failures] ${read === null ? 'unread (no counter on the page)' : read.count} · ${String(title).slice(0, 60)}`;
}

/** The error a test ends with when the page's reactors threw, or null. */
export function isolatedFailureProblem(read) {
  if (read === null || !(read.count > 0)) return null;
  return `${read.count} isolated failure(s) while this test ran, the last: ${read.last}. A reactor or effect threw and the game carried on; the console has each one (src/game/isolatedEffects.js).`;
}
