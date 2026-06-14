import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';
import { MOB_TYPES } from '../game/mobTypes';
import { mobFeatures } from '../game/mobFeatures';
import { Panel, Icon } from '../ui/primitives/index.js';
import { MobToonMaterial } from './MobToonMaterial';
import { flashableMaterial, OUTLINE, RIM } from './characterStyle';
import { TIERS } from './quality';

// MobModel + HealthBar — the mob render cluster, extracted BYTE-EXACT from SimplifiedNPCSystem.jsx
// (S3-M6 NPC de-monolith). OUTLINE_RIM_STRENGTH moved here (its only user). NPCSystem imports MobModel.
const OUTLINE_RIM_STRENGTH = RIM.strength;

// Mob-distinctness T3: a feature box's shade from its `tone` hint — 'bone' = a pale off-white (horns,
// ribs), 'dark' = the body color crushed ~55% (shoulder slabs, moss-crown), else the body color.
const _featTmp = new THREE.Color();
function featureColor(tone, baseColor) {
  if (tone === 'bone') return '#e6dcc4';
  if (tone === 'dark') return '#' + _featTmp.set(baseColor).multiplyScalar(0.55).getHexString();
  return baseColor;
}

const MobModel = React.memo(({ entity }) => {
  const groupRef = useRef();
  const legRefs = useRef([]);
  const prevPos = useRef(null);
  const syncedOnce = useRef(false);
  const coverAuraRef = useRef();
  const modelRef = useRef();
  
  const mobConfig = MOB_TYPES[entity.type] || MOB_TYPES.pig;
  // S2-B3-M6: HYBRIDS carry their own parametric dims/legMode on the ENTITY (no MOB_TYPES entry);
  // every pre-M6 entity lacks these fields, so the fallback chain changes nothing for baselines.
  const [bodyW, bodyH, bodyD] = entity.bodySize || mobConfig.bodySize;
  const [headW, headH, headD] = entity.headSize || mobConfig.headSize;

  // Mob-distinctness T3: per-type silhouette feature boxes (pure game/mobFeatures), derived from the
  // body dims. Empty for unfeatured types (pig/zombie/villager/spider) -> zero render change for them.
  const features = useMemo(
    () => mobFeatures(entity.type, { bodyW, bodyH, bodyD, headW, headH, headD }),
    [entity.type, bodyW, bodyH, bodyD, headW, headH, headD],
  );

  const qualityTier = useGameStore(state => state.qualityTier) || 'low';
  const q = TIERS[qualityTier] || TIERS.low;
  const rimStrength = q.charRim ? OUTLINE_RIM_STRENGTH : 0;

  const baseColor = useMemo(() => new THREE.Color(entity.color), [entity.color]);
  const hitColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const blackColor = useMemo(() => new THREE.Color('#000000'), []);

  const [dialogue, setDialogue] = useState(null);

  useEffect(() => {
    if (entity.type !== 'villager') return;

    const greetings = [
      "Greetings traveler! Left-Click attacks, Right-Click casts active magic!",
      "A storm is brewing. Press U to upgrade spells with attribute points!",
      "Unopened chests hold rich loot. Stand close and press G to unlock!",
      "The deep ocean hides many secrets... Sand beaches are safe!",
      "I heard rumors of a Shadow Dragon... Train and prepare!",
      "Keep practicing your dodge-rolls. Snapping up voxel blocks is easy now!"
    ];

    const myGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const interval = setInterval(() => {
      const playerPos = useGameStore.getState().playerPosition;
      if (!playerPos) return;

      const dx = entity.position.x - playerPos.x;
      const dy = entity.position.y - playerPos.y;
      const dz = entity.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 3.5) {
        setDialogue(myGreeting);
      } else {
        setDialogue(null);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [entity.position, entity.type]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // 1. Sync position/rotation from the ECS entity (No React State!). The AI worker ticks at
    // 15Hz now (see AIWorkerSystem) — this exponential damp is what turns 15Hz authority updates
    // into smooth render-rate motion. Capture mode + first frame pin an EXACT copy (determinism:
    // a capture frame must not depend on how many settle frames the damp has seen).
    if (isCaptureMode() || !syncedOnce.current || entity.snapSync) {
      // exact copy: capture (determinism) / first frame / a knockback impulse this frame
      // (snapSync — review-fix: the damp must not low-pass the hit shove; flash+flinch+shove
      // together are the instant hit channel).
      groupRef.current.position.copy(entity.position);
      groupRef.current.rotation.y = entity.rotation;
      syncedOnce.current = true;
      entity.snapSync = false;
    } else {
      // S2-B3 feel pass: the ALLY SWING PULSE — allies deal damage on a 1.5s cooldown but had
      // ZERO visible motion (a legibility gap). For 0.2s after the bridge stamps lastAllyAttack,
      // a squash-stretch pulse reads as the swing. Transient scale only; capture takes the
      // exact-pose branch above, so baselines never see it.
      if (entity.isAlly && entity.lastAllyAttack) {
        const since = state.clock.getElapsedTime() - entity.lastAllyAttack;
        if (since >= 0 && since < 0.2) {
          const p = 1 + 0.18 * Math.sin(Math.PI * (since / 0.2));
          groupRef.current.scale.set(p, 2 - p, p); // squash-stretch (volume-ish preserving)
        } else if (groupRef.current.scale.x !== 1) {
          groupRef.current.scale.set(1, 1, 1);
        }
      }
      const t = Math.min(1, delta * 10);
      groupRef.current.position.lerp(entity.position, t);
      const cur = groupRef.current.rotation.y;
      const dr = Math.atan2(Math.sin(entity.rotation - cur), Math.cos(entity.rotation - cur));
      groupRef.current.rotation.y = cur + dr * t;
    }

    // Cover-seeking shield aura: transient visibility from the worker-mutated field (memo-proof).
    if (coverAuraRef.current) coverAuraRef.current.visible = !!entity.isCoverSeeking;

    // 2. Squash & Tilt Flinch Animation
    if (modelRef.current) {
      const hitElapsed = entity.lastHit ? (performance.now() - entity.lastHit) : Infinity;
      if (hitElapsed < 250) {
        const t = hitElapsed / 250;
        const wave = Math.sin(t * Math.PI); // sine curve 0 -> 1 -> 0
        const scaleY = 1.0 - wave * 0.15; // Y squishes down to 0.85
        const scaleXZ = 1.0 + wave * 0.1; // X/Z swells to 1.10
        modelRef.current.scale.set(scaleXZ, scaleY, scaleXZ);

        // Tilt backward relative to hit direction
        modelRef.current.rotation.x = -0.2 * wave;
        modelRef.current.rotation.z = (entity.id % 2 === 0 ? 1 : -1) * 0.08 * wave;
      } else {
        modelRef.current.scale.set(1, 1, 1);
        modelRef.current.rotation.set(0, 0, 0);
      }
    }

    // 3. Handle hit flash visually
    const isHit = entity.lastHit && (performance.now() - entity.lastHit < 300);
    
    groupRef.current.traverse((child) => {
      // Only flash lit body materials (Standard/Toon). The drei outline mesh
      // (BackSide ShaderMaterial, exposes a `.color` uniform) and the basic-material
      // eyes must NOT be mutated, or the outline color would be clobbered each frame.
      if (child.isMesh && flashableMaterial(child.material) && child.material.name !== "eye") {
         child.material.color.copy(isHit ? hitColor : baseColor);
         child.material.emissive.copy(isHit ? hitColor : blackColor);
         child.material.emissiveIntensity = isHit ? 1.5 : 0;
      }
    });

    // 4. Procedural Mob Animations & IK — gait speed reads the DAMPED group motion (moves every
    // frame), not the raw entity position (15Hz authority steps: zero delta on 3 of 4 frames
    // would stall the leg-swing/IK `speed > 0` checks between AI ticks).
    const gp = groupRef.current.position;
    if (!prevPos.current) prevPos.current = { x: gp.x, z: gp.z };
    const dx = gp.x - prevPos.current.x;
    const dz = gp.z - prevPos.current.z;
    const velocity = Math.sqrt(dx*dx + dz*dz);
    prevPos.current.x = gp.x;
    prevPos.current.z = gp.z;

    // Dev capture-determinism: pin the gait clock so any mob present in a capture
    // frame holds a fixed leg pose (wall-clock performance.now() differs run-to-run).
    // Inert in normal gameplay. (Mob movement is already frozen in capture, so speed
    // is ~0 and the swing is usually 0 anyway — this also covers the close-up fixtures.)
    const time = isCaptureMode() ? 0 : performance.now() * 0.01;
    const speed = velocity * 15;
    const swing = speed > 0.05 ? Math.sin(time) * 0.6 : 0;
    
    if ((entity.legMode ? entity.legMode !== 'spider' : entity.type !== 'spider')) {
      if (legRefs.current[0]) legRefs.current[0].rotation.x = swing;
      if (legRefs.current[1]) legRefs.current[1].rotation.x = -swing;
      if (legRefs.current[2]) legRefs.current[2].rotation.x = -swing;
      if (legRefs.current[3]) legRefs.current[3].rotation.x = swing;

      // IK height snapping (epsilon-gated like the swing: the damp's asymptote keeps speed>0 for
      // seconds after a stop, which kept these 4 raycasts/mob firing — review-fix 2026-06-10)
      const store = useGameStore.getState();
      if (store.getMobGroundLevel && speed > 0.05) {
        const checkIK = (mesh, offsetX, offsetZ) => {
          if (!mesh) return;
          const cosR = Math.cos(entity.rotation);
          const sinR = Math.sin(entity.rotation);
          const worldX = entity.position.x + (offsetX * cosR + offsetZ * sinR);
          const worldZ = entity.position.z + (-offsetX * sinR + offsetZ * cosR);
          const groundY = store.getMobGroundLevel(worldX, worldZ);
          if (groundY !== null && !isNaN(groundY)) {
             const targetY = groundY - entity.position.y;
             mesh.position.y += (Math.max(-0.3, targetY + 0.3) - mesh.position.y) * 0.2;
          }
        };
        checkIK(legRefs.current[0], -bodyW / 3, bodyD / 4);
        checkIK(legRefs.current[1], bodyW / 3, bodyD / 4);
        checkIK(legRefs.current[2], -bodyW / 3, -bodyD / 4);
        checkIK(legRefs.current[3], bodyW / 3, -bodyD / 4);
      }
    } else {
      legRefs.current.forEach((leg, i) => {
        if (leg) leg.rotation.x = speed > 0.05 ? Math.sin(time + i) * 0.3 : 0;
      });
    }
  });

  return (
    <group ref={groupRef} position={[entity.position.x, entity.position.y, entity.position.z]} rotation={[0, entity.rotation, 0]}>
      <group ref={modelRef}>
        {/* Body */}
        <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
          <boxGeometry args={[bodyW, bodyH, bodyD]} />
          <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
          {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
        </mesh>
        {/* Head */}
        <mesh castShadow receiveShadow position={[0, bodyH + headH / 2, bodyD / 3]}>
          <boxGeometry args={[headW, headH, headD]} />
          <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
          {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
        </mesh>
        {/* Eyes for hostile mobs */}
        {!mobConfig.passive && entity.type !== 'villager' && (
          <>
            <mesh castShadow receiveShadow position={[-0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
              <boxGeometry args={[0.15, 0.1, 0.02]} />
              <meshBasicMaterial name="eye" color="#ff0000" />
            </mesh>
            <mesh castShadow receiveShadow position={[0.15, bodyH + headH / 2, bodyD / 3 + headD / 2 + 0.01]}>
              <boxGeometry args={[0.15, 0.1, 0.02]} />
              <meshBasicMaterial name="eye" color="#ff0000" />
            </mesh>
          </>
        )}
        {/* Custom villager details: green eyes + protruding nose */}
        {entity.type === 'villager' && (
          <>
            {/* Green eyes */}
            <mesh castShadow receiveShadow position={[-0.15, bodyH + headH / 2 + 0.05, bodyD / 3 + headD / 2 + 0.01]}>
              <boxGeometry args={[0.1, 0.08, 0.02]} />
              <meshBasicMaterial name="eye" color="#00aa44" />
            </mesh>
            <mesh castShadow receiveShadow position={[0.15, bodyH + headH / 2 + 0.05, bodyD / 3 + headD / 2 + 0.01]}>
              <boxGeometry args={[0.1, 0.08, 0.02]} />
              <meshBasicMaterial name="eye" color="#00aa44" />
            </mesh>
            {/* Protruding nose */}
            <mesh castShadow receiveShadow position={[0, bodyH + headH / 2 - 0.1, bodyD / 3 + headD / 2 + 0.06]}>
              <boxGeometry args={[0.12, 0.25, 0.15]} />
              <MobToonMaterial color="#d2b48c" rimStrength={rimStrength} />
              {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
            </mesh>
          </>
        )}
        {/* Legs */}
        {(entity.legMode ? entity.legMode !== 'spider' : entity.type !== 'spider') ? (
          <>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[0] = el} position={[-bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[1] = el} position={[bodyW / 3, -0.3, bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[2] = el} position={[-bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[3] = el} position={[bodyW / 3, -0.3, -bodyD / 4]}><boxGeometry args={[0.25, 0.6, 0.25]} /><MobToonMaterial color={entity.color} rimStrength={rimStrength} />{q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}</mesh>
          </>
        ) : (
          [...Array(8)].map((_, i) => (
            <mesh castShadow receiveShadow ref={(el) => legRefs.current[i] = el} key={i} position={[
              Math.cos((i / 8) * Math.PI * 2) * 0.8, 0, Math.sin((i / 8) * Math.PI * 2) * 0.8
            ]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.1, 0.8, 0.1]} />
              <MobToonMaterial color={entity.color} rimStrength={rimStrength} />
              {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
            </mesh>
          ))
        )}
        {/* Mob-distinctness T3: per-type SILHOUETTE features (game/mobFeatures) — static boxes in the
            body-local frame, same toon material + inverted-hull outline as the body so the creature
            reads as ONE form; `tone` shades them. Empty for unfeatured types (no render change). */}
        {features.map((f, i) => (
          <mesh key={`feat-${i}`} castShadow receiveShadow position={f.pos} rotation={f.rot || [0, 0, 0]}>
            <boxGeometry args={f.box} />
            <MobToonMaterial color={featureColor(f.tone, entity.color)} rimStrength={rimStrength} />
            {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
          </mesh>
        ))}
        {/* Dynamic cover-seeking shield aura — ALWAYS mounted, toggled transiently in useFrame.
            Review-fix (4-lens convergent, 2026-06-10): isCoverSeeking is a worker-MUTATED entity
            field; reading it in render JSX only worked pre-memo because every combat hit happened
            to re-render the parent. Under React.memo the JSX read froze at mount value — the
            transient .visible toggle is the GLI-correct, memo-proof path. */}
        <mesh ref={coverAuraRef} visible={false} position={[0, bodyH / 2, 0]}>
          <boxGeometry args={[bodyW * 1.5, bodyH * 1.5, bodyD * 1.5]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.35} wireframe />
        </mesh>
      </group>
      {/* Suppress the floating health bar in capture mode so character-studio
          fixtures (e.g. character-closeup) render a clean silhouette. No-op in gameplay. */}
      {!isCaptureMode() && <HealthBar entity={entity} />}
      {dialogue && (
        <Html position={[0, bodyH + headH + 0.8, 0]} center distanceFactor={8}>
          <Panel
            variant="raise"
            className="px-3 py-1.5 text-text text-xs text-center flex flex-col items-center justify-center pointer-events-none select-none animate-bounce"
            style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word' }}
          >
            <div className="flex items-center gap-1 text-accent font-display mb-0.5 text-[10px] tracking-wider uppercase">
              <Icon name="rune" size={12} /> Villager
            </div>
            <div className="text-[11px] leading-snug">{dialogue}</div>
          </Panel>
        </Html>
      )}
    </group>
  );
});

// Health Bar Component updated for ECS
const HealthBar = ({ entity }) => {
  const fillRef = useRef();
  
  useFrame(() => {
    if (!fillRef.current) return;
    const healthPercent = entity.health / entity.maxHealth;
    fillRef.current.position.x = (healthPercent - 1) * 0.6;
    fillRef.current.scale.x = Math.max(0.001, healthPercent);
    // S2-B3-M4: the SNAREABLE TELL — a weakened hostile (<=30%) shows soulbind jade: an honest
    // "bindable" read that doubles as the danger ladder's last rung. (Capture-safe: the bar is
    // capture-suppressed at the mount site.)
    const snareable = !entity.passive && healthPercent <= 0.3;
    fillRef.current.material.color.set(snareable ? '#3DFFB0' : healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000');
  });

  return (
    <group position={[0, 2.2, 0]}>
      <mesh>
        <planeGeometry args={[1.2, 0.15]} />
        <meshBasicMaterial color="#333333" />
      </mesh>
      <mesh ref={fillRef} position={[0, 0, 0.01]}>
        <planeGeometry args={[1.2, 0.12]} />
        <meshBasicMaterial color="#00ff00" />
      </mesh>
    </group>
  );
};

export { MobModel };
