import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

const MAX_SPARKS = 1200;

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
    const triggerSparkBurst = (pos, colorHex, count = 25, type = 'physical') => {
      if (!meshRef.current) return;
      const geom = meshRef.current.geometry;
      const posAttr = geom.getAttribute('aPosition');
      const velAttr = geom.getAttribute('aVelocity');
      const colAttr = geom.getAttribute('aColor');
      const startAttr = geom.getAttribute('aStartTime');
      const lifeAttr = geom.getAttribute('aLifetime');

      const tempColor = new THREE.Color(colorHex);
      const uTime = clockRef.current.getElapsedTime();

      const baseCount = Math.min(count, 120);

      for (let i = 0; i < baseCount; i++) {
        const idx = particleIndex.current;
        particleIndex.current = (particleIndex.current + 1) % MAX_SPARKS;

        // Origin coordinate
        posAttr.array[idx * 3] = pos.x;
        posAttr.array[idx * 3 + 1] = pos.y;
        posAttr.array[idx * 3 + 2] = pos.z;

        // Custom velocity profiles by hit type
        let vx = (Math.random() - 0.5) * 5.0;
        let vy = Math.random() * 6.0 + 2.0; // upward bias
        let vz = (Math.random() - 0.5) * 5.0;

        if (type === 'fireball') {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2.5 + Math.random() * 4.5;
          vx = Math.cos(angle) * speed;
          vy = Math.random() * 5.0 + 3.0;
          vz = Math.sin(angle) * speed;
        } else if (type === 'iceball') {
          vx *= 0.5;
          vy = Math.random() * 2.5 + 0.5;
          vz *= 0.5;
        } else if (type === 'lightning') {
          vx *= 2.0;
          vy = Math.random() * 9.0 + 3.0;
          vz *= 2.0;
        } else if (type === 'arcane') {
          vx *= 0.3;
          vy = Math.random() * 3.5 + 2.5;
          vz *= 0.3;
        } else if (type === 'physical') {
          vx = (Math.random() - 0.5) * 6.5;
          vy = Math.random() * 7.5 + 1.5;
          vz = (Math.random() - 0.5) * 6.5;
        }

        velAttr.array[idx * 3] = vx;
        velAttr.array[idx * 3 + 1] = vy;
        velAttr.array[idx * 3 + 2] = vz;

        // RGB color channels
        colAttr.array[idx * 3] = tempColor.r;
        colAttr.array[idx * 3 + 1] = tempColor.g;
        colAttr.array[idx * 3 + 2] = tempColor.b;

        // Time and lifetime bounds
        startAttr.array[idx] = uTime;
        lifeAttr.array[idx] = 0.35 + Math.random() * 0.55; // 0.35 - 0.9s duration
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
