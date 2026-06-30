import { describe, it, expect } from 'vitest';
import { buildFireTeardrop } from './spellGeometry.js';

// v7-S3.4: pure static geometry builders for the spell silhouettes. Deterministic + module-load (no
// clock/RNG) so the capture frame stays byte-stable. Fire = an upward asymmetric teardrop with a baked
// blackbody vertexColor ramp (white-hot tip -> gold -> orange base), replacing the symmetric icosahedron.

describe('buildFireTeardrop — upward fiery teardrop with baked blackbody ramp', () => {
  it('returns a BufferGeometry with position + color attributes', () => {
    const g = buildFireTeardrop();
    expect(g.attributes.position).toBeTruthy();
    expect(g.attributes.color).toBeTruthy();
    expect(g.attributes.color.itemSize).toBe(3);
    expect(g.attributes.position.count).toBeGreaterThan(0);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
  });

  it('is TALLER than wide (the rising-flame silhouette, not a round ball)', () => {
    const g = buildFireTeardrop();
    g.computeBoundingBox();
    const b = g.boundingBox;
    const dy = b.max.y - b.min.y;
    const dx = b.max.x - b.min.x;
    const dz = b.max.z - b.min.z;
    expect(dy).toBeGreaterThan(dx);
    expect(dy).toBeGreaterThan(dz);
  });

  it('bakes a value ramp: the TOP vertices are hotter (brighter) than the BASE vertices', () => {
    const g = buildFireTeardrop();
    const pos = g.attributes.position, col = g.attributes.color;
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    // average luminance of the top 20% band vs the bottom 20% band
    const lum = (i) => 0.299 * col.getX(i) + 0.587 * col.getY(i) + 0.114 * col.getZ(i);
    let topSum = 0, topN = 0, botSum = 0, botN = 0;
    const range = (max.y - min.y) || 1;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - min.y) / range;
      if (t > 0.8) { topSum += lum(i); topN++; }
      else if (t < 0.2) { botSum += lum(i); botN++; }
    }
    expect(topN).toBeGreaterThan(0);
    expect(botN).toBeGreaterThan(0);
    expect(topSum / topN).toBeGreaterThan(botSum / botN); // white-hot tip brighter than orange base
  });

  it('is DETERMINISTIC (byte-stable across calls -> capture-safe)', () => {
    const a = buildFireTeardrop().attributes;
    const b = buildFireTeardrop().attributes;
    expect(Array.from(a.position.array)).toEqual(Array.from(b.position.array));
    expect(Array.from(a.color.array)).toEqual(Array.from(b.color.array));
  });
});
