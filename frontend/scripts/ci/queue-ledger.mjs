#!/usr/bin/env node
/**
 * QUEUE LEDGER — every finding in the queue-of-record carries its own marker, or the count is going down.
 *
 * WHY. `docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` is 528 lines the kernel calls THE PRIMARY QUEUE and
 * STATUS.md calls "the queue of record". It holds 215 confirmed findings and, as of 2026-08-03,
 * **zero markers of any kind** — no ✅, no [x], no ▣. Progress existed only as prose in a changelog, so
 * "~154 of 215 fixed" could not be checked by anyone including its author, and four whole categories
 * (test-bug 13, config-drift 3, perf 2, a11y 1) reached the 07-27 audit with nothing started and nobody
 * noticing. That is the same defect this repo keeps finding: a claim of DONE over items nobody examined.
 *
 * MARKERS go at the head of a finding line:
 *
 *     - ▣✓ a1b2c3d **`src/foo.js:12`** [medium·AUTO·bug] …     fixed, by that commit
 *     - ▢ **`src/bar.js:9`** [low·KEVIN·perf] …                 open
 *     - ⊘ DISMISSED — <reason> — `<command proving it>` **`…`** not a real finding
 *
 * A RATCHET, NOT A ZERO-TARGET, for the same reason the i18n gate is one: 215 unmarked findings cannot be
 * annotated in a single commit, and a gate demanding that would be switched off within a day. The UNMARKED
 * count is frozen and may only FALL. Adding a new finding without a marker raises it and fails — which is
 * correct, since a finding worth recording is worth recording the state of.
 *
 * DISMISSALS ARE CHECKED HARDER than fixes, deliberately. A dismissal is the one disposition with no
 * artifact behind it — nothing compiles, nothing goes green — so it is exactly where self-adjudication
 * hides. The loop's own vacuity pass dismissed 29 of 32 findings on its own authority, and an auditor later
 * mutation-proved that 7 of those stay green when the code they guard is deleted. So every `⊘ DISMISSED`
 * line must carry a backticked command whose output supports it. The command is not run — this cannot know
 * what its output should be — but an unsupported dismissal is a claim, and claims are Rule 2.
 *
 *   node scripts/ci/queue-ledger.mjs           check
 *   node scripts/ci/queue-ledger.mjs --write   re-freeze after REDUCING the unmarked count
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const LEDGER = join(ROOT, 'docs/superpowers/.queue-ledger.json');

export const QUEUES = ['docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md'];

// A finding line: a top-level bullet whose payload starts with a bolded `file:line`.
const FINDING = /^- (.*?)\*\*`/;
const DONE = /^▣✓\s+[0-9a-f]{7,}\s*$/;
const OPEN = /^▢\s*$/;
const DISMISSED = /^⊘\s*DISMISSED\b/;

// Only the confirmed-findings section counts. The doc's tail carries an "Execution batches" listing that
// groups the SAME findings by file, and a naive scan of the whole document counted 243 against a stated
// 215 — a denominator 13% too large, caught only because the doc states its own total. A ratchet frozen on
// a number nobody can explain is the defect this whole file exists to fight.
export const SECTION = /^## Confirmed by kind/;

/** Pure: classify every finding line in the CONFIRMED section of a queue document. */
export function classify(md) {
  const findings = [];
  let inSection = false;
  md.split('\n').forEach((line, i) => {
    if (/^## /.test(line)) inSection = SECTION.test(line);
    if (!inSection) return;
    const m = line.match(FINDING);
    if (!m) return;
    const marker = m[1].trim();
    const state = DONE.test(marker) ? 'done' : OPEN.test(marker) ? 'open' : DISMISSED.test(marker) ? 'dismissed' : 'unmarked';
    // A dismissal must cite a command. Backticks anywhere in the marker segment count.
    const proven = state === 'dismissed' ? /`[^`]+`/.test(marker) : null;
    findings.push({ line: i + 1, state, proven, text: line.slice(0, 110) });
  });
  return findings;
}

export function tally(findings) {
  const n = (s) => findings.filter((f) => f.state === s).length;
  return {
    total: findings.length,
    unmarked: n('unmarked'),
    open: n('open'),
    done: n('done'),
    dismissed: n('dismissed'),
    unprovenDismissals: findings.filter((f) => f.state === 'dismissed' && !f.proven),
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const errors = [];
  const now = {};
  for (const rel of QUEUES) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue; // an archived queue is not a failure
    const t = tally(classify(readFileSync(abs, 'utf8')));
    now[rel] = t.unmarked;
    for (const f of t.unprovenDismissals) {
      errors.push(
        `${rel}:${f.line}: ⊘ DISMISSED with no proof command.\n` +
          `    A dismissal is the one disposition with no artifact behind it — cite the command:\n` +
          `    ⊘ DISMISSED — <reason> — \`<command whose output shows it>\`\n    ${f.text}`,
      );
    }
    if (process.argv.includes('--verbose')) {
      console.log(`  ${rel}: ${t.total} findings — ${t.done} done · ${t.open} open · ${t.dismissed} dismissed · ${t.unmarked} UNMARKED`);
    }
  }

  if (process.argv.includes('--write')) {
    writeFileSync(LEDGER, JSON.stringify(now, null, 2) + '\n');
    console.log(`queue-ledger: froze ${JSON.stringify(now)}`);
    process.exit(0);
  }

  if (!existsSync(LEDGER)) {
    console.error('queue-ledger: no ledger — run with --write once to freeze the baseline.');
    process.exit(1);
  }
  const frozen = JSON.parse(readFileSync(LEDGER, 'utf8'));
  for (const [rel, count] of Object.entries(now)) {
    const was = frozen[rel];
    if (was !== undefined && count > was) {
      errors.push(
        `${rel}: UNMARKED findings ${was} -> ${count}. A finding worth recording is worth recording the\n` +
          `    state of: mark it ▢ (open), ▣✓ <sha> (fixed) or ⊘ DISMISSED — <reason> — \`<proof>\`.`,
      );
    }
  }

  if (errors.length) {
    console.error(`\n✖ queue-ledger: ${errors.length} problem(s)\n`);
    for (const e of errors) console.error('  • ' + e + '\n');
    console.error('  LOOP-CHARTER Rule 5(c): a category is not done until every item carries its own marker.\n');
    process.exit(1);
  }
  const totalUnmarked = Object.values(now).reduce((a, b) => a + b, 0);
  console.log(`✓ queue-ledger: ${totalUnmarked} unmarked finding(s), not rising; every dismissal cites a proof`);
}
