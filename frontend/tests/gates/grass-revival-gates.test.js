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
    // the import now also carries GrassWindDriver (S7) — match the SPECIFIER, not the whole clause,
    // so adding a sibling export does not red a gate that is about the grass being mounted at all
    expect(terrain).toMatch(/import \{[^}]*\bOptimizedGrassSystem\b[^}]*\} from '\.\.\/OptimizedGrassSystem'/);
    expect(terrain).toMatch(/chunk\.meshData\.grassTops && chunk\.meshData\.grassTops\.length > 0/);
    expect(terrain).toMatch(/<OptimizedGrassSystem chunkX=\{chunk\.cx\} chunkZ=\{chunk\.cz\} blockPositions=\{chunk\.meshData\.grassTops\}/);
  });

  // S7. The wind/bend uniforms are written by ONE driver now, not by every chunk. Nothing in the suite
  // could see that the driver was unmounted — the whole suite stayed green with the grass frozen and
  // no uniform writer at all, which is exactly the silent-failure shape this repo keeps paying for.
  it('Terrain mounts EXACTLY ONE GrassWindDriver, and it is outside the per-chunk map', () => {
    const mounts = terrain.match(/<GrassWindDriver\s*\/>/g) || [];
    expect(mounts).toHaveLength(1);
    // the chunk map ends before the driver — if the driver ever moves inside it, this flips
    const mapIdx = terrain.indexOf('<OptimizedGrassSystem chunkX=');
    const driverIdx = terrain.indexOf('<GrassWindDriver />');
    expect(driverIdx).toBeGreaterThan(mapIdx);
    expect(terrain).toMatch(/import \{[^}]*\bGrassWindDriver\b[^}]*\} from '\.\.\/OptimizedGrassSystem'/);
  });

  it('the per-chunk grass component no longer drives shared uniforms (that is the driver’s job)', () => {
    // exactly one useFrame in the module, and it belongs to GrassWindDriver
    expect((grass.match(/useFrame\(/g) || [])).toHaveLength(1);
    expect(grass).toMatch(/GrassWindDriver[\s\S]{0,400}useFrame\(/);
  });

  it('bend sources come from the tested seam, not an inline ECS walk', () => {
    expect(grass).toMatch(/collectBendSources\(/);
    // the original bug: indexing a Vector3. It must not come back in this file.
    expect(grass).not.toMatch(/entity\.position\[0\]/);
  });
  // S8. These are SOURCE-GREP assertions and prove code PRESENCE, not a lived result -- they cannot
  // see whether the field stopped looking like a grid. The real proof is the capture frames, opened.
  // What they DO buy is that the wiring cannot be silently unpicked by a later refactor, which is the
  // failure this file already exists to catch once (the unmounted GrassWindDriver).
  it('placement comes from the tested variation seam, not an inline position-only set', () => {
    expect(grass).toMatch(/import \{[^}]*\bbladeTransform\b[^}]*\} from '\.\/game\/grassVariation\.js'/);
    expect(grass).toMatch(/dummy\.rotation\.y = /);
    expect(grass).toMatch(/dummy\.scale\.setScalar\(/);
    // the pre-S8 hardcoded half-height lift -- correct only while every blade is scale 1
    expect(grass).not.toMatch(/dummy\.position\.set\(x, y \+ 0\.35, z\)/);
  });

  it('the per-blade tint is uploaded, not just written', () => {
    expect(grass).toMatch(/setColorAt\(/);
    // setColorAt allocates instanceColor lazily; forget the flag and the tint never reaches the GPU
    // while every other assertion in this block still passes.
    expect(grass).toMatch(/instanceColor\.needsUpdate/);
  });

  it('the wind phase no longer correlates every blade along the world diagonal', () => {
    expect(grass).not.toMatch(/instanceMatrix\[3\]\[0\] \* 0\.5 \+ instanceMatrix\[3\]\[2\] \* 0\.5/);
    expect(grass).toMatch(/float offset = fract\(sin\(/);
  });

  it('the grass renderer takes the pre-filtered grass-tops directly (no blockType re-filter)', () => {
    expect(grass).toMatch(/blockPositions\.slice\(0, 50\)/);
    expect(grass.includes("blockType === 'grass'")).toBe(false);
  });
});
