// Main-thread climate sampler (World — locomotion-audio interleave). Uses the SAME seeded noise
// (world/worldNoise.js) as terrain.worker.js so the main thread can know the player's biome/surface — for
// surface-keyed footstep audio, biome-ambient music, and landmark base-Y. The surface FORMULA is
// imported from the shared world/heightAt.js (single source — NO hand-copied mirror; this file's
// copy drifted once: it kept a stale, shallower base-height formula while the worker deepened its
// relief, mis-placing landmarks + mis-keying footstep/ambience). Reuses pickBiome + the ocean consts.
import { pickBiome } from './biomeTable.js';
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';
import { computeHeight } from './heightAt.js';
import { makeWorldNoise } from './worldNoise.js';
import { DEFAULT_WORLD_SEED, resolveWorldSeed } from './worldSeed.js';

let climateSeed = DEFAULT_WORLD_SEED;
let noise2D = makeWorldNoise(climateSeed).noise2D;

/** Sample the world seeded `seed` from now on (the store calls this when a world loads). */
export function seedClimate(seed) {
  const s = resolveWorldSeed(seed);
  if (s === climateSeed) return;
  climateSeed = s;
  noise2D = makeWorldNoise(s).noise2D;
}

// The gen surface block at a world column (ignores player edits + the Hearth stamp — see the plan).
export function surfaceBlockAt(worldX, worldZ) {
  const { continent, moisture, temperature, n, baseHeight } = computeHeight(noise2D, worldX, worldZ);
  const surfaceY = continent < OCEAN_CONTINENT_THRESHOLD ? oceanSurfaceY(baseHeight, n, continent) : Math.floor(baseHeight);
  const biome = pickBiome(temperature, moisture, continent);
  let { surfaceBlock } = biome;
  if (surfaceY < BEACH_BAND_TOP) surfaceBlock = 4; // beach (matches the worker's override)
  return { surfaceBlock, surfaceY, isWater: surfaceY <= SEA_LEVEL, biome: biome.name }; // biome: the far field colours by it
}

const FOOTSTEP_TYPE = { 1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand', 5: 'snow', 6: 'wood' };
export function footstepTypeAt(worldX, worldZ) {
  return FOOTSTEP_TYPE[surfaceBlockAt(worldX, worldZ).surfaceBlock] || 'grass';
}
