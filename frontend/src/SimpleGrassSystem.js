import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Simple Enhanced Grass System - No Runtime Errors
export const EnhancedGrassSystem = ({ chunkX, chunkZ, blockPositions = [] }) => {
  const grassGroupRef = useRef();

  // Simple wind animation
  useFrame((state) => {
    if (!grassGroupRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    grassGroupRef.current.children.forEach((grass, index) => {
      const offset = index * 0.1;
      grass.rotation.z = Math.sin(time + offset) * 0.1;
      grass.position.y = grass.userData.baseY + Math.sin(time * 2 + offset) * 0.02;
    });
  });

  // Generate grass for each grass block
  const grassElements = blockPositions
    .filter(([x, y, z, blockType]) => blockType === 'grass')
    .map(([x, y, z], index) => (
      <SimpleGrassBlade 
        key={`${x}-${y}-${z}-${index}`}
        position={[x, y + 0.5, z]}
        index={index}
      />
    ));

  return (
    <group ref={grassGroupRef}>
      {grassElements}
    </group>
  );
};

// Simple Grass Blade Component
const SimpleGrassBlade = ({ position, index }) => {
  const meshRef = useRef();
  const baseY = position[1];

  return (
    <mesh 
      ref={meshRef}
      position={position}
      userData={{ baseY }}
    >
      <planeGeometry args={[0.1, 0.2]} />
      <meshLambertMaterial 
        color="#4a7c59"
        transparent
        opacity={0.8}
        side={2} // DoubleSide
      />
    </mesh>
  );
};

export default EnhancedGrassSystem;