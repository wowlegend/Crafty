import React, { useRef, useEffect, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
  Hammer,
  Sword,
  Star
} from 'lucide-react';

// Import optimized systems
import { useSimpleExperience } from './SimpleExperienceSystem';
import { EnhancedMagicSystem, MagicWand } from './EnhancedMagicSystem';
import { OptimizedGrassSystem } from './OptimizedGrassSystem';

// BLOCK TYPES - Immutable configuration
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

const BLOCK_TYPE_KEYS = Object.keys(BLOCK_TYPES);
const HOTBAR_BLOCKS = BLOCK_TYPE_KEYS.slice(0, 9);

// --- INSTANCED RENDERING COMPONENT ---
// This is the key to fixing lag. One draw call per block type.
const InstancedBlockLayer = React.memo(({ type, instances }) => {
  const meshRef = useRef();
  const count = instances.length;
  const config = BLOCK_TYPES[type];

  // Dummy object for calculating matrices
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current || count === 0) return;

    // Update matrices for all instances
    instances.forEach((instance, i) => {
      dummy.position.set(instance.position[0], instance.position[1], instance.position[2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [instances, count, dummy]);

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial 
        color={config?.color || '#ff00ff'} 
        transparent={config?.transparent}
        opacity={config?.transparent ? 0.8 : 1}
      />
    </instancedMesh>
  );
});


// --- TERRAIN GENERATION LOGIC ---
const generateTerrainHeight = (() => {
  const cache = new Map();
  const maxCacheSize = 2000;
  
  return (x, z) => {
    const key = `${Math.floor(x)}_${Math.floor(z)}`;
    if (cache.has(key)) return cache.get(key);
    
    // Simple Perlin-like noise composition
    const noise1 = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2;
    const noise2 = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
    const height = Math.floor(Math.max(12, Math.min(22, noise1 + noise2 + 15)));
    
    if (cache.size >= maxCacheSize) {
      cache.delete(cache.keys().next().value);
    }
    
    cache.set(key, height);
    return height;
  };
})();


// --- MAIN WORLD COMPONENT ---
export const MinecraftWorld = React.memo(({ gameState }) => {
  const { camera } = useThree();
  
  // Logic State (Map for collision/picking)
  const blocksRef = useRef(new Map()); // Key -> { type, position }
  
  // Rendering State (Arrays for InstancedMesh)
  const [instances, setInstances] = useState(() => {
    const initial = {};
    BLOCK_TYPE_KEYS.forEach(key => initial[key] = []);
    return initial;
  });

  const [generatedChunks, setGeneratedChunks] = useState(new Set());
  const generatedChunksRef = useRef(new Set());
  
  const lastPlayerChunk = useRef({ x: 0, z: 0 });
  
  // Constants
  const CHUNK_SIZE = 16;
  const RENDER_DISTANCE = 4; // 4 chunks radius

  // Expose for NPCs
  useEffect(() => {
    window.getGeneratedChunks = () => generatedChunksRef.current;
    
    window.getMobGroundLevel = (x, z) => {
      let terrainHeight = generateTerrainHeight(x, z);
      // Check placed blocks
      const xf = Math.floor(x), zf = Math.floor(z);
      // Scan up from terrain height
      for (let y = terrainHeight + 5; y >= terrainHeight; y--) {
        const key = `${xf},${y},${zf}`;
        if (blocksRef.current.has(key)) return y;
      }
      return terrainHeight;
    };

    window.checkCollision = (x, y, z) => {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      if (blocksRef.current.has(key)) {
         const block = blocksRef.current.get(key);
         return !BLOCK_TYPES[block.type].transparent;
      }
      return false;
    };
    
    window.getHighestBlockAt = generateTerrainHeight;
  }, []);

  // Chunk Generation
  const generateChunk = useCallback((chunkX, chunkZ) => {
    const chunkKey = `${chunkX}_${chunkZ}`;
    if (generatedChunksRef.current.has(chunkKey)) return;

    generatedChunksRef.current.add(chunkKey);

    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;
    
    const newInstances = {}; // Local buffer
    BLOCK_TYPE_KEYS.forEach(k => newInstances[k] = []);

    for (let x = startX; x < startX + CHUNK_SIZE; x++) {
      for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
        const height = generateTerrainHeight(x, z);
        
        // Surface
        const surfaceType = Math.random() < 0.95 ? 'grass' : 'dirt';
        const surfaceKey = `${x},${height},${z}`;
        
        // Add to Refs (Collision)
        blocksRef.current.set(surfaceKey, { position: [x, height, z], type: surfaceType });
        // Add to Instances (Rendering)
        newInstances[surfaceType].push({ position: [x, height, z] });

        // Underground
        for (let y = height - 1; y >= Math.max(height - 3, 10); y--) {
           const type = y === height - 1 ? 'dirt' : 'stone';
           const key = `${x},${y},${z}`;
           blocksRef.current.set(key, { position: [x, y, z], type });
           newInstances[type].push({ position: [x, y, z] });
        }
        
        // Trees (Simple)
        if (surfaceType === 'grass' && Math.random() < 0.005) {
             const treeHeight = 3;
             // Trunk
             for(let i=1; i<=treeHeight; i++) {
                 const ty = height + i;
                 const key = `${x},${ty},${z}`;
                 blocksRef.current.set(key, { position: [x, ty, z], type: 'wood' });
                 newInstances['wood'].push({ position: [x, ty, z] });
             }
             // Leaves
             const ly = height + treeHeight + 1;
             [[0,0], [1,0], [-1,0], [0,1], [0,-1]].forEach(([dx, dz]) => {
                 const lx = x + dx, lz = z + dz;
                 const key = `${lx},${ly},${lz}`;
                 blocksRef.current.set(key, { position: [lx, ly, lz], type: 'grass' }); // Using grass as leaves
                 newInstances['grass'].push({ position: [lx, ly, lz] });
             });
        }
      }
    }

    // Batch update state
    setInstances(prev => {
        const next = { ...prev };
        Object.keys(newInstances).forEach(type => {
            if (newInstances[type].length > 0) {
                next[type] = [...next[type], ...newInstances[type]];
            }
        });
        return next;
    });

  }, []);

  // Update Loop
  useFrame(() => {
    if (!camera) return;
    
    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);
    
    // Only update if changed chunk
    if (cx !== lastPlayerChunk.current.x || cz !== lastPlayerChunk.current.z) {
        lastPlayerChunk.current = { x: cx, z: cz };
        
        // Generate surroundings
        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                generateChunk(cx + x, cz + z);
            }
        }
    }
  });
  
  // Initial Load
  useEffect(() => {
      console.log("Initializing World...");
      for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
        for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
            generateChunk(x, z);
        }
    }
  }, [generateChunk]);


  // Interaction Handler (Raycasting manually)
  useEffect(() => {
    const handleClick = (e) => {
        if (!document.pointerLockElement) return; // Only interact when locked
        
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        const rayStart = camera.position.clone();
        
        // Raycast logic: step forward and check blocksRef
        // Simple approximation: Check 4 units ahead
        const targetPos = rayStart.add(direction.multiplyScalar(4));
        const tx = Math.round(targetPos.x);
        const ty = Math.round(targetPos.y);
        const tz = Math.round(targetPos.z);
        
        if (e.button === 0) { // Left Click - Break
            const key = `${tx},${ty},${tz}`;
            if (blocksRef.current.has(key)) {
                const block = blocksRef.current.get(key);
                blocksRef.current.delete(key);
                setInstances(prev => ({
                    ...prev,
                    [block.type]: prev[block.type].filter(b => 
                        b.position[0] !== tx || b.position[1] !== ty || b.position[2] !== tz
                    )
                }));
                if(window.playHitSound) window.playHitSound();
            }
        } else if (e.button === 2) { // Right Click - Place
            const key = `${tx},${ty},${tz}`;
            if (!blocksRef.current.has(key)) { 
                 const type = gameState.selectedBlock;
                 blocksRef.current.set(key, { position: [tx, ty, tz], type });
                 setInstances(prev => ({
                     ...prev,
                     [type]: [...prev[type], { position: [tx, ty, tz] }]
                 }));
            }
        }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [camera, gameState.selectedBlock]);


  return (
    <group>
        <fog attach="fog" args={['#87CEEB', 20, (RENDER_DISTANCE * CHUNK_SIZE) - 5]} />
        {BLOCK_TYPE_KEYS.map(type => (
            <InstancedBlockLayer key={type} type={type} instances={instances[type]} />
        ))}
        <EnhancedMagicSystem gameState={gameState} playerPosition={camera?.position} />
         <OptimizedGrassSystem 
            chunkX={Math.floor(camera?.position?.x / 16) || 0}
            chunkZ={Math.floor(camera?.position?.z / 16) || 0}
            blockPositions={instances.grass.map(b => [...b.position, 'grass'])}
        />
    </group>
  );
});

// --- UI COMPONENTS (UNCHANGED) ---
export const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-hotbar">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <div
              key={blockType}
              className={`minecraft-hotbar-slot ${isSelected ? 'selected' : ''}`}
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
            >
              <div className="minecraft-block-icon" style={{ backgroundColor: blockConfig.color || '#567C35' }} />
              {quantity > 1 && <div className="minecraft-quantity">{quantity > 999 ? '999+' : quantity}</div>}
              <div className="minecraft-hotkey">{index + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const MinecraftHealthHunger = React.memo(() => {
  const hearts = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  const hunger = useMemo(() => Array(10).fill(null).map((_, i) => i), []);
  return (
    <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <div className="minecraft-status-bars">
        <div className="minecraft-health-bar">
          {hearts.map(i => <div key={`heart-${i}`} className="minecraft-heart"><div className="minecraft-heart-icon">❤</div></div>)}
        </div>
        <div className="minecraft-hunger-bar">
          {hunger.map(i => <div key={`hunger-${i}`} className="minecraft-hunger"><div className="minecraft-hunger-icon">🍖</div></div>)}
        </div>
      </div>
    </div>
  );
});

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

export const MinecraftSky = React.memo(({ isDay = true }) => {
  const { camera } = useThree();
  const skyRef = useRef();
  const sunRef = useRef();
  const moonRef = useRef();
  
  useFrame(() => {
    if (skyRef.current && camera) skyRef.current.position.copy(camera.position);
    if (sunRef.current && camera) {
      sunRef.current.position.set(camera.position.x + (isDay ? 0 : -200), camera.position.y + 50, camera.position.z - 80);
      sunRef.current.visible = isDay;
    }
    if (moonRef.current && camera) {
      moonRef.current.position.set(camera.position.x + (isDay ? 200 : 0), camera.position.y + 50, camera.position.z - 80);
      moonRef.current.visible = !isDay;
    }
  });
  
  return (
    <group>
      <mesh ref={skyRef} scale={[200, 200, 200]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={isDay ? '#87CEEB' : '#2F2F52'} side={THREE.BackSide} />
      </mesh>
      <mesh ref={sunRef}><sphereGeometry args={[3, 8, 8]} /><meshBasicMaterial color="#FFD700" /></mesh>
      <mesh ref={moonRef}><sphereGeometry args={[2.5, 8, 8]} /><meshBasicMaterial color="#F5F5DC" /></mesh>
    </group>
  );
});

export const GameUI = ({ gameState, showStats, setShowStats, playerPosition }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <div className="minecraft-info-panel">
          <div className="flex items-center space-x-4 text-white minecraft-text">
            <div>Mode: <span className="text-green-400">{gameState.gameMode}</span></div>
          </div>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => gameState.setShowSettings(true)} className="minecraft-button"><Settings size={20} /></button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} />
      <MinecraftHealthHunger />
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <div className="minecraft-toolbar">
          <button onClick={() => gameState.setShowInventory(true)} className="minecraft-tool-button"><Package size={20} /></button>
          <button onClick={() => gameState.setShowCrafting(true)} className="minecraft-tool-button"><Hammer size={20} /></button>
          <button onClick={() => gameState.setShowMagic(true)} className="minecraft-tool-button"><Wand2 size={20} /></button>
          <button onClick={() => gameState.setShowBuildingTools(true)} className="minecraft-tool-button"><Grid size={20} /></button>
        </div>
      </div>
    </motion.div>
  );
};


// --- PLAYER & MAGIC (FIXED F-KEY DAMAGE) ---

export const Player = ({ gameState }) => {
  const { camera } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const [keys, setKeys] = useState({});
  const [isAttacking, setIsAttacking] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState('fireball');
  const targetPosition = useRef(new THREE.Vector3(0, 30, 0)); // Start high, let gravity bring us down
  const isInitialized = useRef(false);

  // Expose camera globally for magic system
  useEffect(() => {
    window.gameCamera = camera;
  }, [camera]);

  useEffect(() => {
    const handleKeyDown = (e) => {
        setKeys(prev => ({...prev, [e.code]: true}));
        
        // Spell selection with number keys
        if (e.code === 'Digit1') setSelectedSpell('fireball');
        if (e.code === 'Digit2') setSelectedSpell('iceball');
        if (e.code === 'Digit3') setSelectedSpell('lightning');
        if (e.code === 'Digit4') setSelectedSpell('arcane');
        
        // SPELL CASTING ON 'F' - Cast projectile spell AND melee attack
        if (e.code === 'KeyF') {
            setIsAttacking(true);
            setTimeout(() => setIsAttacking(false), 500);
            if(window.playAttackSounds) window.playAttackSounds();
            
            // Cast spell projectile
            if (window.castSpell) {
                console.log(`🔮 Casting spell: ${selectedSpell}`);
                window.castSpell(selectedSpell);
            }
            
            // ALSO do melee attack for close range
            if (window.checkMobCollision && window.damageMob) {
                const direction = new THREE.Vector3();
                camera.getWorldDirection(direction);
                const checkPos = camera.position.clone().add(direction.multiplyScalar(3)); 
                const mob = window.checkMobCollision(checkPos, 4);
                if (mob) {
                    window.damageMob(mob.id, 25);
                    if(window.playHitSound) window.playHitSound();
                    console.log(`⚔️ Melee hit on ${mob.type}!`);
                }
            }
        }
    };
    const handleKeyUp = (e) => setKeys(prev => ({...prev, [e.code]: false}));
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    }
  }, [selectedSpell, camera]);

  useFrame((state, delta) => {
    // FIXED: Start camera high and let it drop to proper terrain height
    if (!isInitialized.current) {
        // Position camera ABOVE any possible terrain initially
        camera.position.set(0, 30, 0);
        targetPosition.current.set(0, 30, 0);
        // Set initial camera pitch to look slightly up at the horizon
        camera.rotation.x = -0.1; // Look slightly up
        isInitialized.current = true;
        return;
    }

    const speed = 10;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (keys.KeyW) move.add(forward);
    if (keys.KeyS) move.sub(forward);
    if (keys.KeyD) move.add(right);
    if (keys.KeyA) move.sub(right);
    
    if (move.length() > 0) move.normalize().multiplyScalar(speed * delta);
    targetPosition.current.add(move);
    
    // FIXED: Use getHighestBlockAt for more reliable ground detection
    // Default to 15 (middle of terrain range 12-22) if function not ready
    let groundHeight = 15;
    if (window.getHighestBlockAt) {
        const height = window.getHighestBlockAt(targetPosition.current.x, targetPosition.current.z);
        if (typeof height === 'number' && !isNaN(height)) {
            groundHeight = height;
        }
    }
    
    const playerHeight = 1.6;
    const targetGroundY = groundHeight + playerHeight;
    
    // Gravity and ground collision
    if (targetPosition.current.y > targetGroundY + 0.1) {
        // In air - apply gravity
        velocity.current.y -= 20 * delta;
    } else {
        // On ground - stop falling and snap to surface
        velocity.current.y = 0;
        targetPosition.current.y = targetGroundY;
    }
    
    // Jump
    if (keys.Space && Math.abs(targetPosition.current.y - targetGroundY) < 0.2) {
        velocity.current.y = 8;
    }
    
    targetPosition.current.y += velocity.current.y * delta;
    
    // Smooth camera follow
    camera.position.lerp(targetPosition.current, 0.5);
  });

  return (
    <group>
      <StableMagicHands selectedSpell={selectedSpell} selectedBlock={gameState.selectedBlock} isAttacking={isAttacking} />
    </group>
  );
};

// RESTORED Magic Hands with ALL EFFECTS
const StableMagicHands = ({ selectedSpell, selectedBlock, isAttacking }) => {
  const { camera } = useThree();
  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();
  const SPELL_COLORS = { fireball: '#FF4500', iceball: '#00BFFF', lightning: '#FFD700', arcane: '#9932CC' };
  const currentSpellColor = SPELL_COLORS[selectedSpell] || SPELL_COLORS.fireball;

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current && camera) {
      const time = state.clock.elapsedTime;
      const rightPos = new THREE.Vector3(0.6, -0.8, -1.0);
      rightPos.applyMatrix4(camera.matrixWorld);
      rightHandRef.current.position.copy(rightPos);
      rightHandRef.current.quaternion.copy(camera.quaternion);
      
      if (!isAttacking) {
        rightHandRef.current.position.y += Math.sin(time * 0.8) * 0.008; 
        rightHandRef.current.rotation.z = Math.sin(time * 0.5) * 0.012; 
      }
      
      const leftPos = new THREE.Vector3(-0.4, -0.7, -0.9);
      leftPos.applyMatrix4(camera.matrixWorld);
      leftHandRef.current.position.copy(leftPos);
      leftHandRef.current.quaternion.copy(camera.quaternion);
      
      if (!isAttacking) {
        leftHandRef.current.position.y += Math.sin(time * 0.8 + 0.5) * 0.006; 
        leftHandRef.current.rotation.z = Math.sin(time * 0.5 + 0.5) * 0.008; 
      }
      
      if (isAttacking) {
        const attackTime = time * 6; 
        rightHandRef.current.rotation.x = Math.sin(attackTime) * 0.12; 
        rightHandRef.current.position.z += Math.sin(attackTime) * 0.02; 
        leftHandRef.current.rotation.x = Math.sin(attackTime + 1) * 0.08; 
        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.06; 
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.02; 
        }
      } else {
        rightHandRef.current.rotation.x = 0;
        leftHandRef.current.rotation.x = 0;
        if (wandRef.current) {
          wandRef.current.rotation.x = 0.1; 
          wandRef.current.position.y = 0.4; 
        }
      }
      
      if (magicAuraRef.current) {
        const intensity = isAttacking ? 1.08 + Math.sin(time * 2) * 0.03 : 0.98 + Math.sin(time * 0.8) * 0.015;
        magicAuraRef.current.scale.setScalar(intensity);
        magicAuraRef.current.material.opacity = isAttacking ? 0.45 : 0.12; 
      }
    }
  });

  return (
    <group>
      <group ref={rightHandRef}>        
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <mesh position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}><MagicWand wandType={selectedSpell} /></group>
        {isAttacking && (
          <mesh ref={magicAuraRef} position={[0, 0, 0]}>
            <sphereGeometry args={[0.32, 8, 8]} />
            <meshBasicMaterial color={currentSpellColor} transparent opacity={0.4} />
          </mesh>
        )}
        {isAttacking && <SpellHandEffects spellType={selectedSpell} />}
      </group>
      <group ref={leftHandRef}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        <mesh position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshLambertMaterial color="#fdbcb4" /></mesh>
        {isAttacking && (
          <group>
            <mesh position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={currentSpellColor} transparent opacity={0.85} />
            </mesh>
            <SpellLeftHandEffects spellType={selectedSpell} />
          </group>
        )}
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

const SpellHandEffects = ({ spellType }) => {
  const effectRef = useRef();
  useFrame((state) => {
    if (effectRef.current) {
      const time = state.clock.elapsedTime;
      if(spellType === 'fireball') {
          effectRef.current.rotation.y += 0.04;
          effectRef.current.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
      }
    }
  });
  if (spellType === 'fireball') return <mesh ref={effectRef} position={[0.1, 0.2, 0]}><coneGeometry args={[0.07, 0.22, 6]} /><meshBasicMaterial color="#FF4500" transparent opacity={0.55} /></mesh>;
  return null;
};

const SpellLeftHandEffects = ({ spellType }) => {
  return null; 
};

export const Inventory = ({ gameState, onClose }) => {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 text-white min-w-[400px] max-w-[600px]" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">📦 Inventory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(gameState.inventory.blocks).map(([type, count]) => {
            const blockConfig = BLOCK_TYPES[type];
            return (
              <div 
                key={type} 
                onClick={() => { gameState.setSelectedBlock(type); onClose(); }} 
                className={`bg-gray-700 p-3 rounded cursor-pointer hover:bg-gray-600 transition-colors border-2 ${
                  gameState.selectedBlock === type ? 'border-yellow-400' : 'border-transparent'
                }`}
                title={blockConfig?.name || type}
              >
                <div 
                  className="w-8 h-8 mx-auto rounded"
                  style={{ backgroundColor: blockConfig?.color || '#888' }}
                />
                <div className="text-xs text-center mt-1 truncate">{type}</div>
                <div className="text-xs text-center text-gray-400">{count}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Press E to close • Click item to select
        </div>
      </div>
    </div>
  );
};

export const CraftingTable = ({ gameState, onClose }) => {
  const recipes = [
    { name: 'Stone Pickaxe', input: { cobblestone: 3, wood: 2 }, output: { pickaxe: 1 } },
    { name: 'Torch', input: { coal: 1, wood: 1 }, output: { torch: 4 } },
    { name: 'Glass', input: { sand: 1 }, output: { glass: 1 } },
  ];

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 text-white min-w-[400px]" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">🔨 Crafting Table</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="space-y-3">
          {recipes.map((recipe, i) => (
            <div key={i} className="bg-gray-700 p-3 rounded flex items-center justify-between">
              <div>
                <div className="font-medium">{recipe.name}</div>
                <div className="text-xs text-gray-400">
                  {Object.entries(recipe.input).map(([item, count]) => `${count}x ${item}`).join(' + ')}
                </div>
              </div>
              <button className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm">
                Craft
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Press C to close
        </div>
      </div>
    </div>
  );
};

export const MagicSystem = ({ gameState, onClose }) => {
  const spells = [
    { name: 'Fireball', key: '1', color: '#FF4500', damage: 50, description: 'Launches a fiery projectile' },
    { name: 'Iceball', key: '2', color: '#00BFFF', damage: 40, description: 'Freezes enemies on impact' },
    { name: 'Lightning', key: '3', color: '#FFD700', damage: 75, description: 'Fast electric strike' },
    { name: 'Arcane', key: '4', color: '#9932CC', damage: 60, description: 'Mystical energy blast' },
  ];

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 text-white min-w-[400px]" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">✨ Magic Spells</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="space-y-3">
          {spells.map((spell, i) => (
            <div key={i} className="bg-gray-700 p-3 rounded flex items-center gap-4">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: spell.color }}
              >
                <span className="text-xl">🔮</span>
              </div>
              <div className="flex-1">
                <div className="font-medium">{spell.name}</div>
                <div className="text-xs text-gray-400">{spell.description}</div>
                <div className="text-xs text-yellow-400">Damage: {spell.damage}</div>
              </div>
              <div className="text-gray-500">
                Press {spell.key}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Press M to close • Click or F to cast selected spell
        </div>
      </div>
    </div>
  );
};

export const BuildingTools = ({ gameState, onClose }) => {
  const tools = [
    { name: 'Single Block', icon: '🧱', description: 'Place one block at a time' },
    { name: 'Wall Builder', icon: '🏗️', description: 'Build walls quickly' },
    { name: 'Floor Builder', icon: '📐', description: 'Create flat surfaces' },
    { name: 'Delete Tool', icon: '🗑️', description: 'Remove blocks' },
  ];

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 text-white min-w-[400px]" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">🏠 Building Tools</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {tools.map((tool, i) => (
            <div key={i} className="bg-gray-700 p-3 rounded cursor-pointer hover:bg-gray-600 transition-colors">
              <div className="text-3xl mb-2">{tool.icon}</div>
              <div className="font-medium">{tool.name}</div>
              <div className="text-xs text-gray-400">{tool.description}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-400">
          Press B to close • Left click to place, Right click to remove
        </div>
      </div>
    </div>
  );
};

export const SettingsPanel = ({ gameState, onClose, showStats, setShowStats }) => {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 text-white min-w-[350px]" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">⚙️ Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Show Stats (F3)</span>
            <button 
              onClick={() => setShowStats(!showStats)}
              className={`px-4 py-1 rounded ${showStats ? 'bg-green-600' : 'bg-gray-600'}`}
            >
              {showStats ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>Game Mode</span>
            <button 
              onClick={() => gameState.setGameMode(gameState.gameMode === 'creative' ? 'survival' : 'creative')}
              className="px-4 py-1 rounded bg-purple-600 hover:bg-purple-500"
            >
              {gameState.gameMode}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>Time</span>
            <button 
              onClick={() => gameState.setIsDay(!gameState.isDay)}
              className="px-4 py-1 rounded bg-blue-600 hover:bg-blue-500"
            >
              {gameState.isDay ? '☀️ Day' : '🌙 Night'}
            </button>
          </div>
          <hr className="border-gray-600" />
          <button 
            onClick={onClose}
            className="w-full bg-green-600 hover:bg-green-500 py-2 rounded font-medium"
          >
            Resume Game
          </button>
        </div>
        <div className="mt-4 text-sm text-gray-400 text-center">
          Press ESC to close
        </div>
      </div>
    </div>
  );
};
