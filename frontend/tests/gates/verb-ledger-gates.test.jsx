// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import React, { Suspense } from 'react';
import * as THREE from 'three';

/**
 * THE VERB LEDGER: every player verb pays, counts and sounds what the world's owner says it did, not what the click asked.
 *
 * The terrain worker owns the voxels; a click only asks. Paid at the click, a mine clicked twice before the worker
 * answered (the trimesh is rebuilt a few milliseconds later, so the second ray meets the old face) played the break sound
 * twice and counted twice toward Miner and Deep Digger for one block (registry AUDIT:numeric:mine-credit-paid-by-click-
 * not-break); an empty chest mined came back as one wood, not the chest the Forge sold for eight
 * (AUDIT:numeric:empty-chest-pickup-returns-wood); the dragon's smash, which no player asks for, paid its blocks into the
 * bag, aimed at the air above the ground and took a chest's wood (AUDIT:numeric:dragon-crater-pays-player-and-aims-at-air);
 * and for the 2 s debris tumbles, its dynamic bodies caught the build ray, so the next click mined the empty cell they lay
 * in (AUDIT:verbs:debris-colliders-catch-mine-rays).
 *
 * Mounted: the real MinecraftWorld (world/Terrain.jsx) through R3F's own reconciler under the real <Physics> of
 * @react-three/rapier 2.2 (its ESM build, so it shares the reconciler), with the real BlockParticleSystem, the real
 * castBuildRay, castWorldRay, ground probe and target outline, the real mine and place verbs, and the real quest hook. The
 * real terrain worker runs in this process; its replies are delivered when the test pumps them, so a click before the pump
 * is a click inside the window between the click and the worker's answer. Clicks are routed by the real verb router as
 * Components.jsx performVerb routes them with no mob in reach. Each row compares what the player got against what the
 * worker reported in the same run:
 *  - a mine clicked twice before the worker answers is one break: one block, one count, one sound;
 *  - every block the hotbar holds and every good the Forge sells, placed and mined, comes back as itself;
 *  - the dragon's smash breaks only blocks (never the air above them, never a chest) and pays, counts and sounds nothing;
 *  - for 120 frames of debris over the aimed cell, the build ray, the outline, the anvil ray and the ground probe all see
 *    the terrain, while a ray that does not exclude dynamic bodies sees the debris (the instrument's presence check).
 *
 * WHAT THIS DOES NOT CHECK: the Player loop's own queries (the ledge vault's rays and the controller's sweep:
 * tests/gates/player-debris-gates.test.jsx), a real browser's worker timing (the window is made by the pump), the Delete
 * Tool's batched removal (tests/gates/terrain-quest-callback-gates.test.js), and sound mixing.
 *
 * Mutation-Proof: see the commit trailer.
 */

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('@react-three/rapier', () => import('@react-three/rapier/dist/react-three-rapier.esm.js'));
vi.mock('@react-three/drei', () => import('@react-three/drei/index.js'));
const H = vi.hoisted(() => ({ live: null, inbox: [], breaks: [], places: 0, rapier: null }));
vi.mock('../../src/world/terrain.worker.js?worker', () => ({
  default: class FakeTerrainWorker {
    constructor() { H.live = this; this.listeners = new Set(); }
    postMessage(m) { H.inbox.push(m); }
    addEventListener(t, fn) { if (t === 'message') this.listeners.add(fn); }
    removeEventListener(t, fn) { this.listeners.delete(fn); }
    terminate() {}
  },
}));
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playBlockPlace: () => { H.places++; }, playBlockBreak: (pos) => { H.breaks.push(pos); } }),
}));
vi.mock('../../src/OptimizedGrassSystem', () => ({ OptimizedGrassSystem: () => null, GrassWindDriver: () => null }));
vi.mock('../../src/render/HubRender', () => ({ HubRender: () => null }));

// The worker answers through `self`, so `self` is its stand-in only while it runs (Rapier's glue reads `performance` there).
const replies = [];
let workerOnMessage = null;
const workerSelf = {
  postMessage: (m) => replies.push(m),
  set onmessage(fn) { workerOnMessage = fn; }, get onmessage() { return workerOnMessage; },
  performance: globalThis.performance,
};
function asWorker(fn) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { value: workerSelf, configurable: true, writable: true });
  try { return fn(); } finally { if (prev) Object.defineProperty(globalThis, 'self', prev); else delete globalThis.self; }
}

// One chunk is streamed; the rest of the streamer's requests are dropped.
const CX = 3, CZ = -2;
let act, r, GameMethods, store, S, routeMouseVerb, HOTBAR_BLOCKS, GOODS, destroyVoxelsInRadius, setActive, blockForId, RAPIER;

beforeAll(async () => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { value: workerSelf, configurable: true, writable: true });
  try { await import('../../src/world/terrain.worker.js'); } finally { if (prev) Object.defineProperty(globalThis, 'self', prev); else delete globalThis.self; }
  ({ act } = await import('@react-three/fiber'));
  const { Physics, useRapier } = await import('@react-three/rapier');
  ({ GameMethods } = await import('../../src/GameMethods'));
  ({ useGameStore: store } = await import('../../src/store/useGameStore.jsx'));
  S = () => store.getState();
  ({ blockForId } = await import('../../src/world/blockIds.js'));
  ({ routeMouseVerb } = await import('../../src/input/verbRouter.js'));
  ({ HOTBAR_BLOCKS } = await import('../../src/world/Blocks.js'));
  ({ GOODS } = await import('../../src/game/forge.js'));
  ({ destroyVoxelsInRadius } = await import('../../src/world/bossSmash.js'));
  ({ setActive } = await import('../../src/input/inputState.js'));
  const { MinecraftWorld } = await import('../../src/world/Terrain.jsx');
  const { useQuestSystem } = await import('../../src/QuestSystem.jsx');
  const { mountR3F } = await import('./_r3f.jsx');
  function RapierProbe() { H.rapier = useRapier(); return null; }
  function QuestProbe() { useQuestSystem(); return null; }
  store.setState({ addNotification: () => {} });
  r = await mountR3F(
    <Suspense fallback={null}>
      <Physics gravity={[0, -30, 0]}><RapierProbe /><MinecraftWorld /></Physics>
      <QuestProbe />
    </Suspense>,
  );
  for (let i = 0; i < 400 && !(typeof GameMethods.castBuildRay === 'function' && H.rapier); i++) {
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
  }
  expect(typeof GameMethods.castBuildRay, 'SETUP: MinecraftWorld did not register its build ray').toBe('function');
  expect(typeof S().onBlockBreak, 'SETUP: the quest hook did not register onBlockBreak').toBe('function');
  RAPIER = H.rapier.rapier;
  H.live.postMessage({ type: 'generate', payload: { cx: CX, cz: CZ } });
  await pump();
  await r.step(2);
  expect(topAt(CX * 16 + 8, CZ * 16 + 8), 'SETUP: the chunk\'s trimesh is not in the world').not.toBeNull();
  SITES = openColumns(4);
  expect(SITES.length, 'SETUP: the chunk has fewer than four open columns four apart').toBe(4);
});
afterAll(async () => { setActive(false); await r?.unmount(); });

/** The worker's queued messages, delivered in order, each reply dispatched to every listener inside act. */
async function pump() {
  const out = [];
  while (H.inbox.length) {
    const m = H.inbox.shift();
    if (m.type === 'generate' && !(m.payload.cx === CX && m.payload.cz === CZ)) continue;
    const rs = asWorker(() => { workerOnMessage({ data: m }); return replies.splice(0); });
    out.push(...rs);
    await act(async () => { for (const rep of rs) for (const fn of [...H.live.listeners]) fn({ data: rep }); });
  }
  return out;
}
/** The world's answer, then a step so the rebuilt trimesh is in the broad phase. */
async function land() { const rs = await pump(); await r.step(1); return rs; }

const world = () => H.rapier.world;
/** The top face of column (x, z), from the fixed colliders only, so this instrument never sees debris. */
function topAt(x, z) {
  const hit = world().castRay(new RAPIER.Ray({ x: x + 0.5, y: 250, z: z + 0.5 }, { x: 0, y: -1, z: 0 }), 300, true,
    RAPIER.QueryFilterFlags.ONLY_FIXED);
  return hit ? Math.round(250 - hit.timeOfImpact) : null;
}
const camera = () => r.three().camera;
function aim(eye, at) {
  camera().position.set(...eye);
  camera().lookAt(...at);
  camera().updateMatrixWorld(true);
}
/** One click as Components.jsx performVerb makes it with no mob in reach: the build ray, the router, the verb. */
async function click(button) {
  let hit, verb;
  await act(async () => {
    hit = GameMethods.castBuildRay();
    verb = routeMouseVerb(button, {
      held: false, meleeHit: false, aimedMobDist: Infinity,
      terrainDist: hit ? hit.toi : Infinity, chestTargeted: !!hit?.chestTargeted, chestHasItems: !!hit?.chestHasItems,
    });
    if (verb === 'mine') GameMethods.terrainVerbs.mine(hit);
    else if (verb === 'place') GameMethods.terrainVerbs.place(hit);
  });
  return { verb, cell: hit ? hit.targetCoords : null };
}
const read = () => ({
  bag: { ...S().inventory.blocks },
  broken: S().questState?.stats?.blocks_broken ?? 0,
  placed: S().questState?.stats?.blocks_placed ?? 0,
  sounds: H.breaks.length,
});
const bagDelta = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])]
  .map((k) => [k, (b[k] || 0) - (a[k] || 0)]).filter(([, d]) => d !== 0));
const brokenIn = (rs) => rs.filter((m) => m.type === 'block_broken');

/** Columns in the chunk whose eight neighbours are no higher, at least four apart, so each row works on ground no other
 *  row has touched and a camera just above sees the top face. Chosen before any row edits the chunk. */
let SITES;
function openColumns(n) {
  const out = [];
  for (let x = CX * 16 + 2; x < CX * 16 + 14; x++) for (let z = CZ * 16 + 2; z < CZ * 16 + 14; z++) {
    if (out.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.z - z)) < 4)) continue;
    const t = topAt(x, z);
    let open = t != null;
    for (let dx = -1; dx <= 1 && open; dx++) for (let dz = -1; dz <= 1; dz++) if (topAt(x + dx, z + dz) > t) open = false;
    if (open) out.push({ x, z });
    if (out.length === n) return out;
  }
  return out;
}
// From above and a little behind, so the build ray meets the top face near its centre.
const aimAtTop = (c) => { const t = topAt(c.x, c.z); aim([c.x + 0.5, t + 2.5, c.z + 0.2], [c.x + 0.5, t, c.z + 0.5]); return t; };
const aimAtBlock = (c, y) => aim([c.x + 0.5, y + 3.5, c.z + 0.2], [c.x + 0.5, y + 1, c.z + 0.5]);

describe('a mine pays, counts and sounds the block the worker broke', () => {
  it('two clicks before the worker answers are one break: one block, one Miner count, one sound', async () => {
    const c = SITES[0];
    const top = aimAtTop(c);
    const b0 = read();
    const first = await click(0);
    const second = await click(0);
    expect([first.verb, second.verb], 'SETUP: a click on the ground did not route to mine').toEqual(['mine', 'mine']);
    expect(second.cell, 'SETUP: the second click did not land inside the window (it aimed at another cell)').toBe(first.cell);
    const rs = await land();
    const b1 = read();
    expect(brokenIn(rs).length, 'SETUP: the worker did not break exactly one block for the two clicks').toBe(1);
    const block = brokenIn(rs)[0].payload.blockType;
    expect({ broken: b1.broken - b0.broken, sounds: b1.sounds - b0.sounds, bag: bagDelta(b0.bag, b1.bag) },
      `two clicks on one block counted or sounded more than the one block the worker broke (top ${top})`)
      .toEqual({ broken: 1, sounds: 1, bag: { [blockForId(block)]: 1 } });

    // The control: once the answer has landed and the debris has gone (2 s), a click takes the next block and is paid.
    await r.step(125);
    const third = await click(0);
    expect(third.cell, 'SETUP: the rebuilt trimesh did not move the ray to the next block').not.toBe(first.cell);
    const rs3 = await land();
    const b2 = read();
    expect(brokenIn(rs3).length, 'SETUP: the control click broke nothing').toBe(1);
    expect({ broken: b2.broken - b1.broken, sounds: b2.sounds - b1.sounds }, 'a real break was not counted and heard once')
      .toEqual({ broken: 1, sounds: 1 });
  });

  it('every hotbar block and every Forge good, placed and mined, comes back as itself', async () => {
    const c = SITES[1];
    const kinds = [...new Set([...HOTBAR_BLOCKS, ...GOODS.map((g) => g.give)])];
    const out = {};
    for (const kind of kinds) {
      store.setState((s) => ({ selectedBlock: kind, buildingMode: 'single', buildSize: 1,
        inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, [kind]: (s.inventory.blocks[kind] || 0) + 1 } } }));
      const top = aimAtTop(c);
      const b0 = read();
      const place = await click(2);
      await land();
      const placedKey = `${c.x}_${top}_${c.z}`;
      aimAtBlock(c, top);
      const mine = await click(0);
      const rs = await land();
      // The mine's debris lives 2 s (120 frames): the next kind is placed once it is gone, so this row reads identity alone.
      await r.step(125);
      const b1 = read();
      out[kind] = {
        routed: `${place.verb}/${mine.verb}`, onPlaced: mine.cell === placedKey, cells: `${placedKey} ${mine.cell}`, broke: brokenIn(rs).length,
        net: bagDelta(b0.bag, b1.bag), counted: b1.broken - b0.broken, heard: b1.sounds - b0.sounds,
      };
    }
    expect(Object.keys(out).length, 'SETUP: the kinds round-tripped').toBe(9);
    const setup = Object.entries(out).filter(([, v]) => v.routed !== 'place/mine' || !v.onPlaced || v.broke !== 1);
    expect(setup, 'SETUP: a kind was not placed and then mined at the cell it was placed in').toEqual([]);
    const wrong = Object.entries(out).filter(([, v]) => Object.keys(v.net).length || v.counted !== 1 || v.heard !== 1);
    expect(wrong, 'a block placed and mined did not come back as itself, counted and heard once').toEqual([]);
  });
});

describe('the dragon\'s smash is a hazard: it breaks the ground under it and pays nobody', () => {
  it('breaks only solid blocks, never a chest, and pays, counts and sounds nothing', async () => {
    const c = SITES[2];
    // A chest the player placed on the next column, inside the strike.
    const chestAt = { x: c.x + 1, z: c.z };
    store.setState((s) => ({ selectedBlock: 'chest', buildingMode: 'single', buildSize: 1,
      inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, chest: 1 } } }));
    const chestTop = aimAtTop(chestAt);
    await click(2);
    await land();
    const chestKey = `${chestAt.x}_${chestTop}_${chestAt.z}`;
    expect(S().chests.has(chestKey), 'SETUP: the chest was not placed').toBe(true);

    const top = topAt(c.x, c.z);
    const b0 = read();
    H.inbox.length = 0;
    await act(async () => { destroyVoxelsInRadius(new THREE.Vector3(c.x + 0.5, top, c.z + 0.5), 2.5, 999); });
    const sent = H.inbox.filter((m) => m.type === 'update_block')
      .map((m) => `${m.payload.cx * 16 + m.payload.x}_${m.payload.y}_${m.payload.cz * 16 + m.payload.z}`);
    const rs = await land();
    const b1 = read();
    expect(sent.length, 'SETUP: the smash broke nothing').toBeGreaterThanOrEqual(9);
    expect(brokenIn(rs).length, `the smash aimed at cells holding no block (${sent.length} sent)`).toBe(sent.length);
    expect(sent.includes(chestKey), 'the smash took a chest\'s cell').toBe(false);
    expect({ chest: S().chests.has(chestKey), chestTop: topAt(chestAt.x, chestAt.z) }, 'the chest did not survive the smash')
      .toEqual({ chest: true, chestTop: chestTop + 1 });
    expect({ bag: bagDelta(b0.bag, b1.bag), broken: b1.broken - b0.broken, sounds: b1.sounds - b0.sounds },
      'the smash paid, counted or sounded a break').toEqual({ bag: {}, broken: 0, sounds: 0 });
  });
});
