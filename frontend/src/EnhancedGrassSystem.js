import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Enhanced Grass System with Wind Effects
export const EnhancedGrassSystem = ({ chunkX, chunkZ, blockPositions = [] }) => {
  const grassGroupRef = useRef();
  const windRef = useRef({ 
    direction: new THREE.Vector2(1, 0.5).normalize(),
    strength: 0.5,
    time: 0 
  });

  // Generate grass instances for performance
  const grassData = useMemo(() => {
    const instances = [];
    
    blockPositions.forEach(([x, y, z, blockType]) => {
      if (blockType === 'grass') {
        // Multiple grass blades per block for density
        for (let i = 0; i < 12; i++) {
          instances.push({
            position: new THREE.Vector3(
              x + (Math.random() - 0.5) * 0.8,
              y + 0.5,
              z + (Math.random() - 0.5) * 0.8
            ),
            rotation: Math.random() * Math.PI * 2,
            scale: 0.8 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
            windSensitivity: 0.5 + Math.random() * 0.5
          });
        }
      }
    });
    
    return instances;
  }, [blockPositions]);

  // Wind animation
  useFrame((state, delta) => {
    if (!grassGroupRef.current) return;
    
    windRef.current.time += delta;
    
    // Dynamic wind direction and strength
    const time = windRef.current.time;
    windRef.current.direction.x = Math.sin(time * 0.3) * 0.7 + 0.3;
    windRef.current.direction.y = Math.cos(time * 0.2) * 0.4 + 0.6;
    windRef.current.strength = 0.3 + Math.sin(time * 0.5) * 0.2;
    
    // Apply wind to grass children
    grassGroupRef.current.children.forEach((grass, index) => {
      if (grassData[index]) {
        const data = grassData[index];
        const windPhase = time * 2 + data.phase;
        
        // Wind sway calculation
        const swayX = Math.sin(windPhase) * windRef.current.direction.x * windRef.current.strength * data.windSensitivity;
        const swayZ = Math.cos(windPhase * 0.7) * windRef.current.direction.y * windRef.current.strength * data.windSensitivity;
        
        // Apply rotation for wind effect
        grass.rotation.x = swayX * 0.3;
        grass.rotation.z = swayZ * 0.3;
        grass.rotation.y = data.rotation + swayX * 0.1;
        
        // Subtle up-down motion
        grass.position.y = data.position.y + Math.sin(windPhase * 1.5) * 0.02;
        
        // Color variation based on wind
        if (grass.material) {
          const intensity = 0.8 + Math.sin(windPhase) * 0.1;
          grass.material.color.setRGB(0.2 * intensity, 0.6 * intensity, 0.25 * intensity);
        }
      }
    });
  });

  if (grassData.length === 0) return null;

  return (
    <group ref={grassGroupRef}>
      {grassData.map((data, index) => (
        <GrassBlade key={index} data={data} />
      ))}
    </group>
  );
};

// Individual Grass Blade Component
const GrassBlade = ({ data }) => {
  const meshRef = useRef();
  
  // Grass blade geometry
  const grassGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(0.1, 0.3);
    
    // Modify vertices for natural grass shape
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const y = vertices[i + 1];
      // Taper the grass blade towards the top
      const taper = 1 - (y + 0.15) / 0.3;
      vertices[i] *= taper;
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }, []);

  const grassMaterial = useMemo(() => {
    return new THREE.MeshLambertMaterial({
      color: new THREE.Color(0.2, 0.6, 0.25),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      alphaTest: 0.1
    });
  }, []);

  return (
    <mesh
      ref={meshRef}
      position={data.position}
      rotation={[0, data.rotation, 0]}
      scale={[data.scale, data.scale, data.scale]}
      geometry={grassGeometry}
      material={grassMaterial}
    />
  );
};

// Wind Particle System for added atmosphere
export const WindParticleSystem = () => {
  const particlesRef = useRef();
  const particleCount = 30;
  
  const particleData = useMemo(() => {
    const data = [];
    for (let i = 0; i < particleCount; i++) {
      data.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          15 + Math.random() * 10,
          (Math.random() - 0.5) * 100
        ),
        velocity: new THREE.Vector3(
          Math.random() * 2 + 1,
          (Math.random() - 0.5) * 0.5,
          Math.random() * 1 + 0.5
        ),
        life: Math.random() * 1000,
        maxLife: 3000 + Math.random() * 2000
      });
    }
    return data;
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;
    
    particlesRef.current.children.forEach((particle, index) => {
      const data = particleData[index];
      
      // Update position
      particle.position.add(data.velocity.clone().multiplyScalar(delta));
      
      // Update life
      data.life += delta * 1000;
      
      // Reset particle if expired
      if (data.life > data.maxLife) {
        particle.position.set(
          (Math.random() - 0.5) * 100,
          15 + Math.random() * 10,
          (Math.random() - 0.5) * 100
        );
        data.life = 0;
      }
      
      // Fade based on life
      const opacity = 1 - (data.life / data.maxLife);
      particle.material.opacity = opacity * 0.4;
    });
  });

  return (
    <group ref={particlesRef}>
      {[...Array(particleCount)].map((_, i) => (
        <mesh key={i} position={particleData[i].position}>
          <sphereGeometry args={[0.02, 4, 4]} />
          <meshBasicMaterial 
            color="#f0f8ff"
            transparent
            opacity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
};

// Grass Texture Component for block surfaces
export const EnhancedGrassTexture = ({ position, blockType }) => {
  const textureRef = useRef();
  
  useFrame((state) => {
    if (textureRef.current && blockType === 'grass') {
      const time = state.clock.elapsedTime;
      
      // Subtle texture animation
      textureRef.current.children.forEach((child, index) => {
        const offset = index * 0.5;
        child.rotation.y = Math.sin(time + offset) * 0.1;
        child.position.y = 0.51 + Math.sin(time * 2 + offset) * 0.01;
      });
    }
  });
  
  if (blockType !== 'grass') return null;
  
  return (
    <group ref={textureRef} position={position}>
      {/* Surface grass details */}
      {[...Array(4)].map((_, i) => (
        <mesh 
          key={i}
          position={[
            (Math.random() - 0.5) * 0.7,
            0.51,
            (Math.random() - 0.5) * 0.7
          ]}
          rotation={[0, Math.random() * Math.PI * 2, 0]}
        >
          <planeGeometry args={[0.08, 0.12]} />
          <meshLambertMaterial 
            color="#4a7c59"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      
      {/* Tiny flowers occasionally */}
      {Math.random() < 0.1 && (
        <mesh position={[
          (Math.random() - 0.5) * 0.6,
          0.52,
          (Math.random() - 0.5) * 0.6
        ]}>
          <sphereGeometry args={[0.02, 4, 4]} />
          <meshBasicMaterial color="#ffff88" />
        </mesh>
      )}
    </group>
  );
};

export default EnhancedGrassSystem;
