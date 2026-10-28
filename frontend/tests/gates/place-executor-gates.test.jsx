// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { CraftingTable } from '../../src/ui/panels/CraftingTable.jsx';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks.js';
import { RECIPES } from '../../src/data/recipes.js';
import { blockForId } from '../../src/world/blockIds.js';
import { CHUNK_SIZE } from '../../src/world/loadedChunks.js';
import { PLACE_GAIN } from '../../src/game/ember.js';

// THE PLACE VERB, THROUGH THE FUNCTION THE VERB ROUTER CALLS (DECISIONS 2026-10-28 W1-H item 4: every placement spends
// a block). Terrain.jsx's place() is `placeAtHit(h, { post: worker.postMessage, playPlace })`, so these drive the real
// executor against the real store, with the worker's postMessage captured. Every block a player can select has to be
// obtainable, or its slot is a button that only ever refuses; the storage chest is the case that broke.
//
// WHAT THIS DOES NOT CHECK: the build ray, the verb router and the worker's remesh (tests/e2e/the-cut.spec.js places
// through a real right-click), or that Terrain.jsx still calls placeAtHit (the same e2e).
//
// Mutation-Proof: see the commit trailer (each case below named by the mutant that reddens it).

let posted;
let notes;
// Never reset: the toast's throttle state is module-level and outlives each test.
let clock = 1e7;
const post = (msg) => posted.push(msg);
// A hit on the top face of the block under (10, 20, 10): the placed cell is 10_20_10.
const hitAt = (x = 10.5, z = 10.5) => ({ hitPoint: new THREE.Vector3(x, 20, z), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) });
const S = () => useGameStore.getState();
const withBlocks = (blocks) => useGameStore.setState((s) => ({ inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, ...blocks } } }));

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  posted = [];
  notes = [];
  // The denial toast is throttled to one a second on performance.now; each read here is 5 s on, so none is swallowed.
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState({ addNotification: (text, type) => notes.push({ text, type }), worldBlocks: new Map(), chests: new Map() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('placeAtHit spends the block it places', () => {
  it('one placement debits one, sends one voxel edit and records the cell', () => {
    useGameStore.setState({ selectedBlock: 'dirt' });
    withBlocks({ dirt: 3 });
    expect(placeAtHit(hitAt(), { post }), 'the placement placed nothing').toBe(1);
    expect(S().inventory.blocks.dirt, 'the placement did not debit exactly one').toBe(2);
    expect(posted, 'the worker was not sent exactly one edit').toHaveLength(1);
    expect(posted[0].payload, 'the edit is not the dirt voxel at the aimed cell').toMatchObject({
      x: 10 - Math.floor(10 / CHUNK_SIZE) * CHUNK_SIZE, y: 20, z: 10 - Math.floor(10 / CHUNK_SIZE) * CHUNK_SIZE, blockType: 2,
    });
    expect(S().worldBlocks.get('10_20_10'), 'the store did not record the placed cell').toBe(2);
    expect(notes, 'a successful placement raised a notice').toEqual([]);
  });

  it('an empty stack is refused: nothing debited, sent or recorded, and the player is told why', () => {
    useGameStore.setState({ selectedBlock: 'dirt' });
    withBlocks({ dirt: 0 });
    expect(placeAtHit(hitAt(), { post })).toBe(0);
    expect(posted, 'a refused placement reached the worker').toEqual([]);
    expect(S().worldBlocks.size, 'a refused placement changed the world').toBe(0);
    expect(S().inventory.blocks.dirt, 'a refused placement moved the stack').toBe(0);
    expect(notes, 'the refusal was silent').toEqual([{ text: 'No Dirt left', type: 'warn' }]);
  });

  it('a block made by crafting says where more comes from', () => {
    useGameStore.setState({ selectedBlock: 'chest' });
    withBlocks({ chest: 0 });
    expect(placeAtHit(hitAt(), { post })).toBe(0);
    expect(notes.map((n) => n.text), 'the refusal of a crafted block does not point at crafting').toEqual(['No Wooden Chest left — craft more in Crafting']);
  });

  it('a footprint the stack cannot cover places what it affords and debits exactly that', () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'cube', buildSize: 3 });
    withBlocks({ stone: 5 });
    expect(placeAtHit(hitAt(), { post }), 'a part-affordable footprint placed the wrong count').toBe(5);
    expect(S().inventory.blocks.stone, 'the debit did not floor at zero').toBe(0);
    expect(posted, 'the worker got more edits than the blocks paid for').toHaveLength(5);
    expect(S().worldBlocks.size, 'the store recorded more cells than were paid for').toBe(5);
    expect(notes, 'a placement that placed something raised a refusal').toEqual([]);
  });

  // EMBER (DECISIONS 2026-10-28 W1-H item 5): building by day fills the ember bar, once per placement action, under the
  // day's allowance (game/ember.js); the store applies the day and the cap, this proves the executor asks it to.
  it('a day placement adds PLACE_GAIN ember once per action, a footprint included; a night or refused one adds none', () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'cube', buildSize: 3, isDay: true, nightCount: 1, ember: 0 });
    withBlocks({ stone: 30 });
    expect(placeAtHit(hitAt(), { post }), 'SETUP: the footprint placed one cell or none').toBeGreaterThan(1);
    expect(S().ember, 'a day placement did not add PLACE_GAIN once').toBe(PLACE_GAIN);
    useGameStore.setState({ isDay: false, buildingMode: 'single' });
    expect(placeAtHit(hitAt(12.5, 12.5), { post }), 'SETUP: the night placement placed nothing').toBe(1);
    expect(S().ember, 'a night placement added ember').toBe(PLACE_GAIN);
    useGameStore.setState({ isDay: true });
    withBlocks({ stone: 0 });
    expect(placeAtHit(hitAt(14.5, 14.5), { post })).toBe(0);
    expect(S().ember, 'a refused placement added ember').toBe(PLACE_GAIN);
  });

  it('a chest places as one cell at the aimed cell in any build mode, and that cell is its storage chest', () => {
    useGameStore.setState({ selectedBlock: 'chest', buildingMode: 'floor', buildSize: 3 });
    withBlocks({ chest: 9 });
    expect(placeAtHit(hitAt(), { post }), 'a chest placed more than one cell').toBe(1);
    expect(S().inventory.blocks.chest, 'a chest placement spent more than one chest').toBe(8);
    expect([...S().worldBlocks.keys()], 'the chest voxel is not at the aimed cell').toEqual(['10_20_10']);
    expect([...S().chests.keys()], 'the storage chest is not the placed cell').toEqual(['10_20_10']);
  });
});

describe('every hotbar block can be had, so no slot only ever refuses', () => {
  const START = useGameStore.getInitialState().inventory.blocks;
  const CRAFTED = new Set(RECIPES.flatMap((r) => Object.keys(r.output)));
  // The ores are the generated blocks that start at 0; each drops itself when mined (ore-drop-gates).
  const ORE_DROPS = new Set([10, 11, 12, 13].map(blockForId));

  it.each(HOTBAR_BLOCKS)('%s: in the starting loadout, a recipe output, or an ore drop', (block) => {
    const sources = { start: (START[block] || 0) > 0, crafted: CRAFTED.has(block), mined: ORE_DROPS.has(block) };
    expect(Object.values(sources).some(Boolean), `${block} has no source a player can reach: ${JSON.stringify(sources)}`).toBe(true);
  });

  it('checks the whole hotbar', () => {
    expect(HOTBAR_BLOCKS.length, 'the hotbar shrank; this gate checks fewer slots').toBeGreaterThanOrEqual(9);
    expect(ORE_DROPS, 'SETUP: the ore ids no longer resolve to ore blocks').toEqual(new Set(['coal', 'iron', 'gold', 'diamond']));
  });

  it('a fresh profile crafts a Wooden Chest from its starting wood, and placing it makes a storage chest', () => {
    useGameStore.setState({ selectedBlock: 'wood' });
    const wood = S().inventory.blocks.wood;
    expect(wood, 'SETUP: the starting loadout cannot pay for a chest').toBeGreaterThanOrEqual(8);
    const { container } = render(<CraftingTable onClose={() => {}} />);
    const cells = container.querySelector('.bg-well').children;
    expect(cells.length, 'SETUP: the crafting grid did not render').toBe(9);
    [0, 1, 2, 3, 5, 6, 7, 8].forEach((i) => fireEvent.click(cells[i]));
    fireEvent.click(container.querySelector('.h-24').parentElement);
    expect(S().inventory.blocks.chest, 'eight wood in a ring crafted no chest').toBe(1);
    expect(S().inventory.blocks.wood, 'the chest did not cost eight wood').toBe(wood - 8);
    cleanup();

    useGameStore.setState({ selectedBlock: 'chest' });
    expect(placeAtHit(hitAt(), { post }), 'the crafted chest could not be placed').toBe(1);
    expect(S().inventory.blocks.chest, 'placing the chest did not spend it').toBe(0);
    expect(S().chests.get('10_20_10'), 'placing a chest made no storage chest').toEqual({ inventory: {}, name: 'Wooden Chest' });
  });

  it('a fresh profile crafts Cobblestone from its starting stone', () => {
    useGameStore.setState({ selectedBlock: 'stone' });
    const stone = S().inventory.blocks.stone;
    const { container } = render(<CraftingTable onClose={() => {}} />);
    fireEvent.click(container.querySelector('.bg-well').children[4]);
    fireEvent.click(container.querySelector('.h-24').parentElement);
    expect(S().inventory.blocks.cobblestone, 'one stone crafted no cobblestone').toBe(1);
    expect(S().inventory.blocks.stone, 'the cobblestone did not cost one stone').toBe(stone - 1);
  });
});
