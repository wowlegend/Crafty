// combatVfx.jsx — the two pooled transient combat-hit VFX renderers (extracted from
// SimplifiedNPCSystem S3-M3: same useFrame math, byte-identical). onComplete-driven,
// fire on damage/impact events. No capture gate — they need a hit to spawn (suppressed in capture).
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const DamageNumber = ({ damage, position, id, onComplete, isXP, isAnvil, type }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Clear background
    ctx.clearRect(0, 0, 256, 128);
    
    const isCrit = !isXP && !isAnvil && damage >= 40;
    const fontSize = isAnvil ? 'bold 46px Outfit, Inter, Impact' : (isCrit ? 'bold 64px Outfit, Inter, Impact' : 'bold 50px Outfit, Inter, Impact');
    ctx.font = fontSize;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = isAnvil ? 'WALL HIT!' : (isXP ? `+${damage} XP` : (isCrit ? `${damage}!` : `${damage}`));
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 30, 0, 98);
    if (isAnvil) {
      // M7-T3: the base-as-anvil 3x moment — GOLD (the design-closure must READ)
      gradient.addColorStop(0, '#ffe9a3');
      gradient.addColorStop(1, '#ffb300');
    } else if (isXP) {
      gradient.addColorStop(0, '#a3ffb4');
      gradient.addColorStop(1, '#00ff88');
    } else {
      switch (type) {
        case 'fireball':
          gradient.addColorStop(0, '#ffaa00');
          gradient.addColorStop(1, '#ff3300');
          break;
        case 'iceball':
          gradient.addColorStop(0, '#ffffff');
          gradient.addColorStop(1, '#00d2ff');
          break;
        case 'lightning':
          gradient.addColorStop(0, '#ffffdd');
          gradient.addColorStop(1, '#ffff00');
          break;
        case 'arcane':
          gradient.addColorStop(0, '#e87cff');
          gradient.addColorStop(1, '#8a00ff');
          break;
        case 'physical':
        default:
          if (isCrit) {
            gradient.addColorStop(0, '#ff9999');
            gradient.addColorStop(1, '#ff0000');
          } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#cccccc');
          }
          break;
      }
    }
    
    // Premium text outline
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);
    
    // Text fill
    ctx.fillStyle = gradient;
    ctx.fillText(text, 128, 64);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [damage, isXP, isAnvil, type]);

  // the in-frame dispose only fires if the number lives >1s; a scene/HMR/StrictMode teardown
  // before then (or a texture swap on prop change) would otherwise leak the 256x128 CanvasTexture
  useEffect(() => () => texture.dispose(), [texture]);

  // Premium physically simulated arc bounce trajectory
  const velocity = useMemo(() => {
    const angle = (Math.random() - 0.5) * 2.0; // wider drift angle
    const speed = 1.0 + Math.random() * 2.0;
    return {
      x: Math.sin(angle) * speed,
      y: 4.5 + Math.random() * 2.0, // initial vertical pop
      z: Math.cos(angle) * speed
    };
  }, []);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (startTime.current === null) startTime.current = Date.now();
      const elapsed = (Date.now() - startTime.current) / 1000;
      
      const t = elapsed;
      const isCrit = !isXP && !isAnvil && damage >= 40;

      // Arc formula: y pop and deceleration under gravity, x/z horizontal drift
      let currentY = position[1] + 1.8 + (velocity.y * t - 0.5 * 12.0 * t * t);
      let currentX = position[0] + velocity.x * t;
      let currentZ = position[2] + velocity.z * t;

      if (isCrit) {
        // High frequency vibration/shake on critical hit numbers decaying quickly
        const shake = 0.09 * Math.exp(-elapsed * 3.8);
        currentX += Math.sin(t * 75) * shake;
        currentY += Math.cos(t * 90) * shake;
        
        // Pulsate scale dynamically using a cosine wave
        const pulse = 1.0 + Math.cos(t * 24) * 0.16 * Math.exp(-elapsed * 2.2);
        meshRef.current.scale.set(scale[0] * pulse, scale[1] * pulse, scale[2]);
      }
      
      meshRef.current.position.set(currentX, currentY, currentZ);
      meshRef.current.material.opacity = Math.max(0, 1 - elapsed);

      if (elapsed > 1) {
        texture.dispose(); // clean up texture memory allocation
        onComplete(id);
      }
    }
  });

  const scale = isAnvil ? [3.0, 1.5, 1] : (isXP ? [1.8, 0.9, 1] : (damage >= 40 ? [2.8, 1.4, 1] : [2.2, 1.1, 1])); // larger scale for crits + the gold WALL HIT!

  return (
    <sprite ref={meshRef} position={[position[0], position[1] + 1.8, position[2]]} scale={scale}>
      <spriteMaterial map={texture} transparent opacity={1} depthWrite={false} />
    </sprite>
  );
};

export const ImpactShockwave = ({ position, id, onComplete, type }) => {
  const meshRef = useRef();
  const startTime = useRef(null);

  const color = useMemo(() => {
    switch (type) {
      case 'fireball': return '#ffaa00';
      case 'iceball': return '#00d2ff';
      case 'lightning': return '#ffff00';
      case 'arcane': return '#d900ff';
      case 'physical':
      default: return '#ffffff';
    }
  }, [type]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (startTime.current === null) startTime.current = performance.now();
      const elapsed = performance.now() - startTime.current;
      const duration = 300; // 300ms
      const t = Math.min(1, elapsed / duration);
      
      // Radius scale from 0.2 to 2.5
      const scale = 0.2 + (2.5 - 0.2) * t;
      meshRef.current.scale.set(scale, scale, 1);
      
      // Opacity fade out from 0.8 to 0.0
      meshRef.current.material.opacity = 0.8 * (1 - t);

      if (t >= 1) {
        onComplete(id);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.9, 1.0, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};
