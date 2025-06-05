import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Box, Plane, Stars } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { 
  Pickaxe, 
  Package, 
  Settings, 
  Sun, 
  Moon, 
  Wand2, 
  Copy, 
  Download,
  Upload,
  Trash2,
  Grid3X3,
  Eye,
  EyeOff,
  Heart,
  Zap,
  Star,
  Hammer,
  Sword,
  Shield
} from 'lucide-react';

// Authentic Minecraft Block Types Configuration
export const BLOCK_TYPES = {
  grass: { color: '#567C35', name: 'Grass Block', texture: 'grass' },
  dirt: { color: '#976D4D', name: 'Dirt', texture: 'dirt' },
  stone: { color: '#707070', name: 'Stone', texture: 'stone' },
  wood: { color: '#8F7748', name: 'Oak Wood', texture: 'wood' },
  glass: { color: '#F0F8FF', name: 'Glass', texture: 'glass', transparent: true },
  water: { color: '#3F76E4', name: 'Water', texture: 'water', transparent: true },
  lava: { color: '#FF4500', name: 'Lava', texture: 'lava', emissive: true },
  diamond: { color: '#4FD0E7', name: 'Diamond Ore', texture: 'diamond', emissive: true },
  gold: { color: '#FCEE4B', name: 'Gold Ore', texture: 'gold' },
  iron: { color: '#D8AF93', name: 'Iron Ore', texture: 'iron' },
  coal: { color: '#2F2F2F', name: 'Coal Ore', texture: 'coal' },
  sand: { color: '#DBD3A0', name: 'Sand', texture: 'sand' },
  cobblestone: { color: '#7F7F7F', name: 'Cobblestone', texture: 'cobblestone' }
};

// Minecraft-style Hotbar
const MinecraftHotbar = ({ gameState }) => {
  const hotbarBlocks = Object.keys(BLOCK_TYPES).slice(0, 9);
  
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {hotbarBlocks.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory.blocks[blockType] || 0;
          
          return (
            <div
              key={blockType}
              className={`minecraft-hotbar-slot ${isSelected ? 'selected' : ''}`}
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
            >
              <div 
                className="minecraft-block-icon"
                style={{ backgroundColor: blockConfig.color }}
              />
              {quantity > 1 && (
                <div className="minecraft-quantity">
                  {quantity > 999 ? '999+' : quantity}
                </div>
              )}
              <div className="minecraft-hotkey">
                {index + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Minecraft-style Health and Hunger bars
const MinecraftHealthHunger = () => {
  return (
    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-status-bars">
        <div className="minecraft-health-bar">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="minecraft-heart">
              <div className="minecraft-heart-icon">❤</div>
            </div>
          ))}
        </div>
        <div className="minecraft-hunger-bar">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="minecraft-hunger">
              <div className="minecraft-hunger-icon">🍖</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Enhanced terrain generation that favors grass terrain
const generateTerrain = (x, z) => {
  const noise = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3 + Math.sin(x * 0.05) * Math.cos(z * 0.05) * 6;
  const height = Math.floor(Math.max(10, Math.min(18, noise + 14))); // Raised base height for more grass
  return height;
};

// PERFORMANCE-OPTIMIZED Infinite World Generation - SMOOTH & FAST
export const MinecraftWorld = ({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const { camera } = useThree();
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  const lastPlayerPosition = useRef({ x: 0, z: 0 });
  const lastGenerationTime = useRef(0);
  const generationQueue = useRef([]);
  
  const chunkSize = 16;
  const renderDistance = 3; // Reduced for better performance
  const generationTriggerDistance = 2; // Generate when player is 2 chunks away

  // OPTIMIZED chunk generation - MUCH FASTER
  const generateChunk = (chunkX, chunkZ) => {
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    if (generatedChunks.has(chunkKey)) {
      return;
    }

    const newBlocks = new Map();
    const startX = chunkX * chunkSize;
    const startZ = chunkZ * chunkSize;
    
    // OPTIMIZED: Generate only surface + 1 layer for speed
    for (let x = startX; x < startX + chunkSize; x += 2) { // Skip every other block for performance
      for (let z = startZ; z < startZ + chunkSize; z += 2) {
        const height = generateTerrain(x, z);
        
        // Generate surface blocks - favor grass terrain
        for (let y = Math.max(0, height - 1); y <= height; y++) {
          const key = `${x},${y},${z}`;
          
          if (y === height) {
            // 85% grass, 15% sand for variety
            const blockType = height > 12 && Math.random() < 0.85 ? 'grass' : 'sand';
            newBlocks.set(key, { position: [x, y, z], type: blockType });
          } else {
            newBlocks.set(key, { position: [x, y, z], type: 'dirt' });
          }
        }
        
        // Fill gaps for smoother terrain
        if (x % 2 === 0 && z % 2 === 0) {
          const key1 = `${x+1},${height},${z}`;
          const key2 = `${x},${height},${z+1}`;
          const key3 = `${x+1},${height},${z+1}`;
          
          newBlocks.set(key1, { position: [x+1, height, z], type: height > 14 ? 'grass' : 'sand' });
          newBlocks.set(key2, { position: [x, height, z+1], type: height > 14 ? 'grass' : 'sand' });
          newBlocks.set(key3, { position: [x+1, height, z+1], type: height > 14 ? 'grass' : 'sand' });
        }
      }
    }
    
    // IMMEDIATE update - no setTimeout for faster response
    setBlocks(prevBlocks => {
      const updatedBlocks = new Map(prevBlocks);
      newBlocks.forEach((value, key) => {
        updatedBlocks.set(key, value);
      });
      return updatedBlocks;
    });
    
    // Mark chunk as generated
    setGeneratedChunks(prevChunks => {
      const updatedChunks = new Set(prevChunks);
      updatedChunks.add(chunkKey);
      return updatedChunks;
    });
    
    console.log(`⚡ FAST generated chunk ${chunkKey} with ${newBlocks.size} blocks`);
  };

  // ULTRA-SMOOTH terrain generation detection with direction-change optimization
  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000;
    
    // More frequent checks for smoother generation during direction changes
    if (now - lastGenerationTime.current < 50) { // Reduced from 100ms to 50ms
      return;
    }
    
    const playerX = Math.floor(camera.position.x);
    const playerZ = Math.floor(camera.position.z);
    const currentChunkX = Math.floor(playerX / chunkSize);
    const currentChunkZ = Math.floor(playerZ / chunkSize);
    
    // ENHANCED PREDICTIVE: Get player direction and velocity for better anticipation
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // Calculate movement speed to anticipate faster for quick direction changes
    const velocity = new THREE.Vector3(
      playerX - (lastPlayerPosition.current?.x || playerX),
      0,
      playerZ - (lastPlayerPosition.current?.z || playerZ)
    );
    const speed = velocity.length();
    
    // Larger prediction distance for faster movement and direction changes
    const predictionDistance = Math.max(32, speed * 48); // Dynamic prediction
    const futureChunkX = Math.floor((playerX + direction.x * predictionDistance) / chunkSize);
    const futureChunkZ = Math.floor((playerZ + direction.z * predictionDistance) / chunkSize);
    
    // Additional prediction for perpendicular directions (for turning)
    const leftChunkX = Math.floor((playerX + direction.z * 24) / chunkSize);
    const leftChunkZ = Math.floor((playerZ - direction.x * 24) / chunkSize);
    const rightChunkX = Math.floor((playerX - direction.z * 24) / chunkSize);
    const rightChunkZ = Math.floor((playerZ + direction.x * 24) / chunkSize);
    
    const chunkChanged = currentChunkX !== lastPlayerChunk.current.x || currentChunkZ !== lastPlayerChunk.current.z;
    
    if (chunkChanged || now - lastGenerationTime.current > 100) { // More frequent generation
      lastPlayerChunk.current = { x: currentChunkX, z: currentChunkZ };
      lastPlayerPosition.current = { x: playerX, z: playerZ };
      lastGenerationTime.current = now;
      
      // Generate multiple priority chunks including directional predictions
      const priorityChunks = [
        // Current area (highest priority)
        { x: currentChunkX, z: currentChunkZ, priority: 0 },
        { x: currentChunkX + 1, z: currentChunkZ, priority: 1 },
        { x: currentChunkX - 1, z: currentChunkZ, priority: 1 },
        { x: currentChunkX, z: currentChunkZ + 1, priority: 1 },
        { x: currentChunkX, z: currentChunkZ - 1, priority: 1 },
        
        // Predictive chunks for movement direction
        { x: futureChunkX, z: futureChunkZ, priority: 1 },
        
        // Turning prediction chunks
        { x: leftChunkX, z: leftChunkZ, priority: 2 },
        { x: rightChunkX, z: rightChunkZ, priority: 2 },
        
        // Extended area for smooth traversal
        { x: currentChunkX + 2, z: currentChunkZ, priority: 3 },
        { x: currentChunkX - 2, z: currentChunkZ, priority: 3 },
        { x: currentChunkX, z: currentChunkZ + 2, priority: 3 },
        { x: currentChunkX, z: currentChunkZ - 2, priority: 3 },
      ];
      
      // Generate up to 4 chunks per frame for ultra-smooth experience
      let generated = 0;
      for (const chunk of priorityChunks) {
        if (generated >= 4) break; // Increased from 2 to 4 for faster generation
        
        const chunkKey = `${chunk.x}_${chunk.z}`;
        if (!generatedChunks.has(chunkKey)) {
          generateChunk(chunk.x, chunk.z);
          generated++;
        }
      }
    }
  });

  // Enhanced initial world generation
  useEffect(() => {
    console.log('🌍 Initializing enhanced world with better chunk coverage...');
    
    // Generate initial 3x3 chunks around spawn
    const generateInitial = async () => {
      console.log('🌍 Starting initial world generation...');
      
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          console.log(`🌍 Generating initial chunk (${x}, ${z})`);
          await generateChunk(x, z);
          await new Promise(resolve => setTimeout(resolve, 100)); // Delay between chunks
        }
      }
      
      console.log('✅ Initial world generation complete');
    };
    
    generateInitial();
  }, []);

  // Enhanced collision detection
  const getHighestBlockAt = (x, z) => {
    let maxY = 8;
    for (let y = 8; y <= 30; y++) { // Increased height range
      const key = `${Math.floor(x)},${y},${Math.floor(z)}`;
      if (blocks.has(key)) {
        maxY = Math.max(maxY, y);
      }
    }
    return maxY;
  };

  useEffect(() => {
    window.getHighestBlockAt = getHighestBlockAt;
  }, [blocks]);

  // Enhanced block placement with chunk awareness
  const placeBlock = () => {
    if (!gameState.selectedBlock) return;
    
    try {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const newPos = camera.position.clone().add(direction.multiplyScalar(4));
      const gridPos = {
        x: Math.round(newPos.x),
        y: Math.max(1, Math.round(newPos.y)),
        z: Math.round(newPos.z)
      };
      
      const key = `${gridPos.x},${gridPos.y},${gridPos.z}`;
      
      if (!blocks.has(key)) {
        setBlocks(prev => new Map(prev).set(key, {
          position: [gridPos.x, gridPos.y, gridPos.z],
          type: gameState.selectedBlock
        }));
        
        if (gameState.gameMode !== 'creative') {
          gameState.removeFromInventory(gameState.selectedBlock, 1);
        }
        
        console.log(`🧱 Placed ${gameState.selectedBlock} at (${gridPos.x}, ${gridPos.y}, ${gridPos.z})`);
      }
    } catch (error) {
      console.error('Error placing block:', error);
    }
  };

  const breakBlock = () => {
    try {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const targetPos = camera.position.clone().add(direction.multiplyScalar(4));
      const gridPos = {
        x: Math.round(targetPos.x),
        y: Math.round(targetPos.y),
        z: Math.round(targetPos.z)
      };
      
      const key = `${gridPos.x},${gridPos.y},${gridPos.z}`;
      
      if (blocks.has(key)) {
        const block = blocks.get(key);
        setBlocks(prev => {
          const newBlocks = new Map(prev);
          newBlocks.delete(key);
          return newBlocks;
        });
        
        gameState.addToInventory(block.type, 1);
        console.log(`💥 Broke ${block.type}`);
      }
    } catch (error) {
      console.error('Error breaking block:', error);
    }
  };

  // Click handlers
  useEffect(() => {
    const handleClick = (event) => {
      if (event.button === 0) {
        event.preventDefault();
        breakBlock();
      } else if (event.button === 2) {
        event.preventDefault();
        placeBlock();
      }
    };

    const handleContextMenu = (event) => {
      event.preventDefault();
    };

    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gameState.selectedBlock, blocks]);

  return (
    <group>
      {/* Enhanced clouds with better performance */}
      <MinecraftClouds />
      
      {/* Grass particle effects for better grass appearance */}
      <GrassEffects />
      
      {/* PERFORMANCE-OPTIMIZED block rendering */}
      {Array.from(blocks.values())
        .filter(block => {
          const distance = Math.sqrt(
            Math.pow(block.position[0] - camera.position.x, 2) + 
            Math.pow(block.position[2] - camera.position.z, 2)
          );
          return distance < 80; // Reduced render distance for performance
        })
        .map((block) => {
          const blockConfig = BLOCK_TYPES[block.type] || BLOCK_TYPES.grass;
          return (
            <mesh 
              key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`}
              position={block.position}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshLambertMaterial 
                color={blockConfig.color}
                transparent={blockConfig.transparent || false}
                opacity={blockConfig.transparent ? 0.8 : 1}
                emissive={blockConfig.emissive ? blockConfig.color : '#000000'}
                emissiveIntensity={blockConfig.emissive ? 0.2 : 0}
              />
              {/* Enhanced grass texture effect */}
              {block.type === 'grass' && (
                <GrassTexture position={[0, 0.51, 0]} />
              )}
            </mesh>
          );
        })}
    </group>
  );
};

// NEW: Grass texture enhancement for more realistic grass blocks
const GrassTexture = ({ position }) => {
  return (
    <group position={position}>
      {/* Grass blade effects */}
      {[...Array(3)].map((_, i) => (
        <mesh key={i} position={[
          (Math.random() - 0.5) * 0.8,
          0,
          (Math.random() - 0.5) * 0.8
        ]}>
          <planeGeometry args={[0.1, 0.2]} />
          <meshBasicMaterial 
            color="#4a7c59" 
            transparent 
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// NEW: Environmental grass particle effects
const GrassEffects = () => {
  const particlesRef = useRef();
  
  const grassParticles = useMemo(() => {
    const particles = [];
    for (let i = 0; i < 15; i++) { // Reduced for performance
      particles.push({
        x: (Math.random() - 0.5) * 60,
        y: 12 + Math.random() * 8,
        z: (Math.random() - 0.5) * 60,
        speed: 0.05 + Math.random() * 0.05
      });
    }
    return particles;
  }, []);
  
  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        const particleData = grassParticles[index];
        particle.position.y += particleData.speed * Math.sin(state.clock.elapsedTime + index);
        particle.rotation.y += 0.01;
        if (particle.position.y > 25) {
          particle.position.y = 12;
        }
      });
    }
  });
  
  return (
    <group ref={particlesRef}>
      {grassParticles.map((particle, index) => (
        <mesh 
          key={index} 
          position={[particle.x, particle.y, particle.z]}
        >
          <planeGeometry args={[0.08, 0.15]} />
          <meshBasicMaterial 
            color="#90EE90" 
            transparent 
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// RESTORED Enhanced clouds with minimal movement
const MinecraftClouds = () => {
  const cloudsRef = useRef();
  
  // Generate cloud positions
  const cloudPositions = useMemo(() => {
    const positions = [];
    
    for (let i = 0; i < 12; i++) {
      const baseX = (i - 6) * 20 + (Math.random() - 0.5) * 10;
      const baseZ = -30 + (Math.random() - 0.5) * 20;
      const baseY = 25 + Math.random() * 5;
      
      for (let j = 0; j < 6; j++) {
        positions.push({
          x: baseX + (Math.random() - 0.5) * 8,
          y: baseY + (Math.random() - 0.5) * 2,
          z: baseZ + (Math.random() - 0.5) * 8,
          scaleX: 3 + Math.random() * 2,
          scaleY: 1 + Math.random() * 0.5,
          scaleZ: 3 + Math.random() * 2,
          opacity: 0.7 + Math.random() * 0.3
        });
      }
    }
    
    return positions;
  }, []);
  
  // Very slow cloud movement
  useFrame((state) => {
    if (cloudsRef.current) {
      const time = state.clock.elapsedTime;
      cloudsRef.current.position.x = Math.sin(time * 0.002) * 3;
      cloudsRef.current.position.z = time * 0.02;
    }
  });
  
  return (
    <group ref={cloudsRef}>
      {cloudPositions.map((cloud, index) => (
        <mesh 
          key={index} 
          position={[cloud.x, cloud.y, cloud.z]}
          scale={[cloud.scaleX, cloud.scaleY, cloud.scaleZ]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial 
            color="#ffffff" 
            transparent 
            opacity={cloud.opacity}
          />
        </mesh>
      ))}
    </group>
  );
};

// RESTORED environmental particles
const EnvironmentalParticles = () => {
  const particlesRef = useRef();
  
  const particlePositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 20; i++) {
      positions.push({
        x: (Math.random() - 0.5) * 100,
        y: 20 + Math.random() * 10,
        z: (Math.random() - 0.5) * 100,
        speed: 0.1 + Math.random() * 0.1
      });
    }
    return positions;
  }, []);
  
  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.children.forEach((particle, index) => {
        const particleData = particlePositions[index];
        particle.position.y += particleData.speed * Math.sin(state.clock.elapsedTime + index);
        if (particle.position.y > 35) {
          particle.position.y = 15;
        }
      });
    }
  });
  
  return (
    <group ref={particlesRef}>
      {particlePositions.map((particle, index) => (
        <mesh 
          key={index} 
          position={[particle.x, particle.y, particle.z]}
        >
          <sphereGeometry args={[0.05, 4, 4]} />
          <meshBasicMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
};

// MINECRAFT-STYLE Blocky Hands Component - Authentic cubic design
const BothHands = ({ selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const weaponRef = useRef();
  const selectedBlockConfig = BLOCK_TYPES[selectedBlock] || BLOCK_TYPES.grass;

  // Frame-by-frame positioning with smooth movement
  useFrame(() => {
    if (rightHandRef.current && leftHandRef.current) {
      const time = Date.now() * 0.001;
      
      // Right hand positioning - blocky style
      const rightPos = new THREE.Vector3(0.6, -0.8, -1.4);
      rightPos.applyMatrix4(camera.matrixWorld);
      rightHandRef.current.position.copy(rightPos);
      rightHandRef.current.quaternion.copy(camera.quaternion);
      
      // Subtle idle animation
      rightHandRef.current.position.y += Math.sin(time * 1.5) * 0.02;
      rightHandRef.current.rotation.z = Math.sin(time) * 0.05;
      
      // Left hand positioning
      const leftPos = new THREE.Vector3(-0.6, -0.8, -1.4);
      leftPos.applyMatrix4(camera.matrixWorld);
      leftHandRef.current.position.copy(leftPos);
      leftHandRef.current.quaternion.copy(camera.quaternion);
      leftHandRef.current.position.y += Math.sin(time * 1.5 + 1) * 0.02;
      leftHandRef.current.rotation.z = Math.sin(time + 1) * 0.05;
      
      // Enhanced attack animation
      if (isAttacking) {
        const attackTime = time * 15;
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.8;
        rightHandRef.current.position.z += Math.sin(attackTime) * 0.3;
        
        if (weaponRef.current) {
          weaponRef.current.rotation.x = Math.sin(attackTime) * 0.5;
          weaponRef.current.position.y = 0.3 + Math.sin(attackTime) * 0.2;
        }
      }
    }
  });

  return (
    <group>
      {/* RIGHT HAND - Minecraft blocky style */}
      <group ref={rightHandRef}>        
        {/* Blocky forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand block - Minecraft style */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb block */}
        <mesh position={[0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Finger blocks */}
        <mesh position={[0, -0.15, -0.08]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* LARGE PROMINENT WEAPON - Best practice positioning */}
        {selectedBlock && (
          <group ref={weaponRef} position={[0.15, 0.3, -0.2]} rotation={[0.2, 0.3, 0.1]}>
            {/* Large tool handle */}
            <mesh position={[0, -0.4, 0]}>
              <boxGeometry args={[0.06, 0.8, 0.06]} />
              <meshLambertMaterial color="#8B4513" />
            </mesh>
            
            {/* Large tool head - much more prominent */}
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.16, 0.16, 0.16]} />
              <meshLambertMaterial 
                color={selectedBlockConfig.color}
                emissive={selectedBlockConfig.emissive ? selectedBlockConfig.color : '#000000'}
                emissiveIntensity={0.1}
              />
            </mesh>
            
            {/* Tool-specific enhancements */}
            {['stone', 'iron', 'diamond', 'cobblestone'].includes(selectedBlock) && (
              <>
                {/* Pickaxe head */}
                <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.785]}>
                  <boxGeometry args={[0.24, 0.06, 0.06]} />
                  <meshLambertMaterial color="#C0C0C0" />
                </mesh>
                {/* Metal gleam */}
                <mesh position={[0, 0.2, 0.04]}>
                  <boxGeometry args={[0.2, 0.04, 0.02]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
                </mesh>
              </>
            )}
            
            {['wood'].includes(selectedBlock) && (
              <>
                {/* Axe head */}
                <mesh position={[0.1, 0.15, 0]}>
                  <boxGeometry args={[0.1, 0.2, 0.06]} />
                  <meshLambertMaterial color="#A0A0A0" />
                </mesh>
              </>
            )}
          </group>
        )}
        
        {/* Enhanced combat weapon when attacking */}
        {isAttacking && (
          <group position={[0.2, 0.4, -0.3]} rotation={[0.5, 0.4, 0.2]}>
            {/* Large sword handle */}
            <mesh position={[0, -0.3, 0]}>
              <boxGeometry args={[0.08, 0.6, 0.08]} />
              <meshLambertMaterial color="#654321" />
            </mesh>
            
            {/* Large sword blade */}
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.06, 0.4, 0.02]} />
              <meshLambertMaterial color="#C0C0C0" />
            </mesh>
            
            {/* Sword gleam effect */}
            <mesh position={[0, 0.1, 0.02]}>
              <boxGeometry args={[0.04, 0.35, 0.01]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
            </mesh>
            
            {/* Crossguard */}
            <mesh position={[0, -0.05, 0]}>
              <boxGeometry args={[0.2, 0.04, 0.04]} />
              <meshLambertMaterial color="#8B4513" />
            </mesh>
          </group>
        )}
      </group>
      
      {/* LEFT HAND - Minecraft blocky style */}
      <group ref={leftHandRef}>
        {/* Blocky forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb block */}
        <mesh position={[-0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Finger blocks */}
        <mesh position={[0, -0.15, -0.08]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
      </group>
    </group>
  );
};

// ENHANCED Sky Component - Follows player like terrain
const MinecraftSky = ({ isDay = true }) => {
  const { camera } = useThree();
  const skyRef = useRef();
  const sunRef = useRef();
  
  const skyColor = isDay ? '#87CEEB' : '#191970';
  const sunColor = isDay ? '#FFD700' : '#F5F5DC';
  
  // Make sky follow player position
  useFrame(() => {
    if (skyRef.current && camera) {
      skyRef.current.position.copy(camera.position);
    }
    if (sunRef.current && camera) {
      sunRef.current.position.set(
        camera.position.x,
        camera.position.y + 50,
        camera.position.z - 80
      );
    }
  });
  
  return (
    <group>
      {/* Sky sphere that follows player */}
      <mesh ref={skyRef} scale={[200, 200, 200]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={skyColor}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Sun/Moon that follows player */}
      <mesh ref={sunRef}>
        <sphereGeometry args={[3, 12, 12]} />
        <meshBasicMaterial color={sunColor} />
      </mesh>
    </group>
  );
};

// Position tracker component
const PositionTracker = ({ onPositionUpdate }) => {
  const { camera } = useThree();
  
  useFrame(() => {
    if (camera && onPositionUpdate) {
      onPositionUpdate({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  
  return null;
};

// ENHANCED Player component with improved hands rendering and debugging
export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isOnGround, setIsOnGround] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  
  console.log('🎮 Player component rendering');
  console.log('🎥 Camera details - position:', camera.position, 'near:', camera.near, 'far:', camera.far);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 15, 0);
    console.log('🎮 Player initialized at position:', camera.position);
    console.log('🎥 Camera matrix:', camera.matrix);
  }, [camera]);

  // Expose attack state globally
  useEffect(() => {
    window.setPlayerAttacking = setIsAttacking;
  }, []);

  // Enhanced frame logic with hands debugging
  useFrame((state, delta) => {
    const speed = 8;
    const moveVector = new THREE.Vector3();
    
    // Get camera direction
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const right = new THREE.Vector3();
    right.crossVectors(direction, camera.up).normalize();
    
    // Apply movement
    if (keys.KeyW) moveVector.add(direction);
    if (keys.KeyS) moveVector.sub(direction);
    if (keys.KeyA) moveVector.sub(right);
    if (keys.KeyD) moveVector.add(right);
    
    // Horizontal movement
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.y = 0;
      
      const newPosition = camera.position.clone().add(moveVector.multiplyScalar(speed * delta));
      camera.position.x = newPosition.x;
      camera.position.z = newPosition.z;
    }
    
    // Gravity and ground collision
    velocity.current.y -= 20 * delta;
    
    const newY = camera.position.y + velocity.current.y * delta;
    const groundLevel = getGroundLevel(camera.position.x, camera.position.z);
    const playerHeight = 1.8;
    
    if (newY - playerHeight <= groundLevel) {
      camera.position.y = groundLevel + playerHeight;
      velocity.current.y = 0;
      setIsOnGround(true);
    } else {
      camera.position.y = newY;
      setIsOnGround(false);
    }
    
    // Debug hands visibility every few frames
    if (Math.floor(state.clock.elapsedTime) % 2 === 0) {
      console.log('🤲 Hands should be visible at camera position:', camera.position);
    }
  });

  const getGroundLevel = (x, z) => {
    if (window.getHighestBlockAt) {
      return window.getHighestBlockAt(x, z) + 1;
    }
    return 12;
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      setKeys(prev => ({ ...prev, [event.code]: true }));
      
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = 12;
          setIsOnGround(false);
        }
      }
      
      // Testing attack for hands visibility
      if (event.code === 'KeyF') {
        console.log('🗡️ Attack key pressed - testing hands visibility');
        setIsAttacking(true);
        setTimeout(() => setIsAttacking(false), 500);
      }
      
      if (event.code.startsWith('Digit')) {
        const num = parseInt(event.code.replace('Digit', ''));
        const blockTypes = Object.keys(BLOCK_TYPES);
        if (num >= 1 && num <= blockTypes.length) {
          gameState.setSelectedBlock(blockTypes[num - 1]);
          console.log('🧱 Selected block:', blockTypes[num - 1]);
        }
      }
    };
    
    const handleKeyUp = (event) => {
      setKeys(prev => ({ ...prev, [event.code]: false }));
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [camera, gameState, isOnGround]);

  // Render hands with debug info
  console.log('🤲 Rendering BothHands component with selectedBlock:', gameState.selectedBlock, 'isAttacking:', isAttacking);
  
  return <BothHands selectedBlock={gameState.selectedBlock} isAttacking={isAttacking} />;
};

// Game UI Component
export const GameUI = ({ gameState, showStats, setShowStats, playerPosition = { x: 0, y: 0, z: 0 } }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none z-20"
    >
      {/* Top HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <div className="minecraft-info-panel">
          <div className="flex items-center space-x-4 text-white minecraft-text">
            <div className="flex items-center space-x-1">
              {gameState.isDay ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} className="text-blue-200" />}
              <span>{gameState.isDay ? 'Day' : 'Night'}</span>
            </div>
            <div>Mode: <span className="text-green-400">{gameState.gameMode}</span></div>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => gameState.setShowSettings(true)}
            className="minecraft-button"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <MinecraftHotbar gameState={gameState} />
      <MinecraftHealthHunger />

      {/* Left toolbar */}
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <div className="minecraft-toolbar">
          <button
            onClick={() => gameState.setShowInventory(true)}
            className="minecraft-tool-button"
            title="Inventory (E)"
          >
            <Package size={20} />
          </button>
          <button
            onClick={() => gameState.setShowCrafting(true)}
            className="minecraft-tool-button"
            title="Crafting (C)"
          >
            <Hammer size={20} />
          </button>
          <button
            onClick={() => gameState.setShowMagic(true)}
            className="minecraft-tool-button"
            title="Magic (M)"
          >
            <Wand2 size={20} />
          </button>
          <button
            onClick={() => gameState.setShowBuildingTools(true)}
            className="minecraft-tool-button"
            title="Building Tools (B)"
          >
            <Grid3X3 size={20} />
          </button>
        </div>
      </div>

      {/* Enhanced debug info */}
      {showStats && (
        <div className="absolute top-20 left-4 pointer-events-auto">
          <div className="minecraft-debug-panel">
            <div className="text-white minecraft-text text-sm space-y-1">
              <div>X: {playerPosition.x}</div>
              <div>Y: {playerPosition.y}</div>
              <div>Z: {playerPosition.z}</div>
              <div>Chunk: {Math.floor(playerPosition.x / 16)},{Math.floor(playerPosition.z / 16)}</div>
              <div>Biome: Plains</div>
              <div>Blocks: {gameState.worldBlocks?.size || 0}</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Keep all UI components unchanged
export const Inventory = ({ gameState, onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Blocks</h3>
          <div className="grid grid-cols-6 gap-2">
            {Object.entries(gameState.inventory.blocks).map(([type, count]) => {
              const config = BLOCK_TYPES[type];
              return (
                <div
                  key={type}
                  className="bg-gray-700 p-3 rounded-lg text-center cursor-pointer hover:bg-gray-600 transition-colors"
                  onClick={() => {
                    gameState.setSelectedBlock(type);
                    onClose();
                  }}
                >
                  <div
                    className="w-8 h-8 mx-auto mb-2 rounded"
                    style={{ backgroundColor: config.color }}
                  />
                  <div className="text-xs text-white">{config.name}</div>
                  <div className="text-xs text-gray-300">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Tools</h3>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(gameState.inventory.tools).map(([tool, count]) => (
              <div key={tool} className="bg-gray-700 p-3 rounded-lg text-center">
                <div className="text-white mb-1">
                  {tool === 'pickaxe' && <Pickaxe size={24} className="mx-auto" />}
                  {tool === 'sword' && <Sword size={24} className="mx-auto" />}
                  {tool === 'shovel' && <div className="w-6 h-6 bg-brown-500 mx-auto" />}
                  {tool === 'axe' && <div className="w-6 h-6 bg-gray-500 mx-auto" />}
                </div>
                <div className="text-xs text-white capitalize">{tool}</div>
                <div className="text-xs text-gray-300">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Magic</h3>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(gameState.inventory.magic).map(([item, count]) => (
              <div key={item} className="bg-purple-700 p-3 rounded-lg text-center">
                <div className="text-white mb-1">
                  {item === 'wand' && <Wand2 size={24} className="mx-auto" />}
                  {item === 'crystals' && <Star size={24} className="mx-auto" />}
                  {item === 'scrolls' && <div className="w-6 h-6 bg-yellow-400 mx-auto rounded" />}
                </div>
                <div className="text-xs text-white capitalize">{item}</div>
                <div className="text-xs text-purple-200">{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const CraftingTable = ({ gameState, onClose }) => {
  const recipes = [
    {
      id: 'pickaxe',
      name: 'Iron Pickaxe',
      ingredients: { wood: 2, iron: 3 },
      result: { type: 'tool', item: 'pickaxe', count: 1 }
    },
    {
      id: 'sword',
      name: 'Iron Sword',
      ingredients: { wood: 1, iron: 2 },
      result: { type: 'tool', item: 'sword', count: 1 }
    },
    {
      id: 'glass',
      name: 'Glass Block',
      ingredients: { sand: 1 },
      result: { type: 'block', item: 'glass', count: 1 }
    }
  ];

  const canCraft = (recipe) => {
    return Object.entries(recipe.ingredients).every(([item, needed]) => 
      (gameState.inventory.blocks[item] || 0) >= needed
    );
  };

  const handleCraft = (recipe) => {
    if (!canCraft(recipe)) return;
    Object.entries(recipe.ingredients).forEach(([item, needed]) => {
      gameState.removeFromInventory(item, needed);
    });
    if (recipe.result.type === 'block') {
      gameState.addToInventory(recipe.result.item, recipe.result.count);
    } else if (recipe.result.type === 'tool') {
      gameState.setInventory(prev => ({
        ...prev,
        tools: {
          ...prev.tools,
          [recipe.result.item]: (prev.tools[recipe.result.item] || 0) + recipe.result.count
        }
      }));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Crafting Table</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="space-y-3">
          {recipes.map(recipe => (
            <div
              key={recipe.id}
              className={`bg-gray-700 p-4 rounded-lg cursor-pointer transition-colors ${
                canCraft(recipe) ? 'hover:bg-gray-600' : 'opacity-50'
              }`}
              onClick={() => canCraft(recipe) && handleCraft(recipe)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-semibold">{recipe.name}</h3>
                  <div className="text-sm text-gray-300">
                    Needs: {Object.entries(recipe.ingredients).map(([item, count]) => 
                      `${count} ${BLOCK_TYPES[item]?.name || item}`
                    ).join(', ')}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded ${
                  canCraft(recipe) ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                  {canCraft(recipe) ? 'Craft' : 'Need Items'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export const MagicSystem = ({ gameState, onClose }) => {
  const spells = [
    {
      id: 'teleport',
      name: 'Teleport',
      description: 'Instantly move to a target location',
      cost: { crystals: 1 },
      icon: '🌟'
    },
    {
      id: 'mass_break',
      name: 'Mass Break',
      description: 'Break multiple blocks at once',
      cost: { crystals: 2 },
      icon: '💥'
    },
    {
      id: 'build_wall',
      name: 'Build Wall',
      description: 'Instantly create a wall of blocks',
      cost: { crystals: 3, scrolls: 1 },
      icon: '🧱'
    }
  ];

  const canCastSpell = (spell) => {
    return Object.entries(spell.cost).every(([item, needed]) => 
      (gameState.inventory.magic[item] || 0) >= needed
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-purple-900 rounded-lg p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Magic System</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="space-y-3">
          {spells.map(spell => (
            <div
              key={spell.id}
              className={`bg-purple-800 p-4 rounded-lg cursor-pointer transition-colors ${
                canCastSpell(spell) ? 'hover:bg-purple-700' : 'opacity-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{spell.icon}</div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold">{spell.name}</h3>
                  <p className="text-purple-200 text-sm">{spell.description}</p>
                  <div className="text-xs text-purple-300 mt-1">
                    Cost: {Object.entries(spell.cost).map(([item, count]) => 
                      `${count} ${item}`
                    ).join(', ')}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded text-sm ${
                  canCastSpell(spell) ? 'bg-purple-600 text-white' : 'bg-gray-600 text-gray-300'
                }`}>
                  {canCastSpell(spell) ? 'Cast' : 'No Mana'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export const BuildingTools = ({ gameState, onClose }) => {
  const tools = [
    {
      id: 'multi_select',
      name: 'Multi-Select',
      description: 'Select and manipulate multiple blocks',
      icon: <Grid3X3 size={24} />
    },
    {
      id: 'copy_paste',
      name: 'Copy & Paste',
      description: 'Copy structures and paste them elsewhere',
      icon: <Copy size={24} />
    },
    {
      id: 'symmetry',
      name: 'Symmetry Tool',
      description: 'Build with perfect symmetry',
      icon: <div className="w-6 h-6 bg-blue-500 rounded" />
    },
    {
      id: 'fill',
      name: 'Fill Area',
      description: 'Fill large areas with blocks quickly',
      icon: <div className="w-6 h-6 bg-green-500 rounded" />
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-green-900 rounded-lg p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Building Tools</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="space-y-3">
          {tools.map(tool => (
            <div
              key={tool.id}
              className="bg-green-800 p-4 rounded-lg cursor-pointer hover:bg-green-700 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="text-white">{tool.icon}</div>
                <div>
                  <h3 className="text-white font-semibold">{tool.name}</h3>
                  <p className="text-green-200 text-sm">{tool.description}</p>
                </div>
                <div className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                  Select
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export const SettingsPanel = ({ gameState, onClose, showStats, setShowStats }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">Game Mode</label>
            <select
              value={gameState.gameMode}
              onChange={(e) => gameState.setGameMode(e.target.value)}
              className="w-full bg-gray-700 text-white p-2 rounded"
            >
              <option value="creative">Creative</option>
              <option value="survival">Survival</option>
            </select>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showStats}
                onChange={(e) => setShowStats(e.target.checked)}
                className="rounded"
              />
              <span className="text-white">Show Performance Stats</span>
            </label>
          </div>

          <div className="space-y-2">
            <h3 className="text-white font-semibold">World Actions</h3>
            <div className="flex space-x-2">
              <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded text-sm">
                <Download size={16} className="inline mr-1" />
                Export World
              </button>
              <button className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 px-3 rounded text-sm">
                <Upload size={16} className="inline mr-1" />
                Import World
              </button>
            </div>
            <button className="w-full bg-red-600 hover:bg-red-500 text-white py-2 px-3 rounded text-sm">
              <Trash2 size={16} className="inline mr-1" />
              Reset World
            </button>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-2">Statistics</h3>
            <div className="bg-gray-700 p-3 rounded text-sm text-gray-300 space-y-1">
              <div>Blocks Placed: {gameState.playerStats.blocksPlaced}</div>
              <div>Blocks Destroyed: {gameState.playerStats.blocksDestroyed}</div>
              <div>Time Played: {Math.floor(gameState.gameTime / 60)}m {gameState.gameTime % 60}s</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Export components
export { MinecraftSky, BothHands, MinecraftClouds, EnvironmentalParticles, MinecraftHotbar, MinecraftHealthHunger, PositionTracker };
