/**
 * isolatedEffects.js — run a list of named side effects so that one throwing cannot strand the rest.
 *
 * Extracted from `bossKill.js`, where it was called `runBossKillEffects`. The function was always generic —
 * it takes `[name, fn]` pairs and isolates each — and the boss ENTRANCE beat now needs the same guarantee.
 * Calling something named `runBossKillEffects` from a spawn path would be exactly the kind of name-lie this
 * codebase keeps paying for, so the helper moved rather than the caller pretending.
 *
 * WHY ISOLATION MATTERS HERE (the scar it was born from, B2h): the boss-kill block used to run inside a
 * setState updater with the idempotency latch set first and `markGameWon` last. One throwing reward — a
 * loot grant, an XP call — stranded the win FOREVER: bossHealth 0, bossDefeated true, gameWon false. The
 * player killed the dragon and the game never admitted it. Isolating each effect means a cosmetic failure
 * (a missing sound, a bloom spike on a lost context) can never cost the player the thing they earned.
 *
 * Returns the failures rather than throwing or swallowing silently, so a caller can surface them.
 */

/**
 * Run each `[name, fn]` in order, catching per effect.
 * @returns {Array<{name: string, error: unknown}>} the effects that threw, in order.
 */
export function runIsolatedEffects(effects) {
  const failed = [];
  const isolate = (name, fn) => {
    try { fn?.(); } catch (error) { failed.push({ name, error }); }
  };
  for (const [name, fn] of effects || []) isolate(name, fn);
  return failed;
}
