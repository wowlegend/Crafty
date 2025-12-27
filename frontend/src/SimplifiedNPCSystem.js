import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Basic Mob Model Component
const MobModel = ({ type, color, isHit }) => {
  const isAnimal = ['pig', 'cow', 'sheep', 'chicken'].includes(type);
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
      // Robust check: Ensure functions exist AND chunks are actually generated
      if (window.getMobGroundLevel && window.getGeneratedChunks && window.getGeneratedChunks().size > 0) {
        console.log('✅ TERRAIN SYSTEM READY - Mob spawning enabled');
        setTerrainReady(true);
        clearInterval(checkInterval);
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, []);

  // Mob configuration
  const getMobConfig = (type) => ({ health: 20, color: '#ff0000' });

  // Initial mob spawning when terrain is ready
  useEffect(() => {
    if (!terrainReady || !camera) return;
    
    // Spawn a few test mobs
    const mobs = [];
    for(let i=0; i<10; i++) {
        const x = Math.random() * 20 - 10;
        const z = Math.random() * 20 - 10;
        let y = window.getMobGroundLevel(x, z);
        
        // Safety check
        if (isNaN(y)) y = 15;

        mobs.push({
            id: i,
            type: 'pig',
            position: [x, y + 1, z],
            color: '#ffc0cb'
        });
    }
    setEntities(mobs);
    entitiesRef.current = mobs;
    
  }, [terrainReady, camera]);

  return (
    <group>
      {entities.map(entity => (
          <group key={entity.id} position={entity.position}>
            <MobModel type={entity.type} color={entity.color} />
          </group>
      ))}
    </group>
  );
};

export const CombatInstructions = () => (
    <div className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded">
        Shift+Click to Attack
    </div>
);

export const TradingInterface = ({ onClose }) => (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-white" onClick={onClose}>
        Trading (Click to close)
    </div>
);
