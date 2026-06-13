// Main-thread climate sampler (World — locomotion-audio interleave). Replicates the worker's
// climate noise (SAME seed 12345) so the main thread can know the player's biome/surface — for
// surface-keyed footstep audio now, and biome-ambient music later. Reuses pickBiome + the ocean
// consts (single source of truth); only the noise instance + the climate/height formulas are
// mirrored from terrain.worker.js:381-403 (keep in lockstep — a characterization test pins it).
import { createNoise2D } from 'simplex-noise';
import { pickBiome } from './biomeTable.js';
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';

const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;
const noise2D = createNoise2D(lcg(12345));

// The gen surface block at a world column (ignores player edits + the Hearth stamp — see the plan).
export function surfaceBlockAt(worldX, worldZ) {
  const continent = noise2D(worldX * 0.002, worldZ * 0.002);
  const moisture = noise2D(worldX * 0.005, worldZ * 0.005) * 0.5 + 0.5;
  const temperature = noise2D((worldX + 500) * 0.005, (worldZ + 500) * 0.005) * 0.5 + 0.5;
  let n = noise2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5;
  n += noise2D(worldX * 0.05, worldZ * 0.05) * 0.1;
  const baseHeight = 30 + n * 40;
  const surfaceY = continent < OCEAN_CONTINENT_THRESHOLD ? oceanSurfaceY(baseHeight, n, continent) : Math.floor(baseHeight);
  let { surfaceBlock } = pickBiome(temperature, moisture, continent);
  if (surfaceY < BEACH_BAND_TOP) surfaceBlock = 4; // beach (matches the worker's override)
  return { surfaceBlock, surfaceY, isWater: surfaceY <= SEA_LEVEL };
}

const FOOTSTEP_TYPE = { 1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand', 5: 'snow', 6: 'wood' };
export function footstepTypeAt(worldX, worldZ) {
  return FOOTSTEP_TYPE[surfaceBlockAt(worldX, worldZ).surfaceBlock] || 'grass';
}
