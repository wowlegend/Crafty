import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { consumeHurlRequest, consumeSlamRequest } from '../game/hurlChannel';
import { adoptHurlRequest, flightSlot, stepHurlChunked, resolveSlam, resolveAnvil, HURL_DAMAGE, HURL_KNOCK, SLAM_DAMAGE_MULT, MAX_FLIGHTS } from '../game/hurl';
import { warnIfNotWorldSpace } from './sceneSpace.js';
import { worldDelta } from '../game/worldClock.js';

/**
 * HurlSystem — S2-B2-M3: consumes hurlChannel requests and runs the PURE flight/impact core.
 * Up to MAX_FLIGHTS blocks fly at once, so a grab that keeps a second block throws it at once without cutting the first
 * short (game/hurl.js flightSlot). Impact application: damageMob(id, dmg, activeSpell) — the element is read AT IMPACT
 * (spec §3c: mid-hold spell-switch can't desync; activeSpell IS the spark-type string) — plus the entity.knockback
 * nudge (consumed by the NPC main loop). Render = a pool of MAX_FLIGHTS meshes, always mounted, shown, moved and tinted
 * by transient writes (Game-Loop-Isolation: no setState). Capture-safe: requests can't be produced in capture (clicks
 * never route) and the stepper is also hard-gated below. NO voxel/worker seams — gated by voidhand-noremesh-gates.
 */
const FLASH_SEC = 0.18; // M7: the one-shot white-hot impact core (the SpellProjectileCore recipe)
const BLOCK_COLOR = '#A9966E';

export function HurlSystem() {
  const slotsRef = useRef(Array.from({ length: MAX_FLIGHTS }, () => null)); // each { h, color } or null
  const meshesRef = useRef([]);
  const setMesh = useMemo(() => Array.from({ length: MAX_FLIGHTS }, (_, i) => (m) => { meshesRef.current[i] = m; }), []);
  // M7 impact flash: ONE always-mounted additive core, driven transiently (visible/scale/opacity
  // in useFrame — the #68 cover-aura pattern; zero setState, zero light-count change). Fired at
  // hurl impacts (small) + slam resolves (wider). Capture-inert: impacts never occur in capture.
  const flashMeshRef = useRef();
  const flashRef = useRef({ t: 0, base: 1 });
  const fireFlash = (pos, base) => {
    flashRef.current.t = FLASH_SEC;
    flashRef.current.base = base;
    if (flashMeshRef.current) flashMeshRef.current.position.set(pos.x, pos.y, pos.z);
  };

  useFrame((_, frameDelta) => {
    const delta = worldDelta(frameDelta); // a hurled block hangs mid-flight through a hitstop (R2.6)
    // DEV guard: this component writes WORLD coordinates, so its parent must be untransformed.
    // It was mounted inside the player's RigidBody until 2026-08-09 and rendered at player+world.
    if (import.meta.env.DEV) warnIfNotWorldSpace(meshesRef.current[0], 'HurlSystem');
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    // decay the impact flash (transient writes only)
    const fl = flashRef.current;
    if (flashMeshRef.current) {
      if (fl.t > 0) {
        fl.t -= delta;
        const k = Math.max(fl.t, 0) / FLASH_SEC;
        flashMeshRef.current.visible = fl.t > 0;
        flashMeshRef.current.scale.setScalar(fl.base * (1.6 - 0.6 * k)); // expands as it fades
        flashMeshRef.current.material.opacity = 0.9 * k;
      } else if (flashMeshRef.current.visible) {
        flashMeshRef.current.visible = false;
      }
    }

    const slam = consumeSlamRequest();
    if (slam) {
      const element = store.activeSpell; // read at impact
      const radius = store.getVerbMods().slamRadius; // Singularity widens it (game/verbMods.js)
      fireFlash(slam.center, radius); // the AoE verb flashes as wide as the slam reaches
      // M8 feel-distinctness: SLAM is the HEAVY verb — a camera kick the ranged hurl doesn't get
      // (hurl impacts already carry hitstop via damageMob; this is the slam's own signature).
      if (store.triggerCameraShake) store.triggerCameraShake(1.4);
      for (const ev of resolveSlam(slam.center, mobsQuery.entities, radius)) {
        if (GameMethods.damageMob) GameMethods.damageMob(ev.id, Math.round(HURL_DAMAGE * SLAM_DAMAGE_MULT), element);
        const entity = mobsQuery.entities.find((e) => e.id === ev.id);
        if (entity) entity.knockback = [ev.dir.x * HURL_KNOCK, 2, ev.dir.z * HURL_KNOCK];
      }
    }

    const slots = slotsRef.current;
    const adopted = adoptHurlRequest(consumeHurlRequest());
    if (adopted) {
      const i = flightSlot(slots);
      slots[i] = adopted;
      const m = meshesRef.current[i];
      if (m) {
        m.material.color.set(adopted.color);
        m.material.emissive.set(adopted.color);
        m.visible = true;
      }
    }

    for (let i = 0; i < slots.length; i++) {
      const f = slots[i];
      if (!f) continue;
      const r = stepHurlChunked(f.h, delta, mobsQuery.entities); // substepped: frame spikes can't tunnel
      if (import.meta.env.DEV) {
        // observability transient (the __threeScene precedent): exact flight truth for smokes/devtools
        window.__hurlDebug = { slot: i, age: f.h.age, x: f.h.position.x, y: f.h.position.y, z: f.h.position.z, done: r.done, hit: r.hit ? r.hit.id : null, delta };
      }
      const m = meshesRef.current[i];
      if (m) {
        m.position.set(f.h.position.x, f.h.position.y, f.h.position.z);
        m.rotation.x += delta * 6;
        m.rotation.y += delta * 9;
      }
      if (r.hit) {
        const element = store.activeSpell; // read at impact
        // M4 BASE-AS-ANVIL: a wall within ANVIL_RANGE along the hurl line past the impact -> 3x
        // total ("building MATTERS in combat" — the design-closure loop, spec §3e). Walls stay
        // PRISTINE (Decision #3 rec). The gold "WALL HIT!" label is M7-T3.
        const anvil = GameMethods.castWorldRay ? resolveAnvil(GameMethods.castWorldRay, r.hit) : 1;
        fireFlash(r.hit.pos, anvil > 1 ? 2.2 : 1.6); // M7: the impact core (anvil hits flash bigger)
        if (anvil > 1 && GameMethods.spawnAnvilText) GameMethods.spawnAnvilText(r.hit.pos); // M7-T3: gold WALL HIT!
        if (anvil > 1 && store.playSpatialSound) store.playSpatialSound('anvilHit', [r.hit.pos.x, r.hit.pos.y, r.hit.pos.z], 1, 35); // AUDIO: the gold ping
        if (GameMethods.damageMob) GameMethods.damageMob(r.hit.id, HURL_DAMAGE * anvil, element);
        const entity = mobsQuery.entities.find((e) => e.id === r.hit.id);
        if (entity) entity.knockback = [r.hit.dir.x * HURL_KNOCK, 2, r.hit.dir.z * HURL_KNOCK];
      }
      if (r.done) {
        slots[i] = null;
        if (m) m.visible = false;
      }
    }
  });

  return (
    <group>
      {/* the M7 impact core — always mounted, visibility/scale/opacity driven transiently */}
      <mesh ref={flashMeshRef} visible={false}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshBasicMaterial color="#FFF6E8" toneMapped={false} transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {setMesh.map((ref, i) => (
        <mesh key={i} ref={ref} visible={false}>
          <boxGeometry args={[0.85, 0.85, 0.85]} />
          <meshStandardMaterial color={BLOCK_COLOR} roughness={0.7} metalness={0.05}
            emissive={BLOCK_COLOR} emissiveIntensity={0.22} />
        </mesh>
      ))}
    </group>
  );
}
