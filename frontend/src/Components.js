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
  grass: { color: '#7C9F3A', name: 'Grass Block', texture: 'grass' },
  dirt: { color: '#8E7748', name: 'Dirt', texture: 'dirt' },
  stone: { color: '#707070', name: 'Stone', texture: 'stone' },
  wood: { color: '#9F7A3F', name: 'Oak Wood', texture: 'wood' },
  glass: { color: '#E6F3FF', name: 'Glass', texture: 'glass', transparent: true },
  water: { color: '#3F76E4', name: 'Water', texture: 'water', transparent: true },
  lava: { color: '#FF6A00', name: 'Lava', texture: 'lava', emissive: true },
  diamond: { color: '#5DCFE0', name: 'Diamond Ore', texture: 'diamond', emissive: true },
  gold: { color: '#FCEE4B', name: 'Gold Ore', texture: 'gold' },
  iron: { color: '#D8AF93', name: 'Iron Ore', texture: 'iron' },
  coal: { color: '#383838', name: 'Coal Ore', texture: 'coal' },
  sand: { color: '#DBD3A0', name: 'Sand', texture: 'sand' },
  cobblestone: { color: '#7F7F7F', name: 'Cobblestone', texture: 'cobblestone' }
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

// RESTORED - Full World with Block Placement
export const MinecraftWorld = ({ gameState }) => {
  const [blocks, setBlocks] = useState(new Map());
  const { camera } = useThree();

  // Generate simple world with building capability
  useEffect(() => {
    const initialBlocks = new Map();
    const size = 8;
    
    // Create flat terrain
    for (let x = -size; x <= size; x++) {
      for (let z = -size; z <= size; z++) {
        const key = `${x},0,${z}`;
        const blockType = (x + z) % 4 === 0 ? 'dirt' : 'grass';
        initialBlocks.set(key, { 
          position: [x, 0, z], 
          type: blockType 
        });
      }
    }
    
    // Add some test blocks
    initialBlocks.set('0,1,0', { position: [0, 1, 0], type: 'dirt' });
    initialBlocks.set('1,1,0', { position: [1, 1, 0], type: 'stone' });
    initialBlocks.set('-1,1,0', { position: [-1, 1, 0], type: 'wood' });
    initialBlocks.set('0,1,1', { position: [0, 1, 1], type: 'glass' });
    initialBlocks.set('0,2,0', { position: [0, 2, 0], type: 'diamond' });
    
    setBlocks(initialBlocks);
    console.log('🌍 World generated with building capability');
  }, []);

  // RESTORED - Block placement functionality
  const placeBlock = () => {
    if (!gameState.selectedBlock) {
      console.log('❌ No block selected for placement');
      return;
    }
    
    if (gameState.inventory.blocks[gameState.selectedBlock] <= 0) {
      console.log('❌ No blocks of this type in inventory');
      return;
    }
    
    try {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const newPos = camera.position.clone()
        .add(direction.multiplyScalar(3)); // Place 3 units in front
      
      const gridPos = {
        x: Math.round(newPos.x),
        y: Math.max(1, Math.round(newPos.y)), // At least 1 block high
        z: Math.round(newPos.z)
      };
      
      const key = `${gridPos.x},${gridPos.y},${gridPos.z}`;
      
      if (!blocks.has(key)) {
        setBlocks(prev => new Map(prev).set(key, {
          position: [gridPos.x, gridPos.y, gridPos.z],
          type: gameState.selectedBlock
        }));
        
        // Remove from inventory (except in creative mode)
        if (gameState.gameMode !== 'creative') {
          gameState.removeFromInventory(gameState.selectedBlock, 1);
        }
        
        // Update stats
        gameState.setPlayerStats(prev => ({
          ...prev,
          blocksPlaced: prev.blocksPlaced + 1
        }));
        
        console.log('✅ Placed', gameState.selectedBlock, 'block at', gridPos.x, gridPos.y, gridPos.z);
      } else {
        console.log('❌ Block already exists at that position');
      }
    } catch (error) {
      console.error('❌ Error placing block:', error.message);
    }
  };

  // RESTORED - Block breaking functionality
  const breakBlock = () => {
    try {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      const targetPos = camera.position.clone()
        .add(direction.multiplyScalar(3)); // Target 3 units in front
      
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
        
        // Add to inventory
        gameState.addToInventory(block.type, 1);
        
        // Update stats
        gameState.setPlayerStats(prev => ({
          ...prev,
          blocksDestroyed: prev.blocksDestroyed + 1
        }));
        
        console.log('💥 Broke', block.type, 'block at', gridPos.x, gridPos.y, gridPos.z);
      } else {
        console.log('❌ No block to break at that position');
      }
    } catch (error) {
      console.error('❌ Error breaking block:', error.message);
    }
  };

  // RESTORED - Mouse click handlers
  useEffect(() => {
    const handleClick = (event) => {
      try {
        if (event.button === 0) { // Left click - break blocks
          event.preventDefault();
          breakBlock();
        } else if (event.button === 2) { // Right click - place blocks
          event.preventDefault();
          placeBlock();
        }
      } catch (error) {
        console.error('❌ Error in click handler:', error.message);
      }
    };

    const handleContextMenu = (event) => {
      event.preventDefault(); // Prevent browser context menu
    };

    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gameState.selectedBlock, blocks, gameState.inventory]);

  return (
    <group>
      {/* Environment components */}
      <MinecraftClouds />
      <EnvironmentalParticles />
      
      {/* Render all blocks with basic materials (no complex properties) */}
      {Array.from(blocks.values()).map((block) => {
        const blockConfig = BLOCK_TYPES[block.type] || BLOCK_TYPES.grass;
        return (
          <mesh 
            key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`}
            position={block.position}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={blockConfig.color} />
          </mesh>
        );
      })}
      
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  );
};

// FULL FEATURED VERSION - With comprehensive error logging
const BothHands = ({ selectedBlock, isSwinging = false }) => {
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  
  useFrame(({ camera, clock }) => {
    try {
      // Add detailed error tracking
      if (!camera) {
        console.error("BothHands: Camera is undefined");
        return;
      }
      if (!camera.position) {
        console.error("BothHands: Camera.position is undefined");
        return;
      }
      if (!camera.rotation) {
        console.error("BothHands: Camera.rotation is undefined");
        return;
      }
      if (!camera.quaternion) {
        console.error("BothHands: Camera.quaternion is undefined");
        return;
      }
      
      const time = clock?.getElapsedTime?.() || 0;
      
      // Right hand with detailed error checking
      if (rightHandRef.current) {
        const cameraPos = camera.position.clone();
        const cameraQuat = camera.quaternion.clone();
        const rightHandLocalPos = new THREE.Vector3(0.3, -0.2, -0.6);
        
        rightHandLocalPos.applyQuaternion(cameraQuat);
        rightHandLocalPos.add(cameraPos);
        
        rightHandRef.current.position.copy(rightHandLocalPos);
        rightHandRef.current.rotation.copy(camera.rotation);
        
        if (isSwinging && typeof time === 'number') {
          rightHandRef.current.rotation.x += Math.sin(time * 8) * 0.1;
        }
      }
      
      // Left hand
      if (leftHandRef.current) {
        const cameraPos = camera.position.clone();
        const cameraQuat = camera.quaternion.clone();
        const leftHandLocalPos = new THREE.Vector3(-0.3, -0.2, -0.6);
        
        leftHandLocalPos.applyQuaternion(cameraQuat);
        leftHandLocalPos.add(cameraPos);
        
        leftHandRef.current.position.copy(leftHandLocalPos);
        leftHandRef.current.rotation.copy(camera.rotation);
      }
    } catch (error) {
      console.error("BothHands useFrame error:", error.message, error.stack);
    }
  });

  const selectedBlockConfig = BLOCK_TYPES[selectedBlock] || BLOCK_TYPES.grass;

  return (
    <group>
      <group ref={rightHandRef}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.06, 0.18, 0.06]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.05, 0.08, 0.04]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        {selectedBlock && (
          <mesh position={[0.05, -0.05, -0.08]}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
            <meshBasicMaterial color={selectedBlockConfig.color} />
          </mesh>
        )}
      </group>
      
      <group ref={leftHandRef}>
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.06, 0.18, 0.06]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
        
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.05, 0.08, 0.04]} />
          <meshBasicMaterial color="#fdbcb4" />
        </mesh>
      </group>
    </group>
  );
};

// Enhanced Clouds - With Error Handling
const MinecraftClouds = () => {
  const cloudsRef = useRef();
  
  // Generate cloud positions safely
  const cloudPositions = useMemo(() => {
    try {
      const positions = [];
      for (let i = 0; i < 6; i++) {
        positions.push({
          x: (i - 3) * 12 + (Math.random() - 0.5) * 5,
          y: 15 + Math.random() * 3,
          z: -25 + (Math.random() - 0.5) * 10,
          scale: 0.8 + Math.random() * 0.6
        });
      }
      return positions;
    } catch (error) {
      console.warn("Cloud generation error:", error);
      return []; // Return empty array if error
    }
  }, []);
  
  // Safe cloud movement
  useFrame((state) => {
    if (cloudsRef.current && state?.clock?.getElapsedTime) {
      try {
        const time = state.clock.getElapsedTime();
        // Very slow cloud movement
        cloudsRef.current.position.x = Math.sin(time * 0.02) * 2;
      } catch (error) {
        console.warn("Cloud animation error:", error.message);
      }
    }
  });
  
  return (
    <group ref={cloudsRef}>
      {cloudPositions.map((cloud, index) => (
        <mesh 
          key={index} 
          position={[cloud.x, cloud.y, cloud.z]}
          scale={[cloud.scale * 2, cloud.scale * 0.4, cloud.scale * 2]}
        >
          <boxGeometry args={[2.5, 1, 2.5]} />
          <meshLambertMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.85} 
          />
        </mesh>
      ))}
    </group>
  );
};

// Enhanced Particles - With Error Handling
const EnvironmentalParticles = () => {
  const particlesRef = useRef();
  
  // Generate particle positions safely
  const particlePositions = useMemo(() => {
    try {
      const positions = [];
      for (let i = 0; i < 12; i++) {
        positions.push({
          x: (Math.random() - 0.5) * 25,
          y: 0.1 + Math.random() * 1.5,
          z: (Math.random() - 0.5) * 25,
          initialY: 0.1 + Math.random() * 1.5
        });
      }
      return positions;
    } catch (error) {
      console.warn("Particle generation error:", error);
      return [];
    }
  }, []);
  
  // Safe particle animation
  useFrame((state) => {
    if (particlesRef.current?.children && state?.clock?.getElapsedTime) {
      try {
        const time = state.clock.getElapsedTime();
        particlesRef.current.children.forEach((particle, i) => {
          if (particle && particlePositions[i]) {
            const originalY = particlePositions[i].initialY;
            particle.position.y = originalY + Math.sin(time * 0.5 + i) * 0.1;
          }
        });
      } catch (error) {
        console.warn("Particle animation error:", error.message);
      }
    }
  });
  
  return (
    <group ref={particlesRef}>
      {particlePositions.map((pos, index) => (
        <mesh 
          key={index}
          position={[pos.x, pos.y, pos.z]}
          scale={[0.08, 0.08, 0.08]}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial 
            color="#22c55e" 
            transparent 
            opacity={0.7} 
          />
        </mesh>
      ))}
    </group>
  );
};

// Simplified Sky Component - Basic and stable
// FULL FEATURED Sky Component - With comprehensive error logging
const MinecraftSky = ({ isDay = true }) => {
  const skyRef = useRef();
  
  useFrame((state) => {
    try {
      if (!skyRef.current) {
        console.warn("MinecraftSky: skyRef.current is undefined");
        return;
      }
      if (!state) {
        console.error("MinecraftSky: state is undefined");
        return;
      }
      if (!state.clock) {
        console.error("MinecraftSky: state.clock is undefined");
        return;
      }
      if (typeof state.clock.getElapsedTime !== 'function') {
        console.error("MinecraftSky: state.clock.getElapsedTime is not a function");
        return;
      }
      
      const time = state.clock.getElapsedTime();
      if (typeof time !== 'number') {
        console.error("MinecraftSky: time is not a number:", time);
        return;
      }
      
      skyRef.current.rotation.y = time * 0.001;
    } catch (error) {
      console.error("MinecraftSky useFrame error:", error.message, error.stack);
    }
  });
  
  const skyColor = isDay ? '#87CEEB' : '#191970';
  const sunColor = isDay ? '#FFD700' : '#F5F5DC';
  const celestialPosition = [0, 20, -35];
  
  return (
    <group ref={skyRef}>
      <mesh scale={[120, 120, 120]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial 
          color={skyColor}
          side={THREE.BackSide}
        />
      </mesh>
      
      <mesh position={celestialPosition}>
        <sphereGeometry args={[1.8, 12, 12]} />
        <meshBasicMaterial 
          color={sunColor}
        />
      </mesh>
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