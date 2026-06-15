import { isLandmarkChunk, landmarkTypeAt } from './landmarks.js';

const CHUNK = 16;

// S8 shrines-as-destinations: the pure deterministic nearest-landmark (shrine) finder. Scans the chunk
// grid within `maxChunks` of the player's chunk for a landmark chunk and returns the nearest
// { cx, cz, worldX, worldZ, type, dist } or null. Uses ONLY the deterministic landmark hash (landmarks.js),
// so it is capture-safe + unit-testable. The HUD compass marker, the reward-chest siting and the
// "reach nearest shrine" quest all consume this single source. Cheap (<= (2*maxChunks+1)^2 hash calls);
// callers throttle to ~once a second (never per-frame) -> Game-Loop-Isolation.
export function nearestLandmark(playerX, playerZ, maxChunks = 8) {
  const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
  let best = null;
  for (let dz = -maxChunks; dz <= maxChunks; dz++) {
    for (let dx = -maxChunks; dx <= maxChunks; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (!isLandmarkChunk(cx, cz)) continue;
      const worldX = cx * CHUNK + 8, worldZ = cz * CHUNK + 8;
      const dist = Math.hypot(worldX - playerX, worldZ - playerZ);
      if (!best || dist < best.dist) best = { cx, cz, worldX, worldZ, type: landmarkTypeAt(cx, cz), dist };
    }
  }
  return best;
}
