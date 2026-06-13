// Biome table (World-Design M3). The worldgen surface/secondary block choice was an inline
// 3-branch if/else; this names the biomes + moves the SELECTION into one pure function, so M4
// can add columns (height curve, foliage, seabed) per biome without touching the worker's hot
// loop again. M3 is BYTE-IDENTICAL: pickBiome reproduces the old branch exactly (continent is
// accepted for M4's use but ignored here). Each call returns a FRESH object — the worker
// reassigns surfaceBlock for the beach band, so it must not share a frozen/singleton instance.
export const BIOMES = {
  desert: { surfaceBlock: 4, secondaryBlock: 4 }, // sand / sand
  snow:   { surfaceBlock: 5, secondaryBlock: 3 }, // snow / stone
  plains: { surfaceBlock: 1, secondaryBlock: 2 }, // grass / dirt
};

export function pickBiome(temperature, moisture, continent) {
  if (temperature > 0.7 && moisture < 0.3) return { ...BIOMES.desert };
  if (temperature < 0.3) return { ...BIOMES.snow };
  return { ...BIOMES.plains };
}
