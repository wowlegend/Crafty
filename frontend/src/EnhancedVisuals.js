import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Enhanced Block Textures with authentic Minecraft patterns
export const createBlockTexture = (blockType) => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Get block configuration
  const BLOCK_TYPES = {
    grass: { color: '#7FB238', topColor: '#7FB238', sideColor: '#5A8A2B' },
    dirt: { color: '#976D4D', pattern: 'dirt' },
    stone: { color: '#707070', pattern: 'stone' },
    wood: { color: '#8F7748', pattern: 'wood' },
    glass: { color: '#F0F8FF', pattern: 'glass' },
    water: { color: '#3F76E4', pattern: 'water' },
    lava: { color: '#FF4500', pattern: 'lava' },
    diamond: { color: '#4FD0E7', pattern: 'ore' },
    gold: { color: '#FCEE4B', pattern: 'ore' },
    iron: { color: '#D8AF93', pattern: 'ore' },
    coal: { color: '#2F2F2F', pattern: 'ore' },
    sand: { color: '#DBD3A0', pattern: 'sand' },
    cobblestone: { color: '#7F7F7F', pattern: 'cobblestone' }
  };

  const config = BLOCK_TYPES[blockType] || BLOCK_TYPES.grass;

  // Base color
  ctx.fillStyle = config.color;
  ctx.fillRect(0, 0, 32, 32);

  // Add texture patterns
  switch (config.pattern) {
    case 'dirt':
      addDirtPattern(ctx);
      break;
    case 'stone':
      addStonePattern(ctx);
      break;
    case 'wood':
      addWoodPattern(ctx);
      break;
    case 'glass':
      addGlassPattern(ctx);
      break;
    case 'water':
      addWaterPattern(ctx);
      break;
    case 'lava':
      addLavaPattern(ctx);
      break;
    case 'ore':
      addOrePattern(ctx, config.color);
      break;
    case 'sand':
      addSandPattern(ctx);
      break;
    case 'cobblestone':
      addCobblestonePattern(ctx);
      break;
    default:
      addGrassPattern(ctx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  return texture;
};

const addGrassPattern = (ctx) => {
  // Add grass texture details
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 1, 1);
  }
  
  // Add darker spots
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 2, 2);
  }
};

const addDirtPattern = (ctx) => {
  // Add dirt texture with random spots
  ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    const size = Math.random() * 3 + 1;
    ctx.fillRect(x, y, size, size);
  }
  
  ctx.fillStyle = 'rgba(160, 82, 45, 0.2)';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 1, 1);
  }
};

const addStonePattern = (ctx) => {
  // Add stone texture with cracks and variations
  ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    const size = Math.random() * 2 + 1;
    ctx.fillRect(x, y, size, size);
  }
  
  // Add darker cracks
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, Math.random() * 8 + 1, 1);
  }
};

const addWoodPattern = (ctx) => {
  // Add wood grain pattern
  ctx.fillStyle = 'rgba(139, 69, 19, 0.4)';
  for (let y = 0; y < 32; y += 2) {
    const offset = Math.sin(y * 0.3) * 2;
    ctx.fillRect(offset + 8, y, 16, 1);
  }
  
  // Add wood spots
  ctx.fillStyle = 'rgba(160, 82, 45, 0.3)';
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 2, 2);
  }
};

const addGlassPattern = (ctx) => {
  // Add glass shine effects
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillRect(2, 2, 6, 6);
  ctx.fillRect(24, 24, 4, 4);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 1, 1);
  }
};

const addWaterPattern = (ctx) => {
  // Add water wave pattern
  ctx.fillStyle = 'rgba(135, 206, 235, 0.3)';
  for (let y = 0; y < 32; y += 4) {
    const offset = Math.sin(y * 0.5) * 3;
    ctx.fillRect(offset, y, 32, 2);
  }
  
  // Add water highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 2, 1);
  }
};

const addLavaPattern = (ctx) => {
  // Add lava bubble pattern
  ctx.fillStyle = 'rgba(255, 69, 0, 0.8)';
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    const radius = Math.random() * 3 + 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Add bright spots
  ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 2, 2);
  }
};

const addOrePattern = (ctx, oreColor) => {
  // Add stone base
  addStonePattern(ctx);
  
  // Add ore veins
  ctx.fillStyle = oreColor;
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    const size = Math.random() * 4 + 2;
    ctx.fillRect(x, y, size, size);
  }
  
  // Add ore highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 1, 1);
  }
};

const addSandPattern = (ctx) => {
  // Add sand grain texture
  ctx.fillStyle = 'rgba(238, 203, 173, 0.3)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 1, 1);
  }
  
  ctx.fillStyle = 'rgba(205, 170, 125, 0.2)';
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 32;
    const y = Math.random() * 32;
    ctx.fillRect(x, y, 2, 1);
  }
};

const addCobblestonePattern = (ctx) => {
  // Add cobblestone pattern
  const stoneSize = 8;
  for (let x = 0; x < 32; x += stoneSize) {
    for (let y = 0; y < 32; y += stoneSize) {
      const offset = (Math.floor(y / stoneSize) % 2) * (stoneSize / 2);
      const stoneX = x + offset + (Math.random() - 0.5) * 2;
      const stoneY = y + (Math.random() - 0.5) * 2;
      
      // Draw stone
      ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
      ctx.fillRect(stoneX, stoneY, stoneSize - 1, stoneSize - 1);
      
      // Add stone border
      ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(stoneX, stoneY, stoneSize - 1, stoneSize - 1);
    }
  }
};

// Particle System for block breaking effects
export const BreakingParticles = ({ position, blockType, onComplete }) => {
  const groupRef = useRef();
  const particles = useMemo(() => {
    const particleCount = 8;
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      position: [
        position[0] + (Math.random() - 0.5) * 0.8,
        position[1] + Math.random() * 0.8,
        position[2] + (Math.random() - 0.5) * 0.8
      ],
      velocity: [
        (Math.random() - 0.5) * 0.1,
        Math.random() * 0.05 + 0.02,
        (Math.random() - 0.5) * 0.1
      ],
      life: 1.0,
      size: Math.random() * 0.05 + 0.02
    }));
  }, [position]);

  const [particleStates, setParticleStates] = useState(particles);

  useFrame((state, delta) => {
    setParticleStates(prev => 
      prev.map(particle => ({
        ...particle,
        position: [
          particle.position[0] + particle.velocity[0],
          particle.position[1] + particle.velocity[1],
          particle.position[2] + particle.velocity[2]
        ],
        velocity: [
          particle.velocity[0] * 0.98,
          particle.velocity[1] - 0.002, // gravity
          particle.velocity[2] * 0.98
        ],
        life: particle.life - delta * 2
      })).filter(particle => particle.life > 0)
    );
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const BLOCK_COLORS = {
    grass: '#7FB238', dirt: '#976D4D', stone: '#707070', wood: '#8F7748',
    glass: '#F0F8FF', water: '#3F76E4', lava: '#FF4500', diamond: '#4FD0E7',
    gold: '#FCEE4B', iron: '#D8AF93', coal: '#2F2F2F', sand: '#DBD3A0',
    cobblestone: '#7F7F7F'
  };

  return (
    <group ref={groupRef}>
      {particleStates.map(particle => (
        <mesh key={particle.id} position={particle.position} scale={particle.size}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial 
            color={BLOCK_COLORS[blockType] || '#7FB238'} 
            transparent 
            opacity={particle.life} 
          />
        </mesh>
      ))}
    </group>
  );
};

// Ambient Particles for atmosphere
export const AmbientParticles = () => {
  const groupRef = useRef();
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Initialize particles
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      position: [
        (Math.random() - 0.5) * 40,
        Math.random() * 10 + 2,
        (Math.random() - 0.5) * 40
      ],
      velocity: [
        (Math.random() - 0.5) * 0.02,
        Math.random() * 0.01 + 0.005,
        (Math.random() - 0.5) * 0.02
      ],
      life: Math.random(),
      maxLife: Math.random() * 10 + 5
    }));
    setParticles(newParticles);
  }, []);

  useFrame((state, delta) => {
    setParticles(prev => 
      prev.map(particle => {
        const newLife = particle.life + delta;
        const resetParticle = newLife > particle.maxLife;
        
        return resetParticle ? {
          ...particle,
          position: [
            (Math.random() - 0.5) * 40,
            2,
            (Math.random() - 0.5) * 40
          ],
          life: 0
        } : {
          ...particle,
          position: [
            particle.position[0] + particle.velocity[0],
            particle.position[1] + particle.velocity[1],
            particle.position[2] + particle.velocity[2]
          ],
          life: newLife
        };
      })
    );
  });

  return (
    <group ref={groupRef}>
      {particles.map(particle => (
        <mesh 
          key={particle.id} 
          position={particle.position} 
          scale={0.02}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial 
            color="#22c55e" 
            transparent 
            opacity={Math.sin(particle.life * 2) * 0.5 + 0.3} 
          />
        </mesh>
      ))}
    </group>
  );
};