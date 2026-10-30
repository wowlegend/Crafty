// The PLACE verb's executor: what one placement on a face does to the world and the inventory. Terrain.jsx owns the
// build ray and the terrain worker and hands the worker's postMessage in; the rest lives here so the unit suite drives
// the same function the verb router calls (tests/gates/place-executor-gates.test.jsx).
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { BLOCK_TYPES } from './Blocks';
import { idForBlock } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { chunkOf, CHUNK_SIZE } from './loadedChunks.js';
import { GOODS } from '../game/forge.js';
import { notifyDenied } from '../ui/denyToast.js';

// The blocks only Mara's Forge makes: their refusal says where more come from.
const FORGED = new Set(GOODS.map((g) => g.give));

// A block written into a cell the player's body fills holds them for good: the chunk's trimesh collider stops the
// capsule from inside, the build ray from inside hits the block's inner face (so mining takes the cell beyond it), and
// with the camera in the cell every face points away from the eye and the FrontSide terrain material culls it, so the
// block cannot be seen (Kevin, 2026-10-30; tests/integration/place-clear-of-player-rapier.test.jsx). So no cell the body
// fills is placed. The test is the capsule itself, not the KCC's 0.05 m offset around it: a cell inside that offset
// band but clear of the capsule does not hold the player (measured at gaps 0 to 0.1 m against real Rapier), and
// refusing it would refuse a block laid against the player's side.
function bodyCapsules(store) {
    const body = store.playerRigidBodyRef?.current;
    if (!body) return [];
    const out = [];
    // Where the body is and where it is going: a move given on a frame that took no world step is in nextTranslation()
    // and not yet in translation() (game/kinematicMove.js), and the next step puts the body there.
    const at = body.translation();
    const next = body.nextTranslation();
    // The live colliders, not BASE_CAPSULE: a beast form swaps the shape in place (game/beasts.js setColliderToForm).
    for (let i = 0; i < body.numColliders(); i++) {
        const c = body.collider(i);
        const p = c.translation();
        const halfHeight = c.halfHeight(), radius = c.radius();
        out.push({ x: p.x, y: p.y, z: p.z, halfHeight, radius });
        out.push({ x: p.x + next.x - at.x, y: p.y + next.y - at.y, z: p.z + next.z - at.z, halfHeight, radius });
    }
    return out;
}

// The body's rotations are locked, so each capsule's core is a vertical segment; the distance from it to the unit cell
// is the box distance on each axis, and the cell overlaps the capsule when that is under the radius.
function cellInCapsule(cell, cap) {
    const dx = Math.max(cell.x - cap.x, 0, cap.x - (cell.x + 1));
    const dz = Math.max(cell.z - cap.z, 0, cap.z - (cell.z + 1));
    const dy = Math.max(cell.y - (cap.y + cap.halfHeight), 0, (cap.y - cap.halfHeight) - (cell.y + 1));
    return Math.hypot(dx, dy, dz) < cap.radius;
}

/**
 * @param {{hitPoint: THREE.Vector3, normal: ({x:number,y:number,z:number}|null), direction: THREE.Vector3}|null} h the build-ray hit
 * @param {{post: (msg: object) => void, playPlace?: (pos: THREE.Vector3, block: string) => void,
 *   cells?: {add: (x: number, y: number, z: number) => number}}} io `cells` holds each placed cell solid from the click
 *   (world/placedCellColliders.js) and numbers its edit
 * @returns {number} the cells placed (0 = refused)
 */
export function placeAtHit(h, { post, playPlace, cells: solidCells }) {
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
    // its header says why the cap is an economy decision, given the per-cell debit below. A chest is one storage
    // container keyed by its own cell, so it always places as a single cell at the aimed one, whatever the build mode.
    const mode = type === 'chest' ? 'single' : store.buildingMode || 'single';
    const footprint = buildFootprint(mode, store.buildSize || 1, { x: tx, y: ty, z: tz }, h.normal);
    const body = bodyCapsules(store);
    const cells = footprint.filter((c) => !body.some((cap) => cellInCapsule(c, cap)));
    // Said whenever a cell is held back, a footprint's included: a gap the player did not see coming reads as a bug.
    if (cells.length < footprint.length) notifyDenied('in-the-way');

    const newBlocks = new Map(store.worldBlocks);
    let placed = 0;
    for (const c of cells) {
        // Placement spends the block, and the debit is the stop condition: a footprint the stack cannot cover places
        // what it can afford. Mining grants +1, so any free cell is an infinite-material loop.
        if (!store.consumeForPlacement(type)) break;
        const cx = chunkOf(c.x);
        const cz = chunkOf(c.z);
        // Solid now, not when the chunk's trimesh lands some frames later; the worker echoes `seq` on the meshes it makes
        // after this edit, which is how the cuboid knows when the trimesh holding this cell exists.
        const seq = solidCells?.add(c.x, c.y, c.z);
        post({ type: 'update_block', payload: { cx, cz, x: c.x - cx * CHUNK_SIZE, y: c.y, z: c.z - cz * CHUNK_SIZE, blockType: numericType, seq } });
        newBlocks.set(`${c.x}_${c.y}_${c.z}`, numericType);
        placed++;
    }
    if (placed === 0) {
        // Not one cell affordable: say so, or an empty stack reads as a dead button.
        if (cells.length > 0) notifyDenied(FORGED.has(type) ? 'no-block-forge' : 'no-block', BLOCK_TYPES[type]?.name || type);
        return 0;
    }

    // Once per action, not per cell: a 64-cell footprint must not bank 64 ember ticks or stack 64 place sounds. The store
    // pays it only by day and only up to the day's building allowance (game/ember.js).
    store.accrueBuildEmber();
    playPlace?.(placePos, useGameStore.getState().selectedBlock);
    // A low spark count keeps the iPad fill-rate envelope.
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
