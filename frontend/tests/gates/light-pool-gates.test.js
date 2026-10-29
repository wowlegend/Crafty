import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { POOL_SIZE, poolFrame, registerPooledLight, pooledLightCount, makeLightRequest } from '../../src/render/lightPool.jsx';

/**
 * DYNAMIC POINT LIGHTS COME FROM A FIXED POOL (plan 2026-10-27-crafty-steady-cool, item i; refute F3).
 *
 * Every treasure chest carried a beacon pointLight, the cast hand mounted one per cast (it carries none now: the hands
 * draw in the viewmodel scene, render/viewmodel.js), every spell projectile and every
 * impact mounted one, the beast core and the boss (and each boss fireball) another — each mount and unmount changes
 * three's NUM_POINT_LIGHTS, which re-links EVERY lit shader program: a hitch at every cast, chest spawn and chest open,
 * and ~5 beacon lights in every lit fragment for the whole session. Now those sites register a REQUEST (an anchor, a
 * colour, an intensity, a reach) and a fixed number of always-mounted lights per tier (low 2, med 4, high 6) is assigned
 * each frame to the requests whose light reaches nearest the camera. The light count never changes with play.
 * This drives the real per-frame job (poolFrame) over real three Object3D anchors and real PointLights.
 * BLIND SPOT: that every site now mounts a PooledLight and no raw pointLight is the e2e's — renderer.info.programs
 * constant across 20 casts and chest spawns (tests/e2e/light-pool.spec.js).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/lightPool.jsx, receipts in the commit:
 *   L1 plausible-wrong: ranked by plain distance, not distance minus reach  -> RED expected
 *   L2 a dark (intensity 0) request still takes a slot                      -> RED expected
 *   L3 an unused pool light keeps its last intensity                        -> RED expected
 *   L4 plausible-wrong: the anchor's LOCAL position used, not its world one  -> RED expected
 *   L5 plausible-wrong: ranked farthest first                               -> RED expected
 *   L6 an unregistered request stays in the registry                       -> RED expected
 *   L0 identity (a comment edit)                                           -> must SURVIVE
 */
const at = (x, y, z, parent) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
};
const req = (anchor, { intensity = 1, distance = 6, color = '#ffd700' } = {}) => {
  const r = makeLightRequest();
  r.anchor = anchor;
  r.intensity = intensity;
  r.distance = distance;
  r.color.set(color);
  return r;
};
const pool = (n) => Array.from({ length: n }, () => new THREE.PointLight());
const camera = () => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 0, 0); c.updateMatrixWorld(); return c; };

const cleanups = [];
afterEach(() => { while (cleanups.length) cleanups.pop()(); });

describe('the pool size is per tier and never changes with play', () => {
  it('low 2, med 4, high 6', () => {
    expect(POOL_SIZE).toEqual({ low: 2, med: 4, high: 6 });
  });
});

describe('poolFrame assigns the pool to the requests that reach nearest the camera', () => {
  it('nearest by reach-adjusted distance; the rest go dark; the light count is the pool', () => {
    const scene = new THREE.Scene();
    // The fixture must make reach-adjusted and plain distance DISAGREE, or ranking by plain distance passes it (the first
    // version of this case had the boss light beat only a light plain distance also ranked below it: L1 survived).
    const near = req(at(2, 0, 0, scene));                    // 2 - 6 = -4
    const mid = req(at(9, 0, 0, scene));                     // 9 - 6 = 3   (plain distance would pick this second)
    const boss = req(at(12, 0, 0, scene), { distance: 15 }); // 12 - 15 = -3: a boss light beats a nearer small one
    const far = req(at(40, 0, 0, scene));                    // 40 - 6 = 34
    const lights = pool(2);
    const chosen = poolFrame([near, far, boss, mid], camera(), lights);
    expect(chosen.length, 'more lights assigned than the pool holds').toBe(2);
    expect(chosen, 'the wrong requests won the pool').toEqual([near, boss]);
    expect(lights.map((l) => l.position.x)).toEqual([2, 12]);
    expect(lights.map((l) => l.distance)).toEqual([6, 15]);
    expect(lights.length, 'the pool changed its own size').toBe(2);
  });

  it('a request at intensity 0 never takes a slot; an unused light is dark', () => {
    const scene = new THREE.Scene();
    const dark = req(at(1, 0, 0, scene), { intensity: 0 });
    const lit = req(at(5, 0, 0, scene), { intensity: 2.5 });
    const lights = pool(2);
    lights[1].intensity = 7; // what a previous frame left there
    const chosen = poolFrame([dark, lit], camera(), lights);
    expect(chosen).toEqual([lit]);
    expect(lights[0].intensity).toBe(2.5);
    expect(lights[1].intensity, 'an unused pool light kept shining').toBe(0);
  });

  it('the light sits at the anchor\'s WORLD position (a hand or a chest inside a moved group)', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.set(100, 50, -20);
    scene.add(group);
    const hand = req(at(0, 0.1, -0.2, group), { distance: 8, color: '#ff4400' });
    scene.updateMatrixWorld(true);
    const lights = pool(1);
    const cam = camera();
    cam.position.set(100, 50, -18);
    cam.updateMatrixWorld();
    poolFrame([hand], cam, lights);
    expect(lights[0].position.toArray().map((v) => +v.toFixed(5))).toEqual([100, 50.1, -20.2]);
    expect(lights[0].color.getHexString()).toBe('ff4400');
  });

  it('a request whose anchor is not in the scene yet (or any more) is skipped', () => {
    const orphan = req(new THREE.Object3D());
    orphan.anchor = null;
    expect(poolFrame([orphan], camera(), pool(2))).toEqual([]);
  });
});

describe('the registry', () => {
  it('a registered request is counted until it unregisters', () => {
    const before = pooledLightCount();
    const off = registerPooledLight(makeLightRequest());
    cleanups.push(off);
    expect(pooledLightCount()).toBe(before + 1);
    off();
    cleanups.pop();
    expect(pooledLightCount(), 'an unmounted light kept its request').toBe(before);
  });
});
