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

**Metric.** The cold-takeover eval (below): a fresh `claude -p --model sonnet` run from a throwaway copy of the repo,
with no user-level instructions, MCP servers or memory, answers 10 orientation questions. PASS = 10 of 10 correct
within 15 tool calls, scored by fixed rules in the script and by `npm run orient`'s own registry count.

**Anti-attack (GF-L2).**
- A short CLAUDE.md that drops a load-bearing rule passes a speed metric while making agents worse. So 9 of the 10
  questions are directives and bright lines (landing, reviewers, bright lines, locks, open work, SSD-light, browser
  hygiene, Game-Loop Isolation, no emoji), and only one is "where is X".
- Goodhart on the scorer: an answer that lists every keyword passes a keyword scorer. So each rule also carries
  forbidden patterns (an answer that says reviewers run at max, or that something is locked, or that open work lives in
  STATUS, fails), and the open-work answer must state the live open-row count, which the scorer computes from the copy
  with the same function `npm run orient` prints.
- Contamination: the answer key lives in the eval script and in this plan. The copy deletes both before the agent
  starts, has no `.git`, and the run audits every path the agent touched: a read outside the copy voids the run.
- **PASS-but-wrong control (GF-L3).** The same eval on a copy with one planted stale line in `CLAUDE.md` (reviewers at
  effort max, the pre-2026-10-27 wording) must FAIL. An eval that passes it measures speed, not truth.
- **FAIL-but-right sample.** An answer that is right in other words ("reviewers: xhigh, max is never used") must pass;
  the scorer's unit test carries such paraphrases, and the forbidden patterns are anchored so "never max" is not "max".

**Strategy (GF-L4), derived from the metric.** Directives the eval asks about must be findable in the auto-loaded
`CLAUDE.md` in one place each; state that a tool can compute (HEAD, CI, PRs, worktrees, the cursor, registry counts) is
printed by `npm run orient` instead of written as prose; long rationale moves to the path-scoped `.claude/rules/` file
that fires at the moment of use, or stays in the script header it explains; the eval runs before the rewrite (on main's
37,820-byte `CLAUDE.md`), after it, and on the planted control.

## The eval

`frontend/scripts/dev/cold-takeover-eval.mjs`; scoring and parsing are pure and tested in
`frontend/tests/scripts/cold-takeover-eval.test.js`.

- **Copy.** `cp -c -R` of the tree (APFS clonefile, no data written), `.git` left out, `frontend/node_modules` a symlink
  to the main checkout's; the eval script, its test and this plan deleted from the copy. `--plant` writes the stale
  line into the copy's `CLAUDE.md` after the copy, never into the tree.
- **Run.** `claude -p --model sonnet --setting-sources project,local --strict-mcp-config --tools Read,Grep,Glob,Bash
  --permission-mode dontAsk --output-format stream-json --verbose --no-session-persistence`, with an allow-list of
  read-only Bash (`npm run orient`, `ls`, `cat`, `head`, `wc`, `grep`, `find`) and cwd = the copy. The project
  `CLAUDE.md` loads as it would for any session; nothing from `~/.claude` does.
- **Count.** Every `tool_use` block in the stream is a tool call; paths in their inputs are audited against the copy.
- **Score.** The agent ends with one JSON object `{ "q1": ..., "q10": ... }`. Each answer passes when it matches every
  required pattern and no forbidden one.

| # | Asks | Required (all) | Forbidden |
|---|---|---|---|
| 1 | where source and tests live, where npm runs | `frontend/src`, `frontend/tests`, npm from `frontend` | |
| 2 | how a change lands on main | PR, `ci ok`, exact sha, branch protection, merge main in / ff | squash, cherry-pick as the way |
| 3 | reviewer models and effort | xhigh, never max, Sonnet, Haiku | effort max as the setting |
| 4 | bright lines and commit rules | no money, no force-push or history rewrite, no AI footer, no amend | |
| 5 | what is locked | nothing, items 14/16 | a named lock |
| 6 | where open work lives, how many open rows | `memory/registry.jsonl`, the live open count | STATUS as the home |
| 7 | SSD-light rules | `cp -c`, node_modules symlinked, no clone + `npm ci`, CI for heavy suites | |
| 8 | browser and test-process hygiene | kill what you launch, `kill-test-procs.sh`, never claim "all clean" | |
| 9 | Game-Loop Isolation | `useFrame`/Rapier, no reactive state, refs/`getState()` | |
| 10 | emoji | none in `frontend/src`, the gate that enforces it | |

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

(filled in by steps 3 and 9)
