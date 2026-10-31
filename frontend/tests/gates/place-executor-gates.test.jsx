// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks.js';
import { GOODS, forgeOffers } from '../../src/game/forge.js';
import { blockForId } from '../../src/world/blockIds.js';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../src/world/chunkLayout.js';
import { PLACE_GAIN } from '../../src/game/ember.js';

// THE PLACE VERB, THROUGH THE FUNCTION THE VERB ROUTER CALLS (DECISIONS 2026-10-28 W1-H item 4: every placement spends
// a block). Terrain.jsx's place() is placeAtHit with the worker's batched edit (world/cellEdits.js), so these drive the
// real executor against the real store with that edit answered here: `emptyWorld` fills every cell it is sent, and
// `occupied` refuses the cells it names, as the worker refuses a cell that holds a block (DECISIONS 2026-10-31 item 230).
// Every block a player can select has to be obtainable, or its slot is a button that only ever refuses; the storage chest
// is the case that broke.
//
// WHAT THIS DOES NOT CHECK: the build ray, the verb router and the worker itself (tests/gates/build-tools-worker-gates.test.js
// drives the real worker; tests/e2e/the-cut.spec.js places through a real right-click), or that Terrain.jsx still calls
// placeAtHit (the same e2e).
//
// Mutation-Proof: see the commit trailer (each case below named by the mutant that reddens it).

let posted;
let notes;
// Never reset: the toast's throttle state is module-level and outlives each test.
let clock = 1e7;
const post = (msg) => posted.push(msg);
/** The worker answering a batched edit: it fills each cell it is sent except those `refuse` names (`x_y_z`). */
const answering = (refuse = []) => (edit, done) => {
  posted.push({ type: 'edit_cells', payload: edit });
  done(edit.cells.flatMap((c, i) => (refuse.includes(`${c.x}_${c.y}_${c.z}`) ? [] : [i])));
};
const emptyWorld = () => ({ post, editCells: answering() });
const occupied = (...refuse) => ({ post, editCells: answering(refuse) });
/** Every cell the verb sent the worker, by either message, as `{ x, y, z, blockType }` in world cells. */
const sentCells = () => posted.flatMap((m) => (m.type === 'edit_cells'
  ? m.payload.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, blockType: m.payload.blockType }))
  : [{ x: m.payload.cx * CHUNK_SIZE + m.payload.x, y: m.payload.y, z: m.payload.cz * CHUNK_SIZE + m.payload.z, blockType: m.payload.blockType }]));
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
  it('one placement debits one, sends one voxel edit and records the cell', async () => {
    useGameStore.setState({ selectedBlock: 'dirt' });
    withBlocks({ dirt: 3 });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'the placement placed nothing').toBe(1);
    expect(S().inventory.blocks.dirt, 'the placement did not debit exactly one').toBe(2);
    expect(sentCells(), 'the worker was not sent exactly the dirt voxel at the aimed cell').toEqual([{ x: 10, y: 20, z: 10, blockType: 2 }]);
    expect(S().worldBlocks.get('10_20_10'), 'the store did not record the placed cell').toBe(2);
    expect(notes, 'a successful placement raised a notice').toEqual([]);
  });

  it('an empty stack is refused: nothing debited, sent or recorded, and the player is told why', async () => {
    useGameStore.setState({ selectedBlock: 'dirt' });
    withBlocks({ dirt: 0 });
    expect(await placeAtHit(hitAt(), emptyWorld())).toBe(0);
    expect(posted, 'a refused placement reached the worker').toEqual([]);
    expect(S().worldBlocks.size, 'a refused placement changed the world').toBe(0);
    expect(S().inventory.blocks.dirt, 'a refused placement moved the stack').toBe(0);
    expect(notes, 'the refusal was silent').toEqual([{ text: 'No Dirt left', type: 'warn' }]);
  });

  it('a block only the Forge makes says where more comes from', async () => {
    useGameStore.setState({ selectedBlock: 'chest' });
    withBlocks({ chest: 0 });
    expect(await placeAtHit(hitAt(), emptyWorld())).toBe(0);
    expect(notes.map((n) => n.text), 'the refusal of a forged block does not point at the Forge').toEqual(['No Wooden Chest left — Mara\'s Forge makes more']);
  });

  it('a footprint the stack cannot cover places what it affords and debits exactly that', async () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'cube', buildSize: 3 });
    withBlocks({ stone: 5 });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'a part-affordable footprint placed the wrong count').toBe(5);
    expect(S().inventory.blocks.stone, 'the debit did not floor at zero').toBe(0);
    expect(sentCells(), 'the worker got more edits than the blocks paid for').toHaveLength(5);
    expect(S().worldBlocks.size, 'the store recorded more cells than were paid for').toBe(5);
    expect(notes, 'a placement that placed something raised a refusal').toEqual([]);
  });

  // EMBER (DECISIONS 2026-10-28 W1-H item 5): building by day fills the ember bar, once per placement action, under the
  // day's allowance (game/ember.js); the store applies the day and the cap, this proves the executor asks it to.
  it('a day placement adds PLACE_GAIN ember once per action, a footprint included; a night or refused one adds none', async () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'cube', buildSize: 3, isDay: true, nightCount: 1, ember: 0 });
    withBlocks({ stone: 30 });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'SETUP: the footprint placed one cell or none').toBeGreaterThan(1);
    expect(S().ember, 'a day placement did not add PLACE_GAIN once').toBe(PLACE_GAIN);
    useGameStore.setState({ isDay: false, buildingMode: 'single' });
    expect(await placeAtHit(hitAt(12.5, 12.5), emptyWorld()), 'SETUP: the night placement placed nothing').toBe(1);
    expect(S().ember, 'a night placement added ember').toBe(PLACE_GAIN);
    useGameStore.setState({ isDay: true });
    withBlocks({ stone: 0 });
    expect(await placeAtHit(hitAt(14.5, 14.5), emptyWorld())).toBe(0);
    expect(S().ember, 'a refused placement added ember').toBe(PLACE_GAIN);
    withBlocks({ stone: 4 });
    expect(await placeAtHit(hitAt(16.5, 16.5), occupied('16_20_16')), 'a cell the worker refused was counted as placed').toBe(0);
    expect(S().ember, 'a refused or unfilled placement added ember').toBe(PLACE_GAIN);
  });

  it('a chest places as one cell at the aimed cell in any build mode, and that cell is its storage chest', async () => {
    useGameStore.setState({ selectedBlock: 'chest', buildingMode: 'floor', buildSize: 3 });
    withBlocks({ chest: 9 });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'a chest placed more than one cell').toBe(1);
    expect(S().inventory.blocks.chest, 'a chest placement spent more than one chest').toBe(8);
    expect([...S().worldBlocks.keys()], 'the chest voxel is not at the aimed cell').toEqual(['10_20_10']);
    expect([...S().chests.keys()], 'the storage chest is not the placed cell').toEqual(['10_20_10']);
  });
});

// WHAT THE WORKER DID NOT FILL IS NOT PAID FOR (DECISIONS 2026-10-31 items 230-231; registry
// AUDIT:numeric:footprint-overwrites-solid-cells, AUDIT:numeric:place-above-world-ceiling-swallows-block).
describe('placeAtHit pays and records only the cells the worker filled, and never sends one it cannot', () => {
  // A hit on the top face of a block at y 255, the world's highest cell: the cell it names is y 256, outside the world.
  const ceilingHit = () => ({ hitPoint: new THREE.Vector3(10.5, CHUNK_HEIGHT, 10.5), normal: { x: 0, y: 1, z: 0 }, direction: new THREE.Vector3(0, -1, 0) });
  // A hit on the +x side face of a block at (9, 253, 10): the aimed cell is 10_253_10, three cells under the world's top.
  const nearTopSideHit = () => ({ hitPoint: new THREE.Vector3(10, CHUNK_HEIGHT - 2.5, 10.5), normal: { x: 1, y: 0, z: 0 }, direction: new THREE.Vector3(-1, 0, 0) });

  it('a placement above the world places nothing, spends nothing, sends nothing and says why', async () => {
    useGameStore.setState({ selectedBlock: 'stone', isDay: true, nightCount: 1, ember: 0 });
    withBlocks({ stone: 4 });
    const placed = { n: 0 };
    useGameStore.setState({ onBlockPlace: () => { placed.n++; } });
    expect(await placeAtHit(ceilingHit(), emptyWorld()), 'a cell above the world was placed').toBe(0);
    expect(S().inventory.blocks.stone, 'a placement above the world spent a block').toBe(4);
    expect(sentCells(), 'a cell above the world reached the worker').toEqual([]);
    expect(S().worldBlocks.size, 'a cell above the world was recorded').toBe(0);
    expect({ ember: S().ember, credited: placed.n }, 'a placement above the world paid ember or a Master Builder count').toEqual({ ember: 0, credited: 0 });
    expect(notes, 'the refusal above the world was silent, or did not say why').toEqual([{ text: 'No room: the world ends there', type: 'warn' }]);
  });

  it('a wall run past the world\'s top places, pays and records only the cells inside it', async () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'wall', buildSize: 6 });
    withBlocks({ stone: 10 });
    expect(await placeAtHit(nearTopSideHit(), emptyWorld()), 'the wall did not stop at the world\'s top').toBe(3);
    expect(S().inventory.blocks.stone, 'the cells above the world were paid for').toBe(7);
    expect(sentCells().map((c) => c.y), 'a cell above the world reached the worker').toEqual([253, 254, 255]);
    expect([...S().worldBlocks.keys()].sort(), 'a cell above the world was recorded').toEqual(['10_253_10', '10_254_10', '10_255_10']);
    expect(notes, 'the cells held back above the world were silent, or not said why').toEqual([{ text: 'No room: the world ends there', type: 'warn' }]);
  });

  it('the cells the worker refused are paid back and not recorded, and the player is told', async () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'floor', buildSize: 3 });
    withBlocks({ stone: 20 });
    const refuse = ['9_20_9', '10_20_9', '11_20_9'];
    expect(await placeAtHit(hitAt(), occupied(...refuse)), 'the count is not the cells the worker filled').toBe(6);
    expect(sentCells(), 'SETUP: the floor did not send its nine cells').toHaveLength(9);
    expect(S().inventory.blocks.stone, 'the refused cells were not paid back').toBe(14);
    expect([...S().worldBlocks.keys()].filter((k) => refuse.includes(k)), 'a refused cell was recorded as placed').toEqual([]);
    expect(S().worldBlocks.size, 'the filled cells were not all recorded').toBe(6);
    expect(notes, 'the cells the worker refused were held back in silence, or not said why').toEqual([{ text: 'No room: a block is already there', type: 'warn' }]);
  });

  it('a chest the worker refuses is no storage chest and is paid back', async () => {
    useGameStore.setState({ selectedBlock: 'chest' });
    withBlocks({ chest: 1 });
    expect(await placeAtHit(hitAt(), occupied('10_20_10'))).toBe(0);
    expect(S().inventory.blocks.chest, 'the refused chest was not paid back').toBe(1);
    expect(S().chests.size, 'a refused chest became a storage chest').toBe(0);
  });

  it('a footprint never sends a chest\'s cell or a block the player built, and places the rest', async () => {
    useGameStore.setState({ selectedBlock: 'stone', buildingMode: 'floor', buildSize: 3,
      chests: new Map([['9_20_10', { inventory: { gold: 1 }, name: 'Wooden Chest' }]]), worldBlocks: new Map([['9_20_10', 6], ['11_20_10', 14]]) });
    withBlocks({ stone: 20 });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'the floor did not place round the chest and the built block').toBe(7);
    expect(sentCells().map((c) => `${c.x}_${c.y}_${c.z}`).filter((k) => k === '9_20_10' || k === '11_20_10'), 'a chest\'s or a built block\'s cell reached the worker').toEqual([]);
    expect(S().inventory.blocks.stone, 'the held-back cells were paid for').toBe(13);
    expect(S().worldBlocks.get('9_20_10'), 'the chest\'s cell was overwritten in the record').toBe(6);
    expect(S().worldBlocks.get('11_20_10'), 'the built block was overwritten in the record').toBe(14);
  });
});

describe('every hotbar block can be had, so no slot only ever refuses', () => {
  const START = useGameStore.getInitialState().inventory.blocks;
  // The blocks only Mara's Forge makes, each with the blocks its price takes.
  const FORGED = new Map(GOODS.map((g) => [g.give, Object.keys(g.price.blocks)]));
  // The ores are the generated blocks that start at 0; each drops itself when mined (ore-drop-gates).
  const ORE_DROPS = new Set([10, 11, 12, 13].map(blockForId));
  // A source that needs no Forge: the starting loadout or an ore drop.
  const rawSource = (block) => (START[block] || 0) > 0 || ORE_DROPS.has(block);

  it.each(HOTBAR_BLOCKS)('%s: in the starting loadout, an ore drop, or a Forge good whose price is itself had', (block) => {
    const price = FORGED.get(block);
    const sources = { start: (START[block] || 0) > 0, mined: ORE_DROPS.has(block), forged: !!price && price.every(rawSource) };
    expect(Object.values(sources).some(Boolean), `${block} has no source a player can reach: ${JSON.stringify({ ...sources, price })}`).toBe(true);
  });

  it('checks the whole hotbar', () => {
    expect(HOTBAR_BLOCKS.length, 'the hotbar shrank; this gate checks fewer slots').toBeGreaterThanOrEqual(9);
    expect(ORE_DROPS, 'SETUP: the ore ids no longer resolve to ore blocks').toEqual(new Set(['coal', 'iron', 'gold', 'diamond']));
    expect(HOTBAR_BLOCKS.filter((b) => !rawSource(b)), 'SETUP: the Forge is the only source of no hotbar block, so its branch is unexamined').not.toEqual([]);
  });

  it('a fresh profile buys a Wooden Chest at the Forge with its starting wood, and placing it makes a storage chest', async () => {
    const wood = S().inventory.blocks.wood;
    const offer = forgeOffers(S()).find((o) => o.id === 'goods:chest');
    expect(offer, 'the Forge lists no chest').toBeTruthy();
    expect(S().buyForgeOffer(offer).ok, 'the starting loadout could not pay for a chest').toBe(true);
    expect(S().inventory.blocks.chest, 'the purchase gave no chest').toBe(1);
    expect(S().inventory.blocks.wood, 'the chest did not cost eight wood').toBe(wood - 8);

    useGameStore.setState({ selectedBlock: 'chest' });
    expect(await placeAtHit(hitAt(), emptyWorld()), 'the forged chest could not be placed').toBe(1);
    expect(S().inventory.blocks.chest, 'placing the chest did not spend it').toBe(0);
    expect(S().chests.get('10_20_10'), 'placing a chest made no storage chest').toEqual({ inventory: {}, name: 'Wooden Chest' });
  });

  it('a fresh profile buys four Cobblestone with four of its starting stone', () => {
    const stone = S().inventory.blocks.stone;
    expect(S().buyForgeOffer(forgeOffers(S()).find((o) => o.id === 'goods:cobblestone')).ok).toBe(true);
    expect(S().inventory.blocks.cobblestone, 'four stone bought no cobblestone').toBe(4);
    expect(S().inventory.blocks.stone, 'the cobblestone did not cost four stone').toBe(stone - 4);
  });
});
