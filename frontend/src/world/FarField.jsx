// FarField.jsx — draws the far horizon (world/farField.js): land and sea beyond the loaded chunks, out to
// FAR_OUTER, from the same column sampler the game already uses. Spec:
// docs/superpowers/specs/2026-09-22-crafty-far-horizon-design.md.
//
// ONE mesh, lit and fogged like the terrain (sun, ambient, fog, the height-fog patch) and hazed by the SAME
// aerial-perspective lines (render/aerialPerspective.js), so where the loaded terrain meets it there is no
// change of treatment to read as a seam. Flat-shaded vertex colours: bold-flat, no textures at 400 m.
//
// HOLE-PUNCHED by the loaded chunks (QUEUE R3.9): the ring sits at the true surface and its fragment shader
// discards over every chunk Terrain has on screen (world/loadedChunks.js), read as a 32x32 R8 mask around the
// player. So real terrain and its impostor never overlap, and there is no sink to get wrong.
//
// Rebuilt ONLY when the player crosses a FAR_RECENTRE cell (snapCentre), never per frame — the geometry is a
// pure function of that cell, so the ring does not swim and a capture (pinned player) is deterministic. The
// mask is rebuilt only when the loaded set's version or the player's chunk changes.
// Game-Loop-Isolation: the player position is a transient read in useFrame, never a subscription.
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { surfaceBlockAt } from './climate.js';
import { createProceduralVoxelTextures } from './proceduralTextures.js';
import { farFieldGeometry, farInnerRadius, snapCentre, layerMeanLinear, FAR_OUTER } from './farField.js';
import { LOADED_MASK_SIZE, buildLoadedMask, loadedMaskGlsl, loadedChunkSet, loadedChunksVersion } from './loadedChunks.js';
import { aerialGlsl } from '../render/aerialPerspective.js';
import { moodRef, sampleMood } from '../render/mood.js';

const AERIAL_GLSL = aerialGlsl();
const LOADED_MASK_GLSL = loadedMaskGlsl();

function makeFarMaterial(maskTex, maskOrigin) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.skyHorizon = { value: new THREE.Color(0.6, 0.75, 0.9) };
    shader.uniforms.uLoadedMask = { value: maskTex };
    shader.uniforms.uMaskOrigin = { value: maskOrigin };
    shader.vertexShader = 'varying vec2 vFarXZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
        vFarXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`,
    );
    shader.fragmentShader = 'uniform vec3 skyHorizon;\nuniform sampler2D uLoadedMask;\nuniform vec2 uMaskOrigin;\nvarying vec2 vFarXZ;\n'
      + shader.fragmentShader
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
        ${LOADED_MASK_GLSL}`,
        )
        .replace(
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
  const mask = useMemo(() => {
    const data = new Uint8Array(LOADED_MASK_SIZE * LOADED_MASK_SIZE);
    const tex = new THREE.DataTexture(data, LOADED_MASK_SIZE, LOADED_MASK_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    tex.needsUpdate = true;
    return { data, tex, origin: new THREE.Vector2() };
  }, []);
  const mat = useMemo(() => makeFarMaterial(mask.tex, mask.origin), [mask]);
  const builtFor = useRef(null); // `${cx},${cz},${renderDistance}` of the geometry on the GPU
  const maskFor = useRef(null); // `${version},${chunkX},${chunkZ}` of the mask on the GPU
  useEffect(() => () => { geo.dispose(); mat.dispose(); mask.tex.dispose(); }, [geo, mat, mask]);

  useFrame(() => {
    const shader = mat.userData.shader;
    if (shader) shader.uniforms.skyHorizon.value.copy(sampleMood(moodRef.current).skyHorizon);

    const p = useGameStore.getState().playerPosition;
    if (!p) return;

    const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    const mkey = `${loadedChunksVersion()},${pcx},${pcz}`;
    if (maskFor.current !== mkey) {
      maskFor.current = mkey;
      const m = buildLoadedMask(loadedChunkSet(), pcx, pcz, LOADED_MASK_SIZE, mask.data);
      mask.origin.set(m.originX, m.originZ);
      mask.tex.needsUpdate = true;
    }

    const c = snapCentre(p.x, p.z);
    const key = `${c.x},${c.z},${renderDistance}`;
    if (builtFor.current === key) return;
    builtFor.current = key;
    const { positions, colors, index } = farFieldGeometry({
      cx: c.x, cz: c.z, r0: farInnerRadius(renderDistance), r1: FAR_OUTER, sample: surfaceBlockAt, means,
    });
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} receiveShadow={false} castShadow={false} />;
}
