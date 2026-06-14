// Ocean + coastline profile (World-Design M2). The worldgen shoreline used three magic literals
// (28 the water line, 30 the beach band, 12+n*12 the seabed). This names them + deepens the
// seabed so oceans become a DIVABLE place. Pure math (no state) -> the worker imports + uses it.
//
// SEA_LEVEL (28) and BEACH_BAND_TOP (30) are TWO SEPARATE consts on purpose: water fills up to
// SEA_LEVEL, and sand renders up to BEACH_BAND_TOP, so the 28->30 gap IS the visible shoreline
// (a thin sand beach above the waterline). Do NOT unify them.
export const SEA_LEVEL = 28;        // water fills y <= SEA_LEVEL; foliage only at surfaceY > SEA_LEVEL
export const BEACH_BAND_TOP = 30;   // surfaceY < BEACH_BAND_TOP renders as sand (the beach band)
export const DEEP_FLOOR = 6;        // deepest seabed -> max divable depth = SEA_LEVEL - DEEP_FLOOR = 22

// The ocean blend: as `continent` falls below the threshold, the surface lerps from the land
// baseHeight down toward the deep seabed over a transition band (the shore -> deep ramp).
export const OCEAN_CONTINENT_THRESHOLD = -0.15;
export const OCEAN_FULL_SPAN = 0.15; // continent in [-0.30, -0.15] = shore -> full-ocean

export function oceanBlend(continent) {
  return Math.min(1, Math.max(0, (OCEAN_CONTINENT_THRESHOLD - continent) / OCEAN_FULL_SPAN));
}

// Surface height in the OCEAN branch only (the worker keeps `floor(baseHeight)` for land). At
// full ocean the seabed = DEEP_FLOOR + n*4 (∈ [6,10]) -> depth = SEA_LEVEL - seabed ∈ [18,22].
// At the threshold (blend 0) it returns floor(baseHeight), continuous with the land branch.
export function oceanSurfaceY(baseHeight, n, continent) {
  const t = oceanBlend(continent);
  // Clamp n to [0,1] for the seabed: the worldgen `n` overshoots to ~[-0.1,1.1] (the +noise*0.1
  // octave), which would otherwise push the deepest seabed to y5 (depth 23). Clamping keeps the
  // divable depth STRICTLY 18-22 (seabed ∈ [6,10]) — a predictable, bounded basin.
  const seabed = DEEP_FLOOR + Math.min(1, Math.max(0, n)) * 4;
  return Math.floor(baseHeight * (1 - t) + seabed * t);
}

// --- Shore-foam kernel (ocean S2) ---
// A voxel water TOP face (water below, air above) reads as SHORE when a horizontal neighbor at the same
// level is land (a solid, non-water block). The greedy mesher merges all water-top faces into ONE quad
// at SEA_LEVEL, so per-column foam can't ride a merged quad's vertex color -- the mesher will stop merging
// water-top faces and bake this factor into a spare vertex-color channel (color.g). Pure (block-type ints
// only) -> unit-testable without GL. Block ids per BLOCK_COLORS: 0=air, 9=water, >0 and not 9 = solid land.
export const WATER_BLOCK = 9;
const isSolidLand = (b) => b > 0 && b !== WATER_BLOCK;

// A water surface (top) cell = water with air directly above (so it carries the visible top face).
export function isWaterTop(self, above) {
  return self === WATER_BLOCK && above === 0;
}

// neighbors = the 4 horizontal block ids at the water-surface level. Returns 1 if this water-top cell
// touches land (-> foam), else 0. Binary for S2; a graded seaward falloff can layer on later.
export function shoreFoamFactor(self, above, neighbors) {
  if (!isWaterTop(self, above)) return 0;
  for (const nb of neighbors) if (isSolidLand(nb)) return 1;
  return 0;
}
