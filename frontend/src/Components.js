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
export const MinecraftHealthHunger = React.memo(() => {
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
export const MinecraftWorld = React.memo(({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const { camera } = useThree();
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  const lastUpdateTime = useRef(0);
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

// ENHANCED Sky Component with Authentic Effects
export const MinecraftSky = React.memo(({ isDay = true }) => {
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

// Position tracker component - Optimized
export const PositionTracker = React.memo(({ onPositionUpdate }) => {
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

// OPTIMIZED Player Component - Fixed Camera Issues
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
  
  // MINIMAL camera setup - let PointerLockControls handle rotation
  useEffect(() => {
    // Only set initial position, NO rotation control
    camera.position.set(0, 18, 0);
    
    // Expose camera globally for magic system
    window.gameCamera = camera;
    
    // Set initial spell
    gameState.selectedSpell = selectedSpell;
    
    setTimeout(() => {
      const groundLevel = getOptimizedGroundLevel(0, 0);
      const safeHeight = Math.max(groundLevel + 2, 16);
      camera.position.y = safeHeight;
      console.log(`🧙‍♂️ Player initialized at height: ${safeHeight}`);
    }, 500);
  }, [camera, gameState, selectedSpell]);

  // Expose attack state and spell casting globally
  useEffect(() => {
    window.setPlayerAttacking = setIsAttacking;
    window.getSelectedSpell = () => selectedSpell;
    window.setSelectedSpell = setSelectedSpell;
  }, [selectedSpell]);

  // OPTIMIZED frame logic - NO camera rotation interference
  useFrame((state, delta) => {
    const now = performance.now();
    
    const shouldUpdateCamera = now - lastCameraUpdate.current > 16; // 60fps
    const shouldCheckGround = now - lastGroundCheck.current > 50; // 20fps for ground check
    
    const speed = 12;
    const moveVector = new THREE.Vector3();
    
    if (shouldUpdateCamera) {
      camera.getWorldDirection(forwardVector.current);
      rightVector.current.crossVectors(forwardVector.current, upVector.current).normalize();
      lastCameraUpdate.current = now;
    }
    
    // Apply movement - ONLY position, no rotation
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
    
    // Enhanced gravity and ground collision - ONLY Y position
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
      }
      
      lastGroundCheck.current = now;
    } else {
      camera.position.y += velocity.current.y * delta;
    }
  });

  // Enhanced ground level detection with caching
  const getOptimizedGroundLevel = useCallback((x, z) => {
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
    
    // Limit cache size
    if (groundLevelCache.current.size > 50) {
      const entries = Array.from(groundLevelCache.current.entries());
      groundLevelCache.current.clear();
      entries.slice(-25).forEach(([key, value]) => {
        groundLevelCache.current.set(key, value);
      });
    }
    
    return groundLevel;
  }, []);

  // COMPLETELY ISOLATED event handlers - NO CONFLICTS
  useEffect(() => {
    const handleKeyDown = (event) => {
      // MOVEMENT KEYS ONLY - No other processing
      if (event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
        setKeys(prev => ({ ...prev, [event.code]: true }));
        event.preventDefault(); // Prevent any other handlers
        event.stopPropagation(); // Stop event bubbling
        return; // Exit immediately
      }
      
      // SEPARATE handler for other keys
      handleNonMovementKeys(event);
    };
    
    const handleKeyUp = (event) => {
      // MOVEMENT KEYS ONLY - No other processing
      if (event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
        setKeys(prev => ({ ...prev, [event.code]: false }));
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    };
    
    const handleNonMovementKeys = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = 12;
          setIsOnGround(false);
        }
        return;
      }
      
      // FIXED magic casting - NO automatic XP
      if (event.code === 'KeyF') {
        event.preventDefault();
        setIsAttacking(true);
        
        // Cast spell WITHOUT automatic XP
        if (window.castSpell) {
          window.castSpell(selectedSpell);
          // REMOVED automatic XP - only award XP on actual hits
        }
        
        setTimeout(() => setIsAttacking(false), 600);
        return;
      }
      
      // Spell selection
      if (event.code === 'KeyQ') {
        event.preventDefault();
        const spells = ['fireball', 'iceball', 'lightning', 'arcane'];
        const currentIndex = spells.indexOf(selectedSpell);
        const nextSpell = spells[(currentIndex + 1) % spells.length];
        setSelectedSpell(nextSpell);
        gameState.selectedSpell = nextSpell;
        console.log(`🔮 Selected spell: ${nextSpell}`);
        return;
      }
      
      // Block selection
      if (event.code.startsWith('Digit')) {
        const num = parseInt(event.code.replace('Digit', ''));
        const blockTypes = BLOCK_TYPE_KEYS;
        if (num >= 1 && num <= blockTypes.length) {
          gameState.setSelectedBlock(blockTypes[num - 1]);
        }
        return;
      }
    };
    
    // Add with highest priority to capture first
    window.addEventListener('keydown', handleKeyDown, { passive: false, capture: true });
    window.addEventListener('keyup', handleKeyUp, { passive: false, capture: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [gameState, isOnGround, selectedSpell]);

  return (
    <group>
      {/* STABLE Magic Hands - No Shaking */}
      <StableMagicHands 
        selectedSpell={selectedSpell}
        selectedBlock={gameState.selectedBlock}
        isAttacking={isAttacking}
      />
    </group>
  );
};

// COMPLETELY STABLE Magic Hands - NO MOVEMENT AT ALL
const StableMagicHands = ({ selectedSpell, selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();
  
  const SPELL_COLORS = {
    fireball: '#FF4500',
    iceball: '#00BFFF', 
    lightning: '#FFD700',
    arcane: '#9932CC'
  };
  
  const currentSpellColor = SPELL_COLORS[selectedSpell] || SPELL_COLORS.fireball;

  // COMPLETELY STABLE positioning - ZERO ANIMATION
  useFrame(() => {
    if (rightHandRef.current && leftHandRef.current && camera) {
      // FIXED right hand positioning - NO MATRIX OPERATIONS
      rightHandRef.current.position.set(0.6, -0.8, -1.0);
      rightHandRef.current.rotation.set(0, 0, 0);
      
      // FIXED left hand positioning - NO MATRIX OPERATIONS
      leftHandRef.current.position.set(-0.4, -0.7, -0.9);
      leftHandRef.current.rotation.set(0, 0, 0);
      
      // ONLY move during attack - MINIMAL movement
      if (isAttacking) {
        rightHandRef.current.rotation.x = -0.05;
        leftHandRef.current.rotation.x = -0.05;
        
        if (wandRef.current) {
          wandRef.current.rotation.x = 0.05;
        }
      } else {
        // COMPLETELY STATIC when not attacking
        rightHandRef.current.rotation.x = 0;
        leftHandRef.current.rotation.x = 0;
        
        if (wandRef.current) {
          wandRef.current.rotation.x = 0;
        }
      }
      
      // STATIC magic aura - no scaling
      if (magicAuraRef.current) {
        magicAuraRef.current.scale.setScalar(1);
        magicAuraRef.current.material.opacity = isAttacking ? 0.3 : 0;
      }
    }
  });

  return (
    <group>
      {/* RIGHT HAND - COMPLETELY STATIC */}
      <group ref={rightHandRef}>        
        {/* Forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand */}
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
        
        {/* STATIC MAGIC WAND */}
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0, 0.2, 0.1]}>
          <MagicWand wandType={selectedSpell} />
        </group>
        
        {/* STATIC magical aura during casting */}
        {isAttacking && (
          <mesh ref={magicAuraRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial 
              color={currentSpellColor}
              transparent
              opacity={0.3}
            />
          </mesh>
        )}
      </group>
      
      {/* LEFT HAND - COMPLETELY STATIC */}
      <group ref={leftHandRef}>
        {/* Forearm */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Main hand */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.2, 0.24, 0.12]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Thumb */}
        <mesh position={[-0.12, -0.02, 0]}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Fingers */}
        <mesh position={[0, -0.1, -0.1]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.16, 0.06, 0.04]} />
          <meshLambertMaterial color="#e6a69a" />
        </mesh>
        
        {/* STATIC spell energy when attacking */}
        {isAttacking && (
          <group>
            {/* Main spell energy orb */}
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshBasicMaterial 
                color={currentSpellColor}
                transparent
                opacity={0.8}
              />
            </mesh>
            
            {/* STATIC magical particles */}
            {[...Array(4)].map((_, i) => (
              <mesh 
                key={i}
                position={[
                  (i % 2 === 0 ? 0.1 : -0.1),
                  0.05 + (i * 0.03),
                  -0.15 - (i * 0.02)
                ]}
              >
                <sphereGeometry args={[0.01, 4, 4]} />
                <meshBasicMaterial 
                  color={currentSpellColor}
                  transparent
                  opacity={0.6}
                />
              </mesh>
            ))}
          </group>
        )}
        
        {/* Static selected block display */}
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

// ENHANCED Spell-specific hand effects for right hand - PRESERVED
const SpellHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      
      switch (spellType) {
        case 'fireball':
          effectRef.current.rotation.y += 0.05; // Reduced speed
          effectRef.current.scale.setScalar(1 + Math.sin(time * 4) * 0.1); // Reduced intensity
          break;
        case 'iceball':
          effectRef.current.rotation.x += 0.02;
          effectRef.current.rotation.z += 0.03;
          break;
        case 'lightning':
          effectRef.current.visible = Math.random() > 0.4; // Less flickering
          break;
        case 'arcane':
          effectRef.current.rotation.y += 0.08;
          effectRef.current.position.y = 0.2 + Math.sin(time * 3) * 0.03; // Reduced movement
          break;
      }
    }
  });
  
  if (spellType === 'fireball') {
    return (
      <mesh ref={effectRef} position={[0.1, 0.2, 0]}>
        <coneGeometry args={[0.08, 0.25, 6]} />
        <meshBasicMaterial color="#FF4500" transparent opacity={0.6} />
      </mesh>
    );
  }
  
  if (spellType === 'iceball') {
    return (
      <group ref={effectRef}>
        {[...Array(3)].map((_, i) => (
          <mesh key={i} position={[0, 0.2, 0]} rotation={[0, (i * Math.PI) / 1.5, 0]}>
            <coneGeometry args={[0.04, 0.15, 4]} />
            <meshBasicMaterial color="#87CEEB" transparent opacity={0.7} />
          </mesh>
        ))}
      </group>
    );
  }
  
  if (spellType === 'lightning') {
    return (
      <mesh ref={effectRef} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 4]} />
        <meshBasicMaterial color="#FFFF00" transparent opacity={0.8} />
      </mesh>
    );
  }
  
  if (spellType === 'arcane') {
    return (
      <mesh ref={effectRef} position={[0, 0.2, 0]}>
        <torusGeometry args={[0.12, 0.02, 6, 8]} />
        <meshBasicMaterial color="#9932CC" transparent opacity={0.7} />
      </mesh>
    );
  }
  
  return null;
};

// ENHANCED Spell-specific effects for left hand - PRESERVED
const SpellLeftHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      effectRef.current.rotation.y += 0.05; // Reduced speed
      effectRef.current.scale.setScalar(1 + Math.sin(time * 2) * 0.05); // Reduced intensity
    }
  });
  
  const colors = {
    fireball: '#FFD700',
    iceball: '#E0FFFF',
    lightning: '#FFFACD',
    arcane: '#E6E6FA'
  };
  
  return (
    <mesh ref={effectRef} position={[0, 0.05, -0.12]}>
      <sphereGeometry args={[0.04, 6, 6]} />
      <meshBasicMaterial 
        color={colors[spellType] || colors.fireball}
        transparent 
        opacity={0.5} 
      />
    </mesh>
  );
};

// Game UI Component with optimizations
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
        <div className="absolute top-32 left-4 pointer-events-auto">
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

// Keep all UI components unchanged but optimized
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