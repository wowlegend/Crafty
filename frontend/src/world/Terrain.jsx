import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { RigidBody, TrimeshCollider, useRapier, useAfterPhysicsStep } from '@react-three/rapier';
import TerrainWorker from './terrain.worker.js?worker';
import { BlockParticleSystem } from './BlockParticleSystem';
import { OptimizedGrassSystem, GrassWindDriver } from '../OptimizedGrassSystem';
import { terrainMaterial } from './terrainMaterial.js';
import { isCaptureMode } from '../devtest/captureMode';
import { GameMethods } from '../GameMethods';
import { getInput } from '../input/inputState';
import { moodRef, skyFrameRef, sunDirRef, cloudCoverRef } from '../render/mood';
import { registerTestHook } from '../devtest/testBridge.js';
import { frameElapsed } from '../devtest/captureClock.js';
import { Outlines } from '@react-three/drei';
import { OUTLINE } from '../render/characterStyle';
import { TIERS } from '../render/quality';
import { renderDistanceFor } from '../render/tierGovernor.js';
import { markShadowWorldChanged } from '../render/shadowSchedule.js';
// A chest beacon mounts and unmounts with its chest: from the fixed light pool, so the light count never changes.
import { PooledLight, WorldPointLight } from '../render/lightPool.jsx';
import { Cube, Emissive } from '../render/mascots/voxelKit';
import { shrineParts } from './shrineShape.js';
import { surfaceBlockAt } from './climate.js';
import { blightHeartSite, blightHeartChunk } from './blightHeart.js';
import { nearestLandmark, landmarkAt } from './shrines.js';
import { HubRender } from '../render/HubRender';
import { HEARTH_Y, HEARTH_FIRE } from './homeAnchor.js';
import { chestHasItems } from '../game/chestState.js';
import { placeAtHit } from './placeAtHit.js';
import { mineAtHit, payBrokenBlock } from './mineAtHit.js';
import { createCellEdits } from './cellEdits.js';
import { mineTarget } from './buildTarget.js';
import { createPlacedCellColliders, createEditSeq } from './placedCellColliders.js';
import { markChunkLoaded, markChunkUnloaded, loadedChunkSet, chunkOf, CHUNK_SIZE } from './loadedChunks.js';
import { makeMobFloorProbe } from './mobFloorProbe.js';

const worker = new TerrainWorker();
worker.postMessage({ type: 'init', payload: { seed: useGameStore.getState().worldSeed } });
// The placement numbering the worker echoes on its meshes lives exactly as long as the worker (world/placedCellColliders.js).
const nextEditSeq = createEditSeq();
// The build tools' batched edits, answered by the worker; heard for as long as the worker lives, not while Terrain is
// mounted, so a click's blocks are paid back or recorded whatever unmounts before the answer (world/cellEdits.js).
const cellEdits = createCellEdits((msg) => worker.postMessage(msg));
worker.addEventListener('message', (e) => {
    if (e.data.type === 'cells_edited') cellEdits.settle(e.data.payload);
});

const ChunkMesh = React.memo(({ cx, cz, meshData, onMount, onUnmount, placedCells }) => {
    // Rules-of-Hooks: do NOT early-return before the hooks below. An empty<->non-empty meshData
    // change (now reachable by mining ocean/water-adjacent columns, since Ocean owns the water
    // surface) would change the hook count and HARD-CRASH the render tree. Compute the flag, keep
    // every hook unconditional, and gate only the JSX output.
    const empty = !meshData || !meshData.positions || meshData.positions.length === 0;

    // A LAYOUT effect (review #3, R4.3): the far field hole-punches itself by this registry, so a chunk must be
    // registered before its first painted frame and unregistered before its last — a passive effect runs after
    // paint, leaving a frame where the ring overlapped the new chunk (or left a hole where an old one went).
    React.useLayoutEffect(() => {
        if (empty) return undefined; // empty chunks don't register (preserves prior behavior)
        const key = `${cx}_${cz}`;
        if (onMount) onMount(key);
        return () => {
            if (onUnmount) onUnmount(key);
        };
    }, [cx, cz, onMount, onUnmount, empty]);
    // W2: the mesher emits NO water faces now (the Ocean.jsx Gerstner plane owns the water surface),
    // so every emitted quad is opaque LAND -> one geometry built straight from the full index buffer
    // (the old opaque/water index split is dead).
    const opaqueGeometry = React.useMemo(() => {
        if (empty || !meshData.indices || meshData.indices.length === 0) return null;
        const opaqueGeom = new THREE.BufferGeometry();
        opaqueGeom.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
        opaqueGeom.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
        if (meshData.uvs) {
            opaqueGeom.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
        }
        // Bind the standard colors array directly to the 'color' attribute
        opaqueGeom.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
        opaqueGeom.setAttribute('aAO', new THREE.BufferAttribute(meshData.ao, 1)); // S1 vertex AO
        opaqueGeom.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        opaqueGeom.computeBoundingSphere();
        return opaqueGeom;
    }, [meshData, empty]);

    React.useEffect(() => {
        return () => {
            if (opaqueGeometry) opaqueGeometry.dispose();
        };
    }, [opaqueGeometry]);
    // The sun's shadow renders on demand (render/shadowSchedule.js): a chunk whose mesh mounts, changes (a block edit
    // remeshes it) or leaves must re-render it. A LAYOUT effect, so the render it asks for sees the committed mesh.
    React.useLayoutEffect(() => {
        markShadowWorldChanged();
        return () => markShadowWorldChanged();
    }, [opaqueGeometry]);
    // The trimesh built from this mesh exists here: a child's passive effects run before its parent's, and
    // @react-three/rapier creates the TrimeshCollider in one. So the placed cells this mesh holds (its editSeq, from the
    // worker) can give their stand-in colliders up after the next step, and until that step the new trimesh is one the
    // controller's sweep cannot see (world/placedCellColliders.js).
    const trimeshRef = useRef(null);
    React.useEffect(() => {
        placedCells?.landed(cx, cz, meshData?.editSeq ?? 0, empty ? null : trimeshRef.current);
    }, [placedCells, cx, cz, meshData, empty]);
    React.useEffect(() => () => placedCells?.dropChunk(cx, cz), [placedCells, cx, cz]);

    if (empty) return null;

    return (
        <group position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}>
            {opaqueGeometry && (
                <mesh geometry={opaqueGeometry} material={terrainMaterial} castShadow receiveShadow />
            )}
            <RigidBody type="fixed" colliders={false}>
                <TrimeshCollider ref={trimeshRef} args={[meshData.positions, meshData.indices]} />
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
        if (!meshRef.current || !world || !getInput().active || isCaptureMode()) {
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
            const cell = mineTarget(hitPoint, direction, useGameStore.getState());
            meshRef.current.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
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
export const TreasureChestsRender = () => {
    // Fallback OUTSIDE the selector: inside it, `|| []` allocates a fresh array on every evaluation and
    // the reference-equality check can never hold. The key is declared in the store, so this is belt only.
    const chests = useGameStore(state => state.treasureChestsList) || [];
    const qualityTier = useGameStore(state => state.qualityTier) || 'low';
    const charOutline = (TIERS[qualityTier] || TIERS.low).charOutline;
    // A chest casts the sun's shadow and is none of the dynamic casters Atmosphere watches, so the shadow map renders on
    // demand (render/shadowSchedule.js) when one comes or goes, as it does for a chunk's mesh.
    const chestKey = chests.map((c) => c.id).join('|');
    React.useLayoutEffect(() => {
        markShadowWorldChanged();
        return () => markShadowWorldChanged();
    }, [chestKey]);

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
                            <PooledLight position={[0, 1.1, 0]} intensity={1.5} distance={6} color="#ffd700" />
                        </>
                    )}
                </group>
            ))}
        </group>
    );
};

// --- THE HEARTH: the crafted home-anchor decoration (World-Design M1) ---
// The voxel PLINTH is baked at gen (world/homeAnchor.js, top at HEARTH_Y=51); THIS group is the
// building read on top of it. Built from voxelKit Cube/Emissive (the shared toon+rim+ink character
// look) — NOT PBR. Sibling of TreasureChestsRender. Static (one fixed place at origin, no store
// read). The brazier glow + its light self-null under isCaptureMode (the chest-beacon pattern) so
// the studio cards stay clean; the toon cubes freeze naturally (no animation).
const HEARTH_TOP = HEARTH_Y; // = the flushed plinth cap (single source of truth). W2-T7 flushed HEARTH_Y 56->51 but left this hard-coded at 56, so the lodge/brazier floated ~5 blocks above the pad — corrected (M-HUB live-look catch).
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
                        <WorldPointLight position={[0, HEARTH_FIRE.height, 0]} intensity={HEARTH_FIRE.intensity} distance={HEARTH_FIRE.distance} color={HEARTH_FIRE.color} />
                    </>
                )}
            </group>
            {/* two leaf planters flanking the lodge */}
            <Cube position={[-2.5, 0.3, 1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
            <Cube position={[2.7, 0.3, -1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
        </group>
    );
};

// --- SIGNATURE LANDMARKS (World-M6): tall wayfinding silhouettes, placed by deterministic hash,
// only on loaded LAND chunks (in-range-culled + tier-capped by the streamer). Two voxelKit types.
const LANDMARK_PAL = { stone: '#8A8A8A', dark: '#5A5A5A', accent: '#6B4A2F' };
// B3: the shrine palette — stone/dark + a warm-gold CRYSTAL heart (the lit focal block the quests reference).
const SHRINE_PAL = { stone: '#8A8A8A', dark: '#5A5A5A', crystal: '#E0B468' };
function Landmark({ type, baseY }) {
    const top = Math.max(baseY + 58, 104); // S8d: taller wayfinding silhouette -- reads as a far-off landmark (was +46/92); clears fog (Y56) + valley mist
    const h = top - baseY;
    if (type === 0) { // B3 Shrine: stepped altar plinth + 4 framing pillars + canopy lintel + a warm crystal heart
        return (
            <group>
                {shrineParts(baseY, top).map((p, i) => (
                    <Cube key={i} position={p.position} size={p.size} color={SHRINE_PAL[p.tone]} castShadow={false} />
                ))}
                {!isCaptureMode() && <Emissive position={[0, top + 1, 0]} size={2.6} color="#F5D76E" intensity={5.0} />}{/* the shrine's lit beacon (warm gold); real-play only */}
            </group>
        );
    }
    // Sky-arch: two legs + a span across the top
    const legX = 5;
    return (
        <group>
            <Cube position={[-legX, baseY + h / 2, 0]} size={[2.2, h, 2.2]} color={LANDMARK_PAL.stone} castShadow={false} />
            <Cube position={[legX, baseY + h / 2, 0]} size={[2.2, h, 2.2]} color={LANDMARK_PAL.stone} castShadow={false} />
            <Cube position={[0, top, 0]} size={[legX * 2 + 2.2, 2.4, 2.2]} color={LANDMARK_PAL.dark} castShadow={false} />
            {/* THE SKY-ARCH BEACON HAS NEVER BEEN VISIBLE — not in capture, and not in real play either.
                It was a 2.0 cube at [0, top, 0]: the IDENTICAL centre as the span above, whose half-extents
                are (6.1, 1.2, 1.1). Strictly smaller on all three axes means fully enclosed, occluded from
                every direction, writing no fragment — and <Bloom> is a screen-space pass, so an object that
                writes nothing contributes no glow. The S8d commit that made it "brighter + bigger" to fix a
                faint-beacon report was tuning an object sealed inside a rock.
                Raised to clear the span by 0.2 (span top is `top + 1.2`; the beacon's underside is now
                `top + 1.4`), which is the same shape the shrine beacon at :400 already uses — offset ABOVE
                its host rather than centred in it, which is why that one has always worked.
                The capture guard goes too: Emissive is a static mesh with no useFrame and no RNG, so it was
                suppression with no determinism to justify it, and it kept the one landmark frame from ever
                showing the landmark's own beacon. */}
            <Emissive position={[0, top + 2.4, 0]} size={2.0} color="#F5D76E" intensity={4.5} />
        </group>
    );
}
const LandmarksRender = ({ chunks }) => {
    const marks = [];
    for (const key in chunks) {
        const { cx, cz } = chunks[key];
        const site = landmarkAt(cx, cz); // null off the hash and off land: the finder leads to exactly these (shrines.js)
        if (!site) continue;
        marks.push(<group key={key} position={[site.worldX, 0, site.worldZ]}><Landmark type={site.type} baseY={site.surfaceY} /></group>);
    }
    return <group>{marks}</group>;
};

// M4 #8: the Blight-Heart lair finally has a PHYSICAL landmark -- an ominous obsidian monolith + a
// blight-violet beacon, so the CLIMAX destination reads from afar as you journey toward the compass marker
// (it was an invisible coordinate before: only a marker + the boss spawn). Taller than the wayfinding
// shrines (the ultimate landmark). Capture-safe: the lair is ~1025 blocks out, never in a spawn-pinned
// capture frame, and the beacon is real-play-only; mounts only when the lair chunk is loaded.
function BlightMonolith({ baseY }) {
    const top = Math.max(baseY + 78, 132);
    const h = top - baseY;
    return (
        <group>
            <Cube position={[0, baseY + h / 2, 0]} size={[9, h, 9]} color="#150B22" castShadow={false} />
            <Cube position={[0, top - 6, 0]} size={[5.5, 14, 5.5]} color="#2A1240" castShadow={false} />
            <Cube position={[0, top + 2, 0]} size={[2.4, 6, 2.4]} color="#3A1A55" castShadow={false} />
            {!isCaptureMode() && <Emissive position={[0, top + 6, 0]} size={3.4} color="#A030F0" intensity={6.0} />}
        </group>
    );
}
const BlightHeartRender = ({ chunks }) => {
    const { cx: bcx, cz: bcz } = blightHeartChunk();
    let loaded = false;
    for (const key in chunks) { const c = chunks[key]; if (c.cx === bcx && c.cz === bcz) { loaded = true; break; } }
    if (!loaded) return null;
    const site = blightHeartSite();
    const { surfaceY, isWater } = surfaceBlockAt(site.x, site.z);
    if (isWater) return null;
    return <group position={[site.x, 0, site.z]}><BlightMonolith baseY={surfaceY} /></group>;
};

// W3 M-HUD.10 — far-LOD spawn beacons. The old LandmarksRender/BlightHeartRender only draw their
// landmark once that CHUNK is loaded, so a freshly-spawned player sees an empty horizon with no goal
// cue (Kevin 2026-06-16: "I spawn with no guide; where do I go?"). FarBeacon draws two tall additive
// light-shafts — cyan toward the NEAREST shrine, violet toward the Blight-Heart — DECOUPLED from chunk
// load. Positioned by a transient per-frame read of the player position (Game-Loop-Isolation-safe: no
// reactive subscription). Capture-SUPPRESSED (renders null + the useFrame early-returns) so the
// deterministic baselines are byte-identical — zero gate impact.
//
// Spawn-legibility design note (M-HUD.10 tuning, controller live-look): the literal landmark coords are
// FAR — the Blight-Heart sits at ~1025 blocks (≈99% fogged out; a thin world-space cylinder there is
// sub-pixel) and the nearest shrine up to ~256. So each beacon is a CLAMPED GUIDING BEAM: placed along
// the true bearing at min(trueDist, BEACON_CLAMP) from the player, keeping it inside fog-light view so it
// ALWAYS reads from spawn and points the way. Once the player is within BEACON_CLAMP of a real shrine the
// beam sits on it (the chunk's Landmark mesh then renders too). A bright core + soft halo, toneMapped
// false so the beams stay vivid + catch the scene bloom (glow as distant light-shafts, not ACES-muted).
const BEACON_CLAMP = 150;
const FarBeacon = () => {
    const shrine = useRef();
    const shrineHalo = useRef();
    const blight = useRef();
    const blightHalo = useRef();
    useFrame(() => {
        if (isCaptureMode()) return;
        const pp = useGameStore.getState().playerPosition;
        if (!pp) return;
        const place = (core, halo, tx, tz, baseY) => {
            const dx = tx - pp.x, dz = tz - pp.z;
            const dist = Math.hypot(dx, dz);
            const vis = dist > 0.5;
            const f = vis ? Math.min(dist, BEACON_CLAMP) / dist : 0;
            const x = pp.x + dx * f, z = pp.z + dz * f;
            for (const r of [core, halo]) { if (r.current) { r.current.visible = vis; r.current.position.set(x, baseY, z); } }
        };
        const s = nearestLandmark(pp.x, pp.z, 16);
        if (s) place(shrine, shrineHalo, s.worldX, s.worldZ, 95);
        else for (const r of [shrine, shrineHalo]) if (r.current) r.current.visible = false;
        const bh = blightHeartSite();
        place(blight, blightHalo, bh.x, bh.z, 110);
    });
    if (isCaptureMode()) return null;
    return (
        <group>
            <mesh ref={shrineHalo} visible={false}>
                <cylinderGeometry args={[7, 5, 190, 12, 1, true]} />
                <meshBasicMaterial color="#46E0FF" transparent opacity={0.10} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh ref={shrine} visible={false}>
                <cylinderGeometry args={[3, 2, 200, 12, 1, true]} />
                <meshBasicMaterial color="#9CF3FF" transparent opacity={0.55} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh ref={blightHalo} visible={false}>
                <cylinderGeometry args={[8, 6, 220, 12, 1, true]} />
                <meshBasicMaterial color="#A24BFF" transparent opacity={0.13} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh ref={blight} visible={false}>
                <cylinderGeometry args={[3.4, 2.2, 230, 12, 1, true]} />
                <meshBasicMaterial color="#D9A0FF" transparent opacity={0.62} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
        </group>
    );
};

export const MinecraftWorld = React.memo(() => {
    const { camera } = useThree();
    const { rapier, world } = useRapier();
    const { playBlockPlace, playBlockBreak } = useGameSounds();

    // Each placed cell is solid from the click: a stand-in collider until its chunk's trimesh is indexed
    // (world/placedCellColliders.js). The Player loop reads the colliders its sweep cannot see yet through GameMethods.
    const placedCells = React.useMemo(() => createPlacedCellColliders(world, rapier, nextEditSeq), [world, rapier]);
    useEffect(() => {
        GameMethods.placedCells = placedCells;
        return () => {
            delete GameMethods.placedCells;
            placedCells.clear();
        };
    }, [placedCells]);
    useAfterPhysicsStep(() => placedCells.afterStep());
    // DEV-only: how many placed cells a stand-in still holds, for tests/e2e/place-clear-of-player.spec.js to log the live
    // delay from a click to the trimesh. Tree-shaken in production with the bridge.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        registerTestHook('readPlacedCells', () => placedCells.size());
    }, [placedCells]);

    // Update shared terrain shader uniforms (the surviving LAND grade: danger-mood + aerial haze).
    // W2: the water clock (time/timeOfDay) is gone — Ocean.jsx owns the animated surface + its own
    // capture-frozen wave time now, so the land material has no time-varying term.
    useFrame((state) => {
        const mood = moodRef.current;                                   // smoothed by <Atmosphere>
        // THE PUBLISHED SKY FRAME (render/mood.js skyFrameRef): the one frame <Atmosphere> resolved at the clock's
        // cycle, so the land hazes toward the horizon of this hour; a re-sample with no cycle would be noon's. Read
        // now, never retained.
        const frame = skyFrameRef.current;
        const opaqueShader = terrainMaterial.userData.shader;
        if (opaqueShader) {
            opaqueShader.uniforms.mood.value = mood;
            opaqueShader.uniforms.skyHorizon.value.copy(frame.skyHorizon); // S2 aerial haze target
            // The AO floor is the frame's `aoFloor`, aoFloorColor of the COMPOSED AMBIENT (the authored shadow tint).
            // It multiplies the albedo of every occluded corner, so a sky colour here (blue by day, navy at night)
            // would tint them all. Its luminance is AO_FLOOR's; only the hue follows the light.
            opaqueShader.uniforms.uAoFloor.value.copy(frame.aoFloor);
            // Cloud shadows: the sky dome's clock (the capture clock under capture) and the sun Atmosphere resolved.
            opaqueShader.uniforms.uTime.value = frameElapsed(state.clock.elapsedTime);
            opaqueShader.uniforms.uSunDir.value.copy(sunDirRef.current);
            opaqueShader.uniforms.uCloudCover.value = cloudCoverRef.current;
        }
    });
    // DEV-only: the land material's LIVE sky uniforms, for tests/e2e/light-script.spec.js: `sunDir` must be the SUN at
    // every hour (ore glow, leaf translucency and cloud shadows read it), never the moon key. Null until the material
    // has compiled. Tree-shaken in production with the bridge.
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        registerTestHook('readTerrainSky', () => {
            const u = terrainMaterial.userData.shader?.uniforms;
            return u ? { sunDir: u.uSunDir.value.toArray(), aoFloor: u.uAoFloor.value.toArray(), skyHorizon: u.skyHorizon.value.toArray() } : null;
        });
    }, []);

    const [chunks, setChunks] = useState({});
    // B2d: the streamer's in-flight/dedup bookkeeping. This USED to be a `new Set()` local to the
    // streaming effect — unreachable from the worker's message handler, which is exactly why the handler
    // could not drain it on a world load, and why loading a save permanently destroyed the terrain.
    // It is a ref so the two effects share ONE set: whoever wipes the chunks must also wipe the record
    // of having asked for them, or the streamer can never ask again.
    const requestedChunksRef = useRef(new Set());

    // The mounted set lives in world/loadedChunks.js — the far field hole-punches itself by it (R3.9), and it is
    // the same Set getGeneratedChunks hands the spawner, so no consumer holds a private copy that can disagree.
    const handleMount = React.useCallback((key) => {
        markChunkLoaded(key);
    }, []);

    const handleUnmount = React.useCallback((key) => {
        markChunkUnloaded(key);
    }, []);

    // A load's wipe (load_modifications_done below) is committed once the chunk map has changed after it: by then every old
    // chunk's trimesh is removed (their cleanups run before this effect), so the ground probe can answer only from the new
    // world, and the Player's hold on the loaded position may ask it (store worldReloading).
    const reloadWipeRef = useRef(false);
    useEffect(() => {
        if (!reloadWipeRef.current) return;
        reloadWipeRef.current = false;
        useGameStore.setState({ worldReloading: false });
    }, [chunks]);

    // Expose chunks state for debugging
    useEffect(() => {
        useGameStore.setState({ debugChunks: chunks });
        return () => {
            useGameStore.setState({ debugChunks: null });
        };
    }, [chunks]);

    // Expose worker to Zustand store. Through the setter: a world loaded before this mount (the context-loss resume, at App
    // mount) is waiting to send its block edits, and the setter delivers them before the streamer asks for a chunk.
    useEffect(() => {
        useGameStore.getState().setTerrainWorker(worker);
        return () => {
            useGameStore.getState().setTerrainWorker(null);
        };
    }, []);

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
                // Each removed block is paid back as itself (world/mineAtHit.js).
                payBrokenBlock(payload);
            } else if (type === 'load_modifications_done') {
                // Wipe the live world so the worker can re-stream it with the save's block edits applied.
                // The loaded-chunk registry empties itself as each ChunkMesh unmounts (its layout-effect cleanup),
                // at the commit that removes it — clearing it here, BEFORE that commit, left the old chunks drawn
                // with the far field no longer punched out beneath them (review #3, R4.3).
                reloadWipeRef.current = true;
                setChunks({});
                placedCells.clear();
                // B2d: ...and wipe the record of having REQUESTED those chunks. Without this the
                // streamer's guard (`!requestedChunks.has(key)`) still considers every chunk
                // "already requested", so it never asks again — and the cull path that would have
                // drained the set iterates the chunk list we just emptied. The world never came back:
                // no meshes, no colliders, no ground, the player free-falling forever. Loading a save
                // deleted the world it was supposed to restore.
                requestedChunksRef.current.clear();
            }
        };
        worker.addEventListener('message', handleMessage);
        return () => worker.removeEventListener('message', handleMessage);
    }, [placedCells]);

    // Provide ground level approximation for NPCs via top-down physics raycast
    useEffect(() => {
        useGameStore.getState().setGetGeneratedChunks(loadedChunkSet);
        
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
                return 255 - hit.timeOfImpact; // #72: this rapier build exposes timeOfImpact; legacy hit.toi is always undefined
            }
            return null;
        });

        // The mob FLOOR probe beside it (review #6, R7.1): the column top above is a roof or a tree canopy wherever
        // there is one, so every mob mover snaps and plans on the floor under its feet instead.
        useGameStore.getState().setGetMobFloor(makeMobFloorProbe(rapier, world));

        // The `checkCollision` registration that stood here was DELETED 2026-08-11. It built a filtered
        // downward Rapier ray and published it to the store, and NOTHING ever read it -- a wire to nowhere
        // that the next author has to trace before they can rule it out. The live ground probe every
        // system actually uses is getMobGroundLevel, registered directly above.

        return () => {
            useGameStore.getState().setGetGeneratedChunks(null);
            useGameStore.getState().setGetMobGroundLevel(null);
            useGameStore.getState().setGetMobFloor(null);
        };
    }, [rapier, world]);

    // Progressive chunk loading
    useEffect(() => {
        let isProcessing = true;
        const requestedChunks = requestedChunksRef.current;   // B2d: shared with the worker message handler

        const processChunks = () => {
            if (!isProcessing || !camera) return;

            // Transient tier read (no reactive subscription): the active quality tier's
            // renderDistance gates how many chunks load/cull around the player. Falls back
            // to `low` if the tier key is somehow unknown.
            // On a coarse pointer the radius is pinned to the boot tier (render/tierGovernor.js renderDistanceFor).
            const tier = useGameStore.getState().qualityTier;
            const renderDistance = renderDistanceFor(tier, useGameStore.getState().renderDistancePin);

            // chunkOf: the ONE chunk index the far-field mask also uses (review #4, R5.8).
            const playerCx = chunkOf(camera.position.x);
            const playerCz = chunkOf(camera.position.z);

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

                // Cull chunks far outside render distance.
                //
                // The +2 band is deliberate hysteresis: without it, a player pacing back and forth across a
                // single chunk boundary would unload and re-generate the same chunk repeatedly.
                //
                // But the band is anchored to the CURRENT renderDistance, and that is what broke on a tier
                // DOWNGRADE. TIERS.renderDistance is 4/3/2, so at `low` this band retains a ±4 box — 81
                // chunks — which is EXACTLY the high-tier load box. Stepping high->low therefore culled
                // nothing at all: the streamer stopped asking for new chunks while every mesh and every
                // Rapier collider already resident stayed resident. On precisely the machine the downgrade
                // exists to protect, draw calls and physics bodies stayed at high-tier levels. Measured on a
                // real transition before this fix: 81 chunks at high -> 72 at low, flat for 45s, against a
                // low-tier box of 25. (tests/e2e/tier-downgrade-reclaim.spec.js)
                const cullDist = renderDistance + 2;
                const tierBox = (2 * renderDistance + 1) ** 2;

                // RECLAIM (2026-08-02). A second, THROTTLED pass that only engages when the resident set is
                // far larger than the tier actually wants — which in practice means "a downgrade just
                // happened". It trims toward one ring of hysteresis instead of two.
                //
                // Deliberately NOT implemented by shrinking cullDist to +1: that would tighten the band
                // during ordinary movement too and reintroduce the thrash the +2 exists to prevent. This
                // engages only past a 1.5x overshoot, so normal play (resident ≈ box) never triggers it,
                // and it is capped per tick so reclaiming ~50 chunks cannot stall a frame — the same
                // reasoning as the 2-per-tick generate throttle above.
                const RECLAIM_PER_TICK = 4;
                const reclaimDist = renderDistance + 1;
                const overshooting = Object.keys(newChunks).length > tierBox * 1.5;
                let reclaimedThisTick = 0;

                Object.keys(newChunks).forEach(key => {
                    const c = newChunks[key];
                    const dx = Math.abs(c.cx - playerCx);
                    const dz = Math.abs(c.cz - playerCz);
                    const beyondCull = dx > cullDist || dz > cullDist;
                    const beyondReclaim =
                        overshooting && reclaimedThisTick < RECLAIM_PER_TICK && (dx > reclaimDist || dz > reclaimDist);
                    if (beyondCull || beyondReclaim) {
                        if (!beyondCull) reclaimedThisTick++;
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
        // R4a: the name->id map used to be a hand-written literal HERE, and a SECOND, independent id->name
        // literal lived in the mine path below. They drifted, and the hotbar lied: diamond/gold/iron/coal
        // were all sent as 3 (STONE), water was sent as 4 (SAND), glass/cobblestone had no id at all, and an
        // unmapped name fell back to `|| 1` (GRASS). Both directions now derive from the ONE table in
        // src/world/blockIds.js, so they cannot drift again. Locked by block-id-gates.test.js.

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

            const store = useGameStore.getState();
            const { x: targetedX, y: targetedY, z: targetedZ } = mineTarget(hitPoint, direction, store);
            const targetCoords = `${targetedX}_${targetedY}_${targetedZ}`;

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
                // Whether that chest still holds anything. The router refuses a left-click MINE on a
                // loaded chest (mine() deletes the chest and drops nothing), but lets you remove an
                // empty one you placed — so the guard needs the contents, not just the presence.
                chestHasItems: chestHasItems(store.chests && store.chests.get(targetCoords)),
            };
        };

        // The executors live in mineAtHit.js and placeAtHit.js so the unit suite drives the real verbs; the worker stays here.
        const mine = (h) => mineAtHit(h, { post: (msg) => worker.postMessage(msg), editCells: cellEdits.request, playBreak: playBlockBreak });
        const place = (h) => placeAtHit(h, { editCells: cellEdits.request, playPlace: playBlockPlace, cells: placedCells });

        const open = (h) => {
            if (!h || !h.chestTargeted) return;
            const store = useGameStore.getState();
            store.setActiveChestCoords(h.targetCoords);
            // The panel is a covering surface: InputManager gives the pointer back for every one (input/inputLive.js).
            store.setShowChestInterface(true);
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
    }, [camera, rapier, world, placedCells]);

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
                <React.Fragment key={`${chunk.cx}_${chunk.cz}`}>
                    <ChunkMesh
                        cx={chunk.cx}
                        cz={chunk.cz}
                        meshData={chunk.meshData}
                        onMount={handleMount}
                        onUnmount={handleUnmount}
                        placedCells={placedCells}
                    />
                    {/* M4 #5: revive the wind-grass -- mount the (previously dead) per-chunk instanced grass
                        renderer from the worker's sparse grass-top positions. Only for chunks with grass tops. */}
                    {chunk.meshData.grassTops && chunk.meshData.grassTops.length > 0 && (
                        <OptimizedGrassSystem chunkX={chunk.cx} chunkZ={chunk.cz} blockPositions={chunk.meshData.grassTops} />
                    )}
                </React.Fragment>
            ))}
            {/* S7: the ONE driver for the shared grass-shader uniforms. This used to run inside EVERY
                chunk's useFrame — 81 chunks at high tier (renderDistance 4, so -4..4 on both axes),
                each walking the whole ECS to write the same 8 shared slots, 80 of them thrown away by
                last-write-wins. Must stay OUTSIDE the chunk map: one mount, one walk. */}
            <GrassWindDriver />
            <TargetOutline />
            <BlockParticleSystem worker={worker} />
            <TreasureChestsRender />
            <HomeAnchorRender />
            <HubRender />
            <LandmarksRender chunks={chunks} />
            <BlightHeartRender chunks={chunks} />
            <FarBeacon />
        </group>
    );
});