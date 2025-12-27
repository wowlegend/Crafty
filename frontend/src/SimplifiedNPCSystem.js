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
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshLambertMaterial {...materialProps} />
      </mesh>
      {/* Health Bar if needed */}
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
    for(let i=0; i<15; i++) {
        const x = Math.random() * 40 - 20;
        const z = Math.random() * 40 - 20;
        let y = window.getMobGroundLevel(x, z);
        if (isNaN(y)) y = 15;

        mobs.push({
            id: i,
            type: 'pig',
            position: [x, y + 1, z],
            color: '#ffc0cb',
            health: 100
        });
    }
    setEntities(mobs);
    entitiesRef.current = mobs;
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
