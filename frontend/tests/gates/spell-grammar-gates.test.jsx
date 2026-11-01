// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import React from 'react';

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
// drei's real Outlines, imported through the ESM fiber above (the form-gauntlet gate's mapping), so the hull is drei's own.
vi.mock('@react-three/drei', async () => ({ Outlines: (await import('@react-three/drei/core/Outlines.js')).Outlines }));
const { mountR3F } = await import('./_r3f.jsx');
const { EnhancedSpellProjectile } = await import('../../src/render/spellVfx.jsx');
const { buildIceShards } = await import('../../src/render/spellGeometry.js');

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
// and against all 5, the ice crystal's test (each RED, an identity mutant SURVIVED):
//   K8a the crystal unindexed again (Outlines rewrites its normals) -> "two ice projectiles in a row"
//   K8b the crystal disposed when a projectile unmounts -> "two ice projectiles in a row"
//   K8c a crystal cloned per projectile -> "two ice projectiles in a row"

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

// THE INK NEVER TOUCHES THE SHARED CRYSTAL. Every ice projectile draws one module-level shard geometry. drei's <Outlines>
// builds its hull from the parent's geometry with toCreasedNormals, which copies only an INDEXED geometry and otherwise
// rewrites the normals in place, then disposes that geometry on unmount: so a non-indexed crystal was smoothed into a
// blob by the first cast and disposed under every live ice projectile when one ended. Two casts in a row, as the game
// plays them: the second still draws the crystal the module built, with its facet normals, and nothing disposed it.
describe('the ice core keeps its shared crystal across casts', () => {
  it('two ice projectiles in a row: the shard geometry keeps its facet normals and is never disposed', async () => {
    const fresh = Array.from(buildIceShards().attributes.normal.array);
    const seen = [];
    let disposed = 0;
    for (const id of [1, 2]) {
      const projectile = { id, type: 'iceball', size: 1, position: new THREE.Vector3(0, 60, 0), velocity: new THREE.Vector3(0, 0, -20) };
      const h = await mountR3F(<EnhancedSpellProjectile projectile={projectile} />);
      await h.step(2);
      let core = null, hull = null;
      h.three().scene.traverse((o) => {
        if (o.isMesh && o.material?.isMeshStandardMaterial && o.material.vertexColors) core = o;
      });
      core?.traverse((c) => { if (c !== core && c.isMesh && c.material?.uniforms?.thickness) hull = c; });
      expect(core, `cast ${id}: the mounted ice core`).not.toBeNull();
      expect(hull, `cast ${id}: the ice core's ink hull`).not.toBeNull();
      const g = core.geometry;
      if (!seen.includes(g)) { seen.push(g); g.addEventListener('dispose', () => { disposed += 1; }); }
      const normals = Array.from(g.attributes.normal.array);
      expect(normals.length, `cast ${id}: the denominator, normals compared`).toBe(fresh.length);
      const moved = normals.filter((v, i) => Math.abs(v - fresh[i]) > 1e-6).length;
      expect(moved, `cast ${id}: facet normals rewritten on the shared crystal`).toBe(0);
      await h.unmount();
      expect(disposed, `cast ${id}: the shared crystal disposed when a projectile ended`).toBe(0);
    }
    expect(seen.length, 'both casts drew the one module-level crystal').toBe(1);
  });
});
