import { describe, it, expect } from 'vitest';
import { parseHook, callersFor, CALLERS, checkBlock, renderBlock, derive, BEGIN, END } from '../../scripts/ci/gate-table.mjs';

/**
 * `gate-table.mjs` had NO test. Found 2026-09-22 by teaching `gate-census.mjs` to ask a STRUCTURAL
 * question — "does this module export a seam that nothing imports?" — rather than the name list I first
 * wrote (`/_|-ratchet|read-order|doc-anchors/`), which would have missed this file entirely. That name
 * list was the same named-exception defect this session spent the day deleting from other gates, written
 * by me, in the instrument built to find such things. The structural version found two real gaps on its
 * first run and correctly excluded three pure CLIs.
 *
 * WHY THIS ONE MATTERS. It generates the gate table in `.agent/AGENTS.md` FROM THE HOOK ITSELF, and it
 * exists because the hand-kept version undercounted its own gates three times in a row — "three" ->
 * "Six" -> "NINE" against a live ten — each rewrite written to fix the last. The "Six" version stated
 * the wrong number directly above a table already showing eight, and a six-agent review read that
 * paragraph closely with five of six certifying the old count.
 *
 * So the failure mode is precise and it is a DENOMINATOR bug: `parseHook` silently returning fewer gates
 * than the hook contains. Its own comments record two live instances — an anchor at column 0 dropped
 * three indented gates and the table reported 9 of 12, and a hardcoded gate name meant the second
 * range-reading gate would have been absent. Both are undercounts, and an undercount in a generator is
 * invisible precisely because the output still looks like a complete table.
 *
 * Every case below therefore drives `parseHook` with a synthetic hook where the right answer is known by
 * construction. Fixtures, not the real file: a test that reads the real hook cannot distinguish "the
 * parser works" from "the hook happens to be shaped the way the parser expects today".
 *
 * BLIND SPOT, stated (R7): nothing here asserts the table in AGENTS.md is CURRENT — that is
 * `doc-currency`'s job via `checkBlock`, and it is asserted here only that `checkBlock` can tell a
 * drifted block from a current one. Nor does anything check that a parsed gate actually RUNS.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
const HOOK = `#!/bin/sh
node "$ROOT/frontend/scripts/ci/mutation-proof-trailer.mjs" "$RANGE"
node "$ROOT/frontend/scripts/ci/baseline-trailer.mjs" "$RANGE"
step "opsec-scan (a PUBLIC repo)" node scripts/ci/opsec-scan.mjs --all
step "eslint" npm run --silent lint
if [ "$TIER" != "commit" ]; then
  step "queue-ledger" node scripts/ci/queue-ledger.mjs
fi
if [ "$TIER" = "fast" ]; then
  step "npm audit" npm audit --audit-level=high || true
fi
step "build" npm run build
`;

describe('gate-table — parseHook is a COUNT, so its denominator is the whole point', () => {
  const gates = parseHook(HOOK);

  it('finds EVERY gate in the fixture — the count, asserted', () => {
    // The named failure: silently returning fewer than the hook contains.
    expect(gates.map((g) => g.name)).toEqual([
      'mutation-proof-trailer', 'baseline-trailer', 'opsec-scan', 'eslint', 'queue-ledger', 'npm audit', 'build',
    ]);
  });

  it('finds INDENTED steps — an anchor at column 0 once dropped three gates and reported 9 of 12', () => {
    const indented = gates.filter((g) => ['queue-ledger', 'npm audit'].includes(g.name));
    expect(indented).toHaveLength(2);
  });

  it('derives the TIER from the guard structure, never from prose', () => {
    const tier = Object.fromEntries(gates.map((g) => [g.name, g.tier]));
    expect(tier['opsec-scan'], 'an unguarded step is core — every caller runs it').toBe('core');
    expect(tier['queue-ledger'], 'a `!=` guard is an EXCLUSION, not an absent guard').toBe('not-commit');
    expect(callersFor({ tier: 'not-commit' }), 'excluded from commit, so it must not be printed as a commit gate')
      .toEqual({ commit: false, push: true, ci: true });
    expect(tier['npm audit'], 'inside `= fast` -> CI only').toBe('fast');
    expect(tier['build'], 'after `fi` the tier must RESET, or every later gate inherits the last guard').toBe('core');
    expect(tier['mutation-proof-trailer'], 'a pre-banner $RANGE gate is the hook\'s own').toBe('range');
  });

  it('a pre-banner $RANGE gate is matched STRUCTURALLY, not by name', () => {
    // It used to hardcode `mutation-proof-trailer`, so a SECOND such gate would have been absent from
    // the table — the same self-undercount this file exists to stop. Both are present above; this pins
    // that the second one is found for structural reasons.
    expect(gates.filter((g) => g.tier === 'range').map((g) => g.name))
      .toEqual(['mutation-proof-trailer', 'baseline-trailer']);
  });

  it('a COMMENTED-OUT gate is not a gate', () => {
    const out = parseHook('#   node "$ROOT/frontend/scripts/ci/opsec-scan.mjs" "$RANGE"\n');
    expect(out, 'a commented invocation was counted as a live gate').toEqual([]);
  });

  it('an empty hook yields an empty list rather than throwing — and that is a CONTROL failure upstream', () => {
    // R3a: the generator must not invent rows, but a zero count means the parse found nothing, which
    // callers have to treat as broken rather than as "no gates".
    expect(parseHook('')).toEqual([]);
  });

  it('callersFor maps every tier, and defaults to core for an unknown one', () => {
    expect(Object.keys(CALLERS).sort()).toEqual(['core', 'fast', 'not-commit', 'not-fast', 'not-push', 'push', 'range']);
    expect(callersFor({ tier: 'core' })).toEqual({ commit: true, push: true, ci: true });
    expect(callersFor({ tier: 'fast' }), 'a CI-only gate must not be printed as a pre-push gate')
      .toEqual({ commit: false, push: false, ci: true });
    expect(callersFor({ tier: 'nonsense-tier' })).toEqual(CALLERS.core);
  });

  it('renderBlock emits one row per gate, between the sentinels', () => {
    const block = renderBlock(gates, '');
    expect(block.startsWith(BEGIN)).toBe(true);
    expect(block.endsWith(END)).toBe(true);
    for (const g of gates) expect(block, `${g.name} is missing from the rendered table`).toContain(g.name);
  });

  it('checkBlock accepts the CURRENT block and rejects a drifted one — both directions', () => {
    const { gates: liveGates, ciText } = derive();
    const current = renderBlock(liveGates, ciText);
    expect(checkBlock(`intro\n${current}\noutro`).ok, 'the positive control failed').toBe(true);
    expect(checkBlock(`intro\n${current.replace('| eslint', '| eslintX')}\noutro`).ok,
      'a drifted table passed as current').toBe(false);
    expect(checkBlock('no table here at all').ok).toBe(false);
  });
});
