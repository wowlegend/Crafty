import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { mobsQuery, alliesQuery } from '../ecs/world';
import { nametagFor } from '../game/nametagData.js';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

// Billboarded overhead nametags over mobs/NPCs/allies. Drives off the LIVE miniplex entities
// (mobsQuery + alliesQuery) + entity.health/maxHealth — the data already exists; this is a pure
// render layer. drei <Billboard> faces the camera; <Text> is GPU SDF (cheap, no DOM cost unlike
// <Html>). LOD-culled by nametagFor's range gate (transient store read of the player pos in
// useFrame, the Game-Loop-Isolation pattern — no reactive state bound to the hot loop). Capture-
// SUPPRESSED so the 20 visual baselines stay byte-identical. Color + health-bar width are written
// transiently per frame; the React tree re-renders only on entity membership change (spawn/despawn)
// via the same onEntityAdded/onEntityRemoved bridge the NPCSystem mob list uses.

// Membership-reactive subscription (mirrors SimplifiedNPCSystem's useEntities): re-render only when
// the entity SET changes, never at render rate — so a freshly spawned mob gets a tag mounted.
function useEntities(query) {
  const [entities, setEntities] = useState(() => [...query.entities]);
  useEffect(() => {
    const update = () => setEntities([...query.entities]);
    update();
    const unsubAdded = query.onEntityAdded.subscribe(update);
    const unsubRemoved = query.onEntityRemoved.subscribe(update);
    return () => { unsubAdded(); unsubRemoved(); };
  }, [query]);
  return entities;
}

function Tag({ entity }) {
  const groupRef = useRef();
  const textRef = useRef();
  const bgRef = useRef();
  const barRef = useRef();
  const barMatRef = useRef();
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const pp = useGameStore.getState().playerPosition;
    if (!pp || !entity.position) { g.visible = false; return; }
    const dx = entity.position.x - pp.x, dz = entity.position.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const tag = nametagFor(entity, dist);
    g.visible = tag.visible && entity.health > 0;
    if (!g.visible) return;
    g.position.set(entity.position.x, entity.position.y + 2.4, entity.position.z);
    if (textRef.current) { textRef.current.text = tag.text; textRef.current.color = tag.color; }
    // name-only tags (passive mobs / NPCs / bound allies return showBar:false) must NOT render the
    // dark bar BACKGROUND either — gate it with the same flag as the fill, else a stray empty
    // rectangle floats under the name (the M-HUD.5 name-only vs name+bar distinction).
    if (bgRef.current) bgRef.current.visible = tag.showBar;
    if (barRef.current) {
      barRef.current.visible = tag.showBar;
      barRef.current.scale.x = Math.max(0.001, tag.hpFrac);
      barRef.current.position.x = (tag.hpFrac - 1) * 0.5;
    }
    // bar color tracks the same danger ramp as the label (white -> amber -> red)
    if (barMatRef.current) barMatRef.current.color.set(tag.color);
  });
  return (
    <group ref={groupRef} visible={false}>
      <Billboard>
        <Text ref={textRef} fontSize={0.34} anchorX="center" anchorY="bottom" outlineWidth={0.02} outlineColor="#1A1206" position={[0, 0.2, 0]}>
          {entity.type}
        </Text>
        <mesh ref={bgRef} position={[0, 0, 0]} scale={[1, 0.12, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#1A1206" />
        </mesh>
        <mesh ref={barRef} position={[0, 0, 0.01]} scale={[1, 0.1, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial ref={barMatRef} color="#FF6B6B" />
        </mesh>
      </Billboard>
    </group>
  );
}

export const Nametags = React.memo(() => {
  // Hooks must run unconditionally (Rules of Hooks) — subscribe first, then capture-suppress the
  // OUTPUT so the deterministic visual baselines never see the overlay.
  const mobs = useEntities(mobsQuery);
  const allies = useEntities(alliesQuery);
  if (isCaptureMode()) return null;
  return (
    <group>
      {mobs.map((e) => (e && e.id != null ? <Tag key={'mob-' + e.id} entity={e} /> : null))}
      {allies.map((e) => (e && e.id != null ? <Tag key={'ally-' + e.id} entity={e} /> : null))}
    </group>
  );
});
