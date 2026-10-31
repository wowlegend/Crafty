import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { mineAtHit } from '../../src/world/mineAtHit.js';

// M6 dead-wire fix: the onBlockPlace/onBlockBreak callbacks are registered by QuestSystem (and increment
// blocks_placed/blocks_broken + updateQuestProgress) but the mine and place executors never invoked them,
// so building/mining silently advanced NO quest (builder/architect/world_builder/miner) or achievement
// (Master Builder / Deep Digger). This pins the wiring by driving the executors Terrain.jsx's verbs call
// (world/mineAtHit.js, world/placeAtHit.js): break fires from a mine, place from a placement, each once per
// action (no cross-wire, no double-count), and neither for an action the worker did nothing for. The callback
// BODIES are covered by QuestSystem tests.
//
// WHAT THIS DOES NOT CHECK: that Terrain.jsx's verbs call these executors (tests/e2e/the-cut.spec.js places and
// tests/e2e/input-live.spec.js mines through real clicks).
//
// Mutation-Proof: see the commit trailer.

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

    it('a mine fires the registered onBlockBreak callback once (not onBlockPlace)', async () => {
      const posted = [];
      await mineAtHit(hit(), { post: (m) => posted.push(m), editCells: answering(), playBreak: () => {} });
      expect(posted.length, 'SETUP: the mine sent the worker nothing').toBe(1);
      expect(calls, 'a mine did not fire onBlockBreak alone').toEqual(['break']);
    });

    it('a Delete Tool removal fires it once however many blocks it took, and not when it took none', async () => {
      useGameStore.setState({ buildingMode: 'delete', buildSize: 3 });
      expect(await mineAtHit(hit(), { post: () => {}, editCells: answering(), playBreak: () => {} }), 'SETUP: the removal took one block').toBe(27);
      expect(calls, 'a 27-block removal counted more or less than one break').toEqual(['break']);
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
});
