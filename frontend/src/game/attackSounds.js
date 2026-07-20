// attackSounds.js — composes the melee swing's audio: the swing WHOOSH fires immediately and the attack
// STRIKE follows after a short delay. Extracted from App.jsx's inline `playAttackSounds` (M6 #4). The
// regression it guards: `playAttackSounds` was DEFINED-BUT-NEVER-CALLED and the swing sound was MISS-ONLY,
// so a connecting melee hit had impact but no whoosh. Pure factory over the two injected sound fns; the
// scheduler is injectable (defaults to the global setTimeout) so the delay is fake-timer testable.
export function makeAttackSoundPlayer(playSwing, playAttack, { delayMs = 100, schedule = setTimeout } = {}) {
  return () => {
    playSwing();
    schedule(() => playAttack(), delayMs);
  };
}
