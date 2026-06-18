// Biome table (World-Design M3 -> W2-T8 variety expansion).
//
// HISTORY: M3 lifted the worldgen surface/secondary block choice out of an inline 3-branch if/else
// into this one pure function so M4 can add per-biome columns (height curve, foliage, seabed) without
// touching the worker's hot loop. M3 was BYTE-IDENTICAL (3 biomes; continent accepted but ignored).
//
// W2-T8 (2026-06-17): the table grew from 3 -> 9 biomes with a multi-axis (temperature x moisture x
// continent) selection so the world no longer reads same-everywhere. Each biome now carries:
//   surfaceBlock   — the top voxel (EXISTING atlas layer id only: 1 grass / 2 dirt / 3 stone /
//                    4 sand / 5 snow / 6 wood — the texture atlas has 14 layers; NEW surface
//                    materials are M4b, so variety here is achieved by RECOMBINING existing layers
//                    + the flora/tint metadata below, not by minting new block ids).
//   secondaryBlock — the 3-deep subsurface band under the surface voxel.
//   flora          — a flora-KIND string the foliage decorator branches on (the worker reads it in
//                    M4; today the worker still branches on surfaceBlock, so flora is the forward
//                    contract that makes forest/jungle/savanna distinct even where they share grass).
//   tint           — a per-biome vertex-tint hex the M4 mesher folds into the unused color.g/color.b
//                    vertex channels (the terrain shader currently reads only color.r = blockType).
//
// CAPTURE-DETERMINISM: pickBiome is PURE (no RNG, no time) — same (temperature, moisture, continent)
// always yields the same biome, so the seeded worldgen + visual capture stay reproducible.
//
// PRESERVED HARD CORNERS (downstream pins depend on these, byte-identical to the old inline branch):
//   - cold (temperature < 0.3)                       -> snow   (surfaceBlock 5 / secondary 3)
//   - hot+dry (temperature > 0.7 && moisture < 0.3)  -> desert (surfaceBlock 4 / secondary 4)
// These keep climate.test.js (origin grass, [0,-40] snow) + the biome-snow visual baseline stable.
//
// FRESH OBJECT: every call returns a NEW object (spread) — the worker reassigns surfaceBlock for the
// beach band, so the result must not share a frozen/singleton instance.
export const BIOMES = {
  // Cold
  snow:    { surfaceBlock: 5, secondaryBlock: 3, flora: 'pine',        tint: '#eaf3ff' }, // snow / stone — icy spires
  taiga:   { surfaceBlock: 1, secondaryBlock: 2, flora: 'pine',        tint: '#9fb89a' }, // cool-green boreal grass + pines
  // Temperate
  plains:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'plains_tree', tint: '#8fb45a' }, // grass / dirt — open meadow
  forest:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'forest',      tint: '#5e8c3a' }, // grass / dirt — dense deep-green
  meadow:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'flowers',     tint: '#a6c763' }, // coastal temperate flower flats
  swamp:   { surfaceBlock: 2, secondaryBlock: 2, flora: 'swamp',       tint: '#6b7d49' }, // dirt / dirt — murky wetland
  // Hot
  jungle:  { surfaceBlock: 1, secondaryBlock: 2, flora: 'jungle',      tint: '#3fae46' }, // grass / dirt — vivid canopy
  savanna: { surfaceBlock: 1, secondaryBlock: 2, flora: 'savanna',     tint: '#c2b466' }, // grass / dirt — dry golden veld
  desert:  { surfaceBlock: 4, secondaryBlock: 4, flora: 'cactus',      tint: '#dccf8a' }, // sand / sand — dunes + cacti
  mesa:    { surfaceBlock: 4, secondaryBlock: 2, flora: 'none',        tint: '#b06a3c' }, // sand over dirt — rust badlands
};

// Multi-axis biome selection. Order matters: the two HARD CORNERS run FIRST (byte-identical to the
// legacy branch) so the climate/visual pins hold; the temperate/hot variety fills the middle, using
// `continent` (coastal continent < 0 vs inland >= 0) plus the temperature/moisture quadrants.
export function pickBiome(temperature, moisture, continent) {
  const coastal = continent < 0; // near a continental edge (low/zero continent noise)

  // --- HARD CORNER 1: cold -> snow (preserves climate.test.js [0,-40] snow + biome-snow baseline) ---
  if (temperature < 0.3) {
    // a cold-but-wetter inland fringe reads as boreal taiga (cool grass + pines) rather than pure
    // snowfield — but ONLY just above the hard snow corner so the snow surface block is preserved
    // wherever the old branch produced snow. temperature < 0.3 stays snow byte-identically.
    return { ...BIOMES.snow };
  }

  // --- HARD CORNER 2: hot + dry -> desert (preserves the legacy sand surface/secondary) ---
  if (temperature > 0.7 && moisture < 0.3) {
    return { ...BIOMES.desert };
  }

  // --- HOT BAND (temperature > 0.7), not the dry desert corner ---
  if (temperature > 0.7) {
    if (moisture >= 0.55) return { ...BIOMES.jungle };   // hot + wet  -> vivid jungle
    return { ...BIOMES.savanna };                        // hot + mid  -> golden veld
  }

  // --- WARM-DRY FRINGE just below the hot threshold: rust mesa badlands ---
  if (temperature > 0.55 && moisture < 0.25) {
    return { ...BIOMES.mesa };
  }

  // --- COOL TEMPERATE FRINGE just above the cold corner: boreal taiga ---
  if (temperature < 0.42 && moisture >= 0.4) {
    return { ...BIOMES.taiga };
  }

  // --- TEMPERATE MIDDLE: split by moisture, then coastal-vs-inland via continent ---
  if (moisture >= 0.7) {
    // very wet: coastal lowlands turn to swamp; inland to dense forest
    return coastal ? { ...BIOMES.swamp } : { ...BIOMES.forest };
  }
  if (moisture >= 0.55) {
    // wet temperate: forest everywhere, but coastal edges read as flowery meadow
    return coastal ? { ...BIOMES.meadow } : { ...BIOMES.forest };
  }
  // drier temperate: open plains inland, coastal flats read as flower meadow (continent-distinct)
  return coastal ? { ...BIOMES.meadow } : { ...BIOMES.plains };
}
