import { describe, it, expect } from 'vitest';
import { findMaterialSights, aimAt, materialShotPlan, MATERIAL_SIGHT_KINDS, MATERIAL_STAND_M } from '../../scripts/visual/_lookbook.mjs';
import { generateMesh } from '../../src/world/mesher.js';
import { CHUNK_SIZE, CHUNK_VOLUME, voxelIndex } from '../../src/world/chunkLayout.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';

/**
 * The lookbook's material set stands the player in front of a grass hill's side and a tree trunk, both found in the
 * live mesh. These drive the finder through the real mesher on worlds whose answer is known by construction.
 *
 * NOT CHECKED HERE: that the body comes to rest where it was stood, and that the frame shows the face, which the
 * probe's eye-shot verdict and an opened frame decide.
 */
const { grass, dirt, stone, wood } = BLOCK_ID;

/** One chunk at (0, 0): a low terrace (x < 8, ground top y 50) and a high one (x >= 8, top y 52) whose -X wall at
 *  x = 8 shows grass (y 51) over dirt (y 50); `high` raises it, `extra(set)` adds blocks. */
function world(extra = () => {}, { high = 51, dirtRows = 1 } = {}) {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  const set = (x, y, z, b) => { blocks[voxelIndex(x, y, z)] = b; };
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const top = x < 8 ? 49 : high;
      const rows = x < 8 ? 1 : dirtRows;
      for (let y = 40; y < top - rows; y++) set(x, y, z, stone);
      for (let y = top - rows; y < top; y++) set(x, y, z, dirt);
      set(x, top, z, grass);
    }
  }
  extra(set);
  return [{ cx: 0, cz: 0, meshData: generateMesh(0, 0, blocks, null) }];
}
const FROM = [2, 51, 2];

describe('the material sights found in a meshed world', () => {
  it('the turf wall is the grass-over-dirt hill side, with the player stood on the ground it rises from', () => {
    const s = findMaterialSights({ chunks: world(), from: FROM })['turf-wall'];
    expect(s, 'no turf wall found where the fixture built one').not.toBeNull();
    expect(s.form).toBe('hill');
    expect(s.normal).toEqual([-1, 0, 0]);
    expect(s.ground).toBe(50);
    expect(s.target).toEqual([8, 51.5, 8.5]);
    expect(s.stand).toEqual([8 - MATERIAL_STAND_M, 50, 8.5]);
  });

  it('a hill outranks a nearer one-block step', () => {
    // Two blocks wide, so the wall's width cannot decide it.
    const step = world((set) => { set(2, 50, 4, grass); set(3, 50, 4, grass); });
    const steps = findMaterialSights({ chunks: step, from: FROM })['turf-wall'];
    expect(steps.form, 'the step must not win over the hill').toBe('hill');
    const onlyStep = world((set) => {
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 8; x < CHUNK_SIZE; x++) set(x, 50, z, grass);
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 8; x < CHUNK_SIZE; x++) set(x, 51, z, 0);
    });
    const s = findMaterialSights({ chunks: onlyStep, from: FROM })['turf-wall'];
    expect(s.form, 'with no dirt exposed under the turf, the wall is a step').toBe('step');
    expect(s.ground).toBe(50);
  });

  it('a turf lip over two rows of dirt stands the player on the ground below both', () => {
    // Vertex AO gives each dirt row its own quad, so the wall's base is found by walking down the face.
    const s = findMaterialSights({ chunks: world(() => {}, { high: 52, dirtRows: 2 }), from: FROM })['turf-wall'];
    expect(s.form).toBe('hill');
    expect(s.ground).toBe(50);
    expect(s.target).toEqual([8, 52.5, 8.5]);
  });

  it('a block standing in the line of sight rules the wall out', () => {
    const blocked = world((set) => { set(6, 50, 8, stone); set(6, 51, 8, stone); });
    expect(findMaterialSights({ chunks: blocked, from: FROM })['turf-wall']).toBeNull();
  });

  it('the trunk is a wood face at least three blocks tall, stood in front of on its own ground, nearest first', () => {
    const forest = world((set) => { for (let y = 50; y < 54; y++) set(3, y, 12, wood); });
    const t = findMaterialSights({ chunks: forest, from: FROM }).trunk;
    expect(t, 'no trunk found where the fixture built one').not.toBeNull();
    expect(t.normal).toEqual([0, 0, -1]);
    expect(t.ground).toBe(50);
    expect(t.target).toEqual([3.5, 51.5, 12]);
    expect(t.stand).toEqual([3.5, 50, 12 - MATERIAL_STAND_M]);
    const stump = world((set) => { for (let y = 50; y < 52; y++) set(3, y, 12, wood); });
    expect(findMaterialSights({ chunks: stump, from: FROM }).trunk, 'a two-block stump is not a trunk').toBeNull();
  });

  it('a sight closer to the Hearth than minM is passed over for a farther one', () => {
    const forest = world((set) => {
      for (let y = 50; y < 54; y++) set(3, y, 12, wood);
      for (let y = 50; y < 54; y++) set(3, y, 2, wood);
    });
    expect(findMaterialSights({ chunks: forest, from: FROM }).trunk.target[2], 'SETUP: the near trunk is the nearest').toBeLessThan(4);
    const t = findMaterialSights({ chunks: forest, from: FROM, minM: 6 }).trunk;
    expect(t.rangeM).toBeGreaterThanOrEqual(6);
    expect(t.target[2]).toBe(12);
  });

  it('nothing is chosen from a face whose stand would be off the loaded ground', () => {
    // The chunk's border faces (getBlock reads air outside the chunk) have no ground in front of them.
    const s = findMaterialSights({ chunks: world(), from: [-5, 51, -5], maxM: 40 })['turf-wall'];
    expect(s.target[0], 'a border face was chosen').toBe(8);
  });
});

describe('aiming the eye at a sight', () => {
  it('compass bearings: north is -Z, east +X, clockwise; pitch is up-positive', () => {
    const eye = [0, 1.6, 0];
    const cases = [[[0, 1.6, -5], 0], [[5, 1.6, 0], 90], [[0, 1.6, 5], 180], [[-5, 1.6, 0], 270]];
    for (const [target, heading] of cases) expect(aimAt(eye, target).heading).toBeCloseTo(heading, 9);
    expect(aimAt(eye, [0, 6.6, -5]).pitch).toBeCloseTo(45, 9);
    expect(aimAt(eye, [0, -3.4, -5]).pitch).toBeCloseTo(-45, 9);
    expect(cases.length).toBe(4);
  });
});

describe('the material shot plan', () => {
  it('each sight at each time, sight-major, named by both', () => {
    const plan = materialShotPlan(MATERIAL_SIGHT_KINDS, [0.30, 0.75]);
    expect(plan.map((s) => s.file)).toEqual(['turf-wall-0.30.png', 'turf-wall-0.75.png', 'trunk-0.30.png', 'trunk-0.75.png']);
  });
});
