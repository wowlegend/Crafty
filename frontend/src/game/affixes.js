// affixes.js — PURE minimal item-affix model (W4 YAGNI first cut). No store / no React. A small fixed
// affix pool, a SEEDED deterministic roll (so a given item+seed always rolls the same affixes -> capture-
// and save-stable), and a fold that turns rolled affixes into a stat-delta map the store can merge into the
// existing equipment stat fold. Deliberately NO set-bonus engine / NO loot-roll integration / NO UI here
// — this is the foundation a later depth pass extends, not the full system. (The store fold across the 7
// effectiveWith call sites is deferred with the loot-integration pass; it is a dormant no-op until items
// actually carry affixes, so there is no value in wiring it ahead of the roll-on-drop step.)

// stat names align with the store's EQUIPMENT_STATS axes (armor/strength/agility/intellect).
export const AFFIX_POOL = [
  { id: 'keen',     label: 'Keen',     stat: 'strength',  value: 3 },
  { id: 'tough',    label: 'Tough',    stat: 'armor',     value: 5 },
  { id: 'swift',    label: 'Swift',    stat: 'agility',   value: 4 },
  { id: 'arcane',   label: 'Arcane',   stat: 'intellect', value: 4 },
  { id: 'guarded',  label: 'Guarded',  stat: 'armor',     value: 8 },
  { id: 'mighty',   label: 'Mighty',   stat: 'strength',  value: 6 },
];

// A tiny LCG so the roll is deterministic + dependency-free (same generator family as world/climate.js).
function lcg(seed) {
  let s = (Number(seed) | 0) || 1;
  return () => (s = (Math.imul(1664525, s) + 1013904223) | 0) / 4294967296 + 0.5;
}

// Roll `count` UNIQUE affixes for an item, seeded by (itemId + seed) so it is reproducible. Fisher-Yates
// over a copy of the pool, then take the first `count`. count clamped to [0, pool length].
export function rollAffixes(itemId, count, seed = 1) {
  const n = Math.max(0, Math.min(AFFIX_POOL.length, Math.floor(Number(count) || 0)));
  if (n === 0) return [];
  // mix the itemId into the seed so different items with the same numeric seed diverge.
  let mixed = Number(seed) | 0;
  for (let i = 0; i < String(itemId).length; i++) mixed = (Math.imul(31, mixed) + String(itemId).charCodeAt(i)) | 0;
  const rnd = lcg(mixed || 1);
  const pool = AFFIX_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, n).map((a) => ({ id: a.id, label: a.label, stat: a.stat, value: a.value }));
}

// Fold a list of rolled affixes into a {stat: summedValue} delta map (stacking duplicates).
export function foldAffixStats(affixes) {
  const out = {};
  if (!Array.isArray(affixes)) return out;
  for (const a of affixes) {
    if (!a || !a.stat) continue;
    out[a.stat] = (out[a.stat] || 0) + (Number(a.value) || 0);
  }
  return out;
}
