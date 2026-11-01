import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { castBuildRay } from '../../src/world/buildRay.js';
import { placeAtHit } from '../../src/world/placeAtHit.js';
import { createPlacedCellColliders, createEditSeq } from '../../src/world/placedCellColliders.js';
import { generateMesh } from '../../src/world/mesher.js';
import { CHUNK_VOLUME, voxelIndex } from '../../src/world/chunkLayout.js';
import { BASE_CAPSULE } from '../../src/game/beasts.js';
import { EYE_HEIGHT_M } from '../../src/combat/swingOrigin.js';

/**
 * THE BUILD RAY SEES WHAT WAS MADE SINCE THE LAST WORLD STEP (src/world/buildRay.js, which Terrain.jsx hands the verbs as
 * GameMethods.castBuildRay).
 *
 * Rapier (rapier3d-compat 0.19.2) answers world.castRay from a broad-phase BVH that only a world step updates, so a cell's
 * stand-in cuboid placed by a click, and a chunk trimesh made by a React commit, are missed by every ray until the next
 * step. Two clicks between one pair of frames aimed the second through the first click's new cell (registry
 * REVIEW:fix-invisible-box:rays-before-step). With real Rapier, the real placeAtHit and the real placed-cell registry:
 *   - a right click on the ground, then a second build ray before any step, aims at the first click's cell, nearer than the
 *     ground; the world's own query in the same window still reads the ground (the window is open in the run);
 *   - a chunk's trimesh made since the last step (registry landed) in front of the ground is what the ray hits.
 * BLIND SPOT: the camera stands in for the Player's (a fixed eye over a still body); the mob floor probe
 * (world/mobFloorProbe.js) reads the world's query alone and is not changed here.
 */

beforeAll(async () => {
  await RAPIER.init();
});

const TOP = 30;
let world, body, cells, camera;
const initial = useGameStore.getInitialState();
beforeEach(() => {
  useGameStore.setState(initial, true);
  world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, TOP - 0.5, 0));
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.5, TOP + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05, 0.5));
  world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), body);
  world.step();
  cells = createPlacedCellColliders(world, RAPIER, createEditSeq());
  // The eye over the body, looking along -z and down at the ground 3 m ahead.
  const b = body.translation();
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  camera.position.set(b.x, b.y + EYE_HEIGHT_M, b.z);
  camera.lookAt(b.x, TOP, b.z - 3);
  camera.updateMatrixWorld();
  useGameStore.setState((s) => ({
    playerRigidBodyRef: { current: body }, addNotification: () => {}, worldBlocks: new Map(), chests: new Map(),
    selectedBlock: 'grass', buildingMode: 'single', buildSize: 1,
    inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, grass: 64 } },
  }));
});
afterEach(() => {
  useGameStore.setState(initial, true);
});

const cellOf = (h) => [h.targetedX, h.targetedY, h.targetedZ];
const worldQueryToi = () => {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  const hit = world.castRay(new RAPIER.Ray(camera.position, d), 8, true, undefined, undefined, undefined, body);
  return hit && hit.timeOfImpact;
};

describe('the build ray sees the cells and trimeshes made since the last world step', () => {
  it('two right clicks between one pair of frames: the second aims at the first click\'s new cell, not the ground behind it', () => {
    const first = castBuildRay(world, RAPIER, camera, cells.unindexed());
    expect(first, 'SETUP: the first build ray hit nothing').not.toBeNull();
    const edits = [];
    placeAtHit(first, { editCells: (edit) => edits.push(edit), cells });
    expect(edits.length, 'SETUP: the first click placed nothing').toBe(1);
    const placed = edits[0].cells[0];
    expect(cells.size(), 'SETUP: the placed cell has no stand-in').toBe(1);
    expect(worldQueryToi(), 'SETUP: the world\'s own query already sees the new cell, so the window is shut in this run').toBeCloseTo(first.toi, 3);
    const second = castBuildRay(world, RAPIER, camera, cells.unindexed());
    expect(second, 'the second build ray hit nothing').not.toBeNull();
    expect(cellOf(second), `the second click aimed past the first click's new cell (toi ${second.toi.toFixed(3)} against ${first.toi.toFixed(3)})`).toEqual([placed.x, placed.y, placed.z]);
    expect(second.toi, 'the second hit is not nearer than the ground').toBeLessThan(first.toi);
    // After the step the world's query sees the cell: the ray agrees with it.
    world.step();
    cells.afterStep();
    expect(worldQueryToi(), 'SETUP: after the step the world\'s query does not see the cell').toBeCloseTo(second.toi, 3);
  });

  it('a chunk trimesh made since the last step, in front of the ground, is what the ray hits', () => {
    const ground = castBuildRay(world, RAPIER, camera, cells.unindexed());
    expect(ground, 'SETUP: the build ray hit nothing').not.toBeNull();
    // A chunk whose one block stands in the cell the ray meets the ground in, its trimesh made now, as a React commit makes it.
    const [x, y, z] = [Math.floor(ground.hitPoint.x), TOP, Math.floor(ground.hitPoint.z) + 1];
    const blocks = new Uint8Array(CHUNK_VOLUME);
    blocks[voxelIndex(x & 15, y, z & 15)] = 3;
    const m = generateMesh(0, 0, blocks, undefined);
    const chunk = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(Math.floor(x / 16) * 16, 0, Math.floor(z / 16) * 16));
    const trimesh = world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), chunk);
    cells.landed(Math.floor(x / 16), Math.floor(z / 16), 0, trimesh);
    expect(worldQueryToi(), 'SETUP: the world\'s own query already sees the new trimesh').toBeCloseTo(ground.toi, 3);
    const hit = castBuildRay(world, RAPIER, camera, cells.unindexed());
    expect(cellOf(hit), `the ray passed through the new trimesh (toi ${hit.toi.toFixed(3)} against the ground's ${ground.toi.toFixed(3)})`).toEqual([x, y, z]);
    // The chunk re-meshed again before the step: React removed that trimesh, which stays listed until the step. The ray
    // goes on to the ground and does not throw on the removed collider.
    world.removeCollider(trimesh, true);
    expect(cells.unindexed().includes(trimesh), 'SETUP: the removed trimesh is no longer listed, so the case measures nothing').toBe(true);
    const after = castBuildRay(world, RAPIER, camera, cells.unindexed());
    expect(after && after.toi, 'the ray did not reach the ground past the removed trimesh').toBeCloseTo(ground.toi, 3);
  });
});
