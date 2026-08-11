import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { installHeightFog } from '../../src/render/Atmosphere.jsx';

// INSTANCED GRASS WAS FOGGED AT ONE ALTITUDE, WHATEVER HILL IT SAT ON.
//
// The height-fog patch derived world Y as `modelMatrix * transformed` — correct for an ordinary mesh, and
// wrong for every instance of an InstancedMesh, whose per-instance placement lives in instanceMatrix and
// not in modelMatrix. The grass is instanced, one instancedMesh per chunk across ~81 chunks, so every
// blade reported the y of its CHUNK ORIGIN rather than its own. The whole field took the same fog density
// regardless of the terrain beneath it, which reads as fog that ignores the hills it is draped over.
//
// This EXECUTES the patch (it mutates THREE.ShaderChunk, which is observable) rather than asserting the
// source contains a string, because what matters is what three ends up compiling.
describe('height fog — the world Y of an INSTANCE', () => {
  const chunk = () => {
    installHeightFog();
    return THREE.ShaderChunk.fog_vertex;
  };

  it('installs a fog_vertex chunk at all — otherwise everything below is vacuous', () => {
    const src = chunk();
    expect(typeof src).toBe('string');
    expect(src.length).toBeGreaterThan(40);
    expect(src, 'the height varying is gone; this is not the patched chunk').toContain('vFogWorldY');
  });

  it('multiplies by instanceMatrix on the instanced path', () => {
    expect(chunk()).toMatch(/modelMatrix \* instanceMatrix \* vec4\( transformed, 1\.0 \)/);
  });

  it('guards that path with USE_INSTANCING, which three defines only for an InstancedMesh', () => {
    // Without the guard the shader fails to compile for ordinary meshes, where instanceMatrix does not
    // exist — the fix would swap a subtle wrongness for a black screen.
    const src = chunk();
    expect(src).toContain('#ifdef USE_INSTANCING');
    expect(src).toContain('#else');
    // Anchored to the ASSIGNMENT, not to the first mention of the word: the explanatory comment above
    // names instanceMatrix too, and matching that made this assertion fail on prose.
    const guardAt = src.indexOf('#ifdef USE_INSTANCING');
    const assignAt = src.search(/vFogWorldY\s*=\s*\(\s*modelMatrix \* instanceMatrix/);
    expect(assignAt, 'the instanced assignment is missing').toBeGreaterThan(-1);
    expect(assignAt, 'the instanced assignment sits outside the guard').toBeGreaterThan(guardAt);
  });

  it('keeps the NON-instanced path intact for ordinary meshes', () => {
    const src = chunk();
    const elseAt = src.indexOf('#else');
    const plain = src.slice(elseAt);
    expect(plain, 'the ordinary-mesh path lost its world-space transform').toMatch(/modelMatrix \* vec4\( transformed, 1\.0 \)/);
    expect(plain.includes('instanceMatrix'), 'the ordinary path references instanceMatrix, which does not exist there').toBe(false);
  });

  it('is idempotent — installing twice must not nest the patch', () => {
    installHeightFog();
    const once = THREE.ShaderChunk.fog_vertex;
    installHeightFog();
    expect(THREE.ShaderChunk.fog_vertex).toBe(once);
  });
});
