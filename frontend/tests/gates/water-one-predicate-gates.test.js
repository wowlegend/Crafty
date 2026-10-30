import { describe, it, expect, beforeAll } from 'vitest';
import { surfaceBlockAt, seedClimate } from '../../src/world/climate.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { CHUNK_SIZE, chunkOf } from '../../src/world/chunkLayout.js';

/**
 * ONE FACT, ONE PREDICATE: IS THIS COLUMN UNDER WATER? (AUDIT:ultra:ultra-player-world-9)
 *
 * Two producers answer it. The terrain worker fills water into the cells above a column's surface up to SEA_LEVEL,
 * so a column whose surface IS the sea level (surfaceY 28) is dry sand. world/climate.js `surfaceBlockAt` says
 * `isWater`, which the footstep and ambience layer (SoundManager) and the far-field ring (farField.js) read from the
 * main thread. They disagreed on exactly that column: it sounded underwater, and the distant coastline drew one
 * column inland in ocean colour.
 *
 * This drives BOTH: the real worker through its message handler (an `update_block` to air answers a `block_broken`
 * carrying the id it replaced, which reads a voxel of the generated chunk), and the real climate sampler, over columns
 * of every surfaceY on either side of the line.
 *
 * Mutation-Proof: see the commit trailer.
 */

const SEEDS = [12345, 777];
const PER_CLASS = 8;
const CLASSES = [SEA_LEVEL - 1, SEA_LEVEL, SEA_LEVEL + 1];

let send;
let posted;
beforeAll(async () => {
  posted = [];
  let handler;
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { handler = fn; }, get onmessage() { return handler; } };
  await import('../../src/world/terrain.worker.js');
  send = (type, payload) => handler({ data: { type, payload } });
});

/** The id of the block the worker generated at world (x, y, z); 0 for air. Replaces it with air, so ask once. */
function workerVoxel(x, y, z) {
  const cx = chunkOf(x), cz = chunkOf(z);
  posted.length = 0;
  send('update_block', { cx, cz, x: x - cx * CHUNK_SIZE, y, z: z - cz * CHUNK_SIZE, blockType: 0 });
  expect(posted.some((m) => m.type === 'chunk_mesh'), `SETUP: the worker never reached chunk (${cx}, ${cz})`).toBe(true);
  const broken = posted.find((m) => m.type === 'block_broken');
  return broken ? broken.payload.blockType : 0;
}

/** Up to PER_CLASS columns of each class, spread over the coast, away from the Hearth's stamp. */
function pickColumns() {
  const picked = new Map(CLASSES.map((c) => [c, []]));
  for (let x = -1500; x <= 1500; x += 13) {
    for (let z = -1500; z <= 1500; z += 17) {
      if (Math.abs(x) < 64 && Math.abs(z) < 64) continue;
      const { surfaceY } = surfaceBlockAt(x, z);
      const list = picked.get(surfaceY);
      if (list && list.length < PER_CLASS) list.push([x, z]);
    }
  }
  return picked;
}

describe.each(SEEDS)('seed %i: the climate sampler and the terrain worker agree on which columns are under water', (seed) => {
  // One reading per column, taken once: asking the worker for a voxel replaces it with air.
  let readings;
  beforeAll(() => {
    send('init', { seed });
    seedClimate(seed);
    readings = [];
    for (const [surfaceY, list] of pickColumns()) {
      for (const [x, z] of list) {
        const s = surfaceBlockAt(x, z);
        readings.push({ x, z, surfaceY, climateWater: s.isWater, workerWater: workerVoxel(x, surfaceY + 1, z) === 9 });
      }
    }
  });
  const ofClass = (c) => readings.filter((r) => r.surfaceY === c);

  it('SETUP: the probe sees columns on both sides of the sea line, and the worker does fill water', () => {
    for (const c of CLASSES) expect(ofClass(c).length, `columns with surfaceY ${c}`).toBe(PER_CLASS);
    expect(ofClass(SEA_LEVEL - 1).every((r) => r.workerWater), 'the cell above a surfaceY 27 column is not water').toBe(true);
    expect(ofClass(SEA_LEVEL + 1).some((r) => r.workerWater), 'water above a column higher than the sea').toBe(false);
  });

  it('every column: isWater is true exactly where the worker put water on top of it', () => {
    const disagree = readings
      .filter((r) => r.climateWater !== r.workerWater)
      .map((r) => `(${r.x}, ${r.z}) surfaceY ${r.surfaceY}: climate isWater ${r.climateWater}, worker water ${r.workerWater}`);
    expect(readings.length, 'columns compared').toBe(CLASSES.length * PER_CLASS);
    expect(disagree, `${disagree.length} of ${readings.length} columns disagree`).toEqual([]);
  });
});
