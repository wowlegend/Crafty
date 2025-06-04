import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Combat Visual Effects System
export const CombatEffects = ({ gameState }) => {
  const [activeEffects, setActiveEffects] = useState([]);

  // Add new combat effect
  const addCombatEffect = (type, position, options = {}) => {
    const effect = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      position: [...position],
      startTime: Date.now(),
      duration: options.duration || 1000,
      ...options
    };
    
    setActiveEffects(prev => [...prev, effect]);
    
    // Remove effect after duration
    setTimeout(() => {
      setActiveEffects(prev => prev.filter(e => e.id !== effect.id));
    }, effect.duration);
  };

  // Expose function globally for other components to use
  useEffect(() => {
    window.addCombatEffect = addCombatEffect;
  }, []);

  return (
    <group>
      {activeEffects.map(effect => (
        <CombatEffect key={effect.id} effect={effect} />
      ))}
    </group>
  );
};

// Individual combat effect component
const CombatEffect = ({ effect }) => {
  const meshRef = useRef();
  const [elapsedTime, setElapsedTime] = useState(0);

  useFrame((state, delta) => {
    setElapsedTime(prev => prev + delta * 1000);
    
    if (meshRef.current) {
      const progress = elapsedTime / effect.duration;
      
      switch (effect.type) {
        case 'hit_damage':
          // Damage numbers floating up
          meshRef.current.position.y = effect.position[1] + progress * 2;
          meshRef.current.material.opacity = 1 - progress;
          break;
          
        case 'weapon_swing':
          // Weapon trail effect
          meshRef.current.rotation.z = progress * Math.PI * 2;
          meshRef.current.material.opacity = 1 - progress;
          break;
          
        case 'magic_blast':
          // Magic explosion effect
          const scale = 1 + progress * 2;
          meshRef.current.scale.setScalar(scale);
          meshRef.current.material.opacity = 1 - progress;
          break;
          
        case 'block_break':
          // Block destruction particles
          meshRef.current.position.y = effect.position[1] + progress * 1;
          meshRef.current.rotation.x = progress * Math.PI;
          meshRef.current.material.opacity = 1 - progress;
          break;
          
        case 'death_explosion':
          // Mob death effect
          const deathScale = 1 + progress * 3;
          meshRef.current.scale.setScalar(deathScale);
          meshRef.current.material.opacity = (1 - progress) * 0.8;
          break;
      }
    }
  });

  const renderEffect = () => {
    switch (effect.type) {
      case 'hit_damage':
        return (
          <group ref={meshRef} position={effect.position}>
            <mesh>
              <planeGeometry args={[0.5, 0.3]} />
              <meshBasicMaterial 
                color={effect.color || '#ff0000'}
                transparent
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
        
      case 'weapon_swing':
        return (
          <mesh ref={meshRef} position={effect.position}>
            <torusGeometry args={[1, 0.1, 8, 16]} />
            <meshBasicMaterial 
              color={effect.color || '#ffffff'}
              transparent
            />
          </mesh>
        );
        
      case 'magic_blast':
        return (
          <mesh ref={meshRef} position={effect.position}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial 
              color={effect.color || '#9333ea'}
              transparent
            />
          </mesh>
        );
        
      case 'block_break':
        return (
          <group ref={meshRef} position={effect.position}>
            {[...Array(6)].map((_, i) => (
              <mesh key={i} position={[
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
              ]}>
                <boxGeometry args={[0.1, 0.1, 0.1]} />
                <meshBasicMaterial 
                  color={effect.color || '#7FB238'}
                  transparent
                />
              </mesh>
            ))}
          </group>
        );
        
      case 'death_explosion':
        return (
          <group ref={meshRef} position={effect.position}>
            <mesh>
              <sphereGeometry args={[0.8, 8, 8]} />
              <meshBasicMaterial 
                color="#ff4444"
                transparent
              />
            </mesh>
            {/* Explosion particles */}
            {[...Array(12)].map((_, i) => (
              <mesh key={i} position={[
                Math.cos(i * Math.PI / 6) * 0.5,
                Math.sin(i * Math.PI / 6) * 0.5,
                (Math.random() - 0.5) * 0.5
              ]}>
                <boxGeometry args={[0.05, 0.05, 0.05]} />
                <meshBasicMaterial color="#ffaa00" transparent />
              </mesh>
            ))}
          </group>
        );
        
      default:
        return null;
    }
  };

  return renderEffect();
};

// Screen flash effect for damage taken
export const ScreenDamageEffect = ({ show, damageType = 'normal' }) => {
  if (!show) return null;

  const getFlashColor = () => {
    switch (damageType) {
      case 'fire': return 'rgba(255, 69, 0, 0.3)';
      case 'poison': return 'rgba(50, 205, 50, 0.3)';
      case 'magic': return 'rgba(147, 51, 234, 0.3)';
      default: return 'rgba(255, 0, 0, 0.3)';
    }
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-50 animate-pulse"
      style={{
        backgroundColor: getFlashColor(),
        animation: 'flash 0.2s ease-out'
      }}
    />
  );
};

// Damage number component that appears above entities
export const FloatingDamageNumber = ({ damage, position, type = 'damage' }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const getColor = () => {
    switch (type) {
      case 'heal': return '#00ff00';
      case 'critical': return '#ff6600';
      case 'magic': return '#9333ea';
      default: return '#ff0000';
    }
  };

  return (
    <div
      className="absolute pointer-events-none text-bold text-lg font-bold animate-bounce"
      style={{
        left: `${position[0]}px`,
        top: `${position[1]}px`,
        color: getColor(),
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        zIndex: 1000,
        animation: 'floatUp 1.5s ease-out forwards'
      }}
    >
      -{damage}
    </div>
  );
};

// Weapon glow effect
export const WeaponGlowEffect = ({ weaponType, isActive }) => {
  if (!isActive) return null;

  const getGlowColor = () => {
    switch (weaponType) {
      case 'sword': return '#ffffff';
      case 'axe': return '#ff6600';
      case 'pickaxe': return '#666666';
      case 'magic': return '#9333ea';
      default: return '#ffffff';
    }
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{
        boxShadow: `inset 0 0 20px ${getGlowColor()}`,
        borderRadius: '50%',
        opacity: 0.6,
        animation: 'pulse 0.5s ease-in-out'
      }}
    />
  );
};

// Add CSS animations
const combatEffectsStyles = `
  @keyframes flash {
    0% { opacity: 0; }
    50% { opacity: 1; }
    100% { opacity: 0; }
  }

  @keyframes floatUp {
    0% { 
      transform: translateY(0px) scale(1);
      opacity: 1;
    }
    100% { 
      transform: translateY(-50px) scale(0.8);
      opacity: 0;
    }
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.8; }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.innerText = combatEffectsStyles;
  document.head.appendChild(styleSheet);
}