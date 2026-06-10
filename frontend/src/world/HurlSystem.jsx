import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { consumeHurlRequest, consumeSlamRequest } from '../game/hurlChannel';
import { makeHurl, stepHurlChunked, resolveSlam, HURL_DAMAGE, HURL_KNOCK, SLAM_DAMAGE_MULT } from '../game/hurl';

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
export function HurlSystem() {
  const flightRef = useRef(null); // { h, color }
  const meshRef = useRef();
  const [inFlight, setInFlight] = useState(false);

  useFrame((_, delta) => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    const slam = consumeSlamRequest();
    if (slam) {
      const element = store.activeSpell; // read at impact
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
      if (GameMethods.damageMob) GameMethods.damageMob(r.hit.id, HURL_DAMAGE, element);
      const entity = mobsQuery.entities.find((e) => e.id === r.hit.id);
      if (entity) entity.knockback = [r.hit.dir.x * HURL_KNOCK, 2, r.hit.dir.z * HURL_KNOCK];
      // M4 anvil seam: r.hit.pos + r.hit.dir are where the wall ray + 3x bonus land.
    }
    if (r.done) {
      flightRef.current = null;
      setInFlight(false); // membership transition only
    }
  });

  if (!inFlight) return null;
  const color = (flightRef.current && flightRef.current.color) || '#A9966E';
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.85, 0.85, 0.85]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}
