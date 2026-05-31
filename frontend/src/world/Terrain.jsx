import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import TerrainWorker from './terrain.worker.js?worker';
import { BlockParticleSystem } from './BlockParticleSystem';
import { createProceduralVoxelTextures } from './proceduralTextures';
import { isCaptureMode } from '../devtest/captureMode';

const worker = new TerrainWorker();
worker.postMessage({ type: 'init', payload: { seed: 12345 } });

const voxelTextures = createProceduralVoxelTextures();

// Shared SOTA Terrain Material with GPU wave sways and night bioluminescence
// Shared SOTA Terrain Materials with GPU wave sways and night bioluminescence
const opaqueMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.1,
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide
});

const waterMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.15,
    metalness: 0.1,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide
});

const compileShader = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.timeOfDay = { value: 1.0 }; // 1.0 = Day, 0.0 = Night
    shader.uniforms.voxelTextures = { value: voxelTextures };

    // Vertex Shader: Procedural undulating waves for water blocks
    shader.vertexShader = `
        uniform float time;
        uniform float timeOfDay;
        flat varying float vBlockType;
        #ifndef USE_UV
        varying vec2 vUv;
        #endif
        ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `
        void main() {
            vBlockType = color.r;
            vUv = uv;
        `
    );

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Check if vertex is water by its blockType index in color.r attribute (9.0)
        bool isWater = (abs(color.r - 9.0) < 0.1);
        if (isWater) {
            // Compute a world-aligned coordinate for coherent wave structures across chunk boundaries
            vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            float waveX = sin(time * 2.5 + worldPosition.x * 0.8) * 0.12;
            float waveZ = cos(time * 2.0 + worldPosition.z * 0.8) * 0.12;
            transformed.y += waveX + waveZ - 0.05; // slightly lower to reduce z-fighting with shorelines
        }
        `
    );

    // Fragment Shader: Glowing neon blue bioluminescent pulse during Night
    shader.fragmentShader = `
        precision highp sampler2DArray;
        uniform sampler2DArray voxelTextures;
        uniform float time;
        uniform float timeOfDay;
        flat varying float vBlockType;
        #ifndef USE_UV
        varying vec2 vUv;
        #endif
        ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        float layerIndex = floor(vBlockType + 0.5); // Round to nearest integer to prevent floating-point interpolation drift/truncation to layer 0
        
        // Sample nearest pixel-art repeating tile coordinates from array layer
        vec4 texColor = texture(voxelTextures, vec3(fract(vUv.x), fract(vUv.y), layerIndex));
        
        // Set ocean block transparency
        float customAlpha = 1.0;
        bool isWaterPixel = (abs(layerIndex - 9.0) < 0.1);
        if (isWaterPixel) {
            customAlpha = 0.75;
        }

        // Set the diffuse color to the sampled texture (before lighting calculations).
        // The DataArrayTexture stores sRGB-display bytes but is sampled through a
        // custom sampler2DArray (so material.colorSpace is a no-op). Decode to linear
        // here, upstream of lighting, so PBR + the renderer's sRGB output are correct.
        diffuseColor = vec4(diffuse * pow(texColor.rgb, vec3(2.2)), texColor.a * customAlpha);
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        #include <opaque_fragment>
        
        if (abs(vBlockType - 9.0) < 0.1) {
            float nightFactor = 1.0 - timeOfDay;
            // Pulsing bioluminescence frequency
            float pulse = sin(time * 1.5 + vViewPosition.y * 3.0) * 0.5 + 0.5;
            vec3 bioluminescence = vec3(0.0, 0.45, 0.9) * pulse * 0.65 * nightFactor;
            gl_FragColor.rgb += bioluminescence;
        }
        `
    );
};

opaqueMaterial.onBeforeCompile = (shader) => {
    compileShader(shader);
    opaqueMaterial.userData.shader = shader;
};

waterMaterial.onBeforeCompile = (shader) => {
    compileShader(shader);
    waterMaterial.userData.shader = shader;
};

const ChunkMesh = React.memo(({ cx, cz, meshData, onMount, onUnmount }) => {
    if (!meshData || meshData.positions.length === 0) return null;

    React.useEffect(() => {
        const key = `${cx}_${cz}`;
        if (onMount) onMount(key);
        return () => {
            if (onUnmount) onUnmount(key);
        };
    }, [cx, cz, onMount, onUnmount]);
    const [opaqueGeometry, waterGeometry] = React.useMemo(() => {
        const indices = meshData.indices;
        const colors = meshData.colors;
        const opaqueIndicesArr = [];
        const waterIndicesArr = [];
        
        for (let i = 0; i < indices.length; i += 3) {
            const idx0 = indices[i];
            const blockType = colors[idx0 * 3];
            const isWater = Math.abs(blockType - 9.0) < 0.1;
            
            if (isWater) {
                waterIndicesArr.push(indices[i], indices[i+1], indices[i+2]);
            } else {
                opaqueIndicesArr.push(indices[i], indices[i+1], indices[i+2]);
            }
        }
        
        let opaqueGeom = null;
        if (opaqueIndicesArr.length > 0) {
            opaqueGeom = new THREE.BufferGeometry();
            opaqueGeom.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
            opaqueGeom.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
            if (meshData.uvs) {
                opaqueGeom.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
            }
            // Bind the standard colors array directly to the 'color' attribute
            opaqueGeom.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
            
            opaqueGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(opaqueIndicesArr), 1));
            opaqueGeom.computeBoundingSphere();
        }
        
        let waterGeom = null;
        if (waterIndicesArr.length > 0) {
            waterGeom = new THREE.BufferGeometry();
            waterGeom.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
            waterGeom.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
            if (meshData.uvs) {
                waterGeom.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
            }
            // Bind the standard colors array directly to the 'color' attribute
            waterGeom.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
            
            waterGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(waterIndicesArr), 1));
            waterGeom.computeBoundingSphere();
        }
        
        return [opaqueGeom, waterGeom];
    }, [meshData]);
 
    React.useEffect(() => {
        return () => {
            if (opaqueGeometry) opaqueGeometry.dispose();
            if (waterGeometry) waterGeometry.dispose();
        };
    }, [opaqueGeometry, waterGeometry]);

    return (
        <group position={[cx * 16, 0, cz * 16]}>
            {opaqueGeometry && (
                <mesh geometry={opaqueGeometry} material={opaqueMaterial} castShadow receiveShadow />
            )}
            {waterGeometry && (
                <mesh geometry={waterGeometry} material={waterMaterial} castShadow receiveShadow />
            )}
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
    const playerRigidBodyRef = useGameStore(state => state.playerRigidBodyRef);
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
        
        const playerRigidBody = playerRigidBodyRef?.current;
        const playerHandle = playerRigidBody?.handle;
        const filterPredicate = (collider) => {
            if (playerHandle === undefined) return true;
            const parent = collider.parent();
            return !parent || parent.handle !== playerHandle;
        };
        const hit = world.castRay(ray, 8.0, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
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

// --- 3D TREASURE CHEST RENDERER ---
const TreasureChestsRender = () => {
    const chests = useGameStore(state => state.treasureChestsList || []);
    
    return (
        <group>
            {chests.map(chest => (
                <group key={chest.id} position={chest.position}>
                    {/* Visual chest box */}
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[1.0, 0.8, 0.8]} />
                        <meshStandardMaterial 
                            color="#d4af37" // Premium Gold
                            roughness={0.15}
                            metalness={0.85}
                            emissive="#b8860b" // Goldenrod pulse
                            emissiveIntensity={0.2}
                        />
                    </mesh>
                    {/* Locked clasp (silver latch) */}
                    <mesh position={[0, 0, 0.41]}>
                        <boxGeometry args={[0.15, 0.25, 0.05]} />
                        <meshStandardMaterial color="#c0c0c0" roughness={0.1} metalness={0.9} />
                    </mesh>
                    {/* Floating beacon orb */}
                    <mesh position={[0, 1.1, 0]}>
                        <sphereGeometry args={[0.12, 8, 8]} />
                        <meshBasicMaterial color="#ffd700" />
                    </mesh>
                    <pointLight position={[0, 1.1, 0]} intensity={1.5} distance={6} color="#ffd700" />
                </group>
            ))}
        </group>
    );
};

export const MinecraftWorld = React.memo(() => {
    const { camera } = useThree();
    const { rapier, world } = useRapier();
    const { playBlockPlace, playBlockBreak } = useGameSounds();

    // Update shared terrain shader uniforms
    useFrame((state) => {
        const time = state.clock.elapsedTime;
        const isDay = useGameStore.getState().isDay;
        const targetTimeOfDay = isDay ? 1.0 : 0.0;

        const opaqueShader = opaqueMaterial.userData.shader;
        if (opaqueShader) {
            opaqueShader.uniforms.time.value = time;
            opaqueShader.uniforms.timeOfDay.value = THREE.MathUtils.lerp(
                opaqueShader.uniforms.timeOfDay.value,
                targetTimeOfDay,
                0.05
            );
        }

        const waterShader = waterMaterial.userData.shader;
        if (waterShader) {
            waterShader.uniforms.time.value = time;
            waterShader.uniforms.timeOfDay.value = THREE.MathUtils.lerp(
                waterShader.uniforms.timeOfDay.value,
                targetTimeOfDay,
                0.05
            );
        }
    });

    const [chunks, setChunks] = useState({});
    const chunksRef = useRef(new Set());

    const handleMount = React.useCallback((key) => {
        chunksRef.current.add(key);
    }, []);

    const handleUnmount = React.useCallback((key) => {
        chunksRef.current.delete(key);
    }, []);

    // Expose chunks state for debugging
    useEffect(() => {
        useGameStore.setState({ debugChunks: chunks });
        return () => {
            useGameStore.setState({ debugChunks: null });
        };
    }, [chunks]);

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
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            const playerHandle = playerRigidBody?.handle;
            const filterPredicate = (collider) => {
                if (playerHandle === undefined) return true;
                const parent = collider.parent();
                return !parent || parent.handle !== playerHandle;
            };

            // Jitter the coordinates slightly by +0.1 to avoid falling directly between voxel seams
            const jitterX = x + 0.1;
            const jitterZ = z + 0.1;

            const ray = new rapier.Ray({ x: jitterX, y: 255, z: jitterZ }, { x: 0, y: -1, z: 0 });
            const hit = world.castRay(ray, 300, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
            if (hit) {
                return 255 - (hit.toi !== undefined ? hit.toi : hit.timeOfImpact);
            }
            return null;
        });

        // Simplified collision check using physics
        useGameStore.getState().setCheckCollision((x, y, z) => {
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            const playerHandle = playerRigidBody?.handle;
            const filterPredicate = (collider) => {
                if (playerHandle === undefined) return true;
                const parent = collider.parent();
                return !parent || parent.handle !== playerHandle;
            };

            const ray = new rapier.Ray({ x, y: y + 0.1, z }, { x: 0, y: -1, z: 0 });
            const hit = world.castRay(ray, 0.2, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
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
                let changed = false;

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
                        changed = true;
                    }
                });

                return changed ? newChunks : currentChunks;
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

            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            const playerHandle = playerRigidBody?.handle;

            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            const rayStart = camera.position.clone();
            
            const ray = new rapier.Ray(
                { x: rayStart.x, y: rayStart.y, z: rayStart.z },
                { x: direction.x, y: direction.y, z: direction.z }
            );
            
            const filterPredicate = (collider) => {
                if (playerHandle === undefined) return true;
                const parent = collider.parent();
                return !parent || parent.handle !== playerHandle;
            };
            
            const hit = world.castRayAndGetNormal(ray, 8.0, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
            if (!hit) return;
            
            const hitPoint = rayStart.clone().add(direction.multiplyScalar(hit.toi));
            
            let tx, ty, tz;
            const type = useGameStore.getState().selectedBlock || 'grass';
            
            // Map string ID to worker numeric ID
            const blockIdMap = {
                'grass': 1,
                'dirt': 2,
                'stone': 3,
                'wood': 6,
                'birch_wood': 6,
                'leaves': 7,
                'glass': 3,
                'water': 4,
                'lava': 3,
                'diamond': 3,
                'gold': 3,
                'iron': 3,
                'coal': 3,
                'sand': 4,
                'cobblestone': 3,
                'flower_red': 7,
                'flower_yellow': 7,
                'chest': 6
            };
            const numericType = blockIdMap[type] || 1;

            const deletePos = hitPoint.clone().add(direction.clone().multiplyScalar(0.01));
            const targetedX = Math.floor(deletePos.x);
            const targetedY = Math.floor(deletePos.y);
            const targetedZ = Math.floor(deletePos.z);
            const targetCoords = `${targetedX}_${targetedY}_${targetedZ}`;
            const store = useGameStore.getState();

            if (e.button === 2) {
                // Intercept Right Click if targeting an existing placed chest
                if (store.chests && store.chests.has(targetCoords)) {
                    store.setActiveChestCoords(targetCoords);
                    store.setShowChestInterface(true);
                    if (document.exitPointerLock) {
                        document.exitPointerLock();
                    }
                    return;
                }
            }

            if (e.button === 0) {
                // DELETE
                tx = targetedX;
                ty = targetedY;
                tz = targetedZ;
                
                const cx = Math.floor(tx / CHUNK_SIZE);
                const cz = Math.floor(tz / CHUNK_SIZE);
                const lx = tx - cx * CHUNK_SIZE;
                const lz = tz - cz * CHUNK_SIZE;
                
                worker.postMessage({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: 0 } });
                playBlockBreak(hitPoint);

                // Update worldBlocks in Zustand Map
                const newBlocks = new Map(store.worldBlocks);
                newBlocks.set(`${tx}_${ty}_${tz}`, 0);
                store.setWorldBlocks(newBlocks);

                // Clean up chest in Zustand Map
                if (store.chests && store.chests.has(targetCoords)) {
                    const newChests = new Map(store.chests);
                    newChests.delete(targetCoords);
                    useGameStore.setState({ chests: newChests });
                }

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
                const newBlocks = new Map(store.worldBlocks);
                newBlocks.set(`${tx}_${ty}_${tz}`, numericType);
                store.setWorldBlocks(newBlocks);

                // Initialize chest in Zustand Map
                if (type === 'chest') {
                    const newChests = new Map(store.chests);
                    newChests.set(`${tx}_${ty}_${tz}`, { inventory: {}, name: 'Wooden Chest' });
                    useGameStore.setState({ chests: newChests });
                }
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [camera, rapier, world]);

    // Worker `chunk_mesh` messages arrive in non-deterministic order, so the chunk
    // insertion order (and thus three.js transparent-mesh sort order for water) varies
    // per run. In dev capture mode, sort chunks by key so the rendered frame is stable.
    const renderChunks = (() => {
        const list = Object.values(chunks).filter(c => c.meshData);
        if (isCaptureMode()) {
            list.sort((a, b) => (a.cx - b.cx) || (a.cz - b.cz));
        }
        return list;
    })();

    return (
        <group>
            {renderChunks.map(chunk => (
                <ChunkMesh
                    key={`${chunk.cx}_${chunk.cz}`} 
                    cx={chunk.cx} 
                    cz={chunk.cz} 
                    meshData={chunk.meshData} 
                    onMount={handleMount}
                    onUnmount={handleUnmount}
                />
            ))}
            <TargetOutline />
            <BlockParticleSystem worker={worker} />
            <TreasureChestsRender />
        </group>
    );
});