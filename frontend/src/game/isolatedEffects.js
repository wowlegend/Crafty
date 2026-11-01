/**
 * isolatedEffects.js — run a list of named side effects so that one throwing cannot strand the rest.
 *
 * Generic on purpose: it takes `[name, fn]` pairs and isolates each, and both the boss kill and the boss ENTRANCE
 * beat call it, so its name says what it does rather than which caller it serves.
 *
 * WHY ISOLATION MATTERS HERE (B2h): rewards that ran in one block, with the idempotency latch set first and
 * `markGameWon` last, would let one throwing reward (a loot grant, an XP call) strand the win forever: bossHealth 0,
 * bossDefeated true, gameWon false, so the player kills the dragon and the game never admits it. The boss system runs the
 * effects after its health commit, never inside a setState updater (world/bossSystem.js), and isolates each one, so a
 * cosmetic failure (a missing sound, a bloom spike on a lost context) can never cost the player the thing they earned.
 *
 * Every failure is reported where it is caught (reportIsolatedFailure) and also returned, so a caller that wants to act on
 * one can. The two boss callers discard the list, which is why the report lives here and not in them.
 */

let failureCount = 0;
// Published at load, not at the first failure: a counter that exists only after a failure cannot tell a page with none
// from a page that never had the instrument. The window test comes first: Playwright's runner loads this module in Node
// (a spec importing a src module that reaches the store, which emits on the bus), where import.meta.env is undefined.
if (typeof window !== 'undefined' && import.meta.env.DEV) window.__isolatedFailures = { count: 0, last: '' };

/**
 * Say that an isolated reactor or effect threw: a console.error naming where, which an e2e test collects across every
 * load of its page (tests/e2e/_isolatedFailures.js reads the line's prefix), and in a dev server a counter a probe can
 * read (window.__isolatedFailures = { count, last }). Isolation keeps one failure from stranding the rest; it
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
    window.__isolatedFailures = { count: failureCount, last: `${where}: ${error instanceof Error ? error.message : String(error)}` };
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
