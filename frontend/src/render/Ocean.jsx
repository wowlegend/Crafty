// W2 stylized tropical-toon ocean SURFACE — a real animated water plane that REPLACES the
// old voxel water tops (the mesher no longer emits water faces). A subdivided plane pinned at
// SEA_LEVEL, displaced by summed Gerstner waves (oceanProfile.gerstnerHeight) with RECOMPUTED
// normals, a bright turquoise->teal toon palette, Fresnel off the real normal, glossy highlight
// bands, and a continuous smoothstep shoreline foam. Capture-frozen time => byte-stable frames.
import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL, gerstnerHeight, gerstnerNormal } from '../world/oceanProfile.js';
import { isCaptureMode } from '../devtest/captureMode.js';

const PLANE = 220;      // metres covered (re-centred under the camera each frame)
const SEG = 96;         // subdivisions per axis (vertex density for the wave detail)
const CAPTURE_TIME = 4.0; // frozen wave phase in capture (flattering mid-swell)

export function Ocean() {
  const meshRef = useRef();
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(PLANE, PLANE, SEG, SEG), []);
  // toon turquoise->teal + foam material (vertexColors carry per-vertex foam factor in r)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0E8FB0', roughness: 0.30, metalness: 0.0, flatShading: false,
    // Toon water self-illuminates toward bright Caribbean turquoise so the surface reads vivid teal at
    // ANY lighting angle (physical PBR diffuse alone left it slate-grey from the top-down). The emissive
    // is the toon palette lift; the diffuse + Fresnel + foam layer on top.
    emissive: '#16C8C2', emissiveIntensity: 0.55,
    transparent: true, opacity: 0.95, vertexColors: true,
  }), []);
  // attach a foam attribute (per-vertex, recomputed each frame)
  useMemo(() => {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }, [geo]);

  useFrame((state) => {
    const t = isCaptureMode() ? CAPTURE_TIME : state.clock.elapsedTime;
    const mesh = meshRef.current; if (!mesh) return;
    // snap the plane centre to the camera's XZ (so it always covers the view); keep it at SEA_LEVEL.
    const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
    mesh.position.set(cx, SEA_LEVEL, cz);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      // plane local (x,y) -> world (x,z); plane is rotated -90deg about X so local-y maps to world-z
      const lx = pos.getX(i), ly = pos.getY(i);
      const wx = cx + lx, wz = cz - ly;
      const h = gerstnerHeight(wx, wz, t);
      pos.setZ(i, h - SEA_LEVEL); // local-z displacement (before the -90deg rotation lifts it to world-Y)
      const nv = gerstnerNormal(wx, wz, t);
      nrm.setXYZ(i, nv[0], -nv[2], nv[1]); // remap world normal into plane-local (rotation -90deg X: world nv -> local (x,-z,y))
      // continuous toon foam at the crest (smoothstep on height) — a soft white cap on ONLY the highest
      // crests (the summed amplitude reaches ~+2.1, so a low threshold whitewashes the whole sea; keep
      // foam to the top swell so the turquoise base reads). Continuous band, not a binary 1x1 cell.
      const crest = THREE.MathUtils.smoothstep(h, SEA_LEVEL + 1.45, SEA_LEVEL + 2.05);
      col.setXYZ(i, crest, crest, crest); // r carries the foam blend; material color is the base teal
    }
    pos.needsUpdate = true; nrm.needsUpdate = true; col.needsUpdate = true;
  });

  // Fresnel + glossy band tint injected post-lighting (reads off the recomputed normal).
  const onBeforeCompile = useMemo(() => (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec3 V = normalize(vViewPosition);
       float fres = pow(1.0 - max(dot(normalize(geometryNormal), V), 0.0), 3.0);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.45, 0.86, 0.92), fres * 0.38); // sky-teal Fresnel (kept light so the base teal reads)
       float band = smoothstep(0.90, 0.99, dot(normalize(geometryNormal), normalize(vec3(0.4,1.0,0.3))));
       gl_FragColor.rgb += vec3(0.16, 0.26, 0.27) * band; // glossy highlight band off the real normal (tighter + dimmer)
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.99, 1.0), clamp(vColor.r, 0.0, 1.0) * 0.85); // crest foam (thin cap)`
    );
  }, []);
  mat.onBeforeCompile = onBeforeCompile;

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} frustumCulled={false} />
  );
}
