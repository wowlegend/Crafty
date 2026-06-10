import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { consumeHurlRequest, consumeSlamRequest } from '../game/hurlChannel';
import { makeHurl, stepHurlChunked, resolveSlam, resolveAnvil, HURL_DAMAGE, HURL_KNOCK, SLAM_DAMAGE_MULT } from '../game/hurl';

/**
 * HurlSystem — S2-B2-M3: consumes hurlChannel requests and runs the PURE flight/impact core.
 * Single-flight (one phantom in M1-M3). Impact application: damageMob(id, dmg, activeSpell) —
 * the element is read AT IMPACT (spec §3c: mid-hold spell-switch can't desync; activeSpell IS
 * the spark-type string) — plus the entity.knockback nudge (consumed by the NPC main loop).
 * Render = ONE transient mesh, visible only in flight (Game-Loop-Isolation: setState only on
 * the rare flight start/end membership transitions, never per frame). Capture-safe: requests
 * can't be produced in capture (clicks never route) and the stepper is also hard-gated below.
 * NO voxel/worker seams — gated by voidhand-noremesh-gates.
 */
const FLASH_SEC = 0.18; // M7: the one-shot white-hot impact core (the SpellProjectileCore recipe)

export function HurlSystem() {
  const flightRef = useRef(null); // { h, color }
  const meshRef = useRef();
  const [inFlight, setInFlight] = useState(false);
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

  useFrame((_, delta) => {
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
      fireFlash(slam.center, 3.0); // the AoE verb flashes wide (~the 3m slam radius as it expands)
      for (const ev of resolveSlam(slam.center, mobsQuery.entities)) {
        if (GameMethods.damageMob) GameMethods.damageMob(ev.id, Math.round(HURL_DAMAGE * SLAM_DAMAGE_MULT), element);
        const entity = mobsQuery.entities.find((e) => e.id === ev.id);
        if (entity) entity.knockback = [ev.dir.x * HURL_KNOCK, 2, ev.dir.z * HURL_KNOCK];
      }
    }

    const req = consumeHurlRequest();
    if (req && !flightRef.current) {
      flightRef.current = { h: makeHurl(req.origin, req.dir), color: req.color || '#A9966E' };
      setInFlight(true); // membership transition only
    }

    const f = flightRef.current;
    if (!f) return;
    const r = stepHurlChunked(f.h, delta, mobsQuery.entities); // substepped: frame spikes can't tunnel
    if (import.meta.env.DEV) {
      // observability transient (the __threeScene precedent): exact flight truth for smokes/devtools
      window.__hurlDebug = { age: f.h.age, x: f.h.position.x, y: f.h.position.y, z: f.h.position.z, done: r.done, hit: r.hit ? r.hit.id : null, delta };
    }
    if (meshRef.current) {
      meshRef.current.position.set(f.h.position.x, f.h.position.y, f.h.position.z);
      meshRef.current.rotation.x += delta * 6;
      meshRef.current.rotation.y += delta * 9;
    }
    if (r.hit) {
      const element = store.activeSpell; // read at impact
      // M4 BASE-AS-ANVIL: a wall within ANVIL_RANGE along the hurl line past the impact -> 3x
      // total ("building MATTERS in combat" — the design-closure loop, spec §3e). Walls stay
      // PRISTINE (Decision #3 rec). The gold "WALL HIT!" label is M7-T3.
      const anvil = GameMethods.castWorldRay ? resolveAnvil(GameMethods.castWorldRay, r.hit) : 1;
      fireFlash(r.hit.pos, anvil > 1 ? 2.2 : 1.6); // M7: the impact core (anvil hits flash bigger)
      if (GameMethods.damageMob) GameMethods.damageMob(r.hit.id, HURL_DAMAGE * anvil, element);
      const entity = mobsQuery.entities.find((e) => e.id === r.hit.id);
      if (entity) entity.knockback = [r.hit.dir.x * HURL_KNOCK, 2, r.hit.dir.z * HURL_KNOCK];
    }
    if (r.done) {
      flightRef.current = null;
      setInFlight(false); // membership transition only
    }
  });

  const color = (flightRef.current && flightRef.current.color) || '#A9966E';
  return (
    <group>
      {/* the M7 impact core — always mounted, visibility/scale/opacity driven transiently */}
      <mesh ref={flashMeshRef} visible={false}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshBasicMaterial color="#FFF6E8" toneMapped={false} transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {inFlight && (
        <mesh ref={meshRef}>
          <boxGeometry args={[0.85, 0.85, 0.85]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05}
            emissive={color} emissiveIntensity={0.22} />
        </mesh>
      )}
    </group>
  );
}
