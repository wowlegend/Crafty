import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { generateMesh } from '../../src/world/mesher.js';
import { makeMobFloorProbe } from '../../src/world/mobFloorProbe.js';
import { floorInColumn, columnFaces, groundForMover, MOB_CLEARANCE, FLOOR_REACH } from '../../src/game/mobFloor.js';
import { snapMob, heightGridAt, STEP_UP } from '../../src/game/localPath.js';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
import { drainKnockback } from '../../src/game/captureRest.js';
import { carriersOf } from './_srcWalk.js';

/**
 * A MOB STANDS ON ITS FLOOR, NOT ON THE TOP OF ITS COLUMN (review #6, QUEUE R7.1).
 *
 * The mob ground probe cast down from y = 255, so under a roof, a bridge or a tree canopy the "ground" was the roof.
 * P1's step rule then refused every move under one (a mob could not walk beneath a tree), and R6.4's own-column
 * exemption lifted a mob onto any roof built over it. The floor probe walks the column's faces from the sky and
 * takes the bottom of the air gap the feet are in (game/mobFloor.js).
 *
 * Three layers: the pure rule on face lists; the REAL probe over a chunk meshed by the REAL mesher in a REAL Rapier
 * world (the seam the pure rule cannot see: whether the collider's faces alternate as the rule assumes, whether a
 * cast from inside a trimesh continues, whether debris and the player are filtered out); and the REAL ai.worker.js
 * chasing through snapMob + heightGridAt, the two calls AIWorkerSystem makes — each run beside a CONTROL on the old
 * top-down probe, which must FAIL the same scenario, so a pass cannot be a scenario that never needed the floor.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 floorInColumn returns the column top again (the original defect)
 *   M2 plausible-wrong: headroom measured from the gap's floor, not from where the mob stands (it drops into a pit
 *      under a low overhang, its body through the overhang)
 *   M3 plausible-wrong: the HIGHEST floor within reach kept instead of the lowest (a step read as the block above it)
 *   M4 columnFaces stops at the first face (the top-down probe with extra steps)
 *   M5 plausible-wrong: the probe casts without the fixed-only filter (a debris cube flips every gap below it)
 *   M6 plausible-wrong: the next cast starts ON the face it just met (re-hits it; the walk gives up)
 *   M7 settleOnGround takes an Infinity floor (y = Infinity) — SURVIVED the first time: every Infinity case crossed
 *      columns, where the finite rise rule refuses anyway; the own-column and first-snap cases now pin it
 *   M8 the climber fallback removed (a spider stops at a tall pillar)
 *   M9 AIWorkerSystem snaps with the top-down probe again (structural)
 *   M10 the knockback walk reads the column top (a shove stops at the canopy edge)
 *   M11 allies set y from the column top again   M12 the leg IK reaches for the column top again (both structural)
 *
 * BLIND SPOTS: a ray landing exactly on a triangle's diagonal could miss both triangles and flip one gap — and one
 * landing exactly on a column seam (x + 0.1 a whole number) may read the neighbour's faces (measure zero for float
 * positions; the old probe had both exposures); the probe ignores placed-block edits until the
 * chunk re-meshes (as every collider does); XP orbs, loot, spell projectiles and spawn placement still read the column
 * top (QUEUE R7.9); allies, hub NPCs and the leg IK are moved onto the floor with STRUCTURAL checks only; and whether a siege under a roof FEELS right needs a person playing.
 */

// ---- the pure rule ---------------------------------------------------------------------------------------

describe('floorInColumn — the bottom of the air gap the feet are in', () => {
  it('open ground: the only top', () => {
    expect(floorInColumn([50, 0], 50)).toBe(50);
  });
  it('under a roof or a canopy (faces: roof top, roof underside, ground): the ground, not the roof', () => {
    expect(floorInColumn([55, 54, 50, 0], 50)).toBe(50);
    expect(floorInColumn([58, 56, 50, 0], 50)).toBe(50);
  });
  it('standing ON the roof: the roof', () => {
    expect(floorInColumn([55], 55)).toBe(55);
    expect(floorInColumn([55, 54], 55)).toBe(55);
  });
  it('a step, a wall within reach: the floor above (the step rule decides); beyond reach or no room: Infinity', () => {
    expect(floorInColumn([51, 0], 50)).toBe(51);
    expect(floorInColumn([53, 0], 50)).toBe(53);
    expect(floorInColumn([50 + FLOOR_REACH + 0.5, 0], 50), 'a floor out of reach is not this mob\'s').toBe(Infinity);
    expect(floorInColumn([52, 51, 45, 0], 50), 'a 1-high gap is not walked into: its top is the floor above').toBe(52);
  });
  it('of two floors above the feet, the LOWER (a step under a floating block reads as the step)', () => {
    // solid 53..54 floating, air 51..53, solid below 51: the mob walks onto the 51 step, not the 54 block.
    expect(floorInColumn([54, 53, 51, 0], 50)).toBe(51);
  });
  it('headroom counts from where the mob STANDS: a pit under a low overhang is a wall, not a drop', () => {
    // gap [45, 53] — roomy from its floor, but a mob walking in at feet 52 has 1 block of room: it cannot enter.
    expect(floorInColumn([54, 53, 45, 0], 52)).toBe(54);
    expect(floorInColumn([54, 53, 45, 0], 50), 'the same pit from lower down is a drop it fits into').toBe(45);
    expect(MOB_CLEARANCE).toBeGreaterThan(1);
    expect(MOB_CLEARANCE, 'a mob must fit through a 2-high doorway').toBeLessThan(2);
  });
  it('no faces: no data (null), never a wall', () => {
    expect(floorInColumn([], 50)).toBe(null);
    expect(floorInColumn(null, 50)).toBe(null);
  });
});

describe('columnFaces — walks the column until the first top at or below the feet', () => {
  const columnOf = (faces) => (y) => { const f = faces.find((h) => h < y); return f === undefined ? null : f; };
  it('collects roof top, underside, then the ground, and stops there', () => {
    expect(columnFaces(columnOf([55, 54, 50, 40, 30, 0]), 50)).toEqual([55, 54, 50]);
  });
  it('an empty column is empty; a column with too many faces above the feet is unknown (null)', () => {
    expect(columnFaces(() => null, 50)).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => 250 - i * 2);
    expect(columnFaces(columnOf(many), 50)).toBe(null);
  });
});

// ---- the REAL probe: the real mesher's faces in a real Rapier world -----------------------------------------

const GROUND = 50;
/** One chunk at (0, 0): ground to 50 and a roof, a tree, a wall, a tall pillar, a low overhang and a step. */
function fixtureBlocks() {
  const b = new Uint8Array(16 * 16 * 256);
  const set = (x, y, z, t = 1) => { b[x + z * 16 + y * 256] = t; };
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < GROUND; y++) set(x, y, z);
  for (let x = 8; x <= 12; x++) for (let z = 8; z <= 13; z++) set(x, 54, z);           // ROOF: underside 54, top 55
  for (let y = 50; y <= 55; y++) set(3, y, 3, 5);                                       // TREE trunk
  for (let x = 1; x <= 5; x++) for (let z = 1; z <= 5; z++) { set(x, 56, z, 6); set(x, 57, z, 6); } // canopy 56..58
  for (let z = 0; z < 16; z++) for (let y = 50; y <= 52; y++) set(14, y, z);           // WALL: top 53
  for (let z = 0; z <= 3; z++) for (let y = 50; y <= 57; y++) set(15, y, z);           // PILLAR: top 58
  for (let x = 5; x <= 6; x++) for (let z = 12; z <= 14; z++) set(x, 51, z);          // LOW OVERHANG: gap [50, 51]
  set(7, 50, 5);                                                                        // STEP: top 51
  return b;
}

let world, floorAt, topAt;
beforeAll(async () => {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const m = generateMesh(0, 0, fixtureBlocks());
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(m.positions), new Uint32Array(m.indices)), body);
  // A flying debris cube under the roof and a kinematic capsule (the player) in the open: neither is terrain.
  const debris = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(10.5, 52, 10.5).setGravityScale(0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4), debris);
  const player = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(7.5, 51, 1.5));
  world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), player);
  world.step();
  floorAt = makeMobFloorProbe(RAPIER, world);
  // The top-down probe as Terrain.jsx registers it (the CONTROL): from y = 255, first hit, terrain and all.
  const ray = new RAPIER.Ray({ x: 0, y: 255, z: 0 }, { x: 0, y: -1, z: 0 });
  topAt = (x, z) => {
    ray.origin.x = x + 0.1; ray.origin.y = 255; ray.origin.z = z + 0.1;
    const hit = world.castRay(ray, 300, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? 255 - hit.timeOfImpact : null;
  };
});

describe('the real probe over the real mesher\'s collider', () => {
  const near = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
  it('open ground, under the roof, under the canopy: the ground — where the top-down probe says roof and canopy', () => {
    expect(near(floorAt(7, 1, GROUND))).toBe(50);
    expect(near(topAt(10, 10)), 'control: the fixture has no roof').toBe(55);
    expect(near(floorAt(10, 10, GROUND))).toBe(50);
    expect(near(topAt(2, 2)), 'control: the fixture has no canopy').toBe(58);
    expect(near(floorAt(2, 2, GROUND))).toBe(50);
  });
  it('on the roof: the roof', () => {
    expect(near(floorAt(10, 10, 55))).toBe(55);
  });
  it('the step and the wall read as floors above (the step rule decides); the trunk and the tall pillar are walls', () => {
    expect(near(floorAt(7, 5, GROUND))).toBe(51);
    expect(near(floorAt(14, 5, GROUND))).toBe(53);
    expect(floorAt(3, 3, GROUND)).toBe(Infinity);
    expect(floorAt(15, 1, GROUND)).toBe(Infinity);
  });
  it('a 1-high gap under a low overhang is not walked into', () => {
    expect(near(floorAt(5, 13, GROUND))).toBe(52);
  });
  it('debris and the player in the column are not terrain — and they ARE in the rays\' path (presence control)', () => {
    const raw = world.castRay(new RAPIER.Ray({ x: 10.6, y: 53.9, z: 10.6 }, { x: 0, y: -1, z: 0 }), 10, true);
    expect(raw && near(53.9 - raw.timeOfImpact), 'the debris cube is not under the probe\'s ray').toBeCloseTo(52.4, 3);
    const rawP = world.castRay(new RAPIER.Ray({ x: 7.6, y: 60, z: 1.6 }, { x: 0, y: -1, z: 0 }), 20, true);
    expect(rawP && 60 - rawP.timeOfImpact, 'the player capsule is not under the probe\'s ray').toBeGreaterThan(51);
    expect(near(floorAt(10.5, 10.5, GROUND))).toBe(50);
    expect(near(floorAt(7.5, 1.5, GROUND))).toBe(50);
  });
});

// ---- the movers, through the calls AIWorkerSystem makes --------------------------------------------------

describe('snapMob — the snap AIWorkerSystem makes, on the real probe', () => {
  const at = (x, z, over = {}) => ({ type: 'zombie', position: { x, y: GROUND + 0.5, z }, ...over });
  it('a roof built over a standing mob does not lift it (the R6.4 regression) — the top-down control does', () => {
    const e = at(10.4, 10.4, { footX: 10.3, footZ: 10.3 });
    snapMob(e, floorAt, topAt);
    expect(e.position.y).toBeCloseTo(GROUND + 0.5, 3);
    const c = at(10.4, 10.4, { footX: 10.3, footZ: 10.3 });
    snapMob(c, null, topAt); // no floor probe: the old top-down snap
    expect(c.position.y, 'control: the old snap no longer lifts onto the roof — the scenario is empty').toBeCloseTo(55.5, 3);
  });
  it('walking under the canopy is taken; into the trunk or the pillar is refused, y untouched', () => {
    const e = at(1.4, 6.4); snapMob(e, floorAt, topAt);
    e.position.z = 4.4; expect(snapMob(e, floorAt, topAt)).toBe(false);
    expect(e.position.y).toBeCloseTo(GROUND + 0.5, 3);
    const t = at(2.4, 3.4); snapMob(t, floorAt, topAt);
    t.position.x = 3.4; expect(snapMob(t, floorAt, topAt), 'walked into the trunk').toBe(true);
    expect([t.position.x, t.position.z]).toEqual([2.4, 3.4]);
    expect(t.position.y).toBeCloseTo(GROUND + 0.5, 3);
    const p = at(13.4, 1.4); snapMob(p, floorAt, topAt);
    p.position.x = 15.4; expect(snapMob(p, floorAt, topAt)).toBe(true);
    expect(p.position.y, 'an Infinity floor was written as y').toBeCloseTo(GROUND + 0.5, 3);
  });
  it('a floorless OWN column (entombed, or a first snap inside the pillar) holds y — the own-column exemption must not take Infinity', () => {
    const first = at(15.4, 1.4); // no footing yet, feet inside the 8-high pillar
    expect(snapMob(first, floorAt, topAt)).toBe(true);
    expect(first.position.y).toBe(GROUND + 0.5);
    const own = at(15.4, 1.4, { footX: 15.3, footZ: 1.3 }); // same column: the R6.4 exemption's case
    expect(snapMob(own, floorAt, topAt)).toBe(true);
    expect(own.position.y).toBe(GROUND + 0.5);
  });
  it('a spider climbs the wall onto its floor, and the floorless pillar onto its top', () => {
    const s = at(13.4, 5.4, { type: 'spider' }); snapMob(s, floorAt, topAt);
    s.position.x = 14.4; snapMob(s, floorAt, topAt);
    expect(s.position.y).toBeCloseTo(53.5, 3);
    const s2 = at(13.4, 1.4, { type: 'spider' }); snapMob(s2, floorAt, topAt);
    s2.position.x = 15.4; snapMob(s2, floorAt, topAt);
    expect(s2.position.y).toBeCloseTo(58.5, 3);
  });
  it('groundForMover with no floor probe registered falls back to the top', () => {
    expect(groundForMover(null, () => 7, 0, 0, 0)).toBe(7);
    expect(groundForMover(null, null, 0, 0, 0)).toBe(null);
  });
});

const posted = [];
let onmessage;
beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

/**
 * The real worker across ticks, grid and snap exactly as AIWorkerSystem makes them. Returns the closest approach
 * and how many ticks the zombie stood on a column `inside(cx, cz)` accepts (the snap's own column framing).
 */
function chase(start, player, getFloor, getTop, inside = () => false, ticks = 260) {
  const e = {
    id: 'z', passive: false, type: 'zombie', position: { x: start[0], y: GROUND + 0.5, z: start[1] }, isAggro: true,
    isMoving: false, targetX: start[0], targetZ: start[1], lastAttackTime: 0, windupUntil: 0, damage: 8, moveTimer: 0,
    speed: 1.2, rotation: 0, health: 60, maxHealth: 60,
  };
  const gridFloor = getFloor || ((x, z) => getTop(x, z));
  let now = 1000, closest = Infinity, highest = -Infinity, ticksInside = 0;
  snapMob(e, getFloor, getTop);
  for (let i = 0; i < ticks; i++) {
    const heightGrid = heightGridAt(e.position.x, e.position.z, e.position.y - 0.5, gridFloor);
    posted.length = 0;
    onmessage({ data: { type: 'TICK', playerPos: player, now, delta: 0.1, mobs: [buildMobPayload(e, { speed: e.speed, heightGrid })], captureSeed: null } });
    for (const u of posted[posted.length - 1].updates) applyMobUpdate(e, u);
    snapMob(e, getFloor, getTop);
    closest = Math.min(closest, Math.hypot(e.position.x - player[0], e.position.z - player[2]));
    highest = Math.max(highest, e.position.y);
    if (inside(Math.floor(e.position.x + 0.1), Math.floor(e.position.z + 0.1))) ticksInside++;
    now += 100;
  }
  return { closest, highest, ticksInside, end: e.position };
}

describe('the real worker chases a player UNDER a roof and UNDER a tree — the top-down control cannot', () => {
  const underRoof = (cx, cz) => cx >= 8 && cx <= 12 && cz >= 8 && cz <= 13;
  const underCanopy = (cx, cz) => cx >= 1 && cx <= 5 && cz >= 1 && cz <= 5;
  it('under the roof: it walks in and reaches striking range; the top-down snap never gets under', () => {
    const player = [10.5, GROUND, 11.5];
    const r = chase([10.4, 3.4], player, floorAt, topAt, underRoof);
    expect(r.ticksInside, 'it never stood under the roof').toBeGreaterThan(20);
    expect(r.closest, `closest approach ${r.closest.toFixed(2)} m`).toBeLessThan(2);
    expect(r.highest, 'it stood on the roof').toBeCloseTo(GROUND + 0.5, 3);
    const c = chase([10.4, 3.4], player, null, topAt, underRoof);
    expect(c.ticksInside, 'control: the top-down snap got under the roof too — the scenario proves nothing').toBe(0);
  });
  it('under the canopy, beside the trunk: the same', () => {
    const player = [2.5, GROUND, 2.5];
    const r = chase([2.4, 9.4], player, floorAt, topAt, underCanopy);
    expect(r.ticksInside, 'it never stood under the canopy').toBeGreaterThan(20);
    expect(r.closest, `closest approach ${r.closest.toFixed(2)} m`).toBeLessThan(2);
    expect(r.highest).toBeCloseTo(GROUND + 0.5, 3);
    const c = chase([2.4, 9.4], player, null, topAt, underCanopy);
    expect(c.ticksInside, 'control: the top-down snap got under the canopy too').toBe(0);
  });
  it('the wall still stops it (the P1 rule survives the new probe)', () => {
    const r = chase([11.4, 8.4], [15.5, GROUND, 8.5], floorAt, topAt);
    expect(r.highest).toBeCloseTo(GROUND + 0.5, 3);
    expect(r.end.x, 'it crossed the wall').toBeLessThan(14);
  });
});

describe('a knockback shove under the canopy is not stopped by the canopy', () => {
  it('the full shove under the leaves; the trunk still stops it', () => {
    const e = { type: 'zombie', health: 10, position: { x: 1.2, y: GROUND + 0.5, z: 2.4 }, knockback: [0, 0, 5] };
    drainKnockback([e], 0.1, false, floorAt); // 5 * 0.1 * 4 = a 2 m shove, z 2.4 -> 4.4, all under the canopy
    expect(e.position.z).toBeCloseTo(4.4, 6);
    const c = { type: 'zombie', health: 10, position: { x: 1.2, y: GROUND + 0.5, z: 6.4 }, knockback: [0, 0, -5] };
    drainKnockback([c], 0.1, false, (x, z) => topAt(x, z));
    expect(c.position.z, 'control: the top-down walk let the shove in under the canopy').toBeGreaterThan(5.9);
    // Off the column seams (z + 0.1 never a whole number): a ray exactly on an edge is the blind spot above.
    const t = { type: 'zombie', health: 10, position: { x: 3.4, y: GROUND + 0.5, z: 1.45 }, knockback: [0, 0, 5] };
    drainKnockback([t], 0.1, false, floorAt); // into the trunk at z 3
    expect(t.position.z, `the shove went through the trunk to z ${t.position.z.toFixed(2)}`).toBeLessThan(2.9);
  });
});

describe('AIWorkerSystem wiring (weak, structural — the chase above drives the same calls)', () => {
  it('snaps, builds grids and drains knockback on the floor probe; Terrain registers it', () => {
    expect(carriersOf(/snapMob\(entity, store\.getMobFloor, store\.getMobGroundLevel\)/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/heightGridAt\(e\.position\.x, e\.position\.z, e\.position\.y - 0\.5, getMobFloor\)/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/drainKnockback\(mobsQuery\.entities, delta, false, useGameStore\.getState\(\)\.getMobFloor\)/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/setGetMobFloor\(makeMobFloorProbe\(rapier, world\)\)/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/groundForMover\(store\.getMobFloor, store\.getMobGroundLevel, m\.x, m\.z, feet, true\)/)).toEqual(['world/SquadAISystem.jsx']);
    expect(carriersOf(/store\.getMobFloor\(worldX, worldZ, entity\.position\.y - 0\.5\)/)).toEqual(['render/MobModel.jsx']);
    expect(STEP_UP).toBeLessThan(MOB_CLEARANCE);
  });
});
