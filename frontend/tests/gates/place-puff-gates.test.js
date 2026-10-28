import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { BLOCK_TYPES } from '../../src/world/Blocks.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';

// Block-PLACE puff (2026-06-14, next-levers #1b). Breaking a block shatters into colored physics debris (worker
// 'block_broken' -> BlockParticleSystem); placing one settles a gentle dust puff in the placed block's colour, through
// the GPU sparks. This drives the placement executor Terrain.jsx's place() calls (world/placeAtHit.js) and reads the
// spark call it makes, so the puff is checked as behaviour rather than as text in the source.
//
// WHAT THIS DOES NOT CHECK: that the sparks draw (the GPU spark system), or the puff in the running game.
//
// Mutation-Proof: see the commit trailer (the spark call removed; the colour taken from a fixed constant).
const hit = () => ({ hitPoint: new THREE.Vector3(4.5, 30, 4.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) });

beforeEach(() => useGameStore.setState(useGameStore.getInitialState(), true));
afterEach(() => useGameStore.setState(useGameStore.getInitialState(), true));

describe('block-place puff is wired', () => {
  it('a placement fires one GPU-spark puff, at the placed cell, in the placed block\'s colour', () => {
    const sparks = [];
    for (const block of ['sand', 'stone', 'glass']) {
      useGameStore.setState((s) => ({
        selectedBlock: block, worldBlocks: new Map(),
        inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, [block]: 1 } },
        triggerGPUSparks: (pos, colour, count) => sparks.push({ block, colour, count, y: Math.floor(pos.y) }),
      }));
      expect(placeAtHit(hit(), { post: () => {} }), `SETUP: the ${block} placement placed nothing`).toBe(1);
    }
    // Three blocks with three different colours: a fixed colour cannot satisfy all three.
    expect(sparks, 'each placement must puff once, in its own block colour, at the placed cell').toEqual([
      { block: 'sand', colour: BLOCK_TYPES.sand.color, count: 6, y: 30 },
      { block: 'stone', colour: BLOCK_TYPES.stone.color, count: 6, y: 30 },
      { block: 'glass', colour: BLOCK_TYPES.glass.color, count: 6, y: 30 },
    ]);
    expect(new Set(sparks.map((s) => s.colour)).size, 'SETUP: the sampled blocks share a colour').toBe(3);
  });

  it('a refused placement makes no puff', () => {
    const sparks = [];
    useGameStore.setState((s) => ({
      selectedBlock: 'sand', inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, sand: 0 } },
      triggerGPUSparks: () => sparks.push(1),
    }));
    expect(placeAtHit(hit(), { post: () => {} })).toBe(0);
    expect(sparks, 'an empty stack still puffed').toEqual([]);
  });

  it('every BLOCK_TYPES entry has a hex color the puff can use', () => {
    for (const [name, def] of Object.entries(BLOCK_TYPES)) {
      expect(def.color, `${name} has no color`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
