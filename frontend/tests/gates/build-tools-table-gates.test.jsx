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

// EVERY BUILDING TOOL DOES WHAT ITS LABEL SAYS (DECISIONS 2026-10-31 items 231-233). The "Delete Tool - Remove multiple
// blocks" made a right-click build a 3x3x3 cube and left a left-click mining one block; "Wall Builder - Build 3-high
// walls" laid a 1-high strip along +x off the ground; a floor or a cube off a wall's side put a third of itself inside
// the wall; and each opening of the panel set the mode back to Single and the size to 3 (registry
// AUDIT:numeric:delete-tool-places-cube, AUDIT:ultra:ultra-game-logic-2, AUDIT:numeric:footprint-overwrites-solid-cells).
//
// One row per tool the real panel offers: the tool is picked by clicking its button, the panel is closed and opened
// again, and the place and mine verbs (world/placeAtHit.js, world/mineAtHit.js) run against the real terrain worker on a
// site whose every cell this file sets (flat grass on dirt on stone, and a stone wall standing on it), so each tool's
// cells are written out here by hand, not derived from the code under test. A tool the panel gains without a row fails.
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
// What each tool does, size 3: the cells a right-click fills off each face, and the blocks a left-click on the ground takes.
const TABLE = {
  single: { top: one(TOP), side: one(SIDE), mine: one(MINED) },
  wall: {
    top: cells(box([TOP[0]], range(TOP[1], TOP[1] + 2), [TOP[2]])), // a column rising off the ground
    side: cells(box([SIDE[0]], range(SIDE[1], SIDE[1] + 2), [SIDE[2]])),
    mine: one(MINED),
  },
  floor: {
    top: cells(box(range(TOP[0] - 1, TOP[0] + 1), [TOP[1]], range(TOP[2] - 1, TOP[2] + 1))),
    side: cells(box(range(SIDE[0], SIDE[0] - 2), [SIDE[1]], range(SIDE[2] - 1, SIDE[2] + 1))), // out from the wall
    mine: one(MINED),
  },
  cube: {
    top: cells(box(range(TOP[0] - 1, TOP[0] + 1), range(TOP[1], TOP[1] + 2), range(TOP[2] - 1, TOP[2] + 1))),
    side: cells(box(range(SIDE[0], SIDE[0] - 2), range(SIDE[1], SIDE[1] + 2), range(SIDE[2] - 1, SIDE[2] + 1))),
    mine: one(MINED),
  },
  // Remove multiple blocks: a left-click takes the 3x3x3 under the aimed face; a right-click places one block.
  delete: { top: one(TOP), side: one(SIDE), mine: cells(box(range(MINED[0] - 1, MINED[0] + 1), range(MINED[1], MINED[1] - 2), range(MINED[2] - 1, MINED[2] + 1))) },
};
// The left-click's payback, as the blocks it took: a 3x3 of each layer for the Delete Tool, one grass block otherwise.
const MINE_PAY = { delete: { grass: 9, dirt: 9, stone: 9 } };

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

async function mine() {
  sendToWorker('load_modifications', { modifications: siteMods() });
  useGameStore.setState({ worldBlocks: new Map() });
  const io = workerVerbIo({ onBroken: payBrokenBlock });
  const [x, y, z] = MINED;
  const h = { hitPoint: new THREE.Vector3(x + 0.5, y + 1, z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
    targetedX: x, targetedY: y, targetedZ: z, targetCoords: `${x}_${y}_${z}`, chestTargeted: false, chestHasItems: false };
  const before = blocksOf();
  await mineAtHit(h, { post: io.post, editCells: io.editCells, playBreak: () => {} });
  const recorded = recordedSince(new Map());
  return { keys: recorded.map(([k]) => k).sort(), zero: recorded.every(([, v]) => v === 0), paid: delta(before, blocksOf()) };
}

describe('every Building Tools tool does what its label says (real panel, real store, real worker)', () => {
  it('the panel offers exactly the tools in this table, each picked by its button into the store', () => {
    render(<BuildingTools onClose={() => {}} />);
    expect(screen.getByRole('slider').value, 'a fresh profile\'s panel does not open at the size its labels were written for').toBe('3');
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
      fireEvent.change(screen.getByRole('slider'), { target: { value: String(SIZE) } });
      const at = toolButtons().findIndex((b) => { fireEvent.click(b); return S().buildingMode === id; });
      expect(at, `SETUP: no button picks ${id}`).toBeGreaterThanOrEqual(0);
      cleanup();

      // Reopened, the panel shows what the store holds and leaves it be.
      render(<BuildingTools onClose={() => {}} />);
      expect({ mode: S().buildingMode, size: S().buildSize }, `reopening the panel changed the ${id} tool the player picked`).toEqual({ mode: id, size: SIZE });
      expect(screen.getByRole('slider').value, 'the reopened panel\'s slider does not show the store\'s size').toBe(String(SIZE));
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
    }, 60000);
  }
});
