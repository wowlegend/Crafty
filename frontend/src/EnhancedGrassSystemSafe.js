import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============ SAFE ENHANCED GRASS SYSTEM ============
// Simple implementation that won't cause Three.js errors

// Simple grass patches with basic animation
export const SafeGrassPatches = ({ camera }) => {
  const grassPatchesRef = useRef();
  
  // Generate simple grass patches
  const grassPatches = useMemo(() => {
    try {
      const patches = [];
      const density = 0.15; // Reduced for performance
      const range = 12;
      
      for (let x = -range; x < range; x += 4) {
        for (let z = -range; z < range; z += 4) {
          if (Math.random() < density) {
            patches.push({
              x: x + (Math.random() - 0.5) * 2,
              z: z + (Math.random() - 0.5) * 2,
              scale: 0.8 + Math.random() * 0.4
            });
          }
        }
      }
      
      return patches;
    } catch (error) {
      console.warn('Error generating grass patches:', error);
      return [];
    }
  }, []);
  
  // Simple animation without complex Three.js operations
  useFrame((state) => {
    if (!grassPatchesRef.current || !camera || grassPatches.length === 0) return;
    
    try {
      const time = state.clock.elapsedTime;
      
      // Simple visibility culling
      grassPatchesRef.current.children.forEach((patch, index) => {
        const patchData = grassPatches[index];
        if (!patchData || !patch) return;
        
        const dx = patchData.x - camera.position.x;
        const dz = patchData.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Hide distant patches
        patch.visible = distance < 10;
        
        // Simple animation
        if (patch.visible && patch.rotation) {
          patch.rotation.y = Math.sin(time + index) * 0.1;
        }
      });
    } catch (error) {
      console.warn('Error animating grass:', error);
    }
  });
  
  if (!camera || grassPatches.length === 0) return null;
  
  return (
    <group ref={grassPatchesRef}>
      {grassPatches.map((patch, index) => {
        try {
          // Calculate ground level for this position
          const groundY = window.getHighestBlockAt ? 
            window.getHighestBlockAt(patch.x, patch.z) + 1 : 15;
          
          return (
            <group 
              key={index}
              position={[patch.x, groundY, patch.z]}
              scale={[patch.scale, patch.scale, patch.scale]}
            >
              <mesh position={[0, 0.05, 0]}>
                <planeGeometry args={[0.3, 0.3]} />
                <meshLambertMaterial 
                  color="#4a7c59"
                  transparent 
                  opacity={0.6}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        } catch (error) {
          console.warn(`Error rendering grass patch ${index}:`, error);
          return null;
        }
      })}
    </group>
  );
};

// Simple floating particles
export const SafeGrassParticles = () => {
  const particlesRef = useRef();
  
  const particles = useMemo(() => {
    try {
      const count = 6; // Reduced for performance
      const result = [];
      
      for (let i = 0; i < count; i++) {
        result.push({
          x: (Math.random() - 0.5) * 20,
          y: 15 + Math.random() * 4,
          z: (Math.random() - 0.5) * 20,
          size: 0.03 + Math.random() * 0.02
        });
      }
      
      return result;
    } catch (error) {
      console.warn('Error generating grass particles:', error);
      return [];
    }
  }, []);
  
  useFrame((state) => {
    if (!particlesRef.current || particles.length === 0) return;
    
    try {
      const time = state.clock.elapsedTime;
      
      particlesRef.current.children.forEach((particle, index) => {
        const particleData = particles[index];
        if (!particleData || !particle) return;
        
        // Simple floating motion
        if (particle.position) {
          particle.position.y = particleData.y + Math.sin(time + index) * 1;
          particle.position.x = particleData.x + Math.sin(time * 0.5 + index) * 0.5;
        }
        
        // Simple rotation
        if (particle.rotation) {
          particle.rotation.y += 0.01;
        }
        
        // Reset if too high
        if (particle.position && particle.position.y > 20) {
          particle.position.y = 12;
        }
      });
    } catch (error) {
      console.warn('Error animating grass particles:', error);
    }
  });
  
  if (particles.length === 0) return null;
  
  return (
    <group ref={particlesRef}>
      {particles.map((particle, index) => (
        <mesh 
          key={index} 
          position={[particle.x, particle.y, particle.z]}
          scale={[particle.size, particle.size * 2, particle.size]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial 
            color="#90EE90" 
            transparent 
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// Main safe grass system with error handling
export const EnhancedGrassSystem = ({ camera }) => {
  if (!camera) {
    console.warn('EnhancedGrassSystem: No camera provided');
    return null;
  }
  
  try {
    return (
      <group>
        <SafeGrassPatches camera={camera} />
        <SafeGrassParticles />
      </group>
    );
  } catch (error) {
    console.error('Error in EnhancedGrassSystem:', error);
    return null;
  }
};