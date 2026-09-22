import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BEGIN, END, SURFACES, ORDER, renderBlock, checkFile, checkAll } from '../../scripts/ci/read-order.mjs';

const REPO = resolve(process.cwd(), '..');

/**
 * `read-order.mjs` had NO test. Found 2026-09-22 by `gate-census.mjs`, but only after fixing a defect in
 * the census itself: five files under `scripts/ci/` all scored 0/5 and looked like one uniform class of
 * "unevidenced", when four of them are pure helpers driven by tests elsewhere (`_density-ratchet` by
 * four) and exactly one — this one — was driven by nothing at all. A uniform low score across a class
 * conveys nothing and hid the single real gap inside it. Read the count, not the tick, applied to the
 * census's own output.
 *
 * WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS. This module is the single source of the orientation read
 * order, rendered into `.agent/AGENTS.md`, `LOOP-CHARTER.md` and `LOOP-KERNEL-PROMPT.md`. It exists
 * because those three each kept their own copy and all three drifted — while one of them asserted the
 * two "cannot disagree". `doc-currency` checks the RENDERED blocks against `checkFile`, so if
 * `checkFile` ever returns ok for a stale or missing block, the drift it was built to stop becomes
 * invisible in all three surfaces at once, and the instrument that reports it is this one.
 *
 * This file lives in `tests/scripts/` because its subject IS a file's content and its generator — the
 * documented split. It is NOT sited here to dodge the source-grep ratchet: it does not read source text
 * at all, it EXECUTES the module against fixtures.
 *
 * BLIND SPOT, stated (R7): nothing here asserts the order is the RIGHT one. `ORDER` is a judgement about
 * what to read first and no test can hold an opinion about it. What is checked is that the judgement has
 * exactly one home, renders completely, and that a drifted copy cannot pass as current.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('read-order — the generator behind the orientation block', () => {
  it('the canonical lists are non-empty and their sizes are pinned', () => {
    // R3a: every assertion below quantifies over these. Emptied, they pass vacuously.
    expect(ORDER.length).toBe(8);
    expect(SURFACES.length).toBe(3);
    expect(new Set(SURFACES).size, 'a duplicated surface is a silently halved denominator').toBe(SURFACES.length);
  });

  it('renderBlock emits EVERY order entry, numbered, inside the sentinels', () => {
    const block = renderBlock();
    expect(block.startsWith(BEGIN)).toBe(true);
    expect(block.endsWith(END)).toBe(true);
    // Count the numbered lines rather than spot-checking one: a dropped entry is the failure mode, and
    // `toContain` on a single path cannot see it.
    const numbered = block.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(numbered).toHaveLength(ORDER.length);
    for (const [i, o] of ORDER.entries()) {
      expect(numbered[i].startsWith(`${i + 1}. ${o.path} — `), `entry ${i + 1} is not ${o.path}`).toBe(true);
    }
  });

  it('checkFile ACCEPTS a current block — the positive control', () => {
    // Without this, every rejection below is satisfied by a checkFile that rejects everything.
    expect(checkFile(`intro\n${renderBlock()}\noutro`)).toEqual({ ok: true, reason: 'READ-ORDER block is stale' });
  });

  it('checkFile REJECTS a missing block, and says which failure it is', () => {
    const r = checkFile('a document that never heard of the read order');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('READ-ORDER block missing');
  });

  it('checkFile REJECTS a block that drifted by ONE CHARACTER', () => {
    // The real defect is a hand-edited rendered copy, which differs by very little. A check that only
    // caught wholesale replacement would pass the exact drift this module exists to stop.
    const drifted = renderBlock().replace('1. ', '1.  ');
    const r = checkFile(`intro\n${drifted}\noutro`);
    expect(r.ok, 'a one-character drift passed as current').toBe(false);
    expect(r.reason).toBe('READ-ORDER block is stale');
  });

  it('checkFile REJECTS a block missing its final entry', () => {
    const truncated = renderBlock().split('\n').filter((l) => !l.startsWith(`${ORDER.length}. `)).join('\n');
    expect(checkFile(`x\n${truncated}\ny`).ok).toBe(false);
  });

  it('every declared surface EXISTS and carries the current block', () => {
    // checkAll reads the real files, so this is also the coverage assertion: a surface deleted from disk
    // throws here rather than silently shrinking what doc-currency guards.
    for (const rel of SURFACES) {
      expect(() => readFileSync(resolve(REPO, rel), 'utf8'), `${rel} is declared a surface but missing`).not.toThrow();
    }
    const results = checkAll();
    expect(results).toHaveLength(SURFACES.length);
    expect(results.filter((r) => !r.ok).map((r) => `${r.rel}: ${r.reason}`)).toEqual([]);
  });
});
