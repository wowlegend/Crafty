// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import React from 'react';

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
// drei's real Outlines, imported through the ESM fiber above (the form-gauntlet gate's mapping), so the hull is drei's own.
vi.mock('@react-three/drei', async () => ({ Outlines: (await import('@react-three/drei/core/Outlines.js')).Outlines }));
const { mountR3F } = await import('./_r3f.jsx');
const { EnhancedSpellProjectile } = await import('../../src/render/spellVfx.jsx');

// MAGIC READS AS A SOLID CORE WITH AN INK LINE (feedback-grammar plan M5; W3-A PR A F4). A projectile used to be a
// translucent silhouette under two additive white-hot spheres drawn with depthTest off, which washed pale against a
// bright sky and painted through walls. Now its silhouette is the solid core (normal blending, depth written), ringed
// by the mobs' ink outline, under at most ONE additive glow shell (plus its trail). Driven on the MOUNTED projectile
// through R3F's own reconciler (tests/gates/_r3f.jsx), so a layer added back in the JSX is seen, not only a table.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 4 tests, each observed RED, an identity mutant SURVIVED:
//   K6a the fire core translucent again (depthWrite off) -> "fireball"
//   K6b the white-hot core sphere put back (additive, depthTest off) -> every element
//   K6c the ice core's ink outline dropped -> "iceball"
//   K6d the bolt's white filaments put back (depthTest off) -> "lightning"

const ELEMENTS = ['fireball', 'iceball', 'lightning', 'arcane'];

async function layers(type) {
  const projectile = { id: 1, type, size: 1, position: new THREE.Vector3(0, 60, 0), velocity: new THREE.Vector3(0, 0, -20) };
  const h = await mountR3F(<EnhancedSpellProjectile projectile={projectile} />);
  await h.step(2);
  const out = { meshes: 0, noDepthTest: 0, additive: 0, solid: 0, hulls: 0, inkedSolids: 0 };
  h.three().scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (m.uniforms?.thickness) { out.hulls += 1; return; } // a drei <Outlines> hull
    out.meshes += 1;
    if (m.depthTest === false) out.noDepthTest += 1;
    if (m.blending === THREE.AdditiveBlending) out.additive += 1;
    if (m.blending === THREE.NormalBlending && m.depthWrite && !m.transparent) {
      out.solid += 1;
      let inked = false;
      o.traverse((c) => { if (c !== o && c.isMesh && c.material?.uniforms?.thickness) inked = true; });
      if (inked) out.inkedSolids += 1;
    }
  });
  await h.unmount();
  return out;
}

describe('a spell is a solid core with an ink line, one glow and its trail', () => {
  for (const type of ELEMENTS) {
    it(`${type}: a solid, inked core; no layer drawn through walls; at most one additive shell beside the trail`, async () => {
      const l = await layers(type);
      expect(l.meshes, `the denominator: the mounted ${type} drew meshes`).toBeGreaterThanOrEqual(2);
      expect(l.noDepthTest, `${type}: layers with depthTest off ${JSON.stringify(l)}`).toBe(0);
      expect(l.additive, `${type}: additive layers (the glow shell and the trail) ${JSON.stringify(l)}`).toBeLessThanOrEqual(2);
      expect(l.solid, `${type}: a solid core ${JSON.stringify(l)}`).toBeGreaterThanOrEqual(1);
      expect(l.inkedSolids, `${type}: the core carries the ink outline ${JSON.stringify(l)}`).toBeGreaterThanOrEqual(1);
    });
  }
});
