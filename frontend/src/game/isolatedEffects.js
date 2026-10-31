/**
 * isolatedEffects.js — run a list of named side effects so that one throwing cannot strand the rest.
 *
 * Generic on purpose: it takes `[name, fn]` pairs and isolates each, and both the boss kill and the boss ENTRANCE
 * beat call it, so its name says what it does rather than which caller it serves.
 *
 * WHY ISOLATION MATTERS HERE (B2h): rewards run in one block inside a setState updater, with the idempotency latch
 * set first and `markGameWon` last, let one throwing reward (a loot grant, an XP call) strand the win forever:
 * bossHealth 0, bossDefeated true, gameWon false, so the player kills the dragon and the game never admits it.
 * Isolating each effect means a cosmetic failure (a missing sound, a bloom spike on a lost context) can never cost
 * the player the thing they earned.
 *
 * Every failure is reported where it is caught (reportIsolatedFailure) and also returned, so a caller that wants to act on
 * one can. The two boss callers discard the list, which is why the report lives here and not in them.
 */

let failureCount = 0;
// The function an e2e test's page exposes (tests/e2e/_isolatedFailures.js ISOLATED_BINDING): it lives in the test's Node
// process and survives a reload, which resets this module and the counter below. A torn-down page rejects the call, and
// the rejection is the test's to see, not the game's, so it is dropped here.
const E2E_BINDING = '__craftyIsolatedFailure';
const toE2e = (event) => {
  const sent = window[E2E_BINDING]?.(event);
  if (sent && typeof sent.catch === 'function') sent.catch(() => {});
};
// Published at load, not at the first failure: a counter that exists only after a failure cannot tell a page with none
// from a page that never had the instrument, and the e2e side treats a game page that never armed as unread.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__isolatedFailures = { count: 0, last: '' };
  toE2e({ kind: 'armed' });
}

/**
 * Say that an isolated reactor or effect threw: a console.error naming where, and in a dev server a counter a probe can
 * read (window.__isolatedFailures = { count, last }) and a call of the e2e binding, which an e2e test collects across
 * every load of its page. Isolation keeps one failure from stranding the rest; it
 * must not also make the failure invisible. The production build drops every console call (vite.config.js esbuild.drop), so
 * there is no console to report to there and the counter is dev only.
 * @param {string} where  the event or the effect that threw
 * @param {unknown} error
 */
export function reportIsolatedFailure(where, error) {
  if (!import.meta.env.DEV) return;
  failureCount++;
  console.error(`isolated failure in ${where}:`, error);
  if (typeof window !== 'undefined') {
    const message = error instanceof Error ? error.message : String(error);
    window.__isolatedFailures = { count: failureCount, last: `${where}: ${message}` };
    toE2e({ kind: 'failure', where, message });
  }
}

/**
 * Run each `[name, fn]` in order, catching per effect.
 * @returns {Array<{name: string, error: unknown}>} the effects that threw, in order.
 */
export function runIsolatedEffects(effects) {
  const failed = [];
  const isolate = (name, fn) => {
    try { fn?.(); } catch (error) { failed.push({ name, error }); reportIsolatedFailure(name, error); }
  };
  for (const [name, fn] of effects || []) isolate(name, fn);
  return failed;
}
