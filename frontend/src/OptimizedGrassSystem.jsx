import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store/useGameStore';

// Custom materials with GPU-based wind swaying & player displacement
const grassMaterial = new THREE.MeshBasicMaterial({
  color: '#4a7c59',
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide
});

grassMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.time = { value: 0 };
  shader.uniforms.playerPosition = { value: new THREE.Vector3(0, 0, 0) };
  shader.vertexShader = `
    uniform float time;
    uniform vec3 playerPosition;
    ${shader.vertexShader}
  `;
  shader.vertexShader = shader.vertexShader.replace(
    `#include <begin_vertex>`,
    `
    #include <begin_vertex>
    float offset = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5;
    // Apply sway only to the top vertices
    if (position.y > 0.0) {
       // Natural wind sway
       transformed.x += sin(time * 2.0 + offset) * 0.15;
       transformed.z += cos(time * 1.5 + offset) * 0.1;
       
       // GPU proximity grass bending
       vec3 instancePosition = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       vec3 diff = instancePosition - playerPosition;
       float dist = length(diff);
       if (dist < 2.2) {
          float force = (2.2 - dist) / 2.2;
          vec3 bendDir = normalize(vec3(diff.x, 0.0, diff.z));
          if (length(bendDir) < 0.01) bendDir = vec3(1.0, 0.0, 0.0);
          transformed.x += bendDir.x * force * force * 0.7;
          transformed.z += bendDir.z * force * force * 0.7;
          transformed.y -= force * force * 0.25;
       }
    }
    `
  );
  grassMaterial.userData.shader = shader;
};

// Particles use CPU updates since there are only 8, but they are instanced
const particleMaterial = new THREE.MeshBasicMaterial({
  color: '#7FB347',
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide
});

export const OptimizedGrassSystem = ({ chunkX, chunkZ, blockPositions = [] }) => {
  const grassMeshRef = useRef();
  const particleMeshRef = useRef();

  const grassBlocks = useMemo(() => {
    return blockPositions
      .filter(([x, y, z, blockType]) => blockType === 'grass')
      .slice(0, 50); // Limit for performance
  }, [blockPositions]);

  const grassCount = grassBlocks.length;
  
  const grassParticles = useMemo(() => {
    const particles = [];
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 30,
        y: 12 + Math.random() * 8,
        z: (Math.random() - 0.5) * 30,
        scale: 0.4 + Math.random() * 0.4,
        offset: i * 0.5
      });
    }
    return particles;
  }, [chunkX, chunkZ]);

  const particleCount = grassParticles.length;

  useEffect(() => {
    if (!grassMeshRef.current) return;
    const dummy = new THREE.Object3D();
    
    grassBlocks.forEach(([x, y, z], i) => {
      dummy.position.set(x, y + 0.5, z);
      dummy.updateMatrix();
      grassMeshRef.current.setMatrixAt(i, dummy.matrix);
    });
    grassMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [grassBlocks]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // 1. Update GPU shader time and playerPosition uniforms for grass
    if (grassMaterial.userData.shader) {
      grassMaterial.userData.shader.uniforms.time.value = time;
      const playerPos = useGameStore.getState().playerPosition;
      if (playerPos) {
        grassMaterial.userData.shader.uniforms.playerPosition.value.set(playerPos.x, playerPos.y, playerPos.z);
      }
    }

    // 2. Update CPU particles (only 8 elements, minimal overhead)
    if (particleMeshRef.current) {
      const dummy = new THREE.Object3D();
      grassParticles.forEach((p, i) => {
        p.y = 15 + Math.sin(time * 0.4 + p.offset) * 1.8;
        p.x += Math.sin(time * 0.3 + p.offset) * 0.01;
        
        if (p.y > 22 || Math.abs(p.x) > 35) {
          p.y = 12;
          p.x = (Math.random() - 0.5) * 30;
        }

        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.scale);
        dummy.rotation.z = Math.sin(time * 0.5 + p.offset) * 0.3;
        dummy.updateMatrix();
        particleMeshRef.current.setMatrixAt(i, dummy.matrix);
      });
      particleMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {grassCount > 0 && (
        <instancedMesh ref={grassMeshRef} args={[null, grassMaterial, grassCount]}>
          <planeGeometry args={[0.1, 0.18]} />
        </instancedMesh>
      )}
      {particleCount > 0 && (
        <instancedMesh ref={particleMeshRef} args={[null, particleMaterial, particleCount]}>
          <planeGeometry args={[0.08, 0.16]} />
        </instancedMesh>
      )}
    </group>
  );
};


