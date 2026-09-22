// The killability ledger's own selftest.
//
// Mutation-Proof: replaced the `survey_.total === 0` zero-guard in verdict() with a pass-through, and the
// EMPTY-POPULATION case went RED ("expected 0 to be 3") — the exact hole R3a names, where a survey that
// enumerated nothing and a clean suite read identically from outside. Separately, deleting the
// `now > was` branch reds the ROSE case. Both restored from a cp backup.
//
// DRIVEN, NOT GREPPED. `verdict()` is exported precisely so this can execute it on synthetic surveys where
// the answer is known by construction. Asserting that the source text contains a ratchet would be the
// proxy this repo keeps paying for: a comment satisfies it, and a text match cannot tell which occurrence
// is load-bearing.
//
// WHAT THIS DOES NOT CHECK: that the real population regex matches the real tree — that is exercised by
// running the CLI, not by this file — and nothing here or anywhere can check that a receipt is TRUE.
import { describe, it, expect } from 'vitest';
import { verdict, RECEIPT_TOKEN, POPULATION, SELF } from '../../scripts/ci/killability-ledger.mjs';

const surveyOf = (total, unreceipted) => ({
  total,
  receipted: total - unreceipted,
  unreceipted: Array.from({ length: unreceipted }, (_, i) => ({ file: `f${i}` })),
  rows: [],
});
const ledgerOf = (count) => ({ _count: count, _total: 100 });

describe('killability-ledger verdict — the ratchet', () => {
  it('HOLDS when the un-receipted count is unchanged', () => {
    expect(verdict(surveyOf(100, 40), ledgerOf(40)).code).toBe(0);
  });

  it('FAILS when the un-receipted count ROSE — a new check file with no receipt', () => {
    const v = verdict(surveyOf(101, 41), ledgerOf(40));
    expect(v.code).toBe(1);
    expect(v.line).toMatch(/ROSE 40 -> 41/);
  });

  it('PASSES and says so when the ratchet tightened — receipts were paid down', () => {
    const v = verdict(surveyOf(100, 38), ledgerOf(40));
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/TIGHTENED/);
  });

  // R3a — THE EMPTY-INPUT CANARY. This is the case that makes the whole gate meaningful: a survey that
  // enumerated NOTHING must report COULD-NOT-CHECK, never success. Collapsing exit 3 into exit 0 is the
  // entire bug this class describes, and a gate whose population regex silently stops matching would
  // otherwise report a perfect score forever.
  it('reports COULD NOT CHECK (3) on an EMPTY population, never 0', () => {
    const v = verdict(surveyOf(0, 0), ledgerOf(0));
    expect(v.code, 'an empty population read as a PASS — the control failure R3a names').toBe(3);
    expect(v.line).toMatch(/EMPTY/);
  });

  it('reports COULD NOT CHECK (3) when there is no ledger at all', () => {
    expect(verdict(surveyOf(100, 40), null).code).toBe(3);
  });

  // The denominator is emitted on EVERY outcome, not only on failure — printing it only when something
  // breaks is how a suite ends up unable to state its own most important number.
  it.each([
    ['holding', surveyOf(100, 40), ledgerOf(40)],
    ['rose', surveyOf(101, 41), ledgerOf(40)],
    ['tightened', surveyOf(100, 38), ledgerOf(40)],
  ])('emits the denominator on the %s path', (_name, s, l) => {
    expect(verdict(s, l).line).toMatch(/check files carry a killability receipt/);
  });
});

describe('killability-ledger scope — the claim its label makes', () => {
  it('declares its population rather than implying it', () => {
    expect(POPULATION.length).toBeGreaterThan(0);
    for (const p of POPULATION) {
      expect(p.group, 'a population entry with no name cannot be reported on').toBeTruthy();
      expect(p.re).toBeInstanceOf(RegExp);
    }
  });

  it('EXCLUDES scripts/visual probes — they assert nothing by design, so a receipt is a category error', () => {
    const probe = 'scripts/visual/capture.mjs';
    expect(POPULATION.some((p) => p.re.test(probe))).toBe(false);
  });

  it('INCLUDES every group that can fail', () => {
    const shouldMatch = [
      'tests/gates/foo.test.js',
      'tests/scripts/bar.test.js',
      'tests/store/baz.test.js',
      'tests/e2e/qux.spec.js',
      'src/game/thing.test.js',
      'scripts/ci/some-gate.mjs',
    ];
    for (const f of shouldMatch) {
      expect(POPULATION.some((p) => p.re.test(f)), `${f} is not in the declared population`).toBe(true);
    }
  });

  it('uses the same token as the commit trailer, so authors learn one thing', () => {
    expect(RECEIPT_TOKEN).toBe('Mutation-Proof:');
  });
});

// R10 — the exception is gated, not merely documented. This gate excludes exactly two files (its own
// implementation and this file) because a liveness check inside the set it monitors deadlocks. Any THIRD
// entry is a carve-out, and carve-outs are where the next defect lives, so growing the list fails here.
describe('killability-ledger exclusions — the carve-out is itself gated', () => {
  it('excludes exactly its own two files, and nothing else', () => {
    expect([...SELF].sort()).toEqual([
      'scripts/ci/killability-ledger.mjs',
      'tests/scripts/killability-ledger.test.js',
    ]);
  });
});
