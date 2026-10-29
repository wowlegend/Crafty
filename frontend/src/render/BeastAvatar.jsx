import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { MobToonMaterial } from './MobToonMaterial';
import {
  beastAvatarParts, beastAvatarSpheres, boxDistance, sphereDistance, isFirstPerson, haloRadius,
  SELF_CLEARANCE_M, FEET_OFFSET, BEAST_GLOW,
} from './beastAvatarParts.js';
import { elementForSpell } from '../game/beasts.js';
// The beast core's light mounts with the form: from the fixed light pool (render/lightPool.jsx).
import { PooledLight } from './lightPool.jsx';
import { ANTICIPATION_SEC } from '../game/beastTransform.js';
import { MORPH_SEC, BURST_SEC, morphEntrance, burstFlash, chargeGlow } from '../game/beastMorph.js';
import { isCaptureMode } from '../devtest/captureMode';

// The authored peak opacity of the anticipation glow. ONE constant, read by the JSX and by the
// per-frame ramp, so the two cannot disagree about what "full brightness" is.
const CHARGE_BASE_OPACITY = 0.85;

/**
 * BeastAvatar — S2-B1-M7b/M7c: the visible voxel beast the transform-cam (M7a) reveals, + the 3-beat
 * morph CHOREOGRAPHY (M7c).
 *
 * Look (③·5): a crisp `MobToonMaterial` DARK-INK body (never blooms — the Hades silhouette) + an
 * element-colored fresnel RIM + a tiny near-white `toneMapped={false}` HOT-CORE the global Bloom blows
 * out (Genshin radiance) + a faint back-halo.
 * Choreography: beat 1 ANTICIPATION = a growing element charge-glow at the player while the hold-roar
 * charge fills; beat 2 BURST = a bright additive flash that MASKS the collider/avatar swap frame; beat 3
 * SETTLE = the avatar pops into being (scale overshoot) + the entry flash eases to steady.
 *
 * Self-gates on beastFormActive/beastCharging (renders NOTHING as plain human -> FPV + the 16 capture
 * states unaffected). Mounted as a RigidBody child (at the player). Capture FREEZES to the SETTLED beast
 * (no entrance, no burst, no charge) -> byte-stable frame. Transient clock refs (Game-Loop-Isolation).
 */
export { FEET_OFFSET };
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
// S2-B1-M7d: Kevin's "punchy" glow pick, BAKED (the dev dial is gone). Scales the element glow
// (rim/core/halo/point-light) ONLY — never the dark-ink body, so the silhouette stays crisp.
const GLOW = BEAST_GLOW;
const _eye = new THREE.Vector3();
const BURST_RADIUS = 0.5;

export function BeastAvatar() {
  const active = useGameStore((s) => s.beastFormActive);
  const charging = useGameStore((s) => s.beastCharging);
  const element = useGameStore((s) => s.activeBeastForm);
  const activeSpell = useGameStore((s) => s.activeSpell);
  const groupRef = useRef();
  const boxRefs = useRef([]);
  const coreRef = useRef();
  const haloRef = useRef();
  const burstRef = useRef();
  const chargeRef = useRef();
  const entryRef = useRef(-1);       // clock time the beast became active (-1 = not yet)
  const chargeStartRef = useRef(-1); // clock time the anticipation charge began
  const { camera } = useThree();

  const parts = active ? beastAvatarParts(element) : null;
  const spheres = useMemo(() => (active ? beastAvatarSpheres(beastAvatarParts(element)) : null), [active, element]);

  // Publish the avatar's own group so a capture fixture can frame from WHERE IT RENDERS.
  // Same idiom as `playerRigidBodyRef` (transient ref in the store, read via getState — never a reactive
  // subscription, per Game-Loop-Isolation). This exists because framing off `rb.translation()` — and then
  // off a CONSTANT — both produced beast-less frames: under paused physics the RigidBody's visual transform
  // and its physics body diverge, and the visual one is what the camera must aim at. Measured 2026-08-08.
  useEffect(() => {
    if (!parts) return undefined;
    useGameStore.setState({ beastGroupRef: groupRef });
    return () => useGameStore.setState({ beastGroupRef: null });
  }, [!!parts]);
  const chargeEl = charging && !active ? elementForSpell(activeSpell) : null;
  const chargeColor = chargeEl ? beastAvatarParts(chargeEl)?.glowColor : null;

  useFrame((state) => {
    const capture = isCaptureMode();
    const now = state.clock.elapsedTime;

    // beat 1 — anticipation charge core: grows + brightens as the hold-roar charge fills.
    if (chargeRef.current && chargeColor) {
      if (chargeStartRef.current < 0) chargeStartRef.current = now;
      const cp = capture ? 1 : clamp01((now - chargeStartRef.current) / ANTICIPATION_SEC);
      const glow = chargeGlow(cp);
      chargeRef.current.scale.setScalar(glow.scale);
      // ...and the BRIGHTNESS half, which the ramp has always returned and nothing read. The docstring
      // says the anticipation glow "grows + brightens"; only the growing was wired, and the material's
      // opacity was a fixed literal. The scale ramp does read brighter through the bloom pass -- tripling
      // a sphere's screen area will -- but that is the growth doing the brightening's job, and the
      // declared per-pixel ramp was inert. Floor at the authored 0.85 * 0.35 so a charge that has just
      // begun is still visible rather than invisible.
      const mat = chargeRef.current.material;
      if (mat) mat.opacity = CHARGE_BASE_OPACITY * (0.35 + 0.65 * glow.intensity);
    } else {
      chargeStartRef.current = -1;
    }

    if (!parts || !groupRef.current) { entryRef.current = -1; return; }
    groupRef.current.rotation.y = camera.rotation.y; // face the look dir (cam sees the back-3/4)

    // beats 2+3 — the avatar entrance (scale-pop + flash) + the swap-masking burst. FROZEN to SETTLED
    // in capture (elapsed past the windows) so the regression frame is byte-stable.
    if (entryRef.current < 0) entryRef.current = now;
    const elapsed = capture ? MORPH_SEC + 1 : now - entryRef.current;
    const ent = morphEntrance(elapsed);
    groupRef.current.scale.setScalar(ent.scale);

    // The player's own beast, seen from the camera (beastAvatarParts.js SELF_CLEARANCE_M): in first person nothing of it
    // draws but its shadow (and its light, which stays), and away from the eye a part nearer the camera than the
    // clearance is not drawn. A hidden box writes neither colour nor depth and still casts its shadow; a hidden glow
    // sphere is not drawn.
    groupRef.current.updateWorldMatrix(true, false);
    groupRef.current.worldToLocal(camera.getWorldPosition(_eye));
    const away = !isFirstPerson(_eye.x, _eye.y, _eye.z);
    for (let i = 0; i < parts.boxes.length; i++) {
      const mesh = boxRefs.current[i];
      if (!mesh) continue;
      const seen = away && boxDistance(parts.boxes[i], _eye.x, _eye.y, _eye.z) >= SELF_CLEARANCE_M;
      mesh.material.colorWrite = seen;
      mesh.material.depthWrite = seen;
    }
    if (coreRef.current) {
      const pulse = capture ? 1.08 : 1 + Math.sin(now * 3) * 0.08;
      coreRef.current.scale.setScalar(pulse + ent.flash * 0.9); // entry flash boosts the core
      coreRef.current.visible = away && sphereDistance(spheres.core, _eye.x, _eye.y, _eye.z) >= SELF_CLEARANCE_M;
    }
    if (haloRef.current) {
      haloRef.current.visible = away && sphereDistance(spheres.halo, _eye.x, _eye.y, _eye.z) >= SELF_CLEARANCE_M;
    }
    if (burstRef.current) {
      const bf = burstFlash(capture ? BURST_SEC + 1 : elapsed);
      const d = Math.hypot(_eye.x - parts.core.pos[0], _eye.y - parts.core.pos[1], _eye.z - parts.core.pos[2]);
      burstRef.current.visible = bf.active && away && d - BURST_RADIUS * bf.scale >= SELF_CLEARANCE_M;
      if (bf.active) {
        burstRef.current.scale.setScalar(bf.scale);
        if (burstRef.current.material) burstRef.current.material.opacity = bf.opacity;
      }
    }
  });

  if (!parts && !chargeColor) return null;

  return (
    <group>
      {/* beat 1 — ANTICIPATION charge core at the player chest (element-colored, grows with the charge) */}
      {chargeColor && (
        <mesh ref={chargeRef} position={[0, FEET_OFFSET + 1.0, 0]} renderOrder={3}>
          <sphereGeometry args={[0.22, 14, 14]} />
          <meshBasicMaterial color={chargeColor} toneMapped={false} transparent opacity={CHARGE_BASE_OPACITY}
            blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          <mesh>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={1}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          </mesh>
        </mesh>
      )}

      {parts && (
        <group ref={groupRef} position={[0, FEET_OFFSET, 0]}>
          {/* (1) SILHOUETTE — dark-ink toon body + element rim (toneMapped, crisp) */}
          {parts.boxes.map((b, i) => (
            <mesh key={i} ref={(m) => { boxRefs.current[i] = m; }} position={b.pos} rotation={b.rot} castShadow>
              <boxGeometry args={b.size} />
              <MobToonMaterial color={parts.bodyColor} rimColor={parts.glowColor} rimStrength={1.15 * GLOW * parts.rimBoost} />
            </mesh>
          ))}

          {/* (2) HOT-CORE — near-white additive heart + nested pure-white hotspot (clips past bloom) */}
          <mesh ref={coreRef} position={parts.core.pos} renderOrder={2}>
            <sphereGeometry args={[parts.core.radius * 0.6, 14, 14]} />
            <meshBasicMaterial color={parts.coreColor} toneMapped={false} transparent opacity={Math.min(1, 0.95 * GLOW)}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
            <mesh renderOrder={3}>
              <sphereGeometry args={[parts.core.radius * 0.32, 10, 10]} />
              <meshBasicMaterial color="#FFFFFF" toneMapped={false} transparent opacity={1}
                blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
            </mesh>
          </mesh>

          {/* (3) a single faint back-halo (BackSide) — a touch of aura behind the silhouette */}
          <mesh ref={haloRef} position={parts.core.pos} renderOrder={1}>
            <sphereGeometry args={[haloRadius(parts), 16, 16]} />
            <meshBasicMaterial color={parts.glowColor} toneMapped={false} transparent opacity={Math.min(0.55, 0.3 * GLOW)}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
          </mesh>

          {/* beat 2 — the BURST flash at the core: masks the collider/avatar swap, gone when settled */}
          <mesh ref={burstRef} position={parts.core.pos} renderOrder={4} visible={false}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial color={parts.coreColor} toneMapped={false} transparent opacity={1}
              blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
          </mesh>

          <PooledLight color={parts.glowColor} intensity={3 * GLOW} distance={6} decay={2} position={parts.core.pos} lightsHands={false} />
        </group>
      )}
    </group>
  );
}
