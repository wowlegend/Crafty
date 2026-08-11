// The source-grep ratchet's comparison, as a pure function so it can be tested without running the CLI.
//
// FRAMEWORK SCOPE: universal. No fs, no argv, no gate-shape specifics — two lists of path strings in,
// two lists out. Extracted because `gate-shape.mjs` runs its whole body at module scope (correctly: it
// is a CLI, and `cli-guard.mjs` forbids a script that both exports a seam and self-executes on import),
// so nothing inside it could be reached by a unit test.
//
// WHY IT EXISTS AT ALL. The ratchet computed additions only — `live.filter(g => !frozen.includes(g))`.
// A frozen entry with no live counterpart was invisible, and one had been sitting in the ledger for
// long enough that the gate printed "115 source-grep gates (ratchet holding)" beside a frozen `_count`
// of 116 without anyone noticing the two were different numbers. Worse than the miscount: a stale entry
// is a FREE SLOT, because a new source-grep gate created at that exact path passes `frozen.includes()`
// and is admitted by the gate whose only job is to refuse it.

/**
 * Compare the frozen gate population against the live one, in BOTH directions.
 *
 * The two directions mean opposite things and must not be netted: `added` is a regression (the
 * population grew), `stale` is good news that needs recording (a gate was converted to behavioural and
 * the ledger has not caught up). A rename is one of each, and a net count would report it as zero.
 *
 * @param {string[]} frozen  paths recorded in the ledger
 * @param {string[]} live    paths found on disk this run
 * @returns {{added: string[], stale: string[]}}
 */
export function ratchetDiff(frozen, live) {
  const f = new Set(frozen);
  const l = new Set(live);
  return {
    added: live.filter((g) => !f.has(g)),
    stale: frozen.filter((g) => !l.has(g)),
  };
}
