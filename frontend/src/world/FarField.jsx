// FarField.jsx — draws the far horizon (world/farField.js): land and sea beyond the loaded chunks, out to
// FAR_OUTER, from the same column sampler the game already uses. Spec:
// docs/superpowers/specs/2026-09-22-crafty-far-horizon-design.md.
//
// ONE mesh, lit and fogged like the terrain (sun, ambient, fog, the height-fog patch) and hazed by the SAME
// aerial-perspective lines (render/aerialPerspective.js), so where the loaded terrain meets it there is no
// change of treatment to read as a seam. Flat-shaded vertex colours: bold-flat, no textures at 400 m.
//
// Rebuilt ONLY when the player crosses a FAR_RECENTRE cell (snapCentre), never per frame — the geometry is a
// pure function of that cell, so the ring does not swim and a capture (pinned player) is deterministic.
// Game-Loop-Isolation: the player position is a transient read in useFrame, never a subscription.
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { surfaceBlockAt } from './climate.js';
import { createProceduralVoxelTextures } from './proceduralTextures.js';
import { farFieldGeometry, farRadii, snapCentre, layerMeanLinear, FAR_OUTER } from './farField.js';
import { aerialGlsl } from '../render/aerialPerspective.js';
import { moodRef, sampleMood } from '../render/mood.js';

const AERIAL_GLSL = aerialGlsl();

function makeFarMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.skyHorizon = { value: new THREE.Color(0.6, 0.75, 0.9) };
    shader.fragmentShader = 'uniform vec3 skyHorizon;\n' + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
        ${AERIAL_GLSL}`,
    );
    mat.userData.shader = shader;
  };
  return mat;
}

export function FarField({ renderDistance }) {
  const means = useMemo(() => {
    const tex = createProceduralVoxelTextures();
    const m = layerMeanLinear(tex);
    tex.dispose();
    return m;
  }, []);
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(makeFarMaterial, []);
  const builtFor = useRef(null); // `${cx},${cz},${renderDistance}` of the geometry on the GPU
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame(() => {
    const shader = mat.userData.shader;
    if (shader) shader.uniforms.skyHorizon.value.copy(sampleMood(moodRef.current).skyHorizon);

    const p = useGameStore.getState().playerPosition;
    if (!p) return;
    const c = snapCentre(p.x, p.z);
    const key = `${c.x},${c.z},${renderDistance}`;
    if (builtFor.current === key) return;
    builtFor.current = key;
    const { inner, canopyFrom } = farRadii(renderDistance);
    const { positions, colors, index } = farFieldGeometry({
      cx: c.x, cz: c.z, r0: inner, r1: FAR_OUTER, canopyFrom, sample: surfaceBlockAt, means,
    });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} receiveShadow={false} castShadow={false} />;
}
