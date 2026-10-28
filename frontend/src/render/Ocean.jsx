// W2 stylized tropical-toon ocean SURFACE — a real animated water plane that REPLACES the
// old voxel water tops (the mesher no longer emits water faces). A subdivided plane pinned at
// SEA_LEVEL, displaced by summed Gerstner waves in the VERTEX SHADER (oceanProfile.gerstnerGlsl) with analytic
// normals, a bright turquoise->teal toon palette, and the hour's light on it: lit foam, a sky Fresnel and the key
// light's glint (render/oceanLook.js), all under the fog. Capture-frozen time => byte-stable frames.
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL, gerstnerGlsl } from '../world/oceanProfile.js';

// THE WAVES RUN ON THE GPU. Until 2026-09-22 this component displaced every vertex of the plane on the CPU
// every frame (~9,400 of them, ~14% of the frame budget by this file's own earlier measurement) and
// re-uploaded position, normal and foam. The vertex shader now calls a GLSL gerstnerWave() GENERATED from
// the same wave table as oceanProfile's JS functions (constants substituted by value; ocean-gpu-waves-gates
// interprets the text against them), so the surface is the tested one and the frame loop sets two uniforms.
const GERSTNER_GLSL = gerstnerGlsl();
import { isCaptureMode } from '../devtest/captureMode.js';
import { oceanVisibleNear } from '../world/oceanVisibility.js';
import { surfaceBlockAt } from '../world/climate.js';
import { skyFrameRef } from './mood.js';
import { OCEAN_SURFACE, oceanLookUniforms, writeOceanLight, patchOceanFragment } from './oceanLook.js';

// B8: surface world-Y sampler for the visibility gate (shares the terrain formula via climate.js).
const sampleSurfaceY = (x, z) => surfaceBlockAt(x, z).surfaceY;

const PLANE = 220;      // metres covered (re-centred under the camera each frame)
const SEG = 96;         // subdivisions per axis (vertex density for the wave detail)
const CAPTURE_TIME = 4.0; // frozen wave phase in capture (flattering mid-swell)

export function Ocean() {
  const meshRef = useRef();
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(PLANE, PLANE, SEG, SEG), []);
  // Tropical water. NOTE WHAT CHANGED AND WHY IT MATTERS: this used to set `vertexColors: true` and
  // write the foam factor into the vertex COLOUR as (crest, crest, crest). three's standard chain does
  // `diffuseColor.rgb *= vColor` (color_fragment.glsl.js), so away from a crest that colour is (0,0,0)
  // and the entire diffuse term was being multiplied to BLACK. What reached the screen was almost
  // purely `emissive`, which is not multiplied by vColor — which is exactly why the old comment could
  // say the surface "reads vivid teal at ANY lighting angle". It was not toon shading. The ocean simply
  // was not lit, so no lighting angle could change it.
  //
  // The vertex colour is gone (foam is computed in the vertex shader from the same waves) and the diffuse
  // survives — so the sea takes the sun, the mood grade and the time of day like everything else does.
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    ...OCEAN_SURFACE, flatShading: false, transparent: true, opacity: 0.93,
  }), []);
  // The wave clock and the plane's world centre, read by the vertex shader. The shader samples the waves
  // at the UNDISPLACED grid point (position is never written back), so nothing compounds frame to frame.
  const oceanUniforms = useMemo(() => ({ uTime: { value: CAPTURE_TIME }, uCenter: { value: new THREE.Vector2() } }), []);
  // The hour's light for the foam, the sky Fresnel and the glint (render/oceanLook.js), from the published sky frame.
  const lookUniforms = useMemo(() => oceanLookUniforms(), []);

  // prop-attached geometry + material are not auto-disposed by R3F -> dispose on unmount
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((state) => {
    const mesh = meshRef.current; if (!mesh) return;
    writeOceanLight(lookUniforms, skyFrameRef.current);
    const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
    // B8: the plane only COVERS ~110m around the camera, so skip its render (and, since 9860eaa9, its
    // vertex-shader wave pass — the CPU loop is gone) when no water column is within reach — deep inland / inside an inland cave, where the plane
    // is fully buried under terrain (invisible) yet used to burn ~14% of the frame budget and render through
    // cave walls. Always on in capture so the visual baselines stay byte-identical (a live-play perf gate).
    const visible = isCaptureMode() || oceanVisibleNear(cx, cz, sampleSurfaceY);
    mesh.visible = visible;
    if (!visible) return;
    oceanUniforms.uTime.value = isCaptureMode() ? CAPTURE_TIME : state.clock.elapsedTime;
    // snap the plane centre to the camera's XZ (so it always covers the view); keep it at SEA_LEVEL.
    mesh.position.set(cx, SEA_LEVEL, cz);
    oceanUniforms.uCenter.value.set(cx, cz);
  });

  const onBeforeCompile = useMemo(() => (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.uniforms.uCenter = oceanUniforms.uCenter;
    Object.assign(shader.uniforms, lookUniforms);
    // The waves, on the GPU. The plane is rotated -90deg about X, so local (x, y) is world (x, -z): sample
    // at the world point, then map the displacement and the normal back into plane-local axes. The normal
    // is computed first because three includes beginnormal_vertex before begin_vertex.
    shader.vertexShader = `uniform float uTime;\nuniform vec2 uCenter;\nvarying float vFoam;\n${GERSTNER_GLSL}\n${shader.vertexShader}`
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 gWp = uCenter + vec2(position.x, -position.y);
  vec3 gDisp; vec3 gNrm;
  gerstnerWave(gWp, uTime, gDisp, gNrm);
  vec3 objectNormal = vec3(gNrm.x, -gNrm.z, gNrm.y);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif`
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position.x + gDisp.x, position.y - gDisp.z, gDisp.y);
  // Foam where real foam is: on the crests AND on the steep faces. Height alone caps only the very top of
  // the swell; with Gerstner sharpening the crests, the steep leading face is where water actually breaks.
  float gCrest = smoothstep(0.85, 1.75, gDisp.y);
  float gSlope = smoothstep(0.05, 0.22, 1.0 - gNrm.y);
  vFoam = min(1.0, gCrest * 0.85 + gSlope * 0.5);`
      );
    shader.fragmentShader = patchOceanFragment(shader.fragmentShader);
  }, [oceanUniforms, lookUniforms]);
  mat.onBeforeCompile = onBeforeCompile;

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} frustumCulled={false} />
  );
}
