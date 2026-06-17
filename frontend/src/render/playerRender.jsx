// S3-M5 (part 1): the player's first-person render cluster — extracted BYTE-EXACT from
// Components.jsx (the god-file de-monolith). StableMagicHands (the FPV hands) orchestrates
// ProceduralWeapon + ProceduralRibbonTrail + the spell hand FX (all intra-module). Player imports
// StableMagicHands. Extraction-only — NO behavior change. (These render off the pinned capture
// camera, so the visual gate won't pixel-diff them; the capture COMPLETING is the mount/crash guard.)
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SPELL_COLORS } from '../GameSystems';
import { buildRibbonIndices } from '../combat/ribbonIndices.js';
import { BLOCK_TYPES } from '../world/Blocks';
import { useGameStore } from '../store/useGameStore';
import { MagicWand } from './spellVfx';

export const ProceduralWeapon = React.memo(({ type = 'Iron Sword', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const bladeColor = useMemo(() => {
    switch (type) {
      case 'Stone Sword': return '#555555';
      case 'Iron Sword': return '#dcdcdc';
      case 'Diamond Sword': return '#00ffff';
      case 'pickaxe': return '#b0c4de';
      case 'sword':
      default: return '#cccccc';
    }
  }, [type]);

  const bladeEmissive = useMemo(() => {
    if (type === 'Diamond Sword') return '#00faff';
    if (type === 'Iron Sword') return '#204060';
    return '#000000';
  }, [type]);

  const hiltColor = useMemo(() => {
    switch (type) {
      case 'Diamond Sword': return '#3c1053';
      case 'Iron Sword': return '#4e2f1d';
      case 'Stone Sword': return '#7c4d28';
      default: return '#7c3f00';
    }
  }, [type]);

  const guardColor = useMemo(() => {
    switch (type) {
      case 'Diamond Sword': return '#ffca00';
      case 'Iron Sword': return '#697a8a';
      case 'Stone Sword': return '#3a3a3a';
      default: return '#b0b0b0';
    }
  }, [type]);

  const metalness = type === 'Stone Sword' ? 0.05 : 0.95;
  const roughness = type === 'Stone Sword' ? 0.88 : 0.08;

  if (type === 'pickaxe') {
    return (
      <group position={position} rotation={rotation}>
        {/* Handle */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.024, 0.028, 1.05, 8]} />
          <meshStandardMaterial color={hiltColor} roughness={0.8} metalness={0.1} />
        </mesh>
        {/* Pickaxe Curved Cross Head */}
        <mesh castShadow receiveShadow position={[0, 0.44, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.038, 0.038, 0.76, 4, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
        {/* Tips */}
        <mesh castShadow position={[0.36, 0.41, 0]} rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[0.046, 0.11, 0.046]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
        <mesh castShadow position={[-0.36, 0.41, 0]} rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.046, 0.11, 0.046]} />
          <meshStandardMaterial color={bladeColor} roughness={0.2} metalness={0.9} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Blade Core */}
      <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.07, 1.25, 0.02]} />
        <meshStandardMaterial 
          color={bladeColor} 
          metalness={metalness} 
          roughness={roughness} 
          emissive={bladeEmissive}
          emissiveIntensity={type === 'Diamond Sword' ? 0.38 : type === 'Iron Sword' ? 0.15 : 0}
        />
      </mesh>
      {/* Beveled edges */}
      <mesh position={[0.04, 0.72, 0]} rotation={[0, 0, -0.04]}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
        <meshStandardMaterial color={bladeColor} metalness={metalness} roughness={roughness} />
      </mesh>
      <mesh position={[-0.04, 0.72, 0]} rotation={[0, 0, 0.04]}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
        <meshStandardMaterial color={bladeColor} metalness={metalness} roughness={roughness} />
      </mesh>
      {/* Diamond Pointed Tip */}
      <mesh position={[0, 1.365, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.058, 0.058, 0.018]} />
        <meshStandardMaterial 
          color={bladeColor} 
          metalness={metalness} 
          roughness={roughness}
          emissive={bladeEmissive}
          emissiveIntensity={type === 'Diamond Sword' ? 0.38 : 0}
        />
      </mesh>
      {/* Guard */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[0.28, 0.05, 0.065]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0.13, 0.15, 0]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[-0.13, 0.15, 0]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
      {/* Leather/Wood wrapped Hilt */}
      <mesh castShadow position={[0, -0.09, 0]}>
        <cylinderGeometry args={[0.03, 0.034, 0.32, 8]} />
        <meshStandardMaterial color={hiltColor} roughness={0.88} metalness={0.1} />
      </mesh>
      {/* Pommel */}
      <mesh position={[0, -0.27, 0]}>
        <sphereGeometry args={[0.052, 8, 8]} />
        <meshStandardMaterial color={guardColor} roughness={0.35} metalness={0.8} />
      </mesh>
    </group>
  );
});

// Dynamic Camera-Local Sword Ribbon Trail Component
export const ProceduralRibbonTrail = ({ rightHandRef, isSwinging, weaponType }) => {
  const meshRef = useRef(null);
  const geomRef = useRef(null);
  const trailPoints = useRef([]); // point history: { tip, base, time }

  const uColor = useMemo(() => {
    switch (weaponType) {
      case 'Diamond Sword': return new THREE.Color('#00ffff');
      case 'Iron Sword': return new THREE.Color('#80d0ff');
      case 'Stone Sword': return new THREE.Color('#909090');
      default: return new THREE.Color('#ffffff');
    }
  }, [weaponType]);

  const uniforms = useMemo(() => ({
    uColor: { value: uColor }
  }), [uColor]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          // Linear trail length fade (U axis)
          float alpha = vUv.x * 0.45;
          // Soft feathered edges along width (V axis) via sine curve
          alpha *= sin(vUv.y * 3.14159265);
          // Glowing hot core center highlight
          vec3 finalColor = mix(vec3(1.0), uColor, 1.0 - sin(vUv.y * 3.14159265));
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }, [uniforms]);

  useFrame((state) => {
    if (!rightHandRef.current || !meshRef.current || !geomRef.current) return;

    const time = state.clock.getElapsedTime();

    if (isSwinging) {
      // Capture sword tip and hilt base in local coordinates relative to the rightHandRef group
      const swordTipLocal = new THREE.Vector3(0.12, 1.3, -0.15);
      const swordBaseLocal = new THREE.Vector3(0.08, 0.22, -0.05);

      const tip = swordTipLocal.clone().applyMatrix4(rightHandRef.current.matrix);
      const base = swordBaseLocal.clone().applyMatrix4(rightHandRef.current.matrix);

      trailPoints.current.push({ tip, base, time });
    }

    // Evict point pairs older than 0.14 seconds to enforce a sharp trailing effect
    trailPoints.current = trailPoints.current.filter(p => time - p.time < 0.14);

    const N = trailPoints.current.length;

    if (N >= 2) {
      const positions = new Float32Array(N * 2 * 3);
      const uvs = new Float32Array(N * 2 * 2);

      for (let i = 0; i < N; i++) {
        const p = trailPoints.current[i];
        
        // Base vertex
        positions[i * 6 + 0] = p.base.x;
        positions[i * 6 + 1] = p.base.y;
        positions[i * 6 + 2] = p.base.z;

        // Tip vertex
        positions[i * 6 + 3] = p.tip.x;
        positions[i * 6 + 4] = p.tip.y;
        positions[i * 6 + 5] = p.tip.z;

        // UV coordinates
        const u = i / (N - 1);
        uvs[i * 4 + 0] = u;
        uvs[i * 4 + 1] = 0;

        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 1;
      }

      const indices = buildRibbonIndices(N);

      geomRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geomRef.current.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geomRef.current.setIndex(new THREE.BufferAttribute(indices, 1));
      
      geomRef.current.attributes.position.needsUpdate = true;
      geomRef.current.attributes.uv.needsUpdate = true;
      if (geomRef.current.index) geomRef.current.index.needsUpdate = true;

      geomRef.current.computeBoundingSphere();
      geomRef.current.computeBoundingBox();

      meshRef.current.visible = true;
    } else {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef} material={material} visible={false}>
      <bufferGeometry ref={geomRef} />
    </mesh>
  );
};

// Magic Hands with effects — locks to camera's local coordinate space for zero-jitter rendering
export const StableMagicHands = ({ selectedBlock, attackType, attackStartTime }) => {
  const activeSpell = useGameStore(state => state.activeSpell) || 'fireball';
  const equippedWeapon = useGameStore(state => state.equipment?.weapon);

  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const magicAuraRef = useRef();

  const currentSpellColor = SPELL_COLORS[activeSpell] || SPELL_COLORS.fireball;

  // Local positions relative to camera center
  const baseRightPos = useMemo(() => new THREE.Vector3(0.6, -0.8, -1.0), []);
  const baseLeftPos = useMemo(() => new THREE.Vector3(-0.4, -0.7, -0.9), []);

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current) {
      const time = state.clock.elapsedTime;
      const swingElapsed = attackStartTime.current > 0 ? (state.clock.getElapsedTime() - attackStartTime.current) : 0;

      const isSwingingMelee = attackType === 'melee' && swingElapsed < 0.2;
      const isCastingSpell = attackType === 'spell' && swingElapsed < 0.15;

      // Subtle high-frequency channeling vibrations on attack or cast
      const noiseX = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 65) + Math.cos(time * 87)) * 0.005 : 0;
      const noiseY = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 73) + Math.cos(time * 59)) * 0.005 : 0;
      const noiseZ = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 81) + Math.cos(time * 95)) * 0.005 : 0;

      if (isSwingingMelee) {
        // Dynamic Bezier slash arc animation
        const t = Math.min(1.0, swingElapsed / 0.2);
        const ease = Math.sin(t * Math.PI * 0.5);

        // Diagonal slash sweep from right to left across camera frame
        const x = baseRightPos.x + Math.sin(t * Math.PI) * 0.16 - ease * 0.72;
        const y = baseRightPos.y + Math.sin(t * Math.PI) * 0.42;
        const z = baseRightPos.z - Math.sin(t * Math.PI) * 0.42;

        rightHandRef.current.position.set(x + noiseX, y + noiseY, z + noiseZ);
        
        // Slash angular rotation sweep (Roll & Yaw rotation)
        rightHandRef.current.rotation.set(
          -0.45 + Math.sin(t * Math.PI) * 1.45,
          -Math.sin(t * Math.PI) * 0.9,
          Math.sin(t * Math.PI) * 1.15 - t * 2.15
        );

        // Left hand raises slightly to balance
        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + 0.12 * Math.sin(t * Math.PI) + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(0.12 * Math.sin(t * Math.PI), 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.set(0, 0, 0);
        }
      } else if (isCastingSpell) {
        const attackTime = time * 6;
        rightHandRef.current.position.set(
          baseRightPos.x + noiseX,
          baseRightPos.y + noiseY,
          baseRightPos.z + Math.sin(attackTime) * 0.04 + noiseZ
        );
        rightHandRef.current.rotation.set(Math.sin(attackTime) * 0.15, 0, 0);

        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(Math.sin(attackTime + 1) * 0.1, 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.x = Math.sin(attackTime) * 0.06;
          wandRef.current.position.y = 0.4 + Math.sin(attackTime) * 0.02;
        }
      } else {
        // Stable Idle
        rightHandRef.current.position.copy(baseRightPos);
        rightHandRef.current.rotation.set(0, 0, 0);

        leftHandRef.current.position.copy(baseLeftPos);
        leftHandRef.current.rotation.set(0, 0, 0);

        if (wandRef.current) {
          wandRef.current.rotation.set(0.1, 0, 0);
          wandRef.current.position.y = 0.4;
        }
      }

      if (magicAuraRef.current) {
        const isAttacking = isSwingingMelee || isCastingSpell;
        const auraSpeed = isAttacking ? 12 : 3;
        const scaleBase = isAttacking ? 1.3 : 0.8;
        const scalePulse = Math.sin(time * auraSpeed) * (isAttacking ? 0.08 : 0.02);
        const finalScale = scaleBase + scalePulse;
        magicAuraRef.current.scale.set(finalScale, finalScale, finalScale);
        
        const opacityBase = isAttacking ? 0.5 : 0.12;
        const opacityPulse = Math.cos(time * auraSpeed) * (isAttacking ? 0.08 : 0.015);
        magicAuraRef.current.material.opacity = opacityBase + opacityPulse;
      }
    }
  });

  const isWeaponEquipped = ['Stone Sword', 'Iron Sword', 'Diamond Sword', 'sword', 'pickaxe'].includes(equippedWeapon);

  return (
    <group>
      {/* Dynamic sweeping ribbon trail inside camera local viewport space */}
      {isWeaponEquipped && (
        <ProceduralRibbonTrail 
          rightHandRef={rightHandRef} 
          isSwinging={attackType === 'melee'} 
          weaponType={equippedWeapon} 
        />
      )}

      <group ref={rightHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        
        {/* Branch weapon model rendering: procedurally modeled 3D sword vs. magic wand */}
        {isWeaponEquipped ? (
          <group ref={wandRef} position={[0.15, 0.32, -0.16]} rotation={[0.0, 0.0, 0.0]}>
            <ProceduralWeapon type={equippedWeapon} />
          </group>
        ) : (
          <group ref={wandRef} position={[0.2, 0.4, -0.1]} rotation={[0.1, 0.2, 0.1]}>
            <MagicWand wandType={activeSpell} />
          </group>
        )}

        <mesh ref={magicAuraRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.32, 16, 16]} />
          <meshBasicMaterial color={currentSpellColor} transparent opacity={0.15} depthWrite={false} />
        </mesh>
        {attackType === 'spell' && <SpellHandEffects spellType={activeSpell} />}
      </group>
      <group ref={leftHandRef}>
        <mesh castShadow receiveShadow position={[0, 0.3, 0]}><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        <mesh castShadow receiveShadow position={[0, -0.05, 0]}><boxGeometry args={[0.2, 0.24, 0.12]} /><meshStandardMaterial roughness={0.8} metalness={0.1} color="#fdbcb4" /></mesh>
        {attackType === 'spell' && (
          <group>
            <mesh castShadow receiveShadow position={[0, 0.1, -0.2]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={currentSpellColor} transparent opacity={0.85} />
            </mesh>
            <pointLight position={[0, 0.1, -0.2]} distance={8} intensity={2.5} color={currentSpellColor} />
          </group>
        )}
        {attackType !== 'spell' && selectedBlock && (
          <group position={[-0.1, 0.2, -0.15]} scale={[0.3, 0.3, 0.3]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial roughness={0.8} metalness={0.1} color={BLOCK_TYPES[selectedBlock]?.color || '#567C35'} />
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
      if (spellType === 'fireball') {
        effectRef.current.rotation.y += 0.04;
        effectRef.current.scale.setScalar(1 + Math.sin(time * 3) * 0.08);
      }
    }
  });
  if (spellType === 'fireball') return <mesh ref={effectRef} position={[0.1, 0.2, 0]}><coneGeometry args={[0.07, 0.22, 6]} /><meshBasicMaterial color="#FF4500" transparent opacity={0.55} /></mesh>;
  return null;
};
