import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedRigidBodies } from '@react-three/rapier';
import * as THREE from 'three';

const MAX_PARTICLES = 200;

export const BlockParticleSystem = ({ worker }) => {
    const api = useRef(null);
    const meshRef = useRef(null);
    const particleIndex = useRef(0);
    const ages = useRef(new Float32Array(MAX_PARTICLES).fill(999));
    
    // Initial hidden state
    const positions = useMemo(() => Array.from({ length: MAX_PARTICLES }, () => [0, -1000, 0]), []);
    const rotations = useMemo(() => Array.from({ length: MAX_PARTICLES }, () => [0, 0, 0]), []);
    const scales = useMemo(() => Array.from({ length: MAX_PARTICLES }, () => [0, 0, 0]), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useEffect(() => {
        if (!meshRef.current) return;
        
        // Initialize instance colors to prevent visual glitches on first spawn
        for (let i = 0; i < MAX_PARTICLES; i++) {
            meshRef.current.setColorAt(i, new THREE.Color(0x000000));
        }
        meshRef.current.instanceColor.needsUpdate = true;

        const handleMessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'block_broken' && api.current) {
                const count = 8;
                tempColor.set(payload.color);
                
                for (let i = 0; i < count; i++) {
                    const idx = particleIndex.current;
                    particleIndex.current = (particleIndex.current + 1) % MAX_PARTICLES;
                    
                    const x = payload.x + 0.5 + (Math.random() - 0.5) * 0.5;
                    const y = payload.y + 0.5 + (Math.random() - 0.5) * 0.5;
                    const z = payload.z + 0.5 + (Math.random() - 0.5) * 0.5;
                    
                    const vx = (Math.random() - 0.5) * 4;
                    const vy = Math.random() * 4 + 2;
                    const vz = (Math.random() - 0.5) * 4;
                    
                    // Wake up particle
                    ages.current[idx] = 0;
                    
                    // Reset physics state and teleport to visible location
                    api.current.at(idx).setTranslation({ x, y, z }, true);
                    api.current.at(idx).setLinvel({ x: vx, y: vy, z: vz }, true);
                    api.current.at(idx).setAngvel({ 
                        x: Math.random() * 10 - 5, 
                        y: Math.random() * 10 - 5, 
                        z: Math.random() * 10 - 5 
                    }, true);

                    // Apply the block's color to this specific instance
                    meshRef.current.setColorAt(idx, tempColor);
                }
                meshRef.current.instanceColor.needsUpdate = true;
            }
        };

        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
    }, [worker, tempColor]);

    const hidePosition = useMemo(() => ({ x: 0, y: -1000, z: 0 }), []);

    useFrame((state, delta) => {
        if (!meshRef.current || !api.current) return;
        
        // Custom scale matrix manipulation to shrink particles as they die
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (ages.current[i] < 2.0) {
                ages.current[i] += delta;
                
                if (ages.current[i] >= 2.0) {
                    // Teleport dead particle far away
                    api.current.at(i).setTranslation(hidePosition, true);
                }
            }
        }
    });

    return (
        <InstancedRigidBodies
            ref={api}
            positions={positions}
            rotations={rotations}
            scales={scales}
            colliders="cuboid"
            restitution={0.5}
            friction={0.8}
            mass={0.1}
        >
            <instancedMesh ref={meshRef} args={[null, null, MAX_PARTICLES]}>
                <boxGeometry args={[0.25, 0.25, 0.25]} />
                <meshLambertMaterial />
            </instancedMesh>
        </InstancedRigidBodies>
    );
};