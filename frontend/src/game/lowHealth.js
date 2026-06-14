// lowHealth.js — pure critical-health intensity for the danger vignette (survival legibility).
// Returns 0 while health is SAFE (>= threshold of max) so the cue never fires at normal HP (and is
// null in capture, where the player is full HP -> the gated frames stay byte-identical). Below the
// threshold it ramps 0->1 as health falls to 0, driving the red edge-vignette's opacity + pulse rate.

// Fraction of max health below which the danger cue begins (default 35%).
export const LOW_HEALTH_THRESHOLD = 0.35;

/** lowHealthIntensity(health, maxHealth, threshold?) -> [0,1]: 0 at/above threshold, 1 at 0 HP. */
export function lowHealthIntensity(health, maxHealth, threshold = LOW_HEALTH_THRESHOLD) {
  const h = Number(health), m = Number(maxHealth);
  if (!Number.isFinite(h) || !Number.isFinite(m) || m <= 0) return 0;
  const ratio = h / m;
  if (ratio >= threshold) return 0;
  if (ratio <= 0) return 1;
  return (threshold - ratio) / threshold;
}
