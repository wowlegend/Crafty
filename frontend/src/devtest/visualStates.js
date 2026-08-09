// THE GATED VISUAL STATES — the single source of truth for which frames assert a regression baseline.
//
// This list used to live as a literal inside tests/visual/diff.test.js, where nothing could compare it
// against reality. On 2026-08-02 that cost 23% of the gate's apparent coverage: seven frames were being
// CAPTURED and BASELINED but were absent from the literal, so they asserted nothing for weeks and nobody
// could see it. Four of them (`beast-*`) had been committed as "review artifacts" and simply forgotten;
// their baselines were pictures of an empty mountain.
//
// It was fixed by hand and left ungated. Now it is a module both the comparator and a gate import, so
// "baselined" and "asserted" cannot drift apart again without something going red.
//
// PROMOTION IS NOT AESTHETIC APPROVAL. A baseline says "do not let this change WITHOUT NOTICING"; it does
// not say the look is final. Holding a frame OUT to preserve the option of changing it later buys
// nothing — it was already changeable, just unguarded.
export const VISUAL_STATES = Object.freeze([
  'menu',
  'explore-day',
  'explore-night',
  'boss-obsidian',
  'character-closeup',
  'boss-closeup',
  'primitives-showcase-en',
  'primitives-showcase-zh',
  'inventory-open',
  'achievements-open',
  'spell-cast',
  'spell-iceball',
  'spell-lightning',
  'spell-arcane',
  'title-mascot',
  'loot-showcase',
  'hearth',
  'biome-snow',
  'ocean-depth',
  'ocean-coast',
  'landmark',
  'mobile',
  'mob-bestiary',
  'progression-open',
  'beast-fire',
  'beast-ice',
  'beast-lightning',
  'beast-arcane',
  'explore-day-med',
  'explore-day-low',
  'explore-night-low',
]);

/**
 * PURE. Reconcile the states that ASSERT against the baseline files that EXIST.
 *
 * Split out from the filesystem call so both failure shapes are unit-testable with no disk:
 *   - ORPHAN:  a committed baseline no state asserts  -> the 2026-08-02 defect, silent coverage loss
 *   - MISSING: a state with no baseline to compare to -> the gate cannot run for that frame
 *
 * @param {readonly string[]} states     the states that assert (VISUAL_STATES)
 * @param {readonly string[]} baseNames  basenames without extension, e.g. ['menu', 'hearth']
 * @returns {{ok: boolean, checked: number, orphans: string[], missing: string[]}}
 */
export function reconcileVisualStates(states, baseNames) {
  const declared = new Set(states);
  const onDisk = new Set(baseNames);
  const orphans = [...onDisk].filter((n) => !declared.has(n)).sort();
  const missing = [...declared].filter((n) => !onDisk.has(n)).sort();
  return { ok: orphans.length === 0 && missing.length === 0, checked: states.length, orphans, missing };
}
