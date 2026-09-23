// FarField.jsx — draws the far horizon (world/farField.js): land and sea beyond the loaded chunks, out to
// FAR_OUTER, from the same column sampler the game already uses. Spec:
// docs/superpowers/specs/2026-09-22-crafty-far-horizon-design.md.
//
// ONE mesh, lit and fogged like the terrain (sun, ambient, fog, the height-fog patch) and treated by the SAME
// generated lines as the terrain: the danger-mood grade (render/landGrade.js), the cloud shadows
// (render/cloudField.js) and the aerial haze (render/aerialPerspective.js) — so where the loaded terrain meets
// it there is no change of treatment to read as a seam, least of all in the boss fight (QUEUE R3.7).
// Flat-shaded vertex colours: bold-flat, no textures at 400 m.
//
// HOLE-PUNCHED by the loaded chunks (QUEUE R3.9): the ring sits at the true surface and its fragment shader
// discards over every chunk Terrain has on screen (world/loadedChunks.js), read as a 64x64 R8 mask around the
// player. So real terrain and its impostor never overlap, and there is no sink to get wrong.
//
// Rebuilt ONLY when the player crosses a FAR_RECENTRE cell (snapCentre), never per frame — the geometry is a
// pure function of that cell, so the ring does not swim and a capture (pinned player) is deterministic. A
// rebuild refills ONE persistent set of buffers; the index is built once (QUEUE R3.10). The mask is rebuilt
// only when the loaded set's version or the player's chunk changes.
// Game-Loop-Isolation: the player position is a transient read in useFrame, never a subscription.
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { surfaceBlockAt } from './climate.js';
import { sharedVoxelTextures } from './proceduralTextures.js';
import {
  farFieldVertices, farFieldIndex, farInnerRadius, snapCentre, layerMeanLinear, FAR_OUTER, FAR_RINGS, FAR_SECTORS,
} from './farField.js';
import { LOADED_MASK_SIZE, buildLoadedMask, loadedMaskGlsl, loadedChunkSet, loadedChunksVersion, chunkOf } from './loadedChunks.js';
import { aerialGlsl } from '../render/aerialPerspective.js';
import { landGradeGlsl } from '../render/landGrade.js';
import { cloudShadowGlsl } from '../render/cloudField.js';
import { moodRef, sampleMood, sunDirRef, cloudCoverRef } from '../render/mood.js';
import { frameElapsed } from '../devtest/captureClock.js';

const AERIAL_GLSL = aerialGlsl();
const LAND_GRADE_GLSL = landGradeGlsl();
const CLOUD_SHADOW_GLSL = cloudShadowGlsl();
const LOADED_MASK_GLSL = loadedMaskGlsl();

function makeFarMaterial(maskTex, maskOrigin) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.skyHorizon = { value: new THREE.Color(0.6, 0.75, 0.9) };
    shader.uniforms.mood = { value: moodRef.current };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSunDir = { value: sunDirRef.current.clone() };
    shader.uniforms.uCloudCover = { value: cloudCoverRef.current };
    shader.uniforms.uLoadedMask = { value: maskTex };
    shader.uniforms.uMaskOrigin = { value: maskOrigin };
    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = [
      'uniform vec3 skyHorizon;',
      'uniform float mood;',
      'uniform sampler2D uLoadedMask;',
      'uniform vec2 uMaskOrigin;',
      'varying vec3 vWorldPos;',
      CLOUD_SHADOW_GLSL.decl,
      shader.fragmentShader,
    ].join('\n')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${LOADED_MASK_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${LAND_GRADE_GLSL}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        ${CLOUD_SHADOW_GLSL.apply}`,
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
  const means = useMemo(() => layerMeanLinear(sharedVoxelTextures()), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = FAR_RINGS * FAR_SECTORS * 3;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n), 3));
    g.setIndex(new THREE.BufferAttribute(farFieldIndex(FAR_RINGS, FAR_SECTORS), 1));
    g.setDrawRange(0, 0); // nothing to draw until the first build
    return g;
  }, []);
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

  useFrame((state) => {
    const shader = mat.userData.shader;
    if (shader) {
      shader.uniforms.skyHorizon.value.copy(sampleMood(moodRef.current).skyHorizon);
      shader.uniforms.mood.value = moodRef.current;
      shader.uniforms.uTime.value = frameElapsed(state.clock.elapsedTime);
      shader.uniforms.uSunDir.value.copy(sunDirRef.current);
      shader.uniforms.uCloudCover.value = cloudCoverRef.current;
    }

    const p = useGameStore.getState().playerPosition;
    if (!p) return;

    const pcx = chunkOf(p.x), pcz = chunkOf(p.z);
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
    const position = geo.getAttribute('position'), color = geo.getAttribute('color');
    farFieldVertices({
      cx: c.x, cz: c.z, r0: farInnerRadius(renderDistance), r1: FAR_OUTER, sample: surfaceBlockAt, means,
      out: { positions: position.array, colors: color.array },
    });
    position.needsUpdate = true;
    color.needsUpdate = true;
    geo.setDrawRange(0, Infinity);
    // No computeVertexNormals: the material is flatShading, which derives the normal from screen-space
    // derivatives and never reads the attribute (review #4, R5.9 — it looped ~6k vertices per re-centre).
    geo.computeBoundingSphere();
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} receiveShadow={false} castShadow={false} />;
}
