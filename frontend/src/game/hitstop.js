// hitstop.js — the WORLD freezes on a heavy hit, not only the player (EXTERNAL-BASELINE #3).
//
// WHY. Hitstop is the cheapest weight an action game has: a few frames where the blow LANDS. Crafty had the
// timing table (trauma.HITSTOP, weight-tiered) and a store field (`hitstopUntil`), but the only reader was
// the player's own movement — the mob you hit, its animation and the rest of the world kept moving through
// the freeze, which reads as a stutter in YOUR character rather than as impact.
//
// Two rules live here, pure, so both are testable without a renderer:
//  - worldTimeScale: 0 while frozen, exactly 1 the instant it ends (a boundary off-by-one would leave the
//    world stuck for a frame on every hit).
//  - stackHitstop: a hit during a freeze EXTENDS it, but stacking never carries a burst past
//    HITSTOP_BURST_CAP_MS. Five quick hits at 90 ms each must not become a 450 ms freeze, which reads as lag,
//    not weight. The cap bounds STACKING, not one authored beat: the boss entrance's 220 ms held breath is
//    honoured whole. And a hit only ever moves the end LATER — a light hit inside a long freeze never cuts it.

/** The longest STACKED hits may freeze the world, in ms. The largest combat tier (boss) is 160. */
export const HITSTOP_BURST_CAP_MS = 180;

/** 0 while the world is frozen, 1 otherwise. `now` and `hitstopUntil` share performance.now()'s clock. */
export function worldTimeScale(now, hitstopUntil) {
  return now < (hitstopUntil || 0) ? 0 : 1;
}

/**
 * Fold one more hit of `ms` into the current freeze.
 * @param {{until:number, start:number}} cur  the freeze in force (until <= now means none)
 * @returns {{until:number, start:number}}
 */
export function stackHitstop(cur, now, ms, cap = HITSTOP_BURST_CAP_MS) {
  const until = cur?.until || 0;
  const start = cur?.start || 0;
  if (!(ms > 0)) return { until, start };
  if (now >= until) return { until: now + ms, start: now }; // a new burst: one beat is honoured whole
  const extended = Math.min(now + ms, start + Math.max(cap, ms)); // stacking stops at the cap
  return { until: Math.max(until, extended), start }; // and a hit never shortens the freeze in force
}
