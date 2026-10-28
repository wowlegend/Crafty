import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const terrain = readFileSync(resolve(HERE, '../../src/world/Terrain.jsx'), 'utf8');

// M6 dead-wire fix: the onBlockPlace/onBlockBreak callbacks are registered by QuestSystem (and increment
// blocks_placed/blocks_broken + updateQuestProgress) but the mine()/place() executors never invoked them,
// so building/mining silently advanced NO quest (builder/architect/world_builder/miner) or achievement
// (Master Builder / Deep Digger). This pins the wiring: break fires in mine(), place fires in the place executor
// (world/placeAtHit.js, which Terrain's place() calls, driven here), each once per action (no cross-wire, no
// double-count). The callback BODIES are covered by QuestSystem tests.
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + 1);
  return i >= 0 && j > i ? src.slice(i, j) : '';
};

describe('M6 block place/break advance quests + achievements (dead-wire fix)', () => {
  it('mine() fires the registered onBlockBreak callback (not onBlockPlace)', () => {
    const mineBody = between(terrain, 'const mine = (h) =>', 'const place = (h) =>');
    expect(mineBody).toMatch(/store\.onBlockBreak\?\.\(\)/);
    expect(mineBody).not.toMatch(/onBlockPlace/);
  });

  describe('the place executor', () => {
    let calls;
    const hit = () => ({ hitPoint: new THREE.Vector3(2.5, 25, 2.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) });
    beforeEach(() => {
      calls = [];
      useGameStore.setState(useGameStore.getInitialState(), true);
      useGameStore.setState((s) => ({
        selectedBlock: 'stone', inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 64 } },
        onBlockPlace: () => calls.push('place'), onBlockBreak: () => calls.push('break'),
      }));
    });
    afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

    it('fires the registered onBlockPlace callback (not onBlockBreak)', () => {
      expect(placeAtHit(hit(), { post: () => {} }), 'SETUP: nothing was placed').toBe(1);
      expect(calls, 'a placement did not fire onBlockPlace alone').toEqual(['place']);
    });

    it('fires it once per action, however many cells the footprint placed, and not for a refusal', () => {
      useGameStore.setState({ buildingMode: 'cube', buildSize: 3 });
      expect(placeAtHit(hit(), { post: () => {} }), 'SETUP: the cube placed one cell').toBe(27);
      expect(calls, 'a 27-cell placement counted more or less than one place').toEqual(['place']);
      useGameStore.setState((s) => ({ inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, stone: 0 } } }));
      expect(placeAtHit(hit(), { post: () => {} })).toBe(0);
      expect(calls, 'a refused placement counted as a place').toEqual(['place']);
    });
  });

  it('Terrain fires onBlockBreak exactly once and leaves onBlockPlace to the executor (no double-count)', () => {
    expect((terrain.match(/onBlockBreak\?\.\(\)/g) || []).length).toBe(1);
    expect((terrain.match(/onBlockPlace\?\.\(\)/g) || []).length).toBe(0);
  });
});
