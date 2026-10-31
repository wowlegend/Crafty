import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineAtHit, payBrokenBlock } from '../../src/world/mineAtHit.js';
import { buildFootprint } from '../../src/game/buildFootprint.js';
import { idForBlock, blockForId } from '../../src/world/blockIds.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, voxelIndex } from '../../src/world/chunkLayout.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldSeed.js';
import { loadTerrainWorker, sendToWorker, readVoxel, workerVerbIo } from '../_support/terrainWorker.js';

// THE BUILD TOOLS CHANGE ONLY WHAT THEY SAY, AND PAY FOR EXACTLY WHAT THEY CHANGE (DECISIONS 2026-10-31 items 230-232).
// A multi-cell placement wrote every cell of its footprint whatever the cell held: ore, built blocks and a chest's wood
// were replaced with no drop and one debit each, and a cell above the world was paid for and dropped by the worker
// (registry AUDIT:numeric:footprint-overwrites-solid-cells, AUDIT:numeric:place-above-world-ceiling-swallows-block). This
// drives the real terrain worker (terrain.worker.js, through tests/_support/terrainWorker.js) with the real placeAtHit
// and mineAtHit, over random footprints in boxes whose every cell this file sets through the worker's own edit table
// (`load_modifications`), so what each cell held is known here and not read from the code under test:
//  - a placement changes only cells that held air or water, inside the world (y 0 to 255), off a chest's cell and off a
//    block the player built; it pays one block for each cell it changed and records exactly those;
//  - a Delete Tool removal takes only solid cells, never water or a chest with something in it, and each removed block
//    is paid back as the block it was;
//  - what the worker holds afterwards is read back cell by cell (update_block, which is not the path under test).
//
// WHAT THIS DOES NOT CHECK: the footprint's shape (tests/gates/build-footprint-gates.test.js), the build ray and the
// player's body (tests/integration/place-clear-of-player-rapier.test.jsx, the chaos-play files), the panel
// (tests/gates/build-tools-table-gates.test.jsx), sounds and notices (tests/gates/place-executor-gates.test.jsx).
//
// Mutation-Proof: see the commit trailer.

const AIR = 0, WATER = 9, WOOD = 6;
const NATURAL = [1, 2, 3, 4, 10, 11, 12, 13];
const BUILT = [3, 14, 15];
const PLACEABLE = ['stone', 'dirt', 'cobblestone', 'glass', 'sand'];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const HALF = 7;
// Each box is centred in its own chunk (local 1 to 15), so no footprint leaves it; two sit against the world's top and
// bottom so footprints cross y 255 and y 0.
const SITES = [
  { cx: 12, cz: 9, y: 40 }, { cx: 15, cz: 9, y: 70 }, { cx: 12, cz: 12, y: 100 }, { cx: 15, cz: 12, y: 130 },
  { cx: 18, cz: 9, y: 248, anchorY: [253, 254, 255] }, { cx: 18, cz: 12, y: 7, anchorY: [0, 1, 2] },
];
const ACTIONS_PER_SITE = 8;

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const key = (c) => `${c.x}_${c.y}_${c.z}`;
const inWorld = (c) => c.y >= 0 && c.y < CHUNK_HEIGHT;
const isEmpty = (id) => id === AIR || id === WATER;

const S = () => useGameStore.getState();
let clock = 1e7;
beforeAll(async () => {
  await loadTerrainWorker();
  sendToWorker('init', { seed: DEFAULT_WORLD_SEED });
});
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState({ addNotification: () => {}, worldBlocks: new Map(), chests: new Map() });
});
afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

/** Every box cell's id, chosen here and handed to the worker as its edit table; the built cells and chests to the store. */
function makeWorld(rnd) {
  const truth = new Map();
  const mods = [];
  const worldBlocks = new Map();
  const chests = new Map();
  for (const site of SITES) {
    const ox = site.cx * CHUNK_SIZE + 8, oz = site.cz * CHUNK_SIZE + 8;
    for (let x = ox - HALF; x <= ox + HALF; x++) for (let z = oz - HALF; z <= oz + HALF; z++)
      for (let y = Math.max(0, site.y - HALF); y <= Math.min(CHUNK_HEIGHT - 1, site.y + HALF); y++) {
        const r = rnd();
        let id;
        if (r < 0.45) id = AIR;
        else if (r < 0.57) id = WATER;
        else if (r < 0.87) id = NATURAL[Math.floor(rnd() * NATURAL.length)];
        else if (r < 0.97) { id = BUILT[Math.floor(rnd() * BUILT.length)]; worldBlocks.set(`${x}_${y}_${z}`, id); }
        else {
          id = WOOD;
          worldBlocks.set(`${x}_${y}_${z}`, WOOD);
          chests.set(`${x}_${y}_${z}`, { inventory: rnd() < 0.5 ? { gold: 2 } : {}, name: 'Wooden Chest' });
        }
        truth.set(`${x}_${y}_${z}`, id);
        mods.push([site.cx, site.cz, voxelIndex(x - site.cx * CHUNK_SIZE, y, z - site.cz * CHUNK_SIZE), id]);
      }
  }
  sendToWorker('load_modifications', { modifications: mods });
  return { truth, worldBlocks, chests };
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
const countBy = (ids) => {
  const out = {};
  for (const id of ids) { const name = blockForId(id); out[name] = (out[name] || 0) + 1; }
  return out;
};

describe('the worker\'s batched edit on its own', () => {
  it('changes no cell outside the world, whichever way it is asked, and still answers', () => {
    const replies = [];
    const io = workerVerbIo({ onBroken: (b) => replies.push(b) });
    let answered = null;
    io.editCells({ blockType: 3, cells: [{ x: 5, y: CHUNK_HEIGHT, z: 5 }, { x: 5, y: -1, z: 5 }] }, (applied) => { answered = applied; });
    expect(answered, 'a cell outside the world was filled, or the worker did not answer').toEqual([]);
    io.editCells({ blockType: 0, cells: [{ x: 5, y: CHUNK_HEIGHT, z: 5 }, { x: 5, y: -1, z: 5 }, { x: 5, y: 0, z: 5 }] }, (applied) => { answered = applied; });
    // y 0 is in the world and solid under every column, so the instrument can see a removal in the same call.
    expect({ answered, broken: replies.map((r) => r.y) }, 'a removal took a cell outside the world').toEqual({ answered: [2], broken: [0] });
  });

  it('re-meshes the chunk a batch names, stamped with its seq, even when it changed no cell there', () => {
    // A placed cell's stand-in collider retires only on a mesh of its chunk stamped at or past its seq
    // (world/placedCellColliders.js): a refused cell's stand-in needs that mesh as much as a filled one's.
    const io = workerVerbIo({ onBroken: () => {} });
    const meshes = [];
    let answered = null;
    io.editCells({ blockType: 3, cells: [{ x: 6, y: 0, z: 6, seq: 9001 }] }, (applied) => { answered = applied; });
    expect(answered, 'SETUP: the worker filled a solid cell').toEqual([]);
    for (const m of io.received) if (m.type === 'chunk_mesh') meshes.push([m.payload.cx, m.payload.cz, m.payload.editSeq]);
    expect(meshes, 'the chunk of a batch the worker refused was not re-meshed with the batch\'s seq').toEqual([[0, 0, 9001]]);
  });
});

describe('the build tools change only empty or solid cells as they say, and pay for exactly those (real worker)', () => {
  it(`${SITES.length * ACTIONS_PER_SITE} random placements and removals over boxes of known cells`, async () => {
    const rnd = mulberry32(230);
    const { truth, worldBlocks, chests } = makeWorld(rnd);
    useGameStore.setState({ worldBlocks: new Map(worldBlocks), chests: new Map(chests) });
    const tally = { actions: 0, places: 0, deletes: 0, applied: 0, refusedSolid: 0, waterFilled: 0, offWorld: 0,
      heldBuilt: 0, shortStacks: 0, removed: 0, chestsKept: 0, emptyChestsTaken: 0, waterKept: 0, readBack: 0 };
    const pick = (list) => list[Math.floor(rnd() * list.length)];

    for (const site of SITES) {
      const ox = site.cx * CHUNK_SIZE + 8, oz = site.cz * CHUNK_SIZE + 8;
      for (let a = 0; a < ACTIONS_PER_SITE; a++) {
        const at = { x: ox - 1 + Math.floor(rnd() * 3), y: site.anchorY ? pick(site.anchorY) : site.y - 1 + Math.floor(rnd() * 3), z: oz - 1 + Math.floor(rnd() * 3) };
        const [nx, ny, nz] = pick(NORMALS);
        const normal = { x: nx, y: ny, z: nz };
        const roll = rnd();
        const io = workerVerbIo({ onBroken: payBrokenBlock });
        const label = `site ${site.cx},${site.cz} action ${a}`;
        tally.actions++;

        if (roll < 0.75) {
          // A right-click: the aimed cell is `at`, the hit on the face of the cell behind it along the normal.
          const type = roll < 0.05 ? 'chest' : pick(PLACEABLE);
          const mode = type === 'chest' ? 'single' : pick(['single', 'wall', 'wall', 'floor', 'cube']);
          const size = mode === 'wall' ? 2 + Math.floor(rnd() * 5) : 2 + Math.floor(rnd() * 3);
          const id = idForBlock(type);
          const footprint = buildFootprint(mode, size, at, normal);
          const candidates = footprint.filter((c) => inWorld(c) && !S().chests.has(key(c)) && !(S().worldBlocks.get(key(c)) > 0));
          const stack = rnd() < 0.25 ? Math.floor(rnd() * candidates.length) : candidates.length + 2;
          const reserved = candidates.slice(0, stack);
          const want = reserved.filter((c) => isEmpty(truth.get(key(c))));
          tally.places++;
          tally.offWorld += footprint.filter((c) => !inWorld(c)).length;
          tally.heldBuilt += footprint.filter((c) => inWorld(c) && (S().chests.has(key(c)) || S().worldBlocks.get(key(c)) > 0)).length;
          if (stack < candidates.length) tally.shortStacks++;
          useGameStore.setState((s) => ({ selectedBlock: type, buildingMode: mode, buildSize: size,
            inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, [type]: stack } } }));
          const blocksBefore = blocksOf();
          const recordedBefore = new Map(S().worldBlocks);
          const chestsBefore = new Map(S().chests);
          const h = { hitPoint: new THREE.Vector3(at.x + 0.5 - nx * 0.5, at.y + 0.5 - ny * 0.5, at.z + 0.5 - nz * 0.5), normal, direction: new THREE.Vector3(-nx, -ny, -nz) };
          const placed = await placeAtHit(h, { post: io.post, editCells: io.editCells });
          const why = `${label}: ${type} ${mode} ${size} at ${key(at)} normal ${[nx, ny, nz]} stack ${stack}; want ${want.map(key)}`;

          expect(placed, `the placement's count is not the empty cells it was paid for (${why})`).toBe(want.length);
          expect(delta(blocksBefore, blocksOf()), `the debit is not one block per cell filled (${why})`).toEqual(want.length ? { [type]: -want.length } : {});
          const recorded = [...S().worldBlocks].filter(([k, v]) => recordedBefore.get(k) !== v);
          expect(recorded.sort(), `the store recorded other cells than the ones filled (${why})`).toEqual(want.map((c) => [key(c), id]).sort());
          const chestDiff = [...S().chests.keys()].filter((k) => !chestsBefore.has(k));
          expect(chestDiff, `the storage chests changed other than by the chest placed (${why})`).toEqual(type === 'chest' ? want.map(key) : []);
          const edits = io.sent.filter((m) => m.type === 'update_block' || m.type === 'edit_cells');
          const sentCells = edits.flatMap((m) => (m.type === 'edit_cells' ? m.payload.cells : [{ x: m.payload.cx * CHUNK_SIZE + m.payload.x, y: m.payload.y, z: m.payload.cz * CHUNK_SIZE + m.payload.z }]));
          expect(sentCells.filter((c) => !inWorld(c)).map(key), `a cell outside the world reached the worker (${why})`).toEqual([]);
          expect(sentCells.filter((c) => S().chests.has(key(c)) && !want.some((w) => key(w) === key(c))).map(key), `a chest's cell reached the worker (${why})`).toEqual([]);

          // What the worker holds now: each paid cell it refused is as it was, and each filled cell (up to 3) holds the block.
          const refused = reserved.filter((c) => !isEmpty(truth.get(key(c))));
          for (const c of refused) expect(readVoxel(c.x, c.y, c.z), `a solid cell was overwritten at ${key(c)} (${why})`).toBe(truth.get(key(c)));
          const unpaid = candidates.slice(stack).filter((c) => isEmpty(truth.get(key(c)))).slice(0, 2);
          for (const c of unpaid) expect(readVoxel(c.x, c.y, c.z), `a cell the stack did not pay for was filled at ${key(c)} (${why})`).toBe(truth.get(key(c)));
          for (const c of want.slice(0, 3)) expect(readVoxel(c.x, c.y, c.z), `a paid empty cell was not filled at ${key(c)} (${why})`).toBe(id);
          tally.readBack += refused.length + unpaid.length + Math.min(3, want.length);
          tally.waterFilled += want.filter((c) => truth.get(key(c)) === WATER).length;
          for (const c of want) truth.set(key(c), id);
          tally.applied += want.length;
          tally.refusedSolid += refused.length;
        } else {
          // A Delete Tool left-click: the target is `at`, the hit on its face along the normal; the verb router never mines a
          // chest with something in it (input/verbRouter.js), so such a target is skipped.
          if (S().chests.has(key(at)) && Object.keys(S().chests.get(key(at)).inventory).length) continue;
          const size = 1 + Math.floor(rnd() * 4);
          const footprint = buildFootprint('delete', size, at, normal);
          tally.offWorld += footprint.filter((c) => !inWorld(c)).length;
          const kept = (c) => !inWorld(c) || Object.values(S().chests.get(key(c))?.inventory || {}).some((q) => q > 0);
          const want = footprint.filter((c) => !kept(c) && !isEmpty(truth.get(key(c))));
          tally.deletes++;
          tally.chestsKept += footprint.filter((c) => inWorld(c) && kept(c)).length;
          useGameStore.setState({ buildingMode: 'delete', buildSize: size });
          const blocksBefore = blocksOf();
          const recordedBefore = new Map(S().worldBlocks);
          const chestsBefore = new Map(S().chests);
          const hitPoint = new THREE.Vector3(at.x + 0.5 + nx * 0.5, at.y + 0.5 + ny * 0.5, at.z + 0.5 + nz * 0.5);
          const h = { hitPoint, normal, direction: new THREE.Vector3(-nx, -ny, -nz), targetedX: at.x, targetedY: at.y, targetedZ: at.z, targetCoords: key(at) };
          await mineAtHit(h, { post: io.post, editCells: io.editCells, playBreak: () => {} });
          const why = `${label}: delete ${size} at ${key(at)} normal ${[nx, ny, nz]}; want ${want.map(key)}`;

          expect(delta(blocksBefore, blocksOf()), `the removal did not pay back each block it took, as itself (${why})`).toEqual(countBy(want.map((c) => truth.get(key(c)))));
          const recorded = [...S().worldBlocks].filter(([k, v]) => recordedBefore.get(k) !== v).map(([k]) => k);
          expect(recorded.sort(), `the store recorded other removals than the blocks taken (${why})`).toEqual(want.map(key).filter((k) => recordedBefore.get(k) !== 0).sort());
          const chestsGone = [...chestsBefore.keys()].filter((k) => !S().chests.has(k));
          expect(chestsGone.sort(), `the chests removed are not the empty ones the footprint took (${why})`).toEqual(want.map(key).filter((k) => chestsBefore.has(k)).sort());
          tally.emptyChestsTaken += chestsGone.length;
          const sent = io.sent.flatMap((m) => (m.type === 'edit_cells' ? m.payload.cells : []));
          expect(sent.filter((c) => !inWorld(c)).map(key), `a removal sent a cell outside the world (${why})`).toEqual([]);
          for (const c of footprint.filter((c) => inWorld(c) && kept(c))) expect(readVoxel(c.x, c.y, c.z), `a chest with things in it was removed at ${key(c)} (${why})`).toBe(truth.get(key(c)));
          const water = footprint.filter((c) => inWorld(c) && truth.get(key(c)) === WATER).slice(0, 3);
          for (const c of water) expect(readVoxel(c.x, c.y, c.z), `a removal drained water at ${key(c)} (${why})`).toBe(WATER);
          for (const c of want.slice(0, 4)) expect(readVoxel(c.x, c.y, c.z), `a solid cell in the footprint was not removed at ${key(c)} (${why})`).toBe(AIR);
          tally.readBack += water.length + Math.min(4, want.length);
          tally.waterKept += water.length;
          for (const c of want) truth.set(key(c), AIR);
          tally.removed += want.length;
        }
      }
    }
    process.stdout.write(`\nbuild-tools worker gate: ${JSON.stringify(tally)}\n`);
    expect(tally.actions, 'SETUP: an action was not run').toBe(SITES.length * ACTIONS_PER_SITE);
    expect(tally.applied, 'SETUP: too few cells were filled for the debit to mean anything').toBeGreaterThanOrEqual(40);
    expect(tally.refusedSolid, 'SETUP: too few paid cells were solid, so the occupancy check was barely examined').toBeGreaterThanOrEqual(20);
    expect(tally.waterFilled, 'SETUP: no placement filled a water cell').toBeGreaterThanOrEqual(3);
    expect(tally.offWorld, 'SETUP: no footprint crossed the top or the bottom of the world').toBeGreaterThanOrEqual(3);
    expect(tally.heldBuilt, 'SETUP: no footprint met a built block or a chest').toBeGreaterThanOrEqual(3);
    expect(tally.shortStacks, 'SETUP: no stack fell short of its footprint').toBeGreaterThanOrEqual(3);
    expect(tally.removed, 'SETUP: too few blocks were removed for the payback to mean anything').toBeGreaterThanOrEqual(20);
    expect(tally.waterKept, 'SETUP: no removal footprint held water').toBeGreaterThanOrEqual(3);
    expect(Math.min(tally.chestsKept, tally.emptyChestsTaken), 'SETUP: no removal met a chest with things in it, or none took an empty one').toBeGreaterThanOrEqual(1);
  }, 180000);
});
