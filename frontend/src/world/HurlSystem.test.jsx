// @vitest-environment jsdom
// HurlSystem's own frame loop, driven frame by frame through react-dom in jsdom with stub meshes: a kept grab's second
// block (Twin Grasp, Lodestone) flies beside the first, and both land. game/hurl.js flightSlot is tested on its own; this
// proves the useFrame consumer gives each throw its own slot. NOT CHECKED: the real R3F reconciler and Three meshes, the
// impact flash, the slam, and anything a browser draws.
import { it, expect, vi } from 'vitest';
import React from 'react';
import { render, act, cleanup } from '@testing-library/react';

let frame = null;
vi.mock('@react-three/fiber', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, useFrame: (cb) => { frame = cb; } };
});

import { HurlSystem } from './HurlSystem.jsx';
import { requestHurl } from '../game/hurlChannel.js';
import { makeHurl, stepHurl, MAX_FLIGHTS } from '../game/hurl.js';
import { ecs } from '../ecs/world.js';
import { GameMethods } from '../GameMethods';

const DT = 1 / 60;
const ORIGIN = { x: 0, y: 2, z: 0 };
const DIR_A = { x: 0, y: 0, z: -1 };
const DIR_B = { x: 1, y: 0, z: 0 };
// jsdom renders <mesh> as an unknown element; give it the fields the loop writes.
function stub(el) {
  if (el.__stubbed) return;
  el.__stubbed = true;
  el.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  el.rotation = { x: 0, y: 0 };
  el.scale = { setScalar() {} };
  el.material = { color: { set() {} }, emissive: { set() {} }, opacity: 0 };
}
// Where a block thrown from ORIGIN along `dir` is after `frames` frames: a mob stood there is struck about then.
function along(dir, frames) {
  const h = makeHurl(ORIGIN, dir);
  for (let i = 0; i < frames; i++) stepHurl(h, DT, []);
  return { ...h.position };
}

it('two throws 0.1 s apart both fly and both land: the second never replaces the first', () => {
  const hits = [];
  const realDamage = GameMethods.damageMob;
  const realRay = GameMethods.castWorldRay;
  GameMethods.damageMob = (id) => { hits.push(id); };
  GameMethods.castWorldRay = undefined;
  // The far mob is struck after the near one, so the first throw is still in the air when the second is thrown.
  const far = ecs.add({ id: 'far', isMob: true, type: 'zombie', position: along(DIR_A, 48) });
  const near = ecs.add({ id: 'near', isMob: true, type: 'zombie', position: along(DIR_B, 15) });
  const { container } = render(<HurlSystem />);
  const meshes = () => [...container.querySelectorAll('mesh')];
  let frames = 0;
  try {
    expect(meshes().length, 'the flight pool and the flash are not all mounted').toBe(MAX_FLIGHTS + 1);
    meshes().forEach(stub);
    for (let f = 0; f < 120; f++) {
      if (f === 0) requestHurl(ORIGIN, DIR_A, '#aaa');
      if (f === 6) requestHurl(ORIGIN, DIR_B, '#bbb');
      act(() => { frame({}, DT); });
      frames++;
    }
  } finally {
    GameMethods.damageMob = realDamage;
    GameMethods.castWorldRay = realRay;
    ecs.remove(far);
    ecs.remove(near);
    cleanup();
  }
  expect(frames).toBe(120);
  expect(hits, 'a throw made while another was in the air cut the first short, or never flew').toEqual(['near', 'far']);
});
