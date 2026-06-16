import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grassTops } from '../../src/world/grassField.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M4 #5 (revive the dead wind-grass), Slice 1a: the terrain worker emits a sparse list of grass-top
// world positions per chunk (gen-time, NO-RE-MESH) so the mount (1b) can render OptimizedGrassSystem.
describe('grass revival 1a -- worker emits grass-tops', () => {
  const worker = read('world/terrain.worker.js');

  it('the worker imports the pure grassTops helper', () => {
    expect(worker).toMatch(/import \{ grassTops \} from '\.\/grassField\.js'/);
  });
  it('it scans each column TOP block (topCodes/topYs) then derives grass-tops', () => {
    expect(worker).toMatch(/const topCodes = new Uint8Array/);
    expect(worker).toMatch(/const topYs = new Int16Array/);
    expect(worker).toMatch(/const gTops = grassTops\(topCodes, topYs, CHUNK_SIZE/);
  });
  it('grassTops rides the chunk_mesh payload (data only, transferred buffers unchanged)', () => {
    expect(worker).toMatch(/grassTops: gTops/);
  });
  it('the pure helper still maps grass columns to world positions', () => {
    const out = grassTops(Uint8Array.from([1, 3]), Int16Array.from([7, 2]), 2, 0, 0, { stride: 1, cap: 50 });
    expect(out).toEqual([[0, 8, 0]]); // only the grass column (code 1), y = topY + 1
  });
});

// Slice 1b: Terrain mounts the (previously dead) OptimizedGrassSystem per chunk from the worker grass-tops.
describe('grass revival 1b -- mounted + visible', () => {
  const terrain = read('world/Terrain.jsx');
  const grass = read('OptimizedGrassSystem.jsx');

  it('Terrain imports + mounts OptimizedGrassSystem from the chunk grass-tops', () => {
    expect(terrain).toMatch(/import \{ OptimizedGrassSystem \} from '\.\.\/OptimizedGrassSystem'/);
    expect(terrain).toMatch(/chunk\.meshData\.grassTops && chunk\.meshData\.grassTops\.length > 0/);
    expect(terrain).toMatch(/<OptimizedGrassSystem chunkX=\{chunk\.cx\} chunkZ=\{chunk\.cz\} blockPositions=\{chunk\.meshData\.grassTops\}/);
  });
  it('the grass renderer takes the pre-filtered grass-tops directly (no blockType re-filter)', () => {
    expect(grass).toMatch(/blockPositions\.slice\(0, 50\)/);
    expect(grass.includes("blockType === 'grass'")).toBe(false);
  });
});
