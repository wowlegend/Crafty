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
    const blades = [];
    const count = 8; // Optimized count for performance
    
    for (let i = 0; i < count; i++) {
      // More natural distribution
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const radius = 0.2 + Math.random() * 0.3;
      
      blades.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        height: 0.12 + Math.random() * 0.08,
        width: 0.02 + Math.random() * 0.01,
        bendFactor: 0.5 + Math.random() * 0.5,
        windPhase: Math.random() * Math.PI * 2
      });
    }
    
    return blades;
  }, []);
  
  useFrame((state) => {
    if (!grassGroupRef.current) return;
    
    const time = state.clock.elapsedTime;
    const windSpeed = 2.0;
    const windPhase = time * windSpeed + windOffset.current;
    
    // Apply wind animation to each grass blade
    grassGroupRef.current.children.forEach((blade, index) => {
      const grassData = grassBlades[index];
      if (!grassData) return;
      
      // Calculate wind effect
      const windX = Math.sin(windPhase + grassData.windPhase) * windStrength * grassData.bendFactor;
      const windZ = Math.cos(windPhase * 0.7 + grassData.windPhase) * windStrength * grassData.bendFactor * 0.5;
      
      // Apply natural swaying motion
      blade.rotation.x = windX * 0.3;
      blade.rotation.z = windZ * 0.2;
      
      // Subtle height variation
      blade.position.y = grassData.height * 0.5 + Math.sin(windPhase + grassData.windPhase) * 0.01;
    });
  });
  
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
            opacity={0.8}
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
    const patches = [];
    const density = 0.3; // Reduced for performance
    const range = 20;
    
    for (let x = -range; x < range; x += 2) {
      for (let z = -range; z < range; z += 2) {
        if (Math.random() < density) {
          patches.push({
            x: x + (Math.random() - 0.5),
            z: z + (Math.random() - 0.5),
            windStrength: 0.5 + Math.random() * 0.5,
            scale: 0.8 + Math.random() * 0.4
          });
        }
      }
    }
    
    return patches;
  }, []);
  
  // Update grass patches based on camera position
  useFrame(() => {
    if (!grassPatchesRef.current || !camera) return;
    
    // Simple frustum culling for performance
    grassPatchesRef.current.children.forEach((patch, index) => {
      const patchData = grassPatches[index];
      if (!patchData) return;
      
      const dx = patchData.x - camera.position.x;
      const dz = patchData.z - camera.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // Hide distant patches
      patch.visible = distance < 15;
    });
  });
  
  return (
    <group ref={grassPatchesRef}>
      {grassPatches.map((patch, index) => {
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
      })}
    </group>
  );
};

// Grass particles for ambient effect
export const GrassParticles = () => {
  const particlesRef = useRef();
  
  const particles = useMemo(() => {
    const count = 12; // Reduced for performance
    const result = [];
    
    for (let i = 0; i < count; i++) {
      result.push({
        x: (Math.random() - 0.5) * 30,
        y: 15 + Math.random() * 8,
        z: (Math.random() - 0.5) * 30,
        speed: 0.02 + Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
        size: 0.05 + Math.random() * 0.03
      });
    }
    
    return result;
  }, []);
  
  useFrame((state) => {
    if (!particlesRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    particlesRef.current.children.forEach((particle, index) => {
      const particleData = particles[index];
      
      // Floating motion with wind effect
      particle.position.y = particleData.y + Math.sin(time + particleData.phase) * 2;
      particle.position.x = particleData.x + Math.sin(time * 0.5 + particleData.phase) * 1;
      particle.rotation.y += 0.02;
      
      // Reset if too high
      if (particle.position.y > 25) {
        particle.position.y = 12;
      }
    });
  });
  
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

// Main enhanced grass system
export const EnhancedGrassSystem = ({ camera }) => {
  return (
    <group>
      <WindyGrassField camera={camera} />
      <GrassParticles />
    </group>
  );
};