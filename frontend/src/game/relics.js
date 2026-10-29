/**
 * relics.js — the relics loot brings and the one relic slot holds (DECISIONS 2026-10-28 W1-H item 6). Each relic changes
 * one Aspect verb, written in the same modifier vocabulary a talent uses (game/verbMods.js: `{ key, add }`), so a relic
 * and a talent that touch the same verb add up. Keyed by display name, as loot and the inventory are (data/lootTables.js,
 * `inventory.blocks`). Pure data.
 */
export const RELICS = Object.freeze({
  'Ember Fang': Object.freeze({ verb: 'roar', desc: 'Your roar lasts 4 s longer.', mod: Object.freeze({ key: 'roarSec', add: 4 }) }),
  Lodestone: Object.freeze({ verb: 'grab', desc: 'A grab holds one more block to hurl.', mod: Object.freeze({ key: 'grabThrows', add: 1 }) }),
  'Snare Knot': Object.freeze({ verb: 'snare', desc: 'Your snare\'s aim is twice as wide.', mod: Object.freeze({ key: 'snareArc', add: Math.PI / 8 }) }),
  'Prism Shard': Object.freeze({ verb: 'imbue', desc: 'An imbued zone leaps to one more hostile.', mod: Object.freeze({ key: 'imbueChain', add: 1 }) }),
});

/** The relic named `name`, or null. */
export function relicByName(name) {
  return (typeof name === 'string' && Object.prototype.hasOwnProperty.call(RELICS, name)) ? RELICS[name] : null;
}
