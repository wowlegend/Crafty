import React, { useRef, useState, useEffect } from 'react';
import { MINE_GAIN, PLACE_GAIN } from '../game/resonance.js';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { RigidBody, TrimeshCollider, useRapier } from '@react-three/rapier';
import TerrainWorker from './terrain.worker.js?worker';
import { BlockParticleSystem } from './BlockParticleSystem';
import { createProceduralVoxelTextures } from './proceduralTextures';
import { isCaptureMode } from '../devtest/captureMode';
import { GameMethods } from '../GameMethods';
import { moodRef } from '../render/mood';
import { Outlines } from '@react-three/drei';
import { OUTLINE } from '../render/characterStyle';
import { TIERS } from '../render/quality';
import { Cube, Emissive } from '../render/mascots/voxelKit';
import { SEA_LEVEL } from './oceanProfile.js';

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
    shader.uniforms.mood = { value: 0.0 }; // 0 explore, 1 dusk, 2 obsidian (spec §4)
    shader.uniforms.voxelTextures = { value: voxelTextures };

    // Vertex Shader: Procedural undulating waves for water blocks
    shader.vertexShader = `
        uniform float time;
        uniform float timeOfDay;
        flat varying float vBlockType;
        varying float vWorldY;
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
        vWorldY = (modelMatrix * vec4(position, 1.0)).y; // M5a: world height for the water depth-tint
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
        uniform float mood;
        flat varying float vBlockType;
        varying float vWorldY;
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

        // M5a depth-tint: water darkens + shifts to deep-navy with depth below SEA_LEVEL (the M2
        // divable basins now READ deep). Static (vWorldY geometry) -> capture-stable. Water-gated.
        if (isWaterPixel) {
            float wdepth = clamp((${SEA_LEVEL}.0 - vWorldY) / 22.0, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.09, 0.20), wdepth * 0.82);
        }

        // Danger-mood grade (spec §4): terrain cools + desaturates toward dusk, near-monochrome
        // at obsidian. LUMINANCE-PRESERVING (no darkening) so dusk stays readable — the per-mood
        // LIGHTING sets brightness. Gentle at dusk (danger<=1), strong only at obsidian (danger 1->2).
        float danger = clamp(mood, 0.0, 2.0);
        float moodLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float desat = danger <= 1.0 ? danger * 0.18 : 0.18 + (danger - 1.0) * 0.54;
        vec3 coolGrey = vec3(moodLum * 0.92, moodLum * 0.96, moodLum * 1.06);
        diffuseColor.rgb = mix(diffuseColor.rgb, coolGrey, clamp(desat, 0.0, 0.75));
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
                <mesh geometry={waterGeometry} material={waterMaterial} receiveShadow />
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
            // #72 sweep fix: `timeOfImpact`, not the legacy `toi` (undefined -> NaN target ->
            // the block-target outline never resolved a real voxel).
            const hitPoint = rayStart.clone().add(direction.multiplyScalar(hit.timeOfImpact));
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
    const qualityTier = useGameStore(state => state.qualityTier) || 'low';
    const charOutline = (TIERS[qualityTier] || TIERS.low).charOutline;

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
                        {charOutline && <Outlines thickness={OUTLINE.prop.thickness} color={OUTLINE.color} toneMapped={false} />}
                    </mesh>
                    {/* Locked clasp (silver latch) */}
                    <mesh position={[0, 0, 0.41]}>
                        <boxGeometry args={[0.15, 0.25, 0.05]} />
                        <meshStandardMaterial color="#c0c0c0" roughness={0.1} metalness={0.9} />
                    </mesh>
                    {/* Floating beacon orb — suppressed in capture so the studio
                        character-closeup card reads clean (orb + its pointLight are
                        gameplay affordances, not part of the prop's render language). */}
                    {!isCaptureMode() && (
                        <>
                            <mesh position={[0, 1.1, 0]}>
                                <sphereGeometry args={[0.12, 8, 8]} />
                                <meshBasicMaterial color="#ffd700" />
                            </mesh>
                            <pointLight position={[0, 1.1, 0]} intensity={1.5} distance={6} color="#ffd700" />
                        </>
                    )}
                </group>
            ))}
        </group>
    );
};

// --- THE HEARTH: the crafted home-anchor decoration (World-Design M1) ---
// The voxel PLINTH is baked at gen (world/homeAnchor.js, top at HEARTH_Y=32); THIS group is the
// building read on top of it. Built from voxelKit Cube/Emissive (the shared toon+rim+ink character
// look) — NOT PBR. Sibling of TreasureChestsRender. Static (one fixed place at origin, no store
// read). The brazier glow + its light self-null under isCaptureMode (the chest-beacon pattern) so
// the studio cards stay clean; the toon cubes freeze naturally (no animation).
const HEARTH_TOP = 56; // mirrors HEARTH_Y in world/homeAnchor.js (the plinth cap; ≈y50 origin grade + raise)
const HomeAnchorRender = () => {
    const WOOD = '#6B4A2F', STONE = '#8A8A8A', ROOF = '#7A3B2E', LEAF = '#3E7D32';
    return (
        <group position={[0, HEARTH_TOP + 0.5, 0]}>
            {/* the lodge — set back so it frames the spawn vista without blocking it */}
            <group position={[-2.5, 0, -2.5]}>
                <Cube position={[0, 0.15, 0]} size={[3.4, 0.6, 3.4]} color={STONE} castShadow={false} />
                <Cube position={[0, 1.0, 0]} size={[3.0, 2.4, 3.0]} color={WOOD} castShadow={false} />
                <Cube position={[0, 2.55, 0]} size={[3.6, 0.5, 3.6]} color={ROOF} castShadow={false} />
                <Cube position={[0, 3.05, 0]} size={[2.4, 0.5, 2.4]} color={ROOF} castShadow={false} />
                <Cube position={[0, 0.9, 1.55]} size={[0.9, 1.6, 0.12]} color="#2A1C12" outline={0} castShadow={false} />
            </group>
            {/* the brazier — a stone bowl on a post + a glowing ember (capture-null) */}
            <group position={[2.4, 0, 2.4]}>
                <Cube position={[0, 0.5, 0]} size={[0.4, 1.0, 0.4]} color={STONE} castShadow={false} />
                <Cube position={[0, 1.1, 0]} size={[0.7, 0.3, 0.7]} color="#5A5A5A" castShadow={false} />
                {!isCaptureMode() && (
                    <>
                        <Emissive position={[0, 1.35, 0]} size={0.34} color="#FF7A1A" intensity={2.8} />
                        <pointLight position={[0, 1.6, 0]} intensity={1.6} distance={9} color="#FF8A2A" />
                    </>
                )}
            </group>
            {/* two leaf planters flanking the lodge */}
            <Cube position={[-2.5, 0.3, 1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
            <Cube position={[2.7, 0.3, -1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
        </group>
    );
};

export const MinecraftWorld = React.memo(() => {
    const { camera } = useThree();
    const { rapier, world } = useRapier();
    const { playBlockPlace, playBlockBreak } = useGameSounds();

    // Update shared terrain shader uniforms
    useFrame((state) => {
        // Dev capture-determinism: pin the shader clock to a fixed value so the water
        // waves + night bioluminescence shimmer hold a frozen frame across capture runs
        // (wall-clock elapsedTime differs run-to-run -> ground-plane jitter). Inert in
        // normal gameplay — falls through to the live clock so the surface animates as before.
        const time = isCaptureMode() ? 0 : state.clock.elapsedTime;
        const mood = moodRef.current;                                   // smoothed by <Atmosphere>
        const timeOfDay = 1.0 - THREE.MathUtils.clamp(mood, 0.0, 1.0);   // night/obsidian -> 0 (biolum on)

        const opaqueShader = opaqueMaterial.userData.shader;
        if (opaqueShader) {
            opaqueShader.uniforms.time.value = time;
            opaqueShader.uniforms.timeOfDay.value = timeOfDay;
            opaqueShader.uniforms.mood.value = mood;
        }
        const waterShader = waterMaterial.userData.shader;
        if (waterShader) {
            waterShader.uniforms.time.value = time;
            waterShader.uniforms.timeOfDay.value = timeOfDay;
            waterShader.uniforms.mood.value = mood;
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
    // S2-A-M4a: the chunk load/cull radius now DERIVES from the quality tier's
    // renderDistance lever (TIERS.low 2 / med 3 / high 4) instead of a hardcoded 4.
    // Read transiently per chunk-load tick (the processChunks setTimeout loop, NOT a
    // useFrame subscription -> Game-Loop-Isolation safe). high == 4 == the legacy
    // constant, and capture forces high, so the forced-high baselines are unchanged.

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
        
        // S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #2): ONE reusable Ray + ONE persistent filter
        // closure. This is the hottest physics call in the game — AI height grids, leg IK, weather
        // particles, XP orbs and loot drops all route here; the previous per-call `new rapier.Ray`
        // + closure allocation was the dominant steady-state GC source (~2k calls/frame worst-case
        // siege-rainstorm). Probe semantics unchanged (same origin height, dir, toi, jitter).
        let probePlayerHandle;
        const probeFilter = (collider) => {
            if (probePlayerHandle === undefined) return true;
            const parent = collider.parent();
            return !parent || parent.handle !== probePlayerHandle;
        };
        const probeRay = new rapier.Ray({ x: 0, y: 255, z: 0 }, { x: 0, y: -1, z: 0 });

        useGameStore.getState().setGetMobGroundLevel((x, z) => {
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            probePlayerHandle = playerRigidBody?.handle;
            // Jitter the coordinates slightly by +0.1 to avoid falling directly between voxel seams
            probeRay.origin.x = x + 0.1;
            probeRay.origin.y = 255;
            probeRay.origin.z = z + 0.1;
            const hit = world.castRay(probeRay, 300, true, undefined, undefined, undefined, playerRigidBody, probeFilter);
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

            // Transient tier read (no reactive subscription): the active quality tier's
            // renderDistance gates how many chunks load/cull around the player. Falls back
            // to `low` if the tier key is somehow unknown.
            const tier = useGameStore.getState().qualityTier;
            const renderDistance = (TIERS[tier] || TIERS.low).renderDistance;

            const playerCx = Math.floor(camera.position.x / CHUNK_SIZE);
            const playerCz = Math.floor(camera.position.z / CHUNK_SIZE);

            setChunks(currentChunks => {
                const newChunks = { ...currentChunks };
                let requestsThisTick = 0;
                let changed = false;

                // Box generation around player
                for (let nx = -renderDistance; nx <= renderDistance; nx++) {
                    for (let nz = -renderDistance; nz <= renderDistance; nz++) {
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
                const cullDist = renderDistance + 2;
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

    // #72 VERB ROUTER: Terrain no longer listens to the mouse (the double-fire defect — design:
    // docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md). It OWNS the single 8m
    // build ray + the mine/place/open executors (worker + Rapier stay HERE, off the gated
    // Components path) and registers them on the GameMethods registry; the ONE Components
    // listener routes each click to exactly one verb and passes the SAME ray hit back in.
    useEffect(() => {
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

        // The single per-click build ray. null on no-hit; else everything the router needs
        // (toi, chestTargeted) plus everything the executors need (hitPoint/normal/coords).
        // NOTE (preserved quirk): multiplyScalar MUTATES `direction` to dir*toi, and the
        // original deletePos/place-fallback offsets used that scaled vector — kept verbatim.
        const castBuildRay = () => {
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
            if (!hit) return null;

            // #72 smoke-found fix: this rapier build exposes `timeOfImpact` — the legacy `hit.toi`
            // is undefined at runtime (typings agree), so the OLD listener computed NaN coordinates:
            // instant mine/place at HEAD was silently broken (junk "NaN_NaN_NaN" worldBlocks keys,
            // break/place SFX with no real edit). Verified via the executor smoke + ray.d.ts.
            const toi = hit.timeOfImpact;
            const hitPoint = rayStart.clone().add(direction.multiplyScalar(toi));

            const deletePos = hitPoint.clone().add(direction.clone().multiplyScalar(0.01));
            const targetedX = Math.floor(deletePos.x);
            const targetedY = Math.floor(deletePos.y);
            const targetedZ = Math.floor(deletePos.z);
            const targetCoords = `${targetedX}_${targetedY}_${targetedZ}`;
            const store = useGameStore.getState();

            return {
                toi,
                normal: hit.normal ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null,
                direction,
                hitPoint,
                targetedX,
                targetedY,
                targetedZ,
                targetCoords,
                chestTargeted: !!(store.chests && store.chests.has(targetCoords)),
            };
        };

        const mine = (h) => {
            if (!h) return;
            const store = useGameStore.getState();
            // DELETE
            const tx = h.targetedX;
            const ty = h.targetedY;
            const tz = h.targetedZ;

            const cx = Math.floor(tx / CHUNK_SIZE);
            const cz = Math.floor(tz / CHUNK_SIZE);
            const lx = tx - cx * CHUNK_SIZE;
            const lz = tz - cz * CHUNK_SIZE;

            worker.postMessage({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: 0 } });
            playBlockBreak(h.hitPoint);
            // S2-B4-M2: building charges the chemistry (day-only; capture never runs executors)
            if (store.isDay) store.accrueResonance(MINE_GAIN);

            // Update worldBlocks in Zustand Map
            const newBlocks = new Map(store.worldBlocks);
            newBlocks.set(`${tx}_${ty}_${tz}`, 0);
            store.setWorldBlocks(newBlocks);

            // Clean up chest in Zustand Map
            if (store.chests && store.chests.has(h.targetCoords)) {
                const newChests = new Map(store.chests);
                newChests.delete(h.targetCoords);
                useGameStore.setState({ chests: newChests });
            }
        };

        const place = (h) => {
            if (!h) return;
            const store = useGameStore.getState();
            const type = store.selectedBlock || 'grass';
            const numericType = blockIdMap[type] || 1;
            // PLACE
            const placeDirection = h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : h.direction.clone().multiplyScalar(-1);
            const placePos = h.hitPoint.clone().add(placeDirection.multiplyScalar(0.01));
            const tx = Math.floor(placePos.x);
            const ty = Math.floor(placePos.y);
            const tz = Math.floor(placePos.z);

            const cx = Math.floor(tx / CHUNK_SIZE);
            const cz = Math.floor(tz / CHUNK_SIZE);
            const lx = tx - cx * CHUNK_SIZE;
            const lz = tz - cz * CHUNK_SIZE;

            worker.postMessage({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: numericType } });
            // S2-B4-M2: placing banks MORE than digging (the build-verb economy)
            if (store.isDay) store.accrueResonance(PLACE_GAIN);
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
        };

        const open = (h) => {
            if (!h || !h.chestTargeted) return;
            const store = useGameStore.getState();
            store.setActiveChestCoords(h.targetCoords);
            store.setShowChestInterface(true);
            if (document.exitPointerLock) {
                document.exitPointerLock();
            }
        };

        // M4: parametrized world ray (the anvil wall check) — same player-filtered cast, any origin/dir.
        const castWorldRay = (origin, dir, maxToi) => {
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            const playerHandle = playerRigidBody?.handle;
            const ray = new rapier.Ray(origin, dir);
            const filterPredicate = (collider) => {
                if (playerHandle === undefined) return true;
                const parent = collider.parent();
                return !parent || parent.handle !== playerHandle;
            };
            const h = world.castRay(ray, maxToi, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
            return h ? { toi: h.timeOfImpact } : null;
        };

        GameMethods.castBuildRay = castBuildRay;
        GameMethods.castWorldRay = castWorldRay;
        GameMethods.terrainVerbs = { mine, place, open };
        return () => {
            delete GameMethods.castBuildRay;
            delete GameMethods.castWorldRay;
            delete GameMethods.terrainVerbs;
        };
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
            <HomeAnchorRender />
        </group>
    );
});