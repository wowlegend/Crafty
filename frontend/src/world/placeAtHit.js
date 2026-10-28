// The PLACE verb's executor: what one placement on a face does to the world and the inventory. Terrain.jsx owns the
// build ray and the terrain worker and hands the worker's postMessage in; the rest lives here so the unit suite drives
// the same function the verb router calls (tests/gates/place-executor-gates.test.jsx).
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { PLACE_GAIN } from '../game/resonance.js';
import { BLOCK_TYPES } from './Blocks';
import { idForBlock } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { chunkOf, CHUNK_SIZE } from './loadedChunks.js';
import { RECIPES } from '../data/recipes.js';
import { notifyDenied } from '../ui/denyToast.js';

const CRAFTED = new Set(RECIPES.flatMap((r) => Object.keys(r.output)));

/**
 * @param {{hitPoint: THREE.Vector3, normal: ({x:number,y:number,z:number}|null), direction: THREE.Vector3}|null} h the build-ray hit
 * @param {{post: (msg: object) => void, playPlace?: (pos: THREE.Vector3, block: string) => void}} io
 * @returns {number} the cells placed (0 = refused)
 */
export function placeAtHit(h, { post, playPlace }) {
    if (!h) return 0;
    const store = useGameStore.getState();
    const type = store.selectedBlock || 'grass';
    // `null` means the engine has no voxel for this block: refused, never substituted (world/blockIds.js).
    const numericType = idForBlock(type);
    if (numericType === null) return 0;
    const placeDirection = h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : h.direction.clone().multiplyScalar(-1);
    const placePos = h.hitPoint.clone().add(placeDirection.multiplyScalar(0.01));
    const tx = Math.floor(placePos.x);
    const ty = Math.floor(placePos.y);
    const tz = Math.floor(placePos.z);

    // Transient getState reads, not a subscription, so Game-Loop-Isolation holds. buildFootprint caps the cell count;
    // its header says why the cap is an economy decision, given the per-cell debit below.
    const cells = buildFootprint(store.buildingMode || 'single', store.buildSize || 1, { x: tx, y: ty, z: tz }, h.normal);

    const newBlocks = new Map(store.worldBlocks);
    let placed = 0;
    for (const c of cells) {
        // Placement spends the block, and the debit is the stop condition: a footprint the stack cannot cover places
        // what it can afford. Mining grants +1, so any free cell is an infinite-material loop.
        if (!store.consumeForPlacement(type)) break;
        const cx = chunkOf(c.x);
        const cz = chunkOf(c.z);
        post({ type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: numericType } });
        newBlocks.set(`${c.x}_${c.y}_${c.z}`, numericType);
        placed++;
    }
    if (placed === 0) {
        // Not one cell affordable: say so, or an empty stack reads as a dead button.
        notifyDenied(CRAFTED.has(type) ? 'no-block-craftable' : 'no-block', BLOCK_TYPES[type]?.name || type);
        return 0;
    }

    // Once per action, not per cell: a 64-cell footprint must not bank 64 resonance ticks or stack 64 place sounds.
    if (store.isDay) store.accrueResonance(PLACE_GAIN);
    playPlace?.(placePos, useGameStore.getState().selectedBlock);
    // A low spark count keeps the iPad fill-rate envelope. place() runs only on real input, so capture never reaches it.
    const puffColor = (BLOCK_TYPES[type] && BLOCK_TYPES[type].color) || '#cccccc';
    store.triggerGPUSparks?.(placePos, puffColor, 6, 'physical');

    store.setWorldBlocks(newBlocks);

    // The chest's identity lives in the `chests` Map; its voxel is wood (world/blockIds.js BLOCK_ALIAS).
    if (type === 'chest') {
        const newChests = new Map(store.chests);
        newChests.set(`${tx}_${ty}_${tz}`, { inventory: {}, name: 'Wooden Chest' });
        useGameStore.setState({ chests: newChests });
    }

    // One count per place verb, for the Master Builder achievement (the callback is registered by QuestSystem).
    store.onBlockPlace?.();
    return placed;
}
