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

// Authentic Minecraft Block Types Configuration with EXACT Colors
export const BLOCK_TYPES = {
  grass: { color: '#567C35', name: 'Grass Block', texture: 'grass' }, // DARKER authentic Minecraft grass
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

// Authentic Minecraft-style Hotbar
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
              {/* Block icon */}
              <div 
                className="minecraft-block-icon"
                style={{ backgroundColor: blockConfig.color }}
              />
              
              {/* Quantity display */}
              {quantity > 1 && (
                <div className="minecraft-quantity">
                  {quantity > 999 ? '999+' : quantity}
                </div>
              )}
              
              {/* Hotkey number */}
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
        {/* Health bar (left side) */}
        <div className="minecraft-health-bar">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="minecraft-heart">
              <div className="minecraft-heart-icon">❤</div>
            </div>
          ))}
        </div>
        
        {/* Hunger bar (right side) */}
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

// ENHANCED Terrain Generation - Proper infinite world
const generateTerrain = (x, z, seed = 0) => {
  // Multi-octave noise for realistic terrain
  const octave1 = Math.sin(x * 0.1 + seed) * Math.cos(z * 0.1 + seed) * 3;
  const octave2 = Math.sin(x * 0.05 + seed) * Math.cos(z * 0.05 + seed) * 8;
  const octave3 = Math.sin(x * 0.025 + seed) * Math.cos(z * 0.025 + seed) * 15;
  
  const height = octave1 + octave2 + octave3 + 40; // Base height of 40
  return Math.floor(Math.max(35, height)); // Minimum height 35, max around 66
};

// MASSIVE IMPROVEMENT: Proper infinite world generation
export const MinecraftWorld = ({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const { camera } = useThree();
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastPlayerPos, setLastPlayerPos] = useState({ x: 0, z: 0 });
  
  const chunkSize = 16; // Standard Minecraft chunk size
  const renderDistance = 3; // Chunks to render around player

  // Comprehensive world generation system
  const generateChunk = async (chunkX, chunkZ) => {
    return new Promise(resolve => {
      const chunkKey = `${chunkX}_${chunkZ}`;
      
      if (generatedChunks.has(chunkKey)) {
        resolve();
        return;
      }

      // Generate terrain in the background
      setTimeout(() => {
        const newBlocks = new Map();
        const startX = chunkX * chunkSize;
        const startZ = chunkZ * chunkSize;
        
        // Generate base terrain
        for (let x = startX; x < startX + chunkSize; x++) {
          for (let z = startZ; z < startZ + chunkSize; z++) {
            const height = generateTerrain(x, z, 12345);
            
            // Generate multiple layers for each column
            for (let y = 0; y <= height; y++) {
              const key = `${x},${y},${z}`;
              
              // Surface layer
              if (y === height) {
                if (height > 45) {
                  newBlocks.set(key, { position: [x, y, z], type: 'grass' });
                } else {
                  newBlocks.set(key, { position: [x, y, z], type: 'sand' });
                }
              }
              // Sub-surface layers
              else if (y >= height - 3) {
                newBlocks.set(key, { position: [x, y, z], type: 'dirt' });
              }
              // Deep layers
              else if (y >= height - 10) {
                newBlocks.set(key, { position: [x, y, z], type: 'stone' });
              }
              // Ore generation at lower levels
              else {
                if (Math.random() < 0.02) {
                  const oreType = Math.random() < 0.1 ? 'diamond' : 
                                 Math.random() < 0.3 ? 'gold' : 'iron';
                  newBlocks.set(key, { position: [x, y, z], type: oreType });
                } else {
                  newBlocks.set(key, { position: [x, y, z], type: 'stone' });
                }
              }
            }
            
            // Add structures randomly
            if (height > 45 && Math.random() < 0.02) { // Trees
              const treeHeight = 3 + Math.floor(Math.random() * 3);
              for (let th = 1; th <= treeHeight; th++) {
                const treeKey = `${x},${height + th},${z}`;
                newBlocks.set(treeKey, { position: [x, height + th, z], type: 'wood' });
              }
            }
          }
        }
        
        // Update blocks atomically
        setBlocks(prev => {
          const updated = new Map(prev);
          newBlocks.forEach((value, key) => {
            updated.set(key, value);
          });
          return updated;
        });
        
        setGeneratedChunks(prev => new Set(prev).add(chunkKey));
        console.log(`🌍 Generated chunk ${chunkX},${chunkZ} with ${newBlocks.size} blocks`);
        resolve();
      }, 50); // Small delay to prevent blocking
    });
  };

  // Continuous terrain generation based on player position
  useFrame(() => {
    if (isGenerating) return;
    
    const playerX = Math.floor(camera.position.x);
    const playerZ = Math.floor(camera.position.z);
    const currentChunkX = Math.floor(playerX / chunkSize);
    const currentChunkZ = Math.floor(playerZ / chunkSize);
    
    // Only check if player moved significantly
    if (Math.abs(playerX - lastPlayerPos.x) > 8 || Math.abs(playerZ - lastPlayerPos.z) > 8) {
      setLastPlayerPos({ x: playerX, z: playerZ });
      
      setIsGenerating(true);
      
      // Generate chunks around player
      const chunksToGenerate = [];
      for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        for (let dz = -renderDistance; dz <= renderDistance; dz++) {
          const chunkX = currentChunkX + dx;
          const chunkZ = currentChunkZ + dz;
          const chunkKey = `${chunkX}_${chunkZ}`;
          
          if (!generatedChunks.has(chunkKey)) {
            chunksToGenerate.push({ x: chunkX, z: chunkZ });
          }
        }
      }
      
      // Generate missing chunks one by one
      if (chunksToGenerate.length > 0) {
        const chunkToGen = chunksToGenerate[0];
        generateChunk(chunkToGen.x, chunkToGen.z).then(() => {
          setIsGenerating(false);
        });
      } else {
        setIsGenerating(false);
      }
    }
  });

  // Initial world generation - generate starting area
  useEffect(() => {
    const initialGeneration = async () => {
      setIsGenerating(true);
      console.log('🌍 Generating initial world...');
      
      // Generate a 3x3 grid of chunks around spawn
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          await generateChunk(x, z);
        }
      }
      
      setIsGenerating(false);
      console.log('✅ Initial world generation complete');
    };
    
    initialGeneration();
  }, []);

  // Optimized collision detection
  const getHighestBlockAt = (x, z) => {
    let maxY = 35; // Default ground level
    for (let y = 35; y <= 70; y++) { // Check reasonable height range
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

  // Enhanced block placement with sound effects
  const placeBlock = () => {
    if (!gameState.selectedBlock) return;
    
    try {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const newPos = camera.position.clone().add(direction.multiplyScalar(4));
      const gridPos = {
        x: Math.round(newPos.x),
        y: Math.max(35, Math.round(newPos.y)),
        z: Math.round(newPos.z)
      };
      
      const key = `${gridPos.x},${gridPos.y},${gridPos.z}`;
      
      if (!blocks.has(key)) {
        setBlocks(prev => new Map(prev).set(key, {
          position: [gridPos.x, gridPos.y, gridPos.z],
          type: gameState.selectedBlock
        }));
        
        // Add block placement effect
        if (window.addCombatEffect) {
          window.addCombatEffect('block_break', [gridPos.x, gridPos.y, gridPos.z], {
            color: BLOCK_TYPES[gameState.selectedBlock].color
          });
        }
        
        if (gameState.gameMode !== 'creative') {
          gameState.removeFromInventory(gameState.selectedBlock, 1);
        }
        
        console.log(`🧱 Placed ${gameState.selectedBlock} at ${gridPos.x},${gridPos.y},${gridPos.z}`);
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
        
        // Add block breaking effect
        if (window.addCombatEffect) {
          window.addCombatEffect('block_break', [gridPos.x, gridPos.y, gridPos.z], {
            color: BLOCK_TYPES[block.type].color
          });
        }
        
        gameState.addToInventory(block.type, 1);
        console.log(`💥 Broke ${block.type} at ${gridPos.x},${gridPos.y},${gridPos.z}`);
      }
    } catch (error) {
      console.error('Error breaking block:', error);
    }
  };

  // Enhanced click handlers
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
      <MinecraftClouds />
      
      {/* Render all blocks with optimized performance */}
      {Array.from(blocks.values()).map((block) => {
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
          </mesh>
        );
      })}
    </group>
  );
};

// COMPLETELY STATIC HANDS - ZERO Animation to fix shaking
const BothHands = ({ selectedBlock }) => {
  const selectedBlockConfig = BLOCK_TYPES[selectedBlock] || BLOCK_TYPES.grass;

  return (
    <group>
      {/* Completely static right hand - No useFrame, no animation */}
      <group position={[0.4, -0.3, -0.6]}>
        {/* Arm */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.08, 0.24, 0.08]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Hand */}
        <mesh position={[0, -0.12, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Tool/Block in hand - completely static */}
        {selectedBlock && (
          <mesh position={[0.05, -0.08, -0.1]}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshBasicMaterial color={selectedBlockConfig.color} />
          </mesh>
        )}
      </group>
      
      {/* Completely static left hand */}
      <group position={[-0.4, -0.3, -0.6]}>
        {/* Arm */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.08, 0.24, 0.08]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Hand */}
        <mesh position={[0, -0.12, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
      </group>
    </group>
  );
};

// STABLE Sky Component - Minimal animation to prevent shaking
const MinecraftSky = ({ isDay = true }) => {
  const skyRef = useRef();
  
  // REMOVED useFrame completely to stop sky shaking
  // Sky will be completely static
  
  const skyColor = isDay ? '#87CEEB' : '#191970';
  const sunColor = isDay ? '#FFD700' : '#F5F5DC';
  const celestialPosition = [0, 50, -80];
  
  return (
    <group ref={skyRef}>
      {/* Static sky sphere */}
      <mesh scale={[200, 200, 200]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={skyColor}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Static sun/moon */}
      <mesh position={celestialPosition}>
        <sphereGeometry args={[3, 12, 12]} />
        <meshBasicMaterial 
          color={sunColor}
        />
      </mesh>
    </group>
  );
};

// STATIC Clouds - Reduced animation to prevent terrain shaking
const MinecraftClouds = () => {
  const cloudsRef = useRef();
  
  // Generate static cloud positions
  const cloudPositions = useMemo(() => {
    const positions = [];
    
    for (let i = 0; i < 15; i++) {
      const baseX = (i - 7) * 25 + (Math.random() - 0.5) * 10;
      const baseZ = -40 + (Math.random() - 0.5) * 30;
      const baseY = 80 + Math.random() * 10;
      
      for (let j = 0; j < 6; j++) {
        positions.push({
          x: baseX + (Math.random() - 0.5) * 12,
          y: baseY + (Math.random() - 0.5) * 3,
          z: baseZ + (Math.random() - 0.5) * 12,
          scaleX: 4 + Math.random() * 3,
          scaleY: 2 + Math.random() * 1,
          scaleZ: 4 + Math.random() * 3,
          opacity: 0.6 + Math.random() * 0.4
        });
      }
    }
    
    return positions;
  }, []);
  
  // VERY slow cloud movement - reduced frequency to prevent shaking
  useFrame((state) => {
    if (cloudsRef.current) {
      const time = state.clock.getElapsedTime();
      // Ultra-slow movement
      cloudsRef.current.position.x = Math.sin(time * 0.001) * 2;
      cloudsRef.current.position.z = time * 0.02; // Very slow forward drift
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

// Position tracker component - works INSIDE Canvas
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
  
  return null; // This component doesn't render anything
};

// Enhanced Player with STABLE physics - No shaking
export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isOnGround, setIsOnGround] = useState(false);
  
  // Set initial camera position high above ground
  useEffect(() => {
    camera.position.set(0, 50, 0); // Start high to let player fall naturally
    console.log('🎮 Player initialized at position:', camera.position);
  }, [camera]);

  useFrame((state, delta) => {
    const speed = 6; // Minecraft-like movement speed
    const moveVector = new THREE.Vector3();
    
    // Get camera direction for movement
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // Get right vector
    const right = new THREE.Vector3();
    right.crossVectors(direction, camera.up).normalize();
    
    // Apply movement based on keys
    if (keys.KeyW) moveVector.add(direction);
    if (keys.KeyS) moveVector.sub(direction);
    if (keys.KeyA) moveVector.sub(right);
    if (keys.KeyD) moveVector.add(right);
    
    // Apply horizontal movement
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.y = 0; // Don't move up/down with WASD
      
      const newPosition = camera.position.clone().add(moveVector.multiplyScalar(speed * delta));
      camera.position.x = newPosition.x;
      camera.position.z = newPosition.z;
    }
    
    // FIXED PHYSICS - Proper gravity and ground collision
    // Apply gravity
    velocity.current.y -= 20 * delta; // Realistic gravity
    
    // Apply Y movement with collision detection
    const newY = camera.position.y + velocity.current.y * delta;
    
    // Ground collision detection
    const groundLevel = getGroundLevel(camera.position.x, camera.position.z);
    const playerHeight = 1.8; // Player eye level
    
    if (newY - playerHeight <= groundLevel) {
      // Land on ground
      camera.position.y = groundLevel + playerHeight;
      velocity.current.y = 0;
      setIsOnGround(true);
    } else {
      // Still falling/jumping
      camera.position.y = newY;
      setIsOnGround(false);
    }
  });

  // Ground level detection
  const getGroundLevel = (x, z) => {
    if (window.getHighestBlockAt) {
      return window.getHighestBlockAt(x, z) + 1;
    }
    return 40; // Default ground level
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      setKeys(prev => ({ ...prev, [event.code]: true }));
      
      // Jumping - only when on ground
      if (event.code === 'Space') {
        event.preventDefault();
        if (isOnGround) {
          velocity.current.y = 12; // Strong jump
          setIsOnGround(false);
          console.log('🦘 Jump!');
        }
      }
      
      // Block selection with number keys
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

  return <BothHands selectedBlock={gameState.selectedBlock} />;
};

// Game UI Component - FIXED: No useThree hook (used outside Canvas)
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

      {/* Minecraft-style Hotbar */}
      <MinecraftHotbar gameState={gameState} />
      
      {/* Health and Hunger */}
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

      {/* Debug info with player position */}
      {showStats && (
        <div className="absolute top-20 left-4 pointer-events-auto">
          <div className="minecraft-debug-panel">
            <div className="text-white minecraft-text text-sm space-y-1">
              <div>X: {playerPosition.x}</div>
              <div>Y: {playerPosition.y}</div>
              <div>Z: {playerPosition.z}</div>
              <div>Biome: Plains</div>
              <div>Light Level: {gameState.isDay ? '15' : '7'}</div>
              <div>Game Mode: {gameState.gameMode}</div>
              <div>Time: {Math.floor(gameState.gameTime / 60)}m {gameState.gameTime % 60}s</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Keep all other components unchanged (Inventory, CraftingTable, etc.)
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>

        {/* Blocks */}
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

        {/* Tools */}
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

        {/* Magic Items */}
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

// Crafting Table Component
export const CraftingTable = ({ gameState, onClose }) => {
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  
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

    // Remove ingredients
    Object.entries(recipe.ingredients).forEach(([item, needed]) => {
      gameState.removeFromInventory(item, needed);
    });

    // Add result
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

// Magic System Component
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

// Building Tools Component
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

// Settings Panel Component
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
          {/* Game Mode */}
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

          {/* Graphics */}
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

          {/* World Actions */}
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

          {/* Player Stats */}
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
export { MinecraftSky, BothHands, MinecraftClouds, MinecraftHotbar, MinecraftHealthHunger, PositionTracker };
