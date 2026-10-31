// The MINE verb's executor and the payment for a removed block. Terrain.jsx owns the build ray and the terrain worker and
// hands the worker's posts in; the rest lives here so the unit suite drives the same function the verb router calls
// (tests/gates/build-tools-table-gates.test.jsx, tests/gates/build-tools-worker-gates.test.js).
import { useGameStore } from '../store/useGameStore';
import { blockForId } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { chestHasItems } from '../game/chestState.js';
import { chunkOf, CHUNK_SIZE, CHUNK_HEIGHT } from './chunkLayout.js';

/** A block the worker removed (`block_broken`) goes into the inventory as itself: an ore drops its ore (world/blockIds.js). */
export function payBrokenBlock(payload) {
    const store = useGameStore.getState();
    const blockName = blockForId(payload.blockType);
    if (blockName && store.addToInventory) {
        store.addToInventory(blockName, 1);
    }
}

/**
 * @param {{hitPoint: object, normal: ({x:number,y:number,z:number}|null), targetedX: number, targetedY: number,
 *   targetedZ: number, targetCoords: string}|null} h the build-ray hit (Terrain.jsx castBuildRay)
 * @param {{post: (msg: object) => void, editCells: (edit: object, onApplied: (applied: number[]) => void) => void,
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

    // M6: a mined block advances the Miner quest + Deep Digger achievement (the callback is
    // registered by QuestSystem; mine() is the 1-action-1-count verb -- NOT the worker handler).
    store.onBlockBreak?.();
    return Promise.resolve(1);
}

/**
 * The Delete Tool's left-click (DECISIONS 2026-10-31 item 233): every solid block of its footprint, grown into the face
 * the ray hit, is removed in one batch, and each is paid back as itself by the worker's block_broken. Water and air are
 * left (the worker takes only a solid block); a chest with something in it is never sent, as the verb router never
 * mines one (input/verbRouter.js); an empty chest goes with its cell. One break sound and one Miner count per click.
 */
function mineFootprint(h, store, editCells, playBreak) {
    const target = { x: h.targetedX, y: h.targetedY, z: h.targetedZ };
    const footprint = buildFootprint('delete', store.buildSize || 1, target, h.normal);
    const cells = footprint.filter((c) => c.y >= 0 && c.y < CHUNK_HEIGHT
        && !chestHasItems(store.chests && store.chests.get(`${c.x}_${c.y}_${c.z}`)));
    if (cells.length === 0) return Promise.resolve(0);
    return new Promise((resolve) => {
        editCells({ blockType: 0, cells }, (applied) => {
            if (applied.length === 0) { resolve(0); return; }
            const s = useGameStore.getState();
            const keys = applied.map((i) => `${cells[i].x}_${cells[i].y}_${cells[i].z}`);
            const newBlocks = new Map(s.worldBlocks);
            for (const k of keys) newBlocks.set(k, 0);
            s.setWorldBlocks(newBlocks);
            if (s.chests && keys.some((k) => s.chests.has(k))) {
                const newChests = new Map(s.chests);
                for (const k of keys) newChests.delete(k);
                useGameStore.setState({ chests: newChests });
            }
            playBreak?.(h.hitPoint);
            s.onBlockBreak?.();
            resolve(applied.length);
        });
    });
}
