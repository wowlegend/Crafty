// Which removed blocks a worker message bursts into debris (world/BlockParticleSystem.jsx, 8 bodies each from a pool of
// 200). A lone removal's block_broken bursts its block; a batched removal answers with every block it took
// (terrain.worker.js edit_cells), and a Delete Tool click takes up to 64, so only the first few burst: one click wakes at
// most 32 bodies, about the dragon's smash, not the whole pool at once.
/** @internal Exported for the gate that reads the cap; the game reads it through debrisBursts. */
export const DEBRIS_BLOCKS_PER_EDIT = 4;

/** @param {{type: string, payload: object}} msg a terrain worker message @returns {object[]} the blocks to burst */
export function debrisBursts({ type, payload }) {
    if (type === 'block_broken') return [payload];
    if (type === 'cells_edited' && payload.broken) return payload.broken.slice(0, DEBRIS_BLOCKS_PER_EDIT);
    return [];
}
