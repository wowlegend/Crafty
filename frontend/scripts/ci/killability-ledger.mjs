#!/usr/bin/env node
/**
 * killability-ledger.mjs — how many of this repo's checks have ever been PROVEN to fail?
 *
 * THE NUMBER THIS EXISTS TO PRINT. A green check is worth the PROVENANCE of its criterion times its
 * demonstrated KILLABILITY; either factor at zero makes the product zero. This repo has a receipt regime
 * for the second factor — the `Mutation-Proof:` commit trailer — and one structural weakness: **the
 * receipt is attached to a COMMIT, not to the file it certifies.** Consequences, all measured 2026-09-22:
 *
 *   - 148 proof lines exist in all of git history, covering 113 files, because 28 commits added more
 *     gate files than they stated proofs for. At most 82 files have a DEDICATED receipt.
 *   - The 106 source-grep gates in `.source-grep-ledger.json` have ZERO proof lines between them: they
 *     predate the enforcer, and the enforcer only fires on new files and assertion rewrites.
 *   - Establishing any of that required parsing 1,857 commits. **The suite's most important denominator
 *     was the one number nothing in it could state.**
 *
 * So this moves the receipt to the file and makes the denominator a first-class printed number. R3 says
 * emit the denominator; this is that rule turned on the suite itself.
 *
 * WHAT A RECEIPT IS: the literal token `Mutation-Proof:` inside the check file, naming the mutation that
 * was applied and the RED that was observed. One line. The same token as the commit trailer, deliberately
 * — authors already know it, and a file-local copy is what makes it auditable per file.
 *
 * WHY A RATCHET AND NOT A REQUIREMENT. 465 of 470 files carry no receipt today. A gate demanding one from
 * all of them has exactly two green paths: 465 files of real mutation work, or 465 fabricated sentences.
 * A gate whose only reachable green is to invent data induces the fabrication it exists to prevent, so
 * this freezes the current count and lets it FALL, never RISE — identical in shape to
 * `.source-grep-ledger.json`, which this repo already runs and understands. A NEW check file must carry a
 * receipt; an old one is a debt that can be paid down but never added to.
 *
 * FAIL-CLOSED, on purpose (R5): this runs in CI and pre-push against the TREE, never a developer's
 * uncommitted edit-loop, and a rising un-receipted count is exactly the regression it exists to stop.
 * Exit codes: 0 = checked and within ratchet · 1 = checked and the count ROSE · 3 = COULD NOT CHECK
 * (empty population — a control failure, never a pass).
 *
 * WHAT THIS CANNOT SEE (R7), and it is the same limit the commit trailer has, stated in its own header:
 * **it does not verify the receipt is TRUE.** Nothing can do that mechanically. A receipt proves an author
 * was asked to run a mutation and attached the answer to the file. It cannot tell "deleted the assert ->
 * RED" (a necessity proof) from "halved the damage -> RED" (the sufficiency proof people skip) — it only
 * makes the difference VISIBLE to the next reader, which is the second-order effect that matters.
 * It also says nothing about PROVENANCE, the other factor in the rule.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(HERE, '../..');
export const LEDGER_PATH = resolve(APP_ROOT, 'tests/gates/.killability-ledger.json');
export const RECEIPT_TOKEN = 'Mutation-Proof:';

/**
 * This gate's own implementation and its own selftest, which must never count themselves (R6) — a
 * liveness check that lives inside the set it monitors deadlocks. This is a NAMED EXCEPTION, and a named
 * exception is where the next defect lives, so it is itself asserted: the selftest pins this list
 * exactly, and a third entry appearing here fails that assertion rather than silently widening.
 */
export const SELF = ['scripts/ci/killability-ledger.mjs', 'tests/scripts/killability-ledger.test.js'];

/**
 * THE POPULATION, declared rather than implied — a gate's label is a claim with a scope (R9).
 * Every file here ASSERTS something: it can fail, so it can be asked what makes it fail. Deliberately
 * EXCLUDED: `scripts/visual/*.mjs` (29 probes that drive a browser and mostly assert nothing by design —
 * demanding a mutation receipt from a screenshot harness is a category error).
 */
export const POPULATION = [
  { group: 'tests/gates', re: /^tests\/gates\/.+\.test\.jsx?$/ },
  { group: 'tests/scripts', re: /^tests\/scripts\/.+\.test\.jsx?$/ },
  { group: 'tests/store+data', re: /^tests\/(?!gates\/|scripts\/|e2e\/|visual\/).+\.test\.jsx?$/ },
  { group: 'tests/visual', re: /^tests\/visual\/.+\.test\.jsx?$/ },
  { group: 'tests/e2e', re: /^tests\/e2e\/.+\.spec\.js$/ },
  { group: 'src colocated', re: /^src\/.+\.test\.jsx?$/ },
  { group: 'scripts/ci', re: /^scripts\/ci\/.+\.mjs$/ },
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** PURE-ish: enumerate the population under `root` and split it by receipt presence. */
export function survey(root = APP_ROOT) {
  const files = walk(root).map((f) => relative(root, f));
  const rows = [];
  for (const rel of files) {
    const hit = POPULATION.find((p) => p.re.test(rel));
    if (!hit || SELF.includes(rel)) continue;
    const src = readFileSync(resolve(root, rel), 'utf8');
    rows.push({ file: rel, group: hit.group, receipted: src.includes(RECEIPT_TOKEN) });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  const unreceipted = rows.filter((r) => !r.receipted);
  return { rows, total: rows.length, receipted: rows.length - unreceipted.length, unreceipted };
}

export function readLedger(path = LEDGER_PATH) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeLedger(survey_, path = LEDGER_PATH) {
  const body = {
    _README:
      'Un-receipted check files. MAY FALL, NEVER RISE. A receipt is the token "Mutation-Proof:" inside ' +
      'the file, naming the mutation applied and the RED observed. Regenerate: node scripts/ci/killability-ledger.mjs --write',
    _count: survey_.unreceipted.length,
    _total: survey_.total,
    _receipted: survey_.receipted,
    _frozenAt: new Date().toISOString().slice(0, 10),
    files: survey_.unreceipted.map((r) => r.file),
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

/** The verdict. Separated from I/O so the test can drive it on synthetic surveys. */
export function verdict(survey_, ledger) {
  // R3a — the zero-guard EXITS rather than printing. A survey that enumerated nothing and a suite with
  // no un-receipted files are the same reading from the outside, and only one of them is good news.
  if (survey_.total === 0) {
    return { code: 3, line: 'COULD NOT CHECK: the population is EMPTY — 0 check files enumerated. This is a control failure, not a pass.' };
  }
  if (!ledger) {
    return { code: 3, line: 'COULD NOT CHECK: no ledger. Freeze one with --write.' };
  }
  const now = survey_.unreceipted.length;
  const was = ledger._count;
  const pct = ((survey_.receipted / survey_.total) * 100).toFixed(1);
  const denom = `${survey_.receipted}/${survey_.total} check files carry a killability receipt (${pct}%); ${now} do not`;
  if (now > was) {
    return {
      code: 1,
      line:
        `${denom}\n✖ killability-ledger: un-receipted count ROSE ${was} -> ${now}. A new check file must name ` +
        `the mutation that reds it. Add a "${RECEIPT_TOKEN} <mutation> -> <observed RED>" line to the file.`,
    };
  }
  if (now < was) {
    return { code: 0, line: `${denom}\n✓ killability-ledger: ratchet TIGHTENED ${was} -> ${now}. Re-freeze with --write.` };
  }
  return { code: 0, line: `${denom}\n✓ killability-ledger: holding at ${now}` };
}

// CLI at module scope is what `cli-guard.mjs` forbids, so it is guarded: importing this file for its
// seams must never execute the tool.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const s = survey();
  if (process.argv.includes('--write')) {
    const b = writeLedger(s);
    console.log(`killability-ledger: froze ${b._count} un-receipted of ${b._total} (${b._receipted} receipted)`);
    process.exit(0);
  }
  const v = verdict(s, readLedger());
  console.log(v.line);
  process.exit(v.code);
}
