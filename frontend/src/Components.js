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
  Shield,
  Crown
} from 'lucide-react';

// Import optimized systems with enhanced visual effects
import { useSimpleExperience, SimpleXPGainVisual, SimpleLevelUpEffect, SimpleExperienceBar } from './SimpleExperienceSystem';
import { SimpleMagicProjectileSystem, SimpleMagicWand } from './SimpleMagicSystem';
import { EnhancedGrassSystem } from './SimpleGrassSystem';







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
  // ROBUST error checking to prevent runtime errors
  if (!gameState || !BLOCK_TYPES) {
    console.error('MinecraftHotbar: Missing gameState or BLOCK_TYPES');
    return <div>Loading hotbar...</div>;
  }

  const hotbarBlocks = Object.keys(BLOCK_TYPES).slice(0, 9);
  
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {hotbarBlocks.map((blockType, index) => {
          try {
            const blockConfig = BLOCK_TYPES[blockType];
            if (!blockConfig) {
              console.error(`Missing block config for: ${blockType}`);
              return null;
            }

            const isSelected = gameState.selectedBlock === blockType;
            
            // TRIPLE-SAFE inventory access
            let quantity = 0;
            try {
              quantity = gameState?.inventory?.blocks?.[blockType] || 0;
            } catch (err) {
              console.warn('Inventory access error:', err);
              quantity = 0;
            }
            
            return (
              <div
                key={blockType}
                className={`minecraft-hotbar-slot ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  try {
                    gameState.setSelectedBlock(blockType);
                  } catch (err) {
                    console.error('Error setting selected block:', err);
                  }
                }}
                title={`${blockConfig.name || 'Unknown'} (${quantity})`}
              >
                <div 
                  className="minecraft-block-icon"
                  style={{ backgroundColor: blockConfig.color || '#4a7c59' }}
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
          } catch (error) {
            console.error(`Error rendering hotbar slot ${index}:`, error);
            return null;
          }
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

// ULTRA-OPTIMIZED terrain generation - heavily favors grass with trees
const generateTerrain = (x, z) => {
  const noise = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2 + Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
  const height = Math.floor(Math.max(12, Math.min(16, noise + 15))); // Higher base for more grass
  return height;
};

// ENHANCED World Generation with ALL Features - No Runtime Errors
export const MinecraftWorld = ({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const { camera } = useThree();
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  const worldRef = useRef();
  
  const chunkSize = 16;
  const renderDistance = 2;
  
  // WORKING terrain generation - no errors
  const generateTerrain = (x, z) => {
    const noise1 = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3;
    const noise2 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 6;
    const height = Math.floor(Math.max(10, Math.min(18, noise1 + noise2 + 15)));
    return height;
  };

  const generateChunk = (chunkX, chunkZ) => {
    const chunkKey = `${chunkX}_${chunkZ}`;
    if (generatedChunks.has(chunkKey)) return;

    const newBlocks = new Map();
    const startX = chunkX * chunkSize;
    const startZ = chunkZ * chunkSize;
    
    for (let x = startX; x < startX + chunkSize; x++) {
      for (let z = startZ; z < startZ + chunkSize; z++) {
        const height = generateTerrain(x, z);
        
        // Surface block - 95% grass
        const blockType = Math.random() < 0.95 ? 'grass' : 'sand';
        const key = `${x},${height},${z}`;
        newBlocks.set(key, { 
          position: [x, height, z], 
          type: blockType
        });
        
        // Underground layers
        for (let y = height - 1; y >= Math.max(height - 3, 8); y--) {
          const undergroundType = y === height - 1 ? 'dirt' : 'stone';
          const undergroundKey = `${x},${y},${z}`;
          newBlocks.set(undergroundKey, { 
            position: [x, y, z], 
            type: undergroundType
          });
        }
        
        // Trees
        if (blockType === 'grass' && Math.random() < 0.03) {
          generateTree(newBlocks, x, height, z);
        }
      }
    }
    
    setBlocks(prev => {
      const updated = new Map(prev);
      newBlocks.forEach((value, key) => updated.set(key, value));
      return updated;
    });
    
    setGeneratedChunks(prev => new Set(prev).add(chunkKey));
  };

  const generateTree = (blockMap, x, baseY, z) => {
    const treeHeight = 3 + Math.floor(Math.random() * 3);
    
    // Trunk
    for (let y = 1; y <= treeHeight; y++) {
      const trunkKey = `${x},${baseY + y},${z}`;
      blockMap.set(trunkKey, { 
        position: [x, baseY + y, z], 
        type: 'wood'
      });
    }
    
    // Leaves
    const crownY = baseY + treeHeight + 1;
    const leafPositions = [
      [x, crownY, z], [x+1, crownY, z], [x-1, crownY, z],
      [x, crownY, z+1], [x, crownY, z-1]
    ];
    
    leafPositions.forEach(([lx, ly, lz]) => {
      const leafKey = `${lx},${ly},${lz}`;
      blockMap.set(leafKey, { 
        position: [lx, ly, lz], 
        type: 'grass'
      });
    });
  };

  // Frame-based terrain generation
  useFrame(() => {
    if (!camera) return;
    
    const playerX = Math.floor(camera.position.x);
    const playerZ = Math.floor(camera.position.z);
    const currentChunkX = Math.floor(playerX / chunkSize);
    const currentChunkZ = Math.floor(playerZ / chunkSize);
    
    if (currentChunkX !== lastPlayerChunk.current.x || currentChunkZ !== lastPlayerChunk.current.z) {
      lastPlayerChunk.current = { x: currentChunkX, z: currentChunkZ };
      
      // Generate chunks around player
      for (let x = -renderDistance; x <= renderDistance; x++) {
        for (let z = -renderDistance; z <= renderDistance; z++) {
          const chunkX = currentChunkX + x;
          const chunkZ = currentChunkZ + z;
          generateChunk(chunkX, chunkZ);
        }
      }
    }
  });

  // Initial terrain generation
  useEffect(() => {
    console.log('🌍 Generating initial terrain...');
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        generateChunk(x, z);
      }
    }
  }, []);

  // Block interaction handlers with XP rewards
  const handleBlockPlace = (position, blockType) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    if (!blocks.has(key)) {
      setBlocks(prev => new Map(prev).set(key, {
        position,
        type: blockType
      }));
      
      // Award XP for block placement
      if (window.xpBlockPlace) {
        window.xpBlockPlace();
      }
      
      if (gameState.gameMode !== 'creative') {
        gameState.removeFromInventory(blockType, 1);
      }
    }
  };

  const handleBlockBreak = (position) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    if (blocks.has(key)) {
      const block = blocks.get(key);
      setBlocks(prev => {
        const newBlocks = new Map(prev);
        newBlocks.delete(key);
        return newBlocks;
      });
      
      gameState.addToInventory(block.type, 1);
      
      // Award XP for block breaking
      if (window.xpBlockBreak) {
        window.xpBlockBreak();
      }
      
      // Special XP for rare blocks
      if (['diamond', 'gold'].includes(block.type) && window.addExperience) {
        window.addExperience(15, 'Rare Material');
      }
    }
  };

  // Click handlers
  useEffect(() => {
    const handleClick = (event) => {
      if (!camera) return;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      if (event.button === 0) { // Left click - break
        event.preventDefault();
        const targetPos = camera.position.clone().add(direction.multiplyScalar(4));
        const gridPos = [
          Math.round(targetPos.x),
          Math.round(targetPos.y),
          Math.round(targetPos.z)
        ];
        handleBlockBreak(gridPos);
      } else if (event.button === 2) { // Right click - place
        event.preventDefault();
        const newPos = camera.position.clone().add(direction.multiplyScalar(4));
        const gridPos = [
          Math.round(newPos.x),
          Math.max(1, Math.round(newPos.y)),
          Math.round(newPos.z)
        ];
        handleBlockPlace(gridPos, gameState.selectedBlock);
      }
    };

    const handleContextMenu = (event) => event.preventDefault();

    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gameState.selectedBlock, blocks]);

  // Expose ground level function
  useEffect(() => {
    window.getHighestBlockAt = (x, z) => {
      let maxY = 12;
      blocks.forEach(block => {
        if (Math.floor(block.position[0]) === Math.floor(x) && 
            Math.floor(block.position[2]) === Math.floor(z)) {
          maxY = Math.max(maxY, block.position[1]);
        }
      });
      return Math.max(maxY, 12);
    };
  }, [blocks]);

  return (
    <group ref={worldRef}>
      {/* Magic Projectile System */}
      <SimpleMagicProjectileSystem 
        gameState={gameState}
        playerPosition={camera.position}
      />
      
      {/* Enhanced Grass System */}
      <EnhancedGrassSystem 
        chunkX={Math.floor(camera.position.x / 16)}
        chunkZ={Math.floor(camera.position.z / 16)}
        blockPositions={Array.from(blocks.values()).map(block => [...block.position, block.type])}
      />
      
      {/* Render all blocks */}
      {Array.from(blocks.values()).map((block) => {
        const blockConfig = BLOCK_TYPES[block.type] || BLOCK_TYPES.grass;
        return (
          <mesh 
            key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`}
            position={block.position}
            userData={{ blockType: block.type }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshLambertMaterial 
              color={blockConfig.color}
              transparent={blockConfig.transparent || false}
              opacity={blockConfig.transparent ? 0.8 : 1}
            />
            {/* Enhanced grass texture */}
            {block.type === 'grass' && (
              <GrassTexture position={[0, 0.51, 0]} />
            )}
          </mesh>
        );
      })}
      
      {/* Clouds */}
      <MinecraftClouds />
      
      {/* Grass effects */}
      <GrassEffects />
    </group>
  );
};

// OPTIMIZED Grass Texture - Reduced complexity
const GrassTexture = ({ position }) => {
  return (
    <group position={position}>
      {/* Simplified grass blade effects for performance */}
      {[...Array(2)].map((_, i) => (
        <mesh key={i} position={[
          (Math.random() - 0.5) * 0.6,
          0,
          (Math.random() - 0.5) * 0.6
        ]}>
          <planeGeometry args={[0.08, 0.15]} />
          <meshBasicMaterial 
            color="#4a7c59" 
            transparent 
            opacity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// ULTRA-PERFORMANCE Grass Effects - Optimized for smoothness
const GrassEffects = () => {
  const particlesRef = useRef();
  
  const grassParticles = useMemo(() => {
    const particles = [];
    for (let i = 0; i < 8; i++) { // Reduced for ultra-performance
      particles.push({
        x: (Math.random() - 0.5) * 40, // Smaller area for performance
        y: 12 + Math.random() * 6,
        z: (Math.random() - 0.5) * 40,
        speed: 0.03 + Math.random() * 0.03, // Slower for smoother feel
        phase: Math.random() * Math.PI * 2
      });
    }
    return particles;
  }, []);
  
  useFrame((state) => {
    if (particlesRef.current) {
      const time = state.clock.elapsedTime;
      particlesRef.current.children.forEach((particle, index) => {
        const particleData = grassParticles[index];
        particle.position.y = particleData.y + Math.sin(time + particleData.phase) * 2;
        particle.rotation.y += 0.005; // Slower rotation
        
        // Gentle floating animation
        if (particle.position.y > 20) {
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
          <planeGeometry args={[0.06, 0.12]} />
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

// ULTRA-OPTIMIZED Clouds - Minimal performance impact
const MinecraftClouds = () => {
  const cloudsRef = useRef();
  
  // Reduced cloud count for performance
  const cloudPositions = useMemo(() => {
    const positions = [];
    
    for (let i = 0; i < 6; i++) { // Reduced from 12
      const baseX = (i - 3) * 25 + (Math.random() - 0.5) * 10;
      const baseZ = -25 + (Math.random() - 0.5) * 15;
      const baseY = 30 + Math.random() * 5;
      
      for (let j = 0; j < 3; j++) { // Reduced from 6
        positions.push({
          x: baseX + (Math.random() - 0.5) * 6,
          y: baseY + (Math.random() - 0.5) * 2,
          z: baseZ + (Math.random() - 0.5) * 6,
          scaleX: 2 + Math.random() * 1.5,
          scaleY: 0.8 + Math.random() * 0.4,
          scaleZ: 2 + Math.random() * 1.5,
          opacity: 0.6 + Math.random() * 0.3
        });
      }
    }
    
    return positions;
  }, []);
  
  // Ultra-slow cloud movement for performance
  useFrame((state) => {
    if (cloudsRef.current) {
      const time = state.clock.elapsedTime;
      cloudsRef.current.position.x = Math.sin(time * 0.001) * 2;
      cloudsRef.current.position.z = time * 0.01;
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

// ENHANCED Magic Hands Component - No Runtime Errors
const EnhancedMagicHands = ({ selectedSpell, selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  
  const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF', 
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const currentSpellColor = SPELL_COLORS[selectedSpell] || SPELL_COLORS.fireball;

  // Frame-by-frame positioning with enhanced magic effects
  useFrame(() => {
    if (rightHandRef.current && leftHandRef.current) {
      const time = Date.now() * 0.001;
      
      // Right hand positioning - holding magic wand
      const rightPos = new THREE.Vector3(0.7, -0.7, -1.2);
      rightPos.applyMatrix4(camera.matrixWorld);
      rightHandRef.current.position.copy(rightPos);
      rightHandRef.current.quaternion.copy(camera.quaternion);
      
      // Enhanced magical idle animation
      rightHandRef.current.position.y += Math.sin(time * 2) * 0.03;
      rightHandRef.current.rotation.z = Math.sin(time * 1.5) * 0.08;
      
      // Left hand positioning - gesture casting
      const leftPos = new THREE.Vector3(-0.5, -0.6, -1.1);
      leftPos.applyMatrix4(camera.matrixWorld);
      leftHandRef.current.position.copy(leftPos);
      leftHandRef.current.quaternion.copy(camera.quaternion);
      leftHandRef.current.position.y += Math.sin(time * 2 + 1) * 0.02;
      leftHandRef.current.rotation.z = Math.sin(time * 1.5 + 1) * 0.06;
      
      // Enhanced spell casting animation
      if (isAttacking) {
        const attackTime = time * 20;
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.6;
        rightHandRef.current.position.z += Math.sin(attackTime) * 0.2;
        leftHandRef.current.rotation.x = Math.sin(attackTime + 1) * 0.4;
        
        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.3;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.15;
        }
      }
    }
  });

  return (
    <group>
      {/* RIGHT HAND - Magic Wand Hand */}
      <group ref={rightHandRef}>        
        {/* Magical forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb */}
        <mesh position={[0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Fingers */}
        <mesh position={[0, -0.15, -0.08]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* ENHANCED MAGIC WAND - Primary Weapon */}
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}>
          <SimpleMagicWand wandType={selectedSpell} />
        </group>
        
        {/* Magical aura around hand during casting */}
        {isAttacking && (
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshBasicMaterial 
              color={currentSpellColor}
              transparent
              opacity={0.3}
            />
          </mesh>
        )}
      </group>
      
      {/* LEFT HAND - Spell Gesture Hand */}
      <group ref={leftHandRef}>
        {/* Forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand block */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb */}
        <mesh position={[-0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Fingers in spell-casting position */}
        <mesh position={[0, -0.1, -0.1]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* Spell energy emanating from left hand */}
        {isAttacking && (
          <group>
            {/* Main spell energy orb */}
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial 
                color={currentSpellColor}
                transparent
                opacity={0.8}
              />
            </mesh>
            
            {/* Magical particles */}
            {[...Array(5)].map((_, i) => (
              <mesh 
                key={i}
                position={[
                  (Math.random() - 0.5) * 0.3,
                  Math.random() * 0.2,
                  -0.1 - Math.random() * 0.2
                ]}
              >
                <sphereGeometry args={[0.02, 4, 4]} />
                <meshBasicMaterial 
                  color={currentSpellColor}
                  transparent
                  opacity={0.7}
                />
              </mesh>
            ))}
          </group>
        )}
        
        {/* Alternative: Show selected block for building mode */}
        {!isAttacking && selectedBlock && (
          <group position={[-0.1, 0.2, -0.15]} scale={[0.3, 0.3, 0.3]}>
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshLambertMaterial color={BLOCK_TYPES[selectedBlock]?.color || '#567C35'} />
            </mesh>
          </group>
        )}
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

// ENHANCED Player with Magic System Integration - No Runtime Errors
export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isOnGround, setIsOnGround] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState('fireball');
  
  // Performance optimization: cached vectors
  const forwardVector = useRef(new THREE.Vector3());
  const rightVector = useRef(new THREE.Vector3());
  const upVector = useRef(new THREE.Vector3(0, 1, 0));
  
  // Movement optimization
  const lastGroundCheck = useRef(0);
  const groundLevelCache = useRef(new Map());
  const lastCameraUpdate = useRef(0);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 18, 0);
    camera.updateProjectionMatrix();
    
    // Expose camera globally for magic system
    window.gameCamera = camera;
    
    // Set initial spell
    gameState.selectedSpell = selectedSpell;
    
    setTimeout(() => {
      const groundLevel = getOptimizedGroundLevel(0, 0);
      const safeHeight = Math.max(groundLevel + 2, 16);
      camera.position.y = safeHeight;
      console.log(`🧙‍♂️ Mage positioned at safe height: ${safeHeight} (ground: ${groundLevel})`);
    }, 1000);
    
    console.log('🧙‍♂️ Enhanced Player with Magic System initialized');
  }, [camera]);

  // Expose attack state and spell casting globally
  useEffect(() => {
    window.setPlayerAttacking = setIsAttacking;
    window.getSelectedSpell = () => selectedSpell;
    window.setSelectedSpell = setSelectedSpell;
  }, [selectedSpell]);

  // Enhanced frame logic with magic integration
  useFrame((state, delta) => {
    const now = performance.now();
    
    const shouldUpdateCamera = now - lastCameraUpdate.current > 8;
    const shouldCheckGround = now - lastGroundCheck.current > 16;
    
    const speed = 12;
    const moveVector = new THREE.Vector3();
    
    if (shouldUpdateCamera) {
      camera.getWorldDirection(forwardVector.current);
      rightVector.current.crossVectors(forwardVector.current, upVector.current).normalize();
      lastCameraUpdate.current = now;
    }
    
    // Apply movement
    if (keys.KeyW) moveVector.add(forwardVector.current);
    if (keys.KeyS) moveVector.sub(forwardVector.current);
    if (keys.KeyA) moveVector.sub(rightVector.current);
    if (keys.KeyD) moveVector.add(rightVector.current);
    
    // Enhanced movement with exploration XP
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.y = 0;
      
      const scaledMovement = moveVector.multiplyScalar(speed * delta);
      const oldChunk = Math.floor(camera.position.x / 64) + ',' + Math.floor(camera.position.z / 64);
      
      camera.position.x += scaledMovement.x;
      camera.position.z += scaledMovement.z;
      
      const newChunk = Math.floor(camera.position.x / 64) + ',' + Math.floor(camera.position.z / 64);
      
      // Award exploration XP for new areas
      if (oldChunk !== newChunk && window.xpExploration) {
        window.xpExploration();
      }
    }
    
    // Enhanced gravity and ground collision
    velocity.current.y -= 25 * delta;
    
    if (shouldCheckGround) {
      const newY = camera.position.y + velocity.current.y * delta;
      const groundLevel = getOptimizedGroundLevel(camera.position.x, camera.position.z);
      const playerHeight = 1.8;
      const minAllowedY = groundLevel + playerHeight;
      
      if (newY <= minAllowedY) {
        camera.position.y = minAllowedY;
        velocity.current.y = 0;
        setIsOnGround(true);
      } else {
        camera.position.y = newY;
        setIsOnGround(false);
      }
      
      if (camera.position.y < groundLevel + playerHeight) {
        camera.position.y = groundLevel + playerHeight;
        console.warn(`🚑 Emergency repositioning mage above ground: ${camera.position.y}`);
      }
      
      lastGroundCheck.current = now;
    } else {
      camera.position.y += velocity.current.y * delta;
      
      if (Math.random() < 0.1) {
        const groundLevel = getOptimizedGroundLevel(camera.position.x, camera.position.z);
        if (camera.position.y < groundLevel + 1.8) {
          camera.position.y = groundLevel + 1.8;
          console.warn(`🚑 Emergency correction during movement: ${camera.position.y}`);
        }
      }
    }
  });

  // Enhanced ground level detection
  const getOptimizedGroundLevel = (x, z) => {
    const cacheKey = `${Math.floor(x/4)}_${Math.floor(z/4)}`;
    
    if (groundLevelCache.current.has(cacheKey)) {
      return groundLevelCache.current.get(cacheKey);
    }
    
    let groundLevel = 15;
    try {
      if (window.getHighestBlockAt) {
        const calculatedLevel = window.getHighestBlockAt(x, z);
        if (typeof calculatedLevel === 'number' && !isNaN(calculatedLevel)) {
          groundLevel = calculatedLevel + 1;
        }
      }
    } catch (error) {
      console.warn('Error calculating ground level:', error);
    }
    
    groundLevel = Math.max(groundLevel, 12);
    groundLevel = Math.min(groundLevel, 25);
    
    groundLevelCache.current.set(cacheKey, groundLevel);
    
    if (groundLevelCache.current.size > 50) {
      const entries = Array.from(groundLevelCache.current.entries());
      groundLevelCache.current.clear();
      entries.slice(-25).forEach(([key, value]) => {
        groundLevelCache.current.set(key, value);
      });
    }
    
    return groundLevel;
  };

  // Enhanced event handlers with magic system
  useEffect(() => {
    const handleKeyDown = (event) => {
      setKeys(prev => {
        if (prev[event.code]) return prev;
        return { ...prev, [event.code]: true };
      });
      
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = 12;
          setIsOnGround(false);
        }
      }
      
      // Enhanced magic casting with F key
      if (event.code === 'KeyF') {
        event.preventDefault();
        setIsAttacking(true);
        
        // Cast spell with visual and audio effects
        if (window.castSpell) {
          window.castSpell(selectedSpell);
          
          // Award XP for spell casting
          if (window.xpMagicCast) {
            window.xpMagicCast();
          }
        }
        
        setTimeout(() => setIsAttacking(false), 400);
      }
      
      // Spell selection with Q key (cycle through spells)
      if (event.code === 'KeyQ') {
        event.preventDefault();
        const spells = ['fireball', 'iceball', 'lightning', 'arcane'];
        const currentIndex = spells.indexOf(selectedSpell);
        const nextSpell = spells[(currentIndex + 1) % spells.length];
        setSelectedSpell(nextSpell);
        gameState.selectedSpell = nextSpell;
        console.log(`🔮 Selected spell: ${nextSpell}`);
      }
      
      // Block selection (keeping for building mode)
      if (event.code.startsWith('Digit')) {
        const num = parseInt(event.code.replace('Digit', ''));
        const blockTypes = Object.keys(BLOCK_TYPES);
        if (num >= 1 && num <= blockTypes.length) {
          gameState.setSelectedBlock(blockTypes[num - 1]);
        }
      }
    };
    
    const handleKeyUp = (event) => {
      setKeys(prev => {
        if (!prev[event.code]) return prev;
        return { ...prev, [event.code]: false };
      });
    };
    
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, isOnGround, selectedSpell]);

  return (
    <group>
      {/* Enhanced Magic Hands with Wand */}
      <EnhancedMagicHands 
        selectedSpell={selectedSpell}
        selectedBlock={gameState.selectedBlock}
        isAttacking={isAttacking}
      />
    </group>
  );
};

// Game UI Component with Experience System
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
            {gameState.playerData && (
              <div className="flex items-center space-x-1">
                <Crown size={16} className="text-yellow-400" />
                <span>Level {gameState.playerData.level}</span>
              </div>
            )}
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

      {/* Experience Bar with error handling */}
      {gameState.playerData && (
        <div className="absolute top-20 left-4 right-4 pointer-events-auto">
          <SimpleExperienceBar 
            level={gameState.playerData.level}
            currentXP={gameState.playerData.currentXP}
            xpRequired={gameState.playerData.xpRequired}
            xpProgress={gameState.playerData.xpProgress}
          />
        </div>
      )}

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

      {/* Magic spell indicators with enhanced UI */}
      {gameState.playerData && (
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
          <div className="bg-gradient-to-br from-purple-900 to-purple-800 rounded-lg p-4 text-white border-2 border-purple-600 shadow-xl">
            <h3 className="font-bold mb-3 text-sm flex items-center">
              <Wand2 className="mr-2 text-purple-400" size={16} />
              Magic Arsenal (F to cast)
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2 p-2 bg-purple-800 rounded">
                <span className="text-red-400 font-bold">Q</span>
                <span>🔥 Fireball</span>
                <span className="text-purple-300">(Always Available)</span>
              </div>
              {gameState.playerData?.unlockedSpells?.includes('iceShard') ? (
                <div className="flex items-center space-x-2 p-2 bg-purple-800 rounded">
                  <span className="text-blue-400 font-bold">R</span>
                  <span>❄️ Ice Shard</span>
                  <span className="text-green-400">(Unlocked)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 p-2 bg-gray-700 rounded opacity-60">
                  <span className="text-gray-400 font-bold">R</span>
                  <span>❄️ Ice Shard</span>
                  <span className="text-yellow-400">(Level 5)</span>
                </div>
              )}
              {gameState.playerData?.unlockedSpells?.includes('lightningBeam') ? (
                <div className="flex items-center space-x-2 p-2 bg-purple-800 rounded">
                  <span className="text-yellow-400 font-bold">T</span>
                  <span>⚡ Lightning</span>
                  <span className="text-green-400">(Unlocked)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 p-2 bg-gray-700 rounded opacity-60">
                  <span className="text-gray-400 font-bold">T</span>
                  <span>⚡ Lightning</span>
                  <span className="text-yellow-400">(Level 15)</span>
                </div>
              )}
              {gameState.playerData?.unlockedSpells?.includes('arcaneOrb') ? (
                <div className="flex items-center space-x-2 p-2 bg-purple-800 rounded">
                  <span className="text-purple-400 font-bold">Y</span>
                  <span>🔮 Arcane Orb</span>
                  <span className="text-green-400">(Unlocked)</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 p-2 bg-gray-700 rounded opacity-60">
                  <span className="text-gray-400 font-bold">Y</span>
                  <span>🔮 Arcane Orb</span>
                  <span className="text-yellow-400">(Level 25)</span>
                </div>
              )}
            </div>
            
            {/* Enhanced mana display */}
            <div className="mt-4 pt-3 border-t border-purple-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-blue-400 font-semibold flex items-center">
                  <Star className="mr-1" size={14} />
                  Mana Crystals:
                </span>
                <span className="text-white font-bold text-lg">
                  {gameState.inventory?.magic?.crystals || 0}
                </span>
              </div>
              <div className="text-xs text-purple-300">
                Cast spells to consume crystals
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced debug info */}
      {showStats && (
        <div className="absolute top-32 left-4 pointer-events-auto">
          <div className="minecraft-debug-panel">
            <div className="text-white minecraft-text text-sm space-y-1">
              <div>X: {playerPosition.x}</div>
              <div>Y: {playerPosition.y}</div>
              <div>Z: {playerPosition.z}</div>
              <div>Chunk: {Math.floor(playerPosition.x / 16)},{Math.floor(playerPosition.z / 16)}</div>
              <div>Biome: Plains</div>
              <div>Blocks: {gameState.worldBlocks?.size || 0}</div>
              {gameState.playerData && (
                <>
                  <div>Level: {gameState.playerData.level}</div>
                  <div>XP: {gameState.playerData.totalXP}</div>
                  <div>Mobs Killed: {gameState.playerData.stats?.mobsKilled || 0}</div>
                </>
              )}
            </div>
          </div>
          
          {/* Player stats in debug mode */}
          {gameState.playerData && (
            <div className="mt-2">
              <div className="minecraft-debug-panel">
                <div className="text-white minecraft-text text-sm space-y-1">
                  <div>Level: {gameState.playerData.level}</div>
                  <div>XP: {gameState.playerData.currentXP} / {gameState.playerData.xpRequired}</div>
                  <div>Total XP: {gameState.playerData.totalXP}</div>
                </div>
              </div>
            </div>
          )}
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
export { MinecraftSky, EnhancedMagicHands, MinecraftHotbar, MinecraftHealthHunger, PositionTracker };
