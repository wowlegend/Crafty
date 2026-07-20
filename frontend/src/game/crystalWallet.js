/**
 * crystalWallet.js — the ONE canonical accessor for the crystal/wand currency.
 *
 * B3b (18-domain review, CRITICAL): the crystal/wand economy was a black hole because the currency lived
 * in TWO buckets. WRITES (ore->crystal trade, the craft recipe, addToInventory) bank into `inventory.blocks`
 * — the flat bucket the Inventory panel actually renders. But the READS/SPEND/SEED pointed at
 * `inventory.magic`: the starting crystals+wand seeded into `magic`, the wand trade read/spent `magic.crystals`,
 * and the mana-discount consumer read `magic.wand`. So crystals you EARNED (blocks) could never buy a wand
 * (the trade read magic), the wand trade was mathematically unreachable, and a bought wand (blocks) gave 0%
 * discount (the consumer read magic).
 *
 * Fix: `blocks` is canonical (it is what the Inventory renders and what every writer already targets). Every
 * reader/spender/seed goes through here, so the buckets can't fork again.
 */
export const CRYSTAL_KEY = 'crystals';
export const WAND_KEY = 'wand';

/** Crystals the player can actually spend (the rendered `blocks` bucket). */
export const getCrystals = (inv) => (inv?.blocks?.[CRYSTAL_KEY]) || 0;

/** Wands the player owns (drives the mana-focus discount). */
export const getWands = (inv) => (inv?.blocks?.[WAND_KEY]) || 0;
