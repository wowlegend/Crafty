import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getToonGradient, installRim, flashableMaterial, TOON, OUTLINE, RIM } from '../../src/render/characterStyle.js';

describe('characterStyle', () => {
  it('toon gradient is a 2-band NearestFilter DataTexture (singleton)', () => {
    const g = getToonGradient();
    expect(g).toBeInstanceOf(THREE.DataTexture);
    expect(g.magFilter).toBe(THREE.NearestFilter);
    expect(g.minFilter).toBe(THREE.NearestFilter);
    expect(g.image.width).toBe(2);   // exactly 2 bands
    expect(g.image.height).toBe(1);
    const data = g.image.data;
    expect(data[0]).toBe(Math.round(TOON.shadow * 255));
    expect(data[4]).toBe(Math.round(TOON.lit * 255));
    expect(getToonGradient()).toBe(g); // memoized — same instance
  });

  it('installRim wires fresnel uniforms + a stable program cache key', () => {
    const m = new THREE.MeshToonMaterial();
    installRim(m, { color: '#bfe2ff', power: 2.5, strength: 0.35 });
    expect(m.userData.rim.uRimColor.value).toBeInstanceOf(THREE.Color);
    expect(m.userData.rim.uRimPower.value).toBeCloseTo(2.5);
    expect(m.userData.rim.uRimStrength.value).toBeCloseTo(0.35);
    expect(typeof m.onBeforeCompile).toBe('function');
    expect(m.customProgramCacheKey()).toBe('mobToonRim');
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <dithering_fragment>' };
    m.onBeforeCompile(shader);
    expect(shader.uniforms.uRimStrength).toBe(m.userData.rim.uRimStrength);
    expect(shader.fragmentShader).toContain('uRimColor');
    expect(shader.fragmentShader).toContain('uRimStrength');
    // ordering guard (regression vs a future three chunk rename): rim write
    // lands AFTER <common> uniform decls and BEFORE the dithering include.
    const fs = shader.fragmentShader;
    expect(fs.indexOf('gl_FragColor.rgb +=')).toBeGreaterThan(fs.indexOf('#include <common>'));
    expect(fs.indexOf('gl_FragColor.rgb +=')).toBeLessThan(fs.indexOf('#include <dithering_fragment>'));
  });

  it('flashableMaterial allows Standard+Toon, rejects Basic+Shader (outline)', () => {
    expect(flashableMaterial(new THREE.MeshStandardMaterial())).toBe(true);
    expect(flashableMaterial(new THREE.MeshToonMaterial())).toBe(true);
    expect(flashableMaterial(new THREE.MeshBasicMaterial())).toBe(false);
    expect(flashableMaterial(new THREE.ShaderMaterial())).toBe(false);
    expect(flashableMaterial(null)).toBe(false);
  });

  it('config constants are in sane stylized ranges', () => {
    expect(TOON.shadow).toBeGreaterThan(0.3);
    expect(TOON.shadow).toBeLessThan(TOON.lit);
    expect(OUTLINE.mob.thickness).toBeGreaterThan(0);
    expect(RIM.strength).toBeGreaterThan(0);
  });
});
