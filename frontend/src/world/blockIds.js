// blockIds.js — THE single source of truth for the block-name <-> worker-id mapping (R4a).
//
// WHY THIS EXISTS:
// The name->id map (the PLACE path) and the id->name map (the MINE path) were maintained as two independent
// hand-written literals in Terrain.jsx (:724 and :585). They drifted, and the game shipped a hotbar that
// lies:
//     diamond / gold / iron / coal  -> sent as 3 (STONE)  instead of 13 / 12 / 11 / 10
//     water                         -> sent as 4 (SAND)   instead of 9
//     glass / cobblestone / lava    -> sent as 3 (STONE)  -- these have NO engine id at all
//     anything unmapped             -> fell back to `|| 1` (GRASS)
// So selecting Diamond in the hotbar and clicking placed a grey stone block. 4 of the 9 hotbar blocks placed
// the wrong material. (Nothing was destroyed — placing does not consume inventory — but in a voxel BUILDER
// the palette IS the product.)
//
// The engine's id space is defined by the worker: `terrain.worker.js` BLOCK_COLORS keys, and
// `proceduralTextures.js` builds a DataArrayTexture where **layer index == block code** (numLayers = 14).
// So ids 0..13 are the ENTIRE supported space. Anything outside it cannot be rendered, and must not be
// silently substituted — it must be refused.
//
// Rule from here on: there is ONE table. Both directions are derived from it. They cannot drift.

/**
 * The engine-supported voxel ids. Keys MUST match `BLOCK_COLORS` in terrain.worker.js and the texture-array
 * layer indices in proceduralTextures.js — layer index == block code. Adding a block here without adding its
 * colour AND its texture layer will render it untextured; block-id-gates.test.js locks the three in sync.
 */
export const BLOCK_ID = Object.freeze({
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  snow: 5,
  wood: 6,
  leaves: 7,
  cactus: 8,
  water: 9,
  coal: 10,
  iron: 11,
  gold: 12,
  diamond: 13,
  // R4a: cobblestone + glass were in the HOTBAR but had NO engine id — placing them produced STONE.
  // They now have real voxel ids + texture layers (proceduralTextures numLayers 14 -> 16).
  // NOTE on glass: it renders OPAQUE for now. The greedy mesher's only non-solid block is water
  // (`blockA !== 9`); true see-through glass needs a second transparent draw pass, which is a separate
  // render slice. An opaque glass-textured block is still GLASS (correct identity + colour) — vastly better
  // than silently becoming stone. True transparency is tracked in STATUS as a follow-up.
  cobblestone: 14,
  glass: 15,
});

/** id -> name. Derived, never hand-written. `air` is excluded (0 means "no block"). */
export const BLOCK_NAME = Object.freeze(
  Object.fromEntries(
    Object.entries(BLOCK_ID)
      .filter(([name]) => name !== 'air')
      .map(([name, id]) => [id, name]),
  ),
);

/**
 * Aliases: distinct inventory/BLOCK_TYPES entries that the engine renders as an existing voxel.
 * These are DELIBERATE and lossy-by-design, not bugs — unlike the old map, they are declared, not implied.
 *   birch_wood -> wood     (no distinct birch voxel)
 *   chest      -> wood     (the chest's identity lives in the `chests` Map, not the voxel)
 *   flower_*   -> leaves   (foliage voxel)
 */
export const BLOCK_ALIAS = Object.freeze({
  birch_wood: 'wood',
  chest: 'wood',
  flower_red: 'leaves',
  flower_yellow: 'leaves',
});

/**
 * Blocks that exist in BLOCK_TYPES (and some in the hotbar!) but that the ENGINE CANNOT PLACE — no id, no
 * colour, no texture layer. They must be REFUSED, not silently turned into stone.
 * Removing entries from here is the R4b slice: give them real ids + texture layers (+ glass transparency).
 */
export const UNPLACEABLE = Object.freeze([
  // `lava` is a BLOCK_TYPES entry with no voxel id, no colour and no texture layer. It is worldgen/hazard
  // flavour, is NOT in HOTBAR_BLOCKS, and giving the player a placeable lava block is a design decision
  // (Kevin's), not a bug fix. It is REFUSED rather than silently substituted with stone.
  'lava',
]);

/**
 * Resolve a block NAME to the worker id to place.
 * @param {string} name
 * @returns {number|null} the voxel id, or NULL when the engine cannot place it (caller must refuse — do NOT
 *          substitute a default; a silent default is exactly the bug this module exists to kill).
 */
export function idForBlock(name) {
  if (!name) return null;
  if (UNPLACEABLE.includes(name)) return null;
  const resolved = BLOCK_ALIAS[name] || name;
  const id = BLOCK_ID[resolved];
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Resolve a worker id back to the block name (what the player receives when they mine it).
 * @param {number} id
 * @returns {string|null}
 */
export function blockForId(id) {
  return BLOCK_NAME[id] || null;
}
