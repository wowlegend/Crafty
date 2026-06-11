/**
 * spawnWeights.js — the mob-variety pass (2026-06-11): a pure weighted pick over the mob
 * registry, replacing the uniform randoms (which would make a 220hp brute as common as a
 * zombie). Caller passes entries as [key, weight] pairs + its own random (testable;
 * capture stays deterministic because spawning is capture-suppressed upstream).
 */
export function weightedPick(entries, r) {
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) return entries.length ? entries[0][0] : null;
  let roll = r * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
