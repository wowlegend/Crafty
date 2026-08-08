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

  // S9. The grass is in the lighting equation now. Source-grep again, so PRESENCE not lived result --
  // what these buy is that the slice cannot be silently unpicked, which is the failure this file exists
  // to catch (the unmounted GrassWindDriver, the position-only set).
  it('the grass material is LIT, not an unlit basic one', () => {
    // Anchored to the CONSTRUCTION, not the bare token. The first draft asserted the token was absent
    // anywhere in the file and went red on a true sentence — the S6 note explaining that the deleted
    // motes were buried under opaque ground *because* they were depth-tested and unlit. A gate that
    // forbids a word rather than a syntactic form punishes accurate history and pushes the next author
    // to delete the explanation instead of the code.
    expect(grass).not.toMatch(/new THREE\.MeshBasicMaterial\(/);
    expect(grass).toMatch(/new THREE\.MeshLambertMaterial\(/);
  });

  it('the material is OPAQUE — transparent+DoubleSide is a silent DOUBLE DRAW', () => {
    // three splits transparent+DoubleSide into BackSide-then-FrontSide passes at BOTH
    // WebGLRenderer.js:922 and :1619, so every grass draw was two. This assertion is what stops the
    // perf half of S9 being reverted by someone reaching for translucency as a look knob.
    expect(grass).not.toMatch(/transparent: true/);
    expect(grass).not.toMatch(/opacity: 0\.7/);
  });

  // S9b. The blades were LIT but backlit: with side:DoubleSide three flips the normal to the
  // rasterizer-facing side (normal_fragment_begin, via gl_FrontFacing), so the lit face follows the
  // CAMERA rather than the blade's yaw -- and the explore sun sits behind the capture camera. Measured
  // result was a 4:1 skew of tuft pixels DARKER than the ground they grow from. S8's yaw variation
  // cannot reach this, which is why the plan's S8-before-S9 rule was necessary but not sufficient.
  it('blades shade like the ground they grow from, not like vertical cards', () => {
    expect(grass).toMatch(/shader\.fragmentShader = shader\.fragmentShader\.replace\(/);
    expect(grass).toMatch(/#include <normal_fragment_begin>/);
    // world-up carried into VIEW space, which is the space `normal` is in at that point
    expect(grass).toMatch(/viewMatrix \* vec4\(0\.0, 1\.0, 0\.0, 0\.0\)/);
    expect(grass).toMatch(/mix\(normal, grassUp/);
  });

  it('the wind shader has a stable program cache key', () => {
    // without it three stringifies the onBeforeCompile closure on every program lookup
    expect(grass).toMatch(/customProgramCacheKey/);
  });

  it('the grass renderer takes the pre-filtered grass-tops directly (no blockType re-filter)', () => {
    expect(grass).toMatch(/blockPositions\.slice\(0, 50\)/);
    expect(grass.includes("blockType === 'grass'")).toBe(false);
  });
});
