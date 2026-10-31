import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineAtHit, creditBrokenBlock } from '../../src/world/mineAtHit.js';
import { voxelIndex } from '../../src/world/chunkLayout.js';
import { DEFAULT_WORLD_SEED } from '../../src/world/worldSeed.js';
import { loadTerrainWorker, sendToWorker, workerVerbIo } from '../_support/terrainWorker.js';

// M6 dead-wire fix: the onBlockPlace/onBlockBreak callbacks are registered by QuestSystem (and increment
// blocks_placed/blocks_broken + updateQuestProgress) but the mine and place executors never invoked them,
// so building/mining silently advanced NO quest (builder/architect/world_builder/miner) or achievement
// (Master Builder / Deep Digger). This pins the wiring by driving the executors Terrain.jsx's verbs call
// (world/mineAtHit.js, world/placeAtHit.js): break fires from a mine, place from a placement, each once per
// action (no cross-wire, no double-count), and neither for an action the worker did nothing for: a single mine counts
// when the worker's block_broken says it broke a block (world/mineAtHit.js creditBrokenBlock), never at the click. Then
// the same verbs over the real terrain worker, every reply heard as Terrain.jsx hears it (world/cellEdits.js `heard`):
// a mine is one break and not two. The callback BODIES are covered by QuestSystem tests.
//
// WHAT THIS DOES NOT CHECK: that Terrain.jsx's verbs call these executors (tests/e2e/the-cut.spec.js places and
// tests/e2e/input-live.spec.js mines through real clicks).
//
// Mutation-Proof: see the commit trailer.

const S = () => useGameStore.getState();
/** The worker answering a batched edit: it changes every cell it is sent, or none. */
const answering = (all = true) => (edit, done) => done(all ? edit.cells.map((_, i) => i) : []);

describe('M6 block place/break advance quests + achievements (dead-wire fix)', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState((s) => ({
      selectedBlock: 'stone', inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 64 } },
      worldBlocks: new Map(), chests: new Map(), addNotification: () => {},
      onBlockPlace: () => calls.push('place'), onBlockBreak: () => calls.push('break'),
    }));
  });
  afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

  describe('the mine executor', () => {
    const hit = () => ({ hitPoint: new THREE.Vector3(2.5, 25, 2.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
      targetedX: 2, targetedY: 24, targetedZ: 2, targetCoords: '2_24_2' });

    it('a mine counts nothing at the click, and once (not onBlockPlace) when the worker says it broke the block', async () => {
      const posted = [];
      await mineAtHit(hit(), { post: (m) => posted.push(m), editCells: answering(), playBreak: () => {} });
      expect(posted.length, 'SETUP: the mine sent the worker nothing').toBe(1);
      expect(calls, 'a mine counted before the worker said what it broke').toEqual([]);
      // The worker's block_broken echoes the post's tags (terrain.worker.js update_block).
      const { y, source, drop } = posted[0].payload;
      creditBrokenBlock({ x: 2, y, z: 2, blockType: 3, source, drop });
      expect(calls, 'the worker\'s break of the mined block did not fire onBlockBreak alone').toEqual(['break']);
    });

    it('a Delete Tool removal fires it once however many blocks it took, and not when it took none', async () => {
      // The player's own blocks: the 3x3x3 the removal takes under the aimed face.
      const own = [];
      for (let x = 1; x <= 3; x++) for (let y = 22; y <= 24; y++) for (let z = 1; z <= 3; z++) own.push([`${x}_${y}_${z}`, 3]);
      useGameStore.setState({ buildingMode: 'delete', buildSize: 3, worldBlocks: new Map(own) });
      expect(await mineAtHit(hit(), { post: () => {}, editCells: answering(), playBreak: () => {} }), 'SETUP: the removal did not take 27 blocks').toBe(27);
      expect(calls, 'a 27-block removal counted more or less than one break').toEqual(['break']);
      useGameStore.setState({ worldBlocks: new Map(own) });
      expect(await mineAtHit(hit(), { post: () => {}, editCells: answering(false), playBreak: () => {} })).toBe(0);
      expect(calls, 'a removal the worker did nothing for counted as a break').toEqual(['break']);
    });
  });

  describe('the place executor', () => {
    const hit = () => ({ hitPoint: new THREE.Vector3(2.5, 25, 2.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) });

    it('fires the registered onBlockPlace callback (not onBlockBreak)', async () => {
      expect(await placeAtHit(hit(), { editCells: answering() }), 'SETUP: nothing was placed').toBe(1);
      expect(calls, 'a placement did not fire onBlockPlace alone').toEqual(['place']);
    });

    it('fires it once per action, however many cells the footprint placed, and not for a refusal', async () => {
      useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
      expect(await placeAtHit(hit(), { editCells: answering() }), 'SETUP: the cube placed one cell').toBe(27);
      expect(calls, 'a 27-cell placement counted more or less than one place').toEqual(['place']);
      useGameStore.setState({ worldBlocks: new Map() });
      expect(await placeAtHit(hit(), { editCells: answering(false) })).toBe(0);
      expect(calls, 'a placement the worker filled nothing for counted as a place').toEqual(['place']);
      useGameStore.setState((s) => ({ inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 0 } } }));
      expect(await placeAtHit(hit(), { editCells: answering() })).toBe(0);
      expect(calls, 'a refused placement counted as a place').toEqual(['place']);
    });
  });

  describe('over the real worker, its replies heard as Terrain.jsx hears them', () => {
    beforeAll(async () => {
      await loadTerrainWorker();
      sendToWorker('init', { seed: DEFAULT_WORLD_SEED });
    });
    const at = (x, y, z) => ({ hitPoint: new THREE.Vector3(x + 0.5, y + 1, z + 0.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0),
      targetedX: x, targetedY: y, targetedZ: z, targetCoords: `${x}_${y}_${z}` });
    // The player's own 3x3x3 of stone under a generated stone block at 2_24_2, and air above that.
    const OWN = [];
    for (let x = 1; x <= 3; x++) for (let y = 21; y <= 23; y++) for (let z = 1; z <= 3; z++) OWN.push([x, y, z]);

    it('a mine, a Delete Tool removal and a placement each count once; the payments the worker\'s replies make count nothing', async () => {
      sendToWorker('load_modifications', { modifications: [
        ...OWN.map(([x, y, z]) => [0, 0, voxelIndex(x, y, z), 3]), [0, 0, voxelIndex(2, 24, 2), 3], [0, 0, voxelIndex(2, 25, 2), 0]] });
      useGameStore.setState({ worldBlocks: new Map(OWN.map(([x, y, z]) => [`${x}_${y}_${z}`, 3])) });
      const io = workerVerbIo({ onBroken: creditBrokenBlock });
      const stone = () => S().inventory.blocks.stone;
      const start = stone();

      await mineAtHit(at(2, 24, 2), { post: io.post, editCells: io.editCells, playBreak: () => {} });
      expect(io.received.filter((m) => m.type === 'block_broken').length, 'SETUP: the mine\'s block_broken was not heard').toBe(1);
      expect({ calls, paid: stone() - start }, 'a mine paid back through the worker did not count one break').toEqual({ calls: ['break'], paid: 1 });

      useGameStore.setState({ buildingMode: 'delete', buildSize: 3 });
      expect(await mineAtHit(at(2, 23, 2), { post: io.post, editCells: io.editCells, playBreak: () => {} }), 'SETUP: the removal did not take the 27').toBe(27);
      expect({ calls, paid: stone() - start }, 'a 27-block removal paid through the worker\'s answer did not count one break').toEqual({ calls: ['break', 'break'], paid: 28 });

      useGameStore.setState({ buildingMode: 'single', buildSize: 1 });
      expect(await placeAtHit(at(2, 24, 2), { editCells: io.editCells }), 'SETUP: the placement placed nothing').toBe(1);
      expect(calls, 'a placement through the worker did not count one place').toEqual(['break', 'break', 'place']);
    });
  });
});
