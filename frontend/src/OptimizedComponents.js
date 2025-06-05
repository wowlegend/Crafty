import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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

// Import optimized systems
import { useSimpleExperience } from './SimpleExperienceSystem';
import { EnhancedMagicSystem, MagicWand } from './EnhancedMagicSystem';
import { OptimizedGrassSystem } from './OptimizedGrassSystem';

// OPTIMIZED Block Types - Cached and immutable
export const BLOCK_TYPES = Object.freeze({
  grass: Object.freeze({ color: '#567C35', name: 'Grass Block', texture: 'grass' }),
  dirt: Object.freeze({ color: '#976D4D', name: 'Dirt', texture: 'dirt' }),
  stone: Object.freeze({ color: '#707070', name: 'Stone', texture: 'stone' }),
  wood: Object.freeze({ color: '#8F7748', name: 'Oak Wood', texture: 'wood' }),
  glass: Object.freeze({ color: '#F0F8FF', name: 'Glass', texture: 'glass', transparent: true }),
  water: Object.freeze({ color: '#3F76E4', name: 'Water', texture: 'water', transparent: true }),
  lava: Object.freeze({ color: '#FF4500', name: 'Lava', texture: 'lava', emissive: true }),
  diamond: Object.freeze({ color: '#4FD0E7', name: 'Diamond Ore', texture: 'diamond', emissive: true }),
  gold: Object.freeze({ color: '#FCEE4B', name: 'Gold Ore', texture: 'gold' }),
  iron: Object.freeze({ color: '#D8AF93', name: 'Iron Ore', texture: 'iron' }),
  coal: Object.freeze({ color: '#2F2F2F', name: 'Coal Ore', texture: 'coal' }),
  sand: Object.freeze({ color: '#DBD3A0', name: 'Sand', texture: 'sand' }),
  cobblestone: Object.freeze({ color: '#7F7F7F', name: 'Cobblestone', texture: 'cobblestone' })
});

// CACHED block type keys for performance
const BLOCK_TYPE_KEYS = Object.keys(BLOCK_TYPES);
const HOTBAR_BLOCKS = BLOCK_TYPE_KEYS.slice(0, 9);

// ULTRA-OPTIMIZED Minecraft Hotbar - Minimal re-renders
const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          
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
              <div className="minecraft-hotkey">{index + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// OPTIMIZED Health and Hunger - Static components
const MinecraftHealthHunger = React.memo(() => {
  const hearts = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  const hunger = useMemo(() => Array(10).fill(null).map((_, i) => i), []);

  return (
    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-status-bars">
        <div className="minecraft-health-bar">
          {hearts.map(i => (
            <div key={`heart-${i}`} className="minecraft-heart">
              <div className="minecraft-heart-icon">❤</div>
            </div>
          ))}
        </div>
        <div className="minecraft-hunger-bar">
          {hunger.map(i => (
            <div key={`hunger-${i}`} className="minecraft-hunger">
              <div className="minecraft-hunger-icon">🍖</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ULTRA-OPTIMIZED terrain generation with caching
const generateTerrainHeight = (() => {
  const cache = new Map();
  const maxCacheSize = 1000;
  
  return (x, z) => {
    const key = `${Math.floor(x)}_${Math.floor(z)}`;
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const noise1 = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2;
    const noise2 = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
    const height = Math.floor(Math.max(12, Math.min(18, noise1 + noise2 + 15)));
    
    if (cache.size >= maxCacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, height);
    return height;
  };
})();

// OPTIMIZED World Generation - Drastically improved performance
export const OptimizedMinecraftWorld = React.memo(({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const { camera } = useThree();
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  const lastUpdateTime = useRef(0);
  const chunkGenerationQueue = useRef([]);
  const isGenerating = useRef(false);
  
  const chunkSize = 16;
  const renderDistance = 3; // Increased for better experience
  const updateThreshold = 100; // Only update every 100ms

  // OPTIMIZED chunk generation with batching
  const generateChunk = useCallback((chunkX, chunkZ) => {
    const chunkKey = `${chunkX}_${chunkZ}`;
    if (generatedChunks.has(chunkKey)) return;

    const newBlocks = new Map();
    const startX = chunkX * chunkSize;
    const startZ = chunkZ * chunkSize;
    
    // Generate blocks in batch
    for (let x = startX; x < startX + chunkSize; x++) {
      for (let z = startZ; z < startZ + chunkSize; z++) {
        const height = generateTerrainHeight(x, z);
        
        // Surface block - 95% grass for performance
        const blockType = Math.random() < 0.95 ? 'grass' : 'dirt';
        const key = `${x},${height},${z}`;
        newBlocks.set(key, { 
          position: [x, height, z], 
          type: blockType,
          key // Store key for faster access
        });
        
        // Underground layers - optimized
        for (let y = height - 1; y >= Math.max(height - 2, 10); y--) {
          const undergroundType = y === height - 1 ? 'dirt' : 'stone';
          const undergroundKey = `${x},${y},${z}`;
          newBlocks.set(undergroundKey, { 
            position: [x, y, z], 
            type: undergroundType,
            key: undergroundKey
          });
        }
        
        // Fewer trees for performance - only 1% chance
        if (blockType === 'grass' && Math.random() < 0.01) {
          generateTree(newBlocks, x, height, z);
        }
      }
    }
    
    // Batch update state
    setBlocks(prev => {
      const updated = new Map(prev);
      newBlocks.forEach((value, key) => updated.set(key, value));
      return updated;
    });
    
    setGeneratedChunks(prev => new Set(prev).add(chunkKey));
  }, []);

  const generateTree = useCallback((blockMap, x, baseY, z) => {
    const treeHeight = 2 + Math.floor(Math.random() * 2); // Smaller trees
    
    // Trunk
    for (let y = 1; y <= treeHeight; y++) {
      const trunkKey = `${x},${baseY + y},${z}`;
      blockMap.set(trunkKey, { 
        position: [x, baseY + y, z], 
        type: 'wood',
        key: trunkKey
      });
    }
    
    // Minimal leaves for performance
    const crownY = baseY + treeHeight + 1;
    const leafPositions = [
      [x, crownY, z], [x+1, crownY, z], [x-1, crownY, z]
    ];
    
    leafPositions.forEach(([lx, ly, lz]) => {
      const leafKey = `${lx},${ly},${lz}`;
      blockMap.set(leafKey, { 
        position: [lx, ly, lz], 
        type: 'grass',
        key: leafKey
      });
    });
  }, []);

  // OPTIMIZED frame-based generation with throttling
  useFrame(() => {
    if (!camera) return;
    
    const now = performance.now();
    if (now - lastUpdateTime.current < updateThreshold) return;
    lastUpdateTime.current = now;
    
    const playerX = Math.floor(camera.position.x);
    const playerZ = Math.floor(camera.position.z);
    const currentChunkX = Math.floor(playerX / chunkSize);
    const currentChunkZ = Math.floor(playerZ / chunkSize);
    
    if (currentChunkX !== lastPlayerChunk.current.x || currentChunkZ !== lastPlayerChunk.current.z) {
      lastPlayerChunk.current = { x: currentChunkX, z: currentChunkZ };
      
      // Queue chunks for generation instead of generating immediately
      if (!isGenerating.current) {
        isGenerating.current = true;
        requestIdleCallback(() => {
          for (let x = -renderDistance; x <= renderDistance; x++) {
            for (let z = -renderDistance; z <= renderDistance; z++) {
              const chunkX = currentChunkX + x;
              const chunkZ = currentChunkZ + z;
              generateChunk(chunkX, chunkZ);
            }
          }
          isGenerating.current = false;
        });
      }
    }
  });

  // Initial generation - smaller area
  useEffect(() => {
    console.log('🌍 Optimized terrain generation starting...');
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        generateChunk(x, z);
      }
    }
  }, [generateChunk]);

  // OPTIMIZED block interactions
  const handleBlockPlace = useCallback((position, blockType) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    if (!blocks.has(key)) {
      setBlocks(prev => new Map(prev).set(key, {
        position,
        type: blockType,
        key
      }));
      
      if (window.xpBlockPlace) window.xpBlockPlace();
      if (gameState.gameMode !== 'creative') {
        gameState.removeFromInventory(blockType, 1);
      }
    }
  }, [blocks, gameState]);

  const handleBlockBreak = useCallback((position) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    const block = blocks.get(key);
    
    if (block) {
      setBlocks(prev => {
        const newBlocks = new Map(prev);
        newBlocks.delete(key);
        return newBlocks;
      });
      
      gameState.addToInventory(block.type, 1);
      if (window.xpBlockBreak) window.xpBlockBreak();
      
      if (['diamond', 'gold'].includes(block.type) && window.addExperience) {
        window.addExperience(15, 'Rare Material');
      }
    }
  }, [blocks, gameState]);

  // OPTIMIZED click handlers
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
  }, [camera, gameState.selectedBlock, handleBlockBreak, handleBlockPlace]);

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

  // OPTIMIZED block rendering with culling
  const visibleBlocks = useMemo(() => {
    if (!camera) return [];
    
    const cameraPos = camera.position;
    const viewDistance = 32; // Only render nearby blocks
    
    return Array.from(blocks.values()).filter(block => {
      const distance = Math.sqrt(
        Math.pow(block.position[0] - cameraPos.x, 2) +
        Math.pow(block.position[2] - cameraPos.z, 2)
      );
      return distance <= viewDistance;
    });
  }, [blocks, camera]);

  return (
    <group>
      {/* Enhanced Magic System */}
      <EnhancedMagicSystem 
        gameState={gameState}
        playerPosition={camera?.position}
      />
      
      {/* Optimized Grass System */}
      <OptimizedGrassSystem 
        chunkX={Math.floor(camera?.position?.x / 16) || 0}
        chunkZ={Math.floor(camera?.position?.z / 16) || 0}
        blockPositions={visibleBlocks.map(block => [...block.position, block.type])}
      />
      
      {/* OPTIMIZED Block Rendering */}
      {visibleBlocks.map((block) => {
        const blockConfig = BLOCK_TYPES[block.type];
        return (
          <OptimizedBlock 
            key={block.key}
            position={block.position}
            blockConfig={blockConfig}
            blockType={block.type}
          />
        );
      })}
      
      {/* Simplified environment for performance */}
      <OptimizedClouds />
    </group>
  );
});

// OPTIMIZED individual block component
const OptimizedBlock = React.memo(({ position, blockConfig, blockType }) => {
  return (
    <mesh position={position} userData={{ blockType }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial 
        color={blockConfig.color}
        transparent={blockConfig.transparent || false}
        opacity={blockConfig.transparent ? 0.8 : 1}
      />
    </mesh>
  );
});

// SIMPLIFIED clouds for performance
const OptimizedClouds = React.memo(() => {
  const cloudsRef = useRef();
  
  const cloudPositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 3; i++) { // Reduced to 3 clouds
      positions.push({
        x: (i - 1) * 30,
        y: 35,
        z: -20,
        scale: 3
      });
    }
    return positions;
  }, []);
  
  useFrame((state) => {
    if (cloudsRef.current) {
      cloudsRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.001) * 2;
    }
  });
  
  return (
    <group ref={cloudsRef}>
      {cloudPositions.map((cloud, index) => (
        <mesh 
          key={index} 
          position={[cloud.x, cloud.y, cloud.z]}
          scale={[cloud.scale, 1, cloud.scale]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
});

// OPTIMIZED Sky Component
const OptimizedMinecraftSky = React.memo(({ isDay = true }) => {
  const { camera } = useThree();
  const skyRef = useRef();
  const sunRef = useRef();
  
  const skyColor = isDay ? '#87CEEB' : '#191970';
  const sunColor = isDay ? '#FFD700' : '#F5F5DC';
  
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
      <mesh ref={skyRef} scale={[200, 200, 200]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial 
          color={skyColor}
          side={THREE.BackSide}
        />
      </mesh>
      
      <mesh ref={sunRef}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color={sunColor} />
      </mesh>
    </group>
  );
});

// Position tracker component
const PositionTracker = React.memo(({ onPositionUpdate }) => {
  const { camera } = useThree();
  const lastUpdate = useRef(0);
  
  useFrame(() => {
    const now = performance.now();
    if (camera && onPositionUpdate && now - lastUpdate.current > 200) {
      lastUpdate.current = now;
      onPositionUpdate({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z)
      });
    }
  });
  
  return null;
});

// Export optimized components
export { 
  MinecraftHotbar, 
  MinecraftHealthHunger, 
  OptimizedMinecraftSky, 
  PositionTracker 
};