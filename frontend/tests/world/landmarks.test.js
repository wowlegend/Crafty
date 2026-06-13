import { describe, it, expect } from 'vitest';
import { isLandmarkChunk, landmarkTypeAt, LANDMARK_TYPES } from '../../src/world/landmarks.js';

describe('landmark placement (World-M6) — deterministic + sparse', () => {
  it('is deterministic (same chunk -> same answer + type)', () => {
    expect(isLandmarkChunk(12, -7)).toBe(isLandmarkChunk(12, -7));
    expect(landmarkTypeAt(12, -7)).toBe(landmarkTypeAt(12, -7));
  });
  it('is sparse — a landmark every few hundred chunks (rough density band 0.2%..3%)', () => {
    let hits = 0, n = 0;
    for (let cx = -120; cx <= 120; cx += 3) for (let cz = -120; cz <= 120; cz += 3) { n++; if (isLandmarkChunk(cx, cz)) hits++; }
    const density = hits / n;
    expect(density, `density ${(density * 100).toFixed(2)}%`).toBeGreaterThan(0.002);
    expect(density, `density ${(density * 100).toFixed(2)}%`).toBeLessThan(0.03);
  });
  it('landmarkTypeAt returns a valid type index for landmark chunks', () => {
    for (let cx = -200; cx <= 200; cx++) {
      if (isLandmarkChunk(cx, 3)) {
        const ty = landmarkTypeAt(cx, 3);
        expect(ty).toBeGreaterThanOrEqual(0);
        expect(ty).toBeLessThan(LANDMARK_TYPES);
      }
    }
  });
});
