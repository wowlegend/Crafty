// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { BuildingTools } from '../../src/ui/GamePanels.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineAtHit, payBrokenBlock } from '../../src/world/mineAtHit.js';
import { CHUNK_SIZE, voxelIndex } from '../../src/world/chunkLayout.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldSeed.js';
import { loadTerrainWorker, sendToWorker, readVoxel, workerVerbIo } from '../_support/terrainWorker.js';

// EVERY BUILDING TOOL DOES WHAT ITS LABEL SAYS (DECISIONS 2026-10-31 items 231-233, 271, 273). The "Delete Tool - Remove
// multiple blocks" made a right-click build a 3x3x3 cube and left a left-click mining one block; "Wall Builder - Build
// 3-high walls" laid a 1-high strip along +x off the ground; a floor or a cube off a wall's side put a third of itself
// inside the wall; each opening of the panel set the mode back to Single and the size to 3; and at the slider's 10 the
// labels promised a 10x10x10 cube and a 10x10 floor that the cell cap built 4x4x4 and 8x8 (registry
// AUDIT:numeric:delete-tool-places-cube, AUDIT:ultra:ultra-game-logic-2, AUDIT:numeric:footprint-overwrites-solid-cells).
//
// One row per tool the real panel offers: the tool is picked by clicking its button, the panel is closed and opened
// again, and the place and mine verbs (world/placeAtHit.js, world/mineAtHit.js) run against the real terrain worker on a
// site whose every cell this file sets (flat grass on dirt on stone, a stone wall standing on it, and a 3x3x3 of stone
// the player placed), so each tool's cells are written out here by hand, not derived from the code under test. A tool
// the panel gains without a row fails. Then, per tool, every size the slider offers: the label's numbers are the
// footprint the verb then fills or takes.
//
// WHAT THIS DOES NOT CHECK: the build ray (the hits are made here, as Terrain.jsx castBuildRay makes them), the verb
// router (tests/gates/verb-router-gates.test.js), random footprints and the economy over them
// (tests/gates/build-tools-worker-gates.test.js).
//
// Mutation-Proof: see the commit trailer.

const CX = 20, CZ = 20;
const OX = CX * CHUNK_SIZE, OZ = CZ * CHUNK_SIZE;
const GROUND = 60; // the grass top's cell; dirt at 59, stone at 58 and below
const WALL_X = OX + 12; // a stone wall at this x, y 61 to 66, z OZ+2 to OZ+14
const SIZE = 3;
const STONE = 3, DIRT = 2, GRASS = 1;

/** The site, cell by cell, as the worker's edit table: y 50 to 80 of the chunk. */
function siteMods() {
  const mods = [];
  for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) for (let y = 50; y <= 80; y++) {
    let id = 0;
    if (y < GROUND - 1) id = STONE;
    else if (y === GROUND - 1) id = DIRT;
    else if (y === GROUND) id = GRASS;
    else if (OX + lx === WALL_X && y <= 66 && lz >= 2 && lz <= 14) id = STONE;
    mods.push([CX, CZ, voxelIndex(lx, y, lz), id]);
  }
  return mods;
}

const cells = (list) => list.map(([x, y, z]) => `${x}_${y}_${z}`).sort();
const box = (xs, ys, zs) => xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => [x, y, z])));
const range = (a, b) => (a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i));

// The aimed cell off the ground's top face, and off the wall's -x face; the block a left-click on the ground takes.
const TOP = [OX + 4, GROUND + 1, OZ + 8];
const SIDE = [WALL_X - 1, GROUND + 2, OZ + 8];
const MINED = [OX + 4, GROUND, OZ + 8];
const one = (c) => cells([c]);
// The player's own blocks: a 3x3x3 of stone they placed on the ground, and its top centre, where a left-click aims.
const OWN = box(range(OX + 3, OX + 5), range(GROUND + 1, GROUND + 3), range(OZ + 7, OZ + 9));
const OWN_TOP = [OX + 4, GROUND + 3, OZ + 8];
// What each tool does, size 3: the cells a right-click fills off each face, the blocks a left-click on the ground takes,
// and those a left-click on the player's own blocks takes.
const TABLE = {
  single: { top: one(TOP), side: one(SIDE), mine: one(MINED), own: one(OWN_TOP) },
  wall: {
    top: cells(box([TOP[0]], range(TOP[1], TOP[1] + 2), [TOP[2]])), // a column rising off the ground
    side: cells(box([SIDE[0]], range(SIDE[1], SIDE[1] + 2), [SIDE[2]])),
    mine: one(MINED), own: one(OWN_TOP),
  },
  floor: {
    top: cells(box(range(TOP[0] - 1, TOP[0] + 1), [TOP[1]], range(TOP[2] - 1, TOP[2] + 1))),
    side: cells(box(range(SIDE[0], SIDE[0] - 2), [SIDE[1]], range(SIDE[2] - 1, SIDE[2] + 1))), // out from the wall
    mine: one(MINED), own: one(OWN_TOP),
  },
  cube: {
    top: cells(box(range(TOP[0] - 1, TOP[0] + 1), range(TOP[1], TOP[1] + 2), range(TOP[2] - 1, TOP[2] + 1))),
    side: cells(box(range(SIDE[0], SIDE[0] - 2), range(SIDE[1], SIDE[1] + 2), range(SIDE[2] - 1, SIDE[2] + 1))),
    mine: one(MINED), own: one(OWN_TOP),
  },
  // Remove the blocks you placed: a left-click takes the 3x3x3 of them under the aimed face and leaves the generated
  // ground; a right-click places one block.
  delete: { top: one(TOP), side: one(SIDE), mine: [], own: cells(OWN) },
};
// The left-click's payback, as the blocks it took: one grass block off the ground, nothing for the Delete Tool; one stone
// off the player's blocks, all 27 for the Delete Tool.
const MINE_PAY = { delete: {} };
const OWN_PAY = { delete: { stone: 27 } };

const S = () => useGameStore.getState();
let clock = 1e7;
beforeAll(async () => {
  await loadTerrainWorker();
  sendToWorker('init', { seed: DEFAULT_WORLD_SEED });
});
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState((s) => ({ addNotification: () => {}, worldBlocks: new Map(), chests: new Map(), selectedBlock: 'stone',
    inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 64 } } }));
});
// Each row starts from size 1, so the slider has to write the size the row then builds at.
const startAtSizeOne = () => useGameStore.setState({ buildSize: 1 });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

/** The panel's tool buttons: every button but the close button. */
function toolButtons() {
  const panel = screen.getByTestId('building-panel');
  return within(panel).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Close');
}
const blocksOf = () => ({ ...S().inventory.blocks });
const delta = (before, after) => {
  const out = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = (after[k] || 0) - (before[k] || 0);
    if (d) out[k] = d;
  }
  return out;
};
/** The cells a verb changed in the store's record, as `x_y_z` keys, each with the id recorded. */
function recordedSince(before) {
  return [...S().worldBlocks].filter(([k, v]) => before.get(k) !== v);
}

async function place(aim, normal) {
  sendToWorker('load_modifications', { modifications: siteMods() });
  useGameStore.setState((s) => ({ worldBlocks: new Map(), inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 64 } } }));
  const io = workerVerbIo({ onBroken: payBrokenBlock });
  const [x, y, z] = aim;
  const h = { hitPoint: new THREE.Vector3(x + 0.5 - normal.x * 0.5, y + 0.5 - normal.y * 0.5, z + 0.5 - normal.z * 0.5), normal, direction: new THREE.Vector3(-normal.x, -normal.y, -normal.z) };
  const before = blocksOf();
  await placeAtHit(h, { post: io.post, editCells: io.editCells });
  const recorded = recordedSince(new Map());
  return { keys: recorded.map(([k]) => k).sort(), ids: [...new Set(recorded.map(([, v]) => v))], spent: delta(before, blocksOf()) };
}

/** A left-click on the top face of `aim`, on the site, with the player's own blocks `own` placed on it first. */
async function mine(aim = MINED, own = []) {
  sendToWorker('load_modifications', { modifications: siteMods().concat(own.map(([x, y, z]) => [CX, CZ, voxelIndex(x - OX, y, z - OZ), STONE])) });
  useGameStore.setState({ worldBlocks: new Map(own.map(([x, y, z]) => [`${x}_${y}_${z}`, STONE])) });
  const io = workerVerbIo({ onBroken: payBrokenBlock });
  const [x, y, z] = aim;
  const h = { hitPoint: new THREE.Vector3(x + 0.5, y + 1, z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
    targetedX: x, targetedY: y, targetedZ: z, targetCoords: `${x}_${y}_${z}`, chestTargeted: false, chestHasItems: false };
  const before = blocksOf();
  const recordedBefore = new Map(S().worldBlocks);
  await mineAtHit(h, { post: io.post, editCells: io.editCells, playBreak: () => {} });
  const recorded = recordedSince(recordedBefore);
  return { keys: recorded.map(([k]) => k).sort(), zero: recorded.every(([, v]) => v === 0), paid: delta(before, blocksOf()) };
}

describe('every Building Tools tool does what its label says (real panel, real store, real worker)', () => {
  it('the panel offers exactly the tools in this table, each picked by its button into the store', () => {
    render(<BuildingTools onClose={() => {}} />);
    expect(toolButtons().map((b) => b.textContent).find((t) => /Wall Builder/.test(t)), 'a fresh profile\'s panel does not open at size 3').toMatch(/Build 3-high walls/);
    const reached = [];
    for (const b of toolButtons()) {
      fireEvent.click(b);
      reached.push(S().buildingMode);
    }
    expect(reached.length, 'SETUP: the panel shows no tool buttons').toBeGreaterThan(0);
    expect(reached.sort(), 'the panel\'s tools are not this table\'s rows: a tool without a row is unchecked').toEqual(Object.keys(TABLE).sort());
  });

  for (const id of Object.keys(TABLE)) {
    it(`${id}: picked, the panel reopened, then a right-click off the ground and off a wall and a left-click on the ground`, async () => {
      startAtSizeOne();
      render(<BuildingTools onClose={() => {}} />);
      const at = toolButtons().findIndex((b) => { fireEvent.click(b); return S().buildingMode === id; });
      expect(at, `SETUP: no button picks ${id}`).toBeGreaterThanOrEqual(0);
      fireEvent.change(screen.getByRole('slider'), { target: { value: String(SIZE) } });
      // The slider ends at the tool's largest size: Single's is 1.
      const size = Math.min(SIZE, Number(screen.getByRole('slider').max));
      cleanup();

      // Reopened, the panel shows what the store holds and leaves it be.
      render(<BuildingTools onClose={() => {}} />);
      expect({ mode: S().buildingMode, size: S().buildSize }, `reopening the panel changed the ${id} tool the player picked`).toEqual({ mode: id, size });
      expect(screen.getByRole('slider').value, 'the reopened panel\'s slider does not show the store\'s size').toBe(String(size));
      const pressed = toolButtons().flatMap((b, i) => (b.getAttribute('aria-pressed') === 'true' ? [i] : []));
      expect(pressed, `the reopened panel does not show the ${id} tool, and only it, as picked`).toEqual([at]);
      cleanup();

      const row = TABLE[id];
      const top = await place(TOP, { x: 0, y: 1, z: 0 });
      expect(top.keys, `${id}: a right-click on the ground's top face filled the wrong cells`).toEqual(row.top);
      expect({ ids: top.ids, spent: top.spent }, `${id}: the cells off the ground are not stone, paid one each`).toEqual({ ids: [STONE], spent: { stone: -row.top.length } });
      for (const k of row.top) expect(readVoxel(...k.split('_').map(Number)), `${id}: the worker does not hold stone at ${k}`).toBe(STONE);

      const side = await place(SIDE, { x: -1, y: 0, z: 0 });
      expect(side.keys, `${id}: a right-click on the wall's side filled the wrong cells`).toEqual(row.side);
      expect({ ids: side.ids, spent: side.spent }, `${id}: the cells off the wall are not stone, paid one each`).toEqual({ ids: [STONE], spent: { stone: -row.side.length } });
      for (const k of row.side) expect(readVoxel(...k.split('_').map(Number)), `${id}: the worker does not hold stone at ${k}`).toBe(STONE);

      const taken = await mine();
      expect(taken.keys, `${id}: a left-click on the ground took the wrong blocks`).toEqual(row.mine);
      expect(taken.zero, `${id}: a taken block was not recorded as air`).toBe(true);
      expect(taken.paid, `${id}: the blocks taken were not paid back as themselves`).toEqual(MINE_PAY[id] || { grass: 1 });
      for (const k of row.mine) expect(readVoxel(...k.split('_').map(Number)), `${id}: the worker still holds a block at ${k}`).toBe(0);
      if (!row.mine.length) expect(readVoxel(...MINED), `${id}: a left-click that took nothing took the ground`).toBe(GRASS);

      const ownTaken = await mine(OWN_TOP, OWN);
      expect(ownTaken.keys, `${id}: a left-click on the player's own blocks took the wrong ones`).toEqual(row.own);
      expect(ownTaken.zero, `${id}: a taken block was not recorded as air`).toBe(true);
      expect(ownTaken.paid, `${id}: the player's blocks taken were not paid back as themselves`).toEqual(OWN_PAY[id] || { stone: 1 });
      for (const k of row.own) expect(readVoxel(...k.split('_').map(Number)), `${id}: the worker still holds a block at ${k}`).toBe(0);
      expect(readVoxel(OWN_TOP[0], GROUND, OWN_TOP[2]), `${id}: the ground under the player's blocks was taken`).toBe(GRASS);
    }, 60000);
  }
});

// THE LABEL'S NUMBERS ARE THE FOOTPRINT, AT EVERY SIZE THE SLIDER OFFERS. The verbs run with the worker's answer given
// here (every cell sent changes), so the footprint is what the verb sends; the site and the real worker are the table's.
describe('every tool\'s label says the size it builds at, at every size the slider offers (real panel, real verbs)', () => {
  /** Every sent cell changes, as the worker changes a cell of the other kind. */
  const all = (edit, done) => done(edit.cells.map((_, i) => i));
  const extent = (keys) => {
    const xyz = keys.map((k) => k.split('_').map(Number));
    return [0, 1, 2].map((a) => (xyz.length ? Math.max(...xyz.map((c) => c[a])) - Math.min(...xyz.map((c) => c[a])) + 1 : 0));
  };
  // The extent each label promises, from its numbers: a wall is a column, a floor one cell high.
  const PROMISE = {
    single: (n) => ({ numbers: [], extent: [1, 1, 1], size: n }),
    wall: (n) => ({ numbers: [n], extent: [1, n, 1], size: n }),
    floor: (n) => ({ numbers: [n, n], extent: [n, 1, n], size: n }),
    cube: (n) => ({ numbers: [n, n, n], extent: [n, n, n], size: n }),
    delete: (n) => ({ numbers: [n, n, n], extent: [n, n, n], size: n }),
  };
  // A 4x4x4 of the player's own stone for the Delete Tool, its top centre aimed at.
  const OWN4 = box(range(0, 3), range(10, 13), range(0, 3));

  for (const id of Object.keys(PROMISE)) {
    it(`${id}: sizes 1 to 10 on the slider`, async () => {
      render(<BuildingTools onClose={() => {}} />);
      const button = () => toolButtons().find((b) => { fireEvent.click(b); return S().buildingMode === id; });
      expect(button(), `SETUP: no button picks ${id}`).toBeTruthy();
      const checked = [];
      for (let v = 1; v <= 10; v++) {
        fireEvent.change(screen.getByRole('slider'), { target: { value: String(v) } });
        const label = button().textContent;
        const numbers = (label.match(/\d+/g) || []).map(Number);
        const shown = Number(screen.getByTestId('build-size').textContent);
        let keys;
        if (id === 'delete') {
          useGameStore.setState({ worldBlocks: new Map(OWN4.map(([x, y, z]) => [`${x}_${y}_${z}`, STONE])), chests: new Map() });
          await mineAtHit({ hitPoint: new THREE.Vector3(2.5, 14, 2.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
            targetedX: 2, targetedY: 13, targetedZ: 2, targetCoords: '2_13_2' }, { post: () => {}, editCells: all, playBreak: () => {} });
          keys = [...S().worldBlocks].filter(([, b]) => b === 0).map(([k]) => k);
        } else {
          useGameStore.setState((s) => ({ worldBlocks: new Map(), inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 64 } } }));
          await placeAtHit({ hitPoint: new THREE.Vector3(2.5, 20, 2.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) }, { editCells: all });
          keys = [...S().worldBlocks.keys()];
        }
        const n = numbers.length ? numbers[0] : 1;
        const want = PROMISE[id](n);
        expect({ numbers, extent: extent(keys), size: shown }, `${id} at slider ${v}: "${label}" is not what it builds`).toEqual(want);
        checked.push(n);
      }
      expect(checked.length, 'SETUP: a slider size was not checked').toBe(10);
      expect(Math.max(...checked), `SETUP: the ${id} label never reached the tool's largest size`).toBe(Number(screen.getByRole('slider').max));
    }, 60000);
  }
});
