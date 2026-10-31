// The MINE verb's executor and the payment for a removed block. Terrain.jsx owns the build ray and the terrain worker and
// hands the worker's posts in; the rest lives here so the unit suite drives the same function the verb router calls
// (tests/gates/build-tools-table-gates.test.jsx, tests/gates/build-tools-worker-gates.test.js).
import { useGameStore } from '../store/useGameStore';
import { blockForId } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { chunkOf, CHUNK_SIZE } from './chunkLayout.js';
import { recordingAtClick, editsOwed } from './cellEdits.js';
import { notifyDenied } from '../ui/denyToast.js';

/** The blocks a removal took go into the inventory as themselves (an ore drops its ore, world/blockIds.js), with one
 *  inventory write per kind of block, not per block. */
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
 * A lone removal's `block_broken` (world/cellEdits.js `heard`): the single mine's is paid as the block it took (a chest as
 * the chest it was), counted once toward Miner and Deep Digger and heard where the block was. Any other removal, the
 * dragon's smash, pays, counts and sounds nothing: no player asked for it.
 * @param {{x: number, y: number, z: number, blockType: number, source?: string, drop?: string}} payload
 * @param {(pos: {x: number, y: number, z: number}) => void} [playBreak] the break sound (Terrain.jsx hands it in)
 */
export function creditBrokenBlock(payload, playBreak) {
    if (payload.source !== 'player') return;
    const store = useGameStore.getState();
    if (payload.drop === 'chest') store.addToInventory('chest', 1);
    else payBrokenBlocks([payload]);
    playBreak?.({ x: payload.x + 0.5, y: payload.y + 0.5, z: payload.z + 0.5 });
    store.onBlockBreak?.();
}

/**
 * @param {{hitPoint: object, normal: ({x:number,y:number,z:number}|null), targetedX: number, targetedY: number,
 *   targetedZ: number, targetCoords: string}|null} h the build-ray hit (Terrain.jsx castBuildRay)
 * @param {{post: (msg: object) => void, editCells: (edit: object,
 *   onApplied: (applied: number[], recordable?: number[], broken?: object[]) => void) => void,
 *   playBreak?: (pos: object) => void}} io the worker's postMessage and its batched edit (world/cellEdits.js), and the
 *   Delete Tool's break sound (the single mine's is played by creditBrokenBlock, on the worker's block_broken)
 * @returns {Promise<number>} the blocks the verb asked the worker to remove: the Delete Tool's, once the worker has said
 *   which it took; the single mine's at once, since it is paid when its block_broken arrives, not by this answer
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

    // Paid, counted toward Miner and Deep Digger and heard when the worker says what it broke (creditBrokenBlock), never at
    // the click: a second click before the rebuilt trimesh lands aims at the cell this one emptied and breaks nothing. A
    // chest's voxel is wood and its record is deleted below, before the answer, so what it is owed is said here.
    const chest = !!(store.chests && store.chests.has(h.targetCoords));
    post({ type: 'update_block', payload: { cx, cz, x: lx, y: ty, z: lz, blockType: 0, source: 'player', drop: chest ? 'chest' : undefined } });

    // Recorded at the click: a placement of this cell still waiting on the worker must not record its block over this.
    recordingAtClick([`${tx}_${ty}_${tz}`]);
    const newBlocks = new Map(store.worldBlocks);
    newBlocks.set(`${tx}_${ty}_${tz}`, 0);
    store.setWorldBlocks(newBlocks);

    if (chest) {
        const newChests = new Map(store.chests);
        newChests.delete(h.targetCoords);
        useGameStore.setState({ chests: newChests });
    }
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
    // Said, or a click on the ground reads as a dead tool. The notice states the rule, not a verdict on the block: the
    // footprint may hold a chest the player placed, which is never taken. Not while an answer is owed either: a block
    // placed a moment ago is not in the record yet, so the click may be on one the player placed.
    if (cells.length === 0) { if (!editsOwed()) notifyDenied('delete-rule'); return Promise.resolve(0); }
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
