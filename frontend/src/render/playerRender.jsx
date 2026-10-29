// The player's first-person render cluster: StableMagicHands (the ember gauntlets) orchestrates ProceduralWeapon,
// ProceduralRibbonTrail and the spell hand FX. It renders inside the viewmodel scene (render/ViewmodelLayer.jsx), in
// view space, so nothing here casts or receives a shadow and nothing here lights the world: the gauntlets' ember cores
// are HDR colours the composer's bloom carries (render/viewmodel.js).
import React, { useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useFrame } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { SPELL_COLORS } from '../GameSystems';
import { fillRibbonIndices } from '../combat/ribbonIndices.js';
import { makeTrailRing, pushTrailPoint, dropExpiredTrailPoints, TRAIL_LIFE_SEC, TRAIL_CAPACITY } from '../combat/ribbonRing.js';
import { BLOCK_TYPES } from '../world/Blocks';
import { useGameStore } from '../store/useGameStore';
import { OUTLINE } from './characterStyle';
import { MagicWand } from './spellVfx';
import { heavyChargeLevel } from '../game/heavyAttack.js';
import { handSwing, slashSweep } from '../game/meleeString.js';
import { lookbookHandPose, lookbookHandPoseKind, subscribeLookbook } from './lookbookSeam.js';
import {
  GAUNTLET, GAUNTLET_PARTS, HAND_REST_ROT, VIEWMODEL, handAnchors, installValueFloor, makeGauntletMaterials, makeHeldMaterial,
} from './viewmodel.js';
import { frameScale, swingPose, swingFit, chargePose, chargeFit } from './handPose.js';

// Swing-ribbon scratch, allocated once at the ring's capacity: re-filled in place with needsUpdate, because swapping a
// BufferAttribute re-uploads the whole buffer anyway. The anchors are the blade's base and tip in the hand's frame.
const TRAIL_TIP_LOCAL = Object.freeze({ x: 0, y: 0.84, z: -0.04 });
const TRAIL_BASE_LOCAL = Object.freeze({ x: 0, y: 0.15, z: -0.04 });
const _ribbonTip = new THREE.Vector3();
const _ribbonBase = new THREE.Vector3();
const _ribbonPositions = new Float32Array(TRAIL_CAPACITY * 2 * 3);
const _ribbonUvs = new Float32Array(TRAIL_CAPACITY * 2 * 2);
const _ribbonIndices = new Uint16Array(Math.max(0, TRAIL_CAPACITY - 1) * 6);

// The ink outline of the character render language, at the props tier: the gauntlets sit close to the camera.
const GLOVE_OUTLINE_T = OUTLINE.prop.thickness;

/**
 * The AUTHORED rest pose of the held item, by which group is mounted, in the fist's frame. The mounted group carries its
 * own entry in userData.rest, so the frame loop resets to the pose of what is actually in the fist. Frozen so a caller
 * cannot mutate what it resets to.
 */
export const HELD_REST = Object.freeze({
  weapon: Object.freeze({ position: Object.freeze([0, 0.02, -0.04]), rotation: Object.freeze([0, 0, 0]) }),
  wand: Object.freeze({ position: Object.freeze([0, 0.1, -0.05]), rotation: Object.freeze([0.1, 0, -0.12]) }),
});

// The sword and the wand are modelled at world scale (a 1.25 m blade, a 0.8 m wand handle); in the fist, at 0.9 m from
// the eye, that size fills half the frame, so they are drawn smaller in the hand. The swing trail's anchors above sit
// on the scaled blade.
const HELD_SCALE = Object.freeze({ weapon: 0.6, wand: 0.55 });

/** The held weapon's materials by type: standard materials with the hands' value floor, since the viewmodel has no
 *  environment map and a 0.95-metal blade lit by the moon alone reads near black. */
function makeWeaponMaterials(type) {
  const bladeColor = { 'Stone Sword': '#555555', 'Iron Sword': '#dcdcdc', 'Diamond Sword': '#00ffff' }[type] || '#cccccc';
  const bladeEmissive = { 'Diamond Sword': '#00faff', 'Iron Sword': '#204060' }[type] || '#000000';
  const hiltColor = { 'Diamond Sword': '#3c1053', 'Iron Sword': '#4e2f1d', 'Stone Sword': '#7c4d28' }[type] || '#7c3f00';
  const guardColor = { 'Diamond Sword': '#ffca00', 'Iron Sword': '#697a8a', 'Stone Sword': '#3a3a3a' }[type] || '#b0b0b0';
  const metalness = type === 'Stone Sword' ? 0.05 : 0.95;
  const roughness = type === 'Stone Sword' ? 0.88 : 0.08;
  const floored = (params) => installValueFloor(new THREE.MeshStandardMaterial(params));
  return {
    blade: floored({ color: bladeColor, metalness, roughness, emissive: bladeEmissive, emissiveIntensity: type === 'Diamond Sword' ? 0.38 : type === 'Iron Sword' ? 0.15 : 0 }),
    edge: floored({ color: bladeColor, metalness, roughness }),
    tip: floored({ color: bladeColor, metalness, roughness, emissive: bladeEmissive, emissiveIntensity: type === 'Diamond Sword' ? 0.38 : 0 }),
    guard: floored({ color: guardColor, roughness: 0.35, metalness: 0.8 }),
    hilt: floored({ color: hiltColor, roughness: 0.88, metalness: 0.1 }),
  };
}

const ProceduralWeapon = React.memo(({ type = 'Iron Sword', position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const m = useMemo(() => makeWeaponMaterials(type), [type]);
  useEffect(() => () => { for (const mat of Object.values(m)) mat.dispose(); }, [m]);

  return (
    <group position={position} rotation={rotation}>
      {/* Blade Core */}
      <mesh position={[0, 0.72, 0]} material={m.blade}>
        <boxGeometry args={[0.07, 1.25, 0.02]} />
      </mesh>
      {/* Beveled edges */}
      <mesh position={[0.04, 0.72, 0]} rotation={[0, 0, -0.04]} material={m.edge}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
      </mesh>
      <mesh position={[-0.04, 0.72, 0]} rotation={[0, 0, 0.04]} material={m.edge}>
        <boxGeometry args={[0.013, 1.23, 0.007]} />
      </mesh>
      {/* Diamond Pointed Tip */}
      <mesh position={[0, 1.365, 0]} rotation={[0, 0, Math.PI / 4]} material={m.tip}>
        <boxGeometry args={[0.058, 0.058, 0.018]} />
      </mesh>
      {/* Guard */}
      <mesh position={[0, 0.12, 0]} material={m.guard}>
        <boxGeometry args={[0.28, 0.05, 0.065]} />
      </mesh>
      <mesh position={[0.13, 0.15, 0]} rotation={[0, 0, 0.45]} material={m.guard}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
      </mesh>
      <mesh position={[-0.13, 0.15, 0]} rotation={[0, 0, -0.45]} material={m.guard}>
        <boxGeometry args={[0.05, 0.07, 0.05]} />
      </mesh>
      {/* Leather/Wood wrapped Hilt */}
      <mesh position={[0, -0.09, 0]} material={m.hilt}>
        <cylinderGeometry args={[0.03, 0.034, 0.32, 8]} />
      </mesh>
      {/* Pommel */}
      <mesh position={[0, -0.27, 0]} material={m.guard}>
        <sphereGeometry args={[0.052, 8, 8]} />
      </mesh>
    </group>
  );
});

// Dynamic Camera-Local Sword Ribbon Trail Component
const ProceduralRibbonTrail = ({ rightHandRef, isSwinging, weaponType }) => {
  const meshRef = useRef(null);
  const geomRef = useRef(null);
  const trailPoints = useRef(makeTrailRing()); // fixed-capacity ring of plain numbers, not objects

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

  // prop-attached ShaderMaterial -> dispose on unmount + on swap (weapon equip/unequip/change)
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (!rightHandRef.current || !meshRef.current || !geomRef.current) return;

    const time = state.clock.getElapsedTime();

    if (isSwinging) {
      _ribbonTip.copy(TRAIL_TIP_LOCAL).applyMatrix4(rightHandRef.current.matrix);
      _ribbonBase.copy(TRAIL_BASE_LOCAL).applyMatrix4(rightHandRef.current.matrix);
      // The RING holds plain numbers, not Vector3s: one entry per swing frame, reused forever.
      pushTrailPoint(trailPoints.current, _ribbonTip, _ribbonBase, time);
    }

    // Evict point pairs older than the trail's life, in place, for a sharp trailing edge.
    dropExpiredTrailPoints(trailPoints.current, time, TRAIL_LIFE_SEC);

    const N = trailPoints.current.count;

    if (N >= 2) {
      const positions = _ribbonPositions;
      const uvs = _ribbonUvs;

      const ring = trailPoints.current;
      for (let i = 0; i < N; i++) {
        // Base vertex
        positions[i * 6 + 0] = ring.base[i * 3];
        positions[i * 6 + 1] = ring.base[i * 3 + 1];
        positions[i * 6 + 2] = ring.base[i * 3 + 2];

        // Tip vertex
        positions[i * 6 + 3] = ring.tip[i * 3];
        positions[i * 6 + 4] = ring.tip[i * 3 + 1];
        positions[i * 6 + 5] = ring.tip[i * 3 + 2];

        // UV coordinates
        const u = i / (N - 1);
        uvs[i * 4 + 0] = u;
        uvs[i * 4 + 1] = 0;

        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 1;
      }

      // The attributes are created once and then only their contents change. setDrawRange is what makes
      // a fixed-capacity buffer render a variable-length ribbon.
      if (!geomRef.current.attributes.position) {
        geomRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geomRef.current.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geomRef.current.setIndex(new THREE.BufferAttribute(_ribbonIndices, 1));
      }
      const indexCount = fillRibbonIndices(_ribbonIndices, N);
      geomRef.current.setDrawRange(0, indexCount);

      geomRef.current.attributes.position.needsUpdate = true;
      geomRef.current.attributes.uv.needsUpdate = true;
      if (geomRef.current.index) geomRef.current.index.needsUpdate = true;

      // A sphere is enough for frustum culling here, and it is the cheaper of the two.
      geomRef.current.computeBoundingSphere();

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

/** One ember gauntlet, in the fist's frame: the boxes of render/viewmodel.js GAUNTLET_PARTS, which the anchor gate
 *  projects to keep each fist in frame. */
const Gauntlet = ({ mats, children }) => (
  <>
    {GAUNTLET_PARTS.map((p) => (
      <mesh key={p.name} position={p.pos} material={mats[p.mat]}>
        <boxGeometry args={p.size} />
        {p.outline && <Outlines thickness={GLOVE_OUTLINE_T} color={GAUNTLET.ink} toneMapped={false} />}
      </mesh>
    ))}
    {children}
  </>
);

const HeldBlock = ({ blockId }) => {
  const color = BLOCK_TYPES[blockId]?.color || '#567C35';
  const material = useMemo(() => makeHeldMaterial(color), [color]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group position={[0, 0.14, -0.06]} scale={[0.13, 0.13, 0.13]}>
      <mesh material={material}>
        <boxGeometry args={[1, 1, 1]} />
        <Outlines thickness={GLOVE_OUTLINE_T} color={GAUNTLET.ink} toneMapped={false} />
      </mesh>
    </group>
  );
};

// The cast orb is an HDR colour so the composer's bloom gives it its glow.
const ORB_GAIN = 2.5;
// The cast's gesture lasts while the Player holds attackType 'spell' (Components.jsx, 150 ms).
const CAST_S = 0.15;

// The ember gauntlets, in view space (the viewmodel camera sits at the origin looking down -z).
export const StableMagicHands = ({ selectedBlock, attackType, attackStartTime }) => {
  const activeSpell = useGameStore(state => state.activeSpell) || 'fireball';
  const equippedWeapon = useGameStore(state => state.equipment?.weapon);
  // A held lookbook pose shows the cast's orb and the swing's trail as the attack it stands for; null in play.
  const stillKind = useSyncExternalStore(subscribeLookbook, lookbookHandPoseKind);
  const shownAttack = stillKind === 'cast' ? 'spell' : stillKind === 'swing' ? 'melee' : attackType;

  const rightHandRef = useRef();
  const leftHandRef = useRef();
  const wandRef = useRef();
  const swingLatch = useRef({ startS: -1, sweep: null, melee: false });
  const slashRef = useRef(); // a bright crescent slash-arc on EVERY melee swing: the ribbon trail is weapon-only

  const currentSpellColor = SPELL_COLORS[activeSpell] || SPELL_COLORS.fireball;
  const orbColor = useMemo(() => new THREE.Color(currentSpellColor).multiplyScalar(ORB_GAIN), [currentSpellColor]);

  const mats = useMemo(() => makeGauntletMaterials(), []);
  useEffect(() => () => { for (const m of Object.values(mats)) m.dispose(); }, [mats]);

  // The fists' rest positions follow the window's aspect (render/viewmodel.js handAnchors), so both stay in frame on a
  // portrait iPad, and so do the swing and the charge (render/handPose.js): their frame scale and their fits are
  // recomputed only when the aspect changes, each sweep's fit the first time it plays at that aspect.
  const anchors = useMemo(() => ({
    right: new THREE.Vector3(), left: new THREE.Vector3(), aspect: 0, k: { x: 1, y: 1 }, swingFit: new Map(), chargeFit: 1,
    pose: { position: new THREE.Vector3(), rotation: [0, 0, 0] },
  }), []);
  const baseRightPos = anchors.right;
  const baseLeftPos = anchors.left;
  const restR = HAND_REST_ROT.right;
  const restL = HAND_REST_ROT.left;

  useFrame((state) => {
    if (rightHandRef.current && leftHandRef.current) {
      const aspect = state.size.height > 0 ? state.size.width / state.size.height : 1;
      if (aspect !== anchors.aspect) {
        handAnchors(aspect, VIEWMODEL.fov, anchors);
        anchors.aspect = aspect;
        anchors.k = frameScale(aspect);
        anchors.swingFit.clear();
        anchors.chargeFit = chargeFit(anchors.right, aspect, restR);
      }
      const pose = anchors.pose;
      const held = wandRef.current?.userData.rest;
      const time = state.clock.elapsedTime;
      // A lookbook still holds a pose in place of the clock (render/lookbookSeam.js handPose); null in play.
      const still = lookbookHandPose();
      const stillSweep = still?.kind === 'swing' ? slashSweep(still.step) : null;
      const swingElapsed = stillSweep ? still.t * stillSweep.durationS
        : still?.kind === 'cast' ? still.t * CAST_S
          : attackStartTime.current > 0 ? (state.clock.getElapsedTime() - attackStartTime.current) : 0;

      // THE LIGHT STRING reads in the hand (game/meleeString.js): step 1 sweeps right to left, step 2 comes back left to
      // right, the finisher sweeps wide and long. The swing in progress is a STRING swing only while the last light swing
      // is within its own sweep; otherwise (a heavy, a beast form's swing, nothing recent) the hand plays the step-1
      // sweep. handSwing chooses it once per swing and plays it out on this clock.
      const sw = still ? stillSweep
        : handSwing(swingLatch.current, attackStartTime.current, attackType === 'melee', performance.now(), swingElapsed);
      const isSwingingMelee = sw !== null;
      const isCastingSpell = still ? still.kind === 'cast' : attackType === 'spell' && swingElapsed < CAST_S;

      // Subtle high-frequency channeling vibrations on attack or cast
      const noiseX = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 65) + Math.cos(time * 87)) * 0.005 : 0;
      const noiseY = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 73) + Math.cos(time * 59)) * 0.005 : 0;
      const noiseZ = (isSwingingMelee || isCastingSpell) ? (Math.sin(time * 81) + Math.cos(time * 95)) * 0.005 : 0;

      if (isSwingingMelee) {
        const t = Math.min(1.0, swingElapsed / sw.durationS);

        // Diagonal slash sweep across the frame: right to left for dir +1, back for -1, wider for the finisher, with
        // the roll mirrored, fitted so the fist stays in frame at this aspect.
        let fit = anchors.swingFit.get(sw);
        if (fit === undefined) {
          fit = swingFit(sw, baseRightPos, aspect, restR);
          anchors.swingFit.set(sw, fit);
        }
        swingPose(t, sw, baseRightPos, aspect, fit, pose, restR);
        rightHandRef.current.position.set(pose.position.x + noiseX, pose.position.y + noiseY, pose.position.z + noiseZ);
        rightHandRef.current.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);

        // Left hand raises slightly to balance
        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + 0.12 * anchors.k.y * Math.sin(t * Math.PI) + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(restL[0] + 0.12 * Math.sin(t * Math.PI), restL[1], restL[2]);

        if (held) {
          // The held item keeps its rest pose in the fist; the swing is the hand's.
          wandRef.current.rotation.set(held.rotation[0], held.rotation[1], held.rotation[2]);
          wandRef.current.position.y = held.position[1];
        }
      } else if (isCastingSpell) {
        const attackTime = still ? still.t * Math.PI : time * 6;
        rightHandRef.current.position.set(
          baseRightPos.x + noiseX,
          baseRightPos.y + noiseY,
          baseRightPos.z + Math.sin(attackTime) * 0.04 + noiseZ
        );
        rightHandRef.current.rotation.set(restR[0] + Math.sin(attackTime) * 0.15, restR[1], restR[2]);

        leftHandRef.current.position.set(
          baseLeftPos.x + noiseX,
          baseLeftPos.y + noiseY,
          baseLeftPos.z + noiseZ
        );
        leftHandRef.current.rotation.set(restL[0] + Math.sin(attackTime + 1) * 0.1, restL[1], restL[2]);

        if (held) {
          wandRef.current.rotation.set(held.rotation[0] + Math.sin(attackTime) * 0.06, held.rotation[1], held.rotation[2]);
          wandRef.current.position.y = held.position[1] + Math.sin(attackTime) * 0.02;
        }
      } else {
        // Stable Idle
        rightHandRef.current.position.copy(baseRightPos);
        rightHandRef.current.rotation.set(restR[0], restR[1], restR[2]);
        // HEAVY MELEE charge (game/heavyAttack.js): the sword hand draws back and up as the charge builds, and trembles
        // once it is ready — the tell that the release will land heavy. Fitted so the fist stays in frame at this
        // aspect. Level 0 (no hold, and always under capture).
        const charge = still?.kind === 'charge' ? still.level : heavyChargeLevel(performance.now());
        if (charge > 0) {
          const shake = charge >= 1 ? Math.sin(time * 90) * 0.006 : 0;
          chargePose(charge, baseRightPos, aspect, anchors.chargeFit, pose, restR);
          rightHandRef.current.position.set(pose.position.x, pose.position.y + shake, pose.position.z);
          rightHandRef.current.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
        }

        leftHandRef.current.position.copy(baseLeftPos);
        leftHandRef.current.rotation.set(restL[0], restL[1], restL[2]);

        if (held) {
          wandRef.current.rotation.set(held.rotation[0], held.rotation[1], held.rotation[2]);
          wandRef.current.position.y = held.position[1];
        }
      }

      // The slash arc: sweeps diagonally, blooms in, then fades over the swing. In view space, so it reads like a blade arc.
      if (slashRef.current) {
        if (isSwingingMelee) {
          const t = Math.min(1, swingElapsed / sw.durationS);
          slashRef.current.visible = true;
          slashRef.current.rotation.z = (-1.15 + t * 2.3) * sw.dir;      // diagonal sweep, mirrored with the hand
          const s = (0.85 + t * 0.5) * anchors.k.y; slashRef.current.scale.set(s, s, s); // grow through the arc
          slashRef.current.material.opacity = Math.sin(t * Math.PI) * 0.85; // bloom in -> fade out
        } else if (slashRef.current.visible) {
          slashRef.current.visible = false;
          slashRef.current.material.opacity = 0;
        }
      }
    }
  });

  const isWeaponEquipped = ['Stone Sword', 'Iron Sword', 'Diamond Sword', 'sword'].includes(equippedWeapon);

  return (
    <group>
      {isWeaponEquipped && (
        <ProceduralRibbonTrail
          rightHandRef={rightHandRef}
          isSwinging={shownAttack === 'melee'}
          weaponType={equippedWeapon}
        />
      )}

      <mesh ref={slashRef} position={[0, -0.1, -1.0]} visible={false}>
        <ringGeometry args={[0.32, 0.62, 32, 1, Math.PI * 0.2, Math.PI * 0.85]} />
        <meshBasicMaterial color="#cdeeff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      <group ref={rightHandRef} rotation={restR}>
        <Gauntlet mats={mats}>
          {/* The transforms and userData.rest come from HELD_REST, so the authored pose and the frame loop's resets agree. */}
          {isWeaponEquipped ? (
            <group ref={wandRef} position={HELD_REST.weapon.position} rotation={HELD_REST.weapon.rotation} userData={{ rest: HELD_REST.weapon }}>
              <group scale={HELD_SCALE.weapon}>
                <ProceduralWeapon type={equippedWeapon} />
              </group>
            </group>
          ) : (
            <group ref={wandRef} position={HELD_REST.wand.position} rotation={HELD_REST.wand.rotation} userData={{ rest: HELD_REST.wand }}>
              <group scale={HELD_SCALE.wand}>
                <MagicWand wandType={activeSpell} />
              </group>
            </group>
          )}
          {shownAttack === 'spell' && <SpellHandEffects spellType={activeSpell} />}
        </Gauntlet>
      </group>
      <group ref={leftHandRef} rotation={restL}>
        <Gauntlet mats={mats}>
          {shownAttack === 'spell' && (
            <mesh position={[0, 0.14, -0.12]}>
              <sphereGeometry args={[0.07, 10, 10]} />
              <meshBasicMaterial color={orbColor} transparent opacity={0.9} />
            </mesh>
          )}
          {shownAttack !== 'spell' && selectedBlock && <HeldBlock blockId={selectedBlock} />}
        </Gauntlet>
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
