// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { routeMouseVerb } from '../../src/input/verbRouter.js';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { createPlacedCellColliders, createEditSeq } from '../../src/world/placedCellColliders.js';
import { makeMobFloorProbe } from '../../src/world/mobFloorProbe.js';
import { generateMesh } from '../../src/world/mesher.js';
import { snapMob } from '../../src/game/localPath.js';

/**
 * A FORCED BLOCK AIMED AT A MOB'S FEET IS PLACED, AND THE MOB STANDS ON IT (registry QUEUE:Q26/b; DECISIONS 2026-11-01
 * (W3-A PR B) item 450).
 *
 * Held C changes the right click only where the build ray meets terrain at or beyond the aimed mob: nearer terrain
 * already places. So the block a forced click lays at a mob's feet goes into the cell the mob stands in. This drives what
 * happens through the functions the game calls: the router (input/verbRouter.js), the place executor (world/placeAtHit.js,
 * which refuses only the player's own capsule), the cuboid that holds a placed cell solid from the click
 * (world/placedCellColliders.js), and the snap AIWorkerSystem makes on the real mob floor probe (game/localPath.js
 * snapMob over world/mobFloorProbe.js), in a real Rapier world over the real mesher's ground, before the chunk re-meshes
 * (the cuboid) and after (the block in the trimesh).
 *
 * PRESENCE: before the block the same snap stands the mob on the ground, and without C the same click casts.
 * BLIND SPOT: the worker's own A* and the mob's render; the click's e2e is tests/e2e/build-placement.spec.js (a chest).
 */

const GROUND = 50;
const CELL = { x: 10, y: GROUND, z: 10 };
/** One chunk at (0, 0): stone to y 50, so the ground's top face is at 50; `extra` adds blocks. */
function chunk(extra = []) {
  const b = new Uint8Array(16 * 16 * 256);
  const set = (x, y, z) => { b[x + z * 16 + y * 256] = 1; };
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < GROUND; y++) set(x, y, z);
  for (const c of extra) set(c.x, c.y, c.z);
  return b;
}
function worldOf(blocks) {
  const w = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const m = generateMesh(0, 0, blocks);
  w.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(m.positions), new Uint32Array(m.indices)), w.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
  w.step();
  return w;
}
const topAt = () => GROUND;
/** A husk standing in the cell, its first snap taken (so it has a footing, as a mob in the world does). */
function husk(probe) {
  const e = { type: 'zombie', position: { x: CELL.x + 0.5, y: GROUND + 0.5, z: CELL.z + 0.5 } };
  snapMob(e, probe, topAt, 0);
  return e;
}

let notes;
let clock = 1e7;
beforeAll(async () => {
  await RAPIER.init();
});
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  notes = [];
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
  useGameStore.setState((s) => ({
    addNotification: (text, type) => notes.push({ text, type }), worldBlocks: new Map(), chests: new Map(),
    selectedBlock: 'dirt', inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, dirt: 3 } },
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('held C at a mob\'s feet', () => {
  it('routes to a placement, lays the block in the mob\'s cell, and the mob\'s next snap stands it on the block', async () => {
    // The player 3 m from the husk, eye 1.4 m over the ground, aiming at the ground under the husk's feet: the build ray
    // passes through the husk (mobs have no collider) and meets the ground beyond its centre.
    const eye = new THREE.Vector3(CELL.x + 0.5, GROUND + 1.4, CELL.z + 3.5);
    const hitPoint = new THREE.Vector3(CELL.x + 0.5, GROUND, CELL.z + 0.5);
    const ctx = { held: false, meleeHit: false, chestTargeted: false, chestHasItems: false,
      aimedMobDist: eye.distanceTo(new THREE.Vector3(CELL.x + 0.5, GROUND + 0.9, CELL.z + 0.5)), terrainDist: eye.distanceTo(hitPoint) };
    expect(ctx.terrainDist, 'SETUP: the ground is not beyond the husk along the aim').toBeGreaterThan(ctx.aimedMobDist);
    expect(routeMouseVerb(2, ctx), 'SETUP: without C the click at the husk is not a cast').toBe('cast');
    expect(routeMouseVerb(2, { ...ctx, forcePlace: true }), 'held C at the husk\'s feet was not a placement').toBe('place');

    const world = worldOf(chunk());
    const probe = makeMobFloorProbe(RAPIER, world);
    const e = husk(probe);
    expect(e.position.y, 'SETUP: before the block the husk does not stand on the ground').toBeCloseTo(GROUND + 0.5, 3);

    const solid = createPlacedCellColliders(world, RAPIER, createEditSeq());
    const edits = [];
    const placed = await placeAtHit({ hitPoint, normal: { x: 0, y: 1, z: 0 }, direction: hitPoint.clone().sub(eye).normalize() },
      { editCells: (edit, done) => { edits.push(edit); done(edit.cells.map((_, i) => i)); }, cells: solid });
    expect(placed, `the forced block at the husk's feet was refused: ${JSON.stringify(notes)}`).toBe(1);
    expect(edits.flatMap((ed) => ed.cells.map((c) => `${c.x}_${c.y}_${c.z}`)), 'the block did not go into the husk\'s cell').toEqual([`${CELL.x}_${CELL.y}_${CELL.z}`]);
    expect(notes, 'the placement raised a refusal').toEqual([]);

    // The frames before the chunk re-meshes: the cell is the click's cuboid, indexed by the next world step.
    world.step();
    expect(snapMob(e, probe, topAt, 0), 'the husk\'s snap was refused on its own column').toBe(false);
    expect(e.position.y, 'the husk did not stand on the block while it was the click\'s cuboid').toBeCloseTo(GROUND + 1.5, 3);

    // After the re-mesh: the block is in the chunk's trimesh and the cuboid is gone.
    const meshed = worldOf(chunk([CELL]));
    const e2 = { type: 'zombie', position: { x: CELL.x + 0.5, y: GROUND + 0.5, z: CELL.z + 0.5 }, footX: CELL.x + 0.5, footZ: CELL.z + 0.5 };
    expect(snapMob(e2, makeMobFloorProbe(RAPIER, meshed), topAt, 0), 'the husk\'s snap was refused once the block was meshed').toBe(false);
    expect(e2.position.y, 'the husk did not stand on the block once it was meshed').toBeCloseTo(GROUND + 1.5, 3);
  });
});
