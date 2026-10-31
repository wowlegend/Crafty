// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import React, { Suspense } from 'react';

/**
 * THE BLOCK-BREAK DEBRIS IS DRAWN WHILE IT LIVES, GONE WHEN IT DIES, AND COSTS NOTHING WHILE IT WAITS
 * (world/BlockParticleSystem.jsx: 200 dynamic cubes, eight a broken block, 2 s each).
 *
 * Three defects, one pool (registry AUDIT:silent:block-debris-frustum-culled, AUDIT:ultra:ultra-player-world-8):
 *  - three culls an InstancedMesh by a bounding sphere computed once, from the instances at the park far below the world,
 *    so the debris was almost never drawn wherever a block was mined;
 *  - a dead cube is parked asleep, and @react-three/rapier 2.2 writes no instance matrix for a sleeping body, so with the
 *    cull off the dead debris stays drawn where it came to rest until its slot is reused (the half-fix's trap);
 *  - every body was made dynamic and awake at one point under the world, so all 200 fell, overlapping, from mount.
 *
 * Mounted: the real BlockParticleSystem under the real <Physics> of @react-three/rapier 2.2 (its ESM build, so it shares
 * the reconciler) through R3F's own createRoot, with a renderer whose render() runs three r172's own cull decision
 * (WebGLRenderer.projectObject: visible, layers, then `!frustumCulled || frustum.intersectsObject(object)`), and the
 * debris' worker message sent as the terrain worker sends it. Each row reads its instrument's positive case first.
 *
 * WHAT THIS DOES NOT CHECK: pixels or a GPU (the lookbook is read by a person), the debris' colour, what the world's
 * queries see of it (tests/gates/verb-ledger-gates.test.jsx, tests/gates/player-debris-gates.test.jsx).
 *
 * Mutation-Proof: see the commit trailer.
 */

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('@react-three/rapier', () => import('@react-three/rapier/dist/react-three-rapier.esm.js'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const _proj = new THREE.Matrix4();
const frustum = new THREE.Frustum();
/** A renderer that draws nothing and records what three's own cull would draw. */
function cullingRenderer(canvas) {
  return {
    domElement: canvas, shadowMap: { enabled: false, type: THREE.PCFShadowMap }, xr: null,
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping, toneMappingExposure: 1,
    setPixelRatio() {}, getPixelRatio: () => 1, setSize() {}, dispose() {},
    getDrawingBufferSize: (t) => t.set(canvas.width, canvas.height),
    drawn: new Set(),
    render(scene, camera) {
      if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
      if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();
      _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(_proj);
      const drawn = new Set();
      const project = (o) => {
        if (o.visible === false) return;
        if (o.layers.test(camera.layers) && (o.isMesh || o.isLine || o.isPoints)) {
          if (!o.frustumCulled || frustum.intersectsObject(o)) drawn.add(o);
        }
        for (const c of o.children) project(c);
      };
      project(scene);
      this.drawn = drawn;
    },
  };
}

const listeners = new Set();
const worker = {
  addEventListener(t, fn) { if (t === 'message') listeners.add(fn); },
  removeEventListener(t, fn) { listeners.delete(fn); },
  postMessage() {},
};
const breakBlock = (x, y, z) => { for (const fn of listeners) fn({ data: { type: 'block_broken', payload: { x, y, z, color: '#7a5230', blockType: 2 } } }); };

let root, store, act, advance, mesh, rapierWorld, t = 0;
const H = { rapier: null };
const step = async (n = 1) => {
  for (let i = 0; i < n; i++) { t += 1 / 60; await act(async () => { advance(t, true, store.getState()); }); }
};
const camera = () => store.getState().camera;
const look = (eye, at) => { camera().position.set(...eye); camera().lookAt(...at); camera().updateMatrixWorld(); };
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
/** Instance i as it would be drawn: in the camera's frustum with a nonzero scale. */
const instanceShown = (i) => {
  mesh.getMatrixAt(i, _m);
  _m.decompose(_p, _q, _s);
  return _s.x * _s.y * _s.z > 1e-9 && frustum.containsPoint(_p);
};
const awakeDynamic = () => {
  let n = 0;
  rapierWorld.forEachRigidBody((b) => { if (b.isDynamic() && !b.isSleeping()) n++; });
  return n;
};
const dynamicBodies = () => {
  const out = [];
  rapierWorld.forEachRigidBody((b) => { if (b.isDynamic()) out.push(b); });
  return out;
};

beforeAll(async () => {
  let createRoot, extend;
  ({ createRoot, advance, act, extend } = await import('@react-three/fiber'));
  const { Physics, RigidBody, CuboidCollider, useRapier } = await import('@react-three/rapier');
  const { BlockParticleSystem } = await import('../../src/world/BlockParticleSystem.jsx');
  extend(THREE);
  function RapierProbe() { H.rapier = useRapier(); return null; }
  const canvas = document.createElement('canvas');
  root = createRoot(canvas);
  await act(async () => {
    await root.configure({
      gl: () => cullingRenderer(canvas), frameloop: 'never', size: { width: 1600, height: 900, top: 0, left: 0 },
      camera: { fov: 75, near: 0.1, far: 500, position: [0, 30, 0] }, events: undefined,
    });
  });
  await act(async () => {
    store = root.render(
      <Suspense fallback={null}>
        <Physics gravity={[0, -30, 0]}>
          <RapierProbe />
          <RigidBody type="fixed" colliders={false}><CuboidCollider args={[200, 0.5, 200]} position={[0, 19.5, 0]} /></RigidBody>
          <BlockParticleSystem worker={worker} />
        </Physics>
      </Suspense>,
    );
  });
  for (let i = 0; i < 400 && !(mesh && listeners.size > 0 && H.rapier); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    store.getState().scene.traverse((o) => { if (o.isInstancedMesh) mesh = o; });
  }
  expect(mesh?.count, 'SETUP: the debris pool did not mount').toBe(200);
  expect(listeners.size, 'SETUP: the debris does not listen to the worker').toBe(1);
  rapierWorld = H.rapier.world;
});
afterAll(async () => { await act(async () => { root.unmount(); }); });

describe('at mount, before any block breaks', () => {
  it('no debris body is awake, none falls, and no two parked bodies overlap', async () => {
    const bodies = dynamicBodies();
    expect(bodies.length, 'SETUP: the pool has not made its 200 bodies').toBe(200);
    // The instrument reads an awake body: one woken by hand counts, then is put back.
    bodies[0].wakeUp();
    expect(awakeDynamic(), 'SETUP: the awake count does not see an awake body').toBeGreaterThanOrEqual(1);
    bodies[0].sleep();
    let mostAwake = 0;
    const y0 = bodies.map((b) => b.translation().y);
    for (let f = 0; f < 120; f++) { await step(1); mostAwake = Math.max(mostAwake, awakeDynamic()); }
    const fell = bodies.filter((b, i) => b.translation().y < y0[i] - 0.01).length;
    const ps = bodies.map((b) => b.translation());
    let overlaps = 0;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      if (Math.abs(ps[i].x - ps[j].x) < 0.25 && Math.abs(ps[i].y - ps[j].y) < 0.25 && Math.abs(ps[i].z - ps[j].z) < 0.25) overlaps++;
    }
    expect({ mostAwake, fell, overlaps }, 'the pool is awake, falling or stacked inside itself at mount')
      .toEqual({ mostAwake: 0, fell: 0, overlaps: 0 });
  });
});

describe('a block broken in view', () => {
  it('its debris is drawn while it lives, and none of it is drawn once it has died', async () => {
    // A mine 40 m from spawn, looking at the block (probe 35's scene A).
    look([40.5, 21.6, -26.5], [40.5, 20.5, -29.5]);
    breakBlock(40, 20, -30);
    let inView = 0, drawn = 0;
    for (let f = 0; f < 60; f++) {
      await step(1);
      const gl = store.getState().gl;
      if ([...Array(200).keys()].some(instanceShown)) inView++;
      if (gl.drawn.has(mesh)) drawn++;
    }
    expect(inView, 'SETUP: no live debris lay in the camera\'s view, so this measured nothing').toBe(60);
    expect(drawn, 'live debris in view was culled').toBe(60);
    expect(awakeDynamic(), 'SETUP: the burst woke no bodies').toBeGreaterThanOrEqual(1);

    // Past its 2 s: every cube is dead.
    await step(90);
    const gl = store.getState().gl;
    const shown = [...Array(200).keys()].filter(instanceShown);
    expect({ meshDrawn: gl.drawn.has(mesh), shown: shown.length, awake: awakeDynamic() },
      'dead debris is still drawn where it came to rest, or still awake').toEqual({ meshDrawn: true, shown: 0, awake: 0 });
  });
});
