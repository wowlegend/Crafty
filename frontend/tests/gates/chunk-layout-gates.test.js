import { describe, it, expect } from 'vitest';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_AREA, CHUNK_VOLUME, voxelIndex, columnIndex, chunkOf,
} from '../../src/world/chunkLayout.js';
import { generateMesh } from '../../src/world/mesher.js';
import { carriersOf } from './_srcWalk.js';

/**
 * ONE CHUNK LAYOUT (QUEUE R7.2, R7.3). Four files each typed their own copy of the block-array layout — the terrain
 * worker's getIndex, the Hearth stamp's idx, the mesher's inline `bx + bz * 16 + by * 256`, the save replay's
 * inline index — and a literal 16 turned chunk coordinates into world ones in five more. They agreed by
 * coincidence; world/chunkLayout.js is now the only definition.
 *
 * The layout itself is checked as a property (a bijection onto the array), and the SEAM as behaviour: a block
 * written at an asymmetric voxel through voxelIndex is meshed by the real mesher exactly there — so a writer and
 * the reader that disagree on the axis order go red, which no single-function test can see.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   L1 plausible-wrong: voxelIndex with x and z swapped (z fastest)   L2 plausible-wrong: the y stride CHUNK_SIZE,
 *   not CHUNK_AREA (layers overlap)   L3 the mesher reads its own inline x/z-swapped layout again
 *   L4 columnIndex with x and z swapped (the biome array read transposed)   L5 a CHUNK_SIZE redeclared in a worker
 *
 * BLIND SPOTS: grassField's columnTops/grassTops take the size as a parameter (a generic helper, not a copy of the
 * layout); the GLSL far-field mask has its own lookup, generated from loadedChunks and gated there.
 */
describe('the layout is a bijection onto the block array', () => {
  it('every voxel has its own slot, all inside CHUNK_VOLUME; x fastest, then z, then y', () => {
    const seen = new Uint8Array(CHUNK_VOLUME);
    let n = 0;
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = voxelIndex(lx, y, lz);
          expect(i >= 0 && i < CHUNK_VOLUME && seen[i] === 0, `(${lx},${y},${lz}) -> ${i}`).toBe(true);
          seen[i] = 1; n++;
        }
      }
    }
    expect(n).toBe(CHUNK_VOLUME);
    expect([voxelIndex(1, 0, 0), voxelIndex(0, 0, 1), voxelIndex(0, 1, 0)]).toEqual([1, CHUNK_SIZE, CHUNK_AREA]);
    expect([columnIndex(1, 0), columnIndex(0, 1)]).toEqual([1, CHUNK_SIZE]);
    expect([chunkOf(-0.5), chunkOf(15.99), chunkOf(16)]).toEqual([-1, 0, 1]);
  });
});

describe('the mesher reads a block where a writer put it (the seam)', () => {
  it('one block at an asymmetric voxel is meshed exactly at that voxel', () => {
    const [lx, y, lz] = [3, 70, 11];
    const blocks = new Uint8Array(CHUNK_VOLUME);
    blocks[voxelIndex(lx, y, lz)] = 1;
    const m = generateMesh(0, 0, blocks);
    const p = m.positions;
    expect(p.length, 'nothing was meshed').toBeGreaterThan(0);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
    expect([lo, hi]).toEqual([[lx, y, lz], [lx + 1, y + 1, lz + 1]]);
  });
  it('the biome of a column is read from that column', () => {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    const biomes = new Uint8Array(CHUNK_AREA);
    blocks[voxelIndex(2, 60, 13)] = 2; // grass: the biome-keyed top face
    biomes[columnIndex(2, 13)] = 5;
    const tinted = generateMesh(0, 0, blocks, biomes);
    const plain = generateMesh(0, 0, blocks, new Uint8Array(CHUNK_AREA));
    expect(Array.from(tinted.colors), 'the biome was not read from the column that carries it').not.toEqual(Array.from(plain.colors));
  });
});

describe('no second definition anywhere (source property)', () => {
  it('the sizes are declared once; no literal chunk stride or voxel stride is left', () => {
    expect(carriersOf(/const CHUNK_SIZE\s*=/)).toEqual(['world/chunkLayout.js']);
    expect(carriersOf(/const CHUNK_HEIGHT\s*=/)).toEqual(['world/chunkLayout.js']);
    expect(carriersOf(/\bc[xz]\s*\*\s*16\b/), 'a literal chunk-to-world 16').toEqual([]);
    expect(carriersOf(/\*\s*256\b/), 'a literal voxel y stride').toEqual([]);
    expect(carriersOf(/[xz]\s*\*\s*16\s*\+/), 'an inline column or voxel layout').toEqual([]);
    // The one division by 16 left is the music arpeggio's step, not a chunk.
    expect(carriersOf(/\/\s*16\b/)).toEqual(['SoundManager.jsx']);
  });
});
