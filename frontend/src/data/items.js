// S1C-M3 item registry — the single source of truth for item name / icon / rarity.
// Keyed by a STABLE id (emoji-free). `icon` is an `Icon` primitive name (see
// src/ui/primitives/Icon.jsx); `rarity` is one of common/rare/epic/legendary.
//
// T3 done: this registry is now the single source of truth — the former duplicated
// getItemRarity was consolidated here (defined only in this file) and getItemEmoji
// was removed under the zero-emoji gate.
//
// getItemRarity preserves CURRENT observed behavior (the T1 characterization
// net) for plain names + lowercase blocks + equipment, while FIXING the
// emoji-prefix + cross-file-divergence cases by routing through this registry.

export const ITEMS = {
  raw_porkchop:       { name: 'Raw Porkchop',        icon: 'meat',       rarity: 'common' },
  raw_beef:           { name: 'Raw Beef',            icon: 'meat',       rarity: 'common' },
  cooked_porkchop:    { name: 'Cooked Porkchop',     icon: 'meat',       rarity: 'rare' },
  cooked_beef:        { name: 'Cooked Beef',         icon: 'meat',       rarity: 'rare' },
  bone:               { name: 'Bone',                icon: 'bone',       rarity: 'common' },
  leather:            { name: 'Leather',             icon: 'leather',    rarity: 'rare' },
  rotten_flesh:       { name: 'Rotten Flesh',        icon: 'meat',       rarity: 'common' },
  iron_nugget:        { name: 'Iron Nugget',         icon: 'ore',        rarity: 'epic' },
  emerald:            { name: 'Emerald',             icon: 'emerald',    rarity: 'epic' },
  arrow:              { name: 'Arrow',               icon: 'arrow',      rarity: 'common' },
  spider_eye:         { name: 'Spider Eye',          icon: 'eye',        rarity: 'common' },
  string:             { name: 'String',              icon: 'string',     rarity: 'common' },
  ender_pearl:        { name: 'Ender Pearl',         icon: 'pearl',      rarity: 'epic' },
  health_potion:      { name: 'Health Potion',       icon: 'potion',     rarity: 'rare' },
  mana_potion:        { name: 'Mana Potion',         icon: 'potion',     rarity: 'epic' },
  damage_scroll:      { name: 'Damage Scroll',       icon: 'scroll',     rarity: 'rare' },
  shield_scroll:      { name: 'Shield Scroll',       icon: 'scroll',     rarity: 'rare' },
  diamond_gem:        { name: 'Diamond',             icon: 'diamond',    rarity: 'legendary' },
  golden_crown:       { name: 'Golden Crown',        icon: 'crown',      rarity: 'legendary' },
  star_fragment:      { name: 'Star Fragment',       icon: 'star',       rarity: 'legendary' },
  sword:              { name: 'sword',               icon: 'sword',      rarity: 'common' },
  pickaxe:            { name: 'pickaxe',             icon: 'pickaxe',    rarity: 'common' },
  wooden_shield:      { name: 'Wooden Shield',       icon: 'shield',     rarity: 'common' },
  stone_sword:        { name: 'Stone Sword',         icon: 'sword',      rarity: 'rare' },
  leather_helmet:     { name: 'Leather Helmet',      icon: 'helmet',     rarity: 'rare' },
  leather_chestplate: { name: 'Leather Chestplate',  icon: 'chestplate', rarity: 'rare' },
  leather_boots:      { name: 'Leather Boots',       icon: 'boots',      rarity: 'rare' },
  iron_sword:         { name: 'Iron Sword',          icon: 'sword',      rarity: 'epic' },
  iron_shield:        { name: 'Iron Shield',         icon: 'shield',     rarity: 'epic' },
  iron_helmet:        { name: 'Iron Helmet',         icon: 'helmet',     rarity: 'epic' },
  iron_chestplate:    { name: 'Iron Chestplate',     icon: 'chestplate', rarity: 'epic' },
  iron_boots:         { name: 'Iron Boots',          icon: 'boots',      rarity: 'epic' },
  diamond_sword:      { name: 'Diamond Sword',       icon: 'sword',      rarity: 'legendary' },
  diamond_shield:     { name: 'Diamond Shield',      icon: 'shield',     rarity: 'legendary' },
  diamond_helmet:     { name: 'Diamond Helmet',      icon: 'helmet',     rarity: 'legendary' },
  diamond_chestplate: { name: 'Diamond Chestplate',  icon: 'chestplate', rarity: 'legendary' },
  diamond_boots:      { name: 'Diamond Boots',       icon: 'boots',      rarity: 'legendary' },
  crown_dragon_king:  { name: 'Crown of the Dragon King', icon: 'crown',  rarity: 'legendary' },
  dragon_scale:       { name: 'Dragon Scale',             icon: 'shield', rarity: 'epic' },
};

// Lookup maps built from ITEMS (clean display name -> id / rarity).
export const NAME_TO_ID = {};
export const NAME_TO_RARITY = {};
for (const [id, def] of Object.entries(ITEMS)) {
  NAME_TO_ID[def.name] = id;
  NAME_TO_RARITY[def.name] = def.rarity;
}

// A single leading emoji (+ optional U+FE0F variation selector + optional space).
// Ranges (expressed via \u{...} so this file stays emoji-free):
//   \u{1F000}-\u{1FAFF}  pictographic supplementary plane
//   \u{2600}-\u{27BF}    misc symbols + dingbats
//   \u{2B00}-\u{2BFF}    misc symbols and arrows
//   \u{2300}-\u{23FF}    misc technical (incl. some emoji)
//   \u{2190}-\u{21FF}    arrows
const LEADING_EMOJI = /^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}])\u{FE0F}?\s?/u;

// Strip ONE leading emoji (+ optional U+FE0F + following space). Returns the
// input unchanged when there is no leading emoji.
export function normalizeItemName(name) {
  if (typeof name !== 'string') return name;
  return name.replace(LEADING_EMOJI, '');
}

// Rarity by stable id OR (clean / emoji-prefixed) display name. Falsy -> common.
// Resolution order: id -> exact clean name -> legacy substring fallback.
export function getItemRarity(idOrName) {
  if (!idOrName) return 'common';
  if (ITEMS[idOrName]) return ITEMS[idOrName].rarity;
  const clean = normalizeItemName(idOrName);
  if (ITEMS[clean]) return ITEMS[clean].rarity;
  if (NAME_TO_RARITY[clean]) return NAME_TO_RARITY[clean];
  // Legacy substring fallback (blocks + unknowns). Order matters.
  if (clean.includes('Diamond')) return 'legendary';
  if (clean.includes('Iron')) return 'epic';
  if (clean.includes('Stone') || clean.includes('Leather')) return 'rare';
  return 'common';
}

// Icon primitive name by stable id OR display name. Unknown/blocks -> null
// (caller renders a BLOCK_TYPES color swatch, never an emoji).
export function getItemIcon(idOrName) {
  if (!idOrName) return null;
  if (ITEMS[idOrName]) return ITEMS[idOrName].icon;
  const clean = normalizeItemName(idOrName);
  if (ITEMS[clean]) return ITEMS[clean].icon;
  const id = NAME_TO_ID[clean];
  if (id) return ITEMS[id].icon;
  return null;
}

// Display name by stable id (falls back to the id itself).
export function getItemName(id) {
  return ITEMS[id]?.name ?? id;
}

/**
 * Inventory keys that are neither a registered ITEM nor a placeable BLOCK, and are still real.
 *
 * The inventory is a bare string->count map: `addToInventory` writes ANY key blindly. That is how Bow ->
 * Arrow x5, Torch -> torch x4 and Planks -> planks x4 shipped and survived (removed 2026-08-09) -- three
 * recipe outputs whose keys resolved on no path in the entire frontend, so the item appeared in the bag
 * and then did nothing, while the ingredients had already been debited.
 *
 * These three are the genuine exceptions: CURRENCIES with real consumers, not placeable and not
 * equippable. Each entry names its consumer, because an unjustified entry here turns a gate that catches
 * that class into an allowlist that hides it.
 *
 *   crystals — spent 15-for-1 on the wand trade, and minted by four ore trades (ui/TradingInterface.jsx)
 *   wand     — bought with crystals; read by the spell-damage focus (EnhancedMagicSystem applyWandFocus)
 *   coins    — the shop currency (ui/TradingInterface.jsx)
 */
export const CURRENCY_KEYS = Object.freeze(['crystals', 'wand', 'coins']);

/**
 * Can the game actually DELIVER this inventory key -- is there any path on which it means something?
 * A key that answers false here is one the player receives and can never use.
 */
export function isDeliverableKey(key) {
  if (!key || typeof key !== 'string') return false;
  return !!(ITEMS[key] || NAME_TO_ID[key] || CURRENCY_KEYS.includes(key));
}
