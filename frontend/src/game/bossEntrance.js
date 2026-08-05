/**
 * bossEntrance.js — the Shadow Dragon's ARRIVAL is the climax of the run and had no beat (STATUS §E-ter/E4).
 *
 * WHAT WAS THERE. `bossSystem.js` positioned the dragon, flipped `bossActive`, and called
 * `setBossNotification('The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]')`. That is the whole
 * entrance: a line of text. Meanwhile the boss KILL fires eight isolated effects including a 160ms hitstop
 * and a bloom spike. The end of the fight had weight; the start of it had a toast.
 *
 * ONE CLAUSE OF THE REGISTRY ENTRY WAS WRONG, and is corrected rather than repeated: it listed "no mood
 * snap" among the gaps. `bossSystem.js:156` has driven `setDangerLevel(bossActive ? 2 : 0)` — the obsidian
 * danger mood — since the A5 bridge landed. The mood snap works. What is genuinely missing is the physical
 * punch: shake, freeze, bloom.
 *
 * NO ROAR. The registry also asks for one. The sound API exposes `defeat`, `fanfare` and `victory` and
 * nothing that reads as a dragon, and inventing an audio asset is outside a loop slice — so the beat ships
 * silent and the roar stays on the list, rather than firing `playVictory` at an ENTRANCE because it was the
 * closest thing to hand.
 *
 * DESIGNED AGAINST THE KILL, not in isolation — they are different emotions and should not be the same
 * shape. The kill is an IMPACT: a sharp 160ms freeze and a 450ms bloom flash, plus six more effects (XP,
 * loot, fanfare, the win latch). The entrance is DREAD: a slightly longer freeze (220ms, a held breath
 * rather than a hit) and a longer, softer bloom SWELL (650ms) as the lair wakes, with a shake below what
 * being hit produces. The kill stays the bigger moment because it carries the payoff, not because its
 * numbers are larger — arrival should make you stop, the kill should make you cheer.
 *
 * Pure: no store, no React, no Three. `bossEntranceBeat` takes injected callbacks and returns the ordered
 * `[name, fn]` list for `runIsolatedEffects`, so the ORDER and the MEMBERSHIP are testable without firing
 * a single real effect.
 */

/** Entrance beat magnitudes. Taste calls, veto-able — see the kill comparison above. */
export const ENTRANCE = Object.freeze({
  hitstopMs: 220,   // vs the kill's 160 — a held breath, not an impact
  bloomMs: 650,     // the lair flares as the dragon wakes
  shake: 1.4,       // felt, but below a damage hit (which scales as damage/10)
  shakeClearMs: 900,
});

/**
 * The ordered entrance effects.
 *
 * NOTIFY IS FIRST deliberately. Every effect below is cosmetic except the text, which is the only one that
 * tells the player what is happening; ordering it first means that even in a catastrophic frame where the
 * renderer-facing effects all throw, the message still landed. (Isolation already guarantees each one runs,
 * so this is about which effect is most load-bearing, not about safety.)
 *
 * Every argument is optional: `runIsolatedEffects` tolerates a missing fn, so a caller that has no bloom
 * hook yet degrades to a quieter entrance instead of crashing the spawn path.
 */
export function bossEntranceBeat({ notify, shake, bloom, hitstop } = {}) {
  return [
    ['notify', notify],
    ['shake', shake],
    ['bloom', bloom],
    ['hitstop', hitstop],
  ];
}
