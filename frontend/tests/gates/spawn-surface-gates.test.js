import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { generateMesh } from '../../src/world/mesher.js';
import { makeMobFloorProbe } from '../../src/world/mobFloorProbe.js';
import { spawnGroundAt, SPAWN_SOLID_DEPTH } from '../../src/game/mobFloor.js';
import { carriersOf } from './_srcWalk.js';

/**
 * A MOB SPAWNS ON GROUND — never on, or under, a canopy, a roof or a bridge (QUEUE R7.9b).
 *
 * Spawn placement took the column TOP from the y = 255 probe, so a mob could appear standing on a tree canopy or a
 * roof. The floor probe (game/mobFloor.js) could put it on the ground UNDER the canopy instead — but under a roof
 * that is inside the player's sealed base, which is exactly what building walls exists to prevent. So spawnGroundAt
 * accepts a column only when its top is solid SPAWN_SOLID_DEPTH down, and the spawner tries elsewhere otherwise.
 * Driven on a chunk meshed by the real mesher in a real Rapier world, through the real probe.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   V1 spawnGroundAt returns the column top whatever is under it (the original defect)
 *   V2 plausible-wrong: the depth probe one block under the top (it lands in the roof slab or the canopy and
 *      reads the top back — no overhang is ever seen)
 *   V3 the spawner reads the column top directly again (structural)
 *   (review #7:) V4 the neighbours not checked (a tree top over its trunk reads as ground, R8.3)
 *   V5 plausible-wrong: the depth probe's own reach shorter than its depth (nothing in reach: every column refused)
 *   V6 plausible-wrong: an Infinity from the depth probe accepted as ground (R8.10's unsafe direction)
 *
 * BLIND SPOTS: a canopy or a floating layer thicker than SPAWN_SOLID_DEPTH reads as ground; a naturally thin crust
 * over a shallow cave is refused as an overhang (conservative: the spawner tries another column).
 */
const GROUND = 50;
function fixtureBlocks() {
  const b = new Uint8Array(16 * 16 * 256);
  const set = (x, y, z, t = 1) => { b[x + z * 16 + y * 256] = t; };
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < GROUND; y++) set(x, y, z);
  for (let x = 1; x <= 4; x++) for (let z = 1; z <= 4; z++) { set(x, 56, z, 6); set(x, 57, z, 6); } // CANOPY 56..58
  for (let y = 50; y <= 55; y++) set(2, y, 2, 5); // its TRUNK: one solid run from the ground to the canopy top
  for (let x = 8; x <= 12; x++) for (let z = 8; z <= 12; z++) set(x, 54, z);                    // ROOF 54..55
  for (let z = 0; z < 16; z++) for (let y = 50; y <= 51; y++) set(14, y, z);                    // A HILL STEP: top 52
  return b;
}

let floorAt, topAt;
beforeAll(async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const m = generateMesh(0, 0, fixtureBlocks());
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(m.positions), new Uint32Array(m.indices)), world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
  world.step();
  floorAt = makeMobFloorProbe(RAPIER, world);
  const ray = new RAPIER.Ray({ x: 0, y: 255, z: 0 }, { x: 0, y: -1, z: 0 });
  topAt = (x, z) => {
    ray.origin.x = x + 0.1; ray.origin.y = 255; ray.origin.z = z + 0.1;
    const hit = world.castRay(ray, 300, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? 255 - hit.timeOfImpact : null;
  };
});

describe('spawnGroundAt — ground only', () => {
  it('open ground and a natural step spawn on their top', () => {
    expect(spawnGroundAt(floorAt, topAt, 6, 2)).toBeCloseTo(GROUND, 3);
    expect(spawnGroundAt(floorAt, topAt, 14, 3)).toBeCloseTo(52, 3);
  });
  it('a canopy and a roof are refused — the column-top control would have spawned on them', () => {
    expect(topAt(2, 2), 'control: the fixture has no canopy').toBeCloseTo(58, 3);
    expect(spawnGroundAt(floorAt, topAt, 3, 3), 'spawned on (or under) the canopy').toBe(null);
    // The TRUNK column is solid from the ground to the canopy top — one run, no gap — so a depth probe alone reads it
    // as ground (review #7, R8.3). Its neighbours are canopy: a column is ground only if they are too.
    expect(topAt(2, 2), 'control: the trunk column tops out at the canopy').toBeCloseTo(58, 3);
    expect(spawnGroundAt(floorAt, topAt, 2, 2), 'spawned on the tree top over its trunk').toBe(null);
    expect(topAt(10, 10), 'control: the fixture has no roof').toBeCloseTo(55, 3);
    expect(spawnGroundAt(floorAt, topAt, 10, 10), 'spawned on (or under) the roof').toBe(null);
  });
  it('no floor probe registered: the column top, as before; no data: null', () => {
    expect(spawnGroundAt(null, topAt, 3, 3)).toBeCloseTo(58, 3);
    expect(spawnGroundAt(floorAt, topAt, 40, 40), 'an unloaded column spawned').toBe(null);
    expect(SPAWN_SOLID_DEPTH).toBeGreaterThan(2); // deeper than a 2-block canopy, or it reads the canopy as ground
  });
  it('an Infinity from the depth probe (nothing in reach) REFUSES — the safe direction (R8.10)', () => {
    expect(spawnGroundAt(() => Infinity, () => 50, 0, 0)).toBe(null);
  });
  it('the spawner places natural spawns through it (weak, structural)', () => {
    expect(carriersOf(/spawnGroundAt\(store\.getMobFloor, store\.getMobGroundLevel, x, z\)/)).toEqual(['systems/SpawnerSystem.jsx']);
    expect(carriersOf(/y = store\.getMobGroundLevel\(x, z\);/), 'a spawn reads the column top again').toEqual([]);
  });
});
