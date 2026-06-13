// Signature landmark placement (World-Design M6). Pure deterministic coordinate hashing — the same
// seed regenerates the same landmark layout (NEVER Math.random; visual-gate load-bearing). Sparse
// so landmarks read as occasional wayfinding silhouettes, not clutter. The RENDER (Terrain.jsx
// <LandmarksRender/>) only instantiates landmark chunks that are CURRENTLY LOADED (in-range-culled +
// tier-capped by the chunk streamer) and on LAND.
export const LANDMARK_TYPES = 2; // 0 = Spire (glowing tower), 1 = Sky-arch (monument gateway)

// imul hash (order-independent, well-distributed) -> [0,1). Distinct salt from vegRandom's.
function hash(cx, cz, salt) {
  let h = (0x6d2b79f5 ^ Math.imul(cx | 0, 0x85ebca6b) ^ Math.imul(cz | 0, 0xc2b2ae35) ^ Math.imul(salt | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x3ad8eb39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ~1.4% of chunks carry a landmark candidate (rarer than the 2.5% dungeon; the LAND gate in the
// render thins it further). With renderDistance 4 (~81 loaded chunks) ~1 reads in view at a time.
export function isLandmarkChunk(cx, cz) {
  return hash(cx, cz, 7) < 0.014;
}

export function landmarkTypeAt(cx, cz) {
  return hash(cx, cz, 19) < 0.5 ? 0 : 1;
}
