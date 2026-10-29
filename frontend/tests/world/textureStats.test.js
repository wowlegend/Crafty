import { describe, it, expect } from 'vitest';
import { layerStats, chromaOf } from './_textureStats.js';

// The instrument the material gates measure with, checked on synthetic layers whose statistics are known by
// construction. Never on the live generator: the tone grammar repaints it by design.
const SIZE = 32;
const stack = (paint, depth = 1) => {
  const data = new Uint8Array(SIZE * SIZE * 4 * depth);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = paint(x, y);
      const o = (x + y * SIZE) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return { image: { width: SIZE, height: SIZE, depth, data } };
};
const A = [200, 40, 40];
const B = [40, 40, 200];
const PAIRS = 2 * (SIZE - 1) * SIZE; // 1,984 non-wrapping pairs in a 32 x 32 tile

describe('layerStats on layers with known statistics', () => {
  it('a one-texel checkerboard: two tones, no texel shares its neighbour\'s', () => {
    const s = layerStats(stack((x, y) => ((x + y) % 2 ? A : B)), 0);
    expect(s.distinct).toBe(2);
    expect(s.sameNeighbour).toBe(0);
  });

  it('a solid layer: one tone, every pair equal, no change across either seam', () => {
    const s = layerStats(stack(() => A), 0);
    expect(s.distinct).toBe(1);
    expect(s.sameNeighbour).toBe(1);
    expect(s.wrapChange).toBe(0);
    expect(s.border.size).toBe(1);
  });

  it('two halves count the 32 pairs across the split, whichever way the split runs', () => {
    const leftRight = layerStats(stack((x) => (x < SIZE / 2 ? A : B)), 0);
    expect(leftRight.sameNeighbour).toBe(1952 / PAIRS);
    expect(leftRight.wrapChangeU).toBe(1);
    expect(leftRight.wrapChangeV).toBe(0);
    expect(leftRight.wrapChange).toBeGreaterThan(0);
    expect(leftRight.border.size).toBe(2);
    // A vertical split changes tone along u only: one differing pair in each of the 32 rows, none along v.
    expect(leftRight.interiorChangeU).toBe(SIZE / (PAIRS / 2));
    expect(leftRight.interiorChangeV).toBe(0);
    expect(leftRight.interiorChange).toBe(SIZE / PAIRS);
    const topBottom = layerStats(stack((x, y) => (y < SIZE / 2 ? A : B)), 0);
    expect(topBottom.sameNeighbour).toBe(1952 / PAIRS);
    expect(topBottom.wrapChangeU).toBe(0);
    expect(topBottom.wrapChangeV).toBe(1);
    expect(topBottom.interiorChangeU).toBe(0);
    expect(topBottom.interiorChangeV).toBe(SIZE / (PAIRS / 2));
  });

  it('the border is every tone on the outer ring, each side read, and no tone from inside it', () => {
    const [C, D, E, F] = [[40, 200, 40], [200, 200, 40], [40, 200, 200], [200, 40, 200]];
    const s = layerStats(stack((x, y) => {
      if (x === 0 && y === 9) return B; // left column only
      if (x === SIZE - 1 && y === 20) return C; // right column only
      if (y === 0 && x === 5) return E; // top row only
      if (y === SIZE - 1 && x === 7) return F; // bottom row only
      if (x === 5 && y === 5) return D; // interior
      return A;
    }), 0);
    const hex = ([r, g, b]) => (r << 16) | (g << 8) | b;
    const byValue = (a, b) => a - b;
    expect([...s.border].sort(byValue)).toEqual([A, B, C, E, F].map(hex).sort(byValue));
    expect(s.distinct, 'the interior tone is in the layer, so its absence from the border is the ring\'s doing').toBe(6);
  });

  it('luminance weights each decoded channel by 0.2126 / 0.7152 / 0.0722', () => {
    expect(layerStats(stack(() => [255, 0, 0]), 0).lum).toBeCloseTo(0.2126, 6);
    expect(layerStats(stack(() => [0, 255, 0]), 0).lum).toBeCloseTo(0.7152, 6);
    expect(layerStats(stack(() => [0, 0, 255]), 0).lum).toBeCloseTo(0.0722, 6);
  });

  it('bytes decode with pow 2.2, the shader\'s decode', () => {
    expect(layerStats(stack(() => [128, 128, 128]), 0).lum).toBeCloseTo(Math.pow(128 / 255, 2.2), 6);
  });

  it('the darkest texel and the chromaticity of the mean', () => {
    const s = layerStats(stack((x) => (x === 3 ? [0, 0, 0] : [255, 255, 255])), 0);
    expect(s.minLum).toBe(0);
    const [cr, cg] = chromaOf(layerStats(stack(() => [255, 0, 0]), 0).meanLinear);
    expect(cr).toBe(1);
    expect(cg).toBe(0);
  });

  it('reads the layer it is asked for in a deeper stack', () => {
    const deep = stack(() => A, 3);
    const o = SIZE * SIZE * 4 * 2;
    for (let i = 0; i < SIZE * SIZE; i++) deep.image.data.set([0, 255, 0, 255], o + i * 4);
    expect(layerStats(deep, 2).lum).toBeCloseTo(0.7152, 6);
    expect(layerStats(deep, 1).lum).toBe(0);
  });
});
