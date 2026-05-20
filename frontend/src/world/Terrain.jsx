import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import TerrainWorker from './terrain.worker.js?worker';
import { BlockParticleSystem } from './BlockParticleSystem';

const worker = new TerrainWorker();
worker.postMessage({ type: 'init', payload: { seed: 12345 } });

const ChunkMesh = React.memo(({ cx, cz, meshData }) => {
    if (!meshData || meshData.positions.length === 0) return null;

    const geometry = React.useMemo(() => {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
        geom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        geom.computeBoundingSphere();
        return geom;
    }, [meshData]);

    const geomKey = `${meshData.positions.length}_${meshData.indices.length}`;

    return (
        <group position={[cx * 16, 0, cz * 16]} key={geomKey}>
            <mesh geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial roughness={1.0} metalness={0.0} vertexColors={true} />
            </mesh>
            <RigidBody type="fixed" colliders={false}>
                <TrimeshCollider args={[meshData.positions, meshData.indices]} />
            </RigidBody>
        </group>
    );
});

// --- TARGET BLOCK OUTLINE ---
const TargetOutline = () => {
    const meshRef = useRef();
    const { camera } = useThree();
    const { rapier, world } = useRapier();
    const lastCast = useRef(0);
    const lastCameraPos = useRef(new THREE.Vector3());
    const lastCameraRot = useRef(new THREE.Vector3());

    const boxGeometry = React.useMemo(() => new THREE.BoxGeometry(1.01, 1.01, 1.01), []);
    const camRotVec = React.useMemo(() => new THREE.Vector3(), []);
    const direction = React.useMemo(() => new THREE.Vector3(), []);

    useFrame((state) => {
        if (!meshRef.current || !world || !document.pointerLockElement) {
            if (meshRef.current) meshRef.current.visible = false;
            return;
        }

        const now = state.clock.elapsedTime;
        camRotVec.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
        const posDeltaSq = camera.position.distanceToSquared(lastCameraPos.current);
        const rotDeltaSq = camRotVec.distanceToSquared(lastCameraRot.current);
        
        // Throttled raycast: Only update at 20Hz OR if camera moved/rotated significantly
        if (now - lastCast.current < 0.05 && posDeltaSq < 0.001 && rotDeltaSq < 0.001) {
            return; // Skip raycast, retain current outline position
        }
        
        lastCast.current = now;
        lastCameraPos.current.copy(camera.position);
        lastCameraRot.current.copy(camRotVec);

        camera.getWorldDirection(direction);
        const rayStart = camera.position;
        
        const ray = new rapier.Ray(
            { x: rayStart.x, y: rayStart.y, z: rayStart.z },
            { x: direction.x, y: direction.y, z: direction.z }
        );
        
        const hit = world.castRay(ray, 8.0, true);
        if (hit) {
            const hitPoint = rayStart.clone().add(direction.multiplyScalar(hit.toi));
            // Step slightly IN to the block to ensure we target the hit block's voxel grid
            const targetPos = hitPoint.clone().add(direction.clone().multiplyScalar(0.01));
            
            const tx = Math.floor(targetPos.x) + 0.5;
            const ty = Math.floor(targetPos.y) + 0.5;
            const tz = Math.floor(targetPos.z) + 0.5;
            
            meshRef.current.position.set(tx, ty, tz);
            meshRef.current.visible = true;
        } else {
            meshRef.current.visible = false;
        }
    });

    return (
        <lineSegments ref={meshRef} visible={false}>
            <edgesGeometry args={[boxGeometry]} />
            <lineBasicMaterial color="#ffffff" opacity={0.5} transparent depthTest={true} />
        </lineSegments>
    );
};

export const MinecraftWorld = React.memo(() => {
    const gameState = useGameStore();
    const { camera } = useThree();
    const { rapier, world } = useRapier();
    const { playBlockPlace, playBlockBreak } = useGameSounds();

    const [chunks, setChunks] = useState({});
    const chunksRef = useRef(new Set());

    // Expose worker to Zustand store
    useEffect(() => {
        useGameStore.setState({ terrainWorker: worker });
        return () => {
            useGameStore.setState({ terrainWorker: null });
        };
    }, []);

    const CHUNK_SIZE = 16;
    const RENDER_DISTANCE = 4; // Max visible chunks radially

    // Worker message listener
    useEffect(() => {
        const handleMessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'chunk_mesh') {
                const key = `${payload.cx}_${payload.cz}`;
                chunksRef.current.add(key);
                setChunks(prev => ({
                    ...prev,
                    [key]: { cx: payload.cx, cz: payload.cz, meshData: payload }
                }));
                // Signal game ready if spawn chunk generates
                if (payload.cx === 0 && payload.cz === 0) {
                    useGameStore.getState().setIsSpawnChunkLoaded(true);
                }
            } else if (type === 'block_broken') {
                // Phase 12: Collect block logic
                const store = useGameStore.getState();
                const BLOCK_ID_MAP = { 1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand', 5: 'snow', 6: 'wood', 7: 'leaves', 8: 'cactus' };
                const blockName = BLOCK_ID_MAP[payload.blockType];
                if (blockName && store.addToInventory) {
                    store.addToInventory(blockName, 1);
                }
            } else if (type === 'load_modifications_done') {
                setChunks({});
                chunksRef.current.clear();
            }
        };
        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
    }, []);

    // Provide ground level approximation for NPCs via top-down physics raycast
    useEffect(() => {
        useGameStore.getState().setGetGeneratedChunks(() => chunksRef.current);
        
        useGameStore.getState().setGetMobGroundLevel((x, z) => {
            const ray = new rapier.Ray({ x, y: 255, z }, { x: 0, y: -1, z: 0 });
            const hit = world.castRay(ray, 300, true);
            if (hit) {
                return 255 - (hit.toi !== undefined ? hit.toi : hit.timeOfImpact);
            }
            return 15;
        });

        // Simplified collision check using physics
        useGameStore.getState().setCheckCollision((x, y, z) => {
            const ray = new rapier.Ray({ x, y: y + 0.1, z }, { x: 0, y: -1, z: 0 });
            const hit = world.castRay(ray, 0.2, true);
            return !!hit;
        });

        return () => {
            useGameStore.getState().setGetGeneratedChunks(null);
            useGameStore.getState().setGetMobGroundLevel(null);
            useGameStore.getState().setCheckCollision(null);
        };
    }, [rapier, world]);

    // Progressive chunk loading
    useEffect(() => {
        let isProcessing = true;
        const requestedChunks = new Set();

        const processChunks = () => {
            if (!isProcessing || !camera) return;

            const playerCx = Math.floor(camera.position.x / CHUNK_SIZE);
            const playerCz = Math.floor(camera.position.z / CHUNK_SIZE);

            setChunks(currentChunks => {
                const newChunks = { ...currentChunks };
                let requestsThisTick = 0;

                // Box generation around player
                for (let nx = -RENDER_DISTANCE; nx <= RENDER_DISTANCE; nx++) {
                    for (let nz = -RENDER_DISTANCE; nz <= RENDER_DISTANCE; nz++) {
                        const cx = playerCx + nx;
                        const cz = playerCz + nz;
                        const key = `${cx}_${cz}`;
                        
                        if (!newChunks[key] && !requestedChunks.has(key)) {
                            requestedChunks.add(key);
                            worker.postMessage({ type: 'generate', payload: { cx, cz } });
                            requestsThisTick++;
                            if (requestsThisTick >= 2) break; // Throttle to prevent worker overload
                        }
                    }
                    if (requestsThisTick >= 2) break;
                }

                // Cull chunks far outside render distance
                const cullDist = RENDER_DISTANCE + 2;
                Object.keys(newChunks).forEach(key => {
                    const c = newChunks[key];
                    if (Math.abs(c.cx - playerCx) > cullDist || Math.abs(c.cz - playerCz) > cullDist) {
                        worker.postMessage({ type: 'unload', payload: { cx: c.cx, cz: c.cz } });
                        delete newChunks[key];
                        requestedChunks.delete(key);
                    }
                });

                return newChunks;
            });

            if (isProcessing) {
                setTimeout(processChunks, 150); // Check every 150ms
            }
        };

        // Kick off loop
        setTimeout(processChunks, 100);

        return () => { isProcessing = false; };
    }, [camera]);

    // Raycast interaction
    useEffect(() => {
        const handleClick = (e) => {
            if (!document.pointerLockElement) return;

            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            const rayStart = camera.position.clone();
            
            const ray = new rapier.Ray(
                { x: rayStart.x, y: rayStart.y, z: rayStart.z },
                { x: direction.x, y: direction.y, z: direction.z }
            );
            
            const hit = world.castRayAndGetNormal(ray, 8.0, true);
            if (!hit) return;
            
            const hitPoint = rayStart.clone().add(direction.multiplyScalar(hit.toi));
            
            let tx, ty, tz;
            const type = useGameStore.getState().selectedBlock || 'grass';
            
            // Map string ID to worker numeric ID
            const blockIdMap = { 'grass': 1, 'dirt': 2, 'stone': 3, 'wood': 3, 'sand': 2 };
            const numericType = blockIdMap[type] || 1;

            if (e.button === 0) {
                // DELETE
                const deletePos = hitPoint.clone().add(direction.clone().multiplyScalar(0.01));
                tx = Math.floor(deletePos.x);
                ty = Math.floor(deletePos.y);
                tz = Math.floor(deletePos.z);
                
                const cx = Math.floor(tx / CHUNK_SIZE);
                const cz = Math.floor(tz / CHUNK_SIZE);
                const lx = tx - cx * CHUNK_SIZE;
                const lz = tz - cz * CHUNK_SIZE;
                
                worker.postMessage({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: 0 } });
                playBlockBreak(hitPoint);

                // Update worldBlocks in Zustand Map
                const store = useGameStore.getState();
                const newBlocks = new Map(store.worldBlocks);
                newBlocks.set(`${tx}_${ty}_${tz}`, 0);
                store.setWorldBlocks(newBlocks);

            } else if (e.button === 2) {
                // PLACE
                const placeDirection = hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) : direction.clone().multiplyScalar(-1);
                const placePos = hitPoint.clone().add(placeDirection.multiplyScalar(0.01));
                tx = Math.floor(placePos.x);
                ty = Math.floor(placePos.y);
                tz = Math.floor(placePos.z);
                
                const cx = Math.floor(tx / CHUNK_SIZE);
                const cz = Math.floor(tz / CHUNK_SIZE);
                const lx = tx - cx * CHUNK_SIZE;
                const lz = tz - cz * CHUNK_SIZE;
                
                worker.postMessage({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: numericType } });
                playBlockPlace(placePos, useGameStore.getState().selectedBlock);

                // Update worldBlocks in Zustand Map
                const store = useGameStore.getState();
                const newBlocks = new Map(store.worldBlocks);
                newBlocks.set(`${tx}_${ty}_${tz}`, numericType);
                store.setWorldBlocks(newBlocks);
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [camera, rapier, world]);

    return (
        <group>
            <fog attach="fog" args={['#87CEEB', 20, (RENDER_DISTANCE * CHUNK_SIZE) - 5]} />
            {Object.values(chunks).filter(c => c.meshData).map(chunk => (
                <ChunkMesh key={`${chunk.cx}_${chunk.cz}`} cx={chunk.cx} cz={chunk.cz} meshData={chunk.meshData} />
            ))}
            <TargetOutline />
            <BlockParticleSystem worker={worker} />
        </group>
    );
});