import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Outlines } from '@react-three/drei';
import { useGameStore } from './store/useGameStore';
import { useGameSounds } from './SoundManager';
import * as THREE from 'three';
import { World } from 'miniplex';
import { ecs, mobsQuery, alliesQuery } from './ecs/world';
import { convertMobToAlly } from './game/allegiance';
import { GameMethods } from './GameMethods';
import { isPointInCone } from './combat/cone.js';
import { isCaptureMode } from './devtest/captureMode';
import { siegeParams } from './game/dayNight.js';
import { weightedPick } from './game/spawnWeights';
import { MOB_TYPES } from './game/mobTypes';
import { DamageNumber, ImpactShockwave } from './render/combatVfx';
import { XPOrbRender, LootDropRender, LootPopRender } from './render/pickupVfx';
import { stepXPOrb, stepLootDrop } from './game/xpOrbStepper';
import { stepEnemyProjectiles } from './game/enemyProjectiles.js';
import { Panel, Icon } from './ui/primitives/index.js';
import { getItemRarity } from './data/items.js';
import { rarityBeam } from './game/lootJuice.js';
import { emitMobKill } from './game/mobKillBus.js';
import { MobToonMaterial } from './render/MobToonMaterial';
import { flashableMaterial, OUTLINE, RIM } from './render/characterStyle';
import { TIERS } from './render/quality';

const OUTLINE_RIM_STRENGTH = RIM.strength;

const xpOrbsQuery = ecs.with('isXPOrb', 'position', 'amount');
const lootDropsQuery = ecs.with('isLootDrop', 'position', 'item', 'xp');

const spawnLootDrop = (item, xp, pos) => {
  // Capture-determinism: in capture mode the LootSystem physics loop is frozen, so the
  // drop never moves -> a zero velocity keeps the drop pinned exactly at its spawn pos
  // (no reliance on Math.random in the capture path). Gameplay keeps the random pop arc.
  const capture = isCaptureMode();
  const angle = capture ? 0 : Math.random() * Math.PI * 2;
  const speed = capture ? 0 : 1.0 + Math.random() * 2.0;
  const vx = Math.cos(angle) * speed;
  const vy = capture ? 0 : 3 + Math.random() * 3; // vertical pop
  const vz = Math.sin(angle) * speed;

  const spawnPos = pos
    ? new THREE.Vector3(pos[0], pos[1] + 0.3, pos[2])
    : new THREE.Vector3(0, 15, 0);

  ecs.add({
    isLootDrop: true,
    item,
    xp: xp || 0,
    position: spawnPos,
    velocity: new THREE.Vector3(vx, vy, vz),
    spawnTime: performance.now(),
    age: 0
  });
};
GameMethods.spawnLootDrop = spawnLootDrop;

// Custom miniplex React hook for compatibility
const useEntities = (query) => {
  const [entities, setEntities] = useState([...query.entities]);
  useEffect(() => {
    const update = () => setEntities([...query.entities]);
    const unsubAdded = query.onEntityAdded.subscribe(update);
    const unsubRemoved = query.onEntityRemoved.subscribe(update);
    return () => {
      unsubAdded();
      unsubRemoved();
    };
  }, [query]);
  return entities;
};

// S2-B2-pre-M2 perf: the AI worker bridge ticks at this rate, not render rate (see AIWorkerSystem).
const AI_TICK_SEC = 1 / 15;

// Mob Model Component with variety - PURE ECS RENDERER
// React.memo on the per-entity renderers (STATE-REVIEW-2026-06-10 #4 mitigation): the useEntities
// bridge re-renders NPCSystem on every entity add/remove; memo + stable miniplex entity refs
// confine that to the changed children — a kill burst (mob remove + N orb adds/removes) now
// reconciles only the changed keys instead of every mounted mob/orb/loot subtree. The full
// DEEPEN (transient query reads in useFrame, no bridge) stays tracked in the PRE-S2B audit.
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

// --- ECS SYSTEMS ---
const SpawnerSystem = () => {
  const { camera } = useThree();
  const lastSpawnCheck = useRef(0);
  const nextId = useRef(0);

  const spawnMob = (x, z, forceType = null, explicitY = null) => {
    const store = useGameStore.getState();
    let y = explicitY;
    if (y === null) {
      if (!store.getMobGroundLevel) return false;
      y = store.getMobGroundLevel(x, z);
      if (y === null || isNaN(y)) {
        return false;
      }
    }

    const mobTypeKeys = Object.keys(MOB_TYPES);
    let type = forceType;
    if (!type) {
      // M3b: at night the hostile-spawn bias ramps with nightCount (siegeParams);
      // day stays the calm baseline (this branch only fires when !store.isDay).
      const nightHostileChance = siegeParams(store.nightCount).hostileChance;
      // the mob-variety pass: WEIGHTED picks (a 220hp brute must not roll like a zombie)
      const entriesFor = (keys) => keys.map((k) => [k, MOB_TYPES[k].weight ?? 1]);
      if (!store.isDay && Math.random() < nightHostileChance) {
        const hostileTypes = mobTypeKeys.filter(k => !MOB_TYPES[k].passive);
        type = weightedPick(entriesFor(hostileTypes), Math.random());
      } else {
        type = weightedPick(entriesFor(mobTypeKeys), Math.random());
      }
    }
    const mobConfig = MOB_TYPES[type];

    ecs.add({
      isMob: true,
      id: nextId.current++,
      type,
      position: new THREE.Vector3(x, y + 0.5, z),
      color: mobConfig.color,
      health: mobConfig.health,
      maxHealth: mobConfig.health,
      speed: mobConfig.speed,
      passive: mobConfig.passive,
      damage: mobConfig.damage,
      xp: mobConfig.xp,
      // the mob-variety pass: registry legMode reaches the renderer (only hybrids carried it before)
      ...(mobConfig.legMode ? { legMode: mobConfig.legMode } : {}),
      targetX: x,
      targetZ: z,
      // Explicit-Y placement (visual-capture fixtures) faces the mob toward +Z so the
      // camera, posed on the +Z side, sees the front (eyes). Gameplay spawns stay random.
      rotation: explicitY !== null ? 0 : Math.random() * Math.PI * 2,
      moveTimer: Math.random() * 3,
      isMoving: false,
      isAggro: false,
      lastAttackTime: 0,
      knockback: null,
      lastHit: 0
    });
    return true;
  };

  useEffect(() => {
    useGameStore.setState({ spawnMob: spawnMob });
    const checkInterval = setInterval(() => {
      const state = useGameStore.getState();
      // Dev capture mode: suppress mob spawns so frames are byte-stable. No-op in gameplay.
      if (isCaptureMode()) { clearInterval(checkInterval); return; }
      if (state.getMobGroundLevel && state.getGeneratedChunks && state.getGeneratedChunks().size > 0 && state.isSpawnChunkLoaded) {
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2;
          const distance = 30 + Math.random() * 20;
          const x = Math.cos(angle) * distance;
          const z = Math.sin(angle) * distance;
          spawnMob(x, z);
        }
        clearInterval(checkInterval);
      }
    }, 500);
    return () => {
      clearInterval(checkInterval);
      useGameStore.setState({ spawnMob: null });
    };
  }, []);

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const now = performance.now();

    if (now - lastSpawnCheck.current >= 1000) {
      lastSpawnCheck.current = now;
      const playerX = camera.position.x;
      const playerZ = camera.position.z;

      // Dynamic spawning based on loaded chunks.
      // Dev capture mode: suppress this per-frame spawner so capture frames are
      // byte-stable (otherwise mobs pop in at random chunk positions during the
      // capture settle window -> run-to-run jitter). Companion to the setInterval
      // spawner gate above. No-op in normal gameplay.
      if (!isCaptureMode() && store.getGeneratedChunks && store.getGeneratedChunks().size > 0) {
        const activeMobs = mobsQuery.entities.filter(e => e.health > 0).length;
        // M3b: the night siege raises the max-mob cap with nightCount (siegeParams);
        // day holds the calm baseline (siegeParams(0).maxMobs === DAY_MAX_MOBS).
        const maxMobs = store.isDay ? siegeParams(0).maxMobs : siegeParams(store.nightCount).maxMobs;
        if (activeMobs < maxMobs) {
          const mobsNeeded = maxMobs - activeMobs;
          const spawnCount = Math.min(mobsNeeded, 3); // Spawn up to 3 per tick to prevent spikes
          const loadedChunkKeys = Array.from(store.getGeneratedChunks());
          
          // Pre-filter chunks whose center distance to the player is in [20, 90]
          let candidateChunks = loadedChunkKeys.filter(key => {
            const [cx, cz] = key.split('_').map(Number);
            const centerX = cx * 16 + 8;
            const centerZ = cz * 16 + 8;
            const chunkDist = Math.sqrt((centerX - playerX) ** 2 + (centerZ - playerZ) ** 2);
            return chunkDist >= 20 && chunkDist <= 90;
          });
          
          if (candidateChunks.length === 0) {
            candidateChunks = loadedChunkKeys;
          }

          let spawnedThisTick = 0;
          let attempts = 0;
          const maxAttempts = 12;
          
          while (spawnedThisTick < spawnCount && attempts < maxAttempts) {
            const randomKey = candidateChunks[Math.floor(Math.random() * candidateChunks.length)];
            const [cx, cz] = randomKey.split('_').map(Number);
            const x = cx * 16 + Math.random() * 16;
            const z = cz * 16 + Math.random() * 16;
            const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);
            
            // Only spawn if not too close (avoid visible spawning) and not too far
            if (dist >= 28 && dist <= 85) {
              attempts++;
              const success = spawnMob(x, z);
              if (success) {
                spawnedThisTick++;
              }
            }
          }
        }
      }

      const maxDistance = 100;
      for (const entity of [...mobsQuery.entities]) {
        if (entity.health <= 0) continue;
        const dist = Math.sqrt((entity.position.x - playerX)**2 + (entity.position.z - playerZ)**2);
        if (dist > maxDistance) {
          ecs.remove(entity);
        }
      }
    }
  });
  return null;
};

const AIWorkerSystem = () => {
  const tickAccumRef = useRef(0);
  const { camera } = useThree();
  const workerRef = useRef();

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/ai.worker.js', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, updates, attacks } = e.data;
      if (type === 'TICK_RESULT') {
        const store = useGameStore.getState();
        
        // Handle attacks
        for (const attack of attacks) {
          if (attack.type === 'projectile') {
            // Phase 12: Archer System - Spawn Arrow
            if (store.spawnEnemyProjectile) {
              store.spawnEnemyProjectile(attack.position, [camera.position.x, camera.position.y, camera.position.z]);
            }
          } else if (attack.type === 'leap') {
            // Phase 12: Leap System - Physics Impulse
            const entity = mobsQuery.entities.find(ent => ent.id === attack.id);
            if (entity) {
                const dir = [
                    camera.position.x - entity.position.x,
                    8, // Vertical boost
                    camera.position.z - entity.position.z
                ];
                const mag = Math.sqrt(dir[0]*dir[0] + dir[2]*dir[2]);
                entity.knockback = [dir[0]/mag * 15, dir[1], dir[2]/mag * 15]; // Reuse knockback for leap
            }
          } else if (store.damagePlayer) {
            store.damagePlayer(attack.damage, attack.type);
            
            // Phase 11: Spatial Attack Sound
            if (store.playSpatialSound) {
              store.playSpatialSound('attack', attack.position, 1.1, 15);
            }
          }
        }

        // Apply updates
        const entityMap = new Map();
        for (const entity of mobsQuery.entities) {
          if (entity.health <= 0) continue;
          entityMap.set(entity.id, entity);
        }

        for (const update of updates) {
          const entity = entityMap.get(update.id);
          if (entity && entity.health > 0) {
            entity.position.x = update.x;
            entity.position.z = update.z;
            entity.rotation = update.rotation;
            entity.isAggro = update.isAggro;
            
            // Sync back worker state
            entity.isMoving = update.isMoving;
            entity.targetX = update.targetX;
            entity.targetZ = update.targetZ;
            entity.lastAttackTime = update.lastAttackTime;
            entity.moveTimer = update.moveTimer;
            entity.isCoverSeeking = update.isCoverSeeking;

            if (store.getMobGroundLevel) {
              const groundY = store.getMobGroundLevel(entity.position.x, entity.position.z);
              if (groundY !== null && !isNaN(groundY)) {
                entity.position.y = groundY + 0.5;
              }
            }
          }
        }
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useFrame((state, delta) => {
    if (!camera || !workerRef.current) return;
    if (isCaptureMode()) return; // freeze mob AI/movement so capture frames are byte-stable
    const now = performance.now();

    // Process knockback in main thread
    for (const entity of mobsQuery.entities) {
      if (entity.health <= 0) continue;
      if (entity.knockback) {
        entity.position.x += entity.knockback[0] * delta * 4;
        entity.position.z += entity.knockback[2] * delta * 4;
        entity.knockback = null;
        entity.snapSync = true; // MobModel exact-copies this frame so the shove reads instant (not damped)
      }
    }

    // S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #3): the AI bridge ticks at 15Hz, not render
    // rate. The mobsData rebuild (~20 fields × N mobs), the structured-clone postMessage, the
    // 81-cell aggro heightGrids and the reply ground-snap raycasts all drop from 60-120Hz to 15Hz
    // (4-8× cut; 120Hz ProMotion iPads no longer pay double). MobModel's render-side damp keeps
    // 15Hz authority updates reading as smooth motion. The worker receives the ACCUMULATED
    // seconds since the last tick (movement-speed parity), clamped vs tab-stall spikes.
    // (Knockback above stays render-rate — instant hit feel.)
    tickAccumRef.current += delta;
    if (tickAccumRef.current < AI_TICK_SEC) return;
    const tickDelta = Math.min(tickAccumRef.current, 0.25);
    tickAccumRef.current = 0;

    const store = useGameStore.getState();
    const getMobGroundLevel = store.getMobGroundLevel;
    const mobsData = mobsQuery.entities.filter(e => e && e.health > 0).map(e => {
      let heightGrid = null;
      if (!e.passive && e.isAggro) {
        heightGrid = [];
        const startX = Math.round(e.position.x) - 4;
        const startZ = Math.round(e.position.z) - 4;
        if (getMobGroundLevel) {
          for (let gz = 0; gz < 9; gz++) {
            for (let gx = 0; gx < 9; gx++) {
              const worldX = startX + gx;
              const worldZ = startZ + gz;
              const h = getMobGroundLevel(worldX, worldZ);
              heightGrid.push((h === null || isNaN(h)) ? e.position.y : h);
            }
          }
        }
      }
      return {
        id: e.id,
        passive: e.passive,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        targetX: e.targetX,
        targetZ: e.targetZ,
        isMoving: e.isMoving,
        isAggro: e.isAggro,
        lastAttackTime: e.lastAttackTime,
        damage: e.damage,
        type: e.type,
        moveTimer: e.moveTimer,
        speed: e.speed * (e.zoneSlowMult || 1), // S2-B4-M4: frozen zones slow (the ONE consumer — gate-locked)
        rotation: e.rotation,
        health: e.health,
        maxHealth: e.maxHealth,
        heightGrid: heightGrid
      };
    });

    workerRef.current.postMessage({
      type: 'TICK',
      playerPos: [camera.position.x, camera.position.y, camera.position.z],
      now,
      delta: tickDelta,
      mobs: mobsData
    });
  });

  return null;
};

const MinimapSyncSystem = () => {
  useFrame(() => {
    const now = performance.now();
    const store = useGameStore.getState();
    if (now - (store._lastMinimapUpdate || 0) > 250) {
      const activeMobs = mobsQuery.entities.filter(e => e && e.health > 0);
      store.setMobEntities(activeMobs.map(e => ({
        id: e.id, type: e.type, passive: e.passive, position: [e.position.x, e.position.y, e.position.z]
      })));
      const hostileCount = activeMobs.filter(e => !e.passive).length;
      useGameStore.setState({ 
        _lastMinimapUpdate: now,
        activeHostilesCount: hostileCount 
      });
    }
  });
  return null;
};

const CombatSystem = ({ setDamageNumbers, setShockwaves, damageId }) => {
  const { playHit } = useGameSounds();
  useEffect(() => {
    const damageMob = (id, damage = 25, type = 'physical', source = 'player') => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity) return null;

      // Phase 9 / S1-D-M1: Visceral Hitstop (micro-freeze for game feel).
      // Was a MAIN-THREAD BUSY-WAIT (a spin loop on the wall clock) that froze
      // the entire tab — rendering, audio, AND input — for 35ms. Replaced with a
      // non-blocking store flag: a `performance.now()` timestamp the player movement
      // loop reads to clamp its motion toward zero for the window. Same felt micro-
      // freeze, zero main-thread stall, and it benefits every damageMob caller
      // (melee AND spells). Shorter window (28ms) since it's now a true motion dip,
      // not a wall-clock stall stacked on top of frame time.
      // S2-B3-M1: hitstop is PLAYER feel — an ally's hit must not clamp the player's motion.
      if (source === 'player') useGameStore.setState({ hitstopUntil: performance.now() + 28 });

      const store = useGameStore.getState();
      // NOTE (M5 review [B]): this is a MAGNITUDE proxy ("big hit -> bigger spray"), NOT the crit
      // source-of-truth (that's the real isCrit at Components.jsx triggerMeleeAttack). Since M5 the
      // incoming `damage` is form-multiplied, so heavy beast forms (ice/golem) cross 40 more often and
      // light forms (comet/hawk) less — intended feel. Thread the real isCrit here only if Kevin wants
      // the spray to track the crit ROLL rather than the damage magnitude (combat-differentiation depth).
      const isCrit = damage >= 40;
      // S2-B3-M1: camera shake is PLAYER feel — 3 allies on attack cooldowns would judder it continuously.
      if (source === 'player' && store.triggerCameraShake) {
        store.triggerCameraShake(isCrit ? 1.6 : 1.0);
      }
      
      // Phase 11: Spatial Hit Sound
      if (store.playSpatialSound) {
        store.playSpatialSound('hit', [entity.position.x, entity.position.y, entity.position.z]);
      } else {
        playHit();
      }

      // SOTA High-performance fully GPU-driven particle burst triggering
      if (store.triggerGPUSparks) {
        let sparkColor = '#ffffff';
        const count = isCrit ? 60 : 25; // Massive spray on crits!
        
        switch (type) {
          case 'fireball':
            sparkColor = '#ff5500';
            break;
          case 'iceball':
            sparkColor = '#00d2ff';
            break;
          case 'lightning':
            sparkColor = '#ffff00';
            break;
          case 'arcane':
            sparkColor = '#d900ff';
            break;
          case 'physical':
          default:
            sparkColor = isCrit ? '#ffcc00' : '#ff2200'; // Glowing gold for crits, crimson red for normals
            break;
        }

        store.triggerGPUSparks(
          new THREE.Vector3(entity.position.x, entity.position.y + 0.8, entity.position.z), 
          sparkColor, 
          count, 
          type
        );
      }

      entity.health -= damage;
      entity.lastHit = performance.now();

      // Store hit direction for flinch tilt
      const camera = useGameStore.getState().gameCamera;
      if (camera) {
        const kx = entity.position.x - camera.position.x;
        const kz = entity.position.z - camera.position.z;
        const kd = Math.sqrt(kx * kx + kz * kz) || 1;
        entity.knockback = [kx / kd * 2, 0, kz / kd * 2];
        entity.hitDirection = new THREE.Vector3(kx / kd, 0, kz / kd);
      } else {
        entity.hitDirection = new THREE.Vector3(0, 0, -1);
      }

      setDamageNumbers(nums => [...nums, {
        id: damageId.current++,
        damage,
        type,
        position: [entity.position.x, entity.position.y, entity.position.z]
      }]);

      setShockwaves(waves => [...waves, {
        id: damageId.current++,
        type,
        position: [entity.position.x, entity.position.y + 0.1, entity.position.z]
      }]);

      if (entity.health <= 0) {
        const store = useGameStore.getState();
        
        // Spawn glowing physical green XP orbs scattered explosively
        const orbValue = 5;
        const totalXP = entity.xp || 10;
        // S2-B3-M1: XP drops only on YOUR kills (ally kills would farm pickups).
        const count = source === 'player' ? Math.max(1, Math.floor(totalXP / orbValue)) : 0;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 2.5;
          const vx = Math.cos(angle) * speed;
          const vy = 4 + Math.random() * 4; // Upward impulse
          const vz = Math.sin(angle) * speed;

          ecs.add({
            isXPOrb: true,
            position: new THREE.Vector3(entity.position.x, entity.position.y + 0.2, entity.position.z),
            velocity: new THREE.Vector3(vx, vy, vz),
            amount: orbValue,
            spawnTime: performance.now(),
            age: 0
          });
        }

        emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z], source); // M3.5 fan-out + B3-M1 attribution
        ecs.remove(entity);
      }
      return entity;
    };

    // S2-B3-M3: capture a mob into the squad — the SNARE bind's apply-path (M4 calls this).
    const captureMob = (id) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity || entity.health <= 0) return null;
      return convertMobToAlly(ecs, entity);
    };

    useGameStore.setState({ attackEntity: damageMob });
    useGameStore.setState({ damageMob: damageMob });
    GameMethods.damageMob = damageMob;
    GameMethods.captureMob = captureMob;

    const checkMobCollision = (pos, range = 3) => {
      return mobsQuery.entities.find(e => {
        const dx = e.position.x - pos.x;
        const dy = e.position.y - pos.y;
        const dz = e.position.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return dist < range;
      });
    };

    const checkMobsInMeleeCone = (playerPos, lookDir, range = 4.5, angleRad = Math.PI / 2) => {
      // Cone geometry extracted to the pure, unit-tested helper `isPointInCone`
      // (src/combat/cone.js) so the SAME front-arc test is reused for the boss
      // (Components.jsx triggerMeleeAttack). Behaviour here is IDENTICAL.
      return mobsQuery.entities.filter(e =>
        isPointInCone(playerPos, lookDir, e.position, range, angleRad)
      );
    };

    useGameStore.setState({ checkMobCollision: checkMobCollision, checkMobsInMeleeCone: checkMobsInMeleeCone });
    GameMethods.checkMobCollision = checkMobCollision;
    GameMethods.checkMobsInMeleeCone = checkMobsInMeleeCone;
  }, [setDamageNumbers, setShockwaves]);

  return null;
};

// --- ORCHESTRATOR ---
const EnemyProjectileSystem = () => {
  // GLI fix (STATE-REVIEW-2026-06-10 BLOCKING #1): the live list is a REF mutated per frame by the
  // pure stepper (src/game/enemyProjectiles.js); React state mirrors MEMBERSHIP only (spawn /
  // expire / hit), so this component re-renders on transitions, never at render rate. Mesh
  // positions are written transiently each frame below (same pattern as EnhancedMagicSystem).
  const liveRef = useRef([]);
  const meshRefs = useRef(new Map());
  const [rendered, setRendered] = useState([]);
  const projectileId = useRef(0);
  const { camera } = useThree();

  useEffect(() => {
    useGameStore.setState({ spawnEnemyProjectile: (pos, target) => {
        const dir = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize();
        liveRef.current.push({
            id: projectileId.current++,
            position: new THREE.Vector3(...pos).add(dir.clone().multiplyScalar(1)),
            velocity: dir.multiplyScalar(0.4),
            age: 0
        });
        setRendered([...liveRef.current]); // transition: spawn
    }});
  }, []);

  useFrame((state, delta) => {
    const list = liveRef.current;
    if (list.length === 0) return;
    const { survivors, hits } = stepEnemyProjectiles(list, delta, camera.position);
    if (hits > 0) {
      const damagePlayer = useGameStore.getState().damagePlayer;
      if (damagePlayer) for (let i = 0; i < hits; i++) damagePlayer(15, 'projectile');
    }
    if (survivors.length !== list.length) {
      liveRef.current = survivors;
      setRendered([...survivors]); // transition: expiry / hit
    }
    for (const p of liveRef.current) {
      const m = meshRefs.current.get(p.id);
      if (m) m.position.copy(p.position);
    }
  });

  return (
    <group>
        {rendered.map(p => (
            <mesh key={p.id} position={p.position}
                  ref={(m) => { if (m) meshRefs.current.set(p.id, m); else meshRefs.current.delete(p.id); }}>
                <boxGeometry args={[0.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#F5F5DC" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
        ))}
    </group>
  );
};

// --- XP Orb Physics & Pull System ---
const XPOrbSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...xpOrbsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js (S3-M6 NPC de-monolith, byte-equivalent);
      // the component keeps the ECS iteration + the collect side-effects.
      const collected = stepXPOrb(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
        playPickup();
        ecs.remove(entity);
      }
    }
  });

  return null;
};


// --- Physical Loot Helpers ---
// Re-exported for the M3 loot/rarity characterization tests, which import
// getItemRarity from this module. M3-T3 routed rarity through the single registry
// in src/data/items.js (removing the local duplicate with its emoji-fallback
// branches), so this re-export now resolves to the registry — resolving the prior
// cross-file divergence with GamePanels (both re-export the same registry function).
export { getItemRarity };

// --- Loot Physics & Pull System ---
const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    // Capture-determinism: FREEZE the loot physics/magnet/collection loop so spawned
    // fixture drops hold their exact spawn position (no gravity arc, no camera-magnet
    // pull, no auto-collect) -> the loot-showcase frame is byte-stable. Mirrors the mob
    // AI freeze (NPCSystem useFrame early-returns in capture). No-op in gameplay.
    if (isCaptureMode()) return;
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...lootDropsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js stepLootDrop (S3-M6, byte-equivalent;
      // magnet range 7 / base 40 / floor 3); the component keeps the loot collect side-effects.
      const collected = stepLootDrop(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (store.addToInventory) store.addToInventory(entity.item, 1);
        if (entity.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(entity.xp, entity.item);
        if (entity.xp > 0 && GameMethods.spawnXPText) GameMethods.spawnXPText(entity.xp, entity.position);
        if (store.addNotification) store.addNotification(`Looted: ${entity.item}`, 'loot');
        playPickup();
        // M3c-T2: rarity-tinted pickup pop at the collect point (same color as the drop's beam).
        if (GameMethods.spawnLootPop) GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
        ecs.remove(entity);
      }
    }
  });

  return null;
};

export const NPCSystem = React.memo(() => {
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [shockwaves, setShockwaves] = useState([]);
  const [lootPops, setLootPops] = useState([]);
  const damageId = useRef(0);
  const entities = useEntities(mobsQuery);
  const allies = useEntities(alliesQuery); // S2-B3-M5: bound creatures RENDER again (they left mobsQuery at bind)
  const xpOrbs = useEntities(xpOrbsQuery);
  const lootDrops = useEntities(lootDropsQuery);

  const removeDamageNumber = (id) => {
    setDamageNumbers(prev => prev.filter(d => d.id !== id));
  };

  useEffect(() => {
    GameMethods.spawnXPText = (amount, position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isXP: true,
        damage: amount,
        position: [position.x, position.y, position.z]
      }]);
    };
    // M7-T3: the gold WALL HIT! label — fired by HurlSystem when the anvil 3x lands.
    GameMethods.spawnAnvilText = (position) => {
      setDamageNumbers(prev => [...prev, {
        id: damageId.current++,
        isAnvil: true,
        damage: 0,
        position: [position.x, position.y + 0.6, position.z]
      }]);
    };
    // M3c-T2: rarity-tinted pickup pop, fired from the LootSystem collect branch.
    GameMethods.spawnLootPop = (position, color) => {
      setLootPops(prev => [...prev, {
        id: damageId.current++,
        position: [position.x, position.y + 0.1, position.z],
        color
      }]);
    };
  }, []);

  return (
    <group>
      <SpawnerSystem />
      <AIWorkerSystem />
      <MinimapSyncSystem />
      <CombatSystem setDamageNumbers={setDamageNumbers} setShockwaves={setShockwaves} damageId={damageId} />
      <EnemyProjectileSystem />
      <XPOrbSystem />
      <LootSystem />

      {entities.filter(entity => entity && entity.health > 0).map(entity => (
        <MobModel key={entity.id} entity={entity} />
      ))}

      {/* S2-B3-M5: the squad — the same parametric MobModel (the jade color lerp from the bind
          already differentiates; a rim treatment is M6-look-judge material). */}
      {allies.map(entity => (
        <MobModel key={'ally-' + entity.id} entity={entity} />
      ))}

      {xpOrbs.map(orb => (
        <XPOrbRender key={orb.id} entity={orb} />
      ))}

      {lootDrops.map(loot => (
        <LootDropRender key={loot.id} entity={loot} />
      ))}

      {damageNumbers.map(dmg => (
        <DamageNumber
          key={dmg.id}
          id={dmg.id}
          damage={dmg.damage}
          isXP={dmg.isXP}
          isAnvil={dmg.isAnvil}
          type={dmg.type}
          position={dmg.position}
          onComplete={removeDamageNumber}
        />
      ))}

      {shockwaves.map(wave => (
        <ImpactShockwave
          key={wave.id}
          id={wave.id}
          position={wave.position}
          type={wave.type}
          onComplete={(id) => setShockwaves(prev => prev.filter(w => w.id !== id))}
        />
      ))}

      {lootPops.map(pop => (
        <LootPopRender
          key={pop.id}
          id={pop.id}
          position={pop.position}
          color={pop.color}
          onComplete={(id) => setLootPops(prev => prev.filter(p => p.id !== id))}
        />
      ))}
    </group>
  );
});
