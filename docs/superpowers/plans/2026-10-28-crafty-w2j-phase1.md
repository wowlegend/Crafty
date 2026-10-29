# W2-J phase 1: the instruction surface a cold agent can trust (2026-10-28)

Lane W2-J of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md` (section 3, rows 29, 31, 38 and 57; section 5).
Branch `docs/w2j-instructions`, cut from main `2fef2f32`. Since DECISIONS 2026-10-28 "One CLAUDE.md", the reset plan's
`.agent/AGENTS.md` means the root `CLAUDE.md`.

**This phase:** (a) the cold-takeover eval; (b) `CLAUDE.md` at 12 KB or less; (c) `npm run orient`; (d)
`memory/ACTIVE_PLAN.md` as a cursor of 60 lines or fewer; (e) LOOP-CHARTER and LOOP-KERNEL-PROMPT retired (row 38),
with doc-currency's CANONICAL list and every live pointer edited in the same commit; (f) the root decluttered
(`SOTA-INITIATIVE.md`, `SOTA-KICKOFF-PROMPT.md`).
**Later phases, not this one:** the generated Command Record and the deletion of artifact-currency (rest of row 31),
the records tag (row 32), the gate roster (35), Stryker (36), cli-guard (37), Playwright (39).

## Goal frame

**Goal.** A cold agent that has only the repo orients correctly and fast, and keeps every standing directive.

**Metric (what the eval measures, narrowed after the PR #42 review).** The cold-takeover eval (below): a fresh
`claude -p --model sonnet` run from a throwaway copy of the repo, with no user-level instructions, MCP servers or
auto-memory, must (a) orient, by running `npm run orient` or reading the cursor, and (b) answer 14 questions without
inverting any rule, within 15 tool calls. Two questions are "where is X" (q1 layout; q6 open work, with the live count
`npm run orient` prints); twelve are directives. Of those, two live only in `.claude/rules/` files (q12 capture guards,
in `game-code.md`; q13 probe ports and denominators, in `gates-and-probes.md`) and two are rules the first rewrite
dropped and the review found (q11 recording non-routine decisions; q14 what to check before an edit and a commit).
**What it does not measure:** whether an agent then acts on a directive; any directive no question names; more than
one sample of a stochastic agent; understanding beyond words and their local polarity.

**Anti-attack (GF-L2).**
- A short CLAUDE.md that drops a load-bearing rule passes a speed metric while making agents worse. So twelve of the
  fourteen questions are directives, four of them on rules a rewrite could lose without noticing (two in rule files,
  two the first rewrite did lose), and the directive table below names a home, or a reason to drop, for every rule
  the retired docs held.
- Goodhart on the scorer: an answer that lists every keyword passes a keyword scorer, and the first scorer passed
  inverted answers on 9 of 10 questions (both reviews of PR #42). So every question carries forbidden patterns; each
  required and forbidden match is read for polarity scoped to the matched phrase (a negation just before it in the
  same clause, inside it, or a "... is not / is forbidden" just after it), never for the whole clause; and the
  scorer's test holds, for every question, an inverted answer that must fail and right answers in other words that
  must pass, including verbatim every inverted answer the reviews showed passing.
- Speed without orientation: the first after-runs answered from the auto-loaded file in two grep calls and never ran
  `npm run orient`. PASS now requires a successful orient run or a read of the cursor.
- Contamination: the answer key lives in the eval script, its test and this plan. The copy is git's own list of the
  tree (tracked, or untracked and not ignored), so it carries no `.git`, no nested `.claude/worktrees/` (each of which
  holds a copy of the key) and no ignored file; the key files are deleted from it before the agent starts; every
  absolute, `~` or `$HOME` path and `..` escape in a tool call is audited, and a successful read outside the copy
  voids the run.
- **PASS-but-wrong control (GF-L3).** The same eval on a copy with stale lines planted on four questions (q3 reviewers
  at effort max, q7 a git clone and local heavy suites, q11 decisions need no record, all in `CLAUDE.md`; q12 add
  capture guards that return early, in `.claude/rules/game-code.md`) must FAIL each planted question.
- **FAIL-but-right sample.** Right answers in other words pass; the scorer's test carries them.

**Strategy (GF-L4), derived from the metric.** Directives the eval asks about must be findable in one place each: in
the auto-loaded `CLAUDE.md`, or in the rule file that loads at the moment of use, which `CLAUDE.md` names; state that a
tool can compute (HEAD, GitHub's main, CI, PRs, worktrees, the cursor, registry counts) is printed by `npm run orient`
instead of written as prose; detail moves to the path-scoped rule file, and `CLAUDE.md` stays under 12,000 bytes,
enforced by doc-currency.

## The eval

`frontend/scripts/dev/cold-takeover-eval.mjs`; scoring, the copy list, the plant and the transcript parsing are pure and
tested in `frontend/tests/scripts/cold-takeover-eval.test.js`.

- **Copy.** The files `git ls-files --cached --others --exclude-standard` lists, each copied as an APFS clonefile (no
  data written), minus `.git`, `.claude/worktrees/`, `frontend/node_modules/` and the answer key;
  `frontend/node_modules` is a symlink to the checkout's. `--rev=<sha>` builds the copy from `git archive` instead.
  `--plant[=q3,q7,q11,q12]` writes the stale lines into the copy after it is built, never into the tree.
- **Run.** `claude -p --model sonnet --setting-sources project,local --strict-mcp-config --tools Read,Grep,Glob,Bash
  --permission-mode dontAsk --output-format stream-json --verbose --no-session-persistence`, with an allow-list of
  read-only Bash (`npm run orient`, `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `find`), cwd = the copy, and
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (read by Claude Code 2.1.312) so the run writes no memory. It still needs the
  real HOME for its login, so Claude Code's own per-project state is written under it.
- **Count.** Every `tool_use` block in the stream is a tool call; paths in their inputs are audited against the copy.
- **Score.** The agent ends with one JSON object `{ "q1": ..., "q14": ... }`. An answer passes when every required
  pattern matches where it is not negated (a pattern that is itself the rule's negative statement, such as "never
  max", counts anywhere) and no forbidden pattern matches where it is not negated.

| # | Asks | Required | Forbidden (where not negated) |
|---|---|---|---|
| 1 | where source and tests live, where npm runs | `frontend/src`, `frontend/tests`, npm from `frontend` | npm or the tests from the repo root |
| 2 | how a change lands on main | PR, `ci ok`, exact sha, branch protection, merge main in / ff | squash, cherry-pick, a direct commit or push to main, the merge button or a rebase merge |
| 3 | reviewer models and effort | xhigh, never max, Sonnet, Haiku | effort max as the setting |
| 4 | bright lines and commit rules | money, force-push, history rewrite, footer, amend (mentioned) | spending money, a force-push, a history rewrite, adding an AI footer, amending |
| 5 | what is locked | nothing is locked, items 14/16 | locked or frozen, change waiting on Kevin |
| 6 | where open work lives, how many open rows | `memory/registry.jsonl`, the live open count | STATUS as the home, the registry as retired |
| 7 | SSD-light rules | `cp -c`, node_modules symlinked, CI for heavy suites | a git clone, `npm ci`, heavy suites run locally |
| 8 | browser and test-process hygiene | kill what you launch, `kill-test-procs.sh`, cannot see / never "all clean" | an "all clean" claim, leaving it running, "close the tab" |
| 9 | Game-Loop Isolation | the frame loop, reactive state (mentioned), refs / `getState()` | reactive state bound to the loop |
| 10 | emoji | no emoji, `frontend/src`, `static-gates` | emoji allowed |
| 11 | recording a non-routine decision (restored rule) | DECISIONS, lived or e2e proof | no record needed, ask Kevin first |
| 12 | capture guards (`.claude/rules/game-code.md`) | no new guard, reset to a declared value | an early return, a new guard added |
| 13 | probe ports and denominators (`.claude/rules/gates-and-probes.md`) | `probePort` / `_serve.mjs`, the denominator | a chosen or literal port, PASS without a count |
| 14 | before an edit and a commit (rehomed rule) | read the target first, debug output or secrets, a build | `--no-verify` or `git add -A`, editing without reading |

## Task script

1. Commit this plan (goal frame first). Gate: pre-commit static gates.
2. Eval script + pure-part test. Mutation-check the scorer: a rule with its forbidden list emptied must let the control
   answer through (the test goes red). Commit.
3. **Before-run** on a copy of this branch at step 2 (main's `CLAUDE.md`). Record score and tool calls here. Commit.
4. `npm run orient` (`frontend/scripts/dev/orient.mjs`) + test for its pure parts (registry counts, cursor head, worktree
   and PR parsing, the CI verdict rule: only `success` is green). Never crashes without `gh`, `git` or a network.
5. Retire LOOP-CHARTER and LOOP-KERNEL-PROMPT: move what still earns its place into `CLAUDE.md`; delete both; edit
   doc-currency's CANONICAL, read-order's SURFACES and ORDER, doc-anchors' `charter` alias, their tests, the opsec
   ledger and every live pointer (scripts, tests, hooks, CI, canonical docs) in one commit. Dated records stay as written.
6. Rewrite `CLAUDE.md` to 12 KB or less; shorten what the generators print (gate-table descriptions, measure prose,
   the read order). Directive table below. Gates: doc-currency, the generators' tests.
7. Root declutter: `SOTA-INITIATIVE.md` moves to `docs/superpowers/`, `SOTA-KICKOFF-PROMPT.md` is deleted (git keeps it);
   live pointers updated in the same commit.
8. `memory/ACTIVE_PLAN.md` to a cursor of 60 lines or fewer. Every open item it held already has a registry row
   (`registry-harvest`: 28 extracted, 0 missing, at `2fef2f32`); the ACTIVE_PLAN floor is lowered only by the items
   that moved, and the count is printed in the commit body.
9. **After-run** and **control run**; record both here. Verify: lint, unit suite, doc-currency, registry-harvest,
   opsec-scan. Push, open the PR, wait for its CI on the exact head sha. No merge.

## Results

**Order changed:** `npm run orient` was built before the eval (step 4 before step 2), because the eval scores question 6
with orient's own registry count. The before-run copy is `git archive 2fef2f32`, so nothing this lane added is in it.

| Run | Tree | CLAUDE.md | Served | Tool calls | Score | Verdict |
|---|---|---:|---|---:|---:|---|
| before | main `2fef2f32` (`--rev`) | 37,820 B | claude-sonnet-5-5 | 6 | 9/10 | **FAIL** |
| after | this branch at `193a6f4d` | 11,976 B | claude-sonnet-5-5 | 2 | 10/10 | **PASS** |
| after, second sample | the same | 11,976 B | claude-sonnet-5-5 | 2 | 10/10 | **PASS** |
| control (`--plant`) | the same, reviewer line stale | 11,663 B | claude-sonnet-5-5 | 2 | 9/10 | **FAIL** (q3) |
| control, second sample | the same | 11,663 B | claude-sonnet-5-5 | 2 | 9/10 | **FAIL** (q3) |

- **Before.** Wrong: q2 (how a change reaches main). The answer had CI on the exact sha and `ci ok`, but no pull request,
  no branch protection and no merge-then-fast-forward: main's `CLAUDE.md` states the gates but not the landing route,
  which lived only in the ACTIVE_PLAN cursor. 0 reads outside the copy (one denied `cd` was flagged by the audit).
  Transcript: the session scratchpad, `w2j/eval/before/stream.jsonl` (not committed).
- **After.** All ten right, in two read-only Bash calls (both counted the registry by grep; neither ran
  `npm run orient`, which the read order names first, so orient's use is not yet shown by the eval). 0 reads outside the
  copy.
- **Control.** The planted line ("Reviewers and verifiers run on Opus 5.5 at effort max, the estate default") was
  repeated as the answer both times, so q3 failed on the forbidden pattern and the missing "never max". The other nine
  stayed right: the eval detects the one stale directive, not a general degradation.
- **Limits.** Two samples per arm of a stochastic agent; a keyword scorer (paraphrase and stale-answer cases are in its
  test); only `CLAUDE.md` is planted, so a stale line in a doc the agent did not open is not tested. The agent answered
  most questions from the auto-loaded `CLAUDE.md` without a tool call, so tool-call counts mostly measure q6 and q10.

## Where each standing directive lives now

| Directive | Before | Now |
|---|---|---|
| Item 14: nothing is off limits, full autonomy, ask Kevin nothing unless needed, one review page | CLAUDE.md header | CLAUDE.md, Standing principle |
| Item 16: nothing is locked; lock labels bind nothing; `doc-currency` refuses six phrasings | CLAUDE.md header | CLAUDE.md, Standing principle (enforcer: doc-currency `locks`) |
| Bright lines: no money; no force-push or history rewrite | charter, kernel, DECISIONS | CLAUDE.md, Bright lines |
| No AI footer; no `--amend`/`reset` (fix-ups are new commits); no `--no-verify` | CLAUDE.md, Commit Conventions; pre-push comment | CLAUDE.md, Bright lines |
| What stays Kevin's (real-device feel, audio by ear, sign-ins, S4, ultrareview, external sends but the public face) | charter §4, kernel | CLAUDE.md, Bright lines |
| Landing: PR, merge main in, CI once on the exact sha, ff main; branch protection on `ci ok` | ACTIVE_PLAN cursor only | CLAUDE.md, Landing |
| Models and effort: xhigh never max; Sonnet and Haiku liberally, explicit effort, never low | CLAUDE.md, Method | CLAUDE.md, Review and models |
| `/code-review xhigh` fresh per range + one pointed reviewer on seams; no self-review | DECISIONS 2026-10-27 | CLAUDE.md, Review and models |
| SSD-light lanes | CLAUDE.md, Method | CLAUDE.md, SSD-light lanes; `.claude/rules/gates-and-probes.md` |
| Browser and test-process hygiene | CLAUDE.md (long), charter §6.4 | CLAUDE.md (short) + `.claude/rules/gates-and-probes.md` (full) |
| Game-Loop Isolation | CLAUDE.md, Execution | CLAUDE.md, Invariants; `.claude/rules/game-code.md` (render JSX never reads loop-mutated fields) |
| No emoji in `frontend/src` | CLAUDE.md, Design Language | CLAUDE.md, Invariants (enforcer: `tests/gates/static-gates.test.js`) |
| Comments say why (item 15c) | CLAUDE.md, Execution | CLAUDE.md, Invariants |
| Mutation-prove a new gate; a source grep is not a gate | charter §3, kernel rule 1 | CLAUDE.md, Invariants (enforcers: mutation-proof-trailer, gate-shape) |
| Never weaken to pass; test changes justified in the commit body | charter §3, kernel rule 4 | CLAUDE.md, Invariants |
| A green gate is not a lived result; read the denominator | CLAUDE.md (long) | CLAUDE.md, Invariants + gates-and-probes.md |
| Remote claims observed in the same turn; CI green only on `success` | kernel step 0 | CLAUDE.md, Landing and Invariants; `npm run orient` |
| A queue cite is a hypothesis; a deferral is a registry row | kernel; charter §3 | CLAUDE.md, Invariants |
| AST-safe edits; stage by name; small commits; escalate a broken rule to a gate | CLAUDE.md, Execution; kernel | CLAUDE.md, Invariants |
| Lane briefs and task scripts of 300 lines or less (W1-H item 3) | CLAUDE.md:236 (superseded) | CLAUDE.md, Building and judging |
| Look changes on lookbook frames; reference first; pillars; audio first-class; drive the real app | charter §4, CLAUDE.md | CLAUDE.md, Building and judging; game-code.md |
| Capture guards reset, never return; no new guard | CLAUDE.md, Gates | game-code.md |
| Player loop frame order; engine-core bar; P4 constraints; frame cost; ECS slice | CLAUDE.md, Tech; charter; SOTA-INITIATIVE §2 | game-code.md |
| Design language (tokens, icons, i18n, credits); touch | CLAUDE.md | game-code.md |
| Session-close ritual at the watermark (Kevin, 2026-07-13) | charter §6.5, kernel | CLAUDE.md, Session close |
| Compaction: keep the command, never the result; re-orient | CLAUDE.md (long) | CLAUDE.md, Compaction |
| Subagents start blank: restate ROOT and APP | CLAUDE.md, Method | CLAUDE.md, Layout |
| Auto-memory ranks below the repo | CLAUDE.md | CLAUDE.md, Where state lives |
| Recorded decisions (F=cast/T=melee, bloom 0.65, audience broad, ...) | charter §0-C, kernel | DECISIONS (unchanged); CLAUDE.md says DECISIONS settles |
| Vision (SOTA in every aspect, taste the highest bar, broad audience, S4 legal lines) | SOTA-INITIATIVE §1 (root) | `docs/superpowers/SOTA-INITIATIVE.md` §1 |
| The archived-skills OPEN note (cleanup ratchet, dependency upgrades) | CLAUDE.md | registry QUEUE:Q42, OPEN_ITEMS:OI-97 (STALE-13 closed: Dependabot exists) |
| **Restored after the PR #42 review** (static finding 1): record every non-routine decision in DECISIONS (Kevin, 2026-10-27); a hard delete of a referenced file, a new dependency, an external send, a reversal; a large player-facing deletion with its lived or e2e proof; archive over delete for docs | DECISIONS 2026-10-27 [KEVIN]; charter §0-C and §4; kernel | CLAUDE.md, Standing principle; `game-code.md` (player-facing deletion); DECISIONS W2-J items 3 and 6 |
| Builders that share files run one after another | CLAUDE.md, Method ("sequential where files are shared") | CLAUDE.md, Layout |
| Whole code, never `// ... rest of code`; verify behaviour, not implementation | CLAUDE.md, Execution | CLAUDE.md, Invariants (Edits; A green gate is not a lived result) |
| Read the target lines before an edit; before a commit, the staged diff for debug output and secrets, and a build after a JSX or structure change | CLAUDE.md, Execution (Read-Before-Write); Core Agent Skills (`pre-commit-kz`); kernel (BUILD-FIRST) | CLAUDE.md, Invariants (Edits); `game-code.md` (the build). No auto-loaded estate surface carries them: 0 hits in `~/.claude/CLAUDE.md` and AB `rules-global/` (static finding 7) |
| Extend the gate first, see it red, then build | charter §3 | CLAUDE.md, Building and judging; `gates-and-probes.md` item 0 |
| Check the compositor (rAF count, about 3 s) before planning browser work | kernel | `gates-and-probes.md`, Where things go (no helper does it; said so) |
| Prefer a fresh session to a deeply compacted one | charter §0-B item 5 | CLAUDE.md, Compaction |
| Session close: STATUS and CHANGELOG, list orphan preview tabs | charter §6.5 steps 0 and 2 | CLAUDE.md, Session close |
| Session close: mark-truth, the native-memory snapshot, re-arm the loop | charter §6.5 steps 4 and 5 | Dropped: mark-truth and the memory snapshot are estate tools outside this repo, carried for the sessions that load it by the estate `CLAUDE.md` (its CR-L1 rule names mark-truth); a cold agent with only the repo has neither; the loop is retired |
| Audio is a first-class axis | charter §4 | `game-code.md`, Player lens |
| The gate table (every gate and where it runs) | CLAUDE.md, Gates (generated) | `gates-and-probes.md`, generated by `gate-table.mjs`; CLAUDE.md keeps the tiers in three lines |
| Dropped on purpose: the per-task skill list (brainstorming, session-archivist-kz) | CLAUDE.md | Nowhere in the repo: they name estate skills a cold agent with only the repo does not have, the harness lists the available skills every turn, and neither was a Kevin directive for Crafty |
