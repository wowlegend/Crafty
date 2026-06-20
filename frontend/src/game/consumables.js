// consumables.js — PURE exact-name consumable registry + effect resolver (W-AUDIT fix). No React/store.
// FIXES the substring consume-trap: the old inventory isConsumable did `[...,'Diamond',...].some(c =>
// item.includes(c))`, so 'Diamond Sword' / 'Diamond Helmet' / etc all tested TRUE -> equippable gear
// showed a hover "Use" button that granted XP and DESTROYED the item (the starting inventory ships a
// Diamond Sword + Golden Crown, so a player could delete their best weapon turn 1). Exact-name keys
// eliminate the false positives while keeping the intended XP tokens (the raw 'Diamond' gem, Star
// Fragment, and the dual-affordance Golden Crown helmet). Names match the items.js registry display names.
export const CONSUMABLE_EFFECTS = {
  'Health Potion': { heal: 30 },
  'Mana Potion': { mana: 40 },
  'Cooked Porkchop': { feed: 40, heal: 10 },
  'Cooked Beef': { feed: 40, heal: 10 },
  'Raw Porkchop': { feed: 15 },
  'Raw Beef': { feed: 15 },
  'Rotten Flesh': { feed: 10 },
  'Diamond': { xp: 50 },        // the raw legendary gem (items.js diamond_gem) — NOT 'Diamond Sword' etc.
  'Golden Crown': { xp: 200 },  // intentionally dual: an equippable helmet OR cash-in for XP
  'Star Fragment': { xp: 100 },
};

// EXACT match (not substring) — the whole point of the fix.
export function isConsumable(itemName) {
  return typeof itemName === 'string' && Object.prototype.hasOwnProperty.call(CONSUMABLE_EFFECTS, itemName);
}

// The effect map for a consumable, or null for anything else (so the consume handler no-ops on gear).
export function consumeEffect(itemName) {
  return isConsumable(itemName) ? CONSUMABLE_EFFECTS[itemName] : null;
}
