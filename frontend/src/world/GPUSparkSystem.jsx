import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode, makeSeededRandom } from '../devtest/captureMode';
import { biasAlong } from '../game/mobHitFx';

const MAX_SPARKS = 1200;

// S1-D-M2: capture-determinism for the spark burst. In capture mode the ember clock is
// pinned to uTime=0 (see the useFrame below). A burst fired during gameplay stamps
// aStartTime = live elapsed time (e.g. ~5s); with uTime=0 that makes t = uTime - aStartTime
// strongly NEGATIVE, so the vertex shader takes the dead-spark branch and displaces every
// spark into the clip void -> a capture frame shows NO spray (the M1-flagged bug). The fix:
// when isCaptureMode(), stamp aStartTime at a fixed NEGATIVE phase so that at uTime=0 each
// spark sits at t = +CAPTURE_SPARK_PHASE seconds into its life -> alive, mid-flight, visible
// in-frame (not at the origin, not clipped). Velocities are drawn from a per-burst SEEDED
// stream (keyed by a stable burst counter) instead of Math.random, so two capture runs are
// byte-identical. Lifetime is fixed in capture (no RNG) so the mid-life scale is stable too.
const CAPTURE_SPARK_PHASE = 0.30;   // seconds into each spark's life shown at uTime=0
const CAPTURE_SPARK_LIFETIME = 0.85; // fixed lifetime in capture (no RNG); phase/lifetime ~= 0.35 (well alive)

const vertexShader = `
  uniform float uTime;
  attribute vec3 aPosition;
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aStartTime;
  attribute float aLifetime;

  varying vec3 vColor;
  varying float vLife;

  void main() {
    vColor = aColor;
    float t = uTime - aStartTime;
    vLife = 0.0;

    vec3 pos = position; // local quad coordinate

    if (t >= 0.0 && t <= aLifetime) {
      vLife = 1.0 - (t / aLifetime);

      // Embers shrink over time
      float scale = vLife;
      pos *= scale;

      // Physics equation: position = start + velocity * t + 0.5 * gravity * t^2
      vec3 gravity = vec3(0.0, -14.0, 0.0);
      vec3 dynamicOffset = aPosition + aVelocity * t + 0.5 * gravity * t * t;

      // Dynamic GPU Billboarding: translate model position to eye space, offset by billboard plane
      vec4 mvPosition = modelViewMatrix * vec4(dynamicOffset, 1.0);
      mvPosition.xyz += pos; 
      gl_Position = projectionMatrix * mvPosition;
    } else {
      // Displace dead sparks into clip void
      gl_Position = vec4(0.0, 0.0, -99999.0, 1.0);
    }
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vLife;

  void main() {
    if (vLife <= 0.0) discard;

    // Glowing core glow blending
    vec3 glow = vColor * (1.5 + vLife * 3.5);
    
    // Soft radial round edge for premium particle looks
    vec2 coord = gl_PointCoord - vec2(0.5);
    // (If drawing standard geometries, standard UV coordinates can serve circular feathering)
    gl_FragColor = vec4(glow, vLife);
  }
`;

// Alternative material using standard shaders but custom compilation is very nice, 
// but direct ShaderMaterial with doubleSide and additive blending is the gold standard for embers.
export const GPUSparkSystem = () => {
  const meshRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleIndex = useRef(0);
  const captureBurstSeq = useRef(0); // stable per-burst key for the seeded capture RNG

  // Instanced attribute array holders
  const [positions, velocities, colors, startTimes, lifetimes] = useMemo(() => {
    return [
      new Float32Array(MAX_SPARKS * 3).fill(0),
      new Float32Array(MAX_SPARKS * 3).fill(0),
      new Float32Array(MAX_SPARKS * 3).fill(0),
      new Float32Array(MAX_SPARKS).fill(-9999), // default far past
      new Float32Array(MAX_SPARKS).fill(1)
    ];
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 }
  }), []);

  // Programmatic attribute binding on mount
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const geom = meshRef.current.geometry;
    
    geom.setAttribute('aPosition', new THREE.InstancedBufferAttribute(positions, 3));
    geom.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(velocities, 3));
    geom.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geom.setAttribute('aStartTime', new THREE.InstancedBufferAttribute(startTimes, 1));
    geom.setAttribute('aLifetime', new THREE.InstancedBufferAttribute(lifetimes, 1));
  }, [positions, velocities, colors, startTimes, lifetimes]);

  useEffect(() => {
    const triggerSparkBurst = (pos, colorHex, count = 25, type = 'physical', dir = null) => {
      if (!meshRef.current) return;
      const geom = meshRef.current.geometry;
      const posAttr = geom.getAttribute('aPosition');
      const velAttr = geom.getAttribute('aVelocity');
      const colAttr = geom.getAttribute('aColor');
      const startAttr = geom.getAttribute('aStartTime');
      const lifeAttr = geom.getAttribute('aLifetime');

      const tempColor = new THREE.Color(colorHex);
      const capture = isCaptureMode();

      // Capture: pin the burst to a fixed negative phase so each spark is mid-life at
      // uTime=0 (alive + visible, not clipped), and draw velocities from a per-burst
      // SEEDED stream so two runs are byte-identical. Gameplay: live clock + Math.random.
      const burstSeq = captureBurstSeq.current++;
      const rnd = capture ? makeSeededRandom(`gpu-spark-burst-${burstSeq}-${type}`) : Math.random;
      const uTime = capture ? -CAPTURE_SPARK_PHASE : clockRef.current.getElapsedTime();

      const baseCount = Math.min(count, 120);

      for (let i = 0; i < baseCount; i++) {
        const idx = particleIndex.current;
        particleIndex.current = (particleIndex.current + 1) % MAX_SPARKS;

        // Origin coordinate
        posAttr.array[idx * 3] = pos.x;
        posAttr.array[idx * 3 + 1] = pos.y;
        posAttr.array[idx * 3 + 2] = pos.z;

        // Custom velocity profiles by hit type (seeded `rnd` is order-stable per burst
        // in capture; identical to the old behavior in gameplay where rnd === Math.random)
        let vx = (rnd() - 0.5) * 5.0;
        let vy = rnd() * 6.0 + 2.0; // upward bias
        let vz = (rnd() - 0.5) * 5.0;

        if (type === 'fireball') {
          const angle = rnd() * Math.PI * 2;
          const speed = 2.5 + rnd() * 4.5;
          vx = Math.cos(angle) * speed;
          vy = rnd() * 5.0 + 3.0;
          vz = Math.sin(angle) * speed;
        } else if (type === 'iceball') {
          vx *= 0.5;
          vy = rnd() * 2.5 + 0.5;
          vz *= 0.5;
        } else if (type === 'lightning') {
          vx *= 2.0;
          vy = rnd() * 9.0 + 3.0;
          vz *= 2.0;
        } else if (type === 'arcane') {
          vx *= 0.3;
          vy = rnd() * 3.5 + 2.5;
          vz *= 0.3;
        } else if (type === 'physical') {
          vx = (rnd() - 0.5) * 6.5;
          vy = rnd() * 7.5 + 1.5;
          vz = (rnd() - 0.5) * 6.5;
        }

        // Directional cone: bias the horizontal spray AWAY from the player along the real hit
        // vector (vy/upward arc untouched), so a hit's sparks fly off in the hit direction instead
        // of a symmetric radial puff. Only combat hits pass `dir`; placement/ambient sparks stay radial.
        if (dir) {
          const b = biasAlong(vx, vz, dir.x ?? dir[0] ?? 0, dir.z ?? dir[2] ?? 0, 0.55);
          vx = b.vx; vz = b.vz;
        }

        velAttr.array[idx * 3] = vx;
        velAttr.array[idx * 3 + 1] = vy;
        velAttr.array[idx * 3 + 2] = vz;

        // RGB color channels
        colAttr.array[idx * 3] = tempColor.r;
        colAttr.array[idx * 3 + 1] = tempColor.g;
        colAttr.array[idx * 3 + 2] = tempColor.b;

        // Time and lifetime bounds. Capture uses a fixed lifetime (no RNG) so the
        // mid-life scale is stable; at uTime=0 the spark sits CAPTURE_SPARK_PHASE into it.
        startAttr.array[idx] = uTime;
        lifeAttr.array[idx] = capture ? CAPTURE_SPARK_LIFETIME : 0.35 + rnd() * 0.55; // 0.35 - 0.9s duration
      }

      // Mark WebGL buffer segments for dynamic buffer uploads
      posAttr.needsUpdate = true;
      velAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      startAttr.needsUpdate = true;
      lifeAttr.needsUpdate = true;
    };

    useGameStore.setState({ triggerGPUSparks: triggerSparkBurst });
    return () => {
      useGameStore.setState({ triggerGPUSparks: null });
    };
  }, []);

  useFrame(() => {
    if (meshRef.current) {
      // Dev capture-determinism: pin the ember clock so any in-flight sparks hold a
      // frozen frame across capture runs. Inert in normal gameplay — live elapsed time.
      uniforms.uTime.value = isCaptureMode() ? 0 : clockRef.current.getElapsedTime();
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, MAX_SPARKS]} frustumCulled={false}>
      <planeGeometry args={[0.07, 0.07]} />
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
};
