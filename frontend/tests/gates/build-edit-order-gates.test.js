import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineAtHit, creditBrokenBlock } from '../../src/world/mineAtHit.js';
import { destroyVoxelsInRadius } from '../../src/world/bossSmash.js';
import { idForBlock, blockForId } from '../../src/world/blockIds.js';
import { CHUNK_SIZE, voxelIndex } from '../../src/world/chunkLayout.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldSeed.js';
import { loadTerrainWorker, sendToWorker, readVoxel, workerVerbIo } from '../_support/terrainWorker.js';

// THE STORE'S RECORD AND THE WORKER'S VOXELS AGREE, WHATEVER LANDS BETWEEN AN EDIT AND ITS ANSWER (DECISIONS 2026-10-31
// item 270). A placement records its cells when the worker answers; a single mine and the dragon's smash record theirs
// at the click. So a placement answered after a mine of its own stand-in wrote its block over the mine's air: the worker
// held air, the save held the block, and a reload brought the mined block back while the player kept its payment (lane
// L6 round 1, static finding 1, dynamic P8). Every transport the unit suite had answered at the click, so nothing ever
// landed in between. This drives the real terrain worker (terrain.worker.js through tests/_support/terrainWorker.js),
// which takes each message as it is posted, in order, with its replies held back until the test hands them over, as a
// busy worker's are; and the real placeAtHit, mineAtHit and bossSmash, on a site whose every cell this file sets.
//  - named interleavings: place then mine then answer, a chest placed then mined, the smash over a pending placement,
//    two placements of one cell (the worker fills the first and refuses the second: the first must still record), and a
//    mine between two placements of one cell (the second records);
//  - a seeded run of placements, single mines, Delete Tool removals, smashes and answers at random over a small box:
//    whenever no answer is owed, the record equals the worker's voxel at every cell of the box, and each block kind
//    is conserved between the inventory and the world.
//
// WHAT THIS DOES NOT CHECK: Terrain.jsx's own wiring of the transport (tests/e2e/build-placement.spec.js drives the verbs
// in the running app), a page reload with an answer in flight (registry REVIEW:l6:edit-answer-lost-at-reload).
//
// Mutation-Proof: see the commit trailer.

const CX = 24, CZ = 24;
const OX = CX * CHUNK_SIZE, OZ = CZ * CHUNK_SIZE;
const GROUND = 60; // stone up to here, air above
const STONE = 3;
const TYPES = ['stone', 'dirt', 'sand'];

function siteMods() {
  const mods = [];
  for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let y = 50; y <= 80; y++) {
    mods.push([CX, CZ, voxelIndex(lx, y, lz), y <= GROUND ? STONE : 0]);
  }
  return mods;
}

const S = () => useGameStore.getState();
const key = (c) => `${c.x}_${c.y}_${c.z}`;
let clock = 1e7;
beforeAll(async () => {
  await loadTerrainWorker();
  sendToWorker('init', { seed: DEFAULT_WORLD_SEED });
});
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  sendToWorker('load_modifications', { modifications: siteMods() });
  useGameStore.setState((s) => ({ addNotification: () => {}, worldBlocks: new Map(), chests: new Map(), buildingMode: 'single', buildSize: 1,
    inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 40, dirt: 40, sand: 40, chest: 2, wood: 0 } } }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

/** The verbs, each as the verb router calls it, over one deferred transport (one per page, as Terrain.jsx has one). */
function verbs(io) {
  return {
    place(c, type = 'stone', mode = 'single', size = 1) {
      useGameStore.setState({ selectedBlock: type, buildingMode: mode, buildSize: size });
      return placeAtHit({ hitPoint: new THREE.Vector3(c.x + 0.5, c.y, c.z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) },
        { editCells: io.editCells });
    },
    mine(c, mode = 'single', size = 1) {
      useGameStore.setState({ buildingMode: mode, buildSize: size });
      return mineAtHit({ hitPoint: new THREE.Vector3(c.x + 0.5, c.y + 1, c.z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
        targetedX: c.x, targetedY: c.y, targetedZ: c.z, targetCoords: key(c) }, { post: io.post, editCells: io.editCells, playBreak: () => {} });
    },
    /** The dragon's smash over exactly cell `c`: the ground probe answers c's top face, as Terrain.jsx's probe answers a
     *  column's (the smash breaks the block under the face, one a column). */
    smash(c) {
      useGameStore.setState({ terrainWorker: { postMessage: io.post }, getMobGroundLevel: (x, z) => (x === c.x && z === c.z ? c.y + 1 : null) });
      destroyVoxelsInRadius(new THREE.Vector3(c.x + 0.5, c.y + 0.5, c.z + 0.5), 0.6, 8);
    },
  };
}
const recorded = (c) => S().worldBlocks.get(key(c)) || 0;
const C = { x: OX + 6, y: GROUND + 1, z: OZ + 6 };

describe('a placement\'s late answer never writes over a later record (named interleavings)', () => {
  it('place, then a single mine of its stand-in, then the answer: the record holds air, as the worker does', async () => {
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const placed = v.place(C);
    await v.mine(C);
    expect(io.held.some((m) => m.type === 'cells_edited'), 'SETUP: the placement was answered before the mine').toBe(true);
    io.answer();
    expect(await placed, 'SETUP: the worker did not fill the placed cell').toBe(1);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z) }, 'the record and the worker disagree after a mine before the answer').toEqual({ record: 0, voxel: 0 });
    expect(S().inventory.blocks.stone, 'the placed and mined block was not paid once and paid back once').toBe(40);
  });

  it('a chest placed, then mined before the answer, is no storage chest and no record', async () => {
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const placed = v.place(C, 'chest');
    await v.mine(C);
    io.answer();
    expect(await placed, 'SETUP: the worker did not fill the chest\'s cell').toBe(1);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z), chest: S().chests.has(key(C)) }, 'a ghost chest or a record over air was left')
      .toEqual({ record: 0, voxel: 0, chest: false });
  });

  it('the dragon\'s smash over a placement still owed its answer: the record holds air, as the worker does', async () => {
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const placed = v.place(C);
    v.smash(C);
    expect(io.sent.filter((m) => m.type === 'update_block').length, 'SETUP: the smash did not break the placed cell').toBe(1);
    io.answer();
    expect(await placed).toBe(1);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z) }, 'the record and the worker disagree after a smash before the answer').toEqual({ record: 0, voxel: 0 });
  });

  it('two placements of one cell before either answer: the first fills it and records it, the second is paid back', async () => {
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const first = v.place(C, 'stone');
    const second = v.place(C, 'dirt');
    io.answer();
    expect([await first, await second], 'SETUP: the worker did not fill the first and refuse the second').toEqual([1, 0]);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z) }, 'the first placement\'s block is not recorded').toEqual({ record: STONE, voxel: STONE });
    expect({ stone: S().inventory.blocks.stone, dirt: S().inventory.blocks.dirt }, 'the refused placement was not paid back').toEqual({ stone: 39, dirt: 40 });
  });

  it('place, mine, place again, then the answers: the second placement is recorded, as the worker holds it', async () => {
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const first = v.place(C, 'stone');
    await v.mine(C);
    const second = v.place(C, 'dirt');
    io.answer();
    expect([await first, await second], 'SETUP: the worker did not fill the cell twice').toEqual([1, 1]);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z) }, 'the record does not hold the block the worker holds').toEqual({ record: idForBlock('dirt'), voxel: idForBlock('dirt') });
  });
});

// THE DELETE TOOL'S NOTICE NEVER ACCUSES A BLOCK THE PLAYER PLACED (DECISIONS 2026-10-31 item 279; lane L6 round 2, static
// finding 3). A click that takes nothing says why, and the first wording said the tool takes only blocks the player placed:
// untrue of a chest the player placed (a chest is never taken) and of a block placed a moment ago (its record is written
// when the worker answers). It now states the rule, chests included, and stays silent while an answer is owed.
describe('a Delete Tool click that takes nothing says the rule, and says nothing about a block still being placed (real worker)', () => {
  it('a chest the player placed stays, nothing reaches the worker, and the one notice names chests', async () => {
    const notes = [];
    useGameStore.setState({ addNotification: (text, type) => notes.push({ text, type }) });
    const io = workerVerbIo({ onBroken: creditBrokenBlock });
    const v = verbs(io);
    expect(await v.place(C, 'chest'), 'SETUP: the chest was not placed').toBe(1);
    expect(S().chests.has(key(C)), 'SETUP: the placed chest is not in the store').toBe(true);
    const sentBefore = io.sent.length;
    expect(await v.mine(C, 'delete'), 'the Delete Tool took a chest').toBe(0);
    expect({ chest: S().chests.has(key(C)), record: recorded(C) > 0, voxel: readVoxel(C.x, C.y, C.z) !== 0, sent: io.sent.length - sentBefore },
      'the Delete Tool changed a chest, its record or its voxel, or sent it to the worker').toEqual({ chest: true, record: true, voxel: true, sent: 0 });
    expect(notes, 'a click that took nothing raised no notice, or more than one').toHaveLength(1);
    expect(notes[0].text, 'the notice does not say chests are not taken, so it reads as a verdict on a block the player placed').toMatch(/chest/i);
  });

  it('a block whose placement is still owed its answer: the click says nothing, then the next click takes it', async () => {
    const notes = [];
    useGameStore.setState({ addNotification: (text) => notes.push(text) });
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const placed = v.place(C);
    expect(recorded(C), 'SETUP: the placement is already recorded, so there is no owed answer to click over').toBe(0);
    expect(await v.mine(C, 'delete'), 'the Delete Tool took a block the store does not yet record').toBe(0);
    expect(notes, 'a click on a block placed a moment ago, its answer owed, raised a notice').toEqual([]);
    io.answer();
    expect(await placed, 'SETUP: the worker did not fill the placed cell').toBe(1);
    const taken = v.mine(C, 'delete');
    io.answer();
    expect(await taken, 'the answered placement was not taken by the next Delete Tool click').toBe(1);
    expect({ record: recorded(C), voxel: readVoxel(C.x, C.y, C.z), stone: S().inventory.blocks.stone }, 'the taken block was not recorded as air and paid back once').toEqual({ record: 0, voxel: 0, stone: 40 });
    expect(notes, 'taking the block raised a notice').toEqual([]);
  });

  it('with nothing owed, a click on the ground still gets the notice (the silence is only for an owed answer)', async () => {
    const notes = [];
    useGameStore.setState({ addNotification: (text) => notes.push(text) });
    const io = workerVerbIo({ onBroken: creditBrokenBlock });
    expect(await verbs(io).mine({ x: C.x, y: GROUND, z: C.z }, 'delete'), 'the Delete Tool took the ground').toBe(0);
    expect(notes, 'a click on the ground raised no notice, or more than one').toHaveLength(1);
  });
});

describe('a seeded run of edits and late answers keeps the record and the worker in step (real worker)', () => {
  function mulberry32(a) {
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The clicks land in a 3 x 3 x 3 box of air on the ground; a footprint reaches one cell further, inside the checked box.
  const AIMS = [];
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (let dz = 0; dz < 3; dz++) AIMS.push({ x: OX + 6 + dx, y: GROUND + 1 + dy, z: OZ + 6 + dz });
  const BOX = [];
  for (let x = OX + 5; x <= OX + 8; x++) for (let y = GROUND + 1; y <= GROUND + 4; y++) for (let z = OZ + 5; z <= OZ + 8; z++) BOX.push({ x, y, z });
  const OPS = 300;

  it(`${OPS} seeded clicks and answers`, async () => {
    for (const t of TYPES) expect(blockForId(idForBlock(t)), `SETUP: ${t} is not paid back as itself`).toBe(t);
    const rnd = mulberry32(270);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const io = workerVerbIo({ onBroken: creditBrokenBlock, deferred: true });
    const v = verbs(io);
    const start = Object.fromEntries(TYPES.map((t) => [t, S().inventory.blocks[t]]));
    const tally = { places: 0, mines: 0, deletes: 0, smashes: 0, answers: 0, checks: 0, cellsChecked: 0,
      minesOverOwed: 0, smashesOverOwed: 0, placesOverOwed: 0, deletesOverOwed: 0 };
    /** The cells of the placements whose answer the worker has given and the test still holds. */
    const owedCells = () => {
      const ids = new Set(io.held.filter((m) => m.type === 'cells_edited').map((m) => m.payload.id));
      const out = new Set();
      for (const m of io.sent) if (m.type === 'edit_cells' && m.payload.blockType !== 0 && ids.has(m.payload.id)) for (const c of m.payload.cells) out.add(key(c));
      return out;
    };
    const pending = [];
    // Each check reads back every cell an edit has named since the last one (a read re-meshes the chunk twice, so the
    // whole box is read only at the end); a cell no edit named holds what it held at the last check.
    const named = new Set();
    let seen = 0;
    const check = (label, cells) => {
      for (const c of cells) expect(recorded(c), `${label}: the record and the worker disagree at ${key(c)}`).toBe(readVoxel(c.x, c.y, c.z));
      tally.checks++;
      tally.cellsChecked += cells.length;
    };
    const namedSince = () => {
      for (const m of io.sent.slice(seen)) {
        if (m.type === 'edit_cells') for (const c of m.payload.cells) named.add(key(c));
        else if (m.type === 'update_block') named.add(key({ x: m.payload.cx * CHUNK_SIZE + m.payload.x, y: m.payload.y, z: m.payload.cz * CHUNK_SIZE + m.payload.z }));
      }
      seen = io.sent.length;
      const out = [...named].map((k) => { const [x, y, z] = k.split('_').map(Number); return { x, y, z }; });
      named.clear();
      return out;
    };

    for (let i = 0; i < OPS; i++) {
      const r = rnd();
      // Half the clicks aim at a cell a placement is still owed for, when there is one: the interleaving under test.
      const owedSet = owedCells();
      const owed = AIMS.filter((a) => owedSet.has(key(a)));
      const c = owed.length && rnd() < 0.5 ? pick(owed) : pick(AIMS);
      const over = owedCells().has(key(c));
      if (r < 0.4) {
        const mode = pick(['single', 'single', 'wall', 'floor']);
        pending.push(v.place(c, pick(TYPES), mode, 2));
        tally.places++;
        if (over) tally.placesOverOwed++;
      } else if (r < 0.6) {
        pending.push(v.mine(c));
        tally.mines++;
        if (over) tally.minesOverOwed++;
      } else if (r < 0.68) {
        pending.push(v.mine(c, 'delete', 1 + Math.floor(rnd() * 2)));
        tally.deletes++;
        if (over) tally.deletesOverOwed++;
      } else if (r < 0.75) {
        v.smash(c);
        tally.smashes++;
        if (over) tally.smashesOverOwed++;
      } else {
        const all = rnd() < 0.35;
        io.answer(all ? io.held.length : 1 + Math.floor(rnd() * io.held.length));
        tally.answers++;
        if (!io.held.length) check(`op ${i}`, namedSince());
      }
    }
    io.answer();
    await Promise.all(pending);
    check('the end', BOX);
    // A block the dragon broke is gone from both: a hazard pays nobody (world/mineAtHit.js creditBrokenBlock).
    const smashed = (t) => io.received.filter((m) => m.type === 'block_broken' && m.payload.source === 'dragon'
      && m.payload.blockType === idForBlock(t)).length;
    expect(TYPES.reduce((n, t) => n + smashed(t), 0), 'SETUP: no smash broke a placed block, so the hazard\'s share is unread').toBeGreaterThan(0);
    for (const t of TYPES) {
      const inWorld = BOX.filter((c) => readVoxel(c.x, c.y, c.z) === idForBlock(t)).length;
      expect(S().inventory.blocks[t] + inWorld + smashed(t), `${t} was made or lost between the inventory and the world`).toBe(start[t]);
    }
    process.stdout.write(`\nbuild edit-order gate: ${JSON.stringify(tally)}\n`);
    expect(tally.checks, 'SETUP: the record was compared with the worker too few times').toBeGreaterThanOrEqual(20);
    expect(tally.minesOverOwed, 'SETUP: too few single mines landed on a cell a placement was still owed').toBeGreaterThanOrEqual(10);
    expect(tally.smashesOverOwed, 'SETUP: too few smashes landed on a cell a placement was still owed').toBeGreaterThanOrEqual(3);
    expect(tally.placesOverOwed, 'SETUP: too few placements landed on a cell a placement was still owed').toBeGreaterThanOrEqual(15);
    expect(tally.deletesOverOwed, 'SETUP: too few Delete Tool clicks landed on a cell a placement was still owed').toBeGreaterThanOrEqual(3);
  }, 120000);
});
