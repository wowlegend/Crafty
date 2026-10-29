/**
 * relics.js — the relics loot brings and the one relic slot holds (DECISIONS 2026-10-28 W1-H item 6). Each relic changes
 * one Aspect verb, written in the same modifier vocabulary a talent uses (game/verbMods.js: `{ key, add }`), so a relic
 * and a talent that touch the same verb add up. Keyed by display name, as loot and the inventory are (data/lootTables.js,
 * `inventory.blocks`). Pure data.
 */
import { SNARE_ARC } from './soulbind.js';

// What each does in words, at the tier it is tempered to, is ui/relicText.js, through the locale.
export const RELICS = Object.freeze({
  'Ember Fang': Object.freeze({ verb: 'roar', mod: Object.freeze({ key: 'roarSec', add: 4 }) }),
  Lodestone: Object.freeze({ verb: 'grab', mod: Object.freeze({ key: 'grabThrows', add: 1 }) }),
  'Snare Knot': Object.freeze({ verb: 'snare', mod: Object.freeze({ key: 'snareArc', add: SNARE_ARC }) }),
  'Prism Shard': Object.freeze({ verb: 'imbue', mod: Object.freeze({ key: 'imbueChain', add: 1 }) }),
});

/** The relic named `name`, or null. */
export function relicByName(name) {
  return (typeof name === 'string' && Object.prototype.hasOwnProperty.call(RELICS, name)) ? RELICS[name] : null;
}

// Mara's Forge tempers a relic (game/forge.js): at tier N its modifier counts N times. The tier belongs to the relic, not
// the slot, so a relic swapped out keeps it.
export const RELIC_MAX_TIER = 3;

/** The tier of relic `name` in a saved `relicTiers` map: 1 for a relic never tempered or an unreadable entry. */
export function relicTier(relicTiers, name) {
  if (!relicByName(name) || !relicTiers || typeof relicTiers !== 'object') return 1;
  const raw = Object.prototype.hasOwnProperty.call(relicTiers, name) ? Math.floor(Number(relicTiers[name])) : 1;
  return Number.isFinite(raw) ? Math.min(RELIC_MAX_TIER, Math.max(1, raw)) : 1;
}

/** A saved `relicTiers` map kept to the relics that exist, each tier read by relicTier, tier I left out. Pure. */
export function normalizeRelicTiers(relicTiers) {
  const out = {};
  for (const name of Object.keys(RELICS)) {
    const tier = relicTier(relicTiers, name);
    if (tier > 1) out[name] = tier;
  }
  return out;
}
