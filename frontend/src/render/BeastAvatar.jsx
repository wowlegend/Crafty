import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { MobToonMaterial } from './MobToonMaterial';
import {
  beastAvatarParts, beastAvatarSpheres, boxDistance, sphereDistance, nearEye, haloRadius,
  SELF_CLEARANCE_M, FEET_OFFSET, BEAST_GLOW, EYE_LOCAL_Y, formLift,
} from './beastAvatarParts.js';
import { followHoldsView } from './followView.js';
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
const BURST_RADIUS = 0.5;

const _inv = new THREE.Matrix4();
const _eye = new THREE.Vector3();
const _feet = new THREE.Vector3();
const _cam = new THREE.Vector3();
/** The camera drawing this frame, in `group`'s own space (`group.matrixWorld` is current at draw time). */
function eyeInAvatar(group, camera) {
  _inv.copy(group.matrixWorld).invert();
  return _eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv);
}

/** Whether `camera` draws the player's own view: the follow placed it, or it stands at the steady eye, judged in world
 *  space (the group hangs FEET_OFFSET under the body's centre, unscaled; the entrance scales the parts inside it). */
function firstPerson(group, camera) {
  if (followHoldsView()) return true;
  _feet.setFromMatrixPosition(group.matrixWorld);
  _cam.setFromMatrixPosition(camera.matrixWorld);
  return nearEye(_cam.x - _feet.x, _cam.y - _feet.y - EYE_LOCAL_Y, _cam.z - _feet.z);
}

/** The group's uniform world scale: a distance measured in its space times this is metres. */
function worldScale(group) {
  const m = group.matrixWorld.elements;
  return Math.hypot(m[0], m[1], m[2]);
}

/**
 * The player's own beast, seen from the camera that draws it (beastAvatarParts.js SELF_CLEARANCE_M): in first person
 * nothing of it draws but its shadow (its light stays), and away from the eye a part nearer the camera than the
 * clearance, in metres, is not drawn. Judged in each mesh's onBeforeRender, after the Player's loop has placed the
 * camera this frame, so the reveal handing the view back to the eye hides the beast on that same frame. A hidden part
 * writes neither colour nor depth; a box still casts its shadow (the shadow pass reads no colour mask).
 * `distanceOf(e)` is the part's distance from `e`, a point in the space of `parts`, the group the parts stand in (at the
 * form's feet, with the entrance's scale); first person is judged on `group`, which hangs FEET_OFFSET under the body.
 */
function hideNearEye(mesh, group, parts, distanceOf) {
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const seen = !firstPerson(group, camera) && distanceOf(eyeInAvatar(parts, camera)) * worldScale(parts) >= SELF_CLEARANCE_M;
    mesh.material.colorWrite = seen;
    mesh.material.depthWrite = seen && mesh.userData.writesDepth === true;
  };
}

export function BeastAvatar() {
  const active = useGameStore((s) => s.beastFormActive);
  const charging = useGameStore((s) => s.beastCharging);
  const element = useGameStore((s) => s.activeBeastForm);
  const activeSpell = useGameStore((s) => s.activeSpell);
  const groupRef = useRef();
  const partsRef = useRef();
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

  // Each part judges, as it is drawn, whether the camera drawing it may see it (hideNearEye). Set once per form.
  useLayoutEffect(() => {
    const g = groupRef.current, p = partsRef.current;
    if (!active || !g || !p || !spheres) return;
    const boxes = beastAvatarParts(element).boxes;
    boxes.forEach((b, i) => {
      const m = boxRefs.current[i];
      if (!m) return;
      m.userData.writesDepth = true;
      hideNearEye(m, g, p, (e) => boxDistance(b, e.x, e.y, e.z));
    });
    const core = coreRef.current;
    if (core) {
      hideNearEye(core, g, p, (e) => sphereDistance(spheres.core, e.x, e.y, e.z));
      const hot = core.children.find((c) => c.isMesh);
      if (hot) hideNearEye(hot, g, p, (e) => sphereDistance(spheres.hotspot, e.x, e.y, e.z));
    }
    if (haloRef.current) hideNearEye(haloRef.current, g, p, (e) => sphereDistance(spheres.halo, e.x, e.y, e.z));
    const burst = burstRef.current;
    if (burst) {
      hideNearEye(burst, g, p, (e) => Math.hypot(e.x - spheres.core.pos[0], e.y - spheres.core.pos[1], e.z - spheres.core.pos[2])
        - BURST_RADIUS * burst.scale.x);
    }
  }, [active, element, spheres]);
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
    if (partsRef.current) {
      partsRef.current.scale.setScalar(ent.scale);
      partsRef.current.position.y = formLift(element, ent.scale); // the lowest point stays on the floor as it grows
    }

    if (coreRef.current) {
      const pulse = capture ? 1.08 : 1 + Math.sin(now * 3) * 0.08;
      coreRef.current.scale.setScalar(pulse + ent.flash * 0.9); // entry flash boosts the core
    }
    if (burstRef.current) {
      const bf = burstFlash(capture ? BURST_SEC + 1 : elapsed);
      burstRef.current.visible = bf.active;
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
          {/* the parts at the form's own feet: the frame sets their lift with the entrance's scale */}
          <group ref={partsRef}>
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
        </group>
      )}
    </group>
  );
}
