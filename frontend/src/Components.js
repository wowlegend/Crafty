import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Box, Plane } from '@react-three/drei';
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

// Block Types Configuration
export const BLOCK_TYPES = {
  grass: { color: '#4ade80', name: 'Grass', texture: 'grass' },
  dirt: { color: '#92400e', name: 'Dirt', texture: 'dirt' },
  stone: { color: '#6b7280', name: 'Stone', texture: 'stone' },
  wood: { color: '#d97706', name: 'Wood', texture: 'wood' },
  glass: { color: '#7dd3fc', name: 'Glass', texture: 'glass', transparent: true },
  water: { color: '#0ea5e9', name: 'Water', texture: 'water', transparent: true },
  lava: { color: '#ef4444', name: 'Lava', texture: 'lava', emissive: true },
  diamond: { color: '#06d6a0', name: 'Diamond', texture: 'diamond', emissive: true },
  gold: { color: '#fbbf24', name: 'Gold', texture: 'gold' },
  iron: { color: '#9ca3af', name: 'Iron', texture: 'iron' },
  coal: { color: '#1f2937', name: 'Coal', texture: 'coal' },
  sand: { color: '#fde047', name: 'Sand', texture: 'sand' },
  gravel: { color: '#78716c', name: 'Gravel', texture: 'gravel' }
};

// Optimized World Generation - Much smaller world
const generateTerrain = (x, z, seed = 0) => {
  const height = Math.sin(x * 0.2 + seed) * Math.cos(z * 0.2 + seed) * 2 + 3;
  return Math.floor(Math.max(1, height));
};

// Optimized Block Component - Better performance
const Block = ({ position, type, onDestroy, onClick, isHighlighted }) => {
  const meshRef = useRef();
  const blockConfig = BLOCK_TYPES[type] || BLOCK_TYPES.grass;
  
  // Reduced animation frequency for performance
  useFrame((state) => {
    if (meshRef.current && blockConfig.emissive) {
      const time = state.clock.getElapsedTime();
      meshRef.current.material.emissiveIntensity = 0.2 + Math.sin(time) * 0.1;
    }
  });

  const handleClick = (event) => {
    event.stopPropagation();
    if (event.button === 0) { // Left click - destroy
      onDestroy?.(position);
    } else if (event.button === 2) { // Right click - interact
      onClick?.(position, event);
    }
  };

  return (
    <Box
      ref={meshRef}
      position={position}
      onClick={handleClick}
      onContextMenu={handleClick}
      scale={isHighlighted ? [1.02, 1.02, 1.02] : [1, 1, 1]}
      userData={{ isBlock: true }}
    >
      <meshLambertMaterial
        color={blockConfig.color}
        transparent={blockConfig.transparent || false}
        opacity={blockConfig.transparent ? 0.8 : 1}
        emissive={blockConfig.emissive ? blockConfig.color : '#000000'}
        emissiveIntensity={blockConfig.emissive ? 0.2 : 0}
      />
    </Box>
  );
};

// Minecraft World Component
export const MinecraftWorld = ({ gameState, worldSeed }) => {
  const [blocks, setBlocks] = useState(new Map());
  const [highlightedBlock, setHighlightedBlock] = useState(null);
  const { camera, raycaster, mouse, scene } = useThree();

  // Generate initial world
  useEffect(() => {
    const initialBlocks = new Map();
    const size = 20;
    
    for (let x = -size; x <= size; x++) {
      for (let z = -size; z <= size; z++) {
        const height = generateTerrain(x, z, worldSeed.length);
        
        // Generate terrain layers
        for (let y = 0; y <= height; y++) {
          const key = `${x},${y},${z}`;
          if (y === height && height > 3) {
            initialBlocks.set(key, { position: [x, y, z], type: 'grass' });
          } else if (y === height && height <= 3) {
            initialBlocks.set(key, { position: [x, y, z], type: 'sand' });
          } else if (y >= height - 2) {
            initialBlocks.set(key, { position: [x, y, z], type: 'dirt' });
          } else if (y === 0) {
            initialBlocks.set(key, { position: [x, y, z], type: 'stone' });
          } else {
            initialBlocks.set(key, { position: [x, y, z], type: 'stone' });
          }
        }
        
        // Add some random decorations
        if (Math.random() < 0.1 && height > 5) {
          const decorY = height + 1;
          const decorKey = `${x},${decorY},${z}`;
          const decorType = Math.random() < 0.5 ? 'wood' : 'coal';
          initialBlocks.set(decorKey, { position: [x, decorY, z], type: decorType });
        }
      }
    }
    
    setBlocks(initialBlocks);
  }, [worldSeed]);

  // Handle block placement and destruction
  const handleBlockDestroy = (position) => {
    const key = `${position[0]},${position[1]},${position[2]}`;
    const block = blocks.get(key);
    
    if (block) {
      setBlocks(prev => {
        const newBlocks = new Map(prev);
        newBlocks.delete(key);
        return newBlocks;
      });
      
      // Add to inventory in creative mode
      if (gameState.gameMode === 'creative') {
        gameState.addToInventory(block.type, 1);
      }
      
      // Update stats
      gameState.setPlayerStats(prev => ({
        ...prev,
        blocksDestroyed: prev.blocksDestroyed + 1
      }));
    }
  };

  const handleBlockPlace = (position, normal) => {
    if (!gameState.selectedBlock || gameState.inventory.blocks[gameState.selectedBlock] <= 0) {
      return;
    }

    const newPosition = [
      position[0] + normal.x,
      position[1] + normal.y,
      position[2] + normal.z
    ];
    
    const key = `${newPosition[0]},${newPosition[1]},${newPosition[2]}`;
    
    if (!blocks.has(key)) {
      setBlocks(prev => new Map(prev).set(key, {
        position: newPosition,
        type: gameState.selectedBlock
      }));
      
      // Remove from inventory
      if (gameState.gameMode !== 'creative') {
        gameState.removeFromInventory(gameState.selectedBlock, 1);
      }
      
      // Update stats
      gameState.setPlayerStats(prev => ({
        ...prev,
        blocksPlaced: prev.blocksPlaced + 1
      }));
    }
  };

  // Handle mouse interactions
  useFrame(() => {
    raycaster.setFromCamera(mouse, camera);
    const blockArray = Array.from(blocks.values());
    const intersects = raycaster.intersectObjects(scene.children.filter(child => child.userData.isBlock));
    
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const position = intersect.object.position;
      setHighlightedBlock([position.x, position.y, position.z]);
    } else {
      setHighlightedBlock(null);
    }
  });

  // Handle clicks
  useEffect(() => {
    const handleClick = (event) => {
      if (event.button === 2 && highlightedBlock) { // Right click for placing
        event.preventDefault();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children.filter(child => child.userData.isBlock));
        
        if (intersects.length > 0) {
          const intersect = intersects[0];
          handleBlockPlace(intersect.point, intersect.face.normal);
        }
      }
    };

    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousedown', handleClick);
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [highlightedBlock, gameState.selectedBlock, gameState.inventory]);

  return (
    <group>
      {Array.from(blocks.values()).map((block, index) => (
        <Block
          key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`}
          position={block.position}
          type={block.type}
          onDestroy={handleBlockDestroy}
          isHighlighted={
            highlightedBlock &&
            highlightedBlock[0] === block.position[0] &&
            highlightedBlock[1] === block.position[1] &&
            highlightedBlock[2] === block.position[2]
          }
        />
      ))}
      
      {/* Ground plane for reference */}
      <Plane
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1, 0]}
        args={[100, 100]}
        receiveShadow
      >
        <meshLambertMaterial color="#22c55e" />
      </Plane>
    </group>
  );
};

// Player Hands Component
const PlayerHands = ({ gameState, isBreaking, isPlacing }) => {
  const handRef = useRef();
  const toolRef = useRef();
  const { camera } = useThree();
  
  useFrame((state) => {
    if (handRef.current && camera) {
      // Position hands relative to camera
      const cameraPosition = camera.position.clone();
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      
      // Right hand position
      const rightHandPos = cameraPosition.clone()
        .add(cameraDirection.clone().multiplyScalar(0.5))
        .add(new THREE.Vector3(0.3, -0.3, 0));
      
      handRef.current.position.copy(rightHandPos);
      handRef.current.lookAt(
        rightHandPos.clone().add(cameraDirection)
      );
      
      // Tool animation
      if (toolRef.current) {
        const time = state.clock.getElapsedTime();
        if (isBreaking) {
          toolRef.current.rotation.x = Math.sin(time * 10) * 0.2;
        } else if (isPlacing) {
          toolRef.current.rotation.y = Math.sin(time * 5) * 0.1;
        } else {
          toolRef.current.rotation.x = Math.sin(time * 0.5) * 0.05; // Idle sway
        }
      }
    }
  });

  const selectedBlockConfig = BLOCK_TYPES[gameState.selectedBlock];

  return (
    <group ref={handRef}>
      {/* Right Hand */}
      <Box position={[0, 0, 0]} scale={[0.15, 0.25, 0.1]}>
        <meshLambertMaterial color="#fdbcb4" />
      </Box>
      
      {/* Tool/Block in hand */}
      <group ref={toolRef} position={[0.1, 0.1, -0.2]}>
        {gameState.selectedBlock && (
          <Box scale={[0.1, 0.1, 0.1]}>
            <meshLambertMaterial 
              color={selectedBlockConfig?.color || '#4ade80'}
              transparent={selectedBlockConfig?.transparent || false}
              opacity={selectedBlockConfig?.transparent ? 0.7 : 1}
            />
          </Box>
        )}
      </group>
    </group>
  );
};

// Player Component
export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const isJumping = useRef(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  
  useFrame((state, delta) => {
    // Simple gravity and movement
    if (camera.position.y > 1.6) { // Adjusted for player height
      velocity.current.y -= 9.8 * delta;
    } else {
      velocity.current.y = 0;
      camera.position.y = 1.6; // Eye level height
      isJumping.current = false;
    }
    
    camera.position.add(velocity.current.clone().multiplyScalar(delta));
  });

  useEffect(() => {
    const keys = {};
    
    const handleKeyDown = (event) => {
      keys[event.code] = true;
      
      if (event.code === 'Space' && !isJumping.current) {
        velocity.current.y = 5;
        isJumping.current = true;
      }
    };
    
    const handleKeyUp = (event) => {
      keys[event.code] = false;
    };
    
    const handleMouseDown = (event) => {
      if (event.button === 0) { // Left click
        setIsBreaking(true);
        setTimeout(() => setIsBreaking(false), 200);
      } else if (event.button === 2) { // Right click
        setIsPlacing(true);
        setTimeout(() => setIsPlacing(false), 200);
      }
    };
    
    const movePlayer = () => {
      const speed = 5;
      direction.current.set(0, 0, 0);
      
      if (keys['KeyW']) direction.current.z -= 1;
      if (keys['KeyS']) direction.current.z += 1;
      if (keys['KeyA']) direction.current.x -= 1;
      if (keys['KeyD']) direction.current.x += 1;
      
      if (direction.current.length() > 0) {
        direction.current.normalize();
        camera.getWorldDirection(direction.current);
        direction.current.y = 0;
        direction.current.normalize();
        
        velocity.current.x = direction.current.x * speed;
        velocity.current.z = direction.current.z * speed;
      } else {
        velocity.current.x *= 0.8;
        velocity.current.z *= 0.8;
      }
      
      requestAnimationFrame(movePlayer);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    movePlayer();
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [camera]);

  return <PlayerHands gameState={gameState} isBreaking={isBreaking} isPlacing={isPlacing} />;
};

// Game UI Component
export const GameUI = ({ gameState, showStats, setShowStats }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none z-20"
    >
      {/* Top HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        {/* Left side - Game info */}
        <div className="bg-black/50 rounded-lg p-3 text-white text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              {gameState.isDay ? <Sun size={16} /> : <Moon size={16} />}
              <span>{gameState.isDay ? 'Day' : 'Night'}</span>
            </div>
            <div>Mode: {gameState.gameMode}</div>
            <div>Blocks: {gameState.playerStats.blocksPlaced}</div>
          </div>
        </div>

        {/* Right side - Quick actions */}
        <div className="flex space-x-2">
          <button
            onClick={() => gameState.setShowSettings(true)}
            className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Bottom HUD - Hotbar */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
        <div className="bg-black/70 rounded-lg p-2">
          <div className="flex space-x-1">
            {Object.entries(BLOCK_TYPES).slice(0, 9).map(([type, config], index) => (
              <button
                key={type}
                onClick={() => gameState.setSelectedBlock(type)}
                className={`w-12 h-12 rounded border-2 transition-all ${
                  gameState.selectedBlock === type
                    ? 'border-white bg-white/20'
                    : 'border-gray-500 hover:border-gray-300'
                }`}
                style={{ backgroundColor: config.color + '40' }}
                title={`${config.name} (${gameState.inventory.blocks[type] || 0})`}
              >
                <div
                  className="w-8 h-8 mx-auto rounded"
                  style={{ backgroundColor: config.color }}
                />
                <div className="text-xs text-white text-center mt-1">
                  {gameState.inventory.blocks[type] || 0}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Left side - Quick tools */}
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <div className="bg-black/50 rounded-lg p-2 space-y-2">
          <button
            onClick={() => gameState.setShowInventory(true)}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center transition-colors"
            title="Inventory (E)"
          >
            <Package size={20} />
          </button>
          <button
            onClick={() => gameState.setShowCrafting(true)}
            className="w-10 h-10 bg-blue-700 hover:bg-blue-600 text-white rounded flex items-center justify-center transition-colors"
            title="Crafting (C)"
          >
            <Hammer size={20} />
          </button>
          <button
            onClick={() => gameState.setShowMagic(true)}
            className="w-10 h-10 bg-purple-700 hover:bg-purple-600 text-white rounded flex items-center justify-center transition-colors"
            title="Magic (M)"
          >
            <Wand2 size={20} />
          </button>
          <button
            onClick={() => gameState.setShowBuildingTools(true)}
            className="w-10 h-10 bg-green-700 hover:bg-green-600 text-white rounded flex items-center justify-center transition-colors"
            title="Building Tools (B)"
          >
            <Grid3X3 size={20} />
          </button>
        </div>
      </div>

      {/* Player health and stats */}
      <div className="absolute bottom-20 left-4 pointer-events-auto">
        <div className="bg-black/50 rounded-lg p-3 text-white text-sm">
          <div className="flex items-center space-x-2 mb-2">
            <Heart className="text-red-500" size={16} />
            <div className="flex space-x-1">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="w-2 h-2 bg-red-500 rounded" />
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Zap className="text-yellow-500" size={16} />
            <div className="flex space-x-1">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="w-2 h-2 bg-yellow-500 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Inventory Component
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