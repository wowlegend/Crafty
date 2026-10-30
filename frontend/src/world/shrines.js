import { isLandmarkChunk, landmarkTypeAt } from './landmarks.js';
import { surfaceBlockAt, getClimateSeed } from './climate.js';

const CHUNK = 16;
// A landmark stands on land at least this high: below it the tower would rise out of the seabed or the beach.
const LANDMARK_MIN_SURFACE_Y = 32;

// Landmark chunks come from a hash (landmarks.js) and the sea from the seed, so whether a hashed chunk really holds a
// landmark depends on the world. Keyed by chunk and cleared when the climate sampler changes seed; most chunks fail the
// hash and never reach it. FarBeacon asks for a 33x33 chunk window every frame.
const siteCache = new Map();
let siteCacheSeed = null;

/**
 * THE landmark that exists in chunk (cx, cz), or null: { cx, cz, worldX, worldZ, type, surfaceY }. A hashed chunk holds
 * one only on land (the climate sampler's column at the chunk centre). Terrain.jsx draws exactly these, and the
 * finder below, and so the beam, compass, minimap, objective and reward chest, lead to exactly these: they were two
 * rules once, and 22% of hashed chunks lay in ocean, never drawn but led to (AUDIT:ultra:ultra-player-world-6).
 */
export function landmarkAt(cx, cz) {
  if (!isLandmarkChunk(cx, cz)) return null;
  const seed = getClimateSeed();
  if (seed !== siteCacheSeed) { siteCache.clear(); siteCacheSeed = seed; }
  const key = `${cx}_${cz}`;
  let site = siteCache.get(key);
  if (site === undefined) {
    const worldX = cx * CHUNK + CHUNK / 2, worldZ = cz * CHUNK + CHUNK / 2;
    const { surfaceY, isWater } = surfaceBlockAt(worldX, worldZ);
    site = isWater || surfaceY < LANDMARK_MIN_SURFACE_Y ? null : { cx, cz, worldX, worldZ, type: landmarkTypeAt(cx, cz), surfaceY };
    siteCache.set(key, site);
  }
  return site;
}

// S8 shrines-as-destinations: the pure deterministic nearest-landmark (shrine) finder. Scans the chunk
// grid within `maxChunks` of the player's chunk for a landmark (landmarkAt) and returns the nearest
// { cx, cz, worldX, worldZ, type, surfaceY, dist } or null. Deterministic for a seed (the landmark hash and the climate
// sampler), so it is capture-safe + unit-testable. The HUD compass marker, the reward-chest siting and the
// "reach nearest shrine" quest all consume this single source. Cheap (<= (2*maxChunks+1)^2 hash calls);
// callers throttle to ~once a second (never per-frame) -> Game-Loop-Isolation.
export function nearestLandmark(playerX, playerZ, maxChunks = 8) {
  const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
  let best = null;
  for (let dz = -maxChunks; dz <= maxChunks; dz++) {
    for (let dx = -maxChunks; dx <= maxChunks; dx++) {
      const site = landmarkAt(pcx + dx, pcz + dz);
      if (!site) continue;
      const dist = Math.hypot(site.worldX - playerX, site.worldZ - playerZ);
      if (!best || dist < best.dist) best = { ...site, dist };
    }
  }
  return best;
}
