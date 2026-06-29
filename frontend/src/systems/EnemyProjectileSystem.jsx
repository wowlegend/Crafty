import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { stepEnemyProjectiles } from '../game/enemyProjectiles.js';

// EnemyProjectileSystem -- ranged-mob projectiles. Extracted VERBATIM from SimplifiedNPCSystem.jsx
// (v6 de-monolith A1.2); behavior unchanged. Self-contained: only top-level imports, no shared
// module-local state from the former host file.
//
// GLI fix (STATE-REVIEW-2026-06-10 BLOCKING #1): the live list is a REF mutated per frame by the
// pure stepper (src/game/enemyProjectiles.js); React state mirrors MEMBERSHIP only (spawn /
// expire / hit), so this component re-renders on transitions, never at render rate. Mesh
// positions are written transiently each frame below (same pattern as EnhancedMagicSystem).
export const EnemyProjectileSystem = () => {
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
    if (!camera) return; // early-frame guard (mirrors sibling systems) — camera.position below would throw
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
