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

// Enhanced World with Environment
export const MinecraftWorld = ({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const { camera } = useThree();

  // Generate simple flat world with more variety
  useEffect(() => {
    const initialBlocks = new Map();
    const size = 10; // Larger world for better exploration
    
    // Create varied terrain
    for (let x = -size; x <= size; x++) {
      for (let z = -size; z <= size; z++) {
        const key = `${x},0,${z}`;
        // Vary grass and dirt blocks
        const blockType = Math.random() < 0.8 ? 'grass' : 'dirt';
        initialBlocks.set(key, { 
          position: [x, 0, z], 
          type: blockType 
        });
      }
    }
    
    // Add some interesting starter structures
    initialBlocks.set('0,1,0', { position: [0, 1, 0], type: 'dirt' });
    initialBlocks.set('1,1,0', { position: [1, 1, 0], type: 'stone' });
    initialBlocks.set('-1,1,0', { position: [-1, 1, 0], type: 'wood' });
    initialBlocks.set('0,1,1', { position: [0, 1, 1], type: 'glass' });
    initialBlocks.set('0,2,0', { position: [0, 2, 0], type: 'diamond' });
    
    // Create a small house structure
    for (let i = 3; i <= 5; i++) {
      for (let j = 3; j <= 5; j++) {
        if (i === 3 || i === 5 || j === 3 || j === 5) {
          initialBlocks.set(`${i},1,${j}`, { position: [i, 1, j], type: 'wood' });
          if ((i === 3 || i === 5) && (j === 3 || j === 5)) {
            initialBlocks.set(`${i},2,${j}`, { position: [i, 2, j], type: 'wood' });
          }
        }
      }
    }
    
    setBlocks(initialBlocks);
    console.log('🌍 Enhanced world generated with', initialBlocks.size, 'blocks');
  }, []);

  // Better block placement with sound feedback
  const placeBlock = () => {
    if (!gameState.selectedBlock) {
      console.log('❌ No block selected');
      return;
    }
    
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const newPos = camera.position.clone()
      .add(direction.multiplyScalar(2));
    
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
      
      gameState.setPlayerStats(prev => ({
        ...prev,
        blocksPlaced: prev.blocksPlaced + 1
      }));
      
      console.log('✅ Placed', gameState.selectedBlock, 'block at', gridPos.x, gridPos.y, gridPos.z);
    } else {
      console.log('❌ Block already exists at that position');
    }
  };

  const breakBlock = () => {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const targetPos = camera.position.clone()
      .add(direction.multiplyScalar(2.5));
    
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
      gameState.setPlayerStats(prev => ({
        ...prev,
        blocksDestroyed: prev.blocksDestroyed + 1
      }));
      
      console.log('💥 Broke', block.type, 'block at', gridPos.x, gridPos.y, gridPos.z);
    } else {
      console.log('❌ No block to break at that position');
    }
  };

  // Handle mouse clicks
  useEffect(() => {
    const handleClick = (event) => {
      if (event.button === 0) { 
        breakBlock();
      } else if (event.button === 2) { 
        event.preventDefault();
        placeBlock();
      }
    };

    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [gameState.selectedBlock, blocks]);

  return (
    <group>
      {/* Environmental elements */}
      <MinecraftClouds />
      <EnvironmentalParticles />
      
      {/* Render all blocks with better materials */}
      {Array.from(blocks.values()).map((block) => {
        const blockConfig = BLOCK_TYPES[block.type] || BLOCK_TYPES.grass;
        return (
          <mesh 
            key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`}
            position={block.position}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshLambertMaterial 
              color={blockConfig.color}
              transparent={blockConfig.transparent || false}
              opacity={blockConfig.transparent ? 0.8 : 1}
              emissive={blockConfig.emissive ? blockConfig.color : '#000000'}
              emissiveIntensity={blockConfig.emissive ? 0.1 : 0}
            />
          </mesh>
        );
      })}
      
      {/* Enhanced ground plane with texture-like effect */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshLambertMaterial color="#22c55e" />
      </mesh>
      
      {/* Add some grass patches */}
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh 
          key={`grass-${i}`}
          position={[
            (Math.random() - 0.5) * 40,
            0.1,
            (Math.random() - 0.5) * 40
          ]}
          rotation={[0, Math.random() * Math.PI * 2, 0]}
        >
          <planeGeometry args={[0.3, 0.5]} />
          <meshLambertMaterial 
            color="#2d5a0d" 
            transparent 
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// Simplified Both Hands Component - Stable positioning
const BothHands = ({ selectedBlock, isSwinging = false }) => {
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  
  useFrame(({ camera, clock }) => {
    const time = clock.getElapsedTime();
    
    if (rightHandRef.current && camera) {
      // Fixed position relative to camera - more stable
      rightHandRef.current.position.copy(camera.position);
      rightHandRef.current.position.add(new THREE.Vector3(0.3, -0.2, -0.5));
      rightHandRef.current.rotation.copy(camera.rotation);
      
      // Gentle swing animation
      if (isSwinging) {
        rightHandRef.current.rotation.x += Math.sin(time * 10) * 0.1;
      }
    }
    
    if (leftHandRef.current && camera) {
      // Fixed position relative to camera - more stable
      leftHandRef.current.position.copy(camera.position);
      leftHandRef.current.position.add(new THREE.Vector3(-0.3, -0.2, -0.5));
      leftHandRef.current.rotation.copy(camera.rotation);
    }
  });

  const selectedBlockConfig = BLOCK_TYPES[selectedBlock] || BLOCK_TYPES.grass;

  return (
    <group>
      {/* Right Hand with Tool */}
      <group ref={rightHandRef}>
        {/* Right arm */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Right hand */}
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[0.05, 0.06, 0.04]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Tool/Block in right hand */}
        {selectedBlock && (
          <mesh position={[0.04, -0.03, -0.06]}>
            <boxGeometry args={[0.03, 0.03, 0.03]} />
            <meshLambertMaterial 
              color={selectedBlockConfig.color}
              transparent={selectedBlockConfig.transparent || false}
              opacity={selectedBlockConfig.transparent ? 0.8 : 1}
            />
          </mesh>
        )}
      </group>
      
      {/* Left Hand */}
      <group ref={leftHandRef}>
        {/* Left arm */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
        
        {/* Left hand */}
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[0.05, 0.06, 0.04]} />
          <meshLambertMaterial color="#fdbcb4" />
        </mesh>
      </group>
    </group>
  );
};

// Simplified Clouds Component - No complex animations
const MinecraftClouds = () => {
  // Static clouds to avoid runtime errors
  const cloudPositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 8; i++) {
      positions.push({
        x: (i - 4) * 15,
        y: 20,
        z: -30 + (i % 2) * 10,
        scale: 1 + (i % 3) * 0.5
      });
    }
    return positions;
  }, []);
  
  return (
    <group>
      {cloudPositions.map((cloud, index) => (
        <mesh 
          key={index} 
          position={[cloud.x, cloud.y, cloud.z]}
          scale={[cloud.scale, 0.3, cloud.scale]}
        >
          <boxGeometry args={[3, 1, 3]} />
          <meshLambertMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.8} 
          />
        </mesh>
      ))}
    </group>
  );
};

// Simplified Particles - Static for stability
const EnvironmentalParticles = () => {
  const particlePositions = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 20; i++) {
      positions.push({
        x: (Math.random() - 0.5) * 30,
        y: 0.2 + Math.random() * 2,
        z: (Math.random() - 0.5) * 30
      });
    }
    return positions;
  }, []);
  
  return (
    <group>
      {particlePositions.map((pos, index) => (
        <mesh 
          key={index}
          position={[pos.x, pos.y, pos.z]}
          scale={[0.1, 0.1, 0.1]}
        >
          <sphereGeometry args={[1, 4, 4]} />
          <meshLambertMaterial 
            color="#22c55e" 
            transparent 
            opacity={0.6} 
          />
        </mesh>
      ))}
    </group>
  );
};

// Simplified Sky Component - Basic and stable
const MinecraftSky = ({ isDay }) => {
  const skyColor = isDay ? '#87CEEB' : '#191970';
  
  return (
    <group>
      {/* Simple sky sphere */}
      <mesh scale={[150, 150, 150]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={skyColor}
          side={THREE.BackSide}
        />
      </mesh>
      
      {/* Simple sun */}
      {isDay && (
        <mesh position={[0, 25, -40]}>
          <sphereGeometry args={[2, 8, 8]} />
          <meshBasicMaterial 
            color="#FFD700" 
            emissive="#FFD700"
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      
      {/* Simple moon */}
      {!isDay && (
        <mesh position={[0, 25, -40]}>
          <sphereGeometry args={[1.5, 8, 8]} />
          <meshBasicMaterial 
            color="#F5F5DC" 
            emissive="#F5F5DC"
            emissiveIntensity={0.2}
          />
        </mesh>
      )}
    </group>
  );
};

// Enhanced Player with Both Hands
export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isSwinging, setIsSwinging] = useState(false);
  
  // Set initial camera position
  useEffect(() => {
    camera.position.set(0, 2, 5);
    console.log('🎮 Player initialized at position:', camera.position);
  }, [camera]);

  useFrame((state, delta) => {
    // FIXED MOVEMENT - Corrected directions
    const speed = 8;
    const moveVector = new THREE.Vector3();
    
    // Get camera direction
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // Get right vector
    const right = new THREE.Vector3();
    right.crossVectors(direction, camera.up).normalize();
    
    // Apply movement based on keys - FIXED DIRECTIONS
    if (keys.KeyW) { // Forward
      moveVector.add(direction);
    }
    if (keys.KeyS) { // Backward  
      moveVector.sub(direction);
    }
    if (keys.KeyA) { // Left
      moveVector.sub(right);
    }
    if (keys.KeyD) { // Right
      moveVector.add(right);
    }
    
    // Normalize and apply movement
    if (moveVector.length() > 0) {
      moveVector.normalize();
      moveVector.y = 0; // Don't move up/down with WASD
      camera.position.add(moveVector.multiplyScalar(speed * delta));
    }
    
    // Simple gravity and ground collision
    if (camera.position.y > 1.6) {
      velocity.current.y -= 15 * delta; // Faster gravity
      camera.position.y += velocity.current.y * delta;
    } else {
      camera.position.y = 1.6; // Eye level
      velocity.current.y = 0;
    }
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      setKeys(prev => ({ ...prev, [event.code]: true }));
      
      if (event.code === 'Space') {
        if (camera.position.y <= 1.7) { // Only jump if on ground
          velocity.current.y = 8;
          console.log('🦘 Jump!');
        }
      }
      
      // Number keys for block selection
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
    
    const handleMouseDown = (event) => {
      if (event.button === 0 || event.button === 2) {
        setIsSwinging(true);
        setTimeout(() => setIsSwinging(false), 300);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [camera, gameState]);

  return <BothHands selectedBlock={gameState.selectedBlock} isSwinging={isSwinging} />;
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

// Export new components
export { MinecraftSky, BothHands, MinecraftClouds, EnvironmentalParticles };