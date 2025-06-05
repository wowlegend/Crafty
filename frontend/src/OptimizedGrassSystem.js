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

  // Optimized wind animation
  useFrame((state) => {
    if (!grassGroupRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Simplified animation for performance
    grassGroupRef.current.children.forEach((grass, index) => {
      if (index % 3 === 0) { // Only animate every 3rd grass blade
        const offset = index * 0.1;
        grass.rotation.z = Math.sin(time * 0.5 + offset) * 0.08;
      }
    });
    
    // Animate floating particles
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        const offset = index * 0.5;
        particle.position.y = 15 + Math.sin(time * 0.3 + offset) * 1.5;
        if (particle.position.y > 20) {
          particle.position.y = 12;
        }
      });
    }
  });

  // Simplified grass particles for performance
  const grassParticles = useMemo(() => {
    const particles = [];
    for (let i = 0; i < 4; i++) { // Reduced count
      particles.push({
        x: (Math.random() - 0.5) * 30,
        y: 12 + Math.random() * 8,
        z: (Math.random() - 0.5) * 30,
        scale: 0.5 + Math.random() * 0.3
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
            <planeGeometry args={[0.06, 0.12]} />
            <meshBasicMaterial 
              color="#90EE90" 
              transparent 
              opacity={0.5}
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