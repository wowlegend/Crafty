/**
 * A world's terrain seed. Every save before the field existed was played on 12345, so an absent or unusable seed is
 * 12345: a seed is a whole number in the 32-bit unsigned range, the domain the terrain's LCG and vegetation hash take.
 */
export const DEFAULT_WORLD_SEED = 12345;

export function resolveWorldSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : DEFAULT_WORLD_SEED;
}
