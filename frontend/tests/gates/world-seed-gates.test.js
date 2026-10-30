import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { computeHeight } from '../../src/world/heightAt.js';
import { DEFAULT_WORLD_SEED, resolveWorldSeed } from '../../src/world/worldSeed.js';
import { makeWorldNoise, vegRandom } from '../../src/world/worldNoise.js';
import { surfaceBlockAt, seedClimate } from '../../src/world/climate.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { useGameStore } from '../../src/store/useGameStore';

// A WORLD RECORDS ITS SEED, AND EVERY SAVE WRITTEN BEFORE THAT LOADS THE TERRAIN IT WAS PLAYED ON (reset plan row 27).
//
// The reference values below were computed at main 80238889, before the seed was plumbed, by the worker's own
// construction: lcg(12345), then createNoise2D and createNoise3D from that one stream, then computeHeight, the cave
// sample noise3D(x*0.04, y*0.08, z*0.04), and the vegetation hash with WORLD_SEED 12345. Simplex noise is 0 at the
// origin under every seed, so the origin pins nothing; the other columns move the continent, the highland swell and the
// ocean, and the control below shows a second seed changes every one of them.
//
// Not checked here: that a seed other than 12345 gives a playable world (New World writes 12345), or that the Hearth,
// shrines and Blight Heart follow a re-seed (they are placed for 12345).

// [x, z, continent, moisture, temperature, n, baseHeight]
const HEIGHTS_12345 = [
  [0, 0, 0, 0.5, 0.5220272095221943, 0.5, 49],
  [17, -9, 0.08151987366981857, 0.672555260289957, 0.42158463760742976, 0.708077373654363, 52.74539272577853],
  [-250, 413, 0.5111495257635119, 0.7958978011411237, 0.8186597818582595, 0.3260635006754277, 47.548476132899765],
  [1024, -2048, 0.0015629169152968922, 0.2509663974799217, 0.6869443314119106, 0.28819539612280487, 45.18751713021049],
  [3001, 2999, 0.4399494706966449, 0.4515221296580074, 0.45592250499970177, 0.42245582107340707, 47.60420477932133],
  [37, 2453, -0.1827452823107963, 0.22940001010332972, 0.24208893343144755, 0.3788507293406991, 50.547644666358174], // highland swell
  [-6000, -6000, -0.4986816063921135, 0.45178940674148227, 0.04301952091991246, 0.6344836963748367, 57.865610204919435], // ocean
];
// [x, y, z, noise3D(x*0.04, y*0.08, z*0.04)]
const CAVES_12345 = [[0, 10, 0, -0.5572589052839505], [13, 5, -7, -0.2699902144148247], [-40, 18, 90, -0.896486407036945]];
// [x, z, salt, vegRandom]
const VEG_12345 = [[0, 0, 1, 0.6457411211449653], [17, -9, 2, 0.7205204910133034], [-250, 413, 5, 0.021442909026518464]];
const FIELDS = ['continent', 'moisture', 'temperature', 'n', 'baseHeight'];

describe("seed 12345 builds today's terrain", () => {
  it('the default seed is 12345, and an absent or corrupt seed resolves to it', () => {
    expect(DEFAULT_WORLD_SEED).toBe(12345);
    for (const bad of [undefined, null, '12345', 12.5, -1, NaN, 2 ** 32, {}]) {
      expect(resolveWorldSeed(bad), `seed ${String(bad)}`).toBe(12345);
    }
    expect(resolveWorldSeed(777), 'control: a valid seed is kept').toBe(777);
    expect(resolveWorldSeed(0), 'control: 0 is a valid seed').toBe(0);
  });

  it('heights, climate fields, caves and the vegetation hash match the values at 80238889', () => {
    const { noise2D, noise3D } = makeWorldNoise(DEFAULT_WORLD_SEED);
    let checked = 0;
    for (const [x, z, ...want] of HEIGHTS_12345) {
      const got = computeHeight(noise2D, x, z);
      FIELDS.forEach((f, i) => { expect(got[f], `${f} at (${x}, ${z})`).toBeCloseTo(want[i], 12); checked++; });
    }
    for (const [x, y, z, want] of CAVES_12345) { expect(noise3D(x * 0.04, y * 0.08, z * 0.04), `cave (${x},${y},${z})`).toBeCloseTo(want, 12); checked++; }
    for (const [x, z, salt, want] of VEG_12345) { expect(vegRandom(DEFAULT_WORLD_SEED, x, z, salt), `veg (${x},${z},${salt})`).toBeCloseTo(want, 12); checked++; }
    expect(checked).toBe(7 * 5 + 3 + 3);
  });

  it('control: another seed changes every pinned value but the origin', () => {
    const { noise2D, noise3D } = makeWorldNoise(777);
    for (const [x, z, ...want] of HEIGHTS_12345.slice(1)) {
      expect(computeHeight(noise2D, x, z).baseHeight, `(${x}, ${z}) did not move under seed 777`).not.toBeCloseTo(want[4], 6);
    }
    expect(computeHeight(noise2D, 0, 0).baseHeight, 'the origin is seed-blind, which is why it pins nothing').toBe(49);
    for (const [x, y, z, want] of CAVES_12345) expect(noise3D(x * 0.04, y * 0.08, z * 0.04)).not.toBeCloseTo(want, 6);
    for (const [x, z, salt, want] of VEG_12345) expect(vegRandom(777, x, z, salt)).not.toBeCloseTo(want, 6);
  });

  it("the main-thread climate sampler reads the world's seed", () => {
    const at = (x, z) => surfaceBlockAt(x, z).surfaceY;
    seedClimate(DEFAULT_WORLD_SEED);
    const [x, z, , , , , base] = HEIGHTS_12345[2];
    expect(at(x, z), 'SETUP: the sampler disagrees with the pinned column at 12345').toBe(Math.floor(base));
    seedClimate(777);
    const moved = HEIGHTS_12345.slice(1, 6).filter(([cx, cz, , , , , b]) => at(cx, cz) !== Math.floor(b)).length;
    seedClimate(DEFAULT_WORLD_SEED);
    expect(moved, 'the climate sampler ignored the seed').toBeGreaterThanOrEqual(3);
    expect(at(x, z), 'reseeding to 12345 did not restore the sampler').toBe(Math.floor(base));
  });
});

describe('the seed in the save', () => {
  let posted;
  const fakeWorker = () => ({ postMessage: (m) => posted.push(m) });
  const loads = () => posted.filter((m) => m.type === 'load_modifications');
  const save = (worldSeed) => {
    const s = buildSaveData(useGameStore.getInitialState(), { position: { x: 0, y: 60, z: 0 } });
    if (worldSeed === undefined) delete s.game_state.worldSeed; else s.game_state.worldSeed = worldSeed;
    return s;
  };
  beforeEach(() => {
    posted = [];
    useGameStore.setState(useGameStore.getInitialState(), true);
  });
  afterEach(() => seedClimate(DEFAULT_WORLD_SEED));

  it('a fresh world, and New World, write worldSeed 12345', () => {
    expect(buildSaveData(useGameStore.getInitialState()).game_state.worldSeed).toBe(12345);
    useGameStore.setState({ worldSeed: 777 });
    useGameStore.getState().startNewWorld(null);
    expect(useGameStore.getState().worldSeed, 'New World kept the previous world\'s seed').toBe(12345);
    expect(buildSaveData(useGameStore.getState()).game_state.worldSeed).toBe(12345);
  });

  it('a save written before the field loads at 12345, whatever world was open, and tells the worker so', () => {
    useGameStore.setState({ worldSeed: 777, terrainWorker: fakeWorker() });
    useGameStore.getState().loadWorldData(save(undefined));
    expect(useGameStore.getState().worldSeed).toBe(12345);
    expect(loads(), 'SETUP: the load sent the worker nothing').toHaveLength(1);
    expect(loads()[0].payload.seed, 'the worker was not told the world\'s seed').toBe(12345);
  });

  it('a save that holds a seed loads it, to the store, the worker and the climate sampler', () => {
    useGameStore.setState({ terrainWorker: fakeWorker() });
    const ys = () => HEIGHTS_12345.slice(1, 6).map(([x, z]) => surfaceBlockAt(x, z).surfaceY);
    const before = ys();
    useGameStore.getState().loadWorldData(save(777));
    expect(useGameStore.getState().worldSeed).toBe(777);
    expect(loads()[0].payload.seed).toBe(777);
    const moved = ys().filter((y, i) => y !== before[i]).length;
    expect(moved, 'the climate sampler kept the old world\'s seed').toBeGreaterThanOrEqual(3);
    expect(buildSaveData(useGameStore.getState()).game_state.worldSeed, 'the seed did not round-trip').toBe(777);
  });

  it('a load before the world mounts hands the seed over with the pending edits', () => {
    useGameStore.getState().loadWorldData(save(777));
    expect(posted, 'SETUP: a message went out with no worker').toHaveLength(0);
    useGameStore.getState().setTerrainWorker(fakeWorker());
    expect(loads()).toHaveLength(1);
    expect(loads()[0].payload.seed).toBe(777);
  });
});

describe('the terrain worker builds from the seed it is given', () => {
  // The worker module assigns self.onmessage at import, so it runs here behind a stand-in `self` that records what it
  // posts. A chunk's vertex positions are its geometry; equal bytes are the same terrain.
  let posted;
  let send;
  beforeAll(async () => {
    posted = [];
    let handler;
    globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { handler = fn; }, get onmessage() { return handler; } };
    await import('../../src/world/terrain.worker.js');
    send = (type, payload) => handler({ data: { type, payload } });
  });
  const chunk = (cx, cz) => {
    posted.length = 0;
    send('generate', { cx, cz });
    const mesh = posted.find((m) => m.type === 'chunk_mesh');
    expect(mesh, 'SETUP: the worker posted no mesh').toBeTruthy();
    expect(mesh.payload.positions.length, 'SETUP: the chunk has no geometry').toBeGreaterThan(0);
    return Buffer.from(mesh.payload.positions.buffer).toString('base64');
  };

  // [cx, cz, x, y, z, block id]: the blocks main's worker (4a01607b; src/world is the same at 80238889) builds with no
  // seed, read through its own message handler by readVoxels below. Per chunk: two ground columns (the top block and
  // the air above it pin the height), wood, leaves, a cave and an ore. The chunks hold the columns pinned above at
  // (-250, 413), the highland swell (37, 2453) and the ocean (-6000, -6000), and the chunk the mesh test builds.
  const VOXELS_12345 = [
    [2, -3, 0, 54, 0, 1], [2, -3, 0, 55, 0, 0], [2, -3, 10, 50, 6, 1], [2, -3, 10, 51, 6, 0],
    [2, -3, 15, 50, 11, 6], [2, -3, 14, 56, 10, 7], [2, -3, 15, 5, 1, 0], [2, -3, 2, 1, 2, 10],
    [2, 153, 0, 52, 0, 1], [2, 153, 0, 53, 0, 0], [2, 153, 5, 51, 3, 5], [2, 153, 5, 52, 3, 0],
    [2, 153, 8, 7, 1, 6], [2, 153, 14, 51, 3, 7], [2, 153, 0, 5, 6, 0], [2, 153, 7, 1, 1, 11],
    [-375, -375, 0, 28, 0, 9], [-375, -375, 0, 29, 0, 0], [-375, -375, 5, 28, 3, 9], [-375, -375, 5, 29, 3, 0],
    [-375, -375, 3, 5, 8, 0], [-375, -375, 1, 1, 1, 10],
    [-16, 25, 0, 48, 0, 1], [-16, 25, 0, 49, 0, 0], [-16, 25, 5, 46, 3, 1], [-16, 25, 5, 47, 3, 0],
    [-16, 25, 14, 47, 10, 6], [-16, 25, 13, 54, 7, 7], [-16, 25, 0, 5, 0, 0], [-16, 25, 2, 1, 2, 11],
  ];
  // A trunk and a leaf of a tree in three chunks at seed 777, read from this worker when the seed was plumbed (main
  // ignored the seed, so it has no 777 to compare). Trees placed by another seed's hash leave these spots.
  const TREES_777 = [
    [2, -3, 6, 51, 7, 6], [2, -3, 6, 52, 5, 7], [-16, 25, 14, 58, 13, 6], [-16, 25, 13, 59, 12, 7],
    [1, -1, 1, 54, 12, 6], [1, -1, 1, 55, 10, 7],
  ];
  // The worker answers an update_block to air with block_broken carrying the id it replaced, and with no block_broken
  // when the voxel was already air. The re-mesh it always posts proves the probe reached the handler.
  const readVoxels = (voxels = VOXELS_12345) => voxels.map(([cx, cz, x, y, z]) => {
    posted.length = 0;
    send('update_block', { cx, cz, x, y, z, blockType: 0 });
    expect(posted.some((m) => m.type === 'chunk_mesh'), `SETUP: no re-mesh for the probe at chunk (${cx}, ${cz})`).toBe(true);
    const broken = posted.find((m) => m.type === 'block_broken');
    return broken ? broken.payload.blockType : 0;
  });
  // The probes are block edits the worker keeps across a re-seed; a load with no seed field drops them and keeps the
  // seed.
  const clearEdits = () => send('load_modifications', { modifications: [] });
  const misses = (got, voxels = VOXELS_12345) => voxels.flatMap(([cx, cz, x, y, z, id], i) => (got[i] === id ? [] : [`chunk (${cx},${cz}) ${x},${y},${z}: ${got[i]}, not ${id}`]));

  it("the worker's own build at seed 12345 has main's blocks: unseeded, at init, and on a world load", () => {
    const want = VOXELS_12345.map((v) => v[5]);
    expect(new Set(want).size, 'SETUP: the probes do not span air, ground, wood, leaves, water and ore').toBeGreaterThanOrEqual(8);
    send('init', {});
    const unseeded = readVoxels();
    clearEdits();
    send('init', { seed: 12345 });
    const atInit = readVoxels();
    clearEdits();
    send('load_modifications', { modifications: [], seed: 12345 });
    const onLoad = readVoxels();
    clearEdits();
    expect(unseeded, `an unseeded worker differs from main: ${misses(unseeded).join('; ')}`).toEqual(want);
    expect(atInit, `init with seed 12345 differs from main: ${misses(atInit).join('; ')}`).toEqual(want);
    expect(onLoad, `a world load at seed 12345 differs from main: ${misses(onLoad).join('; ')}`).toEqual(want);
  });

  it("control: a world load at seed 777 moves most of those blocks and grows 777's trees; a re-init to 12345 restores every one", () => {
    send('load_modifications', { modifications: [], seed: 777 });
    const other = readVoxels();
    const trees = readVoxels(TREES_777);
    clearEdits();
    const moved = other.filter((id, i) => id !== VOXELS_12345[i][5]).length;
    expect(moved, 'the readout did not follow the seed').toBeGreaterThanOrEqual(20);
    expect(trees, `the trees at 777 are not 777's: ${misses(trees, TREES_777).join('; ')}`).toEqual(TREES_777.map((v) => v[5]));
    send('init', { seed: 12345 });
    const back = readVoxels();
    clearEdits();
    expect(back, `re-init to 12345 did not restore main's blocks: ${misses(back).join('; ')}`).toEqual(VOXELS_12345.map((v) => v[5]));
  });

  it('no seed and seed 12345 build the same chunk; another seed, on a world load, builds a different one', () => {
    send('init', {});
    const unseeded = chunk(2, -3);
    send('load_modifications', { modifications: [], seed: 12345 });
    expect(chunk(2, -3), 'seed 12345 is not the seed an unseeded worker uses').toBe(unseeded);
    send('load_modifications', { modifications: [], seed: 777 });
    expect(chunk(2, -3), 'the worker ignored the seed a world load carried').not.toBe(unseeded);
    send('init', { seed: 12345 });
    expect(chunk(2, -3), 'a re-init to 12345 kept the other seed\'s chunks').toBe(unseeded);
  });
});
