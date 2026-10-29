# Crafty: agent instructions

The one instruction file, loaded every session and after every compaction. One home per fact: a number here is
generated or absent, and history lives in git and `docs/superpowers/DECISIONS.md`.

## Standing principle (Kevin, DECISIONS 2026-10-28 items 14 and 16)

Crafty was built by far weaker models. **Nothing is locked:** the game, architecture, design and every element may be
changed or deleted as the command session judges best, with full autonomy. Ask Kevin nothing unless absolutely
needed; install any tool that helps. A decision stands while it earns its place; reverse it with a new dated DECISIONS
entry naming the one it supersedes. A lock label in a dated plan binds nothing. Kevin reviews one page, the Command
Record (`docs/superpowers/command-record.html`), refreshed at every landing. Keep the public face and the docs SOTA.

## Bright lines, and what stays Kevin's

- Spend no money (no usage credits, no paid service). Never force-push or rewrite pushed history.
- Commits carry no AI footer ("Generated with", "Co-Authored-By"). Never `--amend` or `reset`: a fix-up is a new
  commit. Never `--no-verify`.
- Only Kevin: real-device feel, the audio mix by ear, account sign-ins, S4 (multiplayer, money), `/code-review ultra`.
  An external send needs his OK, except publishing this repo's own public face (item 15).

## Layout: two levels

ROOT is the repo root: `docs/superpowers/` (plans, specs, DECISIONS, INDEX), `memory/` (ACTIVE_PLAN, STATUS,
registry, CHANGELOG, ARCHITECTURE, ROADMAP), `ci/`, `.githooks/`. APP is `frontend/`: source in `frontend/src/`,
tests in `frontend/tests/` plus colocated `frontend/src/**/*.test.js`, scripts in `frontend/scripts/`. **Run npm and
tests from `frontend/`.** The cwd drifts and resets after a compaction: never call a file missing from a relative
`ls`. A subagent starts blank: restate ROOT and APP in every brief. Stack: React 19, three 0.172 (R3F 9, drei 10),
Vite 6, Rapier 2.2, zustand 5, framer-motion 12, Tailwind 3, miniplex; JavaScript, npm.

<!-- BEGIN MEASURED (regenerate: node frontend/scripts/ci/measure.mjs --write) -->
- **Size (measured):** **371 source files / 43,202 LOC** in `frontend/src`, plus 144 colocated tests.
- **Files ≥ 900 LOC (4):** `src/Components.jsx` 1540 · `src/store/useGameStore.jsx` 1273 · `src/App.jsx` 1053 · `src/QuestSystem.jsx` 1002. `doc-currency` checks the list exactly and the
  numbers within ±10%; regenerate before trusting one: `node frontend/scripts/ci/measure.mjs --write`.
<!-- END MEASURED -->

From `frontend/`: `npm run orient` · `npm run lint` · `npm run test:unit` · `npm run build` · `npm run test:e2e`
(Playwright, sharded in CI) · `node scripts/visual/lookbook.mjs` (eye-level frames, real GPU: the look acceptance
surface) · `bash ../ci/pipeline.sh --tier=certify` (CI's offline steps).

## Landing: how a change reaches main

Main deploys to the live site (Vercel) on every push and is branch-protected: required check `ci ok` (strict, admins
included), no force push or deletion. Every lane is a branch and a PR. Merge main into the branch (a merge commit,
never a squash) and push: the PR's CI runs once, on that exact sha. When `ci ok` is green there and main has not moved,
fast-forward main to it (`git merge --ff-only`) and push; GitHub marks the PR merged. If main moved, merge it in again
and re-run. A change with no PR uses a `land/<date>` branch the same way. Green means a completed run concluded
`success`; `cancelled` and `timed_out` are not green.

## Review and models (Kevin, 2026-10-27)

- **Models and effort.** Reviewers and verifiers run on Opus 5.5 at effort **xhigh, never max** unless Kevin asks
  ("only up to xhigh reviewers"), as Workflow stages (`agentType` `adversarial-reviewer-kz` or `repro-verifier-kz`,
  `model: 'claude-opus-5-5'`, `effort: 'xhigh'`; the Agent tool cannot set effort and those types pin max). Use Sonnet
  5.5 and Haiku 5.5 liberally, through Workflow `agent()` with the full model id and an explicit effort, never low.
- Per change range: a fresh `claude -p "/code-review xhigh <range>"`, never forked from the author, plus one pointed
  adversarial reviewer where a change crosses a runtime seam (render loop, physics, input timing). No agent reviews
  its own work: a model may block, only a command passes.

## SSD-light lanes (Kevin, 2026-10-28)

A reviewer's or verifier's throwaway copy is `cp -c -R` of the lane worktree with `frontend/node_modules` symlinked,
never `git clone` + `npm ci`. No local e2e or lookbook run unless a look question needs a real GPU, then one at a time;
CI runs the heavy suites.

## Browser and test-process hygiene (Kevin, 2026-07-13)

Anything you launch, you kill: close the browser in a `finally`, kill the vite process group, then
`sh frontend/scripts/dev/kill-test-procs.sh`. A run that binds a port can leave a tab in Kevin's browser that you cannot
see: say "a local run bound port N; I cannot see whether a tab was left", never "all clean". `cmux close-surface` is
denied. Measure load (`uptime`) before blaming a gate. Detail: `.claude/rules/gates-and-probes.md`.

## Invariants, each with its enforcer

- **Game-Loop Isolation:** never bind React reactive state (`useState`, zustand subscriptions) to `useFrame` or
  Rapier; read through refs, `.getState()` or miniplex queries. Enforcer: review.
- **No emoji in `frontend/src/`** (write `\u{}` escapes): `frontend/tests/gates/static-gates.test.js`.
- **Comments say why**, only when the code cannot (a constraint, an external fact with its version, an ordering
  invariant); no history or mutation receipts in code (item 15). Enforcer: review.
- **A new gate, or a changed assertion, is mutation-proven:** break the behaviour, see it go red, restore from a `cp`
  backup, state it in a `Mutation-Proof:` trailer (`mutation-proof-trailer`). A source grep is not a gate (`gate-shape`).
- **Never weaken to pass:** no skip, widened timeout or loosened threshold; change a wrong test with the reason in the
  commit body. Enforcer: review.
- **A green gate is not a lived result:** prove the entry point runs in the game (real-input e2e, a live probe), and
  read a gate's denominator, not its tick.
- **Claims about CI, the deploy or any remote are observed in the same turn** (`npm run orient`). A registry row's
  `file:line` is a hypothesis until resolved against HEAD. A deferral is a registry row, never a TODO.
- **Edits:** AST-safe on `.js/.jsx` (Edit, never `sed`); stage files by name; commit in small verified units. A rule
  that keeps being broken gets a gate, hook or deny rule, not more prose.
- Game code (looks, capture guards, the Player loop, the engine core, P4, the design language):
  `.claude/rules/game-code.md`, loaded when you touch `frontend/src/`.

## Building and judging

An unstarted lane carries a brief of one page or less linked to its reset-plan row; at lane start it writes a task
script of 300 lines or less with red-first steps and its gates (DECISIONS 2026-10-28 W1-H item 3). Pick a visual
reference before building a look; accept a look change on lookbook frames, before and after attached to the commit or
PR. The coherence pillars (`docs/superpowers/specs/crafty-coherence-pillars.md`) bound every addition; audio is a
first-class axis; drive the real app before calling a feature done.

## Gates

<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->
**16 gates; 6 run on a commit, 5 on a push, 12 in CI.** Generated by `gate-table.mjs` from `ci/pipeline.sh`
and `.githooks/pre-push`; edit it, never the table. A bare name runs as `node scripts/ci/<name>.mjs` from `frontend/`.
A push runs no unit suite, build or bundle: CI runs them on the exact sha (DECISIONS 2026-10-28 items 23, 24).

| Gate | commit | push | CI | Stops |
|---|:--:|:--:|:--:|---|
| mutation-proof-trailer: `node scripts/ci/mutation-proof-trailer.mjs <range>` | — | ✅ | — | a commit that adds a gate or changes its assertions with no `Mutation-Proof:` trailer |
| opsec-scan: `node scripts/ci/opsec-scan.mjs --all` | ✅ | ✅ | ✅ | a home path, credential shape or agent attribution reaching this public repo |
| doc-currency | ✅ | — | ✅ | a dangling path or § citation in a canonical doc, a stale generated block, a lock label |
| eslint: `npm run lint` | ✅ | — | ✅ | crash-class bugs and dead code (`no-unused-vars` and `no-undef` are errors) |
| gate-shape | ✅ | — | ✅ | an assertion a comment could satisfy; the source-grep gate count may only fall |
| cli-guard | ✅ | — | ✅ | a script that runs its CLI when imported |
| vitest related: `node scripts/ci/related-tests.mjs --staged-list "$STAGED_LIST"` | ✅ | — | — | a staged change that breaks a unit test statically importing it |
| unit + static gates: `npm run test:unit` | — | — | ✅ | the whole vitest suite: `tests/**` and colocated `src/**/*.test.js` |
| build: `npm run build` | — | — | ✅ | broken JSX or imports |
| bundle byte budget: `node scripts/ci/bundle-budget.mjs` | — | — | ✅ | a chunk past its byte ceiling |
| queue-ledger | — | ✅ | — | a queue finding with no `▣✓/▢/⊘` marker, or a dismissal with no proof command |
| artifact-currency | — | ✅ | — | an unusable operator-page source, a falsified Queued pill, a wrong as-of stamp |
| registry-append-only | — | ✅ | ✅ | a `memory/registry.jsonl` row deleted instead of closed |
| knip: `npm run knip` | — | — | ✅ | an unused file, export or dependency |
| npm audit: `npm audit --audit-level=high` | — | — | ✅ | a HIGH or CRITICAL advisory (CI only: it needs the registry) |
| prod-smoke | — | — | ✅ | the production build failing to boot, render or keep a GL context |
<!-- END GATES -->

Outside the pipeline: e2e (CI only; `ci ok` needs every shard on the exact sha), `ci ok` (fails unless every job
passed; a cancelled run reads red), the lookbook (a person reads it).

## Where state lives

<!-- BEGIN READ-ORDER (regenerate: node frontend/scripts/ci/read-order.mjs --write) -->
**Read in this order** (generated by `frontend/scripts/ci/read-order.mjs`; edit it there):

1. `cd frontend && npm run orient` — HEAD, CI on main and on HEAD, the live Production sha, open PRs, unmerged worktrees, the cursor, registry counts. A main that is not green outranks every queue item.
2. `memory/ACTIVE_PLAN.md` — the cursor: the live task table and the next step.
3. `memory/registry.jsonl` — the one home for open work. Add a row for anything new; close a row with `closedBy`, never delete one.
4. `docs/superpowers/DECISIONS.md` — the decision record. A reversal is a new dated entry naming the one it supersedes.
5. `memory/STATUS.md` — where the project stands; its §2 and G-ledger are the record the registry was harvested from.
6. `docs/superpowers/INDEX.md` — the doc map: what to read, and which docs are history.
<!-- END READ-ORDER -->

`KEVIN-REVIEW-BATCH.md` is an inbox; DECISIONS settles. Claude Code's auto-memory is machine-local and ungated: rank it
below these files. A `.claude/rules/*.md` file loads only when you touch a path its `paths:` matches.

## Session close (Kevin, 2026-07-13)

"Get Crafty's remote github surfaces updated too near the end of every session when you hit the context-watermark."
At the watermark, unprompted: kill leaked test processes; green the tree or revert the unfinished unit; update the
cursor, the registry and the Command Record (stamp, republish in place, sync: `frontend/scripts/ci/artifact-currency.mjs`);
check the README prose is still true; refresh the About line, topics and labels with
`node frontend/scripts/ci/public-face.mjs --live`, then `--apply`; land through a PR.

## Compaction

Preserve the current lane and its plan path, the resume pointer, uncommitted files and these directives. Keep a gate's
command, never its result. After a compaction, run `npm run orient` and `git status -sb` before the first edit.
