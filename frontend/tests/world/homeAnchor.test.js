import { describe, it, expect } from 'vitest';
import { stampHomeAnchor, isHearthChunk, HEARTH_Y, HEARTH_RADIUS } from '../../src/world/homeAnchor.js';

const CHUNK_SIZE = 16, CHUNK_HEIGHT = 256;
const VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
const idx = (x, y, z) => x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;

// A synthetic "natural" chunk: solid stone up to a per-column surface, water to y<=28 in dips, air above.
function makeChunk(surfaceFn) {
  const b = new Uint8Array(VOLUME);
  for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) {
    const s = surfaceFn(x, z);
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      if (y <= s) b[idx(x, y, z)] = 3;        // stone
      else if (y <= 28) b[idx(x, y, z)] = 9;  // water
      else b[idx(x, y, z)] = 0;               // air
    }
  }
  return b;
}
const highestSolid = (b, x, z) => {
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) { const t = b[idx(x, y, z)]; if (t > 0 && t !== 9) return y; }
  return -1;
};
const inFootprint = (cx, cz, lx, lz) =>
  Math.abs(cx * CHUNK_SIZE + lx) <= HEARTH_RADIUS && Math.abs(cz * CHUNK_SIZE + lz) <= HEARTH_RADIUS;

describe('Home Anchor — the Hearth plinth', () => {
  it('the plinth top is above the waterline (>28) with margin', () => {
    expect(HEARTH_Y).toBeGreaterThan(28 + 2);
  });

  it('flattens every footprint column to a flat HEARTH_Y top (origin chunk 0,0)', () => {
    const b = makeChunk((x, z) => ((x + z) % 5 === 0 ? 22 : 36)); // dips (under water) AND hills
    stampHomeAnchor(b, 0, 0);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      if (inFootprint(0, 0, lx, lz)) {
        expect(highestSolid(b, lx, lz), `column ${lx},${lz} flat top`).toBe(HEARTH_Y);
      }
    }
  });

  it('clears all air above the plinth + leaves no gap below (solid contiguous to the top)', () => {
    const b = makeChunk(() => 20); // natural surface well below the plinth -> must fill the gap
    stampHomeAnchor(b, 0, 0);
    for (let y = 0; y <= HEARTH_Y; y++) expect(b[idx(0, y, 0)], `no hole at y=${y}`).not.toBe(0);
    for (let y = HEARTH_Y + 1; y < CHUNK_HEIGHT; y++) expect(b[idx(0, y, 0)], `cleared at y=${y}`).toBe(0);
  });

  it('is a NO-OP on non-origin chunks', () => {
    const a = makeChunk(() => 36), b = makeChunk(() => 36);
    stampHomeAnchor(b, 5, 5);
    expect(Buffer.from(b)).toEqual(Buffer.from(a));
    expect(isHearthChunk(5, 5)).toBe(false);
  });

  it('touches all four origin chunks but nothing else', () => {
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) expect(isHearthChunk(cx, cz)).toBe(true);
    for (const [cx, cz] of [[1, 0], [0, 1], [-2, 0], [0, -2]]) expect(isHearthChunk(cx, cz)).toBe(false);
  });

  it('is deterministic / idempotent (no RNG — stamping twice equals once)', () => {
    const once = makeChunk(() => 30); stampHomeAnchor(once, -1, 0);
    const twice = makeChunk(() => 30); stampHomeAnchor(twice, -1, 0); stampHomeAnchor(twice, -1, 0);
    expect(Buffer.from(twice)).toEqual(Buffer.from(once));
  });
});
