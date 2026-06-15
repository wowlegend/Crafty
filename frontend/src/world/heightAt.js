// SINGLE SOURCE OF TRUTH for the procedural surface formula.
// terrain.worker.js (the renderer) AND climate.js (the main-thread sampler for footstep audio /
// biome ambience / landmark base-Y) BOTH import computeHeight, so they CANNOT drift apart.
//
// History: climate.js used to hand-copy this formula and silently went stale (kept 30+n*40 while
// the worker moved to 40+n*18+highland^2*120). The "characterization test pins it" claim was false
// (the test only checked biome category, never height), so landmarks were placed at the wrong Y and
// footstep/ambience read the wrong surface. The mirror+test approach failed; this shared module +
// the heightat-single-source gate make a re-copy structurally impossible.
//
// Pure: callers pass their own seeded `noise2D` (both seed identically via lcg(12345)).

// Highland swell tunables (Kevin's "world reads very mountainous" -> RARE horizon peaks over gentle
// traversable plains): the swell only fires where the low-freq highland noise exceeds THRESHOLD,
// and grows with the square of the excess scaled by AMP. Origin stays ~49 so the Hearth (y56) +
// SEA_LEVEL(28)/beach relationships hold.
// S4 tame-the-mountains (2026-06-15, Kevin: "very mountainous"): raised THRESHOLD 0.45->0.62
// (highland fires on ~4.4% of columns, was ~15%) + cut AMP 120->90 (max relief +12.8, was +36).
// Gentle traversable continents with occasional modest rises; the see-it-go-to-it landmarks are
// the shrines (Ember Frontier direction), not oppressive peaks. Tunables measured via a grid sweep.
export const HIGHLAND_THRESHOLD = 0.62;
export const HIGHLAND_AMP = 90;

// Compute the climate fields + base surface height for a world column.
// Returns { continent, moisture, temperature, n, baseHeight }.
export function computeHeight(noise2D, worldX, worldZ) {
  const continent = noise2D(worldX * 0.002, worldZ * 0.002);
  const moisture = noise2D(worldX * 0.005, worldZ * 0.005) * 0.5 + 0.5;
  const temperature = noise2D((worldX + 500) * 0.005, (worldZ + 500) * 0.005) * 0.5 + 0.5;

  let n = noise2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5;
  n += noise2D(worldX * 0.05, worldZ * 0.05) * 0.1;

  const highland = Math.max(0, noise2D(worldX * 0.0018, worldZ * 0.0018) - HIGHLAND_THRESHOLD);
  const baseHeight = 40 + n * 18 + highland * highland * HIGHLAND_AMP;

  return { continent, moisture, temperature, n, baseHeight };
}
