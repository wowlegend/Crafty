# Loop governing-document SOTA plan — 2026-07-27

> **⚠️ STATUS RE-VERIFIED 2026-08-02: 8 of 14 SHIPPED, 6 REMAIN — the "11 remain" below was stale.**
> Six edits landed during the loop era after this plan was written, and nothing updated the header, so the
> queue kept re-listing finished work. Checked against live files rather than against this document:
>
> | # | Edit | State | Evidence |
> |---|---|---|---|
> | 1 | ORIENT step 0 reads CI by command; green = literal `"success"` | ✅ SHIPPED | `LOOP-KERNEL-PROMPT.md` step 0 |
> | 2 | gate-shape lint | ✅ SHIPPED | `frontend/scripts/ci/gate-shape.mjs`, 399 assertions |
> | 3 | pre-push certifies the PUSHED REFS | ✅ SHIPPED | `.githooks/pre-push` detached-worktree certify |
> | 4 | no external-state claim without a same-turn observation | ✅ SHIPPED | charter, and kernel's "GENERAL RULE" para |
> | 5 | `measure.mjs` — one authority for every number | ⬜ OPEN | file absent |
> | 6 | Rule 5: no self-adjudicated dismissals + category markers | ⬜ OPEN | charter has "may not judge its own completion" only |
> | 7 | AGENTS: full gate table | ✅ SHIPPED | `3555db5` — 9 gates, transcribed from pre-push + ci.yml |
> | 8 | AGENTS tail: STATUS-first read order + post-compaction checklist | ⬜ OPEN | no "Where state lives" section |
> | 9 | charter §0-A/0-B/0-C rewrite | ✅ SHIPPED | `## 0-A. READ ORDER` present |
> | 10 | charter §3: CI as the FIRST gate + mutation-proof trailer | ⬜ OPEN | §3 still opens on MUTATION-PROOF |
> | 11 | delete hand-typed numbers from Tech Stack; MEASURED block | ⬜ OPEN | AGENTS:40 still carries `~14.4k LOC / ~31 files` etc. |
> | 12 | split perf-siege out of the e2e job | ✅ SHIPPED | `8ac8d07`, `@local-only` + `--grep-invert` |
> | 13 | new §8 RULE HYGIENE | ✅ SHIPPED | charter `## 8. Rule hygiene (added 2026-08-02)` |
> | 14 | delete charter §5 + §6 | ⬜ OPEN | both headings still present |
>
> **#5 and #11 are one unit** — the MEASURED block has nothing to source until `measure.mjs` exists, and
> AGENTS:40's counts are the plan's own headline example of a number that rots (already 1.8× wrong the day
> it was committed). Do them together.
>
> *Method note: two of these were nearly mis-recorded as OPEN because the grep was case-sensitive —
> charter §8 is `Rule hygiene`, not `RULE HYGIENE`. Verify a heading's absence case-insensitively.*
>
> **Status: PLAN OF RECORD. 3 of 14 edits are SHIPPED; 11 remain.** *(superseded by the table above.)*
> Produced by a 7-agent review
> (2 external-research lanes + 3 per-document audits + synthesis + adversarial critic) of
> `LOOP-KERNEL-PROMPT.md`, `LOOP-CHARTER.md` and `.agent/AGENTS.md`, run against the findings of the
> 16-agent loop-era audit the same day.
>
> **This file is COMMITTED on purpose.** Its predecessor (`scratchpad/findings.json`) lived in a
> session-scoped tmp dir and was lost, while two docs still instructed cold starts to load it. An
> artifact the loop depends on across sessions must be in git.

## The governing principle

These three documents are a constitution with no judiciary. The audit's split is not diligence — it is mechanism: every rule checkable from an artifact the loop was already producing (the diff, the commit message, the process table) was obeyed ~100% across 999 commits, and every rule requiring a separate experiment whose only consumer was the loop's own prose (mutation-prove, independent evaluation, CI-green, STATUS currency, the priority ladder) was obeyed erratically or not at all. So the docs escalated by repetition instead of enforcement — "mutation-prove every gate" is stated three times across two files and has zero checkers, while 84 of 136 gate files still read source text and never import the module they claim to guard. Second failure: the three documents disagree with each other and nothing detects it — the charter's §0-A read order says STATUS.md is canonical while the kernel demotes it to secondary, `.agent/AGENTS.md` (the ONLY auto-loaded file, and the only surface re-injected after /compact) never names STATUS.md at all and names two of the seven push-authorizing gates, and the kernel cites the coherence pillars at a path that does not exist. Third failure: the docs are full of hand-typed numbers, and a number in a re-read-every-iteration document is a claim with a half-life of days — "~14.4k LOC / ~31 files" was already false by 1.8x on the day it was committed and is now off by 8.5x, and "Components is the LAST single large file" was false at authoring with four other files already ≥900 LOC. Fourth: nothing in 55KB of governing text ever instructs anyone to read state outside the local git object store, which is the complete structural explanation for 88 CI runs and 14 days of nobody looking, and for "CI green" being typed into CHANGELOG.md on a day the entire CI history was one failure and a pile of cancellations. The redesign principle is three sentences long. **A rule names its enforcer or it is deleted** — every surviving bullet carries `[MECH: <checker>]` or `[SELF]`, and `[SELF]` is legitimate only for taste, which is exactly the class the charter already routes to Kevin. **A number is computed or it is deleted** — counts appear only as a command that regenerates them or as a dated past-tense scar. **A claim about a system outside the working tree is emitted by the command that observed it, in the same turn, or it is a fabrication regardless of whether it happens to be true.** Applied honestly this makes all three documents smaller and strictly more binding: the charter goes from 41KB to roughly 20KB while gaining five named checkers.

## Shipped 2026-07-27

- **Edit 1 (partial) — CI is now read by a command.** `70e432e` sharded the e2e job so the workflow can
  CONCLUDE at all (it had concluded `success` 0 times in 88 runs). The kernel text change remains open.
- **Edit — harness lint.** `8e8a7af` extended `no-undef` to `scripts/` + `tests/` (both halves: the npm
  script arg AND the config `files:` filter). Zero findings, mutation-proven RED on an injected symbol.
- **Edit — the fabricated claim itself.** `8e8a7af` struck through the live `CI green` at CHANGELOG.md:447
  with a dated correction. A rule forbidding unverified external claims does not delete an existing one.

## Remaining edits, ranked

### 1. [replace] ORIENT step 0: read CI with a command, and define green as the literal string "success"
**Target:** `LOOP-KERNEL-PROMPT.md`

**Why:** Closes the largest single hole the audit found: no instruction in 55KB of governing text ever reads state outside the local git object store. Verified now: `gh run list --workflow=ci.yml --limit 6` → f0b714e failure, 90d6f49/28243341/97019c2/b443141 all cancelled. Also fixes `git status -s` hiding the ahead/behind line.

**Mechanical check:** Partly self-enforcing (the command IS the mechanism). Full enforcement: add to frontend/scripts/ci/doc-currency.mjs a check that memory/CHANGELOG.md and memory/STATUS.md contain no CI/deploy status word (`CI green|CI passing|deploy(ed)? clean`) outside a fenced block stamped by the emitting command — see edit 4's checker.

<details><summary>Exact text to apply</summary>

```
ORIENT EVERY ITERATION (assume amnesia — the context may have just compacted or reset):
`cd /Users/kz/Code/Crafty && git fetch && git status -sb && git log --oneline -8`
(`-sb`, NOT `-s`: `-s` alone suppresses the `## main...origin/main [behind N]` line, so you cannot tell you are stale.)

0. **STATE YOU CANNOT SEE FROM DISK — compute it BEFORE any doc.** Run this and print the raw JSON in the turn:
   `gh run list --workflow=ci.yml --branch main --limit 6 --json headSha,status,conclusion,createdAt`
   **CI IS PART OF THE TREE. A push that leaves CI non-`success` is a RED TREE and outranks every queue item.**
   Green means exactly one thing: `"conclusion":"success"` on the newest COMPLETED run, at a sha that is an
   ancestor of local HEAD. **`cancelled` · `timed_out` · `skipped` · `neutral` · `stale` · `action_required` ·
   "no run found" · `gh` exit 4 (auth) are ALL NOT-GREEN.** Never write a check — or a sentence — of the form
   "not failure" or "no red X": GitHub reports a job that blows its own `timeout-minutes` as `cancelled`,
   byte-identical to a run superseded by `cancel-in-progress`, and that one ambiguity is the whole failure.
   When the newest completed run is not `success`, read it before anything else: `gh run view --log-failed <id>`.
   *Scar:* ci.yml concluded `success` **0 times in its first 88 runs over 14 days** (86 cancelled, 2 failure) —
   the Playwright job exceeded its 25-min budget every single run — and no document ever told anyone to look.
   It was sharded 3× in `70e432e`; the very next run (`f0b714e`) still concluded **failure**. Confirm a
   `success` with your own eyes before believing any claim that CI is fixed, including this one.
```

Anchor: `ORIENT EVERY ITERATION (assume amnesia — the context may have just compacted or reset):
`cd /Users/kz/Code/Crafty && git fetch && git status -s && git log --oneline -8``
</details>

### 2. [mechanize] MECHANIZE: gate-shape lint — kills comment-satisfied assertions and ratchets the source-grep gate population
**Target:** `frontend/scripts/ci/gate-shape.mjs`

**Why:** The audit's single largest epistemic hole is that 85% of the gate suite is source-grep and the loop self-dismissed 29 of 32 vacuity findings. I prototyped check A against this repo today and it found a genuine, previously-unreported instance: `frontend/tests/gates/place-puff-gates.test.js:19` asserts `expect(terrain).toMatch(/place puff/i)` and the ONLY occurrence of that string in `src/world/Terrain.jsx` is line 862, inside a `//` comment. Delete the comment and the gate reds; delete the feature and it stays green. Measured baseline for check B, run just now: 136 gate files, 116 use readFileSync, 84 are source-grep-only.

**Mechanical check:** It IS the check. Freeze once with `node scripts/ci/gate-shape.mjs --write` (commits .source-grep-ledger.json at 84), then add `node scripts/ci/gate-shape.mjs` to .githooks/pre-push and to the `gates` job of .github/workflows/ci.yml next to bundle-budget.mjs. Dependencies already installed: @babel/parser, acorn, acorn-jsx, oxc-parser all present in frontend/node_modules.

<details><summary>Exact text to apply</summary>

```
#!/usr/bin/env node
/**
 * GATE-SHAPE LINT — mechanical proof that a "gate" is not decoration.
 *
 * WHY (LOOP-CHARTER §3): 116 of the 136 files in frontend/tests/gates/ assert against SOURCE TEXT read with
 * readFileSync instead of executing the module, and 84 of them never import from src/ at all. A whole-file
 * substring assertion is satisfied by a COMMENT naming the symbol, so the gate stays green when the guarded
 * code is deleted. The 2026-07-27 audit found that class by hand seven times. Hand-finding does not scale and
 * does not block a push. This does.
 *
 * TWO deterministic checks. No model, no judgement, nothing to argue with:
 *   A. COMMENT-ONLY ASSERTION (hard fail). For every gate that reads exactly one source file, each
 *      `toMatch(/re/)` is run against that file twice: raw, and with all COMMENT ranges blanked. String
 *      literals are CODE and are NOT blanked. A pattern that matches raw but not blanked is satisfied only by
 *      a comment; it is not a gate.
 *   B. SOURCE-GREP RATCHET. The set of gates that call readFileSync and never import from src/ is frozen in
 *      tests/gates/.source-grep-ledger.json. A NEW member fails the push. Removals only warn (re-freeze with
 *      --write). The population may shrink; it may never grow.
 *
 * Usage: node scripts/ci/gate-shape.mjs           check; exit 1 on failure
 *        node scripts/ci/gate-shape.mjs --write    re-freeze the ratchet after removing members
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const GATES = join(APP, 'tests/gates');
const LEDGER = join(GATES, '.source-grep-ledger.json');

const errors = [];
const warnings = [];

function blankComments(src) {
  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
  } catch {
    return null;
  }
  const chars = src.split('');
  for (const c of ast.comments || []) {
    for (let i = c.start; i < c.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

const files = readdirSync(GATES).filter((f) => /\.test\.jsx?$/.test(f)).sort();

// --- A. COMMENT-ONLY ASSERTIONS -----------------------------------------------------------------
for (const f of files) {
  const src = readFileSync(join(GATES, f), 'utf8');
  const reads = [
    ...src.matchAll(/readFileSync\(\s*(?:resolve|join)\([^)]*?['"]([^'"]+\.(?:jsx?|mjs))['"]\s*\)/g),
  ].map((m) => m[1]);
  const uniq = [...new Set(reads)];
  if (uniq.length !== 1) continue;
  let abs = resolve(GATES, uniq[0]);
  if (!existsSync(abs)) abs = resolve(APP, uniq[0]);
  if (!existsSync(abs)) continue;
  const raw = readFileSync(abs, 'utf8');
  const blanked = blankComments(raw);
  if (blanked === null) continue;
  for (const [, body, flags] of src.matchAll(/toMatch\(\s*\/((?:\\.|[^/\\])+)\/([gimsuy]*)\s*\)/g)) {
    let re;
    try {
      re = new RegExp(body, flags.replace(/[gy]/g, ''));
    } catch {
      continue;
    }
    if (re.test(raw) && !re.test(blanked)) {
      errors.push(
        `COMMENT-ONLY GATE  tests/gates/${f}\n    /${body}/${flags} matches ${uniq[0]} ONLY inside a comment.\n` +
          `    Delete the comment and this gate goes red; delete the FEATURE and it stays green.\n` +
          `    Import the module and assert on executed behaviour, or scope the read to the function body.`
      );
    }
  }
}

// --- B. SOURCE-GREP RATCHET ---------------------------------------------------------------------
const IMPORTS_SRC = /(?:from|import\()\s*['"][^'"]*\/src\/[^'"]*['"]/;
const grepOnly = files.filter((f) => {
  const s = readFileSync(join(GATES, f), 'utf8');
  return /\breadFileSync\b/.test(s) && !IMPORTS_SRC.test(s);
});

if (process.argv.includes('--write')) {
  writeFileSync(
    LEDGER,
    JSON.stringify(
      {
        note: 'Gates that read SOURCE TEXT and never import the module under test. This population may SHRINK, never grow. Re-freeze with `node scripts/ci/gate-shape.mjs --write` only after removing members.',
        count: grepOnly.length,
        files: grepOnly,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`gate-shape: ledger re-frozen at ${grepOnly.length} source-grep-only gates`);
  process.exit(0);
}

if (!existsSync(LEDGER)) {
  errors.push('MISSING tests/gates/.source-grep-ledger.json — run `node scripts/ci/gate-shape.mjs --write` once to freeze the ratchet.');
} else {
  const prev = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const known = new Set(prev.files || []);
  for (const f of grepOnly) {
    if (!known.has(f)) {
      errors.push(
        `NEW SOURCE-GREP-ONLY GATE  tests/gates/${f}\n    It calls readFileSync and never imports from src/, so it proves text exists, not that it runs.\n` +
          `    Import the module and assert on its behaviour. This ratchet only goes down.`
      );
    }
  }
  const gone = (prev.files || []).filter((f) => !grepOnly.includes(f));
  if (gone.length) warnings.push(`${gone.length} gate(s) left the source-grep set (good) — re-freeze with --write: ${gone.join(', ')}`);
}

for (const w of warnings) console.warn(`⚠ gate-shape: ${w}`);
if (errors.length) {
  console.error(`\n✖ gate-shape FAILED (${errors.length})\n`);
  for (const e of errors) console.error(`  • ${e}\n`);
  process.exit(1);
}
console.log(`✓ gate-shape PASSED (${files.length} gate files; ${grepOnly.length} source-grep-only, ratcheted)`);
```

Anchor: `NEW FILE. Wire into .githooks/pre-push and the `gates` job of .github/workflows/ci.yml alongside bundle-budget.mjs.`
</details>

### 3. [mechanize] MECHANIZE: pre-push certifies the PUSHED REFS, not the working tree — and stops exempting itself
**Target:** `.githooks/pre-push`

**Why:** Two verified defects in one file. (1) The hook reads no stdin (verified: zero `read local_ref` in .githooks/pre-push) so it gates the working tree, which is how a broken commit shipped. (2) `APP_TOUCHED=$(echo "$CHANGED" | grep -c '^frontend/')` means a push touching only .github/workflows/ci.yml or .githooks/pre-push skips every gate — the two artifacts whose breakage is hardest to detect. Companion: `"lint": "eslint src"` (verified in frontend/package.json:32) leaves 28 script files and 236 test files outside the crash-class gate that exists because 4 ReferenceError crashes shipped — including doc-currency.mjs and bundle-budget.mjs, which the hook itself shells out to.

**Mechanical check:** It IS the check. Verify the rewrite with `git push --dry-run` on a branch whose tip is broken while the working tree is clean — the old hook passes, the new one fails. Companion edit to frontend/package.json: `"lint": "eslint ."` with eslint.config.js overrides (node globals + no-undef for scripts/, vitest globals for tests/, browser+react for src/) and ignores for dist/, node_modules/, playwright-report/. Land the scope change as its own commit with the resulting error count recorded.

<details><summary>Exact text to apply</summary>

```
#!/bin/sh
# Crafty pre-push gate — certifies the COMMITS BEING PUSHED, not the working tree.
#
# WHY: Vercel auto-deploys every push to `main`, so this hook is the last thing between an agent and
# production. The previous version diffed `@{push}..HEAD` and then ran the gates against the WORKING
# DIRECTORY — which certifies a tree nobody is pushing. A dirty tree that fixed a broken commit let the
# broken commit through green. That actually happened. Git hands us the refs on STDIN
# (`<local ref> <local sha> <remote ref> <remote sha>`) precisely so this cannot occur; use them.
#
# .github/ and .githooks/ are GATE-BEARING, never "docs". A gate that exempts its own configuration from
# itself is not a gate. Only memory/ and docs/ qualify for the fast path.
#
# Deliberately NOT here: the 24-state visual gate (load-sensitive) and e2e (~60s boot) — CI owns those.
# CI is green only when `gh run list --workflow=ci.yml --json conclusion` reports the literal "success".
# `cancelled` is a self-timeout as often as a supersede, and is NOT green.
#
# Escape hatch: `git push --no-verify`. Using it to dodge a red gate is a reward-hack (LOOP-CHARTER §3).

set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
ZERO=0000000000000000000000000000000000000000
WT=""

cleanup() {
  if [ -n "$WT" ]; then git -C "$REPO_ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$local_sha" = "$ZERO" ]; then continue; fi          # ref deletion — nothing to gate
  case "$local_ref" in refs/heads/*) ;; *) continue ;; esac  # tags/notes — not code

  if [ "$remote_sha" = "$ZERO" ]; then
    BASE=$(git merge-base origin/main "$local_sha" 2>/dev/null || echo "")
  else
    BASE="$remote_sha"
  fi
  if [ -n "$BASE" ]; then
    CHANGED=$(git diff --name-only "$BASE" "$local_sha")
  else
    CHANGED=$(git show --pretty=format: --name-only "$local_sha")
  fi

  SHORT=$(git rev-parse --short "$local_sha")
  printf '\n\342\226\266 pre-push: gating %s (%s)\n' "$SHORT" "$local_ref"

  WT=$(mktemp -d "${TMPDIR:-/tmp}/crafty-prepush.XXXXXX")
  rmdir "$WT"
  git -C "$REPO_ROOT" worktree add --detach --quiet "$WT" "$local_sha"
  ln -s "$REPO_ROOT/frontend/node_modules" "$WT/frontend/node_modules"

  printf '  \302\267 doc-currency\n'
  ( cd "$WT/frontend" && node scripts/ci/doc-currency.mjs )

  GATED=$(printf '%s\n' "$CHANGED" | grep -cE '^(frontend/|\.github/|\.githooks/)' || true)
  if [ "$GATED" -eq 0 ] && [ -n "$CHANGED" ]; then
    printf '  \302\267 memory/docs-only \342\200\224 app gates skipped\n'
  else
    printf '  \302\267 eslint (crash-class gate: no-undef / react-jsx-no-undef, WHOLE repo)\n'
    ( cd "$WT/frontend" && npm run --silent lint )
    printf '  \302\267 gate-shape (comment-only assertions + source-grep ratchet)\n'
    ( cd "$WT/frontend" && node scripts/ci/gate-shape.mjs )
    printf '  \302\267 unit + static gates\n'
    ( cd "$WT/frontend" && npm run --silent test:unit )
    printf '  \302\267 build\n'
    ( cd "$WT/frontend" && npm run --silent build )
    printf '  \302\267 bundle byte budget\n'
    ( cd "$WT/frontend" && node scripts/ci/bundle-budget.mjs )
  fi

  git -C "$REPO_ROOT" worktree remove --force "$WT"
  WT=""
  printf '\342\234\223 pre-push: %s is green\n' "$SHORT"
done

printf '\n\342\234\223 pre-push: every pushed ref gated \342\200\224 pushing\n\n'
```

Anchor: `REWRITE the whole file. Companion change in frontend/package.json: "lint": "eslint ." plus per-directory overrides in eslint.config.js.`
</details>

### 4. [insert] Rule 2: no claim about state outside this working tree without a same-turn observation command
**Target:** `LOOP-KERNEL-PROMPT.md`

**Why:** Rule 2 as written scopes verification to 'grep the cited file:line', which every remedy it names is a local file operation — so the fabricated 'CI green' passes it cleanly. This is the exact class the audit calls out as the loop's signature failure: it cannot be trusted on any claim about state it did not itself compute.

**Mechanical check:** Append to frontend/scripts/ci/doc-currency.mjs a check 5: scan memory/CHANGELOG.md, memory/STATUS.md and README.md for /\b(CI|deploy(ment)?|pipeline)\b[^.\n]{0,40}\b(green|passing|clean|success)\b/i and fail unless the match sits inside a fenced block whose first line matches /^observed: \d{4}-\d{2}-\d{2}T/ — i.e. a machine block emitted by the command that queried it. Retrofitting the two existing occurrences is a one-line commit.

<details><summary>Exact text to apply</summary>

```

   **The same gate binds HARDER on state OUTSIDE this working tree, because there is no file to open.** CI
   conclusions, deploy status, remote refs, badge state, PR/issue state: you may write a claim about them ONLY
   in a turn that also contains the command that observed them (`gh run list`, `gh api`, `git ls-remote`, a live
   fetch). **No command in the turn ⇒ no claim in the doc.** When you have not checked, the correct token is
   `CI: not checked this tick` — that is a true sentence and it costs nothing.
   *Scar:* `memory/CHANGELOG.md:447` shipped the words **"eslint clean, CI green"** on 2026-07-14, a day when
   ci.yml's entire history was 1 failure and a pile of cancellations and no `gh` command had ever been run in
   this repo. That was not a stale fact — it was manufactured at the moment of writing because a gate list
   wanted a fourth item. **Watch for that shape in yourself: the last element of a list you did not measure.**
```

Anchor: `**Open the file. Open the image.**`
</details>

### 5. [mechanize] MECHANIZE: measure.mjs — one authority for every number, wired into doc-currency so stale numbers fail the push
**Target:** `frontend/scripts/ci/measure.mjs`

**Why:** Seven separate audit findings across all three documents are one missing gate. Verified today: 264 non-test files / 29,496 LOC (doc says ~31 / ~14.4k); five files >=900 LOC (doc says Components is the last one); 2,114 tests / 329 files (doc says ~1660); 24 gated states of 31 captured (doc says 21, pre-push says 24, charter says 20); 15 e2e specs (charter says 11); @dimforge/rapier3d-compat 0.19.2 (doc says 'Rapier 2.2', which is the React wrapper). doc-currency.mjs already runs on pre-push and in the CI docs job, already resolves ROOT, and already lists .agent/AGENTS.md as canonical — this needs zero new wiring.

**Mechanical check:** Append to doc-currency.mjs before its report block:
import { measure, renderBlock, BLOCK_RE, MEASURED_DOCS } from './measure.mjs';
const fresh = renderBlock(measure());
for (const rel of MEASURED_DOCS) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const found = src.match(BLOCK_RE);
  if (!found) { errors.push(`${rel} has no MEASURED block — its numeric claims are unguarded.`); continue; }
  if (found[2].trim() !== fresh.trim()) errors.push(`STALE NUMBERS in ${rel} — run \`node frontend/scripts/ci/measure.mjs --write\`.`);
}
Also extend doc-currency's CODEPATH_RE to accept paths under specs/ and to resolve backticked `*-kz` skill names against ~/.claude/skills and ~/Code/Agentic-Brain/skills: that catches the kernel's `specs/crafty-coherence-pillars.md` (the real path is docs/superpowers/specs/…, verified absent at root) and AGENTS.md's `react-perf-audit-kz`, which exists nowhere on this machine. LOC is rounded to 500 so a one-line commit never reds the build.

<details><summary>Exact text to apply</summary>

```
#!/usr/bin/env node
/**
 * MEASURE — the single authority for every NUMBER that appears in a canonical doc.
 *
 * WHY: a hand-typed count in a re-read-every-iteration document is a claim with a half-life of days.
 * `.agent/AGENTS.md` says "~14.4k LOC / ~31 JS(X) files"; measured today it is 264 non-test files / 29,496
 * LOC. It was already wrong by 1.8x on the day it was committed. It says "Components ~1330 is the LAST single
 * large file (verified 2026-06-29)" — five files were >=900 LOC on that exact commit, and five are today.
 * doc-currency.mjs has been passing this whole time because nothing recomputes numbers. This does.
 *
 * The docs carry a machine-owned region:
 *   <!-- MEASURED:BEGIN --> ... <!-- MEASURED:END -->
 * `--write` splices the current measurement into every doc that has one. doc-currency fails the push when a
 * block's contents differ from a fresh measurement. Never hand-edit inside the markers.
 *
 * Markers are HTML comments, so they cost zero context tokens when CLAUDE.md is injected.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const APP = join(ROOT, 'frontend');

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const isJs = (p) => /\.(jsx?|mjs)$/.test(p);
const isTest = (p) => /\.(test|spec)\.jsx?$/.test(p);
const lines = (p) => readFileSync(p, 'utf8').split('\n').length;

export function measure() {
  const srcAll = walk(join(APP, 'src')).filter(isJs);
  const src = srcAll.filter((p) => !isTest(p));
  const srcLoc = src.reduce((n, p) => n + lines(p), 0);
  const big = src
    .map((p) => [p.slice(APP.length + 1), lines(p)])
    .filter(([, n]) => n >= 900)
    .sort((a, b) => b[1] - a[1]);
  const testFiles = walk(join(APP, 'tests')).filter(isJs);
  const gates = readdirSync(join(APP, 'tests/gates')).filter((f) => /\.test\.jsx?$/.test(f));
  const e2e = readdirSync(join(APP, 'tests/e2e')).filter((f) => /\.spec\.jsx?$/.test(f));
  const scripts = walk(join(APP, 'scripts')).filter(isJs);
  const diff = readFileSync(join(APP, 'tests/visual/diff.test.js'), 'utf8');
  const states = (diff.match(/STATES\s*=\s*\[([\s\S]*?)\]/)?.[1].match(/'[^']+'/g) || []).length;
  const threshold = diff.match(/THRESHOLD\s*=\s*([0-9.]+)/)?.[1] ?? 'unknown';
  const baselines = readdirSync(join(APP, 'tests/visual/baseline')).filter((f) => f.endsWith('.png')).length;
  const names = ['react', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/rapier', '@dimforge/rapier3d-compat', 'vite', 'zustand', 'miniplex', 'vitest', 'puppeteer', '@playwright/test', 'eslint', 'knip'];
  const versions = Object.fromEntries(
    names.map((n) => {
      const p = join(APP, 'node_modules', n, 'package.json');
      return [n, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : 'ABSENT'];
    })
  );
  return { src: src.length, srcLoc, srcAll: srcAll.length, testFiles: testFiles.length, gates: gates.length, e2e: e2e.length, scripts: scripts.length, big, states, threshold, baselines, versions };
}

export function renderBlock(m = measure()) {
  const round500 = (n) => (Math.round(n / 500) * 500).toLocaleString('en-US');
  return [
    `- **Size (MEASURED — never hand-edit inside these markers):** \`frontend/src\` = **${m.src} non-test files / ~${round500(m.srcLoc)} LOC** (${m.srcAll} files counting colocated tests). \`frontend/tests\` = ${m.testFiles} files, of which ${m.gates} static gates in \`tests/gates/\` and ${m.e2e} Playwright specs in \`tests/e2e/\`. \`frontend/scripts\` = ${m.scripts} files.`,
    `- **Files >=900 LOC (${m.big.length}, all of them):** ${m.big.map(([p, n]) => `\`${p}\` ${n}`).join(' · ')}.`,
    `- **Visual gate:** ${m.states} gated states at a ${m.threshold} pixelmatch threshold, out of ${m.baselines} captured baselines. The \`STATES\` array in \`frontend/tests/visual/diff.test.js\` is the only authority; a captured-but-ungated frame asserts nothing.`,
    `- **Installed versions (resolved from node_modules, not from package.json ranges):** ${Object.entries(m.versions).map(([n, v]) => `${n} ${v}`).join(' · ')}.`,
  ].join('\n');
}

export const BLOCK_RE = /(<!--\s*MEASURED:BEGIN[\s\S]*?-->)([\s\S]*?)(<!--\s*MEASURED:END\s*-->)/;
export const MEASURED_DOCS = ['.agent/AGENTS.md', 'memory/STATUS.md'];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const block = renderBlock();
  if (!process.argv.includes('--write')) {
    console.log(block);
  } else {
    for (const rel of MEASURED_DOCS) {
      const p = join(ROOT, rel);
      const s = readFileSync(p, 'utf8');
      if (!BLOCK_RE.test(s)) {
        console.error(`measure: no MEASURED block in ${rel}`);
        process.exitCode = 1;
        continue;
      }
      writeFileSync(p, s.replace(BLOCK_RE, `$1\n${block}\n$3`));
      console.log(`measure: rewrote ${rel}`);
    }
  }
}
```

Anchor: `NEW FILE. Consumed by frontend/scripts/ci/doc-currency.mjs (already run by pre-push AND the CI `docs` job).`
</details>

### 6. [replace] Rule 5: the worker may not adjudicate its own dismissals, and a category is not done until every item carries a marker
**Target:** `LOOP-KERNEL-PROMPT.md`

**Why:** Rule 5's closing sentence ('The 215-finding queue is itself adversarially verified') is the clause that licensed self-dismissal of 29 of 32 vacuity findings — verified PROVENANCE was read as verified DISPOSITION. Verified: `grep -cE '\bDONE\b|✅|\[x\]' docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` → 0, in a 97KB file the kernel calls THE PRIMARY QUEUE, while the doc the kernel calls SECONDARY (STATUS.md §2) has carried a full ▢/▣/▣✓<sha> ledger the whole time. Numbering unchanged so 'THE FIVE RULES' header stays true.

**Mechanical check:** New frontend/scripts/ci/queue-ledger.mjs, run from pre-push: if the commit body matches /\b(close[sd]?|fix(es|ed)?|resolve[sd]?)\b[^\n]{0,40}\bfinding/i, the same commit must move at least one ▢→▣✓ or ▢→⊘ marker in a file under docs/superpowers/. Fail otherwise. Second check, cheap and high-value: fail if any `⊘ DISMISSED` line lacks a backticked command.

<details><summary>Exact text to apply</summary>

```
5. **THE WORKER MAY NOT JUDGE ITS OWN COMPLETION — NOR ITS OWN DISMISSALS, NOR ITS OWN PROGRESS.**
   **(a) COMPLETION.** For milestone-scale units an independent evaluator grades against pre-stated criteria.
   Independent means: it starts from ZERO context, reads ONLY the committed diff plus the written acceptance
   criteria — never `memory/`, never the plan doc's reasoning, never this session — and it is prompted to
   REFUTE, not to approve. A subagent spawned from this session shares your blind spots; say so when you use
   one, and treat its approval as weaker evidence than its objections. **A model may BLOCK. Only a command may
   PASS.**
   **(b) DISMISSALS.** *A queue whose findings were adversarially VERIFIED tells you nothing about whether
   their DISPOSITION was.* You may NOT close a finding as "false positive" / "already correct" / "non-issue"
   when you also hold authority to close it DONE. Dismissals go to a `⊘ DISMISSED — needs 2nd eye` list inside
   the queue doc, each with its one-line reason AND the command whose output proves it. **A dismissal is a
   claim; claims are RULE 2.** *Scar:* the loop's own pass flagged 32 gates vacuous, strengthened 3 and
   **dismissed 29 on its own authority**; an auditor later mutation-proved that **7 of the dismissed stay green
   when the code they guard is deleted.**
   **(c) PROGRESS.** A category is not done until every item in it carries its own marker IN THE QUEUE DOC,
   written in the SAME commit as the fix: `▣✓ <sha>` done · `▢` open · `⊘ DISMISSED — <reason> — <proof cmd>`.
   Never write "category X COMPLETE" until the marked count equals the finding count, and put both numbers in
   the commit body. *Scar:* the queue reached ~154-of-215 claimed-fixed with **zero** per-finding markers in
   97KB of markdown, so remaining work existed only as prose — which is how four whole categories (test-bug 13,
   config-drift 3, perf 2, a11y 1) reached 2026-07-27 with nothing started and nobody noticing.
```

Anchor: `5. **THE WORKER MAY NOT JUDGE ITS OWN COMPLETION.** For milestone-scale units an independent evaluator (a subagent,
   adversarial verify, or Kevin) grades against stated criteria. The 215-finding queue is itself adversarially verified.`
</details>

### 7. [replace] Replace 'Build / Test' with the FULL gate table — five of seven push-authorizing gates are currently invisible
**Target:** `AGENTS.md`

**Why:** The one file every agent auto-loads names two of the seven gates that decide whether a push into an auto-deploying repo is legal, and never mentions lint, knip, e2e, the hook, CI, or the deploy. Verified: `grep -cE 'knip|eslint|npm run lint|test:e2e|workflows|pre-push' .agent/AGENTS.md` → 0; `git config --get core.hooksPath` → .githooks; CI at HEAD f0b714e concluded failure. Gate counts deliberately omitted from this table — they live in the MEASURED block (edit 11).

**Mechanical check:** doc-currency.mjs already fails on dangling backticked paths in .agent/AGENTS.md, so every command and file named here is checked. Add one more: for each `npm run X` backticked in a canonical doc, assert X exists in frontend/package.json scripts — that would have caught the `react-perf-audit-kz` class and will catch any renamed script.

<details><summary>Exact text to apply</summary>

```
## Build / Test / Gates (from `frontend/`) — the FULL set

| Gate | Command | Where it runs |
|---|---|---|
| Crash-class lint (`no-undef`, `react/jsx-no-undef`, `no-unused-vars`) | `npm run lint` | pre-push + CI |
| Unit + static gates | `npm run test:unit` | pre-push + CI |
| Gate shape (comment-only assertions + source-grep ratchet) | `node scripts/ci/gate-shape.mjs` | pre-push + CI |
| Dead-code ratchet | `npm run knip` | CI. Config `frontend/.knip.json`. **Adding an `ignore` to turn it green is a reward-hack (LOOP-CHARTER §3).** |
| Build | `npm run build` | pre-push + CI |
| Bundle byte budget | `node scripts/ci/bundle-budget.mjs` | pre-push + CI — asserts shipped BYTES, not config |
| Doc-currency + numeric currency | `node scripts/ci/doc-currency.mjs` | pre-push (**even for docs-only pushes**) + CI |
| E2E | `npm run test:e2e` | CI only, sharded 3×; Playwright `webServer` on port 4179 `--strictPort` |
| Visual regression | `npm run test:visual` | **LOCAL ONLY, never CI** (load-sensitive software WebGL). puppeteer + pixelmatch; capture serves on 4178 |
| Re-baseline | `npm run visual:capture` then human review | local; per intended look change only |

- CI = `.github/workflows/ci.yml`. Local fast gate = `.githooks/pre-push` (`core.hooksPath=.githooks`), which
  checks out each PUSHED SHA into a detached worktree — it does not gate your working tree.
- **`git push` to `main` IS A PRODUCTION DEPLOY.** Vercel builds and ships every push to the live demo. No
  staging, no manual promote. A red push ships. *(863 of the loop's first 999 commits went out with no CI and
  no hook; that window holds 4 broken-main crashes in 26 hours, the longest live for 8h37m.)*
- **Never assert a gate is green without running it in THIS turn and pasting the number.** For CI the only
  source of truth is `gh run list --workflow=ci.yml --branch main --limit 3 --json conclusion,headSha`, and
  green is the literal string `success`. **`cancelled` is AMBIGUOUS** — a job that blows its own
  `timeout-minutes` and a run superseded by `cancel-in-progress` are indistinguishable. *(Empirical: this
  workflow concluded `success` ZERO times in its first 88 runs while the docs recorded "CI green".)*
- Visual determinism is load-bearing: gate anims on `isCaptureMode()`, seed RNG, freeze clocks.
```

Anchor: `## Build / Test (from `frontend/`)
- `npm run build` · `npm run test:unit` (vitest) · `npm run test:visual` (puppeteer+pixelmatch, 6% gate) · `npm run visual:capture` (regen frames).
- Visual gate is deterministic (forced `high` tier); re-baseline + human-review per intended look change. Capture-determinism is load-bearing (gate anims on `isCaptureMode()`; seed RNG; freeze clocks).`
</details>

### 8. [replace] Rewrite the file tail: STATUS.md-first read order, blocking post-compaction checklist, and STOP preserving gate RESULTS across compaction
**Target:** `AGENTS.md`

**Why:** Replaces the contiguous tail (Session Documentation → Project-Specific Workflows → Resume after compaction → Compaction instructions → Autonomous build loop) with one non-overlapping block. Two structural fixes: (a) the only auto-loaded doc never named memory/STATUS.md (`grep -c STATUS.md .agent/AGENTS.md` → 0) while STATUS.md declares itself canonical — a direct cause of its 65-commit drift; (b) per Anthropic's memory docs only the project-root CLAUDE.md is re-injected after /compact, so this section IS the entire post-compaction surface, and it currently instructs the compactor to carry gate RESULTS forward — the exact claim class that produced the fabricated 'CI green'.

**Mechanical check:** doc-currency.mjs check 3 already asserts memory/STATUS.md exists and carries its load-bearing sections; extend it to require an `as_of: <sha> <iso8601>` line in STATUS.md's header and to fail when that sha is more than 10 commits behind HEAD (`git rev-list --count <sha>..HEAD`). The as_of line is emitted by the session-close script, never typed.

<details><summary>Exact text to apply</summary>

```
## Where state lives (READ IN THIS ORDER)
1. **`memory/STATUS.md` — THE single source of truth** for where we are, the open-work REGISTRY, and what's
   next. If any other file disagrees about status, STATUS.md wins and the other file is stale — fix it the same
   tick. **It is NOT auto-loaded; you must Read it.** Its canonical claim is void when its own `as_of` stamp is
   older than HEAD by more than 10 commits: a stale canonical doc is worse than no canonical doc, because it
   actively overrules a correct one. *(It went 65 commits without an update while carrying a provably-false
   OPEN item for 14 days.)*
2. `memory/ACTIVE_PLAN.md` — the LIVE cursor: the ONE unit in flight. Update BEFORE execution.
3. `docs/superpowers/INDEX.md` — the map of every doc plus its status tag. Anything tagged **HISTORICAL** is a
   snapshot: cite it, never treat it as current.
4. `memory/CHANGELOG.md` history · `memory/ARCHITECTURE.md` blueprint · `memory/ROADMAP.md` future ·
   `SOTA-INITIATIVE.md` (repo root) direction · `docs/superpowers/KEVIN-REVIEW-BATCH.md` Kevin's decision queue.

## Project-Specific Workflows (`.agent/workflows/`)
- `debug-physics-Crafty-kz` — Rapier collision / terrain (player falling through, collider misalignment).
- `fix-movement-Crafty-kz` — WASD / camera / pointer-lock movement.

## Compaction instructions (the compactor reads this section — keep it)
Preserve verbatim: (1) the current milestone + its plan-doc path; (2) the exact resume pointer (next unit of
work); (3) uncommitted-work state (which files, which task); (4) Kevin's standing directives in force
(autonomous-build authority, TDD, gates, no-AI-footer); (5) if a loop is running:
`docs/superpowers/LOOP-CHARTER.md` (constitution) **and** `docs/superpowers/LOOP-KERNEL-PROMPT.md` (the durable
kernel copy, and the cold/git-only recovery source) must both be re-read at the next orientation.
**Do NOT preserve gate RESULTS.** A remembered "tests green / CI green / build clean" is the one claim class
this project has provably fabricated. Carry the COMMAND, never the number. Prefer dropping verbose tool output
and exploratory dead-ends over ANY of the above.

## Post-compaction re-orientation (BLOCKING — before the first edit)
1. `pwd`; `git -C /Users/kz/Code/Crafty rev-parse --short HEAD`; `git status -sb` — cwd resets on compaction.
2. **Check the wall clock of the newest commit before reading any doc.** If it is more than 6 hours old the
   loop was STOPPED, not running: every doc you are about to read may describe a world days old, and
   `docs/superpowers/LOOP-PROGRESS.html` will still be rendering a pulsing "Loop active" badge. *(The loop went
   dark for 6 days mid-campaign and not one surface recorded it.)*
3. Read `memory/STATUS.md` → `memory/ACTIVE_PLAN.md` → the active `docs/superpowers/plans/*.md`.
4. `gh run list --workflow=ci.yml --branch main --limit 3 --json conclusion,headSha` — is main actually green
   AT HEAD? `cancelled` is not a pass.
5. Re-run any gate whose result you are about to rely on.
Ground truth = git `main` plus a command you ran in THIS turn. Never a doc, never a memory, never this file's
numbers unless the MEASURED block's lint is passing.

## Autonomous build loop
If running under `/loop`: `docs/superpowers/LOOP-CHARTER.md` is the loop's constitution — read it EVERY
iteration at orient-time. It encodes Kevin's 2026-06-10 authority grant (enhance/delete/fix anything in the
master plan as judged best, especially visuals/graphics/gameplay/audio, to a SOTA-June-2026 bar, self-gated by
the charter's design discipline; Kevin reviews async via KEVIN-REVIEW-BATCH).
```

Anchor: `## Session Documentation (4-Piece, in `memory/`)`
</details>

### 9. [replace] Replace §0-A + §0-B + §0-C wholesale: kernel owns the read order, evaluator independence is defined, mandate narratives become a decisions table
**Target:** `LOOP-CHARTER.md`

**Why:** Replaces lines 11–148 (§0-A 1,479B + §0-B 3,274B + §0-C 10,425B ≈ 15.2KB → ~4.5KB) in a document the kernel orders re-read every iteration. Fixes three things at once: the read-order contradiction (charter says STATUS.md is #2 and canonical; the kernel says ACTIVE_PLAN #1, HOLISTIC-REVIEW #2 PRIMARY, STATUS #3 SECONDARY — and the charter names HOLISTIC-REVIEW exactly once in 426 lines), the undefined 'independent evaluator (a subagent)', and 10.4KB of dated narrative that §0-A itself orders the reader to ignore. Table rows verified against the live §0-C text.

**Mechanical check:** doc-currency.mjs: (1) assert the queue-doc path named in §0-A exists AND appears in LOOP-KERNEL-PROMPT.md — fails the moment the two docs disagree about the queue of record; (2) assert docs/archive/2026-Q2/loop-mandates.md exists (it is a dangling backticked path otherwise, which check 1 already catches).

<details><summary>Exact text to apply</summary>

```
> **Contract:** every rule in this file carries **[MECH: <checker>]** or **[SELF]**. [MECH] means a named
> script, hook or CI step goes red when it is broken. **[SELF] means the loop grades itself — treat it as a
> hypothesis, not a control.** No count, LOC figure or file tally appears in prose except as a dated PAST-tense
> scar. If this file and `LOOP-KERNEL-PROMPT.md` disagree, the **KERNEL wins** and this file is a defect — fix
> it the same tick.

## 0-A. READ ORDER — one ladder, and the kernel owns it

> **The read order lives in `docs/superpowers/LOOP-KERNEL-PROMPT.md` (the ORIENT block) and NOWHERE ELSE.**
> That file arrives in context verbatim every firing; a second ordered list here can only disagree with it, and
> when they disagreed the loop silently resolved it in favour of whichever text was closer to hand. As of
> 2026-07-27 the kernel reads: CI conclusion (step 0) → `git main` → `memory/ACTIVE_PLAN.md` (the cursor) →
> the queue-of-record named in the kernel's ORIENT block → `memory/STATUS.md` (the secondary registry) → this
> charter → `docs/superpowers/INDEX.md` (only when you need a doc).
>
> **If the kernel's ORIENT block and this paragraph disagree, the KERNEL wins and this paragraph is a defect.**
> [MECH: doc-currency.mjs asserts the queue-doc path named here still exists and is still named in the kernel.]
>
> **Every historical mandate (06-10 · 06-17 · 06-20 · 06-28 · 06-29 · v7 · v8) is HISTORY.** Their binding
> decisions are the table in §0-C; their narratives are archived at `docs/archive/2026-Q2/loop-mandates.md`.
> Do not mine them for work.

## 0-B. THE SOTA HARNESS LAYER

Sources: Anthropic *Effective harnesses for long-running agents*; OpenAI *Harness engineering*;
arXiv **2606.26300** *The Verification Horizon*. Each maps to a rule this project has been burned by. The
mutation-proof rule that used to live here is now §3 with a checker; stating it twice was the substitute for
enforcing it once.

1. **The worker may not judge its own completion.** (2606.26300: a judge that is not the worker **plus
   trajectory-level behaviour monitoring** dropped hacked-solve 28.6%→0.6% *while raising* clean-solve
   40%→61%. This charter implemented the judge as prose and none of the monitoring.) ⇒ An evaluator counts as
   independent only if it (a) runs on a DIFFERENT model family or provider than the implementer where one is
   available, (b) starts from zero context and may read ONLY the committed diff plus the pre-stated acceptance
   criteria — never `memory/`, never the plan doc's reasoning, never the maker's session — and (c) is prompted
   to REFUTE, not to approve. **A model may BLOCK. Only a command may PASS.** [SELF] until a second provider is
   wired; say "same-family critic" explicitly whenever you use a subagent, and weight its approval accordingly.
2. **Sprint contract BEFORE code.** State what "done" looks like and *how it will be proven* before writing the
   implementation — the plan doc must name the GATE, not just the steps. [MECH: the plan doc must be ADDED
   before the milestone's first `src/` commit — `git log --diff-filter=A`.]
3. **Drive the product surface, not the implementation.** E2E firing real input outranks unit tests for "does
   it work"; unit tests sit too close to the code. [MECH: a `Probe:` trailer naming the script is required on
   any diff touching input/camera/render.]
4. **Context RESET > compaction for long work.** The durable artifacts (STATUS + ACTIVE_PLAN + CHANGELOG +
   git) ARE the handoff. Prefer a fresh session with a clean read over grinding a deeply-compacted one.
5. **Give the agent a MAP, not a manual** → `docs/superpowers/INDEX.md`. A **stale doc is a live trap** (a
   stale charter line regenerated a week-sized dead proposal on 2026-07-13). [MECH: doc-currency.mjs.]
6. **Reward-hacking watch.** The classic failure is *"delete the failing test to turn CI green."* The §3
   ratchet is absolute: never widen a timeout, loosen a threshold, or narrow a test's scope to pass. **Prose is
   not a defence at this horizon** — at hour-scale budgets an agent with filesystem and network access can
   probe weaknesses in any single check, which is why every rule below names a checker or is deleted.

## 0-C. DECISIONS OF RECORD + the hard frame

> **The dated mandate narratives are HISTORY, archived at `docs/archive/2026-Q2/loop-mandates.md`. Do not read
> them to find work. Only the table below binds.**

| # | Decision of record — do NOT relitigate | Set | Who can reverse |
|---|---|---|---|
| 1 | Ember Frontier → fixed far-edge Blight-Heart climax; real win-state + endless post-climax | 06-15 | KEVIN |
| 2 | Audience is BROAD (kids → adults). Marcus (8) is A user, never a depth floor | 06-04 | KEVIN |
| 3 | EN is the default; zh-CN is a lazy-loaded locale TOGGLE (full content translation still owed, #73) | — | KEVIN |
| 4 | Control scheme Option A · **F = cast spell**, **T = melee** | 06-28 | KEVIN |
| 5 | bloom `luminanceThreshold 0.65` is INTENDED — it supersedes the old ≥0.85 spec; do not "fix" it | 06-28 | loop may propose |
| 6 | `grantXP` full-heal on level-up is INTENDED | 06-28 | loop may propose |
| 7 | E2E = `@playwright/test` on the dev bridge, kept SEPARATE from the puppeteer visual gate | 06-28 | loop |
| 8 | The restrained-NEUTRAL grade lock is REVERSED — glowier/warmer is authorized | 06-17 | loop |
| 9 | Mob/boss art direction = full loop authority | 07-13 | loop |
| 10 | De-monolith = full loop authority (no longer Kevin-gated) | 06-29 | loop |
| 11 | CPU-ocean fork kept · affixes kept · world-design HYBRID | — | KEVIN |

**Still genuinely KEVIN** (park into `KEVIN-REVIEW-BATCH.md`, never block): the holistic playtest (his eye and
ear) · S4 multiplayer and monetization · real-device iPad/phone feel · audio mix and final colour taste ·
anything spending money, creating accounts, or publishing externally · **adding any NEW dependency** [MECH:
pre-push fails on a package.json dependency-key addition] · big reversals of the table above.

**Hard frame (never overridden by taste):** SOTA in every aspect; visual/aesthetic taste is the HIGHEST bar
(premium, distinctive — never generic-voxel, never AI-slop); the **web + iPad + mobile** envelope (clever >
brute-force GPU); commercial-grade ambition. Full vision: `SOTA-INITIATIVE.md` §1–§2 — **its §3 status block is
FROZEN and superseded.**

**The loop has no terminal state.** SOTA is a direction. It runs until Kevin stops it.
```

Anchor: `## 0-A. READ ORDER (this replaces the old accreted mandate-ladder)`
</details>

### 10. [replace] §3 rewrite: CI becomes the first gate, mutation-proof gets a required commit trailer, the test ratchet gets a checker
**Target:** `LOOP-CHARTER.md`

**Why:** §1 step 5 — the gate on every autonomous commit — has no CI rung, and CI appears operationally in this file exactly once, at line 412, as '- **CI badge** green (once CI exists — §V6)', still a future conditional 14 days after CI shipped. That is the structural reason 88 non-success runs went unseen. Meanwhile 'mutation-prove every gate' is stated three times across two files with zero checkers (`ls frontend/scripts/ci/` → bundle-budget.mjs, doc-currency.mjs; no stryker, no mutation script) — it went from 0 mentions in 1088 June commits to 31 of 54 post-rule commits, so prose moved it to 57% and the remaining 43% needs a machine. Every scar is rewritten in past tense with its fix, because two of the charter's present-tense examples are false at HEAD.

**Mechanical check:** Three named checkers, two of which this plan ships: gate-shape.mjs (edit 2), the Mutation-proof trailer check (~20 lines in pre-push: `git diff --name-only` for tests/gates/ ∩ commit body grep), and test-count-ratchet.mjs (~25 lines; baseline measured today = 2,114 tests / 329 files). The CI bullet is enforced by edit 4's doc-currency check 5.

<details><summary>Exact text to apply</summary>

```
- **⛔ GREEN CI AT THE PUSHED SHA — a command, never a badge. [MECH: gh]**
  `gh run list --workflow=ci.yml --branch main --limit 3 --json conclusion,headSha,createdAt`
  Green is the literal string `success`. **`cancelled` · `timed_out` · `skipped` · `neutral` · `stale` ·
  `action_required` · no-run-found are NOT green.** Never write a check, or a sentence, that tests for the
  ABSENCE of `failure` — a job that exceeds its own `timeout-minutes` reports `cancelled`, byte-identical to a
  run superseded by `cancel-in-progress`, and that one ambiguity hid **88 consecutive non-success runs across
  14 days** while the loop wrote "CI green" into `memory/CHANGELOG.md`. Run this at the START of the tick (it
  grades the PREVIOUS push) and again after pushing. A non-`success` run is a §2 broken-main item and outranks
  everything.
- **⛔ MUTATION-PROOF EVERY NEW OR EDITED GATE — AND LEAVE THE RECEIPT. [MECH: scripts/ci/gate-shape.mjs +
  the Mutation-proof trailer]**
  A gate that greps SOURCE TEXT is not a gate. Break the behaviour it claims to guard → watch it go RED →
  restore from a `cp` backup (**never `git checkout <file>`** — it nukes untracked work) → green. Then write
  the receipt into the commit body, one block per gate file touched:

      Mutation-proof: tests/gates/<file>.test.js :: <test name>
      Mutation: <the one edit you made to the guarded code>
      Result: RED (<n> failed) -> restored -> GREEN

  Pre-push fails any diff that ADDS or EDITS a file under `frontend/tests/gates/` whose commit body lacks a
  `Mutation-proof:` line naming that file. **The trailer is not proof — it is the hook that makes the ABSENCE
  of proof mechanically visible, which is the property prose could never have.** `gate-shape.mjs` does the part
  that IS proof: it fails any assertion satisfied only by a comment, and ratchets the source-grep-only gate
  population downward.
  *Scars (all PAST tense, cited as history, never as current state):*
  · `quest-rewards-gates` once asserted only that `store.addCoins(r.coins)` EXISTED in the source. The line
    existed and never RAN on a 2nd claim, so the gate sat green through a live bug that stole every 2nd quest
    reward and corrupted the save. It is now behavioural and mutation-proven — see its header comment.
  · `bundle-split-gates` is STILL source-grep-only: it greps `vite.config.js` for five regexes and measures no
    bytes at all. The byte check that binds is `scripts/ci/bundle-budget.mjs`.
  · **A whole-file substring gate is satisfied by a COMMENT naming the symbol.** That is the exact bug class,
    and it is live: `tests/gates/place-puff-gates.test.js` asserts `/place puff/i` against
    `src/world/Terrain.jsx`, where the only occurrence is a `//` comment.
  · Worker "sync" gates get extra suspicion: an injected divergence producing 21,655 of 200,000 behavioural
    mismatches left all four of their assertions green. **Eliminate the duplication first** — Vite bundles both
    `?worker` and `new Worker(new URL(...))` forms, and `src/world/terrain.worker.js` imports ten modules, so
    the "classic workers cannot import" premise that justifies the hand-maintained mirror is false. Ladder:
    (1) delete the duplication; (2) if impossible, GENERATE the copy and fail CI on
    `git status --porcelain --untracked-files=all` output; (3) if generation is impossible, write a
    DIFFERENTIAL test over the input domain; (4) a regex mirror gate is never sufficient on its own.
  **The loop may NOT adjudicate its own vacuity findings.** It dismissed 29 of 32; that disposition belongs to
  a critic or to Kevin (§0-B.1).
- **Test ratchet. [MECH: scripts/ci/test-count-ratchet.mjs]** Never delete, weaken, skip, or edit-to-pass an
  existing test or static gate. A genuinely-wrong test may be CHANGED only with written justification in the
  commit body. The unit count holds-or-grows, enforced mechanically: the checker parses
  `vitest run --reporter=json`, compares against a committed `frontend/.test-count.json`, and fails the push on
  any decrease the commit body does not justify with a `Test-count-drop: <n> — <reason>` line. A doc-only or
  workflow-launch tick holds the count FLAT and passes untouched — no self-declared exemption needed, because a
  flat count is not a drop. **Never restate the count in prose;** the JSON is the record.
- **Never weaken to pass.** No widening a timeout, loosening a threshold, narrowing a test's scope, or
  `.skip`-ing to get green. If a gate is genuinely wrong, change it deliberately with written justification in
  the commit body — never silently.
```

Anchor: `- **⛔ MUTATION-PROOF EVERY NEW GATE (added 2026-07-13 — the hardest lesson this project has learned).**`
</details>

### 11. [replace] Delete every hand-typed number and the de-monolith narrative from Tech Stack & Architecture; replace with the MEASURED block
**Target:** `AGENTS.md`

**Why:** Every number in this block is wrong and two were wrong at authoring. Measured today: 264 non-test files / 29,496 LOC (block says ~31 / ~14.4k — off 8.5x on files); five files >=900 LOC — Components 1312, useGameStore 1066, Terrain 957, terrain.worker 935, QuestSystem 924 (block says Components is the LAST one, 'verified'); 23 `from './game/` imports in Components.jsx (block says 32); 2,114 tests (block says ~1660); 24 gated visual states (block says 21). Anthropic's own /doctor guidance is to cut content derivable from the codebase and keep pitfalls and rationale — this edit does exactly that, and net-shrinks the largest and least reliable block in the only auto-loaded doc.

**Mechanical check:** measure.mjs --write populates the block; doc-currency.mjs fails the push when it drifts (edit 5). The prose that survives is non-derivable rationale, which no lint can check and which is precisely why it should be the only prose left.

<details><summary>Exact text to apply</summary>

```
## Tech Stack & Architecture

<!-- MEASURED:BEGIN — machine-owned. Regenerate with `node frontend/scripts/ci/measure.mjs --write`. doc-currency fails the push if this block is stale. Never hand-edit inside the markers. -->
<!-- MEASURED:END -->

- **Stack:** React + Three (R3F + Drei + @react-three/postprocessing), Vite, **@react-three/rapier wrapping
  @dimforge/rapier3d-compat** (WASM KCC — `world.createCharacterController`, `src/Components.jsx`), zustand,
  framer-motion, miniplex, TailwindCSS v3 (`.cjs` config), simplex-noise, lucide-react. JavaScript (JSX). npm
  (`package-lock.json`). Resolved versions are in the MEASURED block above — **"Rapier 2.2" is the React
  wrapper's version, not the engine's; Rapier itself is 0.x.**
- **Architecture:** de-monolithed through v6/v7 into `src/systems/` (ECS systems + PositionTracker),
  `src/render/` (scene drivers + VFX groups), `src/ui/panels/`, `src/game/` (pure logic). `miniplex` ECS is a
  **NARROW** slice — real and load-bearing for **mobs/loot/XP only**, not the whole architecture. Engine CORE
  is real — KEEP, don't rewrite (greedy mesher, DataArrayTexture, Rapier KCC, A* worker, audio occlusion,
  day/night, chunk-dispose). Touch/mobile is BUILT — iOS cold-start was Pointer-Lock-gated and is bridged via
  `enterPlay()` (`src/MenuSystem.jsx`); deterministic gate `scripts/visual/touch-probe.mjs`. Only real-device
  feel is Kevin-gated.
- **`src/Components.jsx` is the ONE ACCEPTED residual large file** — it is the `Player` `useFrame` imperative
  controller, it delegates pure logic to the `game/*` modules, and the remainder is the imperative loop plus
  input wiring that must not be split (Game-Loop-Isolation, decision-of-record 2026-06-29). **The other files
  in the >=900 list above have NO de-monolith decision recorded** — treat them as open work and check
  `memory/STATUS.md` §2 before acting. *(This file previously claimed Components was "the LAST single large
  file — verified 2026-06-29". Five files were >=900 LOC on that exact commit. The claim was false the day it
  was written, which is why the numbers are now machine-owned.)*
- Per-file de-monolith history lives in `memory/CHANGELOG.md`, not here. Two of the low-water marks this
  section used to quote had already regrown by +95 and +33 LOC.
```

Anchor: `## Tech Stack & Architecture`
</details>

### 12. [mechanize] MECHANIZE: split perf-siege out of the e2e job, then register the deterministic jobs as Vercel Deployment Checks
**Target:** `.github/workflows/ci.yml`

**Why:** This is the only control that reduces the blast radius of the loop's actual workflow. Verified: Vercel auto-deploys every push to main, and 863 of 999 loop-era commits shipped with no CI and no hook, a window containing 4 broken-main crashes in 26 hours with the longest live for 8h37m. Branch protection cannot help — required status checks are a MERGE gate and this repo is direct-to-main by design. Vercel Deployment Checks (GA 2025-10-09, docs updated 2026-07-02) holds production builds off the custom domains until named GitHub Actions checks pass, with zero change to the loop's push workflow. But registering the e2e job while perf-siege is KNOWN-RED (ci.yml:145-154, failing on every run since 2026-07-13) would deadlock production forever — hence the split first.

**Mechanical check:** Vercel Project Settings → Build and Deployment → Deployment Checks → Add Checks, registering `gates`, `docs`, and the three `e2e (playwright) N/3` shards. Force Promote becomes a Kevin-only action recorded in KEVIN-REVIEW-BATCH.md. Add the corresponding charter clause: 'This repo is direct-to-main by design; branch protection is NOT the enforcement layer. The two layers are the pre-push hook (local, pre-remote) and Vercel Deployment Checks (post-build, pre-release).'

<details><summary>Exact text to apply</summary>

```
# --- in .github/workflows/ci.yml -------------------------------------------------------------
# Split the KNOWN-RED perf probe out of the sharded e2e job so the three shards can go green and
# BE REGISTERABLE as Deployment Checks, without lowering any threshold (LOOP-CHARTER §3 forbids that).
#
# Vercel matches Deployment Checks by job `name:`. A rename silently un-gates production, so these four
# names are load-bearing and must not be edited without updating the Vercel project settings:
#   "gates"  ·  "docs"  ·  "e2e (playwright) 1/3"  ·  "e2e (playwright) 2/3"  ·  "e2e (playwright) 3/3"
# NOT registered (advisory only): "perf probe (advisory)".
#
# Also: `concurrency.group` is scoped by ref with cancel-in-progress, so a superseded run and a
# self-timed-out run both read as `cancelled`. Every read of CI state must therefore be SHA-pinned:
#   gh run list --workflow=ci.yml --branch main --commit $(git rev-parse HEAD) --json conclusion
# and green is the literal string "success". That ambiguity cost this repo 88 runs over 14 days.

  perf-probe:
    name: perf probe (advisory)
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npx playwright install --with-deps chromium
        working-directory: frontend
      - name: perf siege (KNOWN-RED since 2026-07-13 — deliberately not silenced, deliberately not gating)
        run: npx playwright test tests/e2e/perf-siege.spec.js
        working-directory: frontend
```

Anchor: `The `e2e` job's step list (ci.yml:145-154, where perf-siege.spec.js is documented as KNOWN-RED) and the Vercel project settings.`
</details>

### 13. [insert] New §8 RULE HYGIENE: every rule names its enforcer, no bare counts, and a rule may never be re-stated instead of enforced
**Target:** `LOOP-CHARTER.md`

**Why:** This is the meta-rule that stops re-accretion — without it the charter regrows to 41KB and the next audit finds the same split. It is itself gradeable by grep (every rule bullet must carry a tag), so unlike the rules it governs it is not self-attested. It also encodes the audit's single most transferable finding as an operating policy rather than a story.

**Mechanical check:** doc-currency.mjs: for LOOP-CHARTER.md §1–§6, assert every top-level `- **` bullet contains `[MECH:` or `[SELF]` — fail otherwise. Second check: assert no line in LOOP-CHARTER.md / LOOP-KERNEL-PROMPT.md / .agent/AGENTS.md matches /\b\d{1,3}[- ]state (visual )?gate\b/ with a number differing from the parsed STATES length, and that no `~\d+k? (LOC|tests|docs|files)` appears outside a MEASURED block or a line containing a date.

<details><summary>Exact text to apply</summary>

```
## 8. RULE HYGIENE — a rule names its enforcer or it is not a rule

Every rule in this file carries one tag:
- **[MECH: <checker>]** — a named script, hook, CI step or test goes RED when the rule is broken.
- **[SELF]** — the loop grades itself. **A [SELF] rule is a HYPOTHESIS about the loop's behaviour, not a
  control.** Write it as one.

**The empirical split, 999 commits (2026-06-10 → 07-27):** rules checkable from an artifact the loop was
ALREADY producing were obeyed ~100% — no AI footers, no `git add -A`, `.state/` untouched, no
`.skip`/`.only`/`.todo`, one justified eslint-disable, commit bodies matching their diffs. Rules requiring a
SEPARATE experiment whose only consumer was the loop's own prose were obeyed erratically or not at all —
mutation-proof, independent evaluation, CI-green, STATUS currency, the priority ladder, live-probe. **The
variable is not diligence. It is whether the check reads an artifact that already exists.** Design every new
rule to be gradeable off the diff, the commit message, or a one-line command.

**Adding a rule:** it enters as `[SELF] review: YYYY-MM-DD` (+30 days). At review, exactly one of three
outcomes is written into the rule:
1. **ENFORCE** — ship the checker, retag `[MECH: <path>]`. Default whenever a deterministic check exists.
2. **SCOPE** — narrow it to what the loop demonstrably honours, and retag.
3. **DELETE** — remove it.
**The fourth option — leave it [SELF] and restate it more emphatically — is FORBIDDEN.** That is what produced
a mutation-proof rule stated three times across two files with zero checkers and zero mentions across 1088
June commits.

**NO BARE COUNTS IN THIS FILE.** Doc counts, LOC, spec counts, test counts and frame counts rot within days:
every count this charter has ever carried was accurate the day it was written and wrong within two weeks
(142 docs → 140 · 11 e2e specs → 15 · Components ~1297 → 1312 · GameScene ~914 → 299 · visual gate N=20 → 24 ·
"~1660 tests" → 2,114). A count may appear ONLY as (a) a command that regenerates it, or (b) a dated
PAST-tense scar. Everything else is a pointer. The visual gate's N is the `STATES` array in
`frontend/tests/visual/diff.test.js` and nowhere else — this charter said 20, `.agent/AGENTS.md` said 21 and
`.githooks/pre-push` said 24, all on the same day.

**Legitimately [SELF], and the only things that are:** visual taste · "does it feel good" · audio mix · art
direction. These are exactly the rules the charter already routes to Kevin. Everything else gets a checker or
gets deleted.

**A detector is agent work.** Any checker added under this section gets the same red-first + mutation-proof
treatment as any other gate, and a per-session canary that proves it still fails on a known-bad input.
```

Anchor: `## 7. Compaction + crash resilience (why this survives anything)`
</details>

### 14. [delete] Delete §5 and §6 outright, and retire the 'once CI exists' line in §6.5
**Target:** `LOOP-CHARTER.md`

**Why:** §6 opens by declaring itself SUPERSEDED (2026-06-15) and then lists the superseded backlog in full — 1.9KB of work-source-shaped text inside a constitution whose §0-A says not to mine old plans for what's next. §5 exists to stop pre-loop-era docs confusing the loop; those docs are archived or INDEX-tagged, and its one live finding (capture mode was disabling cast shadows and landmark emissive crowns, so every pre-S3 baseline was the flattest version of the world) belongs beside §1's LIVE-PROBE clause, not in its own section. The §6.5 line is a live falsehood: CI shipped 2026-07-13 (58972b4) and STATUS.md:386 marks V6 done, yet the ritual still says 'once CI exists' — and 'CI badge green' is a rendering of evidence, not a read of it.

**Mechanical check:** NONE-POSSIBLE for the deletion itself — no lint can tell that a section is dead weight. The §6.5 replacement is enforced by edit 4's doc-currency check 5 (a CI status word outside a command-stamped block fails the push). Relocate §5's capture-mode finding into §1 step 5 as a parenthetical when applying: 'capture mode was DISABLING both cast shadows AND the landmark emissive crowns, so every visual baseline reviewed before S3 was the flattest, beacon-less version of the world. The diorama lied for weeks and every gate was green. Treat pre-S3 baselines as a floor, never as ground truth.'

<details><summary>Exact text to apply</summary>

```
   - **CI:** `gh run list --workflow=ci.yml --branch main --limit 5 --json conclusion,headSha` — every one of
     the five must read `"conclusion":"success"`. **`cancelled` is NOT green.** The badge is decoration; the
     JSON is the check. Paste the JSON into the session-close note — a badge nobody reads is what let 88
     non-success runs stand for 14 days.
```

Anchor: `Delete §5 ("## 5. Process deltas vs the pre-loop era", 1,310 bytes) and §6 ("## 6. SOTA-experience backlog", 1,877 bytes) in full. Separately replace the §6.5 step-3 line `- **CI badge** green (once CI exists — §V6).` with the new_text below.`
</details>

## Adversarial critic — standing rejections

The critic could not adjudicate per-edit (the harness failed to pass it the plan text), but it
pre-verified the mechanical surfaces and issued these standing rulings. **Honor them when applying:**

- **REJECT any text asserting CI is fixed or green.** At time of writing the workflow has concluded
  `success` zero times. Sharding converted invisible `cancelled` into visible `failure` — that is
  progress, not green. Asserting otherwise is a fresh instance of the exact defect being fixed.
- **REJECT enforcing STATUS.md freshness via `doc-currency.mjs` mtime.** Doubly dead: the staleness
  result goes to `warnings.push` (only `errors` trigger `process.exit(1)`), and it keys on
  `statSync().mtimeMs`, which git does not record — a fresh clone stamps mtime=now.
- **REJECT adding `memory/CHANGELOG.md` to doc-currency's CANONICAL list.** It fails instantly with 9
  dangling-path errors that are legitimate history; the only ways out are rewriting history or
  silencing the lint, both charter violations.
- **Any edit citing the pre-push hook as a backstop MUST state its two holes:** it validates the WORKING
  TREE rather than the pushed refs, and a push touching no `frontend/` path runs only `doc-currency.mjs`
  and exits 0 before lint, tests and build.
- **Prose restatement of the priority ladder is theatre.** The ladder already exists verbatim at
  `LOOP-KERNEL-PROMPT.md:51-52` and was violated anyway. Nothing changes without a per-finding record
  against which adherence is observable.
- **`scratchpad/findings.json` is already closed at HEAD** — an edit there is a no-op or a regression.
- **Latent:** `doc-currency.mjs:76`'s external-link guard is `/^(https?:|mailto:|#)/` — `file:` is absent,
  so a `file://` URL pointing at a real file is reported DANGLING.
