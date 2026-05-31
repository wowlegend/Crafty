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
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.40, h));
        col = mix(col, topColor, smoothstep(0.35, 0.90, h));
        col = mix(col, horizonColor, smoothstep(0.0, -0.25, h)); // ground fade below horizon
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 8.0) * 0.4;                      // soft sun glow
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
  const domeRef = useRef();
  const domeMat = useMemo(makeSkyDomeMaterial, []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(100, 32, 16), []);

  useFrame((state, delta) => {
    const st = useGameStore.getState();
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel });
    if (isCaptureMode()) {
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
    </>
  );
}
