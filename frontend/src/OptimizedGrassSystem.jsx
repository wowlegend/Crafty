import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store/useGameStore';
import { ecs } from './ecs/world';
import { isCaptureMode, captureRandom } from './devtest/captureMode';

// Custom materials with GPU-based wind swaying & player displacement
const grassMaterial = new THREE.MeshBasicMaterial({
  color: '#4a7c59',
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide
});

grassMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.time = { value: 0 };
  shader.uniforms.entityPositions = {
    value: Array.from({ length: 8 }, () => new THREE.Vector3(9999, 9999, 9999))
  };

  shader.vertexShader = `
    uniform float time;
    uniform vec3 entityPositions[8];
    ${shader.vertexShader}
  `;

  shader.vertexShader = shader.vertexShader.replace(
    `#include <begin_vertex>`,
    `
    #include <begin_vertex>
    float offset = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5;
    // Apply sway and bending only to the top vertices of grass blades
    if (position.y > 0.0) {
       // Premium multi-frequency wind sway
       float windSwayX = sin(time * 2.2 + offset) * 0.12 + sin(time * 0.8 + offset * 2.0) * 0.06;
       float windSwayZ = cos(time * 1.8 + offset) * 0.08 + cos(time * 0.6 + offset * 1.5) * 0.04;
       transformed.x += windSwayX;
       transformed.z += windSwayZ;
       
       // GPU proximity grass bending for multiple entities (player, pets, mobs)
       vec3 instancePosition = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       vec3 totalDisplacement = vec3(0.0);

       for (int i = 0; i < 8; i++) {
          vec3 pos = entityPositions[i];
          if (pos.y > 9990.0) continue; // Skip inactive/unassigned slots
          
          vec3 diff = instancePosition - pos;
          float dist = length(diff);
          if (dist < 2.2) {
             float force = (2.2 - dist) / 2.2;
             vec3 bendDir = normalize(vec3(diff.x, 0.0, diff.z));
             if (length(bendDir) < 0.01) bendDir = vec3(1.0, 0.0, 0.0);
             
             totalDisplacement.x += bendDir.x * force * force * 0.7;
             totalDisplacement.z += bendDir.z * force * force * 0.7;
             totalDisplacement.y -= force * force * 0.25;
          }
       }
       transformed.xyz += totalDisplacement;
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
      // Per-instance seeded RNG in capture mode (chunk+index keyed → order-independent
      // across terrain-stream runs); native Math.random in gameplay. Mirrors the
      // weather-particle seeding pattern in GameScene.jsx.
      const r = captureRandom(`grass-particle-${chunkX}-${chunkZ}-${i}`);
      particles.push({
        x: (r() - 0.5) * 30,
        y: 12 + r() * 8,
        z: (r() - 0.5) * 30,
        scale: 0.4 + r() * 0.4,
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
    // Dev capture-determinism: pin the wind-sway clock to a fixed value so the
    // grass holds a frozen pose across capture runs (wall-clock elapsedTime differs
    // run-to-run → frame jitter, dominant ~3-4% self-diff on explore-night). Inert in
    // normal gameplay — falls through to the live clock so wind animates as before.
    const capture = isCaptureMode();
    const time = capture ? 0 : state.clock.elapsedTime;

    // 1. Update GPU shader time and entityPositions uniforms for grass
    if (grassMaterial.userData.shader) {
      grassMaterial.userData.shader.uniforms.time.value = time;
      const uniforms = grassMaterial.userData.shader.uniforms;
      const positions = uniforms.entityPositions.value;

      // Reset all slots to inactive coordinate sentinels
      for (let k = 0; k < 8; k++) {
        positions[k].set(9999, 9999, 9999);
      }

      let index = 0;

      // Slot 0: Player Position coordinates
      const playerPos = useGameStore.getState().playerPosition;
      if (playerPos) {
        positions[index].set(playerPos.x, playerPos.y, playerPos.z);
        index++;
      }

      // Slots 1-7: Active mobs from the ECS world
      if (ecs && ecs.entities) {
        ecs.entities.forEach(entity => {
          if (entity.isMob && entity.position && index < 8) {
            positions[index].set(entity.position[0], entity.position[1], entity.position[2]);
            index++;
          }
        });
      }
    }

    // 2. Update CPU particles (only 8 elements, minimal overhead)
    if (particleMeshRef.current) {
      const dummy = new THREE.Object3D();
      grassParticles.forEach((p, i) => {
        // In capture mode hold the seeded base pose: skip the per-frame drift
        // accumulation (otherwise p.x creeps each frame and run-to-run frame counts
        // differ → jitter) and skip the unseeded Math.random reset branch entirely.
        if (!capture) {
          p.y = 15 + Math.sin(time * 0.4 + p.offset) * 1.8;
          p.x += Math.sin(time * 0.3 + p.offset) * 0.01;

          if (p.y > 22 || Math.abs(p.x) > 35) {
            p.y = 12;
            p.x = (Math.random() - 0.5) * 30;
          }
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


