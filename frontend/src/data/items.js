// S1C-M3 item registry — the single source of truth for item name / icon / rarity.
// Keyed by a STABLE id (emoji-free). `icon` is an `Icon` primitive name (see
// src/ui/primitives/Icon.jsx); `rarity` is one of common/rare/epic/legendary.
//
// This file is purely ADDITIVE (M3-T2). It does NOT yet replace the duplicated
// getItemRarity/getItemEmoji in SimplifiedNPCSystem/GamePanels — that is T3.
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
