// A REAL-SHAPED chunk for mesher tests, built from the same height and biome functions the terrain worker
// uses — because `generateChunkData` lives inside terrain.worker.js, which assigns `self.onmessage` at
// module scope and cannot be imported under vitest.
//
// What it reproduces: the heightfield (`computeHeight`), the biome pick per column (`pickBiome`) and the
// surface block. What it does NOT: caves, ores, trees, structures, water, the Hearth stamp. Those add
// geometry, so a quad count measured here is a floor for a real chunk, not the real number.
//
// The noise is seeded with the same LCG and seed as world/climate.js, so the terrain matches the
// continent the player spawns on.
import { createNoise2D } from 'simplex-noise';
import { computeHeight } from '../../src/world/heightAt.js';
import { pickBiome, BIOME_ID } from '../../src/world/biomeTable.js';

const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;

export const CHUNK = 16;
export const HEIGHT = 256;
export const idx = (x, y, z) => x + CHUNK * (z + CHUNK * y);

/** `{ blocks, biomeIds, distinctBiomes }` for chunk (cx, cz); columns filled stone, capped by the biome's surface block. */
export function realChunk(cx, cz, seed = 12345) {
  const noise2D = createNoise2D(lcg(seed));
  const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  const biomeIds = new Uint8Array(CHUNK * CHUNK);
  const seen = new Set();
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
      const { continent, moisture, temperature, baseHeight } = computeHeight(noise2D, wx, wz);
      const top = Math.max(1, Math.min(HEIGHT - 2, Math.floor(baseHeight)));
      const picked = pickBiome(temperature, moisture, continent);
      for (let y = 0; y < top; y++) blocks[idx(x, y, z)] = 3;
      blocks[idx(x, top, z)] = picked.surfaceBlock || 1;
      const id = BIOME_ID[picked.name] ?? 0;
      biomeIds[z * CHUNK + x] = id;
      seen.add(id);
    }
  }
  return { blocks, biomeIds, distinctBiomes: seen.size };
}
