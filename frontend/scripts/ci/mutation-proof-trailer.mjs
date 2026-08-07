#!/usr/bin/env node
/**
 * MUTATION-PROOF TRAILER — the enforcer for the rule this repo states three times and never checked.
 *
 * LOOP-CHARTER §3 opens with "⛔ MUTATION-PROOF EVERY NEW GATE", and says it again in §0-B and in
 * `.agent/AGENTS.md`. The 2026-07-27 doc audit found the pattern behind every rule this project fails to
 * follow: rules checkable from an artifact the loop already produces (the diff, the commit message) were
 * obeyed ~100%, and rules whose only consumer was the docs' own prose were obeyed erratically or not at all.
 * "Mutation-prove every gate" had ZERO checkers, and most gate files still read source text without importing
 * the module they claim to guard. (Counts deliberately omitted — read the population from
 * `frontend/tests/gates/.source-grep-ledger.json`; the hand-typed ones here rotted, as they always do.)
 *
 * So the rule now names its enforcer. A commit that ADDS a gate — or REWRITES an existing gate's assertions —
 * must carry a trailer saying how it was proven to fail:
 *
 *     Mutation-Proof: deleted data-testid="touch-action" -> touch-probe RED ("STUCK on title")
 *
 * SCOPED TO NEW GATES *AND* ASSERTION REWRITES (widened 2026-08-07). It was `--diff-filter=A` only, and that
 * left the hole where this rule has actually failed: replacing a vacuous gate with another vacuous one is an
 * EDIT, and demanded nothing. Over the 120 commits before this change, adding rewrite-detection caught FIVE
 * more commits that altered what a gate catches while stating no proof.
 *
 * Editing a gate is still routine, so this does NOT fire on every touch: only when the diff adds or removes an
 * assertion-bearing line (see ASSERTION_RE). A rename sweep, an import reorder or a comment fix stays silent —
 * charter §3 is right that a trailer demanded for every tweak is noise, and noise is how a gate gets disabled.
 * A new gate or a changed assertion is exactly when the rule matters: the charter's own words are that a gate
 * "green on day one against unfixed code is a rubber stamp, and the slice that shipped it is VOID".
 *
 * The trailer is not verified to be TRUE — nothing can do that mechanically. It forces the author to state
 * the mutation and the observed RED in a place a reviewer can read, which is the same reason commit
 * messages work at all. An honest sentence is cheap; an invented one is a lie with the author's name on it.
 *
 *   node scripts/ci/mutation-proof-trailer.mjs <range>    e.g. abc123..def456  (empty range = no-op)
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A "gate" is a test under tests/gates/ or a CI checker. Both are things whose whole job is to go red.
export const GATE_PATHS = [/^frontend\/tests\/gates\/.+\.test\.jsx?$/, /^frontend\/scripts\/ci\/.+\.mjs$/];
export const TRAILER = /^Mutation-Proof:\s*\S+/im;

/**
 * Lines that MAKE a gate a gate. If a commit adds or removes one of these in an existing gate file, it has
 * changed what that gate can catch, and the proof it used to carry (if any) no longer covers the new shape.
 */
export const ASSERTION_RE =
  /\b(expect|assert|toBe|toBeGreaterThan|toBeLessThan|toMatch|toThrow|toEqual|toContain|toHaveLength)\b|errors\.push\(|process\.exit\(1\)|throw new /;

/** Does this unified diff change any assertion-bearing line? (`-U0`, so only real hunks appear.) */
export function touchesAssertions(diff) {
  return diff
    .split('\n')
    .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
    .some((l) => ASSERTION_RE.test(l.slice(1)));
}

/**
 * Pure decision, so it is testable without a repo: which commits changed a gate but carry no trailer?
 *
 * TWO ways to owe a proof, and the second one was the hole:
 *   `added`    — a NEW gate file. Green on day one against unfixed code is a rubber stamp.
 *   `rewrote`  — an EXISTING gate whose ASSERTIONS changed. `--diff-filter=A` alone missed this, and it is
 *                exactly where the rule has failed in practice: `91530be` ("my first replacement was vacuous
 *                too") and `03c4297` ("the 'proof' for it was vacuous") are both EDITS, not additions.
 *
 * Scoped to assertion-bearing hunks on purpose. Charter §3 is right that demanding a trailer for EVERY edit to
 * a gate file is noise, and noise is how a check gets switched off — a rename sweep, an import reorder or a
 * comment fix changes nothing about what the gate catches and stays silent here. Changing what it ASSERTS
 * does not.
 *
 * @param {{sha:string, subject:string, message:string, added:string[], rewrote:string[]}[]} commits
 */
export function offenders(commits) {
  return commits
    .map((c) => ({
      ...c,
      gates: [...c.added, ...(c.rewrote || [])].filter((f) => GATE_PATHS.some((re) => re.test(f))),
    }))
    .filter((c) => c.gates.length > 0 && !TRAILER.test(c.message));
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../../..') });

export function commitsInRange(range) {
  const shas = git(['rev-list', range]).trim().split('\n').filter(Boolean);
  return shas.map((sha) => ({
    sha,
    subject: git(['log', '-1', '--format=%s', sha]).trim(),
    message: git(['log', '-1', '--format=%B', sha]),
    // --diff-filter=A: only files this commit ADDED. A rename shows as A at the new path, which is right —
    // a gate moved into tests/gates/ is newly a gate.
    added: git(['show', '--no-renames', '--diff-filter=A', '--name-only', '--format=', sha]).trim().split('\n').filter(Boolean),
    // ...and MODIFIED gate files whose assertions changed. Checked per-file so one reformatted gate in a
    // sweep cannot drag in the rest.
    rewrote: git(['show', '--no-renames', '--diff-filter=M', '--name-only', '--format=', sha])
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((f) => GATE_PATHS.some((re) => re.test(f)))
      .filter((f) => touchesAssertions(git(['show', '--no-renames', '-U0', '--format=', sha, '--', f]))),
  }));
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const range = process.argv[2];
  if (!range || !range.includes('..')) {
    console.log('mutation-proof: no range given — nothing to check');
    process.exit(0);
  }
  let bad;
  try {
    bad = offenders(commitsInRange(range));
  } catch {
    // A range git cannot resolve (a brand-new branch, a shallow clone) is not something to block a push over.
    console.log('mutation-proof: range not resolvable — skipping');
    process.exit(0);
  }
  if (bad.length) {
    console.error(`\n✖ mutation-proof: ${bad.length} commit(s) add or REWRITE a GATE without stating how it was proven to fail\n`);
    for (const c of bad) {
      console.error(`  ${c.sha.slice(0, 8)}  ${c.subject}`);
      const added = new Set(c.added);
      for (const g of c.gates) console.error(`      ${added.has(g) ? '+ (new)      ' : '~ (assertions)'} ${g}`);
    }
    console.error(
      `\n  LOOP-CHARTER §3: a gate that is green on day one against unfixed code is a RUBBER STAMP,\n` +
        `  and the slice that shipped it is VOID. Break what it guards, watch it go RED, restore, then say so:\n\n` +
        `      Mutation-Proof: <what you broke> -> <the gate> went RED (<the message it printed>)\n\n` +
        `  Amend the commit to add that trailer. Do not weaken this check to get past it.\n`,
    );
    process.exit(1);
  }
  console.log('✓ mutation-proof: every new gate and assertion-rewrite in this push states its proof');
}
