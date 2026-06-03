import { normalizeItemName } from '../data/items.js';

// Legacy saves keyed inventory items by an emoji-prefixed name; the registry decoupled
// identity from emoji, so on load we strip a leading emoji from every inventory key,
// merging quantities when two legacy keys normalize to the same clean name. Safe + minimal.
export const normalizeInventoryKeys = (inventory) => {
  if (!inventory || typeof inventory !== 'object') return inventory;
  const out = {};
  for (const [section, items] of Object.entries(inventory)) {
    if (!items || typeof items !== 'object') { out[section] = items; continue; }
    const normalized = {};
    for (const [key, qty] of Object.entries(items)) {
      const cleanKey = normalizeItemName(key);
      normalized[cleanKey] = (normalized[cleanKey] || 0) + qty;
    }
    out[section] = normalized;
  }
  return out;
};
