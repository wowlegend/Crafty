import { describe, it, expect, beforeAll } from 'vitest';
import { surfaceBlockAt, seedClimate, footstepTypeAt } from '../../src/world/climate.js';
import { ambienceAt } from '../../src/audio/biomeAmbience.js';
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

/**
 * THE SAME FACT, READ FROM A POSITION (the wind bed and the footsteps). The block above compares COLUMNS. A player is not
 * on a column's integer corner: SoundManager asks about `playerPosition`, a float inside a column, and the worker builds
 * whole columns. `surfaceBlockAt` at the float reads a point no column has, and along the shore (columns of surfaceY 27,
 * 28 and 29, with the sea line between 27 and 28) that point lands in the wrong state about a fifth of the time: dry
 * sand sounded underwater and the first wet column sounded dry (measured: 12.5% and 22.9% of the positions inside them).
 *
 * This drives the sound path's own sampler, `ambienceAt` (the one call SoundManager makes), and the footstep sampler over
 * the 16 positions inside each shore column, against what the real worker put above that column. The columns are picked
 * where a wet column and a dry one touch, because that is where the two points differ.
 *
 * Mutation-Proof: see the commit trailer.
 */
const SUBDIV = 4;
const SHORE_SPACING = 150; // two picked columns of one class are at least this far apart: the whole coast, not one bay

/** Per class, up to PER_CLASS columns that touch both a wet column (surface below the sea) and a dry one. */
function pickShoreColumns() {
  const picked = new Map(CLASSES.map((c) => [c, []]));
  const touchesBoth = (x, z) => {
    let wet = false, dry = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (surfaceBlockAt(x + dx, z + dz).surfaceY < SEA_LEVEL) wet = true; else dry = true;
      }
    }
    return wet && dry;
  };
  for (let x = -1500; x <= 1500; x += 7) {
    for (let z = -1500; z <= 1500; z += 5) {
      if (Math.abs(x) < 64 && Math.abs(z) < 64) continue;
      const list = picked.get(surfaceBlockAt(x, z).surfaceY);
      if (!list || list.length >= PER_CLASS) continue;
      if (list.some(([px, pz]) => Math.max(Math.abs(px - x), Math.abs(pz - z)) < SHORE_SPACING)) continue;
      if (touchesBoth(x, z)) list.push([x, z]);
    }
  }
  return picked;
}

/** The SUBDIV x SUBDIV positions inside column (x, z), at the middle of each cell. */
function positionsIn(x, z) {
  const out = [];
  for (let i = 0; i < SUBDIV; i++) for (let j = 0; j < SUBDIV; j++) out.push([x + (i + 0.5) / SUBDIV, z + (j + 0.5) / SUBDIV]);
  return out;
}

describe.each(SEEDS)('seed %i: a player standing anywhere inside a shore column hears and steps on that column', (seed) => {
  let columns;
  beforeAll(() => {
    send('init', { seed });
    seedClimate(seed);
    columns = [];
    for (const [surfaceY, list] of pickShoreColumns()) {
      for (const [x, z] of list) {
        columns.push({ x, z, surfaceY, workerWater: workerVoxel(x, surfaceY + 1, z) === 9, at: positionsIn(x, z) });
      }
    }
  });
  const positions = () => columns.flatMap((c) => c.at.map(([px, pz]) => ({ ...c, px, pz })));

  it('SETUP: the probe holds shore columns of every class, and the unsnapped float sample is visibly wrong on them', () => {
    for (const c of CLASSES) expect(columns.filter((k) => k.surfaceY === c).length, `shore columns with surfaceY ${c}`).toBe(PER_CLASS);
    expect(columns.filter((k) => k.surfaceY === SEA_LEVEL - 1).every((k) => k.workerWater), 'the cell above a surfaceY 27 column is not water').toBe(true);
    expect(columns.filter((k) => k.surfaceY >= SEA_LEVEL).some((k) => k.workerWater), 'water above a column at or over the sea').toBe(false);
    expect(positions().length, 'positions probed').toBe(CLASSES.length * PER_CLASS * SUBDIV * SUBDIV);
    // A probe that cannot see the defect proves nothing: the old rule, the float itself, must be wrong somewhere in here.
    const floatWater = positions().filter((p) => surfaceBlockAt(p.px, p.pz).isWater !== p.workerWater).length;
    const floatSurface = positions().filter((p) => surfaceBlockAt(p.px, p.pz).surfaceBlock !== surfaceBlockAt(p.x, p.z).surfaceBlock).length;
    expect(floatWater, 'positions where sampling the float disagrees with the worker about water').toBeGreaterThan(0);
    expect(floatSurface, 'positions where sampling the float reads another surface block than its column').toBeGreaterThan(0);
  });

  it('the wind bed sounds underwater at every position inside a column exactly where the worker put water on top of it', () => {
    const wrong = positions()
      .filter((p) => (ambienceAt(p.px, p.pz).label === 'underwater') !== p.workerWater)
      .map((p) => `(${p.px}, ${p.pz}) in column (${p.x}, ${p.z}) surfaceY ${p.surfaceY}: worker water ${p.workerWater}, wind bed ${ambienceAt(p.px, p.pz).label}`);
    expect(wrong.length, `${wrong.length} of ${positions().length} positions: ${wrong.slice(0, 3).join('; ')}`).toBe(0);
  });

  it('a footstep at every position inside a column is the footstep of that column', () => {
    const wrong = positions()
      .filter((p) => footstepTypeAt(p.px, p.pz) !== footstepTypeAt(p.x, p.z))
      .map((p) => `(${p.px}, ${p.pz}) in column (${p.x}, ${p.z}): ${footstepTypeAt(p.px, p.pz)}, the column steps ${footstepTypeAt(p.x, p.z)}`);
    expect(wrong.length, `${wrong.length} of ${positions().length} positions: ${wrong.slice(0, 3).join('; ')}`).toBe(0);
  });
});
