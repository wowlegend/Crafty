// S6 ores-by-depth: deterministic depth-banded ore placement for the terrain worker's deep-solid voxels.
// Pure + position-deterministic (no Math.random, no world-seed dep) so chunks regenerate identically and
// it's capture-safe. Returns the worker block code: 3 = plain stone, or an ore code that lines up
// end-to-end with the atlas layer (proceduralTextures.js) and the mine-drop map (Terrain.jsx BLOCK_ID_MAP):
//   10 = coal, 11 = iron, 12 = gold, 13 = diamond.
//
// Design: ONE position hash -> r in [0,1) is sliced into disjoint ore bands (rarest first), each gated by a
// minimum depth so deep ores only appear deep. A roll that lands in a deeper ore's slice but is too shallow
// falls through to the next-commoner ore -> coal shallow+common ... diamond deepest+rarest. Tunable below.

// --- TUNABLES (the rarity/depth curve — playtest these) ---
const DIAMOND_MIN_DEPTH = 40, DIAMOND_P = 0.005; // slice [0,            0.005)
const GOLD_MIN_DEPTH    = 24, GOLD_P    = 0.011; // slice [0.005,        0.016)
const IRON_MIN_DEPTH    = 12, IRON_P    = 0.022; // slice [0.016,        0.038)
const COAL_MIN_DEPTH    = 4,  COAL_P    = 0.038; // slice [0.038,        0.076)
const T_DIAMOND = DIAMOND_P;                 // 0.005
const T_GOLD    = T_DIAMOND + GOLD_P;        // 0.016
const T_IRON    = T_GOLD + IRON_P;           // 0.038
const T_COAL    = T_IRON + COAL_P;           // 0.076  (total ore fraction at full depth)

// Deterministic integer hash of (x,y,z) -> [0,1). Murmur-style finalizer; good spatial scatter.
function hash01(x, y, z) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(z | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// worldX/worldY/worldZ = the voxel's world coords; surfaceY = the column's surface height.
// Call ONLY for deep solid voxels (the worker already restricts this to worldY < surfaceY - 3, non-cave).
export function oreCodeFor(worldX, worldY, worldZ, surfaceY) {
  const depth = surfaceY - worldY;
  if (depth < COAL_MIN_DEPTH) return 3; // above the shallowest ore band -> plain stone
  const r = hash01(worldX, worldY, worldZ);
  if (r < T_DIAMOND && depth >= DIAMOND_MIN_DEPTH) return 13; // diamond (deepest, rarest)
  if (r < T_GOLD    && depth >= GOLD_MIN_DEPTH)    return 12; // gold
  if (r < T_IRON    && depth >= IRON_MIN_DEPTH)    return 11; // iron
  if (r < T_COAL    && depth >= COAL_MIN_DEPTH)    return 10; // coal (shallowest, commonest)
  return 3; // stone
}
