// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * A BODY LEFT IN THE ROCK IS STOOD CLEAR WHERE IT IS (src/Components.jsx, the Player's loop after its spawn branch).
 *
 * A chunk's trimesh is hollow (world/mesher.js closes each chunk), so a body that clipped into the ground touches no face
 * from inside and falls through the rock until the back of a face stops it. Under most of the world that face is the
 * bottom of the cells at y 0, and the void guard (game/spawnPlacement.js isVoidFall, a centre under y 1.4) resets the
 * player; over a cave it is the cave's ceiling, above the line, and the controller has no depenetration, so nothing moved
 * them (the round-1 review of lane L4 measured 1483 of 6400 columns within 40 m of the spawn with a ceiling between y 1.5
 * and 9). This mounts the real Player with the real Rapier on the real world: the chunks round the spawn made by
 * terrain.worker.js (its default seed, as a fresh game makes them) and their trimeshes, with a copy of the game's ground
 * probe (Terrain.jsx getMobGroundLevel). It reads the capsule against the solid runs of each column the footprint covers,
 * found by the faces a ray up from under the world crosses, never through the code under test:
 *   - a player put in the rock 1.5 m under its top over a cave's ceiling between y 1.5 and 9 (the first, middle and last
 *     such column the scan finds) is stood clear within a metre of where they clipped, standing, and is not reset to the
 *     origin; at 60 and 120 Hz;
 *   - the spawn's blind drop (the wait for the corner's ground ran out: game/spawnPlacement.js SPAWN_PROBE_MAX_SEC) over a
 *     corner whose four chunks land round the falling body, 8 m into their rock or with their top face across the capsule
 *     (the centre over the face and the lowest point under it, which no reading of the centre sees), ends with the player
 *     on the corner's ground, not in it; at 60 and 120 Hz;
 *   - a reading of the centre in solid that clears within 0.15 s moves no one, and the same reading held a second does.
 * BLIND SPOT: R3F's loop is a stub, the frame rate is fixed, and chunk streaming is stood in for (the test mounts the
 * corner's chunks); the transient reading is made by a unit box of trimesh round the centre's cell, a stand-in for any
 * collider set that reads wrong for a moment; mobs, input and the camera's follow are not read.
 */

const h = vi.hoisted(() => ({ frame: null, camera: null, body: null, world: null }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { h.frame = cb; },
  useThree: (sel) => (sel ? sel({ camera: h.camera }) : { camera: h.camera }),
}));
vi.mock('@react-three/rapier', async () => {
  const R = await import('react');
  return {
    RigidBody: R.forwardRef(function RigidBody(_props, ref) {
      R.useImperativeHandle(ref, () => h.body);
      return null;
    }),
    CapsuleCollider: () => null,
    useRapier: () => ({ rapier: RAPIER, world: h.world }),
  };
});
vi.mock('../../src/render/playerRender', () => ({ StableMagicHands: () => null }));
vi.mock('../../src/render/ViewmodelLayer.jsx', () => ({ ViewmodelLayer: ({ children }) => <>{children}</> }));
vi.mock('../../src/render/BeastAvatar', () => ({ BeastAvatar: () => null }));
vi.mock('../../src/world/PhantomBlockSystem', () => ({ PhantomBlockSystem: () => null, phantomWorldPos: { x: 0, y: 0, z: 0 } }));
vi.mock('../../src/world/HurlSystem', () => ({ HurlSystem: () => null }));
vi.mock('../../src/world/SnareTetherSystem.jsx', () => ({ SnareTetherSystem: () => null }));
vi.mock('../../src/world/SquadAISystem.jsx', () => ({ SquadAISystem: () => null }));
vi.mock('../../src/world/ElementZoneSystem.jsx', () => ({ ElementZoneSystem: () => null }));

const { Player } = await import('../../src/Components.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { BASE_CAPSULE } = await import('../../src/game/beasts.js');
const { SPAWN_FREEZE_Y, SPAWN_FALLBACK_Y, SPAWN_PROBE_MAX_SEC, spawnTargetY } = await import('../../src/game/spawnPlacement.js');
const { EYE_HEIGHT_M } = await import('../../src/combat/swingOrigin.js');
const { resetInput } = await import('../../src/input/inputState.js');
const { CHUNK_SIZE } = await import('../../src/world/chunkLayout.js');

const TOL = 0.05 / 10; // the chaos gate's I1 tolerance (tests/integration/chaosPlay/suite.js says why)
const DT = 1 / 60; // @react-three/rapier 2.2.0's fixed step

// The real world's chunks round the spawn, -1 to 1 on each axis (x and z -16 to 31), as terrain.worker.js posts them. The
// worker assigns self.onmessage at module scope, so it is loaded with `self` standing in for the worker's global.
const outbox = [];
const workerSelf = { postMessage: (m) => outbox.push(m) };
const pageSelf = globalThis.self;
globalThis.self = workerSelf;
try { await import('../../src/world/terrain.worker.js'); } finally { globalThis.self = pageSelf; }
function ask(data) {
  globalThis.self = workerSelf;
  try { workerSelf.onmessage({ data }); } finally { globalThis.self = pageSelf; }
  return outbox.splice(0);
}
ask({ type: 'init', payload: {} });
const KEYS = [-1, 0, 1].flatMap((cx) => [-1, 0, 1].map((cz) => `${cx}_${cz}`));
const meshes = new Map(KEYS.map((key) => {
  const [cx, cz] = key.split('_').map(Number);
  return [key, ask({ type: 'generate', payload: { cx, cz } }).find((m) => m.type === 'chunk_mesh').payload];
}));
const CORNER = ['-1_-1', '0_-1', '-1_0', '0_0']; // the four chunks the spawn corner stands across

const isTerrain = (c) => c.shapeType() === RAPIER.ShapeType.TriMesh;
/** The solid runs [bottom, top] of the column holding (x, z) in `world`, by the faces a ray up its middle crosses from under
 *  the world: each chunk's trimesh is closed, so they pair up. */
function runsIn(world, x, z) {
  const px = Math.floor(x) + 0.5, pz = Math.floor(z) + 0.5;
  const ys = [];
  let y0 = -5;
  for (let k = 0; k < 400; k++) {
    const hit = world.castRay(new RAPIER.Ray({ x: px, y: y0, z: pz }, { x: 0, y: 1, z: 0 }), 400, false, undefined, undefined, undefined, undefined, isTerrain);
    if (!hit) break;
    const y = y0 + hit.timeOfImpact;
    ys.push(y);
    y0 = y + 1e-3;
  }
  if (ys.length % 2) throw new Error(`INSTRUMENT: the column at (${px}, ${pz}) crosses an odd number of faces: ${ys}`);
  const out = [];
  for (let i = 0; i < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
}

let t = 0, acc = 0;
const chunks = new Map();
function mountChunk(key) {
  const [cx, cz] = key.split('_').map(Number);
  const m = meshes.get(key);
  const body = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE));
  h.world.createCollider(RAPIER.ColliderDesc.trimesh(m.positions, m.indices), body);
  chunks.set(key, body);
}
function unmountChunk(key) {
  h.world.removeRigidBody(chunks.get(key));
  chunks.delete(key);
}
function makeWorld() {
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  chunks.clear();
  for (const key of KEYS) mountChunk(key);
}

beforeAll(async () => {
  await RAPIER.init();
});

// Every column at least two cells inside the chunks' edge with a run of rock over a cave: its bottom (the cave's ceiling)
// between y 1.5 and 9, and at least 3.5 m of rock in it. Three of them, spread over the scan, are the cases.
// And every column there whose top is open sky and whose neighbour at x + 1 is rock from under that top to 3 m over it:
// open ground beside a wall (a canopy or an overhang over the ground is not one).
let CAVES = [], WALLS = [], CORNER_TOP = null;
beforeAll(() => {
  makeWorld();
  h.world.step();
  for (let x = -14; x < 30; x++) for (let z = -14; z < 30; z++) {
    const runs = runsIn(h.world, x, z);
    const run = runs.find(([a, b]) => a >= 1.5 && a <= 9 && b - a >= 3.5);
    if (run) CAVES.push({ x, z, ceiling: run[0], top: run[1] });
    const floor = runs.length ? runs[runs.length - 1][1] : null;
    const wall = floor !== null && x < 29 ? runsIn(h.world, x + 1, z).find(([a, b]) => a < floor && b - floor >= 3) : null;
    if (wall) WALLS.push({ x, z, floor, wallTop: wall[1] });
  }
  CORNER_TOP = Math.max(...[[-1, -1], [0, -1], [-1, 0], [0, 0]].map(([x, z]) => Math.max(...runsIn(h.world, x, z).map((r) => r[1]))));
});
const pickCases = () => [CAVES[0], CAVES[Math.floor(CAVES.length / 2)], CAVES[CAVES.length - 1]];
const pickWalls = () => [WALLS[0], WALLS[Math.floor(WALLS.length / 2)], WALLS[WALLS.length - 1]];

/** Terrain.jsx getMobGroundLevel: a ray straight down from y = 255 at (x + 0.1, z + 0.1), the player's body excluded. */
function groundProbe(x, z) {
  const hit = h.world.castRay(new RAPIER.Ray({ x: x + 0.1, y: 255, z: z + 0.1 }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, h.body);
  return hit ? 255 - hit.timeOfImpact : null;
}
/** One display frame at `hz`: @react-three/rapier's stepper (the 1/60 s accumulator), then the Player's frame. */
function frame(hz) {
  acc += 1 / hz;
  while (acc >= DT - 1e-9) { h.world.step(); acc -= DT; }
  t += 1 / hz;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / hz);
}
const at = () => { const p = h.body.translation(); return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) }; };
const centreInRock = (p) => runsIn(h.world, p.x, p.z).some(([a, b]) => p.y > a && p.y < b);
/** The deepest the capsule reaches into the rock: over the columns its footprint covers, its radius less the distance from
 *  its core segment to each solid run's box. */
function depthInRock() {
  const c = h.body.collider(0), p = h.body.translation();
  const hh = c.halfHeight(), r = c.radius();
  let worst = 0;
  for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) {
    const dx = Math.max(x - p.x, 0, p.x - (x + 1)), dz = Math.max(z - p.z, 0, p.z - (z + 1));
    for (const [a, b] of runsIn(h.world, x, z)) worst = Math.max(worst, r - Math.hypot(dx, Math.max(a - (p.y + hh), 0, (p.y - hh) - b), dz));
  }
  return +worst.toFixed(4);
}
const warned = (warn, re) => warn.mock.calls.filter((c) => re.test(String(c[0]))).length;
const VOID = /fell into void/;

const initial = useGameStore.getInitialState();
beforeEach(() => {
  useGameStore.setState(initial, true);
  makeWorld();
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, SPAWN_FREEZE_Y, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(BASE_CAPSULE.halfHeight, BASE_CAPSULE.radius), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  t = 0; acc = 0;
  useGameStore.setState({
    isCaptureMode: false, isAlive: true, getMobGroundLevel: groundProbe, addNotification: () => {}, terrainWorker: { postMessage: () => {} },
    worldBlocks: new Map(), chests: new Map(),
  });
});
afterEach(() => {
  cleanup();
  resetInput();
  vi.restoreAllMocks();
  useGameStore.setState(initial, true);
});

/** Mount the Player and run it until it stands on the spawn corner's ground. */
function standPlayer(hz) {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  for (let i = 0; i < 40; i++) frame(hz);
  expect(h.body.translation().y, `SETUP: the Player did not stand the player on the spawn corner's ground ${JSON.stringify(at())}`).toBeCloseTo(CORNER_TOP + 0.95, 1);
}
/** Put the body at `p` with its collider, as a clip leaves it, and the camera with it as the follow-cam would have it. */
function putBody(p) {
  h.body.setTranslation(p, true);
  h.world.propagateModifiedBodyPositionsToColliders();
  h.camera.position.set(p.x, p.y + EYE_HEIGHT_M, p.z);
}

describe('a body left in the rock is stood clear where it is, in the real world (terrain.worker.js)', () => {
  for (const hz of [60, 120]) {
    for (const which of [0, 1, 2]) {
      it(`a player clipped into the rock over a cave's ceiling between y 1.5 and 9 (case ${which + 1} of 3) is stood clear within a metre, not left in the rock and not sent to the origin (${hz} Hz)`, () => {
        expect(CAVES.length, 'SETUP: the real world round the spawn has no column with a cave ceiling between y 1.5 and 9').toBeGreaterThan(20);
        const cv = pickCases()[which];
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        standPlayer(hz);
        const start = { x: cv.x + 0.5, y: cv.top - 1.5, z: cv.z + 0.5 };
        putBody(start);
        expect(centreInRock(start), `SETUP: the start is not in the rock ${JSON.stringify({ cv, start })}`).toBe(true);
        const ys = [];
        for (let i = 0; i < 3 * hz; i++) { frame(hz); ys.push(h.body.translation().y); }
        const end = at();
        const row = { case: cv, start, end, depth: depthInRock(), voids: warned(warn, VOID), drift: +(Math.max(...ys.slice(-hz / 2)) - Math.min(...ys.slice(-hz / 2))).toFixed(3) };
        // Past vitest's console capture, so the denominator and the outcome are read on a green run too.
        process.stdout.write(`\nstuck in rock, ${hz} Hz, case ${which + 1}: ${CAVES.length} columns with a cave ceiling at 1.5 to 9 in the scan; ${JSON.stringify(row)}\n`);
        expect(centreInRock(end), `the player was left with their centre in the rock ${JSON.stringify(row)}`).toBe(false);
        expect(row.depth, `the capsule reaches into the rock ${JSON.stringify(row)}`).toBeLessThanOrEqual(TOL);
        expect(centreInRock({ x: end.x, y: end.y + EYE_HEIGHT_M, z: end.z }), `the eye is in the rock ${JSON.stringify(row)}`).toBe(false);
        expect(Math.hypot(end.x - start.x, end.z - start.z), `the player was moved away from where they clipped ${JSON.stringify(row)}`).toBeLessThan(1);
        expect(row.voids, `the void guard reset the player to the origin ${JSON.stringify(row)}`).toBe(0);
        expect(row.drift, `the player is not standing (still moving over the last half second) ${JSON.stringify(row)}`).toBeLessThan(0.01);
      });
    }
  }

  // A slide that clipped sideways: the centre 0.1 m into the wall at standing height, so 0.5 m of the capsule's 0.8 m
  // width is in the wall and 0.3 m over the open ground. The nearest clear spot is beside the wall, about half a metre
  // back; the top of the columns the capsule stands across is the wall's, 3 m up or more.
  for (const hz of [60, 120]) {
    for (const which of [0, 1, 2]) {
      it(`a player clipped 0.1 m into a wall 3 m high or more (case ${which + 1} of 3) is set down beside the wall, not lifted onto its top (${hz} Hz)`, () => {
        expect(WALLS.length, 'SETUP: the real world round the spawn has no open ground beside a wall 3 m high').toBeGreaterThan(5);
        const wl = pickWalls()[which];
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        standPlayer(hz);
        const start = { x: wl.x + 1.1, y: wl.floor + BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius + 0.05, z: wl.z + 0.5 };
        putBody(start);
        expect(centreInRock(start), `SETUP: the start is not in the wall's rock ${JSON.stringify({ wl, start })}`).toBe(true);
        const ys = [];
        for (let i = 0; i < 3 * hz; i++) { frame(hz); ys.push(h.body.translation().y); }
        const end = at();
        const row = { case: wl, start, end, depth: depthInRock(), voids: warned(warn, VOID), drift: +(Math.max(...ys.slice(-hz / 2)) - Math.min(...ys.slice(-hz / 2))).toFixed(3) };
        process.stdout.write(`\nstuck in a wall, ${hz} Hz, case ${which + 1}: ${WALLS.length} columns beside a wall 3 m high in the scan; ${JSON.stringify(row)}\n`);
        expect(centreInRock(end), `the player was left with their centre in the wall ${JSON.stringify(row)}`).toBe(false);
        expect(row.depth, `the capsule reaches into the rock ${JSON.stringify(row)}`).toBeLessThanOrEqual(TOL);
        expect(end.y - start.y, `the player was lifted onto the wall's top, not set down beside it ${JSON.stringify(row)}`).toBeLessThan(0.5);
        expect(end.x, `the player is not on the open side of the wall ${JSON.stringify(row)}`).toBeLessThanOrEqual(wl.x + 1 - BASE_CAPSULE.radius);
        expect(Math.hypot(end.x - start.x, end.z - start.z), `the player was moved away from where they clipped ${JSON.stringify(row)}`).toBeLessThan(1);
        expect(row.voids, `the void guard reset the player to the origin ${JSON.stringify(row)}`).toBe(0);
        expect(row.drift, `the player is not standing (still moving over the last half second) ${JSON.stringify(row)}`).toBeLessThan(0.01);
      });
    }
  }

  // Where the falling body is when the corner's chunks land: 8 m into their rock (its centre in solid), or with their top
  // face across the capsule (the centre 0.4 m over it, the lowest point 0.5 m under it: no reading of the centre sees it).
  const LANDINGS = [
    { name: '8 m into their rock', when: (y) => y < CORNER_TOP - 8, put: null },
    { name: 'their top face across the capsule', when: (y) => y < CORNER_TOP + 3, put: () => ({ x: 0, y: CORNER_TOP + 0.4, z: 0 }) },
  ];
  for (const hz of [60, 120]) for (const landing of LANDINGS) {
    it(`the spawn's blind drop is followed: the corner's chunks landing round the falling body, ${landing.name}, leave the player on its ground, not in it (${hz} Hz)`, () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (const key of CORNER) unmountChunk(key); // not streamed yet: the probe answers nothing over the corner
      render(<Player isWorldBuilt />);
      let dropped = null, landed = null;
      for (let i = 0; i < (SPAWN_PROBE_MAX_SEC + 4) * hz; i++) {
        frame(hz);
        const y = h.body.translation().y;
        if (dropped === null && Math.abs(y - SPAWN_FREEZE_Y) > 1e-3) dropped = { t: +t.toFixed(2), y: +y.toFixed(2) };
        if (dropped && landed === null && landing.when(y)) {
          if (landing.put) putBody(landing.put());
          for (const key of CORNER) mountChunk(key);
          landed = { t: +t.toFixed(2), y: +h.body.translation().y.toFixed(2) };
        }
      }
      const row = { dropped, landed, end: at(), depth: depthInRock() };
      process.stdout.write(`\nblind drop, ${hz} Hz, chunks landing ${landing.name}: ${JSON.stringify(row)}\n`);
      expect(dropped, 'SETUP: the spawn never dropped the player').not.toBeNull();
      expect(dropped.y, `SETUP: the drop was not the blind fallback ${JSON.stringify(row)}`).toBeCloseTo(spawnTargetY(SPAWN_FALLBACK_Y), 1);
      expect(dropped.t, `SETUP: the drop came before the wait ran out ${JSON.stringify(row)}`).toBeGreaterThan(SPAWN_PROBE_MAX_SEC - 0.05);
      expect(landed, `SETUP: the corner's chunks never landed round the falling body ${JSON.stringify(row)}`).not.toBeNull();
      expect(row.end.y, `the player does not stand on the corner's ground ${JSON.stringify(row)}`).toBeCloseTo(CORNER_TOP + 0.95, 1);
      expect(row.depth, `the capsule reaches into the corner's rock ${JSON.stringify(row)}`).toBeLessThanOrEqual(TOL);
      expect(Math.hypot(row.end.x, row.end.z), `the player was moved off the corner ${JSON.stringify(row)}`).toBeLessThan(0.05);
    });
  }

  it('a reading of the centre in solid that clears within 0.15 s moves no one; held a second, the player is stood clear', () => {
    const hz = 60;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    standPlayer(hz);
    const stood = at();
    // A closed box of trimesh round the whole capsule, every face over a metre from it, its bottom in the rock under the
    // ground: the body is inside a closed mesh, as it is inside the rock, so its centre's cell reads solid, and no face is
    // near enough for the controller to touch (a unit box round the centre's cell overlaps the capsule, and the
    // controller stepped the body up onto it).
    const [cx, cy, cz] = [Math.floor(stood.x), Math.floor(stood.y), Math.floor(stood.z)];
    const [x0, x1, y0, y1, z0, z1] = [cx - 2, cx + 3, cy - 3, cy + 3, cz - 2, cz + 3];
    const box = () => h.world.createCollider(RAPIER.ColliderDesc.trimesh(
      new Float32Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]),
      new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
    ));
    // How far the body has been from where it stood, on any frame: a move it later fell back from counts too.
    const furthest = (n) => {
      let far = 0;
      for (let i = 0; i < n; i++) {
        frame(hz);
        const p = h.body.translation();
        far = Math.max(far, Math.hypot(p.x - stood.x, p.y - stood.y, p.z - stood.z));
      }
      return +far.toFixed(4);
    };
    let b = box();
    const during = furthest(0.15 * hz);
    h.world.removeCollider(b, true);
    const after = furthest(hz);
    expect(Math.max(during, after), `a reading of 0.15 s moved the player ${JSON.stringify({ stood, during, after })}`).toBeLessThan(1e-3);
    b = box();
    const held = furthest(hz);
    h.world.removeCollider(b, true);
    process.stdout.write(`\nstuck in rock, a reading of 0.15 s then one of 1 s: the furthest from the stand ${JSON.stringify({ during, after, held })}\n`);
    expect(held, `the same reading held a second did not move the player clear of the box ${JSON.stringify({ stood, held })}`).toBeGreaterThan(0.3);
    expect(warned(warn, VOID), 'the void guard fired on a player standing on the spawn corner').toBe(0);
  });
});
