import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { resetShadowForConfig } from '../../src/render/shadowReset.js';

/**
 * A SHADOW THAT FOLLOWS ITS TIER (plan 2026-09-23-crafty-perf-heat-ipad, Task 5).
 *
 * three r172 allocates a light's shadow render target — and updates the shadow camera's projection — only while
 * `shadow.map === null` (WebGLShadowMap.render), yet takes the per-frame viewport from the CURRENT `mapSize`. So a
 * quality-tier change kept the first tier's target under the new tier's viewport, over a stale frustum. This pins the
 * reset on a real THREE.DirectionalLight: the target is dropped (three re-allocates it at the new size) and the
 * projection follows the new extents.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   S1 the map kept (not nulled) -> the drop case
 *   S2 plausible-wrong: nulled without dispose (the old GPU target leaks) -> the dispose case
 *   S3 the projection not refreshed -> the frustum case
 *
 * BLIND SPOT: nothing here renders. That the live renderer re-allocates at the new size is
 * tests/e2e/shadow-tier.spec's job (it reads the real target's width after a tier step).
 */
describe('resetShadowForConfig', () => {
  it('drops the target, disposing it, so three builds a new one at the current mapSize', () => {
    const light = new THREE.DirectionalLight();
    let disposed = 0;
    light.shadow.map = { width: 512, height: 512, dispose: () => { disposed++; } };
    light.shadow.mapSize.set(2048, 2048);
    expect(resetShadowForConfig(light.shadow)).toBe(true);
    expect(light.shadow.map, 'the 512 target survived a 2048 map').toBeNull();
    expect(disposed, 'the old target was dropped without being freed').toBe(1);
  });
  it('refreshes the shadow camera projection to the new extents', () => {
    const light = new THREE.DirectionalLight();
    const cam = light.shadow.camera;
    cam.left = -40; cam.right = 40; cam.top = 40; cam.bottom = -40;
    cam.updateProjectionMatrix();
    const before = cam.projectionMatrix.elements[0];
    cam.left = -72; cam.right = 72; cam.top = 72; cam.bottom = -72; // the tier widened the extent
    resetShadowForConfig(light.shadow);
    expect(cam.projectionMatrix.elements[0], 'the frustum is still the old tier').not.toBe(before);
    expect(cam.projectionMatrix.elements[0]).toBeCloseTo(2 / 144, 9);
  });
  it('no target yet (before the first shadow render) and no shadow at all are no-ops', () => {
    const light = new THREE.DirectionalLight();
    expect(resetShadowForConfig(light.shadow)).toBe(false);
    expect(resetShadowForConfig(null)).toBe(false);
  });
});
