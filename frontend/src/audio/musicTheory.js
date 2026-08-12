/**
 * musicTheory.js — the ambient-arpeggiator's musical brain (pure; S3-M1 T2 extraction).
 * The chord tables are data; the bpm rule is a pure function of the threat state (the
 * SoundManager previously read the store inline — parameterized here so the thresholds
 * are testable). Same values, verbatim.
 */
export const DAY_CHORDS = [
  [220.00, 329.63, 493.88, 739.99],
  [261.63, 392.00, 587.33, 880.00]
];
export const NIGHT_CHORDS = [
  [146.83, 220.00, 329.63, 349.23],
  [164.81, 246.94, 369.99, 392.00]
];
export const BOSS_CHORDS = [
  [130.81, 164.81, 207.65, 261.63],
  [146.83, 185.00, 233.08, 293.66]
];

/**
 * The arpeggiator tempo ladder: 150 at a boss or a 6+ swarm, 130 from 3, 110 otherwise.
 *
 * The doc line used to say "boss or a 6+ swarm = urgent; quiet nights idle at 110", which skipped the
 * middle rung entirely — and below it sat `if (hostileCount >= 1) return 110;` immediately above
 * `return 110;`. That branch could never change the answer, so it read as a fourth tempo step that does
 * not exist. Anyone tuning the ladder would have edited it expecting an effect.
 */
export function arpeggiatorBpm(bossActive, hostileCount) {
  if (bossActive) return 150;
  if (hostileCount >= 6) return 150;
  if (hostileCount >= 3) return 130;
  return 110;
}
