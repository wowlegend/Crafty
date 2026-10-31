// The Shadow Dragon's terrain smash: the ground blocks inside a sphere broken, up to a count, in the worker and in the
// store's record. Out of render/BossEntity.jsx so the unit suite drives the function the dragon calls
// (tests/gates/build-edit-order-gates.test.js).
import { useGameStore } from '../store/useGameStore';
import { chunkOf, CHUNK_SIZE } from './loadedChunks.js';
import { recordingAtClick } from './cellEdits.js';

export const destroyVoxelsInRadius = (centerPos, radius, maxCount) => {
    const store = useGameStore.getState();
    const worker = store.terrainWorker;
    const getGround = store.getMobGroundLevel;
    if (!worker || !getGround) return;

    const blocksToBreak = [];
    const minX = Math.floor(centerPos.x - radius);
    const maxX = Math.ceil(centerPos.x + radius);
    const minZ = Math.floor(centerPos.z - radius);
    const maxZ = Math.ceil(centerPos.z + radius);

    // The block each column stands on, inside the sphere: the ground probe answers the top FACE, a whole number up to f32
    // noise on either side, so the block is the face rounded, less one (the face's floor is the air above the block). One
    // block a column, a crater one deep. A chest is a player's, so the smash leaves it.
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const dx = x + 0.5 - centerPos.x;
            const dz = z + 0.5 - centerPos.z;
            if (dx * dx + dz * dz <= radius * radius) {
                const groundY = getGround(x, z);
                if (groundY !== null && !isNaN(groundY)) {
                    const blockY = Math.round(groundY) - 1;
                    const dy = blockY + 0.5 - centerPos.y;
                    if (dx * dx + dy * dy + dz * dz <= radius * radius && blockY > 1 && !store.chests?.has(`${x}_${blockY}_${z}`)) {
                        blocksToBreak.push({ x, y: blockY, z });
                    }
                }
            }
        }
    }

    if (blocksToBreak.length === 0) return;

    const countToBreak = Math.min(blocksToBreak.length, maxCount);
    const chosen = [];
    for (let i = 0; i < countToBreak; i++) {
        const randIdx = Math.floor(Math.random() * blocksToBreak.length);
        chosen.push(blocksToBreak.splice(randIdx, 1)[0]);
    }

    const newBlocks = new Map(store.worldBlocks);
    chosen.forEach(b => {
        const cx = chunkOf(b.x); // the ONE chunk index (world/loadedChunks.js, review #5 R6.7)
        const cz = chunkOf(b.z);
        const lx = b.x - cx * CHUNK_SIZE;
        const lz = b.z - cz * CHUNK_SIZE;

        // A hazard's: its block_broken pays, counts and sounds nothing (world/mineAtHit.js creditBrokenBlock).
        worker.postMessage({
            type: 'update_block',
            payload: { cx, cz, x: lx, y: b.y, z: lz, blockType: 0, source: 'dragon' }
        });

        newBlocks.set(`${b.x}_${b.y}_${b.z}`, 0);
    });

    // Recorded at the smash, so a build-tool edit posted before it and answered after it must not write over these cells.
    recordingAtClick(chosen.map((b) => `${b.x}_${b.y}_${b.z}`));
    store.setWorldBlocks(newBlocks);
};
