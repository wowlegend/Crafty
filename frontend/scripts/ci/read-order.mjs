#!/usr/bin/env node
/**
 * READ ORDER — one canonical orientation order, generated into all three surfaces that state it.
 *
 * WHY. Three documents each carried their own copy and all three disagreed:
 *   .agent/AGENTS.md   git → STATUS → ACTIVE_PLAN → CHARTER → DECISIONS → INDEX
 *   LOOP-CHARTER §0-A  git → STATUS → ACTIVE_PLAN → charter → INDEX → SOTA-INITIATIVE
 *   LOOP-KERNEL        ACTIVE_PLAN → HOLISTIC-REVIEW → STATUS → CHARTER → DECISIONS → INDEX
 * AGENTS.md asserted "Order matches LOOP-CHARTER.md §0-A **so the two documents cannot disagree**" —
 * while they disagreed. §0-A omits DECISIONS entirely; the kernel is the only one that names the
 * PRIMARY work queue at all; only the kernel puts CI in the orientation.
 *
 * A rule stated in three places is three places to drift, and the charter's own §8 forbids exactly
 * that ("never re-state a rule instead of enforcing it"). So the order lives HERE and is rendered into
 * all three; doc-currency fails on drift, the same contract measure.mjs and gate-table.mjs already have.
 *
 * RECONCILIATION NOTE (the one real conflict): AGENTS/charter call STATUS.md "THE source of truth"
 * while the kernel calls it the SECONDARY queue. Both are right about different things and the
 * imprecision is what made them look contradictory — STATUS is the source of truth for WHERE WE ARE;
 * HOLISTIC-REVIEW is the primary WORK QUEUE. Stated separately below so neither has to lose.
 *
 *   node scripts/ci/read-order.mjs           print the canonical block
 *   node scripts/ci/read-order.mjs --write   write it into all three surfaces
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

export const BEGIN = '<!-- BEGIN READ-ORDER (regenerate: node frontend/scripts/ci/read-order.mjs --write) -->';
export const END = '<!-- END READ-ORDER -->';

/** Every surface that states the orientation order. Adding one here is all it takes. */
export const SURFACES = [
  '.agent/AGENTS.md',
  'docs/superpowers/LOOP-CHARTER.md',
  'docs/superpowers/LOOP-KERNEL-PROMPT.md',
];

/** THE canonical order. Edit here, regenerate, never edit a rendered copy. */
export const ORDER = [
  { path: '`git main` + **CI on `main`**', note: 'the code is the only truth that cannot lie — and CI IS PART OF THE TREE. `gh run list --workflow=ci.yml --branch main`; a push that leaves CI non-`success` is a RED TREE and outranks every queue item.' },
  { path: '`memory/ACTIVE_PLAN.md`', note: 'the live cursor — the ONE unit in flight right now.' },
  { path: '`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md`', note: '**DRAINED 2026-08-12 — no longer a work queue.** 215 findings disposed of: 207 fixed, 8 dismissed with runnable proofs, 0 open. Read it as the RECORD of that campaign, not as the next thing to do; the live cursor is ACTIVE_PLAN. **This markdown is the ONLY copy** — the machine JSON it was regenerable from died with a session-scoped tmp scratchpad (verified absent 2026-07-27). Do not hunt for it; its absence is not a blocker.' },
  { path: '`memory/STATUS.md`', note: 'THE source of truth for WHERE WE ARE, and the SECONDARY queue (gameplay/content/UX items the code review did not cover). Both, without contradiction: it owns status, the review owns the work ladder. VERIFY an item is still open before working it — much of the older A-bis/V1 work is DRAINED.' },
  { path: '`docs/superpowers/LOOP-CHARTER.md`', note: 'the constitution — how the loop operates (esp. §0-B harness layer + §3 gates), plus `LOOP-KERNEL-PROMPT.md`, the durable copy of the `/loop` prompt and the cold/git-only recovery source.' },
  { path: '`docs/superpowers/DECISIONS.md`', note: 'the decision RECORD. `KEVIN-REVIEW-BATCH.md` is the append-only INBOX and structurally cannot tell you what is settled. A reversal is a NEW dated entry naming the one it supersedes — never a silent edit.' },
  { path: '`docs/superpowers/INDEX.md`', note: 'the doc map — what to read and what to IGNORE. A stale doc is a LIVE TRAP; never mine old plans for "what is next".' },
  { path: '`SOTA-INITIATIVE.md`', note: 'DIRECTION only. Its §3 status block is FROZEN — do not read status from it.' },
];

export function renderBlock() {
  return [
    BEGIN,
    '**Orientation read order — GENERATED. Do not edit here.** It lives in',
    '`frontend/scripts/ci/read-order.mjs` and is rendered into every surface that states it, because three',
    'hand-kept copies drifted three different ways while one of them claimed they "cannot disagree".',
    '',
    ...ORDER.map((o, i) => `${i + 1}. ${o.path} — ${o.note}`),
    END,
  ].join('\n');
}

/** Used by doc-currency: does this file carry the current block? */
export function checkFile(md) {
  const want = renderBlock();
  const i = md.indexOf(BEGIN);
  const j = md.indexOf(END);
  if (i < 0 || j < 0) return { ok: false, reason: 'READ-ORDER block missing' };
  return { ok: md.slice(i, j + END.length) === want, reason: 'READ-ORDER block is stale' };
}

export function checkAll() {
  return SURFACES.map((rel) => ({ rel, ...checkFile(readFileSync(join(ROOT, rel), 'utf8')) }));
}

function main() {
  if (!process.argv.includes('--write')) {
    console.log(renderBlock());
    const bad = checkAll().filter((r) => !r.ok);
    if (bad.length) {
      console.error(`\nread-order: ${bad.length} surface(s) stale: ${bad.map((b) => `${b.rel} (${b.reason})`).join(', ')}`);
      process.exit(1);
    }
    console.log(`\n✓ read-order: all ${SURFACES.length} surfaces current`);
    return;
  }
  const block = renderBlock();
  for (const rel of SURFACES) {
    const p = join(ROOT, rel);
    const md = readFileSync(p, 'utf8');
    const i = md.indexOf(BEGIN);
    const j = md.indexOf(END);
    if (i < 0 || j < 0) {
      console.error(`read-order: no markers in ${rel} — add ${BEGIN} / ${END} around its read-order list first`);
      process.exit(1);
    }
    writeFileSync(p, md.slice(0, i) + block + md.slice(j + END.length));
    console.log(`read-order: wrote ${rel}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
