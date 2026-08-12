/**
 * gearCompare.js — what the gear inspector should actually show you.
 *
 * THE DEFECT THIS EXISTS TO FIX. The inspector rendered one row per stat that the INSPECTED item
 * happens to carry (`stats.armor !== undefined && <row/>`, four times). So any stat you would LOSE by
 * swapping — a key the EQUIPPED item has and the inspected one does not — was omitted entirely. Not
 * shown as a minus, not shown as zero: absent, with nothing on screen suggesting anything was left out.
 *
 * It is not a corner case. Wearing a Golden Crown (intellect 10, armor 5) and hovering an Iron Helmet
 * (armor 6, strength 2), the panel showed "+6 armor (+1)" and "+2 strength (+2)" and said nothing about
 * the 10 intellect the swap would cost. The one screen whose entire job is to answer "is this an
 * upgrade?" was answering it with the downside deleted.
 *
 * The comparison is over the UNION of both stat sets. A stat absent from either side is a zero on that
 * side, which is what "you do not have this stat" means numerically.
 */

/** The order rows appear in, so the panel does not reshuffle as items change. */
export const STAT_ORDER = Object.freeze(['strength', 'agility', 'intellect', 'armor']);

/**
 * @param {object|null} stats        the inspected item's stats
 * @param {object|null} activeStats  the stats of whatever occupies that slot now
 * @returns {Array<{key: string, value: number, active: number, diff: number}>}
 *   `value` is what you would have after the swap, `active` what you have now, `diff` the change.
 */
export function gearStatRows(stats, activeStats) {
  const a = stats || {};
  const b = activeStats || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  // Known stats first, in the canonical order; anything new in the data appears after, rather than
  // being silently dropped — a hardcoded row list is what caused this bug in the first place.
  const ordered = [
    ...STAT_ORDER.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !STAT_ORDER.includes(k)).sort(),
  ];
  return ordered.map((key) => {
    const value = Number(a[key]) || 0;
    const active = Number(b[key]) || 0;
    return { key, value, active, diff: value - active };
  });
}
