import React, { useRef, useState, useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_TYPES, BLOCK_TYPE_KEYS } from './Blocks';
import { OptimizedGrassSystem } from '../OptimizedGrassSystem';
import { useGameStore } from '../store/useGameStore';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';

// --- VISUAL-ONLY CHUNK MESH (No Physics) ---
// Each block type in a chunk gets its own InstancedMesh for batched GPU rendering.
// Physics is handled separately by a single HeightfieldCollider per chunk.
const ChunkMesh = React.memo(({ type, blocks }) => {
    const meshRef = useRef();
    const count = blocks.length;
    const config = BLOCK_TYPES[type];

    useLayoutEffect(() => {
        if (!meshRef.current || count === 0) return;

        const dummy = new THREE.Object3D();
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < count; i++) {
            const [x, y, z] = blocks[i].position;
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        meshRef.current.instanceMatrix.needsUpdate = true;

        // Proper bounding sphere for frustum culling
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const radius = Math.sqrt(
            (maxX - minX) * (maxX - minX) +
            (maxY - minY) * (maxY - minY) +
            (maxZ - minZ) * (maxZ - minZ)
        ) / 2 + 1;
        meshRef.current.geometry.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(cx, cy, cz), radius
        );
    }, [count, blocks]);

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[null, null, count]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshLambertMaterial
                color={config?.color || '#ff00ff'}
                transparent={config?.transparent}
                opacity={config?.transparent ? 0.8 : 1}
            />
        </instancedMesh>
    );
});

// --- TERRAIN GENERATION LOGIC ---
const generateTerrainHeight = (() => {
    const cache = new Map();
    const maxCacheSize = 4000;

    return (x, z) => {
        const key = `${Math.floor(x)}_${Math.floor(z)}`;
        if (cache.has(key)) return cache.get(key);

        const noise1 = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2;
        const noise2 = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
        const height = Math.floor(Math.max(12, Math.min(22, noise1 + noise2 + 15)));

        if (cache.size >= maxCacheSize) {
            cache.delete(cache.keys().next().value);
        }

        cache.set(key, height);
        return height;
    };
})();

// --- TRIMESH COLLIDER PER CHUNK ---
// Creates exact terrain surface mesh for collision. One per chunk (~50 total).
// Uses world-space vertex positions directly — no centering/scale issues.
const ChunkCollider = React.memo(({ cx, cz }) => {
    const CHUNK_SIZE = 16;

    const { vertices, indices } = useMemo(() => {
        const verts = [];
        const inds = [];

        // Generate grid of vertices at terrain surface height
        for (let z = 0; z <= CHUNK_SIZE; z++) {
            for (let x = 0; x <= CHUNK_SIZE; x++) {
                const worldX = cx * CHUNK_SIZE + x;
                const worldZ = cz * CHUNK_SIZE + z;
                // +1 so surface is at block TOP, not center
                const height = generateTerrainHeight(worldX, worldZ) + 1;
                verts.push(worldX, height, worldZ);
            }
        }

        // Generate triangle indices for each grid cell (2 triangles each)
        const stride = CHUNK_SIZE + 1;
        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const i = z * stride + x;
                // Triangle 1
                inds.push(i, i + stride, i + 1);
                // Triangle 2
                inds.push(i + 1, i + stride, i + stride + 1);
            }
        }

        return {
            vertices: new Float32Array(verts),
            indices: new Uint32Array(inds)
        };
    }, [cx, cz]);

    return (
        <RigidBody type="fixed" colliders={false}>
            <TrimeshCollider args={[vertices, indices]} />
        </RigidBody>
    );
});

// --- INDIVIDUAL TERRAIN CHUNK ---
const TerrainChunk = React.memo(({ cx, cz, blocksRef }) => {
    const CHUNK_SIZE = 16;

    const chunkData = useMemo(() => {
        const typeMap = {};
        BLOCK_TYPE_KEYS.forEach(key => typeMap[key] = []);
        const grassBlocks = [];

        const startX = cx * CHUNK_SIZE;
        const startZ = cz * CHUNK_SIZE;

        for (let x = startX; x < startX + CHUNK_SIZE; x++) {
            for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
                const height = generateTerrainHeight(x, z);

                let surfaceType = 'grass';
                if (height < 14) surfaceType = 'sand';
                else if (height > 20) surfaceType = 'snow';

                // Core terrain blocks (surface + 3 layers below)
                for (let y = height - 3; y <= height; y++) {
                    const key = `${x},${y},${z}`;
                    if (!blocksRef.current.has(key)) {
                        let blockType = y === height ? surfaceType : (y > height - 3 ? 'dirt' : 'stone');
                        const block = { position: [x, y, z], type: blockType };
                        blocksRef.current.set(key, block);
                        typeMap[blockType].push(block);

                        if (blockType === 'grass') {
                            grassBlocks.push([...block.position, 'grass']);
                        }
                    }
                }

                // Decorations
                if (surfaceType === 'grass') {
                    // Flowers
                    if (Math.random() < 0.02) {
                        const flowerType = Math.random() < 0.5 ? 'flower_red' : 'flower_yellow';
                        const fy = height + 1;
                        const fk = `${x},${fy},${z}`;
                        const block = { position: [x, fy, z], type: flowerType };
                        blocksRef.current.set(fk, block);
                        typeMap[flowerType].push(block);
                    }
                    // Trees
                    else if (Math.random() < 0.005) {
                        const isBirch = Math.random() < 0.3;
                        const trunkType = isBirch ? 'birch_wood' : 'wood';
                        const treeHeight = 4 + Math.floor(Math.random() * 3);
                        for (let i = 1; i <= treeHeight; i++) {
                            const ty = height + i;
                            const key = `${x},${ty},${z}`;
                            const block = { position: [x, ty, z], type: trunkType };
                            blocksRef.current.set(key, block);
                            typeMap[trunkType].push(block);
                        }
                        for (let ly = height + treeHeight; ly <= height + treeHeight + 1; ly++) {
                            const offsets = ly === height + treeHeight
                                ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
                                : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
                            offsets.forEach(([dx, dz]) => {
                                const lx = x + dx, lz = z + dz;
                                const key = `${lx},${ly},${lz}`;
                                if (!blocksRef.current.has(key)) {
                                    const block = { position: [lx, ly, lz], type: 'leaves' };
                                    blocksRef.current.set(key, block);
                                    typeMap['leaves'].push(block);
                                }
                            });
                        }
                    }
                }
            }
        }

        return { typeMap, grassBlocks };
    }, [cx, cz, blocksRef]);

    // Signal spawn chunk readiness
    useEffect(() => {
        if (cx === 0 && cz === 0) {
            setTimeout(() => {
                window.isSpawnChunkLoaded = true;
            }, 1500);
        }
    }, [cx, cz]);

    return (
        <group>
            {/* Visual meshes only — no physics overhead */}
            {BLOCK_TYPE_KEYS.map(type => (
                <ChunkMesh key={type} type={type} blocks={chunkData.typeMap[type]} />
            ))}

            {/* Single heightfield collider for the entire chunk surface */}
            <ChunkCollider cx={cx} cz={cz} />

            {/* Grass decoration */}
            <OptimizedGrassSystem
                chunkX={cx}
                chunkZ={cz}
                blockPositions={chunkData.grassBlocks}
            />
        </group>
    );
});

// --- MAIN WORLD COMPONENT ---
export const MinecraftWorld = React.memo(() => {
    const gameState = useGameStore();
    const { camera } = useThree();

    const blocksRef = useRef(new Map());
    const [chunks, setChunks] = useState([]);
    const generatedChunksRef = useRef(new Set());
    const lastPlayerChunk = useRef({ x: 0, z: 0 });

    const CHUNK_SIZE = 16;
    const RENDER_DISTANCE = 4;

    // External hooks
    useEffect(() => {
        window.getGeneratedChunks = () => generatedChunksRef.current;

        window.getMobGroundLevel = (x, z) => {
            let terrainHeight = generateTerrainHeight(x, z);
            const xf = Math.floor(x), zf = Math.floor(z);
            for (let y = terrainHeight + 5; y >= terrainHeight; y--) {
                const key = `${xf},${y},${zf}`;
                if (blocksRef.current.has(key)) return y;
            }
            return terrainHeight;
        };

        window.checkCollision = (x, y, z) => {
            const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
            if (blocksRef.current.has(key)) {
                const block = blocksRef.current.get(key);
                return block.type !== 'flower_red' && block.type !== 'flower_yellow' && block.type !== 'grass_blade';
            }
            return false;
        };

        return () => {
            delete window.getGeneratedChunks;
            delete window.getMobGroundLevel;
            delete window.checkCollision;
        };
    }, []);

    // Chunk loading around player
    useFrame(() => {
        if (!camera) return;

        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);

        if (cx !== lastPlayerChunk.current.x || cz !== lastPlayerChunk.current.z) {
            lastPlayerChunk.current = { x: cx, z: cz };

            const newChunks = [];
            for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
                for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                    const chunkKey = `${cx + x},${cz + z}`;
                    if (!generatedChunksRef.current.has(chunkKey)) {
                        generatedChunksRef.current.add(chunkKey);
                        newChunks.push({ cx: cx + x, cz: cz + z, key: chunkKey });
                    }
                }
            }

            setChunks(prev => {
                const combined = [...prev, ...newChunks];
                return combined.filter(c =>
                    Math.abs(c.cx - cx) <= RENDER_DISTANCE + 3 &&
                    Math.abs(c.cz - cz) <= RENDER_DISTANCE + 3
                );
            });
        }
    });

    // Progressive chunk loading
    useEffect(() => {
        generatedChunksRef.current.add('0,0');
        setChunks([{ cx: 0, cz: 0, key: '0,0' }]);

        const initialChunks = [];
        for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
            for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
                if (x === 0 && z === 0) continue;
                initialChunks.push({ cx: x, cz: z, key: `${x},${z}`, dist: x * x + z * z });
            }
        }

        initialChunks.sort((a, b) => a.dist - b.dist);

        let i = 0;
        const loadInterval = setInterval(() => {
            if (i >= initialChunks.length) {
                clearInterval(loadInterval);
                return;
            }
            const chunk = initialChunks[i];
            generatedChunksRef.current.add(chunk.key);
            setChunks(prev => [...prev, chunk]);
            i++;
        }, 100);

        return () => clearInterval(loadInterval);
    }, []);

    // Raycast interaction (building/destroying)
    useEffect(() => {
        const handleClick = (e) => {
            if (!document.pointerLockElement) return;

            const direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            const rayStart = camera.position.clone();
            const targetPos = rayStart.add(direction.multiplyScalar(4));
            const tx = Math.round(targetPos.x);
            const ty = Math.round(targetPos.y);
            const tz = Math.round(targetPos.z);

            const buildMode = window.buildingMode || 'single';
            const buildSize = window.buildSize || 1;
            const type = window.selectedBuildBlock || gameState.selectedBlock;

            const placeBlock = (x, y, z) => {
                const key = `${x},${y},${z}`;
                if (!blocksRef.current.has(key)) {
                    blocksRef.current.set(key, { position: [x, y, z], type });
                }
            };

            const deleteBlock = (x, y, z) => {
                const key = `${x},${y},${z}`;
                blocksRef.current.delete(key);
            };

            if (e.button === 0) {
                if (buildMode === 'delete') {
                    for (let dy = 0; dy < buildSize; dy++) {
                        for (let dx = -Math.floor(buildSize / 2); dx <= Math.floor(buildSize / 2); dx++) {
                            for (let dz = -Math.floor(buildSize / 2); dz <= Math.floor(buildSize / 2); dz++) {
                                deleteBlock(tx + dx, ty + dy, tz + dz);
                            }
                        }
                    }
                } else {
                    deleteBlock(tx, ty, tz);
                }
                if (window.playHitSound) window.playHitSound();
            } else if (e.button === 2) {
                switch (buildMode) {
                    case 'wall':
                        for (let dy = 0; dy < buildSize; dy++) placeBlock(tx, ty + dy, tz);
                        break;
                    case 'floor':
                        for (let dx = -Math.floor(buildSize / 2); dx <= Math.floor(buildSize / 2); dx++) {
                            for (let dz = -Math.floor(buildSize / 2); dz <= Math.floor(buildSize / 2); dz++) {
                                placeBlock(tx + dx, ty, tz + dz);
                            }
                        }
                        break;
                    case 'cube':
                        for (let dy = 0; dy < buildSize; dy++) {
                            for (let dx = -Math.floor(buildSize / 2); dx <= Math.floor(buildSize / 2); dx++) {
                                for (let dz = -Math.floor(buildSize / 2); dz <= Math.floor(buildSize / 2); dz++) {
                                    placeBlock(tx + dx, ty + dy, tz + dz);
                                }
                            }
                        }
                        break;
                    case 'single':
                    default:
                        placeBlock(tx, ty, tz);
                        break;
                }
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [camera, gameState.selectedBlock]);

    return (
        <group>
            <fog attach="fog" args={['#87CEEB', 20, (RENDER_DISTANCE * CHUNK_SIZE) - 5]} />

            {chunks.map(chunk => (
                <TerrainChunk key={chunk.key} cx={chunk.cx} cz={chunk.cz} blocksRef={blocksRef} />
            ))}
        </group>
    );
});
