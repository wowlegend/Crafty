import React, { useState, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';

const Particle = ({ position, velocity, color }) => {
    const meshRef = useRef();
    const age = useRef(0);

    useFrame((state, delta) => {
        age.current += delta;
        if (meshRef.current && age.current > 1.0) {
            const scale = Math.max(0, 1 - (age.current - 1.0));
            meshRef.current.scale.setScalar(scale);
        }
    });

    return (
        <RigidBody 
            type="dynamic" 
            position={position} 
            linearVelocity={velocity}
            angularVelocity={[Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5]}
            colliders="cuboid"
            restitution={0.5}
            friction={0.8}
            mass={0.1}
        >
            <mesh ref={meshRef}>
                <boxGeometry args={[0.25, 0.25, 0.25]} />
                <meshLambertMaterial color={color} />
            </mesh>
        </RigidBody>
    );
};

const ParticleBurst = ({ burst, onComplete }) => {
    const age = useRef(0);
    const completed = useRef(false);

    useFrame((state, delta) => {
        age.current += delta;
        if (age.current > 2.0 && !completed.current) {
            completed.current = true;
            onComplete(burst.id);
        }
    });

    return (
        <group>
            {burst.particles.map((p, i) => (
                <Particle key={i} position={p.position} velocity={p.velocity} color={burst.color} />
            ))}
        </group>
    );
};

export const BlockParticleSystem = ({ worker }) => {
    const [bursts, setBursts] = useState([]);
    const nextId = useRef(0);

    useEffect(() => {
        const handleMessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'block_broken') {
                const particles = [];
                // Spawn 8 tiny cubes
                for (let i = 0; i < 8; i++) {
                    particles.push({
                        position: [
                            payload.x + 0.5 + (Math.random() - 0.5) * 0.5,
                            payload.y + 0.5 + (Math.random() - 0.5) * 0.5,
                            payload.z + 0.5 + (Math.random() - 0.5) * 0.5
                        ],
                        velocity: [
                            (Math.random() - 0.5) * 4,
                            Math.random() * 4 + 2, // Shoot upwards
                            (Math.random() - 0.5) * 4
                        ]
                    });
                }

                setBursts(prev => [...prev, {
                    id: nextId.current++,
                    color: payload.color,
                    particles
                }]);
            }
        };

        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
    }, [worker]);

    const removeBurst = (id) => {
        setBursts(prev => prev.filter(b => b.id !== id));
    };

    return (
        <group>
            {bursts.map(burst => (
                <ParticleBurst key={burst.id} burst={burst} onComplete={removeBurst} />
            ))}
        </group>
    );
};
