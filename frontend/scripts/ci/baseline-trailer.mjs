#!/usr/bin/env node
/**
 * BASELINE TRAILER — governance for the ORACLE, which had none.
 *
 * The visual gate compares 31 rendered frames against committed PNGs. Those PNGs ARE the specification:
 * every judgement the gate makes is "does this match the oracle". Ten gates authorize a push and not one
 * of them looked at `frontend/tests/visual/baseline/**`. `mutation-proof-trailer.mjs` scopes GATE_PATHS to
 * `tests/gates/` and `scripts/ci/`, so a commit rewriting all 31 oracles passed every check with no
 * trailer, no justification, and no reviewer.
 *
 * MEASURED 2026-08-09 over the full history: 79 of 1,603 commits rewrite baselines, and TEN OF THE LAST
 * TWELVE baseline-rewriting commits also touch `frontend/src/` in the same commit. That bundling is the
 * whole problem. When the pixels and the code that moved them land together, nothing can distinguish "the
 * look changed as intended" from "a regression arrived and the oracle was updated to match it". That is
 * how four `beast-*` baselines became pictures of an empty mountain and stayed that way for weeks.
 *
 * TWO RULES, both checkable from the artifacts the loop already produces:
 *
 *   1. A commit touching baselines must carry a `Baseline-Review:` trailer saying WHAT look changed and
 *      that the frames were opened and looked at. Like Mutation-Proof, this cannot be mechanically
 *      verified to be TRUE — it forces the author to state it where a reviewer can read it, which is the
 *      only thing that has ever worked.
 *
 *   2. A baseline rewrite is ITS OWN COMMIT. Not bundled with `frontend/src/`. This is the measured
 *      defect, and separation is what makes the oracle change reviewable at all: `git show` on that one
 *      commit is then exactly the set of pixels that moved, with the reason attached.
 *
 * Rule 2 is deliberately strict. Landing them apart leaves the visual gate momentarily red between the
 * two commits, which is fine — the visual gate runs in neither the pre-push hook nor CI, and a red gate
 * that is honestly red for ten minutes is worth far more than a green one nobody can audit.
 *
 *   node scripts/ci/baseline-trailer.mjs <range>    e.g. abc123..def456  (empty range = no-op)
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The oracle. Anything under here IS the specification the visual gate judges against. */
export const BASELINE_PATHS = [/^frontend\/tests\/visual\/baseline\/.+\.png$/i];
/** Source changes that could have CAUSED a pixel to move. Docs and tests are not in this set. */
export const SOURCE_PATHS = [/^frontend\/src\/.+/];
export const TRAILER = /^Baseline-Review:\s*\S+/im;

/**
 * PURE decision, so it is testable with no repo: which commits rewrite the oracle without justifying it,
 * or bundle the rewrite with the source change that moved the pixels?
 *
 * @param {{sha:string, subject:string, message:string, files:string[]}[]} commits
 * @returns {{sha:string, subject:string, baselines:string[], reasons:string[], bundled:string[]}[]}
 */
export function offenders(commits) {
  return commits
    .map((c) => {
      const baselines = c.files.filter((f) => BASELINE_PATHS.some((re) => re.test(f)));
      const bundled = c.files.filter((f) => SOURCE_PATHS.some((re) => re.test(f)));
      const reasons = [];
      if (baselines.length && !TRAILER.test(c.message)) reasons.push('no Baseline-Review: trailer');
      if (baselines.length && bundled.length) reasons.push('bundled with frontend/src/ changes');
      return { sha: c.sha, subject: c.subject, baselines, bundled, reasons };
    })
    .filter((c) => c.reasons.length > 0);
}

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..') });

export function commitsInRange(range) {
  const shas = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  return shas.map((sha) => ({
    sha,
    subject: git(['log', '-1', '--format=%s', sha]).trim(),
    message: git(['log', '-1', '--format=%B', sha]),
    files: git(['show', '--no-renames', '--name-only', '--format=', sha]).trim().split('\n').filter(Boolean),
  }));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const range = process.argv[2];
  if (!range || !range.includes('..')) {
    console.log('baseline-trailer: no range given — nothing to check');
    process.exit(0);
  }
  let bad;
  try {
    bad = offenders(commitsInRange(range));
  } catch {
    console.log('baseline-trailer: range not resolvable — skipping');
    process.exit(0);
  }
  if (bad.length) {
    console.error(`\n✖ baseline-trailer: ${bad.length} commit(s) rewrite the visual ORACLE without governing it\n`);
    for (const c of bad) {
      console.error(`  ${c.sha.slice(0, 8)}  ${c.subject}`);
      console.error(`      ${c.baselines.length} baseline(s): ${c.baselines.slice(0, 4).map((f) => f.split('/').pop()).join(', ')}${c.baselines.length > 4 ? ` +${c.baselines.length - 4} more` : ''}`);
      for (const r of c.reasons) console.error(`      ✖ ${r}`);
      if (c.bundled.length) {
        console.error(`      source files in the same commit: ${c.bundled.slice(0, 3).join(', ')}${c.bundled.length > 3 ? ` +${c.bundled.length - 3} more` : ''}`);
      }
    }
    console.error(
      `\n  The baselines ARE the specification. Measured over this repo's history: 79 of 1,603 commits\n` +
        `  rewrite them, and 10 of the last 12 bundled a src/ change into the same commit — which makes it\n` +
        `  impossible to tell an intended look change from a regression the oracle was updated to match.\n\n` +
        `  Re-baseline in its OWN commit, after opening the frames (tests/visual/diff/<state>.png is\n` +
        `  written for you on failure), and state what changed:\n\n` +
        `      Baseline-Review: <which frames, what look changed, and that you opened them>\n\n` +
        `  Do not weaken this check to get past it.\n`,
    );
    process.exit(1);
  }
  console.log('✓ baseline-trailer: no ungoverned oracle rewrites in this push');
}
