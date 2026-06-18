// Mood-driven atmosphere: one component owns the gradient skydome, fog, ambient/sun/
// fill lights, and the smoothed mood. Replaces the inline EnvironmentalFog + the
// isDay-ternary lights + drei <Sky> (removed). Each frame it lerps moodRef toward
// moodTarget(isDay, dangerLevel) and applies the blended palette. In capture mode the
// mood SNAPS to target for deterministic frames.
import { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore.jsx';
import { isCaptureMode } from '../devtest/captureMode.js';
import { moodRef, moodTarget, sampleMood } from './mood.js';
import { starIntensity } from './nightSky.js';

// ─────────────────────────────────────────────────────────────────────────────
// S1-D-M3: HEIGHT / VALLEY-MIST FOG (subtle).
//
// Evolves the flat FogExp2 toward a height-fog feel — denser low (valley mist), clearer
// up — by patching three's standard fog ShaderChunks ONCE (global, idempotent). This
// touches NO material directly (terrain materials are off-limits this task) and adds NO
// new uniforms: it reuses the existing `fogDensity` uniform (already mood-driven by
// <Atmosphere> below, and SNAPPED in capture), so it is fully capture-deterministic — the
// height term is a pure function of world-space Y and the mood-snapped density. The profile
// reaches full strength at/below FOG_SEA_LEVEL and fades to a residual floor by
// FOG_SEA_LEVEL + FOG_HEIGHT_FALLOFF metres, so distant peaks read clear while the valley
// floor reads misty. Kept subtle (FOG_RESIDUAL floor) so it never crushes mid-height detail.
const FOG_SEA_LEVEL = 56.0;        // world Y at/below which fog is at full density
const FOG_HEIGHT_FALLOFF = 34.0;   // metres over which fog thins toward the residual floor
const FOG_RESIDUAL = 0.55;         // min fog multiplier high up (keep subtle, not zero)
let _heightFogPatched = false;
function installHeightFog() {
  if (_heightFogPatched) return;
  _heightFogPatched = true;
  // Add a world-Y varying alongside three's view-depth fog varying.
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogWorldY;
#endif`;
  // `transformed` is the displaced local position (set earlier in the vertex shader);
  // modelMatrix takes it to world space. We only need the Y for the height profile.
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying float vFogWorldY;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  // Distance fog as before, then a valley-mist height multiplier on the fog factor:
  // full strength at/below sea level, easing to FOG_RESIDUAL by sea+falloff.
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float heightT = clamp( ( vFogWorldY - ${FOG_SEA_LEVEL.toFixed(1)} ) / ${FOG_HEIGHT_FALLOFF.toFixed(1)}, 0.0, 1.0 );
	float heightMul = mix( 1.0, ${FOG_RESIDUAL.toFixed(2)}, heightT );
	fogFactor *= heightMul;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
// Patch at module-eval time (when GameScene imports <Atmosphere>) — BEFORE any material
// compiles its fog shader, so terrain/water pick up the height term on first compile.
installHeightFog();

// A 3-stop gradient skydome (horizon -> mid -> top) + soft sun glow. Always drawn
// behind everything (depthTest/Write off, renderOrder -1, fog off) and follows the
// camera so the sky reads as infinite. Colours are mood-driven (set each frame).
function makeSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2E4A7A') },
      midColor: { value: new THREE.Color('#6FB7C9') },
      horizonColor: { value: new THREE.Color('#FFD9A0') },
      sunColor: { value: new THREE.Color('#FFE9B0') },
      sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.3) },
      uStar: { value: 0 }, // twilight star/moon layer intensity (peaks at dusk; 0 at day/obsidian)
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      uniform float uStar;
      varying vec3 vDir;
      // GLSL hash: deterministic per integer cell (capture-stable: same vDir -> same stars each run).
      float hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.22, h)); // thin pale horizon band
        col = mix(col, topColor, smoothstep(0.28, 0.85, h));             // vivid blue dominates the dome
        col = mix(col, horizonColor, smoothstep(0.0, -0.25, h));         // ground fade below horizon
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 9.0) * 0.45;                            // tighter warm sun glow
        col += sunColor * pow(s, 120.0) * 1.3;                           // bright sun disc (blooms)
        // iter-165 TWILIGHT NIGHT SKY (stars + moon), gated by uStar (dusk-only; day/obsidian = 0
        // -> those frames stay byte-identical). Additive, matching the sun-glow technique above.
        if (uStar > 0.001) {
          float up = smoothstep(0.05, 0.35, h);          // upper dome only — no horizon/ground stars
          vec3 sd = normalize(vDir) * 34.0;              // star-field cell frequency
          vec3 cell = floor(sd);
          vec3 f = fract(sd);
          float hsh = hash13(cell);
          float starOn = step(0.985, hsh);              // ~1.5% of cells -> sparse, not noise
          float hb = hash13(cell + 19.3);               // 2nd hash: in-cell jitter + brightness
          vec2 jit = vec2(fract(hb * 7.0), fract(hb * 13.0));
          float d = length(f.xy - 0.5 - (jit - 0.5) * 0.6);
          float star = starOn * smoothstep(0.10, 0.0, d) * (0.45 + 0.55 * hb); // round point, varied
          col += vec3(0.85, 0.90, 1.0) * star * up * uStar * 2.2;             // cool-white stars
          // MOON — a soft cool hero disc high in the FRONT-upper sky (-Z, toward the capture/explore
          // view). The sun-disc technique (pow), cooler + static, so the global Bloom blows it out.
          vec3 moonDir = normalize(vec3(0.32, 0.30, -0.90)); // upper-RIGHT, in-FOV, opposite the sun
          float md = max(dot(normalize(vDir), moonDir), 0.0);
          // A DEFINED cool moon disc (bold-flat coherent — a clean disc reads as a moon even against
          // a brightish dusk sky, unlike a soft pow-glow). ~3deg radius with a soft edge, + a halo.
          float disc = smoothstep(0.9982, 0.9991, md);
          col = mix(col, vec3(0.88, 0.92, 1.0), disc * uStar);               // clean cool moon disc
          col += vec3(0.60, 0.66, 0.90) * pow(md, 26.0) * 0.40 * uStar;      // soft cool halo (blooms)
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function Atmosphere({ shadowConfig }) {
  const { scene, camera } = useThree();
  const ambientRef = useRef();
  const sunRef = useRef();
  const fillRef = useRef();
  const hemiRef = useRef();
  const domeRef = useRef();
  const domeMat = useMemo(makeSkyDomeMaterial, []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(100, 32, 16), []);

  useFrame((state, delta) => {
    const st = useGameStore.getState();
    const cap = isCaptureMode();
    // W4-T8: the storm sky-darken boost is FORCED to 0 in capture. The weather state machine still ticks
    // during a capture (which runs >90s, longer than the 90s weather cycle), so a live weatherMoodBoost
    // would darken every frame captured after the first transition -> non-deterministic baselines. Capture
    // always renders the clear-sky mood; the storm darken is a live-play-only effect.
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel, weatherBoost: cap ? 0 : st.weatherMoodBoost });
    if (cap) {
      moodRef.current = target; // snap -> deterministic capture frames
    } else {
      moodRef.current = THREE.MathUtils.lerp(moodRef.current, target, Math.min(1, delta * 2.0));
    }
    const m = sampleMood(moodRef.current);

    // Distance fog (terrain only -- the dome has fog:false). Background = horizon as a
    // base colour in case the dome ever fails to cover a pixel.
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x000000, 0.01);
    scene.fog.color.copy(m.fog);
    scene.fog.density = m.fogDensity;
    if (!scene.background) scene.background = new THREE.Color();
    scene.background.copy(m.skyHorizon);

    // Gradient skydome -- follow the camera + push mood-blended colours/sun.
    if (domeRef.current) {
      domeRef.current.position.copy(camera.position);
      const u = domeMat.uniforms;
      u.topColor.value.copy(m.skyTop);
      u.midColor.value.copy(m.skyMid);
      u.horizonColor.value.copy(m.skyHorizon);
      u.sunColor.value.copy(m.sun);
      u.sunDir.value.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]).normalize();
      u.uStar.value = starIntensity(moodRef.current); // dusk-only twilight stars + moon
    }

    if (ambientRef.current) {
      ambientRef.current.color.copy(m.ambient);
      ambientRef.current.intensity = m.ambientIntensity;
    }
    if (sunRef.current) {
      sunRef.current.color.copy(m.sun);
      sunRef.current.intensity = m.sunIntensity;
      sunRef.current.position.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]);
    }
    if (fillRef.current) {
      fillRef.current.color.copy(m.fill);
      fillRef.current.intensity = m.fillIntensity;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(m.hemiSky);          // sky bounce (top)
      hemiRef.current.groundColor.copy(m.hemiGround); // ground bounce (bottom)
      hemiRef.current.intensity = m.hemiIntensity;
    }
  });

  return (
    <>
      <mesh ref={domeRef} geometry={domeGeo} material={domeMat} renderOrder={-1} frustumCulled={false} />
      <ambientLight ref={ambientRef} intensity={0.6} />
      <directionalLight
        ref={sunRef}
        castShadow={!isCaptureMode()}
        position={[50, 100, 50]}
        intensity={1.5}
        shadow-mapSize={shadowConfig.mapSize}
        shadow-camera-left={shadowConfig.camera.left}
        shadow-camera-right={shadowConfig.camera.right}
        shadow-camera-top={shadowConfig.camera.top}
        shadow-camera-bottom={shadowConfig.camera.bottom}
        shadow-camera-near={shadowConfig.camera.near}
        shadow-camera-far={shadowConfig.camera.far}
        shadow-bias={-0.0001}
      />
      <pointLight ref={fillRef} position={[0, 20, 0]} intensity={0} distance={50} />
      <hemisphereLight ref={hemiRef} intensity={0.55} />
    </>
  );
}
