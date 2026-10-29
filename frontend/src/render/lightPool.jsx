// lightPool — dynamic point lights come from a fixed pool (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// item i; refute F3).
//
// Every treasure chest carried a beacon <pointLight>, the cast hand mounted one per cast, every spell projectile and every
// spell impact mounted one, and so did the beast core, the boss and each boss fireball. three bakes the point-light COUNT
// into every lit shader (NUM_POINT_LIGHTS), so each of those mounts and unmounts re-linked every lit program — a hitch at
// every cast, every chest spawn and every chest open — and at steady state ~5 chest beacons sat in every lit fragment
// for the whole session.
//
// Now those sites mount a <PooledLight>: an anchor in the scene graph plus a REQUEST (colour, intensity, reach, decay).
// <PointLightPool> mounts a fixed number of real lights per tier and, each frame, gives them to the requests whose light
// reaches nearest the camera (distance minus reach, so a boss light 20 m away outranks a chest beacon 10 m away); the rest
// go dark. The light count changes only on a tier step. Always-mounted lights (Atmosphere's fill, the Hearth brazier, the
// phantom block's intensity-gated light) never changed the count and stay as they are. The first-person hands request
// none: they draw in the viewmodel scene (render/viewmodel.js), whose ember cores the bloom carries.
//
// COST, stated: pool lights at intensity 0 still cost every lit fragment (the shader loops NUM_POINT_LIGHTS). At high the
// pool's 6 is one more than today's 5-beacon steady state; at low (2) and med (4) it is fewer. The point is the constant.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { registerTestHook } from '../devtest/testBridge.js';

/** Pool lights per quality tier. */
export const POOL_SIZE = { low: 2, med: 4, high: 6 };

const requests = new Set();

// Every point light the world draws with: the pool's and the always-mounted ones (WorldPointLight). The first-person
// hands take the strongest of them at the eye (render/viewmodel.js mirrorPointLights). An array, so a frame's walk
// over it allocates no iterator.
const worldLights = [];

/** Register a world point light for the hands to take; returns the unregister. */
export function registerWorldLight(light) {
  worldLights.push(light);
  return () => {
    const i = worldLights.indexOf(light);
    if (i >= 0) worldLights.splice(i, 1);
  };
}

/** The world's point lights, live. Read-only. */
export function worldPointLights() {
  return worldLights;
}

/** A <pointLight> that is always mounted (the Hearth's brazier, the danger fill, the phantom block's), registered so the
 *  hands take it. Its props are named, not spread, so no caller can switch on a point light's six-pass shadow
 *  (tests/gates/dynamic-light-gates.test.js); `ref` is the light. */
export const WorldPointLight = forwardRef(function WorldPointLight({ position, color = '#ffffff', intensity = 1, distance = 0, decay = 2 }, ref) {
  const light = useRef(null);
  useImperativeHandle(ref, () => light.current, []);
  useLayoutEffect(() => registerWorldLight(light.current), []);
  return <pointLight ref={light} position={position} color={color} intensity={intensity} distance={distance} decay={decay} />;
});

/** A request: where (anchor), what colour, how bright, how far it reaches (0 = unbounded), its decay. */
export function makeLightRequest() {
  return { anchor: null, world: new THREE.Vector3(), color: new THREE.Color(), intensity: 0, distance: 0, decay: 2, score: 0, lightsHands: true };
}

/** @returns {() => void} unregister */
export function registerPooledLight(req) {
  requests.add(req);
  return () => requests.delete(req);
}

export function pooledLightCount() {
  return requests.size;
}

const byScore = (a, b) => a.score - b.score;
const candidates = [];
const camPos = new THREE.Vector3();

/**
 * The per-frame job. Finds every lit, anchored request's WORLD position, ranks by (distance to the camera - reach), gives
 * the first `lights.length` to the pool and darkens the rest of the pool.
 * @param {Iterable<object>} reqs
 * @param {THREE.Camera} camera
 * @param {THREE.PointLight[]} lights the pool (its length is the pool size)
 * @returns {object[]} the requests that got a light, in pool order
 */
export function poolFrame(reqs, camera, lights) {
  camera.getWorldPosition(camPos);
  candidates.length = 0;
  for (const r of reqs) {
    if (!(r.intensity > 0) || !r.anchor) continue;
    r.anchor.getWorldPosition(r.world);
    r.score = r.world.distanceTo(camPos) - (r.distance || 0);
    candidates.push(r);
  }
  candidates.sort(byScore);
  const n = Math.min(lights.length, candidates.length);
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    if (!L) continue;
    if (i < n) {
      const r = candidates[i];
      L.position.copy(r.world);
      L.color.copy(r.color);
      L.intensity = r.intensity;
      L.distance = r.distance;
      L.decay = r.decay;
      L.userData.lightsHands = r.lightsHands;
    } else if (L.intensity !== 0) {
      L.intensity = 0;
    }
  }
  return candidates.slice(0, n);
}

/** Mount once, at the scene root (world space): the tier's fixed set of point lights, assigned every frame. */
export function PointLightPool() {
  const tier = useGameStore((s) => s.qualityTier);
  const n = POOL_SIZE[tier] ?? POOL_SIZE.low;
  const lights = useRef([]);
  useFrame(({ camera }) => {
    lights.current.length = n;
    poolFrame(requests, camera, lights.current);
  });
  useLayoutEffect(() => {
    const offs = lights.current.slice(0, n).filter(Boolean).map(registerWorldLight);
    return () => { for (const off of offs) off(); };
  }, [n]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // DEV-only: the light-pool e2e reads the registry and the pool.
    registerTestHook('readLightPool', () => ({ requests: requests.size, pool: n }));
  }, [n]);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <pointLight key={i} ref={(el) => { lights.current[i] = el; }} intensity={0} />
      ))}
    </>
  );
}

/**
 * Drop-in for a <pointLight> that mounts and unmounts with gameplay. Props as the light's; `ref` exposes the request,
 * so an imperative `ref.current.intensity = x` (a fading impact) keeps working. Props apply on CHANGE only, as R3F's do,
 * so a re-render does not overwrite an intensity a frame loop is driving. `lightsHands={false}` keeps the light off the
 * first-person hands (render/viewmodel.js mirrorPointLights): a light inside the player's own body, which in the world
 * would stand between it and the hands.
 */
export const PooledLight = forwardRef(function PooledLight({ position, color = '#ffffff', intensity = 1, distance = 0, decay = 2, lightsHands = true }, ref) {
  const anchor = useRef(null);
  const req = useMemo(makeLightRequest, []);
  useLayoutEffect(() => { req.color.set(color); }, [req, color]);
  useLayoutEffect(() => { req.intensity = intensity; }, [req, intensity]);
  useLayoutEffect(() => { req.distance = distance; }, [req, distance]);
  useLayoutEffect(() => { req.decay = decay; }, [req, decay]);
  useLayoutEffect(() => { req.lightsHands = lightsHands; }, [req, lightsHands]);
  useLayoutEffect(() => {
    req.anchor = anchor.current;
    const off = registerPooledLight(req);
    return () => {
      off();
      req.anchor = null;
    };
  }, [req]);
  useImperativeHandle(ref, () => req, [req]);
  return <group ref={anchor} position={position} />;
});
