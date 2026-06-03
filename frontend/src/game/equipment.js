/**
 * equipment.js — pure, single source of truth for item->slot + weapon->base-damage
 * metadata (consumed by the combat loop AND the build UI). React/store-free.
 */
const SLOT_ITEMS = {
  weapon: ['sword', 'pickaxe', 'Stone Sword', 'Iron Sword', 'Diamond Sword'],
  offhand: ['Wooden Shield', 'Iron Shield', 'Diamond Shield'],
  head: ['Golden Crown', 'Leather Helmet', 'Iron Helmet', 'Diamond Helmet'],
  chest: ['Leather Chestplate', 'Iron Chestplate', 'Diamond Chestplate'],
  boots: ['Leather Boots', 'Iron Boots', 'Diamond Boots'],
};

/** itemName -> equip slot ('weapon'|'offhand'|'head'|'chest'|'boots') or null. */
export function getItemSlot(itemName) {
  if (!itemName) return null;
  for (const slot in SLOT_ITEMS) if (SLOT_ITEMS[slot].includes(itemName)) return slot;
  return null;
}

const WEAPON_BASE_DAMAGE = { 'Stone Sword': 12, 'Iron Sword': 20, 'Diamond Sword': 35, pickaxe: 8, sword: 10 };

/** Flat base melee damage for the equipped weapon name (default 5 = unarmed/unknown). */
export function getWeaponBaseDamage(weaponName) {
  return WEAPON_BASE_DAMAGE[weaponName] || 5;
}
