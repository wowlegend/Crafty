/**
 * bossEntrance.js — the Shadow Dragon's ARRIVAL is the climax of the run, so it has a beat of its own: a held breath,
 * a bloom swell and a shake, with the toast. The boss KILL fires eight isolated effects including a 160ms hitstop and a
 * bloom spike, so the start of the fight carries weight as the end does.
 *
 * The mood snap is not part of this beat: `bossSystem.js` drives `setDangerLevel(bossActive ? 2 : 0)` (the obsidian
 * danger mood) on its own. What this adds is the physical punch: shake, freeze, bloom.
 *
 * NO ROAR. The sound API exposes `defeat`, `fanfare` and `victory` and nothing that reads as a dragon, so the beat is
 * silent rather than firing `playVictory` at an ENTRANCE because it was the closest thing to hand.
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
  // An impact WEIGHT for triggerCameraShake, on the same scale every other producer uses: a normal melee
  // hit is 1.0 and a crit 1.6, so 0.8 is "felt, but below being hit", which is what this beat is for.
  //
  // It goes to triggerCameraShake and never to setScreenShake: HUD wires setScreenShake to DamageOverlay's intensity,
  // i.e. the RED DAMAGE VIGNETTE, so the arrival would paint the cue for taking damage at the moment the beat asks the
  // player to stop and feel dread. A cue that means something else is worse than no cue.
  shakeWeight: 0.8,
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
