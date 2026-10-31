import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { generateMesh } from '../../src/world/mesher.js';
import { makeMobFloorProbe } from '../../src/world/mobFloorProbe.js';
import { mobGridsAt, gridOrigin } from '../../src/game/localPath.js';
import { hasLineOfSight } from '../../src/game/mobLineOfSight.js';
import { buildMobPayload } from '../../src/game/mobStateSync.js';

/**
 * ONE FACT, ONE PREDICATE: HOW HIGH IS THE COLUMN BETWEEN US? (AUDIT:ultra:ultra-game-logic-3)
 *
 * The mob's floor grid writes Infinity for a column it cannot stand in (a wall, or a pillar past its reach). Line of
 * sight compared a column with the higher of its two ENDS plus 1.2. A player standing on a pillar 5 or more blocks above
 * the mob made an Infinity end, so the bar was Infinity and no wall between them blocked: a wounded mob never took
 * cover from a player above it behind a wall, and a skeleton kept shooting. (R7.1, 8db8016a, moved the grid from
 * column tops to floors and wrote the Infinity; sight kept reading it.)
 *
 * This is the verifier's scene, driven by the real parts: a chunk meshed by the real mesher into a real Rapier world,
 * the real floor probe and a column-top cast as Terrain.jsx registers them, the grids as AIWorkerSystem builds them
 * (mobGridsAt), and the real ai.worker.js tick. A wounded zombie stands at one end of a flat plain; a wall 10 blocks high
 * crosses the plain between it and the player; the player stands on a pillar of 1 to 8 blocks. The worker must send it
 * for cover at every pillar height; with no wall there is no cover to seek, and it must not.
 *
 * NOT CHECKED: that enemy arrows are blocked by terrain (they are not; a separate lead), and the A* over the floor grid
 * (unchanged: the sight grid is a second grid, so clampMove still refuses a wall).
 *
 * Mutation-Proof: see the commit trailer.
 */

const GROUND = 50; // the plain's top: solid y 0..49
const WALL_X0 = 0, WALL_X1 = 15, WALL_Z = 6, WALL_H = 10;
const PILLAR = { x: 8, z: 8 };
const MOB = { x: 8.5, y: GROUND + 0.5, z: 4.5 }; // grid cell (4, 4); the pillar is cell (4, 8), the wall row gz 6
const ROOF = { x0: 6, x1: 7, z0: 2, z1: 3, y: GROUND + 3 }; // a slab with 3 blocks of room under it: cells (2..3, 2..3), floor GROUND, top GROUND + 4

function blocks({ wall, pillar }) {
  const b = new Uint8Array(16 * 16 * 256);
  const set = (x, y, z) => { b[x + z * 16 + y * 256] = 1; };
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < GROUND; y++) set(x, y, z);
  if (wall) for (let x = WALL_X0; x <= WALL_X1; x++) for (let y = GROUND; y < GROUND + WALL_H; y++) set(x, y, WALL_Z);
  for (let y = GROUND; y < GROUND + pillar; y++) set(PILLAR.x, y, PILLAR.z);
  for (let x = ROOF.x0; x <= ROOF.x1; x++) for (let z = ROOF.z0; z <= ROOF.z1; z++) set(x, ROOF.y, z);
  return b;
}

/** A Rapier world holding the chunk, with the two probes Terrain.jsx registers. */
function scene(spec) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const m = generateMesh(0, 0, blocks(spec));
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(m.positions), new Uint32Array(m.indices)), body);
  world.step(); // the scene queries see the collider only after a step
  const ray = new RAPIER.Ray({ x: 0, y: 255, z: 0 }, { x: 0, y: -1, z: 0 });
  const topAt = (x, z) => { // Terrain.jsx getMobGroundLevel: the column top, +0.1 off the seams
    ray.origin.x = x + 0.1; ray.origin.y = 255; ray.origin.z = z + 0.1;
    const hit = world.castRay(ray, 300, true);
    return hit ? 255 - hit.timeOfImpact : null;
  };
  return { floorAt: makeMobFloorProbe(RAPIER, world), topAt };
}

// The worker module assigns self.onmessage at import and posts through self.postMessage. A stand-in `self` is installed
// around those two moments only: the Rapier wasm glue panics in world.step() if `self` is a fake.
const posted = [];
let onmessage;
const fakeSelf = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
const realSelf = globalThis.self;
beforeAll(async () => {
  await RAPIER.init();
  globalThis.self = fakeSelf;
  try { await import('../../src/workers/ai.worker.js'); } finally { globalThis.self = realSelf; }
});

/** One worker tick of a wounded zombie, with the grids AIWorkerSystem would send. */
function woundedTick(spec) {
  const { floorAt, topAt } = scene(spec);
  const grids = mobGridsAt(MOB.x, MOB.z, MOB.y - 0.5, floorAt, topAt);
  const e = {
    id: 'z', passive: false, type: 'zombie', position: { ...MOB }, isAggro: true, isMoving: false,
    targetX: MOB.x, targetZ: MOB.z, lastAttackTime: 0, windupUntil: 0, damage: 8, moveTimer: 0,
    speed: 1.2, rotation: 0, health: 20, maxHealth: 100,
  };
  const eye = GROUND + spec.pillar + 1.62; // the sense point: the player's eyes over its own floor
  posted.length = 0;
  globalThis.self = fakeSelf;
  try {
    onmessage({ data: { type: 'TICK', playerPos: [PILLAR.x + 0.5, eye, PILLAR.z + 0.5], now: 100000, delta: 0.1, mobs: [buildMobPayload(e, { speed: e.speed, ...grids })], captureSeed: null } });
  } finally { globalThis.self = realSelf; }
  const u = posted[posted.length - 1].updates[0];
  return { grids, aggro: u.isAggro, coverSeeking: u.isCoverSeeking };
}

describe('a wounded mob takes cover from a player above it, behind a wall', () => {
  it.each([1, 3, 4, 5, 6, 8])('player on a %i-block pillar, a 10-block wall between: the mob seeks cover', (pillar) => {
    const r = woundedTick({ wall: true, pillar });
    const cell = 4 + 8 * 9; // the player's cell in the mob's grid
    // The instrument: the wall is a wall to this mob, and the pillar is past its reach from 5 blocks up.
    expect(r.grids.heightGrid[4 + 6 * 9], 'SETUP: the wall is not Infinity in the floor grid').toBe(Infinity);
    if (pillar >= 5) {
      expect(r.grids.heightGrid[cell], `SETUP: a ${pillar}-block pillar is within the mob's reach`).toBe(Infinity);
      expect(r.grids.sightGrid[cell], 'the sight grid keeps the pillar\'s true top').toBeCloseTo(GROUND + pillar, 1);
    }
    expect(r.grids.sightGrid[4 + 6 * 9], 'the sight grid keeps the wall\'s true top').toBeCloseTo(GROUND + WALL_H, 1);
    expect(r.aggro, 'SETUP: the mob lost aggro').toBe(true);
    expect(r.coverSeeking, `pillar ${pillar}: it stands in the open with the wall between`).toBe(true);
  });

  it('with no wall there is no cover to take: the same mob does not seek it (the instrument sees both states)', () => {
    for (const pillar of [1, 6]) {
      const r = woundedTick({ wall: false, pillar });
      expect(r.aggro, 'SETUP: the mob lost aggro').toBe(true);
      expect(r.coverSeeking, `pillar ${pillar}, open plain`).toBe(false);
    }
  });

  it('the floor grid is untouched: the wall is still Infinity to walking, and the sight grid is a second grid', () => {
    const { floorAt, topAt } = scene({ wall: true, pillar: 6 });
    const g = mobGridsAt(MOB.x, MOB.z, MOB.y - 0.5, floorAt, topAt);
    const ox = gridOrigin(MOB.x), oz = gridOrigin(MOB.z);
    expect([ox, oz], 'SETUP: the grid is not centred as the scene assumes').toEqual([4, 0]);
    for (let gx = 0; gx < 9; gx++) expect(g.heightGrid[gx + 6 * 9], `wall cell ${gx} walks as a wall`).toBe(Infinity);
    expect(g.heightGrid[4 + 4 * 9], 'the mob\'s own cell is its floor').toBe(GROUND);
    expect(g.sightGrid[4 + 4 * 9]).toBe(GROUND);
    const roofCell = (ROOF.x0 - ox) + (ROOF.z0 - oz) * 9;
    expect(g.heightGrid[roofCell], 'a roof over open room is not a wall: the floor under it').toBeCloseTo(GROUND, 3);
    expect(g.sightGrid[roofCell], 'a finite floor stays the floor in the sight grid (only an Infinity cell takes its top)').toBe(g.heightGrid[roofCell]);
  });

  it('hasLineOfSight on the two grids of this scene: blocked on the sight grid, clear on the floor grid it used to read', () => {
    const { floorAt, topAt } = scene({ wall: true, pillar: 6 });
    const g = mobGridsAt(MOB.x, MOB.z, MOB.y - 0.5, floorAt, topAt);
    expect(hasLineOfSight(g.sightGrid, 3, 4, 4, 8), 'the wall blocks on the sight grid').toBe(false);
    expect(hasLineOfSight(g.heightGrid, 3, 4, 4, 8), 'CONTROL: the floor grid is the old reading (an Infinity end clears everything)').toBe(true);
  });
});
