// Enhanced Magic Wand Component - Safe implementation without dependencies
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const MagicWand = ({ position = [0, 0, 0], rotation = [0, 0, 0], isAttacking = false }) => {
  const wandRef = useRef();
  const crystalRef = useRef();
  
  useFrame((state) => {
    if (!wandRef.current || !crystalRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Gentle floating animation
    wandRef.current.position.y = position[1] + Math.sin(time * 2) * 0.02;
    
    // Crystal glow pulse
    const glowIntensity = 0.5 + Math.sin(time * 4) * 0.3;
    crystalRef.current.material.emissiveIntensity = glowIntensity;
    
    // Enhanced attack animation
    if (isAttacking) {
      const attackTime = time * 10;
      wandRef.current.rotation.x = rotation[0] + Math.sin(attackTime) * 0.5;
      wandRef.current.position.z = position[2] + Math.sin(attackTime) * 0.2;
      crystalRef.current.material.emissiveIntensity = 2.0;
    }
  });
  
  return (
    <group ref={wandRef} position={position} rotation={rotation}>
      {/* Wand handle - elegant wood design */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.8, 12]} />
        <meshLambertMaterial color="#4A4A4A" />
      </mesh>
      
      {/* Ornate metal band */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.1, 16]} />
        <meshLambertMaterial color="#FFD700" />
      </mesh>
      
      {/* Magic crystal */}
      <mesh ref={crystalRef} position={[0, 0.1, 0]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshBasicMaterial 
          color="#FF6B35"
          emissive="#FF6B35"
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Crystal holder */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.05, 0.03, 0.08, 8]} />
        <meshLambertMaterial color="#C0C0C0" />
      </mesh>
      
      {/* Magical aura when attacking */}
      {isAttacking && (
        <group>
          {Array.from({length: 8}, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const radius = 0.15;
            return (
              <mesh 
                key={i} 
                position={[
                  Math.cos(angle) * radius,
                  0.1,
                  Math.sin(angle) * radius
                ]}
                scale={[0.1, 0.1, 0.1]}
              >
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial 
                  color="#FF6B35"
                  transparent
                  opacity={0.7}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};