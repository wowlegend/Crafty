import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Basic Mob Model Component
const MobModel = ({ type, color, isHit }) => {
  const materialProps = {
    color: isHit ? '#ff0000' : color,
    emissive: isHit ? '#ff0000' : '#000000',
    emissiveIntensity: isHit ? 0.5 : 0
  };

  return (
    <group>
      {/* Body - larger and more visible */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.2, 1, 1.6]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.2, 0.5]}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 1.0, 1.0]}>
        <boxGeometry args={[0.4, 0.3, 0.3]} />
        <meshLambertMaterial color="#ffaaaa" />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.35, -0.2, 0.4]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      <mesh position={[0.35, -0.2, 0.4]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      <mesh position={[-0.35, -0.2, -0.4]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      <mesh position={[0.35, -0.2, -0.4]}>
        <boxGeometry args={[0.3, 0.6, 0.3]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
    </group>
  );
};

// NPC System
export const NPCSystem = ({ gameState }) => {
  const [entities, setEntities] = useState([]);
  const { camera } = useThree();
  const [terrainReady, setTerrainReady] = useState(false);
  const entitiesRef = useRef([]);

  // Wait for terrain to be ready
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (window.getMobGroundLevel && window.getGeneratedChunks && window.getGeneratedChunks().size > 0) {
        console.log('✅ TERRAIN SYSTEM READY - Mob spawning enabled');
        setTerrainReady(true);
        clearInterval(checkInterval);
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, []);

  // Initial mob spawning
  useEffect(() => {
    if (!terrainReady || !camera) return;
    
    const mobs = [];
    // Spawn mobs closer to player (within 30 units) for visibility
    for(let i=0; i<15; i++) {
        // Spawn in a ring around the player, not too close, not too far
        const angle = (i / 15) * Math.PI * 2;
        const distance = 8 + Math.random() * 15; // 8-23 units away
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        let y = window.getMobGroundLevel(x, z);
        if (isNaN(y)) y = 15;

        mobs.push({
            id: i,
            type: 'pig',
            position: [x, y + 0.5, z], // Slightly above ground
            color: '#ffc0cb',
            health: 100
        });
        console.log(`🐷 Spawned pig ${i} at (${x.toFixed(1)}, ${(y+0.5).toFixed(1)}, ${z.toFixed(1)})`);
    }
    setEntities(mobs);
    entitiesRef.current = mobs;
    console.log(`✅ Spawned ${mobs.length} mobs`);
  }, [terrainReady, camera]);

  // COMBAT LOGIC
  const attackEntity = (id, damage = 25) => {
      setEntities(prev => {
          const next = prev.map(e => {
              if (e.id === id) {
                  return { ...e, health: e.health - damage, lastHit: Date.now() };
              }
              return e;
          }).filter(e => e.health > 0);
          
          entitiesRef.current = next;
          return next;
      });
  };

  useEffect(() => {
      window.attackEntity = attackEntity;
      
      // Simple collision check for spells
      window.checkMobCollision = (pos, range = 3) => {
          return entitiesRef.current.find(e => {
              const dx = e.position[0] - pos.x;
              const dy = e.position[1] - pos.y;
              const dz = e.position[2] - pos.z;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              return dist < range;
          });
      };
  }, []);

  return (
    <group>
      {entities.map(entity => (
          <group key={entity.id} position={entity.position} onClick={(e) => { e.stopPropagation(); attackEntity(entity.id); }}>
            <MobModel type={entity.type} color={entity.color} isHit={entity.lastHit && Date.now() - entity.lastHit < 300} />
          </group>
      ))}
    </group>
  );
};

export const CombatInstructions = () => (
    <div className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded">
        Shift+Click to Attack or Press F
    </div>
);

export const TradingInterface = ({ onClose }) => (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-white" onClick={onClose}>
        Trading (Click to close)
    </div>
);
