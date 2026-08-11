// W2 stylized tropical-toon ocean SURFACE — a real animated water plane that REPLACES the
// old voxel water tops (the mesher no longer emits water faces). A subdivided plane pinned at
// SEA_LEVEL, displaced by summed Gerstner waves (oceanProfile.gerstnerHeight) with RECOMPUTED
// normals, a bright turquoise->teal toon palette, Fresnel off the real normal, glossy highlight
// bands, and a continuous smoothstep shoreline foam. Capture-frozen time => byte-stable frames.
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL, gerstnerDisplaceInto, gerstnerNormalInto } from '../world/oceanProfile.js';

// Per-vertex scratch for the useFrame below. The loop runs once per vertex per FRAME -- ~9,400 on a 96x96
// plane -- and the object-returning gerstner helpers allocated a literal and an array each time, roughly
// 18,800 short-lived allocations per frame at display refresh. Module scope, because this component is a
// singleton and the values never outlive one iteration.
const _d = { x: 0, y: 0, z: 0 };
const _n = { x: 0, y: 0, z: 0 };
import { isCaptureMode } from '../devtest/captureMode.js';
import { oceanVisibleNear } from '../world/oceanVisibility.js';
import { surfaceBlockAt } from '../world/climate.js';

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
  // Foam now rides its own attribute, the vertex colour is gone, and the diffuse survives — so the sea
  // takes the sun, the mood grade and the time of day like everything else in the world does.
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#10BCC6', roughness: 0.22, metalness: 0.0, flatShading: false,
    // A much smaller lift than before: it is a tropical shallow-water glow, no longer load-bearing for
    // the surface being visible at all.
    emissive: '#0E7E93', emissiveIntensity: 0.22,
    transparent: true, opacity: 0.93,
  }), []);
  // Per-vertex foam on its OWN attribute, plus the undisplaced grid. The grid matters: Gerstner moves a
  // vertex in x/z, so reading last frame's position back as this frame's sample point would compound the
  // displacement every frame and tear the sheet apart within seconds.
  const base = useMemo(() => {
    const c = geo.attributes.position.count;
    geo.setAttribute('aFoam', new THREE.BufferAttribute(new Float32Array(c), 1));
    const g = new Float32Array(c * 2);
    for (let i = 0; i < c; i++) { g[i * 2] = geo.attributes.position.getX(i); g[i * 2 + 1] = geo.attributes.position.getY(i); }
    return g;
  }, [geo]);

  // prop-attached geometry + material are not auto-disposed by R3F -> dispose on unmount
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame((state) => {
    const mesh = meshRef.current; if (!mesh) return;
    const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
    // B8: the plane only COVERS ~110m around the camera, so skip its render AND its ~9.4k-vertex wave
    // recompute when no water column is within reach — deep inland / inside an inland cave, where the plane
    // is fully buried under terrain (invisible) yet used to burn ~14% of the frame budget and render through
    // cave walls. Always on in capture so the visual baselines stay byte-identical (a live-play perf gate).
    const visible = isCaptureMode() || oceanVisibleNear(cx, cz, sampleSurfaceY);
    mesh.visible = visible;
    if (!visible) return;
    const t = isCaptureMode() ? CAPTURE_TIME : state.clock.elapsedTime;
    // snap the plane centre to the camera's XZ (so it always covers the view); keep it at SEA_LEVEL.
    mesh.position.set(cx, SEA_LEVEL, cz);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, foam = geo.attributes.aFoam;
    for (let i = 0; i < pos.count; i++) {
      // Sample from the UNDISPLACED grid, never from the vertex we wrote last frame.
      const lx = base[i * 2], ly = base[i * 2 + 1];
      const wx = cx + lx, wz = cz - ly;
      gerstnerDisplaceInto(_d, wx, wz, t);
      // plane local (x,y) -> world (x,z); rotated -90deg about X, so world z maps to NEGATIVE local y
      pos.setXYZ(i, lx + (_d.x - wx), ly - (_d.z - wz), _d.y - SEA_LEVEL);
      gerstnerNormalInto(_n, wx, wz, t);
      nrm.setXYZ(i, _n.x, -_n.z, _n.y); // world normal -> plane-local under the -90deg X rotation
      // Foam where real foam is: on the crests AND on the steep faces. Height alone caps only the very
      // top of the swell; with Gerstner sharpening the crests, the steep leading face is where water
      // actually breaks, and a slope term is what stops the foam reading as a painted-on stripe.
      const crest = THREE.MathUtils.smoothstep(_d.y, SEA_LEVEL + 0.85, SEA_LEVEL + 1.75);
      const slope = THREE.MathUtils.smoothstep(1 - _n.y, 0.05, 0.22);
      foam.setX(i, Math.min(1, crest * 0.85 + slope * 0.5));
    }
    pos.needsUpdate = true; nrm.needsUpdate = true; foam.needsUpdate = true;
  });

  // Fresnel + glossy band tint injected post-lighting (reads off the recomputed normal).
  const onBeforeCompile = useMemo(() => (shader) => {
    // foam travels on its own attribute now, so it cannot multiply the diffuse to black
    shader.vertexShader = `attribute float aFoam;\nvarying float vFoam;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vFoam = aFoam;'
    );
    shader.fragmentShader = `varying float vFoam;\n${shader.fragmentShader}`.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec3 V = normalize(vViewPosition);
       float fres = pow(1.0 - max(dot(normalize(geometryNormal), V), 0.0), 3.0);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.45, 0.86, 0.92), fres * 0.20); // sky-teal Fresnel -- HALVED from 0.38: a surface-skimming camera sees almost the whole sheet at grazing incidence, where this term saturates and washed the sea to pale ice
       float band = smoothstep(0.90, 0.99, dot(normalize(geometryNormal), normalize(vec3(0.4,1.0,0.3))));
       gl_FragColor.rgb += vec3(0.16, 0.26, 0.27) * band; // glossy highlight band off the real normal (tighter + dimmer)
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.99, 1.0), clamp(vFoam, 0.0, 1.0) * 0.85); // crest + breaking-face foam`
    );
  }, []);
  mat.onBeforeCompile = onBeforeCompile;

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} frustumCulled={false} />
  );
}
