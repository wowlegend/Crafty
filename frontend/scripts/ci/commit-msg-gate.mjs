#!/usr/bin/env node
/**
 * COMMIT-MSG GATE — the same mutation-proof demand as pre-push, moved to where the message is still cheap
 * to fix.
 *
 * WHY A SECOND PLACE. `mutation-proof-trailer.mjs` runs at PUSH time over a commit RANGE. By then the
 * message is written and the only remedy is `git commit --amend` — which this project forbids for fix-ups
 * (`.agent/AGENTS.md`: "Subagent fix-ups = NEW commits, never --amend/reset"). So the pre-push failure mode
 * is a real bind: the check is right, and obeying it costs a rewrite of history you are not allowed to do.
 * At commit-msg time the message has not been recorded yet, the editor is still open, and adding the
 * trailer is free.
 *
 * This does NOT replace the pre-push gate. Hooks are local and skippable (`--no-verify`, a fresh clone with
 * no `core.hooksPath`), so the push-time check stays as the backstop that sees whatever actually arrives.
 * Two checks, one definition: both import GATE_PATHS / TRAILER / touchesAssertions from
 * `mutation-proof-trailer.mjs`, so the rule cannot drift between them — which is the defect the read-order
 * work spent this session eliminating from the docs.
 *
 * SCOPE, identical to pre-push: a STAGED gate file that is ADDED, or MODIFIED in an assertion-bearing way.
 * A rename, an import reorder or a comment fix stays silent, because a trailer demanded for every edit is
 * noise and noise is how a check gets switched off.
 *
 *   node scripts/ci/commit-msg-gate.mjs <path-to-COMMIT_EDITMSG>
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_PATHS, TRAILER, touchesAssertions } from './mutation-proof-trailer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** Strip comment lines git puts in the template — they are not part of the message. */
export function stripComments(msg) {
  return msg.split('\n').filter((l) => !l.startsWith('#')).join('\n');
}

/**
 * PURE: given the staged file lists and the message, what does this commit owe?
 * `assertionEdits` is the subset of `modified` whose diff touched assertions — computed by the caller so
 * this stays testable without a repo.
 */
export function owedProof({ added = [], assertionEdits = [], message = '' }) {
  const isGate = (f) => GATE_PATHS.some((re) => re.test(f));
  const newGates = added.filter(isGate);
  const rewritten = assertionEdits.filter(isGate);
  const owes = newGates.length + rewritten.length > 0;
  return { owes, newGates, rewritten, satisfied: !owes || TRAILER.test(stripComments(message)) };
}

function main() {
  const msgPath = process.argv[2];
  if (!msgPath) { console.error('commit-msg-gate: no message path given'); process.exit(1); }

  let added = [];
  let modified = [];
  try {
    const list = (filter) => git(['diff', '--cached', '--name-only', `--diff-filter=${filter}`]).trim().split('\n').filter(Boolean);
    added = list('A');
    modified = list('M');
  } catch {
    // No index, an unborn HEAD, a merge in progress — never block a commit over an unreadable index.
    console.log('commit-msg-gate: index not readable — skipping');
    return;
  }

  const isGate = (f) => GATE_PATHS.some((re) => re.test(f));
  const assertionEdits = modified
    .filter(isGate)
    .filter((f) => touchesAssertions(git(['diff', '--cached', '-U0', '--', f])));

  const message = readFileSync(msgPath, 'utf8');
  const r = owedProof({ added, assertionEdits, message });
  if (!r.owes || r.satisfied) return;

  console.error('\n✖ commit-msg: this commit changes a GATE but states no proof that it can fail.\n');
  for (const g of r.newGates) console.error(`      + (new)       ${g}`);
  for (const g of r.rewritten) console.error(`      ~ (assertions) ${g}`);
  console.error(
    '\n  LOOP-CHARTER §3: a gate green on day one against unfixed code is a RUBBER STAMP, and the slice\n' +
      '  that shipped it is VOID. Break what it guards, watch it go RED, restore from a cp-backup\n' +
      '  (never `git checkout <file>`), then add the trailer to this message:\n\n' +
      '      Mutation-Proof: <what you broke> -> <the gate> went RED (<the message it printed>)\n\n' +
      '  You are being told NOW, while the message is still open, precisely so you do not have to amend\n' +
      '  later. Do not weaken this check to get past it.\n',
  );
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
