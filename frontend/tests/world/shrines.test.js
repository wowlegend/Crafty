import { describe, it, expect } from 'vitest';
import { nearestLandmark } from '../../src/world/shrines.js';
import { isLandmarkChunk } from '../../src/world/landmarks.js';

// S8a: the pure deterministic nearest-landmark (shrine) finder. The HUD compass marker, the reward-chest
// siting, and the "reach nearest shrine" quest all consume it. Capture-safe (deterministic hash only).
describe('nearestLandmark — deterministic nearest shrine to the player', () => {
  it('returns null when no landmark chunk is within the search radius', () => {
    expect(nearestLandmark(8, 8, 0)).toBeNull();
  });
  it('finds a landmark and reports its world center + type + planar distance', () => {
    const r = nearestLandmark(0, 0, 12);
    expect(r).not.toBeNull(); // radius 12 (~25x25 chunks) at ~1.4% -> a hit is near-certain
    expect(isLandmarkChunk(r.cx, r.cz)).toBe(true);
    expect(r.worldX).toBe(r.cx * 16 + 8);
    expect(r.worldZ).toBe(r.cz * 16 + 8);
    expect(r.type === 0 || r.type === 1).toBe(true);
    expect(r.dist).toBeGreaterThanOrEqual(0);
  });
  it('is deterministic (same player cell -> same shrine)', () => {
    expect(nearestLandmark(40, 40, 12)).toEqual(nearestLandmark(40, 40, 12));
  });
  it('returns the CLOSEST landmark (brute-scan agreement)', () => {
    const r = nearestLandmark(0, 0, 12);
    expect(r).not.toBeNull();
    let min = Infinity;
    for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
      const cx = dx, cz = dz;
      if (!isLandmarkChunk(cx, cz)) continue;
      const d = Math.hypot((cx * 16 + 8) - 0, (cz * 16 + 8) - 0);
      if (d < min) min = d;
    }
    expect(r.dist).toBeCloseTo(min, 5);
  });
});
