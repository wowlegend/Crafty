import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============ ENHANCED GRASS SYSTEM ============
// Realistic wind-blown grass effects with performance optimization

export const EnhancedGrassTexture = ({ position, windStrength = 1.0 }) => {
  const grassGroupRef = useRef();
  const windOffset = useRef(Math.random() * Math.PI * 2);
  
  // Generate grass blade positions for realistic distribution
  const grassBlades = useMemo(() => {
    try {
      const blades = [];
      const count = 6; // Optimized count for performance
      
      for (let i = 0; i < count; i++) {
        // More natural distribution
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const radius = 0.15 + Math.random() * 0.25;
        
        blades.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          height: 0.08 + Math.random() * 0.06,
          width: 0.015 + Math.random() * 0.008,
          bendFactor: 0.5 + Math.random() * 0.5,
          windPhase: Math.random() * Math.PI * 2
        });
      }
      
      return blades;
    } catch (error) {
      console.warn('Error generating grass blades:', error);
      return [];
    }
  }, []);
  
  useFrame((state) => {
    if (!grassGroupRef.current || grassBlades.length === 0) return;
    
    try {
      const time = state.clock.elapsedTime;
      const windSpeed = 1.5;
      const windPhase = time * windSpeed + windOffset.current;
      
      // Apply wind animation to each grass blade
      grassGroupRef.current.children.forEach((blade, index) => {
        const grassData = grassBlades[index];
        if (!grassData || !blade) return;
        
        // Calculate wind effect
        const windX = Math.sin(windPhase + grassData.windPhase) * windStrength * grassData.bendFactor;
        const windZ = Math.cos(windPhase * 0.7 + grassData.windPhase) * windStrength * grassData.bendFactor * 0.5;
        
        // Apply natural swaying motion
        blade.rotation.x = windX * 0.2;
        blade.rotation.z = windZ * 0.15;
        
        // Subtle height variation
        blade.position.y = grassData.height * 0.5 + Math.sin(windPhase + grassData.windPhase) * 0.005;
      });
    } catch (error) {
      console.warn('Error animating grass:', error);
    }
  });
  
  if (!position || grassBlades.length === 0) return null;
  
  return (
    <group position={position} ref={grassGroupRef}>
      {grassBlades.map((blade, index) => (
        <mesh 
          key={index}
          position={[blade.x, blade.height * 0.5, blade.z]}
          scale={[blade.width, blade.height, blade.width]}
        >
          <planeGeometry args={[1, 1]} />
          <meshLambertMaterial 
            color="#4a7c59"
            transparent 
            opacity={0.7}
            side={THREE.DoubleSide}
            alphaTest={0.1}
          />
        </mesh>
      ))}
    </group>
  );
};

export const WindyGrassField = ({ camera }) => {
  const grassPatchesRef = useRef();
  
  // Generate grass patches around player
  const grassPatches = useMemo(() => {
    try {
      const patches = [];
      const density = 0.2; // Reduced for performance
      const range = 15;
      
      for (let x = -range; x < range; x += 3) {
        for (let z = -range; z < range; z += 3) {
          if (Math.random() < density) {
            patches.push({
              x: x + (Math.random() - 0.5) * 2,
              z: z + (Math.random() - 0.5) * 2,
              windStrength: 0.5 + Math.random() * 0.5,
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
  
  // Update grass patches based on camera position
  useFrame(() => {
    if (!grassPatchesRef.current || !camera || grassPatches.length === 0) return;
    
    try {
      // Simple frustum culling for performance
      grassPatchesRef.current.children.forEach((patch, index) => {
        const patchData = grassPatches[index];
        if (!patchData || !patch) return;
        
        const dx = patchData.x - camera.position.x;
        const dz = patchData.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Hide distant patches
        patch.visible = distance < 12;
      });
    } catch (error) {
      console.warn('Error updating grass visibility:', error);
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
              <EnhancedGrassTexture 
                position={[0, 0, 0]}
                windStrength={patch.windStrength}
              />
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

// Enhanced grass particles for ambient effect
export const EnhancedGrassParticles = () => {
  const particlesRef = useRef();
  
  const particles = useMemo(() => {
    try {
      const count = 8; // Reduced for performance
      const result = [];
      
      for (let i = 0; i < count; i++) {
        result.push({
          x: (Math.random() - 0.5) * 25,
          y: 15 + Math.random() * 6,
          z: (Math.random() - 0.5) * 25,
          speed: 0.02 + Math.random() * 0.02,
          phase: Math.random() * Math.PI * 2,
          size: 0.04 + Math.random() * 0.02
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
        
        // Floating motion with wind effect
        particle.position.y = particleData.y + Math.sin(time + particleData.phase) * 1.5;
        particle.position.x = particleData.x + Math.sin(time * 0.5 + particleData.phase) * 0.8;
        particle.rotation.y += 0.015;
        
        // Reset if too high
        if (particle.position.y > 22) {
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
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// Main enhanced grass system with error handling
export const EnhancedGrassSystem = ({ camera }) => {
  if (!camera) {
    console.warn('EnhancedGrassSystem: No camera provided');
    return null;
  }
  
  return (
    <group>
      <WindyGrassField camera={camera} />
      <EnhancedGrassParticles />
    </group>
  );
};