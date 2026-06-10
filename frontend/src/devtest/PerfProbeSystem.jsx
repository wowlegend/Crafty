import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { useGameStore } from '../store/useGameStore';
import { isPerfProbe, perfScenarioId, consumeHurl } from './perfProbe';
import { SCENARIOS } from './perfScenarios';

const POOL = 3;        // persistent dynamic bodies, cycled (mirrors M3's pooled-hurl design)
const HURL_SPEED = 22; // m/s — the M3 design ballpark
const CUBE = 0.85;     // the phantom's visual dims

/**
 * PerfProbeSystem — S2-B2-M2 scenario E ONLY (dev probe; GameScene mounts it inside <Physics>,
 * it self-nulls otherwise): a small pool of REAL Rapier dynamic bodies "hurled" from the player
 * on the runner's schedule. M1's phantom is render-only — zero physics presence — so this
 * stand-in supplies the broad-phase AABB + dynamic-body + impact cost M3's real hurl will add
 * (STATE-REVIEW-2026-06-10 §4 finding #11). Transient reads only (Game-Loop-Isolation).
 */
export function PerfProbeSystem() {
  const bodies = useRef([]);
  const nextRef = useRef(0);
  const headingRef = useRef(0);

  useFrame(() => {
    if (!consumeHurl()) return;
    const rb = bodies.current[nextRef.current % POOL];
    nextRef.current += 1;
    if (!rb) return;
    const p = useGameStore.getState().playerPosition;
    headingRef.current += 2.4; // deterministic spread around the player
    const dir = { x: Math.cos(headingRef.current), z: Math.sin(headingRef.current) };
    rb.setTranslation({ x: p.x + dir.x * 2, y: p.y + 1.2, z: p.z + dir.z * 2 }, true);
    rb.setLinvel({ x: dir.x * HURL_SPEED, y: 2, z: dir.z * HURL_SPEED }, true);
    rb.setAngvel({ x: 1, y: 2, z: 1 }, true);
  });

  const active = isPerfProbe() && SCENARIOS[perfScenarioId()] && SCENARIOS[perfScenarioId()].hurl;
  if (!active) return null;
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <RigidBody key={i} ref={(r) => { bodies.current[i] = r; }} type="dynamic"
          position={[0, -200 - i * 4, 0]} canSleep>
          <mesh>
            <boxGeometry args={[CUBE, CUBE, CUBE]} />
            <meshStandardMaterial color="#A9966E" />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
