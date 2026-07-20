/**
 * bossKill.js — the boss-damage math + the kill-effect runner, pulled OUT of the setState updater.
 *
 * B2h (18-domain review): the whole boss kill ran INSIDE `setBossHealth(prev => { ... })` — a setState
 * updater, which must be pure. It set the idempotency latch FIRST and the win latch (markGameWon) LAST,
 * with ~8 side effects (XP, loot, hitstop, bloom, notifications) in between. If ANY of them threw, every
 * effect after it — including the win latch — silently did not run, while the idempotency latch was already
 * set, so a retry short-circuited. Result: bossHealth 0, bossDefeated true, gameWon FALSE forever. The win
 * to the whole game, voided by a throw in a reward.
 *
 * The fix: `applyBossDamage` is the pure updater (health only, no effects); the effects move to a
 * post-commit effect that runs each one in ISOLATION so a throwing reward cannot void the win, and the win
 * latch runs LAST.
 */

/** Pure: apply `amount` damage to `prev` boss HP. Returns the clamped health + whether this killed it. */
export function applyBossDamage(prev, amount) {
  const newHealth = Math.max(0, prev - amount);
  return { newHealth, killed: newHealth <= 0 };
}

/**
 * Run an ordered list of `[name, fn]` kill effects, each in ISOLATION — a throw in one does NOT stop the
 * rest (crucially, a throwing reward cannot prevent the win latch, which the caller orders LAST). Returns
 * the effects that threw, as `[{ name, error }]`, so the caller can log without the player losing the win.
 */
export function runBossKillEffects(effects) {
  const failed = [];
  const isolate = (name, fn) => {
    try { fn?.(); } catch (error) { failed.push({ name, error }); }
  };
  for (const [name, fn] of effects || []) isolate(name, fn);
  return failed;
}
