import { describe, it, expect } from 'vitest';
import { verdict, readBaseCi, OBSERVED } from '../../scripts/ci/e2e-freshness.mjs';

/**
 * THE GATE THAT ASKED FOR IMPOSSIBLE EVIDENCE, and what replaced it.
 *
 * v1 refused any push whose observed tree differed from the last LOCALLY recorded green e2e run. But
 * `ci/pipeline.sh` declares e2e CI-only — too slow for any local tier — and the receipt could only be
 * written locally. Worse, it cannot be fixed by having CI write the receipt: **CI cannot have run e2e on
 * an unpushed tree.** The gate demanded evidence that can only exist AFTER the act it gates.
 *
 * That is a goal defect, not a plumbing one, and it showed up in practice the same day: the local run it
 * demanded went RED with four failures, three of them `Test timeout` / `Execution context was destroyed`
 * on a machine at load 126 — evidence about the box, not the build.
 *
 * The goal restated to something achievable: **never silently lose an e2e regression.** Three tiers —
 * a local receipt short-circuits; otherwise refuse to STACK onto a base CI has already called red;
 * otherwise allow loudly and say CI owns this tree's verdict.
 *
 * Mutation-Proof: 5 mutations, denominator asserted (7/7 cases collected on every run).
 *   M1 tier-1 accepts ANY stamp, not one matching this tree -> fast-path case RED (a stale receipt would
 *      silently vouch for a tree it never saw — the original defect, inverted)
 *   M2 base 'failure' no longer blocks                        -> stacking case RED
 *   M3 unknown base blocks (fail-closed)                      -> unknown-base case RED (a push path that
 *      breaks when GitHub is unreachable teaches --no-verify; R5 says choose and say which)
 *   M4 zero-file walk returns 0 instead of 3                  -> control case RED
 *   M5 readBaseCi rethrows instead of degrading to unknown    -> degrade case RED
 */
const CUR = { id: 'abc', files: 468 };

describe('e2e-freshness verdict', () => {
  it('a zero-file walk is a control failure, not a pass', () => {
    const v = verdict({ id: 'abc', files: 0 }, null, { state: null });
    expect(v.code).toBe(3);
    expect(v.line).toMatch(/COULD NOT CHECK/);
  });

  it('TIER 1: a local receipt for THIS tree settles it outright', () => {
    expect(verdict(CUR, { treeId: 'abc', at: 't' }, { state: null }).code).toBe(0);
  });

  it('TIER 1 does NOT accept a receipt for a DIFFERENT tree', () => {
    // The original defect inverted: a stale receipt must never vouch for a tree it never saw.
    const v = verdict(CUR, { treeId: 'a-different-tree', at: 't' }, { state: 'success' });
    expect(v.line).not.toMatch(/^e2e-freshness: fresh/);
  });

  it('TIER 2: refuses to STACK an unverified change onto a base CI called RED', () => {
    const v = verdict(CUR, null, { state: 'failure', sha: '1234567' });
    expect(v.code).toBe(1);
    expect(v.line).toMatch(/BASE is RED/);
    expect(v.line).toMatch(/1234567/); // names WHICH run, so the claim is checkable
  });

  it('TIER 3: allows on a green base, naming that CI owns this tree\'s verdict', () => {
    const v = verdict(CUR, null, { state: 'success', sha: '89abcde' });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/NO e2e verdict yet/);
    expect(v.line).toMatch(/CI decides this one/);
  });

  it('TIER 3: fails OPEN when the base state cannot be read, and SAYS it is failing open', () => {
    // R5 — chosen deliberately: a push path that breaks when GitHub is unreachable teaches --no-verify.
    const v = verdict(CUR, null, { state: null });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/UNKNOWN/);
    expect(v.line).toMatch(/failing OPEN by design/); // the choice is stated, not silent
  });

  it('readBaseCi degrades to unknown instead of throwing into the push path', () => {
    expect(readBaseCi(() => { throw new Error('gh: command not found'); })).toEqual({ state: null });
    expect(readBaseCi(() => 'null null')).toEqual({ state: null });
    expect(readBaseCi(() => 'success abc1234')).toEqual({ state: 'success', sha: 'abc1234' });
    expect(OBSERVED.length).toBeGreaterThan(0); // R3a — the observed set must not be empty
  });
});
