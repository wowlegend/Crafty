// The MINE verb's executor and the payment for a removed block. Terrain.jsx owns the build ray and the terrain worker and
// hands the worker's posts in; the rest lives here so the unit suite drives the same function the verb router calls
// (tests/gates/build-tools-table-gates.test.jsx, tests/gates/build-tools-worker-gates.test.js).
import { useGameStore } from '../store/useGameStore';
import { blockForId } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { chunkOf, CHUNK_SIZE } from './chunkLayout.js';
import { recordingAtClick } from './cellEdits.js';

/** A block the worker removed (`block_broken`) goes into the inventory as itself: an ore drops its ore (world/blockIds.js). */
export function payBrokenBlock(payload) {
    const store = useGameStore.getState();
    const blockName = blockForId(payload.blockType);
    if (blockName && store.addToInventory) {
        store.addToInventory(blockName, 1);
    }
}

/** The blocks one batched removal took, paid as themselves with one inventory write per kind of block, not per block. */
function payBrokenBlocks(broken) {
    const counts = new Map();
    for (const b of broken) {
        const blockName = blockForId(b.blockType);
        if (blockName) counts.set(blockName, (counts.get(blockName) || 0) + 1);
    }
    const store = useGameStore.getState();
    for (const [blockName, n] of counts) store.addToInventory(blockName, n);
}

/**
 * @param {{hitPoint: object, normal: ({x:number,y:number,z:number}|null), targetedX: number, targetedY: number,
 *   targetedZ: number, targetCoords: string}|null} h the build-ray hit (Terrain.jsx castBuildRay)
 * @param {{post: (msg: object) => void, editCells: (edit: object,
 *   onApplied: (applied: number[], recordable?: number[], broken?: object[]) => void) => void,
 *   playBreak?: (pos: object) => void}} io the worker's postMessage and its batched edit (world/cellEdits.js)
 * @returns {Promise<number>} the blocks the verb asked the worker to remove: the Delete Tool's, once the worker has said
 *   which it took; the single mine's at once, since its edit is not answered
 */
export function mineAtHit(h, { post, editCells, playBreak }) {
    if (!h) return Promise.resolve(0);
    const store = useGameStore.getState();
    if (store.buildingMode === 'delete') return mineFootprint(h, store, editCells, playBreak);

    const tx = h.targetedX;
    const ty = h.targetedY;
    const tz = h.targetedZ;

    const cx = chunkOf(tx);
    const cz = chunkOf(tz);
    const lx = tx - cx * CHUNK_SIZE;
    const lz = tz - cz * CHUNK_SIZE;

    post({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: 0 } });
    playBreak?.(h.hitPoint);

    // Recorded at the click: a placement of this cell still waiting on the worker must not record its block over this.
    recordingAtClick([`${tx}_${ty}_${tz}`]);
    const newBlocks = new Map(store.worldBlocks);
    newBlocks.set(`${tx}_${ty}_${tz}`, 0);
    store.setWorldBlocks(newBlocks);

    // Clean up chest in Zustand Map
    if (store.chests && store.chests.has(h.targetCoords)) {
        const newChests = new Map(store.chests);
        newChests.delete(h.targetCoords);
        useGameStore.setState({ chests: newChests });
    }

    // M6: a mined block advances the Miner quest + Deep Digger achievement (the callback is
    // registered by QuestSystem; mine() is the 1-action-1-count verb -- NOT the worker handler).
    store.onBlockBreak?.();
    return Promise.resolve(1);
}

/**
 * The Delete Tool's left-click (DECISIONS 2026-10-31 items 233 and 271): the blocks the player placed in its footprint,
 * grown into the face the ray hit, removed in one batch and each paid back as itself from the worker's answer.
 * Generated ground, ore and water are left: a build tool takes back what was built, and a 64-block harvest a click is
 * the pickaxe's job done 64 times over. A chest is never sent, empty or not: it cost eight wood and pays back one. One
 * break sound and one Miner count per click, none when nothing was taken.
 */
function mineFootprint(h, store, editCells, playBreak) {
    const target = { x: h.targetedX, y: h.targetedY, z: h.targetedZ };
    const footprint = buildFootprint('delete', store.buildSize || 1, target, h.normal);
    const own = (k) => store.worldBlocks.get(k) > 0 && !(store.chests && store.chests.has(k));
    const cells = footprint.filter((c) => own(`${c.x}_${c.y}_${c.z}`));
    if (cells.length === 0) return Promise.resolve(0);
    return new Promise((resolve) => {
        editCells({ blockType: 0, cells }, (applied, recordable = applied, broken = []) => {
            if (applied.length === 0) { resolve(0); return; }
            const s = useGameStore.getState();
            payBrokenBlocks(broken);
            const newBlocks = new Map(s.worldBlocks);
            for (const i of recordable) newBlocks.set(`${cells[i].x}_${cells[i].y}_${cells[i].z}`, 0);
            s.setWorldBlocks(newBlocks);
            playBreak?.(h.hitPoint);
            s.onBlockBreak?.();
            resolve(applied.length);
        });
    });
}
