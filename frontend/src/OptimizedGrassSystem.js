import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ULTRA-OPTIMIZED Grass System
export const OptimizedGrassSystem = ({ chunkX, chunkZ, blockPositions = [] }) => {
  const grassGroupRef = useRef();
  const particlesRef = useRef();

  // Optimized grass filtering with memoization
  const grassBlocks = useMemo(() => {
    return blockPositions
      .filter(([x, y, z, blockType]) => blockType === 'grass')
      .slice(0, 50); // Limit for performance
  }, [blockPositions]);

  // RESTORED wind effects with performance optimization
  useFrame((state) => {
    if (!grassGroupRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // OPTIMIZED wind animation - only animate visible grass blades
    grassGroupRef.current.children.forEach((grass, index) => {
      if (index % 4 === 0) { // Only animate every 4th grass blade for performance
        const offset = index * 0.1;
        // Realistic wind sway effect
        grass.rotation.z = Math.sin(time * 0.8 + offset) * 0.12;
        grass.rotation.x = Math.cos(time * 0.6 + offset) * 0.06;
      }
    });
    
    // ENHANCED floating grass particles with wind effect
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        const offset = index * 0.5;
        // Floating motion with horizontal drift (wind effect)
        particle.position.y = 15 + Math.sin(time * 0.4 + offset) * 1.8;
        particle.position.x += Math.sin(time * 0.3 + offset) * 0.01; // Wind drift
        particle.rotation.z = Math.sin(time * 0.5 + offset) * 0.3; // Rotation in wind
        
        // Reset particles that float too high or drift too far
        if (particle.position.y > 22 || Math.abs(particle.position.x) > 35) {
          particle.position.y = 12;
          particle.position.x = (Math.random() - 0.5) * 30; // Reset x position
        }
      });
    }
  });

  // ENHANCED grass particles with more natural distribution
  const grassParticles = useMemo(() => {
    const particles = [];
    for (let i = 0; i < 8; i++) { // Increased count for better visual effect
      particles.push({
        x: (Math.random() - 0.5) * 30,
        y: 12 + Math.random() * 8,
        z: (Math.random() - 0.5) * 30,
        scale: 0.4 + Math.random() * 0.4 // Varied sizes
      });
    }
    return particles;
  }, [chunkX, chunkZ]);

  return (
    <group>
      {/* Optimized grass blades */}
      <group ref={grassGroupRef}>
        {grassBlocks.map(([x, y, z], index) => (
          <OptimizedGrassBlade 
            key={`${x}-${y}-${z}`}
            position={[x, y + 0.5, z]}
          />
        ))}
      </group>
      
      {/* Wind particles */}
      <group ref={particlesRef}>
        {grassParticles.map((particle, index) => (
          <mesh 
            key={index} 
            position={[particle.x, particle.y, particle.z]}
            scale={[particle.scale, particle.scale, particle.scale]}
          >
            <planeGeometry args={[0.08, 0.16]} />
            <meshBasicMaterial 
              color="#7FB347" 
              transparent 
              opacity={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// Highly optimized individual grass blade
const OptimizedGrassBlade = React.memo(({ position }) => {
  return (
    <mesh position={position}>
      <planeGeometry args={[0.08, 0.15]} />
      <meshBasicMaterial 
        color="#4a7c59"
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
});

export default OptimizedGrassSystem;