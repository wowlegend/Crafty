// The seeded noise a world's terrain is built from: the terrain worker and the main-thread climate sampler both take it
// from here, so the surface the player walks on and the one the sampler reports cannot be seeded apart.
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { resolveWorldSeed } from './worldSeed.js';

const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;

/** `{ noise2D, noise3D }` for a seed. Both draw from one LCG stream, 2D first: the order the terrain was built in. */
export function makeWorldNoise(seed) {
  const rng = lcg(resolveWorldSeed(seed));
  const noise2D = createNoise2D(rng);
  const noise3D = createNoise3D(rng);
  return { noise2D, noise3D };
}

/** A stable [0, 1) value per world column and salt, for placing vegetation independent of chunk order. */
export function vegRandom(seed, worldX, worldZ, salt) {
  let h = (seed ^ Math.imul(worldX | 0, 0x27d4eb2d) ^ Math.imul(worldZ | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
