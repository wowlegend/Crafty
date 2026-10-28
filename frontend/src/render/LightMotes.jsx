// LightMotes — fireflies: slow additive billboards drifting in a box around the camera, present only where the colour
// script says the hour has them (render/motePresence.js: at night, a share at dusk and before dawn, none by day, none
// under the boss), and faded out near the camera so none sits on the lens. ONE instanced plane mesh with GPU
// billboarding in the vertex shader; per-instance React meshes would thrash the reconciler at 100+ instances.
//
// CAPTURE-DETERMINISM (load-bearing): the mote drift is driven by a `uTime` uniform that
// is FROZEN to a fixed flattering phase (CAPTURE_TIME) in capture mode, so every capture
// run is byte-identical. The per-instance seed/phase/speed come from a SEEDED stream
// (makeSeededRandom) keyed by the instance index, so the cloud layout is also identical
// across runs. The frozen phase is chosen so motes sit spread through the volume (visible,
// not bunched at a seam or clipped) rather than at t=0 where they'd all sit at their seed.
//
// PERF: count is tier-gated (low << med << high). Each mote is a tiny additive quad with
// depthWrite off — fill-rate is the only cost, and by day the mesh is not drawn at all. The
// vertex shader does the motion + billboarding on the GPU, so the CPU cost is one buffer
// set-up on mount and a few uniform writes per frame.
import React, { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isCaptureMode, makeSeededRandom } from '../devtest/captureMode.js';
import { registerTestHook } from '../devtest/testBridge.js';
import { skyFrameRef } from './mood.js';
import { FIREFLY_COLOR, FIREFLY_OPACITY, MOTE_MIN_PRESENCE, motePresence, moteNearFadeGlsl } from './motePresence.js';

// Mote count is supplied by the caller from the active quality tier (`TIERS[tier].moteCount`
// in quality.js): low 36 / med 80 / high 140. Fill-rate scales with count, so low-end
// devices get a sparse layer and high-end gets the full signature cloud.
const DEFAULT_COUNT = 140;

// The motes occupy a box centred on the camera. WIDTH/HEIGHT/DEPTH = half-extents (metres).
// Motion is a slow upward drift + a small lateral sway, wrapped within the box so the cloud
// is steady-state (no spawn/despawn pops). The box follows the camera each frame.
const BOX = { w: 46, h: 26, d: 46 };

// Capture: a fixed phase (seconds) at which the frozen frame is sampled. Chosen so the
// motes are spread through their drift cycle (a flattering, full-looking still) rather than
// all sitting at their seed positions. Any positive constant works; this one reads well.
const CAPTURE_TIME = 11.0;

// Drift speeds (m/s and rad/s) — deliberately SLOW so motes read as ambient dust, not snow.
const RISE_MIN = 0.18, RISE_SPAN = 0.42;     // vertical rise speed range
const SWAY_FREQ_MIN = 0.10, SWAY_FREQ_SPAN = 0.35; // lateral sway frequency range
const SWAY_AMP = 1.6;                          // lateral sway amplitude (m)

// Vertex shader: GPU billboarding (camera-facing quad) + slow drift, all wrapped in the box.
// `aSeed` packs the per-mote base position; `aPhase` packs (riseSpeed, swayFreq, swayPhase,
// twinkleSeed). The box origin (camera position) arrives via `uOrigin`. Motion uses `uTime`.
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uOrigin;
  uniform vec3 uBox;        // half-extents (w,h,d)
  uniform float uScale;     // base quad scale (mood/tier-driven)
  attribute vec3 aSeed;     // base position within [-box, +box]
  attribute vec4 aPhase;    // x=riseSpeed y=swayFreq z=swayPhase w=twinkleSeed
  varying float vTwinkle;
  varying float vNear;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float rise = aPhase.x;
    float swayFreq = aPhase.y;
    float swayPhase = aPhase.z;

    // Vertical rise, wrapped within the box height so the layer is steady-state.
    float boxH2 = uBox.y * 2.0;
    float y = aSeed.y + uTime * rise;
    y = mod(y + uBox.y, boxH2) - uBox.y;   // wrap into [-h, +h]

    // Gentle lateral sway so the cloud breathes (no straight-line march).
    float sway = sin(uTime * swayFreq + swayPhase) * ${SWAY_AMP.toFixed(3)};
    float swayZ = cos(uTime * swayFreq * 0.7 + swayPhase) * ${(SWAY_AMP * 0.6).toFixed(3)};

    vec3 worldCenter = uOrigin + vec3(aSeed.x + sway, y, aSeed.z + swayZ);

    // Soft twinkle (intensity oscillation) so motes shimmer subtly.
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase.w) + aPhase.w * 9.0);

    // GPU billboard: place the instance centre in view space, then offset by the quad
    // corner so the quad always faces the camera. Per-mote size variance (0.6..1.4x) off
    // the twinkle seed gives depth — a few big soft bokeh motes among smaller ones.
    float sizeVar = 0.6 + aPhase.w * 0.8;
    vec4 mv = modelViewMatrix * vec4(worldCenter, 1.0);
    vNear = ${moteNearFadeGlsl('length(mv.xyz)')};
    mv.xyz += position * uScale * sizeVar;
    gl_Position = projectionMatrix * mv;
  }
`;

// Fragment shader: a soft round additive dot, twinkle-modulated, faded near the camera (vNear). Radial feather (no
// hard quad edge) keeps a mote reading as a glow, not a square.
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTwinkle;
  varying float vNear;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, vec2(0.5));
    float a = smoothstep(0.5, 0.0, d);     // soft round falloff (bokeh dot)
    a = a * a;                               // tighten the core
    vec3 col = uColor * (1.1 + vTwinkle * 1.0);
    gl_FragColor = vec4(col, a * uOpacity * vNear * (0.6 + vTwinkle * 0.4));
  }
`;

export function LightMotes({ count = DEFAULT_COUNT }) {
  const { camera } = useThree();
  const meshRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  // Seeded per-instance attributes (positions + drift phases). Seeded so the cloud layout
  // is identical across capture runs; the same seed is fine in gameplay (no visible repeat).
  const [seeds, phases] = useMemo(() => {
    const rnd = makeSeededRandom('light-motes-layout');
    const s = new Float32Array(count * 3);
    const p = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      s[i * 3 + 0] = (rnd() - 0.5) * 2 * BOX.w;
      s[i * 3 + 1] = (rnd() - 0.5) * 2 * BOX.h;
      s[i * 3 + 2] = (rnd() - 0.5) * 2 * BOX.d;
      p[i * 4 + 0] = RISE_MIN + rnd() * RISE_SPAN;          // rise speed
      p[i * 4 + 1] = SWAY_FREQ_MIN + rnd() * SWAY_FREQ_SPAN; // sway freq
      p[i * 4 + 2] = rnd() * Math.PI * 2;                    // sway phase
      p[i * 4 + 3] = rnd();                                  // twinkle seed
    }
    return [s, p];
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uOrigin: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(BOX.w, BOX.h, BOX.d) },
    // KNOB (mote SIZE): base world-space quad scale (0.5 plane * this). Per-mote variance
    // (0.6..1.4x) applied in the vertex shader for depth. ~2.2 reads as soft warm BOKEH at
    // the 20-40m distances of the diorama view (verified live against the bright explore sky
    // — smaller is invisible because additive over a bright sky needs area to register).
    // Lower for finer dust, raise for chunkier orbs. THIS is the main "presence" lever.
    uScale: { value: 2.2 },
    uColor: { value: new THREE.Color(FIREFLY_COLOR) },
    uOpacity: { value: 0 },
  }), []);

  // DEV-only read for the e2e: the live mesh and its compiled source, so a mesh that ignores the presence or a shader
  // without the fade is seen in the running game, where the pure gates cannot look.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    registerTestHook('readMotes', () => {
      const mesh = meshRef.current;
      return mesh ? {
        visible: mesh.visible, opacity: uniforms.uOpacity.value,
        nearFade: mesh.material.vertexShader.includes(moteNearFadeGlsl('length(mv.xyz)')),
      } : null;
    });
    return () => registerTestHook('readMotes', () => null);
  }, [uniforms]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const geom = mesh.geometry;
    geom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 4));
  }, [seeds, phases]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const presence = motePresence(skyFrameRef.current);
    mesh.visible = presence >= MOTE_MIN_PRESENCE;
    uniforms.uOpacity.value = FIREFLY_OPACITY * presence;
    // Capture: freeze the drift clock to a fixed flattering phase (byte-stable frames).
    // Gameplay: live elapsed time -> slow continuous drift.
    uniforms.uTime.value = isCaptureMode() ? CAPTURE_TIME : clockRef.current.getElapsedTime();
    uniforms.uOrigin.value.copy(camera.position);
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[0.5, 0.5]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
