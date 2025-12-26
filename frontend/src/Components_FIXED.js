import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Box, Plane, Stars } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { 
  PickaxeIcon, 
  Package, 
  Settings, 
  Sun, 
  Moon, 
  Wand2, 
  Copy, 
  Download,
  Upload,
  Trash2,
  Grid,
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
export const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) {
            console.warn(`Unknown block type: ${blockType}`);
            return null;
          }
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
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
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
export const MinecraftHealthHunger = React.memo(() => {
  const hearts = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  const hunger = useMemo(() => Array(10).fill(null).map((_, i) => i), []);

  return (
    <div className="absolute top-20 left-4 pointer-events-none">
      <div className="flex flex-col gap-2">
        <div className="flex gap-1">
          {hearts.map(i => (
            <div key={i} className="minecraft-heart">❤️</div>
          ))}
        </div>
        <div className="flex gap-1">
          {hunger.map(i => (
            <div key={i} className="minecraft-hunger-icon">🍖</div>
          ))}
        </div>
      </div>
    </div>
  );
});

// COMPLETELY REWRITTEN terrain generation with proper synchronization
const generateTerrainHeight = (() => {
  const cache = new Map();
  const maxCacheSize = 10000; // Increased cache size
  
  return (x, z) => {
    const key = `${Math.floor(x)}_${Math.floor(z)}`;
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    // Better noise for more varied terrain
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

// COMPLETELY FIXED World Generation System
export const MinecraftWorld = React.memo(({ gameState }) => {
  // Use refs to avoid stale closures
  const blocksRef = useRef(new Map());
  const generatedChunksRef = useRef(new Set());
  
  // State for triggering re-renders
  const [, forceUpdate] = useState(0);
  const { camera } = useThree();
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  const lastUpdateTime = useRef(0);
  
  const chunkSize = 16;
  const renderDistance = 4;
  const updateThreshold = 100; // Check every 100ms

  // Generate a single tree
  const generateTree = useCallback((blockMap, x, baseY, z) => {
    const treeHeight = 2 + Math.floor(Math.random() * 2);
    
    // Trunk
    for (let y = 1; y <= treeHeight; y++) {
      const trunkKey = `${x},${baseY + y},${z}`;
      blockMap.set(trunkKey, { 
        position: [x, baseY + y, z], 
        type: 'wood',
        key: trunkKey
      });
    }
    
    // Leaves
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

  // FIXED: Generate chunk with proper synchronization
  const generateChunk = useCallback((chunkX, chunkZ) => {
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    // Check using ref to avoid stale closure
    if (generatedChunksRef.current.has(chunkKey)) {
      return false; // Already generated
    }

    console.log(`📦 Generating chunk (${chunkX}, ${chunkZ})`);
    
    const startX = chunkX * chunkSize;
    const startZ = chunkZ * chunkSize;
    
    // Generate all blocks for this chunk
    for (let x = startX; x < startX + chunkSize; x++) {
      for (let z = startZ; z < startZ + chunkSize; z++) {
        const height = generateTerrainHeight(x, z);
        
        // Surface block
        const blockType = Math.random() < 0.95 ? 'grass' : 'dirt';
        const key = `${x},${height},${z}`;
        blocksRef.current.set(key, { 
          position: [x, height, z], 
          type: blockType,
          key
        });
        
        // Underground layers
        for (let y = height - 1; y >= Math.max(height - 2, 10); y--) {
          const undergroundType = y === height - 1 ? 'dirt' : 'stone';
          const undergroundKey = `${x},${y},${z}`;
          blocksRef.current.set(undergroundKey, { 
            position: [x, y, z], 
            type: undergroundType,
            key: undergroundKey
          });
        }
        
        // Occasional trees
        if (blockType === 'grass' && Math.random() < 0.003) {
          generateTree(blocksRef.current, x, height, z);
        }
      }
    }
    
    // Mark chunk as generated
    generatedChunksRef.current.add(chunkKey);
    console.log(`✅ Chunk (${chunkX}, ${chunkZ}) generated - Total: ${generatedChunksRef.current.size} chunks`);
    
    return true; // Successfully generated
  }, [generateTree, chunkSize]);

  // FIXED: Continuous terrain generation on every frame
  useFrame(() => {
    if (!camera) return;
    
    const now = performance.now();
    if (now - lastUpdateTime.current < updateThreshold) return;
    lastUpdateTime.current = now;
    
    const playerX = Math.floor(camera.position.x);
    const playerZ = Math.floor(camera.position.z);
    const currentChunkX = Math.floor(playerX / chunkSize);
    const currentChunkZ = Math.floor(playerZ / chunkSize);
    
    // Check if player moved to a new chunk
    if (currentChunkX !== lastPlayerChunk.current.x || currentChunkZ !== lastPlayerChunk.current.z) {
      lastPlayerChunk.current = { x: currentChunkX, z: currentChunkZ };
      
      let newChunksGenerated = 0;
      
      // Generate all chunks within render distance
      for (let x = -renderDistance; x <= renderDistance; x++) {
        for (let z = -renderDistance; z <= renderDistance; z++) {
          const chunkX = currentChunkX + x;
          const chunkZ = currentChunkZ + z;
          
          if (generateChunk(chunkX, chunkZ)) {
            newChunksGenerated++;
          }
        }
      }
      
      if (newChunksGenerated > 0) {
        console.log(`🌍 Generated ${newChunksGenerated} new chunks around (${currentChunkX}, ${currentChunkZ})`);
        // Force re-render to show new blocks
        forceUpdate(prev => prev + 1);
      }
    }
  });

  // Generate initial chunks
  useEffect(() => {
    console.log('🌍 Initializing terrain with full render distance...');
    
    let totalGenerated = 0;
    for (let x = -renderDistance; x <= renderDistance; x++) {
      for (let z = -renderDistance; z <= renderDistance; z++) {
        if (generateChunk(x, z)) {
          totalGenerated++;
        }
      }
    }
    
    console.log(`✅ Initial terrain complete: ${totalGenerated} chunks generated`);
    forceUpdate(prev => prev + 1);
  }, [generateChunk, renderDistance]);

  // Block interactions
  const handleBlockPlace = useCallback((position, blockType) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    if (!blocksRef.current.has(key)) {
      blocksRef.current.set(key, {
        position,
        type: blockType,
        key
      });
      
      forceUpdate(prev => prev + 1);
      
      if (window.manualXpBlockPlace) window.manualXpBlockPlace();
      if (gameState.gameMode !== 'creative') {
        gameState.removeFromInventory(blockType, 1);
      }
    }
  }, [gameState]);

  const handleBlockBreak = useCallback((position) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    const block = blocksRef.current.get(key);
    
    if (block) {
      blocksRef.current.delete(key);
      forceUpdate(prev => prev + 1);
      
      gameState.addToInventory(block.type, 1);
      if (window.manualXpBlockBreak) window.manualXpBlockBreak();
      
      if (['diamond', 'gold'].includes(block.type) && window.addExperience) {
        window.addExperience(15, 'Rare Material');
      }
    }
  }, [gameState]);

  // Click handlers for block interaction
  useEffect(() => {
    const handleClick = (event) => {
      if (!camera) return;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      if (event.button === 0) { // Left click - break
        const raycaster = new THREE.Raycaster(camera.position, direction, 0, 5);
        const hits = [];
        
        blocksRef.current.forEach(block => {
          const box = new THREE.Box3(
            new THREE.Vector3(block.position[0] - 0.5, block.position[1] - 0.5, block.position[2] - 0.5),
            new THREE.Vector3(block.position[0] + 0.5, block.position[1] + 0.5, block.position[2] + 0.5)
          );
          
          if (raycaster.ray.intersectsBox(box)) {
            hits.push(block);
          }
        });
        
        if (hits.length > 0) {
          handleBlockBreak(hits[0].position);
        }
      }
    };
    
    const handleContextMenu = (event) => {
      event.preventDefault();
      if (!camera) return;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      const newPosition = [
        Math.floor(camera.position.x + direction.x * 3),
        Math.floor(camera.position.y + direction.y * 3),
        Math.floor(camera.position.z + direction.z * 3)
      ];
      
      handleBlockPlace(newPosition, gameState.selectedBlock);
    };
    
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [camera, gameState.selectedBlock, handleBlockBreak, handleBlockPlace]);

  // Expose functions for mob system
  useEffect(() => {
    // CRITICAL: Expose generated chunks using ref
    window.getGeneratedChunks = () => generatedChunksRef.current;
    
    window.getHighestBlockAt = (x, z) => {
      return generateTerrainHeight(x, z);
    };
    
    window.getMobGroundLevel = (x, z) => {
      let terrainHeight = generateTerrainHeight(x, z);
      
      // Check for placed blocks
      let maxBlockY = terrainHeight;
      blocksRef.current.forEach(block => {
        if (Math.floor(block.position[0]) === Math.floor(x) && 
            Math.floor(block.position[2]) === Math.floor(z)) {
          maxBlockY = Math.max(maxBlockY, block.position[1]);
        }
      });
      
      return maxBlockY;
    };
    
    window.checkCollision = (position) => {
      const key = `${Math.floor(position[0])},${Math.floor(position[1])},${Math.floor(position[2])}`;
      return blocksRef.current.has(key);
    };
    
    console.log('🔧 Terrain functions exposed to mob system');
  }, []);

  // Render visible blocks only
  const visibleBlocks = useMemo(() => {
    if (!camera) return [];
    
    const cameraPos = camera.position;
    const viewDistance = 64; // Render blocks within 64 blocks
    
    const visible = [];
    blocksRef.current.forEach(block => {
      const distance = Math.sqrt(
        Math.pow(block.position[0] - cameraPos.x, 2) +
        Math.pow(block.position[2] - cameraPos.z, 2)
      );
      if (distance <= viewDistance) {
        visible.push(block);
      }
    });
    
    return visible;
  }, [camera, blocksRef.current.size, forceUpdate]); // Re-compute when blocks change

  return (
    <group>
      <EnhancedMagicSystem 
        gameState={gameState}
        playerPosition={camera?.position}
      />
      
      <OptimizedGrassSystem 
        chunkX={Math.floor(camera?.position?.x / 16) || 0}
        chunkZ={Math.floor(camera?.position?.z / 16) || 0}
        blockPositions={visibleBlocks.map(block => [...block.position, block.type])}
      />
      
      {visibleBlocks.map((block) => {
        const blockConfig = BLOCK_TYPES[block.type];
        return (
          <mesh key={block.key} position={block.position} userData={{ blockType: block.type }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshLambertMaterial 
              color={blockConfig?.color || '#567C35'}
              transparent={blockConfig?.transparent}
              opacity={blockConfig?.transparent ? 0.8 : 1}
            />
          </mesh>
        );
      })}
      
      <OptimizedClouds />
    </group>
  );
});

// SIMPLIFIED clouds
const OptimizedClouds = React.memo(() => {
  const cloudsRef = useRef();
  
  const cloudPositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 3; i++) {
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
          <boxGeometry />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
});

// Export all components
export { OptimizedClouds };
