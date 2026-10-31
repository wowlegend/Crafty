import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedRigidBodies } from '@react-three/rapier';
import * as THREE from 'three';
import { parkDeadDebris } from '../game/debrisPark.js';
import { realDelta } from '../game/worldClock.js';
import { debrisBursts } from './debrisBursts.js';

const MAX_PARTICLES = 200;
const PARTICLES_PER_BLOCK = 8;
// Each body waits at its own spot under the world, a grid 0.5 m apart (the cubes are 0.25 m), so no two parked bodies
// touch and none wakes another.
const PARK_ROW = 20;
const parkSpot = (i) => ({ x: (i % PARK_ROW) * 0.5, y: -1000, z: Math.floor(i / PARK_ROW) * 0.5 });
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const NO_TURN = new THREE.Quaternion();
const _park = new THREE.Matrix4();
const _spot = new THREE.Vector3();

export const BlockParticleSystem = ({ worker }) => {
    const api = useRef(null);
    const meshRef = useRef(null);
    const particleIndex = useRef(0);
    const ages = useRef(new Float32Array(MAX_PARTICLES).fill(999));

    // rapier 2.2: InstancedRigidBodies takes a single `instances` prop (the legacy
    // positions/rotations/scales array props were removed -> passing them created ZERO bodies).
    // At FULL scale, so a body's matrix is visible the moment a burst wakes it; spawning teleports it in, ageing parks it.
    const instances = useMemo(
        () => Array.from({ length: MAX_PARTICLES }, (_, i) => {
            const p = parkSpot(i);
            return { key: i, position: [p.x, p.y, p.z], rotation: [0, 0, 0], scale: [1, 1, 1] };
        }),
        []
    );
    const parks = useMemo(() => Array.from({ length: MAX_PARTICLES }, (_, i) => parkSpot(i)), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    /** Body i parked asleep at its spot, and its instance drawn at zero scale: @react-three/rapier 2.2 writes no matrix for
     *  a sleeping body, so without this the cube stays drawn where it came to rest. */
    const park = (i) => {
        parkDeadDebris(api.current.at(i), parks[i]);
        const p = parks[i];
        meshRef.current.setMatrixAt(i, _park.compose(_spot.set(p.x, p.y, p.z), NO_TURN, ZERO_SCALE));
        meshRef.current.instanceMatrix.needsUpdate = true;
    };

    useEffect(() => {
        if (!meshRef.current) return;

        // Initialize instance colors to prevent visual glitches on first spawn
        for (let i = 0; i < MAX_PARTICLES; i++) {
            meshRef.current.setColorAt(i, new THREE.Color(0x000000));
        }
        meshRef.current.instanceColor.needsUpdate = true;
        // @react-three/rapier makes every body awake; parked asleep from mount, each costs the step nothing until a burst.
        if (api.current) for (let i = 0; i < MAX_PARTICLES; i++) park(i);

        const burst = (payload) => {
            tempColor.set(payload.color);
            
            for (let i = 0; i < PARTICLES_PER_BLOCK; i++) {
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
        };
        const handleMessage = (e) => {
            if (api.current) debrisBursts(e.data).forEach(burst);
        };

        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
    }, [worker, tempColor]);

    useFrame((state, frameDelta) => {
        // REAL time on purpose (review #3, R4.2): debris are Rapier bodies and the physics step is not paused for a
        // hitstop, so they keep falling through it. Their lifetime runs on the same clock as their fall; freezing
        // only the counter (as R2.6 first did) left them tumbling AND living longer by every freeze.
        const delta = realDelta(frameDelta);
        if (!meshRef.current || !api.current) return;
        
        // Age each live particle; at 2s it's "dead" and teleported far below the world (no scale change —
        // particles hold full scale for their whole 2s life).
        for (let i = 0; i < MAX_PARTICLES; i++) {
            if (ages.current[i] < 2.0) {
                ages.current[i] += delta;
                
                if (ages.current[i] >= 2.0) {
                    // PARK IT, do not just move it. `setTranslation(pos, true)` with wakeUp=true teleported
                    // the body to y=-1000 and WOKE IT, while leaving its velocity untouched -- so every
                    // dead debris chunk kept free-falling forever, accumulating speed, and could never
                    // sleep. Rapier steps an awake body every tick whether or not anyone can see it, so
                    // the cost of a mining session persisted for the rest of the run.
                    //
                    // Zero the velocities first, then move it with wakeUp=FALSE so the solver is allowed
                    // to put it to sleep. The order matters: waking it to move it and then zeroing would
                    // leave it awake until the sleep threshold elapsed again.
                    park(i);
                }
            }
        }
    });

    return (
        <InstancedRigidBodies
            ref={api}
            instances={instances}
            colliders="cuboid"
            restitution={0.5}
            friction={0.8}
            mass={0.1}
        >
            {/* Not frustum-culled: three bounds an InstancedMesh by a sphere computed once, from the parked instances, and
                culled the live debris wherever a block was mined. 200 cubes cost nothing to submit. */}
            <instancedMesh ref={meshRef} args={[null, null, MAX_PARTICLES]} frustumCulled={false}>
                <boxGeometry args={[0.25, 0.25, 0.25]} />
                <meshStandardMaterial roughness={0.8} metalness={0.1} />
            </instancedMesh>
        </InstancedRigidBodies>
    );
};