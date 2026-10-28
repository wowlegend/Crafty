# Crafty Harness SOTA Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** ACTIVE. The build contract for `memory/ACTIVE_PLAN.md` row T16 (Kevin 2026-10-27: CLAUDE.md, `.claude/rules`,
hooks, settings, docs and skills are free to revise). The lane starts after T3 (main pushed, CI `success`).

**Goal:** turn every "never do X" in Crafty's agent harness into a permission rule, a hook or a gate. Cut the
always-loaded instructions from 34.5 KB to about 12 KB, and make the docs say where the work stands. No byte of the shipped game changes.

**Architecture:** five tranches, each independently shippable and each ending green on the repo's own pipeline:
A hygiene, B the deterministic layer, C the instruction files, D the doc corpus, E the closeout. Every unit is
one commit that is red first and carries a named mutant. Units that edit files the live command session owns are
handed to that session by message, not edited from the lane.

**Tech Stack:** POSIX sh and bash 3.2 (hooks, `ci/`), Node 24 ESM (`frontend/scripts/ci/*.mjs`), vitest 4
(`frontend/tests/scripts/*.test.js`), ESLint flat config, Claude Code 2.1.311 settings and hooks.

**Spec:** `docs/superpowers/masterpiece-2026-10/harness-plan-2026-10-27.json` (35 changes, its `target_shape` and
`not_doing`) as amended by `docs/superpowers/masterpiece-2026-10/harness-refute-2026-10-27.md` (13 KEEP / 22 AMEND,
findings F1-F17, M1-M6, repros R1-R3). Where they differ, this plan applies the refute, except where the
2026-10-27 adversarial review of this plan found the refute wrong (see "Review amendments" at the end). The umbrella plan
`docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` sets the programme rules this pass serves.

Paths below are relative to ROOT = `git rev-parse --show-toplevel` (the main checkout, or a lane). APP = ROOT/`frontend`.
This file deliberately contains no operator home path: the repo is PUBLIC and `opsec-scan` refuses one.

---

## Goal

The player never sees the harness, but every change in the masterpiece programme reaches them through it. Today the
always-loaded instruction file is 34.5 KB with false claims in it. A commit runs the whole suite and build (69 s by its
own docblock), which pushes agents toward `--no-verify`. Nothing denies `git push --no-verify`, yet every push to `main`
deploys to the live site. The post-compaction reminder has never reached the model. Five hooks crash in every lane
because they call an untracked helper. And on 2026-10-27 a fixture suite run from a hook rewrote the real repository.
After this pass, a push from a session rooted at ROOT or a lane is either certified by pre-push or reported by
push-audit at the next session start. A boundary no agent can bypass waits on Vercel Deployment Checks, which only
Kevin can switch on; until then a determined bypass (`commit --no-verify`, an unlisted spelling, a session rooted
elsewhere) is caught after the fact rather than prevented. An agent orients on about 12 KB of facts it could not
derive, and each rule it must not break names its enforcer (a permission, a hook or a gate) or says "no gate".
The Phase 1-3 looks and feel work (the light and colour script, combat, the coast) therefore lands sooner and with
fewer regressions on the live site. The pass changes no file under `frontend/src`, so it adds no GPU cost, no
main-chunk byte, no player string and no input verb.

## Global Constraints

- **Zero `frontend/src` changes in the whole plan.** Each unit's commit is checked with `git diff --stat HEAD~1 -- frontend/src`
  (empty), and the last gate checks the branch with `git diff --stat main...HEAD -- frontend/src` (empty). This is what makes the
  GPU cost 0, the main-chunk bytes 0 (`frontend/scripts/ci/bundle-budget.mjs` output unchanged), i18n and touch
  not applicable, and (until W2-C deleted it) the `e2e-freshness` receipt, keyed on `src/` and `tests/e2e/`, unexpired by these commits.
- **Bright lines (DECISIONS.md:83-95):** spend no money; never force-push or rewrite pushed history; never use
  `--amend` or `reset` for a fix-up (fix-ups are new commits).
- **Trailers:** every commit that adds or rewrites assertions under `frontend/tests/gates/` or adds/edits
  `frontend/scripts/ci/*.mjs` carries a `Mutation-Proof:` trailer (`mutation-proof-trailer.mjs:40`). Every NEW check
  file (`frontend/tests/**/*.test.js`, `frontend/scripts/ci/*.mjs`) also carries an in-file `Mutation-Proof:` line
  (`killability-ledger.mjs:20-29`, refute M3). A visual-baseline change is never part of this plan.
- **Edits:** `.js/.mjs/.jsx` and JSON only through the Edit tool; `sed` only on markdown. Mutants are restored from a
  `cp` backup (`frontend/scripts/dev/mutate.sh` does this), never `git checkout <file>`.
- **Commit messages:** written to a fresh scratch file per commit and passed with `git commit -F`; no attribution footer.
- **Load:** load averages measured 33-42 while this plan was written (`uptime`, 05:52). No e2e, dev server, capture
  or lookbook run belongs to this plan. A subagent's Bash call never runs past 240 s; longer runs use `run_in_background`.
  Anything launched is killed (`sh frontend/scripts/dev/kill-test-procs.sh`).
- **Archive moves:** `git mv` only. Ledger debt moves with `opsec-scan --rekey` (U20), never `--write`.
- **Ownership:** the command session (agent `main`, session c54fc9b6) owns `memory/ACTIVE_PLAN.md`, `memory/STATUS.md`,
  `docs/superpowers/DECISIONS.md`, `docs/superpowers/sota-2026-09/OVERNIGHT.md` and the umbrella plan. Units that edit them say so,
  and are sent to `main` with SendMessage before and after the edit. ACTIVE_PLAN keeps ONE row (T16) for this pass (refute M5).
- **Models (AGENTS.md:213-217, verbatim directive):** *"only up to xhigh reviewers (if any needed) for Crafty works."*
  The quote sets the effort CEILING. The default reviewer at that ceiling is a decision of record
  (DECISIONS.md 2026-10-27, :130-131): a FRESH-process `/code-review xhigh` per change range, plus one pointed
  adversarial reviewer at xhigh where a change crosses a runtime seam. Both bind this plan (umbrella plan rule 5).
  Pointed reviewers run as Workflow stages: `agentType: 'adversarial-reviewer-kz'`, `model: 'claude-opus-5-5'`, `effort: 'xhigh'`.
  Mechanical lanes, meaning any lane whose output a deterministic check accepts (archive moves checked by
  doc-currency, the CHANGELOG back-fill generated by a script from `git log`), run on `claude-sonnet-5-5` or
  `claude-haiku-5-5` with an explicit effort, never low.
- **Tranche review.** At the end of tranches A (after U8a), B (after U17), C (after U24, before the midpoint push) and
  D (after U36), run `claude -p "/code-review xhigh <tranche-base>..HEAD"` from the lane root as a FRESH background
  process, never forked from the authoring session. Save its output to scratch. Each finding is re-verified against the
  code before it is acted on; fixes are new commits. Record the four ranges and their finding counts in the U38 entry.

## Goal frame (GF-L1..L4)

- **Goal.** Turn the rules the model keeps breaking into machine checks, and make what it reads every session small
  and true. The command session confirmed this goal in DECISIONS 2026-10-27 under Kevin's grant.
- **Attack (what breaks when the goal is met perfectly).**
  - AGENTS shrinks by deleting facts the model cannot derive, and old mistakes recur.
  - A size cap lands while a live file is over it and blocks every commit in main.
  - A gate whose subject has no rows passes forever (the refute's F2 shape).
  - A guard that crashes blocks every Bash call.
  - The commit tier gets fast because it stops testing, and the bypass moves to the push, which deploys.
- **Metric, with sources of truth.**
  - (1) Bytes loaded every session: `wc -c .agent/AGENTS.md`, at most 12,000. Today 34,487.
  - (2) Bytes injected per touched rule file: at most 8,000 each. `gates-and-probes.md` is 18,571 today.
  - (3) Enforcer coverage: each Hard-rules bullet in AGENTS names its enforcer (U22 test), or says "no gate".
  - (4) Commit-tier wall time against a baseline taken at the same load (U17).
  - (5) `harness-integrity` denominators are non-zero, with 0 failures.
  - (6) Bytes of the generated read order's files, before and after (P0 and U38).
  - (7) Push wall time and the daily count of full-path pushes, before (P0's timed push, then U13's push log) and
    after (U17). Without this, a commit tier made fast by moving all the cost to the push looks like a pure gain.
  - A sample that passes but is wrong: an 11 KB AGENTS without the two-level layout rule. `agents-shape.test.js`
    catches it. A sample that fails but is right: a 16.5 KB AGENTS carrying a new generated block. The cap warns at
    12 KB and fails at 16 KB.
- **Strategy (derived from the metric).** Measure first (P0). Fix the defects that are live today (tranche A). Build
  the enforcers before the prose that names them (B before C). Land a cap only in a commit where its subject
  already sits under it (D3 lands as warn-only first).

## Current state (cited)

Verified by reading at main `f0e84766` on 2026-10-27, except where marked "refute-measured" or "lane-measured".

| # | Fact | Where |
|---|---|---|
| 1 | AGENTS is 324 lines / 34,487 B. Absolute ROOT appears at :14, :26 and :223. :245 says "no `dependabot.yml`", but `.github/dependabot.yml` is tracked. :226 says "Opus 5". :18 and :261-263 cite `.agent/workflows/`. | `.agent/AGENTS.md`; `wc`; `git ls-files` |
| 2 | `$schema` is the draft 2020-12 meta-schema (:2). The deny list holds only cmux close-surface (:4-7). Context is registered on `PostCompact` (:18-28). Five graft hooks call `.claude/helpers/graft-hooks.cjs` (:35, :45, :56, :67, :78), which git shows as untracked (`?? .claude/helpers/`), with timeouts 10000/8000/15000/8000/8000 (:36-:79). The field is in seconds (Context7, anthropics/claude-code hook-development: "Defaults are 60s for command hooks"). | `.claude/settings.json` |
| 3 | The compaction hook hard-codes a home path fallback (:17) and emits `hookEventName:"PostCompact"` from a `printf`'d JSON string (:28). Its docblock calls a pipe-test "part of this script's contract" (:14-16), yet no file under `frontend/tests`, `frontend/scripts`, `ci` or `.githooks` references the script. Context7 (`mods/types/claude-code.d.ts`, `ClassicResultFields`): SessionStart accepts `additionalContext`, and PostCompact has no entry. | `scripts/hooks/post-compact-rules.sh` |
| 4 | `.gitignore:2` is `node_modules/`, which does not match a lane's `frontend/node_modules` symlink. `.claude/worktrees/`, `.claude/helpers/`, `.claude/skills/`, `.mcp.json` and `.ignore` show `??`. `.claude/settings.local.json` is ignored only by a machine-global ignore file (refute A2). | `.gitignore`; `git status --porcelain --ignored .claude` |
| 5 | `.state/compaction-events.jsonl` is tracked and shown modified in the session snapshot. `write-receipt.sh` carves `.state` out (:19-22, :40), and its test pins the carve-out (`write-receipt.test.js:25,89-92`). | `git ls-files .state` |
| 6 | opsec-scan calls `existsSync` then `statSync` (:189-191). That follows a symlink and skips a directory target, so a committed link to a home path is never scanned. The ledger `_total` is 423 across 48 files. `.agent/AGENTS.md` holds 3; the four audit JSONs hold 65+2+147+30. | `frontend/scripts/ci/opsec-scan.mjs`; `.opsec-ledger.json` |
| 7 | The tiers are only `commit\|push\|fast` (:70-73). Core steps are unguarded (:115-127), so a commit runs unit, build and bundle. The receipt is written only by the commit tier (:179-184). `step()` runs `"$@"` with the inherited environment (:100). pre-push unsets three GIT_* variables (`pre-push:44`); pre-commit does not. The split is dated to Kevin's 2026-09-22 direction (:18-20, `pre-push:90`). | `ci/pipeline.sh` |
| 8 | commit-msg only `exec`s `commit-msg-gate.mjs` (:21). pre-commit runs the attribution guard as `GIT_HOOK_NAME=pre-commit` with no message argument (:53). | `.githooks/` |
| 9 | `CALLERS` has no `commit` key (:128-138), and `callersFor` falls back to `core` (:139). The test pins the key set (`gate-table.test.js:94`). A hand-typed `(offline core, 69s)` sits inside the generated header (:163). | `frontend/scripts/ci/gate-table.mjs` |
| 10 | QUEUES is HOLISTIC-REVIEW only (:41). Only `## Confirmed by kind` is counted (:53). A missing file is skipped (:91), and a queue with no ledger key can never fail (:119). Live: 215 findings, 0 unmarked. | `frontend/scripts/ci/queue-ledger.mjs` |
| 11 | The read order pins ORDER 8 and SURFACES 3; all 3 surfaces are current (run now). | `read-order.test.js:36-37` |
| 12 | The default PATTERN names `Crafty/frontend/node_modules/.bin/vite` only (:37), and the test always overrides it with `KTP_PATTERN` (`kill-test-procs.test.js:50`). Five lanes live under `.claude/worktrees/` (`git worktree list`). | `frontend/scripts/dev/kill-test-procs.sh` |
| 13 | mutate.sh needs `<expected-test-count>` (:4) and exits 3 without it (:39-41). | `frontend/scripts/dev/mutate.sh` |
| 14 | killability-ledger, run now: 95/529 check files receipted, holding at 434. The harness plan's "465/470" is stale. | live run |
| 15 | artifact-currency, run now: exit 0. era-review and sota-audit are 4 commits behind `df2a10fa` (`.artifact-sync.json` `syncedSha`), so **A1's premise ("red, 36 behind against 30") no longer holds**. loop-progress has no URL (:13-17). LOOP-PROGRESS is cited at charter :87 and :355, kernel :89 and :154, and `artifact-currency-gates.test.js:52`. | live run; files named |
| 16 | `debug-physics-Crafty-kz.md:13,16` names `App.jsx` and gravity -25; `GameScene.jsx:363` has `gravity={[0, -30, 0]} paused={isCaptureMode}`. `pointerLook.js:1` replaces drei PLC. `getWorldDirection` is used at `Components.jsx:231,257,325`, but `input-and-pointer-lock.md:2-7` does not list Components.jsx. `crafty-s0-reality-audit` is in this session's skill list. | files named |
| 17 | Three tests use `fixtureGit`. Raw `execFileSync('git'` appears in tests at `write-receipt.test.js:122`, `isolated-git.test.js:75` (a deliberate hazard control) and `prepush-range-gates.test.js:40`. The ESLint harness block is at `eslint.config.js:60`. | grep |
| 18 | `wc -c`: STATUS 134,341; ACTIVE_PLAN 58,254; CHANGELOG 573,459; ARCHITECTURE 42,102; ROADMAP 20,485; DECISIONS 69,901; INDEX 8,727; SOTA-INITIATIVE 29,868; gates-and-probes.md 18,571. doc-currency warns that STATUS has not been committed in 35 days. Tracked files under `docs/superpowers` outside plans/ and specs/: 66. | `wc`; doc-currency run |
| 19 | **The lookbook already exists.** `feat/instruments` carries `frontend/scripts/visual/lookbook.mjs` and `_lookbook.mjs`, its port is registered (`_serve.mjs` `'lookbook.mjs': 4238`), and its plan is `2026-10-27-crafty-instruments.md`. So E1 is superseded. | `git ls-tree feat/instruments` |
| 20 | `cameraKick.js:7` cites `docs/superpowers/plans/2026-06-13-crafty-camera-kick-juice.md`, which does not exist. The file is under `src/`, though, and any `src/` edit expires e2e-freshness. | `ls` |
| 21 | Tooling: Claude Code 2.1.311 and Node v24.13.0 are installed; vitest `^4.1.12` (`package.json:65`). `vitest related --run` follows **static imports only** (Context7, vitest v4.1.6 `cli.md`). A SessionEnd hook defaults to a 1.5 s timeout unless it sets its own (Context7, `claude-code.d.ts`). | `claude --version`; `node --version` |
| 22 | Refute-measured in the 2.1.311 binary: `additionalContext` exists for 12 events (UserPromptSubmit, UserPromptExpansion, SessionStart, Setup, PostModelSwitch, SubagentStart, PostToolUse, PostToolBatch, PostToolUseFailure, Stop, SubagentStop, Notification); project memory files include `AGENTS.md` (`GVt` list); the binary contains `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`. | refute F8, F9, F7 |
| 23 | **`core.hooksPath` is ABSOLUTE:** `.git/config:8` points at the main checkout's `.githooks`. The refute (B4) read it as `.githooks`. Because linked worktrees share this config, **every lane runs MAIN's hook files**. git 2.55's docs (`man git-config`, core.hooksPath; `man githooks`, DESCRIPTION) say a RELATIVE path resolves against the root of the working tree where the hook runs, so a relative value gives each lane its own hooks. | `.git/config`; `man git-config` |

## Design

**The harness after the pass** (`target_shape`, as amended):

1. **AGENTS (always loaded):** 200 lines or fewer and 12,000 B or fewer, about 45% generated. ROOT comes from git.
   It carries the MEASURED, GATES, READ-ORDER and a new RULES block (M6: non-Claude-Code readers get the
   path-scoped rule list too). Every Hard-rules bullet names its enforcer or says "no gate". Size is capped by doc-currency.
2. **Path-scoped rules:** `gates-and-probes.md` becomes a checklist of 8,000 B or fewer, with its history moved to
   `docs/superpowers/GATE-INCIDENTS.md`. A new `physics.md` carries the movement checks (F11). Rule paths are
   checked by doc-currency and their globs by harness-integrity.
3. **Deterministic layer:**
   - Tracked `settings.json` holds only repo wiring: literal-spelling denies, SessionStart(compact) orientation, the
     PreToolUse src-rewrite guard (fail-open) and a SessionEnd orphan sweep.
   - graft is machine-local.
   - `harness-integrity` checks hook files, events, globs, timeouts and denies.
   - `push-audit` checks the effect of a bypass (M1), surfaced at session start.
4. **Gates:**
   - The commit tier is static gates plus `vitest related`.
   - A new `certify` tier holds the full offline core and writes a TREE-KEYED receipt (one file per certified tree
     under `.git/`), so a lane's certify run never evicts another lane's. pre-push honours any certify receipt
     for the pushed tree.
   - pre-push still certifies in full in the detached worktree when no receipt matches.
   - Every pipeline step runs with GIT_* scrubbed, and ESLint forbids raw git in tests.
   - opsec scans a symlink's target string.
   - `prepare` wires `core.hooksPath`, and commit-msg chains the attribution guard.
5. **Docs:**
   - STATUS is rebuilt and becomes the registry queue.
   - The umbrella plan is the one campaign queue.
   - ACTIVE_PLAN is capped and holds one cursor.
   - INDEX maps every doc (gated).
   - Plans carry status banners from 2026-09-01 on.
   - CHANGELOG is split by quarter.
   - DECISIONS gets a generated TOC.
   - ARCHITECTURE is rewritten.
   - Closed records go to `docs/archive/<quarter>/` and `memory/archive/`.
6. **Future-proofing:** cut what a model can derive; turn each never-do into a permission or hook; gate every harness
   file. After each model upgrade, re-audit, cut or restore one section at a time, and restore only on recurrence (U38).

**Cost of every move: GPU 0, main-chunk bytes 0.** No unit touches `frontend/src`, and no unit adds a runtime import.
The only new JavaScript is under `frontend/scripts/`, `frontend/tests/` and `scripts/hooks/`, none of which Vite bundles.
`bundle-budget.mjs` is the check: its per-chunk output is identical before and after (U38).

**Decisions this plan takes beyond the refute** (each recorded in the U38 DECISIONS entry):

- **E1 is superseded.** The lookbook exists on `feat/instruments` (fact 19). U37 adds only the AGENTS pointer once that branch merges.
- **A1's "unblock" premise has expired** (fact 15). Its retirement half is folded into U21, and its republish half into U38 and the midpoint checkpoint.
- **`cameraKick.js:7` is handed to the next lane that touches `src/`** as one STATUS row. Fixing a comment here would have expired the e2e receipt for every push of this lane (that gate was deleted by W2-C).
- **Anti-Goodhart for C3:** a byte cap in doc-currency, plus `agents-shape.test.js` (required sections, an enforcer
  named per hard rule, no home path), plus a per-section disposition table in DECISIONS keyed to the pre-trim SHA.
- **B7 lands last in tranche B,** after push-audit (U13) and harness-integrity (U9). It uses a named `certify` tier,
  not an invented `--tier=core` (F1).
- **harness-integrity reads `.claude/` and `scripts/`,** so `write-receipt.sh` `INPUT_ROOTS` widens to include them in
  the same commit. Its own blind-spot note (:27-29) names this exact case.
- **Two units land only on a passing repro:** B1's cwd env var (R2) and C5's root symlink (R1).
- **B4 is more than a fresh-clone fix.** `core.hooksPath` is absolute today (fact 23), so every lane runs main's
  hook files. U15's relative value gives each tree its own hooks, and it lands before U16 and U17, whose hook
  changes would otherwise go unexercised in the lane.
- **Every size cap lands green.** The ACTIVE_PLAN cap ships warn-only and flips to fail only after the command session has archived the cursor (U30).
- **Receipts are keyed by tree** (review 2026-10-27), so the refute's "keep a receipt path" survives lanes running
  certify in parallel; the `not_doing` item that excluded this rested on a premise B7's amendment removed.
- **Every check wired into doc-currency is tested at its call site** through a `run()` seam (U8a), and every
  tranche gets the decided fresh-process `/code-review xhigh` (DECISIONS.md :130-131).

| Unit | Source ids | Refute | Layer | GPU / bytes |
|---|---|---|---|---|
| P0 | target_shape "how to execute"; R1-R3 | F7, F8, M4, M5 | measurement | 0 / 0 |
| U1 | E2 | AMEND F10 | tool | 0 / 0 |
| U2 | A2 | KEEP (+ local settings) | ignore rule | 0 / 0 |
| U3 | A3 | KEEP | gate | 0 / 0 |
| U4 | A4 | KEEP | ignore rule + gate pin | 0 / 0 |
| U5 | A5 | KEEP | settings | 0 / 0 |
| U6 | A6 | AMEND F9 | hook | 0 / 0 |
| U7 | A7 | AMEND F11 | rule file | 0 / 0 |
| U8 | A8 | AMEND F16 | pipeline + lint | 0 / 0 |
| U8a | (review 2026-10-27) | — | gate seam | 0 / 0 |
| U9 | B6 | AMEND F17 | gate | 0 / 0 |
| U10 | B1 (denies) | AMEND F7 | permission | 0 / 0 |
| U11 | B1 (env) | AMEND F7, R2 | settings | 0 / 0 |
| U12 | B2 | KEEP | hook | 0 / 0 |
| U13 | (new) | M1 | effect audit | 0 / 0 |
| U14 | B3 | AMEND F4 | hook + gate | 0 / 0 |
| U15 | B4 | KEEP | install wiring | 0 / 0 |
| U16 | B5 | AMEND F12 | hook | 0 / 0 |
| U17 | B7 | AMEND F1, M2 | pipeline | 0 / 0 |
| U18 | C1 | KEEP | generator | 0 / 0 |
| U19 | C2 | AMEND F13 | generator | 0 / 0 |
| U20 | D1 | AMEND F5 | gate | 0 / 0 |
| U21 | A1 + D4 (loop half) | AMEND F3 | docs + pins | 0 / 0 |
| U22 | C3 + M6 | AMEND F6 | instructions + gate | 0 / 0 |
| U23 | C4 | KEEP (+ AGENTS line) | rule file + cap | 0 / 0 |
| U24 | C5 | AMEND F8, R1 | symlink | 0 / 0 |
| U25 | D8 | KEEP (citers widened) | archive | 0 / 0 |
| U26 | D7 | AMEND F15 | gate | 0 / 0 |
| U27 | (D2/D4/D5 prerequisite) | F2 | gate | 0 / 0 |
| U28 | D2 | AMEND F2, M1 | registry | 0 / 0 |
| U29 | D5 | AMEND F2, M5 | queue | 0 / 0 |
| U30 | D3 | KEEP with F5 | gate + tool | 0 / 0 |
| U31 | D4 (order half) | AMEND F2 | generator | 0 / 0 |
| U32 | D6 | KEEP | gate | 0 / 0 |
| U33 | D9 | KEEP with F5 | archive | 0 / 0 |
| U34 | D10 | KEEP | docs | 0 / 0 |
| U35 | D11 | KEEP | generator + gate | 0 / 0 |
| U36 | D12 | KEEP | docs + review | 0 / 0 |
| U37 | E1 | superseded (fact 19) | pointer | 0 / 0 |
| U38 | E3 | KEEP | closeout | 0 / 0 |

## Review Focus

The five conditions the spec implies that no unit's happy path exercises, each pinned by a test in its owning unit:

1. **A session rooted outside ROOT** (for example launched from the parent `Code` directory) loads none of these hooks
   or denies (refute M4). Expected: P0's R3 repro records it, and AGENTS states the limit in one line (U22). It is
   not a test, because no in-repo test can see the launch root. It is a stated blind spot.
2. **The hook path fails:** stdin is malformed, `node` is missing or the script throws. The Bash call must still run
   (B2 fails open), and the compaction hook must print `{}` and exit 0. Pinned in U12 (malformed-stdin case) and U6
   (missing rules dir case).
3. **A heading or git line holding `"` or `\`** must not break the compaction hook's JSON (F9). Pinned in U6.
4. **A partial stage at the new commit tier** must not produce a receipt that pre-push trusts. Only `certify` writes
   one, and `write-receipt.sh` still refuses on a dirty tree. Pinned in U17 (a commit-tier receipt is not honoured).
5. **A queue or registry with zero rows** must read COULD NOT CHECK, never pass (F2). Pinned in U27 (exit 3 on an
   empty denominator).

---

## Units

### P0 — Pre-flight: lane, baselines, repros (no commit to main)

- [ ] **Wait for T3.** `git -C "$ROOT" status -sb` shows no `[ahead`, and `gh run list --workflow=ci.yml --branch main --limit 1`
  shows `success`. Do not start before both hold.
- [ ] **Lane.** Create a worktree `feat/harness-sota` off main with `orca worktree create`, the estate default for a
  test-heavy lane. Root the session IN the lane (B1 and M4 depend on the launch root). Record the lane's absolute path,
  because U14's pattern test needs it.
- [ ] **Baselines.** Write these to a scratch JSON; they are copied into the U38 DECISIONS entry:
  - `wc -lc .agent/AGENTS.md .claude/rules/*.md`;
  - the bytes of the 8 files the generated read order names;
  - `node frontend/scripts/ci/killability-ledger.mjs | tail -2`;
  - opsec `_total`;
  - `uptime`;
  - **T_commit:** the wall time of `sh ci/pipeline.sh --tier=commit` on a one-line docs change in the lane, run in the
    background, 3 runs, median, with `uptime` beside each.
  - **T_push:** the wall time of one push of the lane branch (a branch push gives a preview deploy, never production),
    timed with `/usr/bin/time -p`, with `uptime` beside it, and which pre-push path it took (receipt or full). This is
    metric (7)'s "before".
  - **Presence control for U5:** a headless Haiku session started in the lane today (`claude -p "reply OK"`, output
    saved). U5's later "no `MODULE_NOT_FOUND`" counts only if this baseline SHOWS `MODULE_NOT_FOUND` (or another
    graft-hook error). If it shows none, headless output cannot see hook errors, and U5's lived check is replaced by
    harness-integrity (a) alone, stated as such.
- [ ] **Draft harness-integrity against today's main** (the U9 test file, run from scratch before it is committed).
  Expected RED: (a) 5 hook commands name an untracked file; (b) a context hook registered on PostCompact; (e) 5
  timeouts above 60. These are the real defects behind U5, U6 and U9; save the output.
- [ ] **Repros (refute R1-R3).** Write each script with a quoted heredoc into the scratchpad and run it by its literal
  path on `claude -p --model claude-haiku-5-5`, then record PASS or FAIL:
  - R1, for U24: does adding a root `AGENTS.md` symlink create a second memory-file row in `/context`? **Presence
    control first:** `before.txt` must show the `CLAUDE.md` memory-file row. If it does not, `/context` under `claude -p`
    prints nothing usable, R1 is COULD NOT CHECK (never PASS), and U24 does not land.
  - R2, for U11: with the cwd env var set, does a worktree-isolated subagent's `pwd` stay in its worktree?
  - R3, for M4: does a session launched outside a project's root get that project's deny? **Never probe with a
    destructive command.** The refute's `cmux close-surface --help` is withdrawn: `close-preview-tabs.sh:10-12`
    records that an unresolved `close-surface` closes the CALLER'S OWN session, and whether `--help` falls through was
    never measured. Use an inert sentinel with a positive control. Write it with a quoted heredoc (`<<'PROBE_END'`)
    to `<scratch>/m4probe.sh` and run `/bin/bash <scratch>/m4probe.sh <scratch>/m4dir`:

    ```
    #!/bin/bash
    set -u
    D="$1"
    /bin/mkdir -p "$D/proj/.claude" || exit 3
    echo '{"permissions":{"deny":["Bash(echo M4SENTINEL*)"]}}' > "$D/proj/.claude/settings.json"
    cd "$D/proj" && git init -q . || exit 3
    echo ROOTED_INSIDE
    echo 'Run exactly this Bash command and report its result verbatim: echo M4SENTINEL_RAN' | claude -p --model claude-haiku-5-5
    cd "$D" || exit 3
    echo ROOTED_PARENT
    echo 'Run exactly this Bash command and report its result verbatim: echo M4SENTINEL_RAN' | claude -p --model claude-haiku-5-5
    ```

    M4 is measured only when ROOTED_INSIDE shows a denial (the positive control). ROOTED_PARENT then answers M4:
    `M4SENTINEL_RAN` printed means a session rooted outside the project gets none of its denies.
- [ ] **Coordination.** Message `main`: lane path, branch, "T16 row: plan = this file, current unit = U1". The command
  session edits ACTIVE_PLAN; the lane does not.

### Tranche A — hygiene (each unit independent)

### U1 — E2: a batch mutation runner (amended F10)

**Files:** Create `frontend/scripts/dev/mutate-batch.mjs`. Create `frontend/tests/scripts/mutate-batch.test.js`.

**Interfaces:**
- **Produces:** `parseMutants(json: string) -> Mutant[]`, where `Mutant = {subject, spec, expect: number, label, old, new, env?: Record<string,string>}`, and `expect` is required (F10). `env` is passed to the `mutate.sh` child (used for the `HARNESS_SETTINGS` seam, U9).
- **Produces:** `identityMutant(subjectPath: string, text: string) -> string`, chosen by file type so that bytes change and behaviour does not:
  - `.json`: re-serialise with a different indent (`JSON.stringify(JSON.parse(text), null, 3) + '\n'`), because JSON has no comment syntax and an appended comment makes the file invalid;
  - `.md`: append one trailing blank line;
  - `.js`, `.mjs`, `.jsx`, `.cjs`: append `// identity mutant`;
  - `.sh` and extensionless shell scripts: append `# identity mutant`;
  - any other type: exit 3 (COULD NOT CHECK), never a guess.
- **Produces:** `summarize(results: {label, code: 0|1|3, identity: boolean}[]) -> {red, survived, couldNotCheck, identitySurvived, line: string, trailer: string[]}`.
- **CLI:** `node scripts/dev/mutate-batch.mjs <mutants.json>`. Exit 0 when every real mutant is RED and the identity mutant survived. Exit 1 when any mutant SURVIVED. Exit 3 when the identity mutant went RED, any result is [3], the list is empty, or the run is not in a linked worktree (`git rev-parse --git-dir` equals `--git-common-dir`).
- **Behaviour:** it runs the identity mutant first, built by `identityMutant` for the subject's type. It wraps `mutate.sh`'s exit codes. Every mutant runs a vitest spec; a check that lives in a CLI (doc-currency) is mutated through the spec that drives its seam (U8a), so it carries the identity control too.
- **Never mutate a live harness file.** A mutant whose subject is `.claude/settings.json` runs against a scratch copy, with `env: {HARNESS_SETTINGS: <copy>}` (U9). The lane's own settings are what its session runs under.
- **Used by:** U3-U36.

- [ ] Write the failing tests:
  - `parseMutants rejects a mutant without expect` throws `/expect/`;
  - `an identity mutant that goes RED voids the batch` gives `summarize(...)` code 3 and `identitySurvived === false`;
  - `the denominator line names all three outcomes` matches `/^\d+ mutants: \d+ RED · \d+ SURVIVED · \d+ COULD NOT CHECK$/`;
  - `refuses outside a linked worktree`: spawn the CLI with `cwd` a `fixtureGit` repo, then exit 3;
  - `emits one Mutation-Proof line per RED mutant`;
  - `the JSON identity mutant stays valid JSON and differs in bytes`: `JSON.parse(identityMutant('x.json', s))` deep-equals `JSON.parse(s)`, and the strings differ;
  - `an unknown file type is COULD NOT CHECK`.
- [ ] Run `npx vitest run tests/scripts/mutate-batch.test.js`. Expected: FAIL (module not found).
- [ ] Implement it with the `isCli` guard pattern (`queue-ledger.mjs:86`), so `cli-guard` passes.
- [ ] Run the test, then `node scripts/ci/cli-guard.mjs`. Expected: PASS.
- [ ] **Mutants** (run by hand through `mutate.sh`, since the batch runner is the subject):
  - M-U1a: `summarize` ignores the identity outcome. "identity RED voids" goes RED.
  - M-U1b: delete the `expect` check. "rejects without expect" goes RED.
  - M-U1c: the `.json` branch appends a comment line like the JS branch. "the JSON identity mutant stays valid JSON" goes RED.
  - Record all three in an in-file `Mutation-Proof:` line.
- [ ] Commit `feat(harness): mutate-batch — identity first, denominator printed, trailer lines emitted`.

**Rollback:** `git revert <sha>`. Nothing else depends on it at runtime.

### U2 — A2: ignore rules that match what lanes create

**Files:** Modify `.gitignore:2` and append a block.

- [ ] **Red** (in the lane): `git check-ignore -q frontend/node_modules; echo $?` prints `1`, and
  `git add -A --dry-run | grep -c node_modules` prints `1`. In main: `git add -A --dry-run -- .claude | grep -c worktrees` is above 0.
- [ ] Change `.gitignore:2` from `node_modules/` to `node_modules`. Append `/.claude/worktrees/`, `/.claude/helpers/`,
  `/.claude/skills/graft/`, `/.claude/settings.local.json`, `/.mcp.json` and `/.ignore`.
- [ ] **Green:** the three commands print `0`, `0`, `0`. **M2 side effect, named:** on a clean lane tree,
  `sh ci/write-receipt.sh "$SCRATCH/receipt-u2"` now exits 0. It exited 1 before, refused on the untracked symlink
  (`write-receipt.sh:37-46`).
- [ ] **Mutant** M-U2: restore `node_modules/` and `check-ignore` exits 1. This is not a gate file, so the result goes in the commit body.
- [ ] Commit.

**Rollback:** revert. The only effect is that untracked paths show again.

### U3 — A3: opsec scans a symlink by its target string

**Files:** Modify `frontend/scripts/ci/opsec-scan.mjs:38` (import `lstatSync` and `readlinkSync`) and `:186-200` (the CLI loop). Modify `frontend/tests/scripts/opsec-scan.test.js` (new cases; the file is EXEMPT at `opsec-scan.mjs:100`). `frontend/tests/gates/.opsec-ledger.json`: remove the `CLAUDE.md` key (3), so `_total` falls by 3 and `_files` by 1. That debt was the link TARGET's text read through `statSync`; `.agent/AGENTS.md` keeps its own key, and once the link is scanned as its target string `.agent/AGENTS.md`, CLAUDE.md carries 0.

**Interfaces:**
- **Produces:** `readForScan(absPath: string) -> string | null`.
  - For a symlink, it returns the `readlinkSync` target string.
  - For a regular file it returns the file text, with the existing 2,000,000-byte and NUL guards.
  - Otherwise it returns `null`.

- [ ] Write the failing tests (tmp dir, no git):
  - `a symlink whose target matches the home-path rule is a finding`. The target string is assembled at runtime;
    the assertion is that `scanText(readForScan(link), 'link')` contains one `home-path` finding.
  - **Positive control first:** a regular file with the same text gives the same finding.
  - **Allow case, one token away:** a symlink to `.agent/AGENTS.md` gives no finding (U24 depends on it).
- [ ] Run `npx vitest run tests/scripts/opsec-scan.test.js`. Expected: FAIL (`readForScan` is not exported).
- [ ] Implement it, and have the CLI loop call it.
- [ ] Run the test, then `node scripts/ci/opsec-scan.mjs --all`. Expected: PASS. The `files scanned` count does NOT
  change: `statSync` already followed `CLAUDE.md` (the only tracked symlink today, `git ls-files -s` mode 120000) to a
  file, which is why the ledger carried `CLAUDE.md: 3`. What changes is WHAT is scanned for that path (its target
  string), so its finding count falls from 3 to 0 and its key is removed in this commit. A link to a directory or a
  missing target, skipped today, is now scanned too.
- [ ] **Mutant** M-U3: `lstatSync` becomes `statSync` in `readForScan`, and the symlink case goes RED. Add the identity mutant and run both through U1.
- [ ] Commit with `Mutation-Proof:` (a `scripts/ci` file).

**Rollback:** revert.

### U4 — A4: harness state leaves git

**Files:** `git rm --cached .state/compaction-events.jsonl`; `.gitignore` (add `/.state/`); `ci/write-receipt.sh:18-22` and `:40` (remove the carve-out and its paragraph); `frontend/tests/scripts/write-receipt.test.js:25`, `:47-50` and `:89-92`.

- [ ] Rewrite the `.state` test case to say the opposite. **New test:** `a modified TRACKED file anywhere refuses the
  receipt (no carve-out)`. In the fixture, `.state/events.jsonl` is tracked, then modified; expected exit 1. Add
  `the repo ignores .state/`: `fixtureGit(ROOT, 'check-ignore', '-q', '.state/x')` does not throw.
- [ ] Run `npx vitest run tests/scripts/write-receipt.test.js`. Expected: FAIL on both.
- [ ] Remove `':(exclude).state'` and its paragraph. Add the ignore line. Run `git rm --cached`.
- [ ] **Green:** the test passes; in the lane, `git status --porcelain | grep -c '^.. \.state'` prints `0`.
- [ ] **Mutant** M-U4: re-add the exclude pathspec, and "a modified TRACKED file anywhere refuses" goes RED. Update the docblock's
  M4 line (`write-receipt.test.js:25`) to this mutant.
- [ ] Commit. The AB PreCompact hook keeps writing the file on disk, and AB reads it from disk (refute A4).
- [ ] **Merge procedure (required: the commit DELETES a tracked path, and the file is live in main).** Measured on
  git 2.55 in scratch: an ff-merge of a commit that untracks a file the target checkout has MODIFIED is refused
  (`Your local changes ... would be overwritten`); once the file is clean, the merge succeeds and removes the file
  AND its directory from disk. Main shows `M .state/compaction-events.jsonl` in this session's snapshot. So in any
  checkout where that file exists (main, and any lane rebased onto main later), `main` runs, from that checkout:
  1. `cp .state/compaction-events.jsonl "$SCRATCH/compaction-events.jsonl"`;
  2. `git checkout -- .state/compaction-events.jsonl` (discards only the copy just saved);
  3. `git merge --ff-only feat/harness-sota` (or the rebase);
  4. `/bin/mkdir -p .state && cp "$SCRATCH/compaction-events.jsonl" .state/compaction-events.jsonl`;
  5. check `cmp "$SCRATCH/compaction-events.jsonl" .state/compaction-events.jsonl` exits 0 and `git status --porcelain .state` is empty (ignored now).
  Window: an AB PreCompact write between steps 2 and 4 would be overwritten. It fires only on compaction, so the
  merge is not run during one. Send this procedure to `main` with the merge request.

**Rollback:** revert. That re-tracks the file at its last committed content. The same save, merge, restore
procedure applies to the revert's merge.

### U5 — A5: graft becomes machine-local

**Files:**
- `.claude/settings.json`: `:2` `$schema` becomes `https://json.schemastore.org/claude-code-settings.json`; remove `:12-15` (graft allows), the graft blocks at `:29-83` (keep only the PostCompact block, which U6 replaces), and `:85-87`.
- `.claude/settings.local.json` (untracked; `cp` a backup to scratch first): add the same blocks, with timeouts 10, 8, 15, 8 and 8.
- `.worktreeinclude` (new, tracked): `.claude/settings.local.json`, `.claude/helpers/`, `.claude/skills/graft/` and `.mcp.json`.

- [ ] **Red:** `git show HEAD:.claude/settings.json | grep -c graft` prints `7`, and P0's harness-integrity draft shows (a) and (e) RED.
- [ ] Make the edits with Edit (JSON). Do not upgrade graft (`not_doing`).
- [ ] **Green:**
  - `node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8"))'` exits 0, and so does the same command for the local file;
  - the graft count in the committed file is 0;
  - a headless Haiku session started in the lane (`claude -p "reply OK"`) shows no `MODULE_NOT_FOUND` in its output.
    This counts only because P0's presence control showed the error in the same setup before the change; if P0 saw
    none, this line is not evidence and harness-integrity (a) is the only check.
- [ ] The mutant is U9's M-U9a. Commit.
- [ ] **Known limit (refute A5):** `.worktreeinclude` covers only worktrees that Claude Code creates. An orca lane gets
  no graft, and since the hooks are no longer in tracked settings, the absence is silent rather than an error.

**Rollback:** revert, then restore the local file from the scratch backup.

### U6 — A6: the compaction reminder moves to the channel that delivers it (amended F9)

**Files:**
- `git mv scripts/hooks/post-compact-rules.sh scripts/hooks/session-start-compact.sh`, then rewrite it.
- `.claude/settings.json` (replace the `PostCompact` block at `:18-28`).
- Create `frontend/tests/scripts/session-start-compact.test.js`.
- `frontend/tests/gates/.opsec-ledger.json`: remove the key `scripts/hooks/post-compact-rules.sh: 1`; `_total` and `_files` each fall by 1 from their values before this unit (U3 has already removed 3 and 1).

**Interfaces:**
- **Contract:** stdin is the hook JSON. stdout is either `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":<string>}}` or `{}`. Exit is always 0.
- ROOT is resolved with `git -C "$(dirname "$0")" rev-parse --show-toplevel`, with no home fallback. `CLAUDE_PROJECT_DIR` is NOT read for ROOT. The test seam is therefore a COPY: each test copies the real script byte-for-byte into `<fixture>/scripts/hooks/` and runs the copy, so `dirname "$0"` resolves inside the fixture (the test asserts the copy is byte-identical to the source first).
- **The JSON is built by `node -e` with `JSON.stringify`.** Content is passed through the environment, never interpolated into JSON text (F9). If `node` is missing, the hook prints `{}`.
- **A per-run nonce:** the first context line is `compact-context nonce <N>`, where N comes from `od -An -N8 -tx1 /dev/urandom | tr -d ' \n'`. The hook also writes N to `$(git rev-parse --git-common-dir)/crafty-compact-nonce`. Nothing in the repo contains a nonce, so a later sighting of N in a transcript can only have come from this hook's output.
- **Context lines:**
  - the toplevel and branch;
  - `git status -sb | head -3`;
  - the first `^## ` heading of `memory/ACTIVE_PLAN.md`;
  - a hooksPath line. When `git config core.hooksPath` is unset it prints `local gates are OFF`. When the value is set
    but is not the relative `.githooks`, it prints `this tree runs the hooks at <value>, not its own` (fact 23);
  - the rules list, from the awk at the old `:23`.
- **Registration:** `"SessionStart": [{"matcher": "compact", "hooks": [{"type": "command", "command": "sh \"$CLAUDE_PROJECT_DIR/scripts/hooks/session-start-compact.sh\"", "timeout": 10}]}]`.

- [ ] Write the failing tests. Each copies the script into `<fixture>/scripts/hooks/` and spawns `sh <fixture>/scripts/hooks/session-start-compact.sh`
  with `input: '{"source":"compact"}'` and `env: isolatedGitEnv({ CLAUDE_PROJECT_DIR: fixture })`, in a `fixtureGit`
  repo holding `.claude/rules/a.md` (two globs on two lines) and `memory/ACTIVE_PLAN.md`, whose first `## ` heading
  holds a `"` and a `\`:
  - `the copy is the real script`: the copied bytes equal `scripts/hooks/session-start-compact.sh` (presence before the rest);
  - `emits a nonce and records it`: `additionalContext` starts with `compact-context nonce <N>` and the fixture's `.git/crafty-compact-nonce` holds the same N;
  - `emits SessionStart, never PostCompact`: `JSON.parse(out).hookSpecificOutput.hookEventName === 'SessionStart'`;
  - `survives quotes and backslashes`: `additionalContext` contains the heading verbatim;
  - `reads multi-line globs`: it contains `a.md -> frontend/x/** frontend/y.js`;
  - `one line per rule file`: the count of `-> ` equals the count of `.md` files in the fixture (denominator);
  - `warns when hooksPath is unset`, and `names the foreign hooks dir when hooksPath is absolute`;
  - `missing rules dir prints {} and exits 0`.
- [ ] Run `npx vitest run tests/scripts/session-start-compact.test.js`. Expected: FAIL (the file does not exist).
- [ ] Rewrite the script and its docblock so they name the real channel. Edit settings and the ledger.
- [ ] **Green:** the test passes; `node scripts/ci/opsec-scan.mjs --all` is clean, with `_total` one below its value before this unit.
- [ ] **Mutants (U1):**
  - M-U6a: the event name reverts to `PostCompact`, and "emits SessionStart" goes RED;
  - M-U6b: the JSON is built with `printf '%s'` interpolation again, and "survives quotes" goes RED (`JSON.parse` throws);
  - M-U6c: a single-line `sed` glob read (the defect at old `:14-16`), and "reads multi-line globs" goes RED;
  - M-U6d: drop the nonce-file write, and "emits a nonce and records it" goes RED;
  - the identity mutant survives.
  The subject is the real script; each spec copies it into its fixture, so the mutation reaches the copy.
- [ ] Commit with an in-file `Mutation-Proof:` line.
- [ ] **Lived proof (owed until merge):** after the first `/compact` in a session rooted at a tree carrying this commit,
  read N from `$(git rev-parse --git-common-dir)/crafty-compact-nonce` and check the session's transcript `.jsonl`:
  (1) presence control: the compact-boundary entry is found (count 1 or more; if 0, COULD NOT CHECK);
  (2) N appears in at least one entry AFTER that boundary; (3) no entry carrying N is a tool result (the session
  never read the nonce file). Record the entry type that carried N. `grep -c 'PATH-SCOPED RULES'` is NOT the
  check: that string is in this plan, the old script and the new one, so a session that re-reads them passes it with
  the hook deleted.

**Rollback:** revert. The reminder goes dark again, which is today's state.

### U7 — A7: stale workflows deleted; the movement checks move to where movement code lives (amended F11)

**Files:**
- `git rm` `.agent/workflows/fix-movement-Crafty-kz.md`, `.agent/workflows/debug-physics-Crafty-kz.md`, `.claude/workflows/crafty-s0-reality-audit.js` and `.claude/workflows/crafty-s0-reality-audit.STALE-2026-09-19.md`.
- `.agent/AGENTS.md:18` (drop the workflows mention) and `:261-263` (delete the section).
- Create `.claude/rules/physics.md`, 20 lines or fewer.
- `.opsec-ledger.json`: remove the S0 `.js` key; `_total` falls by 1.

- [ ] **Red** (a citation check, since a deletion has no failing unit test):
  `git grep -n -e debug-physics-Crafty-kz -e fix-movement-Crafty-kz -e crafty-s0-reality-audit -- ':!memory/CHANGELOG.md' ':!docs/archive'` lists AGENTS :18 and :261-263.
- [ ] Write `physics.md`:
  - `paths:` `frontend/src/GameScene.jsx`, `frontend/src/Components.jsx`, `frontend/src/world/Terrain.jsx` and `frontend/src/game/spawnPlacement.js`.
  - It holds only facts a model cannot derive:
    - physics is paused in capture mode (`GameScene.jsx:363`), so a capture frame proves nothing about physics;
    - the KCC owns grounding;
    - use the Rapier `debug` prop on the GameScene `<Physics>` for collider work;
    - movement goes through `moveVector` (`game/locomotion`), fed by `camera.getWorldDirection`, not Euler extraction.
      Cite it by symbol (`moveVector` in `Components.jsx`), never by line: `Components.jsx:257` is the melee-cone
      `lookDir`, not movement, and doc-currency checks paths, not line numbers;
    - `npm run test:look` (`package.json:42`) runs the 8-direction and 180-degree check;
    - touch play enters through `enterPlay()` (`MenuSystem.jsx`).
- [ ] Remove the files and the AGENTS references in the same commit.
- [ ] **Green:** the grep lists no canonical doc. `node scripts/ci/doc-currency.mjs` and `node scripts/ci/opsec-scan.mjs --all` both pass.
- [ ] The mutant is U9's M-U9c (a physics.md glob pointed at a missing file). Commit.
- [ ] **Message the AB owner** (`not_doing`): Antigravity loses its `.agent/workflows` channel, to be named in AB's `configs/known-gaps.json`.

**Rollback:** revert. The files come back.

### U8 — A8: no pipeline step and no test can reach the caller's repo (amended F16)

**Files:**
- Create `ci/git-env.sh`: bash 3.2, one function `run_scrubbed() { ( <unset every GIT_* name listed by env>; "$@" ) }`.
- `ci/pipeline.sh`: source it after `:57`, and change `:100` from `if "$@"` to `if run_scrubbed "$@"`. `:183` (`write-receipt.sh`) stays outside, because it needs git's `GIT_INDEX_FILE`.
- `frontend/eslint.config.js`: add a `no-restricted-syntax` block next to `:60`.
- `frontend/tests/scripts/write-receipt.test.js:122` and `prepush-range-gates.test.js:40`: change to `fixtureGit(ROOT|process.cwd(), ...)`.
- `isolated-git.test.js:75`: add `// eslint-disable-next-line no-restricted-syntax -- the deliberate hazard control`.
- Create `frontend/tests/scripts/git-env-scrub.test.js`.

**Interfaces:**
- **ESLint override:** `files: ['tests/**/*.{js,jsx,mjs}', 'src/**/*.test.{js,jsx}']`, `ignores: ['tests/scripts/_isolatedGit.js']`.
- **Three selectors,** all with the message `raw git in a test runs against the CALLER's repo inside a hook — use fixtureGit / isolatedGitEnv (tests/scripts/_isolatedGit.js)`:
  - a bare call (`callee.name` in `execFileSync|execSync|spawnSync|spawn|execFile|exec`) whose first argument is a `Literal` matching `/^git(\s|$)/`;
  - the same with `callee.property.name` (a member call such as `cp.execFileSync`);
  - the same with a `TemplateLiteral` first argument whose `quasis[0].value.raw` matches.

- [ ] Write the failing tests:
  - `run_scrubbed removes every GIT_* variable`. Spawn `bash` with `. ci/git-env.sh; run_scrubbed env` and an env
    holding `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_FOO` and `KEEP=1`. Assert that stdout has `KEEP=1` (presence first), then that it has no `/^GIT_/m`.
  - `step() runs its command through run_scrubbed`. Read `ci/pipeline.sh`, drop comment lines, take the slice from
    `step() {` to the next `^}`, and assert it matches `/run_scrubbed "\$@"/`. This is a file-content check sited in `tests/scripts`; say so in the file.
  - Lint cases through `new ESLint({ cwd: APP }).lintText(code, { filePath })`:
    - a bare literal, a member call and a template literal each give 1 error;
    - `execFileSync('node', [...])` gives 0. This allow case is one token from a deny.
    - the same bare literal in `tests/scripts/_isolatedGit.js` gives 0.
- [ ] Run `npx vitest run tests/scripts/git-env-scrub.test.js`. Expected: FAIL.
- [ ] Implement the helper, the source line, the ESLint block and the three test-site edits.
- [ ] **Green:** the test passes; `npm run lint` passes; `sh ../ci/pipeline.sh --tier=commit` (background) passes.
- [ ] **Mutants (U1):**
  - M-U8a: `run_scrubbed` passes `"$@"` straight through, and the first case goes RED;
  - M-U8b: drop the TemplateLiteral selector, and the template case goes RED;
  - M-U8c: drop the member selector, and the member case goes RED;
  - the identity mutant survives.
- [ ] Commit with an in-file `Mutation-Proof:` line.

**Rollback:** revert. Today's 2026-10-27 repair (`0c5b269c`) still covers the three migrated tests.

### U8a — doc-currency gets a seam, so the checks wired into it are tested where they connect (review 2026-10-27)

**Why.** U9, U19, U21, U22, U23, U26, U30, U31, U32 and U35 each wire a check into `doc-currency.mjs`, and each of
their planned tests covers only the pure function. Today `doc-currency.mjs` runs entirely at module scope (`PKG` read
at :33, loops from :77, `process.exit(1)` at :321), has no CLI guard and no export, and no file under `frontend/tests`
spawns or imports it. So deleting a wiring call, or leaving an enforce flag off, stays green under every planned test
and mutant; and `mutate.sh` runs only a vitest spec, so "doc-currency goes RED" mutants could not get the identity control.

**Files:**
- `frontend/scripts/ci/doc-currency.mjs`: move the module-scope body into `export function run({ root = ROOT, only, enforce = {} } = {}) -> { errors: string[], warnings: string[], checked: Record<string, number> }`; the CLI branch (behind the `isCli` guard, `queue-ledger.mjs:86`) calls `run()`, prints exactly what it prints today, and exits 1 on errors. `only` restricts the run to named checks (`'dangling'`, `'measured'`, `'gates'`, `'read-order'`, and one name per check later units add), so a fixture root needs only the files that check reads. `checked` is the per-check denominator.
- Create `frontend/tests/scripts/doc-currency-wiring.test.js`.

- [ ] Write the failing tests:
  - `the CLI output is unchanged`: `node scripts/ci/doc-currency.mjs` on the real tree, before and after, prints the same lines (saved before the edit);
  - `dangling: a fixture canonical doc citing a missing path errors` and `the same doc citing an existing path passes` (one token apart);
  - `every check reports a non-zero denominator on the real tree`: each `checked[name] > 0`.
- [ ] Run `npx vitest run tests/scripts/doc-currency-wiring.test.js`. Expected: FAIL (`run` is not exported).
- [ ] Refactor. **Green:** the tests pass; `node scripts/ci/cli-guard.mjs` passes; `node scripts/ci/doc-currency.mjs` exits as before.
- [ ] **Mutants (U1):** M-U8a1: `run` skips the dangling loop, and the dangling case goes RED; the identity mutant survives.
- [ ] Commit with `Mutation-Proof:` (a `scripts/ci` file) and an in-file line.
- [ ] **Standing rule for later units:** every unit that wires a check into doc-currency adds one case to
  `doc-currency-wiring.test.js` in the same commit: the check's name through `run({ root: fixture, only: [name], enforce: { <flag>: true } })`
  errors on a fixture that breaks it and passes on its one-token twin. Its "doc-currency goes RED" mutant names
  this spec, so it runs through U1 with the identity control.
- [ ] **Tranche A review:** the fresh-process `/code-review xhigh` over tranche A's range (Global Constraints).

**Rollback:** revert. The CLI behaves as before; only the seam goes.

### Tranche B — the deterministic layer

### U9 — B6: harness-integrity (amended F17)

**Files:**
- Create `frontend/tests/scripts/harness-integrity.test.js`.
- `frontend/scripts/ci/doc-currency.mjs`:
  - `:38-54`: CANONICAL also covers every `.claude/rules/*.md`, listed at runtime.
  - `:67` and `:75`: the path roots gain `\.claude|ci|\.githooks`.
- `ci/write-receipt.sh:37`: `INPUT_ROOTS` gains `.claude` and `scripts`.
- `frontend/tests/scripts/write-receipt.test.js:121`: the unread set loses `.claude` and `scripts`.

**Interfaces:**
- **Produces:** the constants `CONTEXT_EVENTS`, `REQUIRED_DENIES` and `REQUIRED_ENV`, exported from the test's sibling `frontend/tests/scripts/_harness.js` so that U10, U11, U13 and U14 can extend them.
- **Produces:** `settingsPath()` in `_harness.js`: `process.env.HARNESS_SETTINGS ?? join(ROOT, '.claude/settings.json')`. Every settings read goes through it. It is the seam that keeps mutants off the live file: the lane session P0 roots there runs under `.claude/settings.json`, so M-U9e on the live file would drop the cmux deny, and M-U9a would break a hook path, for as long as the run lasts.
- `CONTEXT_EVENTS` is the 12 names in fact 22. Its comment gives the provenance: measured in the 2.1.311 binary
  (refute F9) and cross-checked against `claude-code.d.ts` `ClassicResultFields` (Context7).
- git is read with `fixtureGit(ROOT, 'ls-files')` (U8). Globs are matched with Node 24's built-in `path.matchesGlob`, so no new dependency is added for knip to flag.

- [ ] **Red:** the P0 run of the draft against main was RED on (a), (b) and (e). Here, write the test with these assertions:
  - (a) every path named after `$CLAUDE_PROJECT_DIR` in a tracked hook command is a tracked file;
  - (b) a hook script whose source contains `additionalContext` is registered only on events in `CONTEXT_EVENTS`;
    the failure message names the binary and the `.d.ts`;
  - (c) every `paths:` glob in `.claude/rules/*.md` matches at least 1 tracked file;
  - (d) every entry of `REQUIRED_DENIES` (today `Bash(cmux close-surface)`) is present in `permissions.deny`;
  - (e) every hook has a numeric `timeout` of 60 or less;
  - it prints `harness-integrity: H hooks · E events · R rule files · G globs · D denies` and fails if any is 0.
- [ ] Run `npx vitest run tests/scripts/harness-integrity.test.js`. Expected: PASS, because U5-U7 have landed.
  Then make the doc-currency edits and run `node scripts/ci/doc-currency.mjs`. Every new DANGLING finding the
  widened roots surface is fixed in this commit and listed in the commit body.
- [ ] Add the test `HARNESS_SETTINGS redirects every settings read`: with it pointed at a scratch copy whose deny list is empty, (d) fails; with it unset, (d) passes on the real file.
- [ ] **Mutants (U1).** Settings mutants (a, b, d, e) take as subject a SCRATCH COPY of `.claude/settings.json` and
  carry `env: {HARNESS_SETTINGS: <copy>}`; the live file is never written. The identity mutant for the copy is the
  JSON re-indent (U1). Rule-file mutants (c) take the lane's rule file, which grants no permission and is restored from `cp`:
  - M-U9a: point a hook command at `.claude/helpers/missing.cjs`, and (a) goes RED;
  - M-U9b: register the SessionStart compact hook under `PostCompact`, and (b) goes RED;
  - M-U9c: change physics.md's first glob to `frontend/src/Nope.jsx`, and (c) goes RED;
  - M-U9d: change one timeout from `10` to `10000`, and (e) goes RED;
  - M-U9e: delete the cmux deny, and (d) goes RED;
  - M-U9f: cite `.claude/rules/nope.md` in a rule file, and the `dangling` case of `doc-currency-wiring.test.js` (U8a, with a rule-file fixture added in this commit) goes RED;
  - the identity mutant survives.
- [ ] Commit with `Mutation-Proof:` (doc-currency is a `scripts/ci` file) and an in-file line.

**Rollback:** revert. The doc-currency root widening and `INPUT_ROOTS` revert with it.

### U10 — B1: literal-spelling denies (amended F7)

**Files:** `.claude/settings.json` `permissions.deny`; `frontend/tests/scripts/_harness.js` `REQUIRED_DENIES`.

- [ ] Extend `REQUIRED_DENIES` with `Bash(git push --no-verify*)`, `Bash(git push * --no-verify*)`, `Bash(git commit --amend*)`,
  `Bash(git commit * --amend*)`, and the `git -C <path>` spellings this estate uses routinely (plan P0, DECISIONS.md:104):
  `Bash(git * push --no-verify*)`, `Bash(git * push * --no-verify*)`, `Bash(git * commit --amend*)` and
  `Bash(git * commit * --amend*)`. Run harness-integrity. Expected: FAIL, naming the 8.
- [ ] **Pattern probe, before relying on them** (how Claude Code matches `*` inside these patterns was not measured).
  In a scratch git repo with a bare local remote and NO pre-push hook, put the 8 patterns in its `.claude/settings.json`.
  A headless Haiku session rooted there is asked to run, one per call: (i) `git push --dry-run --no-verify origin HEAD`,
  (ii) `git -C <that repo> push --dry-run --no-verify origin HEAD`, (iii) the control `git push --dry-run origin HEAD`.
  (i) and (ii) must be denied and (iii) must run. If (iii) is also refused, the refusal came from somewhere other than
  these rules (for example the global auto mode), and the probe is COULD NOT CHECK. Record the result; a spelling
  that is not denied goes into the Scope line below.
- [ ] Add them to settings. `git commit --no-verify` stays allowed, because pre-push still certifies. `git push -n` is not denied.
- [ ] **Green:** harness-integrity passes.
- [ ] **Lived:** a headless Haiku session in the lane is told to run `git push --no-verify --dry-run origin HEAD` and
  reports a permission denial. A dry run never pushes, even if the deny failed. **Control:** the pattern probe above
  showed the same command allowed in a repo without these rules under the same global settings (which run auto mode
  with `Bash(*)` allowed), so a denial in the lane is attributable to this rule and not to the auto-mode classifier.
  Without that control, the denial is not evidence.
- [ ] **Mutant** M-U10: remove one entry from a scratch copy (`HARNESS_SETTINGS`), and (d) goes RED.
- [ ] Commit. **Scope, stated:** these match spellings only. `--no-veri`, `commit -n`, `-c core.hooksPath=` and
  `reset --soft && commit` stay open (refute F7; AB handoff principle 4). The effect check is U13. If the pre-push
  trailer gate ever fires on an unpushed commit, the remedy is Kevin's own terminal, since `commit-msg` now catches
  the trailer at commit time.

**Rollback:** revert.

### U11 — B1: the cwd env var, only if R2 passed

- [ ] **If R2 PASSED:**
  - add `"env": {"CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": "1"}`;
  - add it to `REQUIRED_ENV` and assert it in harness-integrity (red first, then green);
  - **lived:** in a headless lane session, `cd frontend` and then `pwd` in the next call prints the lane root;
  - **mutant:** delete the key, and the test goes RED.
- [ ] **If R2 FAILED** (a worktree subagent's Bash is reset to the clone root): do not land. Record the result in the
  U38 entry as a named gap. AGENTS keeps "use absolute paths".
- [ ] Commit, or record.

**Rollback:** revert.

### U12 — B2: no in-place rewrite of `frontend/src` JS(X) through Bash

**Files:**
- Create `scripts/hooks/src-rewrite-guard.sh`: a prefilter. `IN=$(cat)`; when `$IN` contains `src` (which also catches a hook-input `cwd` of `…/frontend/src`), it pipes `$IN` to the `.mjs`; it always exits 0.
- Create `scripts/hooks/src-rewrite-guard.mjs`.
- `.claude/settings.json`: `PreToolUse` `[{"matcher":"Bash","hooks":[{"type":"command","command":"sh \"$CLAUDE_PROJECT_DIR/scripts/hooks/src-rewrite-guard.sh\"","timeout":5}]}]`, with **no** `onFailure` (fail-open; a recorded divergence from AB handoff principle 5).
- Create `frontend/tests/scripts/src-rewrite-guard.test.js`.

**Interfaces:**
- **Produces:** `decide(command: string, cwd: string, root: string) -> { deny: boolean, reason?: string }`. `cwd` is the hook input's `cwd` field (the estate's `pretooluse-worktree-path-guard.sh` reads the same field); `root` is `git -C <cwd> rev-parse --show-toplevel`, else `CLAUDE_PROJECT_DIR`.
- **What counts as a target:** an operand that, resolved against the effective cwd, is a `.js`, `.jsx` or `.mjs` file under `<root>/frontend/src/`. The effective cwd is the input `cwd`, updated by a leading `cd <dir> &&` or `cd <dir>;` segment of the same command. Matching the written spelling alone misses `sed -i … mesher.js` run in a cwd under `frontend/src/world`, because Bash's cwd persists between calls (AGENTS REPO LAYOUT block) and U11 may never land. Other in-command `cd` forms (subshells, `pushd`, a `cd` after another command) are a stated gap; the guard is fail-open and the Edit/AST rule stays.
- **Rewriting operators:** a target is denied when it appears as the operand of `sed -i` (with any suffix), `perl -pi`
  or `awk -i inplace`, as the redirect target of `>` or `>>`, or as an argument of `tee`.
- **CLI:** reads the hook JSON from stdin and prints
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<reason naming Edit / AST tools>"}}`
  (Context7, the hookify rule engine's deny shape). On allow it prints nothing. Any exception exits 0 silently.

- [ ] Write the failing tests:
  - **DENY:** `sed -i '' s/a/b/ frontend/src/App.jsx`, `sed -i.bak s/x/y/ src/world/mesher.js`,
    `perl -pi -e s/a/b/ frontend/src/a.js`, `cat > frontend/src/new.js <<'EOF'`, `echo x >> src/App.jsx`,
    `printf x | tee frontend/src/a.jsx`, `awk -i inplace '{print}' frontend/src/a.mjs`.
  - **ALLOW, each one token from a deny:** `sed -n 1,5p frontend/src/App.jsx`, `sed -i '' s/a/b/ memory/STATUS.md`,
    `sed -i '' s/a/b/ frontend/src/styles.css`, `sed -i '' s/a/b/ frontend/src/data.json`,
    `grep -n x frontend/src/App.jsx > "$SCRATCH/out.txt"`, `cat frontend/src/App.jsx`.
  - **cwd-relative DENY:** `sed -i '' s/a/b/ mesher.js` with `cwd` `<root>/frontend/src/world`; and
    `cd frontend/src/world && sed -i '' s/a/b/ mesher.js` with `cwd` `<root>`.
  - **cwd-relative ALLOW twins:** the same `sed -i '' s/a/b/ mesher.js` with `cwd` `<root>/docs` (no file under src);
    and `sed -n 1,5p mesher.js` with `cwd` `<root>/frontend/src/world`.
  - The written-path cases above pass `cwd` explicitly: `<root>` for the `frontend/src/…` spellings and
    `<root>/frontend` for the `src/…` spellings. The pipe case's JSON carries a `cwd` field.
  - **Pipe:** spawn `sh scripts/hooks/src-rewrite-guard.sh` with the JSON for the first deny, and the output parses to
    `permissionDecision === 'deny'`. Malformed stdin `{` gives empty stdout and exit 0 (fail-open proven).
    `{"tool_input":{"command":"ls"}}` gives empty stdout without starting node: the prefilter path.
- [ ] Run `npx vitest run tests/scripts/src-rewrite-guard.test.js`. Expected: FAIL.
- [ ] Implement both files and register the hook.
- [ ] **Green:** the test passes; harness-integrity passes (the hook file is tracked, and it is not a context event).
- [ ] **Mutants (U1):**
  - M-U12a: drop the `-i` branch, and the first deny goes RED;
  - M-U12b: deny every `sed`, and the `sed -n` allow goes RED;
  - M-U12c: drop the extension boundary, and the `data.json` allow goes RED;
  - M-U12d: resolve operands against `root` instead of the effective cwd, and the cwd-relative deny goes RED;
  - the identity mutant survives.
- [ ] Commit with an in-file `Mutation-Proof:` line.
- [ ] **Lived:** a headless Haiku session in the lane told to run `sed -i '' 's/a/a/' frontend/src/App.jsx` reports the
  deny reason. Told to run `sed -n 1,2p frontend/src/App.jsx`, it prints two lines.

**Rollback:** revert. The rule goes back to prose (today's `AGENTS.md:204`).

### U13 — M1 (new): the push audit checks the effect of a bypass, not its spelling

**Files:**
- Create `ci/push-audit.sh`. Its reference implementation is Inkbloom's `ci/push-audit.sh`; port its exit contract, not its codehash.
- `.githooks/pre-push`: after `:170` (a sha certified green), call `sh "$REPO_ROOT/ci/push-audit.sh" --stamp "$SHA"`.
  Also append one line per pushed sha to `$(git rev-parse --git-common-dir)/crafty-push-log`:
  `<utc> <short-sha> full|range-only <seconds>`, timed from the start of that sha's certification. This is the
  source for metric (7); U17 reads it before and after.
- `frontend/tests/scripts/_harness.js` `REQUIRED_DENIES`, and `.claude/settings.json`: add `Bash(*push-audit.sh --stamp*)`.
  pre-push runs the script from the git hook, not through the Bash tool, so the deny does not touch it; it stops the
  spelling an agent would use to stamp a `--no-verify` push by hand (spelling-level, like U10).
- `scripts/hooks/session-start-compact.sh`: append the audit line.
- `.claude/settings.json`: a second `SessionStart` entry with `"matcher":"startup"`, running the same script.
- Create `frontend/tests/scripts/push-audit.test.js`.

**Interfaces:**
- `sh ci/push-audit.sh --stamp <sha>` appends `<sha> <tree> <unix-seconds>` to `$(git rev-parse --git-common-dir)/crafty-push-stamps`.
- `sh ci/push-audit.sh` reads `git reflog show --date=unix --format='%H %gd %gs' <ref>` for every `refs/remotes/origin/*` ref,
  keeping entries whose subject is `update by push`. `%gd` under `--date=unix` prints `origin/<b>@{<unix-seconds>}`
  (measured on git 2.55 in scratch), which is where each entry's time comes from; `%gs` alone carries no time.
- The floor is the oldest stamp's time. It bounds HISTORY only: a reflog entry older than the floor predates the audit
  and is skipped. Each entry at or after the floor is matched to a stamp BY SHA, never by time.
- The docblock states the limit: `--stamp` is a plain CLI, so a `--no-verify` push followed by a hand-run `--stamp`
  reads as clean. The deny above narrows the agent's spelling; Vercel Deployment Checks are the real boundary.
- **Exit:** 0 when every audited push is stamped (printing `N push(es) audited, N stamped`). 1 when one is unstamped (naming the sha and the remedy: an STATUS §H row). 3 COULD NOT CHECK: no stamps, no reflog, or 0 pushes since the floor (an empty denominator).
- **Advisory by design.** The enforcement boundary is Vercel Deployment Checks, a dashboard setting only Kevin can
  make (AB handoff §3; ACTIVE_PLAN T6), which goes into STATUS §H in U28.

- [ ] Write the failing tests. The fixture is a `fixtureGit` repo plus a bare remote. Production order is kept:
  pre-push stamps at `:170` BEFORE git updates the remote-tracking ref, so every fixture stamps first and pushes second:
  - `--stamp` followed by a normal push gives exit 0 and `1 push(es) audited, 1 stamped`;
  - `the time comes from the reflog`: a stamp whose time is set one hour AFTER the push (written directly to the
    stamps file) puts that push below the floor, so exit 3 (0 pushes since the floor). This pins that the floor reads
    the entry's time and is not satisfied by a same-second coincidence;
  - a second push made with `--no-verify` and no stamp gives exit 1 and names its sha;
  - stamps exist but nothing was pushed after the floor gives exit 3;
  - no stamps file gives exit 3;
  - `pre-push invokes --stamp after certification`: a file-content check on `.githooks/pre-push` with comments stripped.
- [ ] Run `npx vitest run tests/scripts/push-audit.test.js`. Expected: FAIL.
- [ ] Implement it and wire it in.
- [ ] **Green:** the test passes; harness-integrity passes.
- [ ] **Mutants (U1):**
  - M-U13a: treat any reflog entry as stamped, and the `--no-verify` case goes RED;
  - M-U13b: an empty denominator returns 0, and the exit-3 case goes RED;
  - M-U13c: ignore the floor (audit every entry), and "the time comes from the reflog" goes RED;
  - the identity mutant survives.
- [ ] Commit with an in-file `Mutation-Proof:` line.
- [ ] **Lived:** push the lane branch normally; `sh ci/push-audit.sh` prints 1 or more audited, all stamped.

**Rollback:** revert. The stamps file in `.git/` is machine-local and harmless.

### U14 — B3: the orphan sweep sees lanes and runs at session end (amended F4)

**Files:**
- `frontend/scripts/dev/kill-test-procs.sh`:
  - `:37`: the vite term becomes `Crafty[^ ]*/frontend/node_modules/\.bin/vite`;
  - add `--print-pattern`, which prints the effective PATTERN and exits 0 before any `ps` walk.
- `frontend/tests/scripts/kill-test-procs.test.js`: new cases.
- `.claude/settings.json`: `"SessionEnd": [{"hooks":[{"type":"command","command":"sh \"$CLAUDE_PROJECT_DIR/frontend/scripts/dev/kill-test-procs.sh\"","timeout":10}]}]`, never `--force`. The explicit timeout matters because a SessionEnd hook defaults to 1.5 s (fact 21).

- [ ] Write the failing tests, with no `KTP_*` in the env (this is the point of F4):
  - `sh kill-test-procs.sh --print-pattern` prints a pattern P;
  - `/usr/bin/grep -E "P"` matches:
    - the main path `<x>/Crafty/frontend/node_modules/.bin/vite --port 4178`;
    - a `.claude/worktrees/touch-hold` lane path;
    - the orca lane path recorded in P0;
  - P does not match `<x>/Other/frontend/node_modules/.bin/vite` (the allow case).
- [ ] Run `npx vitest run tests/scripts/kill-test-procs.test.js`. Expected: FAIL (`--print-pattern` is unknown).
- [ ] Implement it and register the hook.
- [ ] **Green:** the test passes; harness-integrity passes.
- [ ] **Mutant** M-U14: restore the original vite term, and the lane case goes RED. The identity mutant survives.
- [ ] Commit with an in-file receipt line.
- [ ] **Lived (owed while load is above 8):** a session that started a lane vite ends, and
  `pgrep -fl node_modules/.bin/vite` shows no process whose PPID is 1. Non-force mode kills only orphans whose ancestor
  walk reaches launchd (`kill-test-procs.sh:20-24`, `:52-69`), so another lane's owned run survives.

**Rollback:** revert.

### U15 — B4: a fresh clone wires its hooks on install, and each lane runs its own

**Files:** `frontend/package.json` `scripts.prepare`: `git -C .. config core.hooksPath .githooks 2>/dev/null || true`.
Create `frontend/tests/scripts/hookspath-prepare.test.js`.

**This changes shared state, deliberately.** The config is shared by every worktree (fact 23). The first
`npm install` or `npm run prepare` anywhere therefore switches main and every lane from main's absolute hooks dir to
each tree's own `.githooks`. That is the estate's recommendation (AB handoff §4: "Use a relative path"). Two consequences:
- A lane cut before a hook fix, such as `wip/perf-t3-features` at `cfea7d41`, then runs its older hook files.
- pre-push's pipeline is already the pushed sha's own (`pre-push:164`), so certification does not regress.

Message `main` before the first run, and record the old value from `git config core.hooksPath` in the commit body.

- [ ] **Red** (a measurement, run before the change): `git config core.hooksPath` prints an absolute path, and a test
  commit in the lane runs main's `.githooks/pre-commit`, not the lane's.

- [ ] Write the failing tests:
  - in a `fixtureGit` repo with a `frontend/` dir, run the `scripts.prepare` string read from the REAL
    `package.json` through `sh` with `cwd` at `fixture/frontend`; afterwards
    `fixtureGit(fixture, 'config', 'core.hooksPath') === '.githooks'`;
  - in a non-git tmp dir the same string exits 0, which is what keeps Vercel and CI safe.
- [ ] Run it. Expected: FAIL (`scripts.prepare` is undefined).
- [ ] Add the script.
- [ ] **Green:** the test passes. The next CI run and the Vercel preview stay green (`npm ci` runs `prepare`).
- [ ] **Mutants:**
  - M-U15a: the value becomes `.git/hooks`, and the first case goes RED;
  - M-U15b: drop `|| true`, and the non-git case goes RED.
- [ ] Commit with an in-file receipt line.

- [ ] **Lived:** after `npm run prepare` in the lane, `git config core.hooksPath` prints `.githooks`. A lane commit then
  runs the lane's own pre-commit; to show it, a lane-only `printf` marker added in scratch appears in the output and is then removed.

**Rollback:** revert. The operator restores the old value with `git config core.hooksPath <value recorded in the commit body>`.

**Order:** U15 lands before U16 and U17. Their lived proofs in the lane exercise the lane's hook files only once the
relative path is in effect; before that, a lane commit runs main's.

### U16 — B5: commit-msg chains the attribution guard, passing the message (amended F12)

**Files:** `.githooks/commit-msg`, before `:21`. The guard is `"$HOME/Code/Agentic-Brain/hooks/git-attribution-guard.sh"`:
- if it is executable, run `GIT_HOOK_NAME=commit-msg "$GUARD" "$1" || exit 1`;
- otherwise print `⚠ attribution guard NOT FOUND — the message is UNCHECKED` to stderr, mirroring `pre-commit:51-56`.

Create `frontend/tests/scripts/commit-msg-chain.test.js`.

- [ ] Write the failing tests. Each runs the REAL `.githooks/commit-msg <msgfile>` with `cwd` an empty-stage `fixtureGit`
  repo and `env: isolatedGitEnv({ HOME: fakeHome, PATH: <stub-bin>:<PATH> })`. The stub `node` first on PATH records
  its argv and exits 0 (the pattern at `prepush-range-gates.test.js:108-112`). Without it, the hook's `:21`
  `exec node …/commit-msg-gate.mjs` runs the real gate, which resolves ROOT from its own location
  (`commit-msg-gate.mjs:31-32`) and runs `git diff --cached` against the REAL repo (`:59`), so a staged gate file in
  the working checkout would turn the clean cases red. The fake guard records its argv and exits 1 when the file at
  `$1` holds the attribution trailer:
  - an attribution message exits 1, **and the fake guard received the message path as `$1`**;
  - a clean message exits 0, **and the stub `node` was called with `commit-msg-gate.mjs` and the message path** (the chain still reaches the gate);
  - a HOME with no guard exits 0, and stderr contains `NOT FOUND`.
- [ ] Run it. Expected: FAIL.
- [ ] Edit the hook.
- [ ] **Green:** the test passes. **Real-guard replay:** `git log -1 --format=%B a0613e43 > "$SCRATCH/m"` piped through
  the real guard exits 0, because quoting the ban is not attribution.
- [ ] **Mutant** M-U16: drop `"$1"`. The fake guard sees no file and exits 0, so the hook passes and the first case goes RED.
- [ ] Commit with an in-file receipt line.
- [ ] **Message the AB owner** (`not_doing`): drop `/.githooks/commit-msg` from the installer's ignore block (`.gitignore:45`), since the file is tracked.

**Rollback:** revert.

### U17 — B7: the commit tier gets fast; the full core moves to a `certify` tier and the push (amended F1, M2)

**Order:** after U9 (harness-integrity is a core step) and U13 (the push audit). **Authority:** this supersedes Kevin's
2026-09-22 direction (`ci/pipeline.sh:18-20`, `pre-push:90`), under his 2026-10-27 grant (DECISIONS.md:83). The entry names that.

**Files:**
- `ci/pipeline.sh`:
  - `:59-73`: the tiers become `commit|push|fast|certify`;
  - core (unguarded): opsec, doc-currency, eslint, gate-shape, killability, cli-guard, and a new `harness-integrity` step;
  - `if [ "$TIER" = "commit" ]; then` compute the staged list OUTSIDE `run_scrubbed`, then
    `step "vitest related" node scripts/ci/related-tests.mjs --staged-list "$STAGED_LIST"; fi`. The list comes from
    `staged_frontend_files` (below), called with the hook's environment intact; only vitest itself runs scrubbed;
  - `if [ "$TIER" != "commit" ]; then` unit, build, bundle `fi`;
  - `:81-83`: `RECEIPT` becomes a DIRECTORY, `$RECEIPT_DIR/crafty-green-trees/`, one file per certified tree;
  - `:174-185`: only `certify` writes a receipt, calling `sh "$ROOT/ci/write-receipt.sh" "$RECEIPT" "$TIER"`.
- `ci/git-env.sh` (U8): add `staged_frontend_files() { git diff --cached --name-only --relative --diff-filter=ACMR; }`,
  run from APP. Two measured reasons (git 2.55, scratch):
  - **paths:** run from `frontend/` WITHOUT `--relative`, git prints repo-relative `frontend/src/a.js` (and files
    outside `frontend/`), which `vitest related` resolves against `frontend/` and so never finds. `--relative` prints
    `src/a.js` and only files under `frontend/`;
  - **index:** under `git commit -a` git runs pre-commit with `GIT_INDEX_FILE=.git/index.lock`, and under
    `git commit <path>` with `.git/next-index-<pid>.lock`. With the variable present, `git diff --cached` listed the
    file; with it unset (what `run_scrubbed` does) it listed NOTHING, in both cases. So this one call must keep
    `GIT_INDEX_FILE`, like `write-receipt.sh`.
- `ci/write-receipt.sh`: takes the tier as its second argument (`usage: write-receipt.sh <receipt-dir> <tier>`) and
  writes `<receipt-dir>/<tree>` holding `<tree> <tier> <utc>`, read back before it claims success. **This file was
  missing from the list:** `:57` hard-codes `commit`, so with only the hook changed, every real receipt would say
  `commit`, pre-push would never match, and every push would certify in full while the hand-written test receipts stayed green.
  There is no pruning: a tree hash names its content, so an old file never speaks for a different tree.
- `frontend/tests/scripts/write-receipt.test.js`: the tier argument, the directory layout, and a refusal without a tier.
- `.githooks/pre-push:110-127`: read `$RECEIPT_DIR/crafty-green-trees/<pushed-tree>`; honour it when its tier field is
  `certify`. Update the docblock at `:90-110`. Because receipts are keyed by tree, a lane's certify run no longer
  evicts another lane's (today one file, `crafty-pipeline-green-tree`, is shared by main and every lane and overwritten
  with `>|` at `write-receipt.sh:57`).
- `.githooks/pre-commit:30-40`: docblock.
- Create `frontend/scripts/ci/related-tests.mjs`:
  - it reads the staged list file (paths relative to `frontend/`) and runs `npx vitest related --run` on the files in it;
  - it prints `N of M test files selected by static import from S staged file(s); dynamic imports, source-grep gates, the full suite, build and bundle run at push and certify`;
  - with 0 staged frontend files it prints `0 selected — SKIPPED, not a pass` and exits 0;
  - with S > 0 staged source files and N = 0 selected, it prints `0 selected from S staged file(s) — nothing imports them statically` so a selection fault is visible in the commit output.
- Create `frontend/tests/scripts/related-tests.test.js` (with an in-file `Mutation-Proof:` line); the index control goes in `git-env-scrub.test.js` (U8).
- `frontend/scripts/ci/gate-table.mjs:128-138`: add `commit: { commit: true, push: false, ci: false }`, plus `DESCRIPTIONS` entries for `vitest related` and `harness-integrity`.
- `frontend/tests/scripts/gate-table.test.js:94`: add `'commit'` to the key pin.
- Create `frontend/tests/scripts/pipeline-tiers.test.js`.
- `prepush-range-gates.test.js`: new cases.
- `.agent/AGENTS.md`: regenerate the GATES block.
- `docs/superpowers/DECISIONS.md`: the entry, via `main`.

- [ ] Write the failing tests:
  - gate-table: `a step inside if [ "$TIER" = "commit" ] renders commit-only`. Run `parseHook` on a 3-line fixture;
    `callersFor` gives `{commit:true,push:false,ci:false}`. RED, because it falls back to core.
  - pipeline-tiers: `parseHook(readFileSync('ci/pipeline.sh'))` gives:
    - `unit + static gates`, `build` and `bundle byte budget` with callers `{commit:false,push:true,ci:true}`;
    - `vitest related` with `{commit:true,push:false,ci:false}`;
    - each static gate with `commit:true`;
    - and `bash ci/pipeline.sh --tier=bogus` exits 2 with a message listing `certify`.
  - prepush: `a receipt written by the commit tier no longer skips the core`, and `a certify receipt for the pushed tree does`.
  - **writer-to-reader seam:** in a fixture, run the REAL `ci/write-receipt.sh <dir> certify` on a clean tree, then the
    REAL pre-push reader on that directory (with the recording `node`/`npm` stubs), and assert the pipeline was called
    with `--range-only`. The hand-written receipts above test the reader only; this tests that the writer's output is
    what the reader honours.
  - `two lanes' receipts coexist`: write certify receipts for trees A and B, then push A: `--range-only`.
  - related-tests: `prints its denominator` and `a docs-only stage selects 0 and says SKIPPED`.
  - **related-tests positive control:** a fixture app where `src/a.js` is imported by `src/a.test.js`; stage a change
    to `a.js`; run `staged_frontend_files` and then `related-tests.mjs` through `run_scrubbed` exactly as the pipeline
    calls them; assert `1 of M test files selected` and that `a.test.js` ran (its title is in vitest's JSON output).
  - **index control:** a fixture repo whose `pre-commit` sources the REAL `ci/git-env.sh` and prints
    `staged_frontend_files`. `git commit -a` and `git commit <path>` both list the changed file. Its twin, calling the
    same function inside `run_scrubbed`, lists nothing, which is the defect this guards.
- [ ] Run `npx vitest run tests/scripts/gate-table.test.js tests/scripts/pipeline-tiers.test.js tests/scripts/prepush-range-gates.test.js tests/scripts/write-receipt.test.js tests/scripts/related-tests.test.js tests/scripts/git-env-scrub.test.js`. Expected: FAIL.
- [ ] Implement it. Run `node scripts/ci/gate-table.mjs --write`, then `node scripts/ci/doc-currency.mjs`.
- [ ] **Green:** the tests pass.
- [ ] **Mutants (U1):**
  - M-U17a: delete `CALLERS.commit`, and the gate-table case goes RED;
  - M-U17b: move `build` back to core, and pipeline-tiers goes RED;
  - M-U17c: pre-push accepts `GREEN_TIER = commit`, and the prepush case goes RED;
  - M-U17d: `write-receipt.sh` writes the literal `commit` again, and the writer-to-reader seam case goes RED;
  - M-U17e: drop `--relative` from `staged_frontend_files`, and the related-tests positive control goes RED;
  - M-U17f: call `staged_frontend_files` inside `run_scrubbed`, and the `git commit -a` index control goes RED;
  - the identity mutant survives.
- [ ] **Lived:**
  - **(1) Timing.** A one-file docs commit in the lane takes T_new. Pass when T_new ≤ T_commit / 4 at a load within
    ±25% of P0's, with the denominator line printed.
  - **(1b) Selection.** The timing alone gets greener if the tier tests nothing, so: stage a one-line comment edit to
    `frontend/scripts/ci/related-tests.mjs` (imported by its own test; a `frontend/src` edit is forbidden by the Global
    Constraints), run `sh ci/pipeline.sh --tier=commit`, and require `1` or more selected with the test file named in
    the output. Then unstage it and restore the file from its `cp` backup.
  - **(2) Certified push.** Run `sh ci/pipeline.sh --tier=certify` in the background on a clean tree, then `git push`;
    pre-push prints `offline core already certified on this exact tree`.
  - **(3) Uncertified push.** A push without certify runs the full core in the detached worktree.
  - **(4) Push cost (metric 7).** From `crafty-push-log` (U13) and P0's T_push: push wall time and the daily count of
    full-path pushes, before and after. A rise in full-path pushes means lanes are not certifying before they push;
    the AGENTS push line (U22) says to run certify in the background before a push.
- [ ] Commit with a `Mutation-Proof:` trailer.
- [ ] Message `main` with the DECISIONS entry text. It names:
  - what is lost: intermediate commits on main no longer carry a unit or build result, and lazy-panel dynamic imports
    are invisible to `vitest related`;
  - the mitigations: the certify receipt, CI on the tip, the push audit, and Vercel Deployment Checks (owed to Kevin).

- [ ] **Tranche B review:** the fresh-process `/code-review xhigh` over tranche B's range (Global Constraints).

**Rollback:** revert the commit, then add a DECISIONS entry naming this one as reversed. The receipt format DOES
change (one file per tree under `crafty-green-trees/`, written with the tier argument), so a revert restores the
single-file writer and reader together. The directory left in `.git/` is machine-local and is ignored by the
reverted reader.

### Tranche C — the instruction files

### U18 — C1: the GATES block says what each gate stops, in one clause

**Files:** `frontend/scripts/ci/gate-table.mjs`: `DESCRIPTIONS` (:52-70), and the header at `:163` (delete `(offline core, 69s)` and the
"they used to be" sentence). Each backstory moves into its gate script's docblock wherever it is not already there.
Reword the prod-smoke line as `the only CI harness that boots the production bundle; most visual probes drive the dev
server`, because the old claim is false: `ipad-probe.mjs:117` and `gpu-cost-probe.mjs:67` serve the preview build (refute C1).
Also `frontend/tests/scripts/gate-table.test.js` and `.agent/AGENTS.md` (regenerated).

- [ ] Write the failing tests:
  - `every description is one clause of 110 chars or fewer`;
  - `the rendered block carries no hand-typed duration or count`: `renderBlock(...)` does not match `/\(\D*\d+\s?s\)|all \d+ probes/`.
- [ ] Run `npx vitest run tests/scripts/gate-table.test.js`. Expected: FAIL.
- [ ] Rewrite, then run `node scripts/ci/gate-table.mjs --write && node scripts/ci/doc-currency.mjs`.
- [ ] **Green:** the tests pass, and the GATES block measures about 2.5 KB (`wc -c` of the marker slice).
- [ ] **Mutants:**
  - M-U18a: re-add `(offline core, 69s)`, and the test goes RED;
  - M-U18b: lengthen one description to 111 characters, and the test goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U19 — C2: a generated stack line, 0.x by major.minor (amended F13)

**Files:**
- `frontend/scripts/ci/measure.mjs` `renderBlock` (:81-94): collapse the tolerance text at `:90` to one line, and add
  `Stack (from frontend/package.json): react 19 · three 0.172 · …`.
- `frontend/scripts/ci/doc-currency.mjs`: the MEASURED check compares the stack tokens exactly.
- `frontend/tests/scripts/measure.test.js`.
- `.agent/AGENTS.md` MEASURED block.

**Interfaces:**
- **Produces:** `stackLine(pkg: object, allow: string[]) -> string`. It renders a version of 1.0 or higher as its major
  and a 0.x version as `major.minor`. Ranges are stripped of `^` and `~`.
- The allow list is the harness plan's 14 packages.
- `parseBlock` invariants stay: `**N source files`, `/ N LOC**`, backticked `.jsx?` names followed by LOC. Backticked
  `.js` names are kept out of the stack line.

- [ ] Write the failing tests:
  - `three ^0.172.0 renders 0.172`;
  - `vitest ^4.1.12 renders 4`;
  - `@dimforge/rapier3d-compat 0.19.2 renders 0.19`;
  - `a 0.x minor bump is drift`: in a fixture, 0.172 → 0.173 makes the check red, while 4.1 → 4.2 does not.
- [ ] Run `npx vitest run tests/scripts/measure.test.js`. Expected: FAIL.
- [ ] Implement it, then run `node scripts/ci/measure.mjs --write && node scripts/ci/doc-currency.mjs`.
- [ ] **Green:** the tests pass.
- [ ] **Mutant** M-U19: render every version as its major, and the 0.x drift case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U20 — D1: `opsec-scan --rekey`, including declared content splits (amended F5)

**Files:** `frontend/scripts/ci/opsec-scan.mjs` and `frontend/tests/scripts/opsec-scan.test.js`.

**Interfaces:**
- **Produces:** `rekey(ledger, { renames: [from, to][], splits: { from: string, to: string[] }[] }, counts: Record<file, number>) -> { ledger, ok: boolean, reason?: string }`.
  - `counts` holds the live home-path findings per file.
  - A rename moves the key.
  - A split lets debt move from `from` to the listed `to` files, provided:
    - for each split, the sum of the new caps over `{from, ...to}` is at most the sum of the old caps;
    - every gaining file is a staged add, or a rename target of its declared source.
  - Every other file keeps its old cap.
  - There is no separate `_total` rule: the three rules above already make a rise impossible (every file's cap is
    either unchanged, moved by a rename, or inside a split whose sum cannot grow), so a `_total` check could never be
    the one that refuses, and a mutant deleting it would survive. `_total` is recomputed as the sum on write.
- **CLI:** `--rekey [--split from:to1,to2]`. Renames are read from `git diff --cached --name-status -M`. On success it
  writes the ledger; otherwise it exits 1 with the reason.

- [ ] Write the failing tests:
  - a rename passes and the key moves;
  - a rename plus 1 new home path is refused;
  - a declared split (7 lines → 4 + 2 + 1) passes;
  - a declared split plus 1 extra is refused;
  - an undeclared new file holding a home path is refused, never absorbed;
  - `_total` rising is refused (it is refused by the per-split rule; the case stays as a property check over the whole ledger);
  - `_total` on write equals the sum of the per-file caps.
- [ ] Run the tests. Expected: FAIL.
- [ ] Implement `rekey` and the CLI flag.
- [ ] **Green:** the tests pass.
- [ ] **Mutants (U1):**
  - M-U20a: the per-split comparison allows the old sum plus 1, and "split plus 1 extra" and "`_total` rising" go RED;
  - M-U20b: treat undeclared adds as rekeyable, and the undeclared case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert. Moves then go back to blocking, which is today's state.

### U21 — A1 remainder + D4 (loop half): retire the dormant loop surfaces (amended F3)

> **PAGE HALF DONE 2026-10-28** on `fix/page-cap-informational`, in the commit that archives it (DECISIONS 2026-10-28
> item 12): `LOOP-PROGRESS.html` moved to `docs/archive/LOOP-PROGRESS-2026-10-28.html` (a dated name in
> `docs/archive/`, not `docs/archive/2026-Q3/` as drafted below), its `loop-progress` surface removed from
> `.artifact-sync.json`, and LOOP-CHARTER.md (§1 dashboard line, §6.5 step 2b), LOOP-KERNEL-PROMPT.md (the
> session-close lines) and INDEX.md re-pointed. doc-currency went RED (2 DANGLING) on the move before the re-points,
> which is M-U21's defect reproduced by hand rather than through a `doc-currency-wiring.test.js` case. No test
> pinned the surface list, so there was no pin to change. **Still open:** `KEVIN-REVIEW.html` and the kernel's own
> archival, with the read-order, CANONICAL and AGENTS.md re-points below.

**Files:**
- `git mv` `docs/superpowers/LOOP-PROGRESS.html`, `docs/superpowers/KEVIN-REVIEW.html` and `docs/superpowers/LOOP-KERNEL-PROMPT.md` to `docs/archive/2026-Q3/`. The kernel gets a first line: `DORMANT — restore with git mv docs/archive/2026-Q3/LOOP-KERNEL-PROMPT.md docs/superpowers/`.
- `docs/superpowers/.artifact-sync.json`: remove `loop-progress` (:13-17).
- `frontend/tests/gates/artifact-currency-gates.test.js:52`: the pin.
- `docs/superpowers/LOOP-CHARTER.md:87`, `:171`, `:355`, `:370`: re-point to the archived path, and drop §6.5 step 2b's LOOP-PROGRESS obligation.
- `.agent/AGENTS.md:304`, `:316`: re-point the kernel citations.
- `docs/superpowers/INDEX.md:20`.
- `frontend/scripts/ci/doc-currency.mjs:42`: drop the kernel from CANONICAL.
- `frontend/scripts/ci/read-order.mjs`: drop the kernel from `SURFACES`.
- `frontend/tests/scripts/read-order.test.js:37`: change the pin from `toBe(3)` to `toBe(2)`.

- [ ] Change the two pins first (read-order SURFACES 2; artifact-currency 2 surfaces). Run
  `npx vitest run tests/scripts/read-order.test.js tests/gates/artifact-currency-gates.test.js`. Expected: FAIL.
- [ ] Do the moves and re-points in this one commit. Use `--rekey` if any moved file is ledgered.
- [ ] **Green:** the tests pass, and `node scripts/ci/doc-currency.mjs`, `node scripts/ci/artifact-currency.mjs` and
  `node scripts/ci/read-order.mjs` all pass. doc-currency is the check A1's own verify lacked (F3).
- [ ] **Mutant** M-U21: leave `LOOP-CHARTER.md:87` unedited, and doc-currency goes RED (DANGLING). This is F3's defect, reproduced.
  Run it through U1 with `doc-currency-wiring.test.js` as the spec (a case running `run({ only: ['dangling'] })` on
  the real tree, added in this commit), so it carries the identity control.
- [ ] Commit with `Mutation-Proof:` (the artifact-currency gate test).

**Rollback:** revert. The `git mv` moves back.

### U22 — C3 + M6: AGENTS is rewritten to the facts a model cannot derive (amended F6)

**Files:**
- `.agent/AGENTS.md`.
- `docs/superpowers/LOOP-CHARTER.md:60` (the Method citation) and `:316-318` (the hygiene pointer).
- Create `frontend/scripts/ci/rules-index.mjs` (`BEGIN RULES` / `END RULES`; `--write`; `checkBlock(md) -> {ok, reason}`).
- `frontend/scripts/ci/doc-currency.mjs`: import `checkBlock` next to the gate-table import at `:26`. Add the AGENTS byte cap: warn above 12,000 and fail above 16,000.
- Create `frontend/tests/scripts/agents-shape.test.js` and `frontend/tests/scripts/rules-index.test.js`.
- `.opsec-ledger.json`: `.agent/AGENTS.md` goes from 3 to 0.
- DECISIONS and one STATUS row, both via `main`.

**Content:** target_shape item 1, with F6:
- **Layout:** ROOT = `git rev-parse --show-toplevel`, APP = ROOT/frontend, and "restate ROOT/APP in every delegation brief".
- **Stack:** the 4 bullets.
- **Hard rules,** each naming its enforcer, or "no gate":
  - game-loop isolation (no gate; review);
  - no in-place rewrite of `src` JS(X) (U12 hook);
  - the design-language lock and no emoji (`tests/gates/static-gates.test.js`);
  - capture guards reset, never early-return (`tests/gates/capture-guard-timing-gates.test.jsx`);
  - done means proven to RUN, plus "what still passes if the feature is deleted" (no gate);
  - one plan doc per milestone (no gate; D7 banners);
  - no attribution: the U16 commit-msg guard for messages, opsec-scan for files. Not the pre-commit guard, which checks identity only (F6);
  - fix-ups are new commits (U10 deny);
  - the trailers (`mutation-proof-trailer`, `baseline-trailer`);
  - a violated rule gets a checkpoint or a deterministic layer, not more prose;
  - **one local line:** work over 2 phases or 5 artifacts writes its task table in `memory/ACTIVE_PLAN.md` first.
    Antigravity and Gemini readers never load the global file (F6).
- **Gates:** the generated block, plus the e2e, visual and `test:look` rows and 3 visual one-liners: port 4178 with
  `--strictPort`; capture mode suppresses weather, mobs, NPCs and particles; read `provenance.ua` and re-measure.
- **Process hygiene,** 3 bullets: the `_serve.mjs` and SessionEnd sweep; close-surface is denied; check `uptime` and R-state before blaming a gate.
- **Models:** Kevin's reviewer directive **verbatim** (today's `:213-217` quote) as the effort ceiling, AND the decided
  default at that ceiling, cited: a fresh-process `/code-review xhigh` per change range plus one pointed adversarial
  reviewer at xhigh on runtime seams (DECISIONS.md 2026-10-27, :130-131). The refute's F6 read this default as a
  ceiling turned into a mandate; it is a decision of record, consistent with the ceiling, so both are carried.
- **One line on the launch root** (M4, from R3's sentinel result): hooks and denies bind only to sessions rooted at
  ROOT or a lane. If R3's positive control failed, the line says the limit is unmeasured instead.
- **One line on pushing:** run `sh ci/pipeline.sh --tier=certify` in the background on a clean tree before a push, so
  the push takes the receipt path (U17).
- **Where state lives:** the auto-memory line, the generated RULES block (M6) and the READ-ORDER.
- **Compaction and resume,** about 0.7 KB, and a 1-line `/loop` pointer.
- The `no instrument` capability-negative gets its dated denominator (refute C4 note).
- **Not done:** the kernel `:151` re-point is skipped, because the kernel is archived (U21).

- [ ] Write the failing tests:
  - `agents-shape`:
    - no home path;
    - all 4 marker pairs (MEASURED, GATES, READ-ORDER, RULES);
    - a `Hard rules` section where every bullet contains `enforcer:` or `no gate`;
    - the layout line contains `git rev-parse --show-toplevel`;
    - a `Compaction` heading;
    - Kevin's quote `only up to xhigh reviewers (if any needed) for Crafty works`;
    - the Models section also names `/code-review xhigh` and cites `DECISIONS.md`;
    - `wc -c` is 16,000 or less.
  - `rules-index`: the block lists each `.claude/rules/*.md` with its globs, and a fixture with a new rule file is stale.
- [ ] Run `npx vitest run tests/scripts/agents-shape.test.js tests/scripts/rules-index.test.js`. Expected: FAIL on today's file (:14 absolute path; 34,487 B; no RULES block).
- [ ] Record the pre-trim SHA. Rewrite the hand-written sections and leave the generated pairs untouched. Run `node scripts/ci/rules-index.mjs --write`.
- [ ] **Green:**
  - the tests pass;
  - `node scripts/ci/doc-currency.mjs` passes;
  - `node scripts/ci/opsec-scan.mjs --all` passes;
  - `npx vitest run tests/scripts/read-order.test.js tests/scripts/doc-anchors.test.js` passes;
  - `wc -l` is 200 or fewer and `wc -c` is 12,000 or fewer.
- [ ] **Mutants (U1):**
  - M-U22a: re-insert an absolute ROOT, and agents-shape and opsec both go RED;
  - M-U22b: strip `enforcer:` from one hard rule, and agents-shape goes RED;
  - M-U22c: append 5 KB, and the cap goes RED;
  - M-U22d: add a rule file without regenerating, and the `rules` case of `doc-currency-wiring.test.js` (added in this
    commit, U8a) goes RED. The AGENTS byte cap gets a wiring case too (warn above 12,000, fail above 16,000, on a
    fixture AGENTS), so deleting its call from doc-currency is caught;
  - M-U22e: drop `/code-review xhigh` from the Models section, and agents-shape goes RED.
- [ ] **Review:** one `adversarial-reviewer-kz` stage at xhigh, briefed to REFUTE. For every deleted section, is the fact
  derivable from the code or held by DECISIONS, a rule or a docblock? It samples 10 deletions; any section that fails
  is restored.
- [ ] **Lived:** R1's `/context` script, run before and after, shows the memory-file row for AGENTS shrinking. It
  counts only when both outputs show the memory-file row at all (R1's presence control); otherwise record COULD NOT
  CHECK and rely on `wc -c`.
- [ ] Commit with `Mutation-Proof:`. Message `main` with:
  - the DECISIONS entry: the pre-trim SHA, a disposition table with one row per deleted section (where its fact now
    lives, or "derivable"), and "restore any section with `git show <sha>:.agent/AGENTS.md`";
  - the STATUS ▢ row for the open cleanup/accretion question. The Dependabot half goes, because `.github/dependabot.yml` is tracked.

**Rollback:** `git show <pre-trim-sha>:.agent/AGENTS.md`, restored one section at a time, or revert the commit.

### U23 — C4: gates-and-probes becomes a checklist; its history becomes a record

**Files:**
- `.claude/rules/gates-and-probes.md`: 8,000 B or less, a checklist of about 80 lines.
- Create `docs/superpowers/GATE-INCIDENTS.md`, holding verbatim: the table at `:20-40`, the table at `:49-54`, and the DEV/PROD section at `:184-233`.
- `docs/superpowers/INDEX.md`: one line for the new file.
- `frontend/scripts/ci/doc-currency.mjs`: each `.claude/rules/*.md` warns above 6,000 B and fails above 8,000 B.

**The checklist:**
- print and assert the denominator;
- presence before absence;
- mutation-prove it, restoring from `cp`;
- reference values vary on every weighted axis;
- make the subject drivable;
- check both sides of a producer/consumer seam;
- a swallowed wait means grepping the flag's other consumers;
- prove the entry point is REACHED;
- the siting rule;
- ports via `probePort`;
- kill what you launch.

Drop every embedded count. Replace "no instrument" with `as of 2026-10-27, surfaces checked: cmux surfaces (close-preview-tabs.sh); not tried: orca computer (computer-use skill), claude-in-chrome tabs_context_mcp` (AB `rules-global/rule-authoring.md`, capability-negatives).

- [ ] Add the cap first, then run `node scripts/ci/doc-currency.mjs`. Expected: FAIL (18,571 > 8,000).
- [ ] Trim the rule and write GATE-INCIDENTS.
- [ ] **Green:** doc-currency passes, and harness-integrity (c) still passes (the globs are unchanged).
- [ ] Add the rule-cap wiring case to `doc-currency-wiring.test.js` (U8a): a fixture rule file of 8,001 B fails, 6,001 B warns, 5,999 B passes.
- [ ] **Mutant** M-U23: restore the incident table into the rule, and the cap goes RED (spec: the real-tree `rule-cap` wiring case, through U1).
- [ ] **Mutant** M-U23b: delete the rule-cap call from doc-currency, and the fixture wiring case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U24 — C5: a root `AGENTS.md` for Codex, only if R1 passed (amended F8)

- [ ] **If R1 PASSED** (no second memory-file row):
  - run `ln -s .agent/AGENTS.md AGENTS.md`;
  - add to harness-integrity, red first: `a root AGENTS.md, if present, is a symlink whose target is .agent/AGENTS.md`;
  - `node scripts/ci/opsec-scan.mjs --all` is clean, since U3 reads the relative target;
  - doc-currency passes;
  - **mutant:** retarget the link to `CLAUDE.md`, and the test goes RED;
  - commit.
- [ ] **If R1 FAILED** (Claude Code loads both): do not land. The question goes to Open questions.

**Rollback:** `git rm AGENTS.md`.

- [ ] **Tranche C review:** the fresh-process `/code-review xhigh` over tranche C's range (Global Constraints), before the midpoint push.

### Midpoint checkpoint (after U24)

- [ ] Regenerate `docs/superpowers/era-review.html` and `docs/superpowers/sota-audit.html` from the current state, and
  republish each to its SAME url. First check that the current claude.ai account owns them (F3, PLAUSIBLE: account
  rotation). If it does not, record it and do not bump the sha. Then run `node scripts/ci/artifact-currency.mjs --sync era-review`
  and the same for `sota-audit`. Tranche D adds about 14 more commits, and the window is 30.
- [ ] Push the lane branch, which pre-push certifies. Hand the merge to `main` (ff-only from the main checkout). CI succeeds on main.
- [ ] Checkpoint: `/clear` or a fresh session rooted in the lane. Re-read this plan and `git status -sb`.

### Tranche D — the doc corpus (every unit announced to `main` before and after)

### U25 — D8: closed records move to the archive

**Files:** see the harness plan's D8 list. Excluded: `frontend/src/game/cameraKick.js:7`, which becomes a STATUS ▢ row for
the next `src` lane (Design, decisions). Kept in place: `memory/perf/*.json`,
`research/2026-06-15-crafty-agentic-e2e-testing.md`, `specs/` and `PERF-PROTOCOL.md`.

- [ ] Per batch, run by a mechanical lane (`claude-sonnet-5-5`, effort high):
  - for every stem, `git grep -n <stem>` across ALL tracked files, not only `.md`. That list is the citer set,
    including LOOP-CHARTER (6), ACTIVE_PLAN (2) and AGENTS (4) (refute D8);
  - `git mv` into `docs/archive/2026-Q2|Q3/` or `memory/archive/2026-Q2/`;
  - edit the citers;
  - run `opsec-scan --rekey`.
- [ ] `git rm` the 4 raw audit JSONs, but only after `git grep -n <basename>` shows no consumer outside docs. Drop their
  ledger keys; the ledger falls by 244 (65+2+147+30).
- [ ] **Per-batch check:** `node scripts/ci/doc-currency.mjs` and `node scripts/ci/opsec-scan.mjs --all` both pass, and
  `git grep -n <stem> -- ':!docs/archive' ':!memory/archive'` returns only citations by name. The ledger `_total` falls.
- [ ] One commit per batch. Moves carry no mutant; the doc-currency DANGLING check is the gate that reds when a citer is missed.

**Rollback:** revert per batch.

### U26 — D7: plan and spec status banners, scoped (amended F15)

**Files:**
- Create `frontend/scripts/ci/plan-status.mjs`.
  - **Produces:** `checkBanner(md) -> 'ACTIVE'|'SHIPPED'|'PARKED'|'SUPERSEDED'|'DESIGN-OF-RECORD'|null`, which reads the first 10 lines.
  - **Produces:** `inScope(path) -> boolean`: true when the filename date is 2026-09-01 or later.
  - It renders the INDEX plans table between markers, and prints `N in scope of M`.
  - It does **not** warn on "cited but not SHIPPED"; F15 says that would fire on every ACTIVE plan.
- `frontend/scripts/ci/doc-currency.mjs`: call `plan-status.mjs`.
- Create `frontend/tests/scripts/plan-status.test.js`. Add a `plan-status` wiring case to `doc-currency-wiring.test.js` (U8a): a fixture plan in scope with no banner makes `run({ only: ['plan-status'] })` error, and its bannered twin passes.
- The September plans' banners, back-filled from a per-plan `git log --grep` check. `2026-09-*-de-monolith*` is PARKED, and `world-purpose-sota` is DESIGN-OF-RECORD.

- [ ] Write the failing tests:
  - a banner present passes;
  - a missing banner in scope fails;
  - an unknown word fails;
  - an out-of-scope file is ignored and counted;
  - 0 files in scope gives exit 3.
- [ ] Run them. Expected: FAIL.
- [ ] Implement it, back-fill the banners, run `node scripts/ci/plan-status.mjs --write`, then doc-currency.
- [ ] **Mutant** M-U26: `inScope` returns true for everything, and the out-of-scope case goes RED.
- [ ] **Mutant** M-U26b: delete the `plan-status` call from doc-currency, and the wiring case goes RED.
- [ ] Commit with `Mutation-Proof:`. **Order:** after U25, so the June plans are already archived.

**Rollback:** revert.

### U27 — F2: queue-ledger counts any queue's rows, and an empty queue cannot pass

**Files:** `frontend/scripts/ci/queue-ledger.mjs` (:41, :44-60, :85-125); `frontend/tests/scripts/queue-ledger.test.js`;
`docs/superpowers/.queue-ledger.json`.

**Interfaces:**
- `QUEUES` becomes `[{ path, section: RegExp, rows: RegExp[], stated: RegExp }]`, and `classify(md, spec)` uses it.
  `rows` lists every item SHAPE the document really uses (bullet and table), and `stated` is the regex for the
  document's own item count.
- **Markers:** `▢` open, `▣` in flight, `▣✓` done, `⊘` dismissed, matched longest-first so `▣✓` is never read as `▣`.
  `memory/STATUS.md:103` defines all four; a `▣` item is IN FLIGHT, never UNMARKED.
- HOLISTIC keeps its current regexes, `SECTION` at :53 and `FINDING` at :44, with `stated` = `/\*\*Confirmed:\s*(\d+)\*\*/`.
- **Three failure modes:**
  - a queue whose section yields 0 rows exits 3, `COULD NOT CHECK — 0 rows in <path>`;
  - a queue with no ledger key fails, `new queue <path> has no frozen count — run --write once, in its own commit`;
  - a queue whose parsed item count differs from its stated count fails, `<path>: parsed N items, the doc states M`.
    Exit 3 on an empty queue cannot catch an UNDERCOUNT (F2's defect again, through a shape the regex does not know),
    because the queue is not empty; only parsed == stated can.
- The denominator always prints, per queue and per shape (`STATUS: 64 bullet · 0 table`).
- STATUS's spec, used by U28: section `/^##\s*2\.\s*THE REGISTRY/`; rows: top-level bullets
  `/^[-*]\s+(▣✓|▣|▢|⊘)?\s*\*\*/` (the shape `memory/STATUS.md:106` and `doc-anchors.mjs:66` use; measured today in
  §2: 64 marker bullets, 3 of them `▣`; 14 unmarked `**` bullets; 0 marker table rows) and table data rows `/^\|\s*(▣✓|▣|▢|⊘)?\s*\*\*/`; stated `/\*\*Items:\s*(\d+)\*\*/`,
  a header U28 adds.

- [ ] Write the failing tests:
  - a STATUS-shaped fixture with BOTH shapes (bullet items and a table) counts its marked and unmarked rows in each;
  - a `▣` item counts as in flight, not unmarked, and a `▣✓` item as done;
  - one unmarked row more than the frozen count fails;
  - 0 rows gives exit 3;
  - an unknown queue key fails;
  - a fixture stating `**Items: 3**` with 3 parsable items and 1 item in an unknown shape fails parsed != stated;
  - the existing HOLISTIC cases still pass.
  - `queue-ledger.test.js:71-76` changes from `QUEUES[0]` only to EVERY entry of `QUEUES`: for each, read the real
    file and assert parsed == stated. Today it reads QUEUES[0], which U31 removes (HOLISTIC is archived), so the only
    parser-against-document check would otherwise disappear.
- [ ] Run `npx vitest run tests/scripts/queue-ledger.test.js`. Expected: FAIL.
- [ ] Implement it.
- [ ] **Mutants (U1):**
  - M-U27a: restore `was !== undefined &&` (:119), and the unknown-key case goes RED;
  - M-U27b: an empty section returns 0, and the exit-3 case goes RED;
  - M-U27c: drop `▣` from the marker set, and the in-flight case goes RED;
  - M-U27d: drop the bullet shape from STATUS's `rows`, and the both-shapes case goes RED;
  - M-U27e: skip the parsed-vs-stated comparison, and the undercount case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U28 — D2: STATUS rebuilt as the registry (amended F2, M1). Owner: `main`

**Files:**
- `memory/STATUS.md`, 30,000 B or less, keeping doc-currency's 5 required tokens (`doc-currency.mjs:149-155`).
- Create `memory/archive/STATUS-registry-2026-06-to-08.md` (verbatim closed sections; `--rekey --split`).
- `git mv docs/superpowers/KEVIN-REVIEW-BATCH.md docs/archive/2026-Q3/KEVIN-REVIEW-BATCH-2026-05-to-09.md`, re-pointing its citers (including the DECISIONS protocol at :8-11: asks go to STATUS §H and answers to DECISIONS).
- `.queue-ledger.json`: add the STATUS key with `--write` in its own commit.
- The registry section opens with a `**Items: N**` header (U27's `stated`); queue-ledger fails when it disagrees with the parsed count.

**What §H holds:** only items bound to Kevin by mechanism:
- the ultrareview keystroke;
- money;
- force-push;
- the refused worktree removal;
- **Vercel Deployment Checks** (M1; ACTIVE_PLAN T6);
- any unstamped push U13 reports.

**Harvest:**
- STATUS §2's open rows;
- the HOLISTIC heldf-probe row;
- the unfinished sota-2026-09 QUEUE and OPEN-ITEMS rows, with their Q ids;
- the open ACTIVE_PLAN T rows;
- OVERNIGHT's "Blocked on you";
- the undecided KEVIN-REVIEW-BATCH asks;
- the upstream-750 post;
- the U22 cleanup row;
- the U25 `cameraKick.js:7` row.

- [ ] **Builder:** an Opus 5.5 xhigh lane harvests the rows and checks each against code. **Reviewer:** an
  `adversarial-reviewer-kz` stage at xhigh samples 10 rows against code; refuted rows are corrected.
- [ ] **Red:** with the STATUS queue key seeded, an unmarked registry row fails queue-ledger. This is F2's defect, now catchable.
- [ ] **Green:**
  - `node scripts/ci/doc-currency.mjs` passes;
  - `node scripts/ci/queue-ledger.mjs` passes and prints the STATUS row count, which is not 0;
  - `node scripts/ci/opsec-scan.mjs --all` passes;
  - `npx vitest run tests/scripts/doc-anchors.test.js` passes;
  - `wc -c memory/STATUS.md` is 30,000 or less.
  - The refute's `grep -c 2026-10` check is dropped: it passes merely by writing a date.
- [ ] Commit, from `main` or with its explicit go-ahead.

**Rollback:** revert. The archive file and the moved batch come back.

### U29 — D5: the umbrella plan is the one campaign queue. Owner: `main`

**Files:**
- `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md`: milestone items get `▢/▣/▣✓/⊘` markers and an `**Items: N**` header. The shape is agreed with `main` first.
- `docs/superpowers/sota-2026-09/PLAN.md` and `QUEUE.md`: a `CLOSED 2026-10-27; open rows now live in STATUS` banner. `PLAN.md:56` cites a nonexistent `LOOKS.md`; the refute said :55, and it measures :56.
- `queue-ledger.mjs` QUEUES gains the umbrella plan with BOTH of its real shapes: the Phase 0 table's data rows
  (`| 0a | … |`) and the Phase 1-3 milestone BULLETS (`- **Name** (roadmap N): …`, umbrella plan :64-98, under
  `## Phase \d` headings). A table-only regex would count Phase 0 and silently skip every Phase 1-3 milestone.

- [ ] **Red:** an unmarked milestone row fails queue-ledger; 0 rows gives exit 3; and the real umbrella plan's parsed
  count equals its `**Items: N**` (Phase 0 rows plus Phase 1-3 bullets), through U27's every-queue test.
- [ ] **Green:** queue-ledger and doc-currency pass.
- [ ] Commit.

**Rollback:** revert.

### U30 — D3: the ACTIVE_PLAN cap, warn first

**Files:**
- Create `frontend/scripts/ci/cursor-cap.mjs`. **Produces:** `checkCursorCap(md) -> { level: 'ok'|'warn'|'fail', reasons: string[] }`. It warns above 15,000 B, above 200 lines, or with more than one cursor heading; it fails above 30,000 B.
- Create `frontend/scripts/ci/archive-cursor.mjs`. It moves every `CURSOR` / `RESUME` block except the newest, verbatim, to `memory/archive/ACTIVE_PLAN-superseded-2026-08-to-10.md`, and redacts the two dead scratchpad home paths.
- `doc-currency.mjs`: call `checkCursorCap`.
- Create tests `cursor-cap.test.js` and `archive-cursor.test.js`. Add a `cursor-cap` wiring case to
  `doc-currency-wiring.test.js` (U8a): a 31 KB fixture ACTIVE_PLAN errors under `run({ only: ['cursor-cap'], enforce: { cursorCap: true } })` and warns with `cursorCap: false`.

- [ ] Write the failing tests:
  - 3 cursor blocks: the newest stays, and 2 are moved byte-identical apart from the redaction;
  - two cursor headings warn;
  - 31 KB fails;
  - 14 KB with one cursor is ok.
- [ ] Run them. Expected: FAIL.
- [ ] Implement it. **Commit 1 ships with `fail` mapped to warn** (`CURSOR_CAP_ENFORCE = false`), because main's
  ACTIVE_PLAN is 58 KB and an enforcing cap would block every commit in main.
- [ ] Message `main` to run `node frontend/scripts/ci/archive-cursor.mjs` in its own checkout and carry any still-open items to STATUS first.
- [ ] **Commit 2,** once `wc -c memory/ACTIVE_PLAN.md` is under 30,000 on main: set `CURSOR_CAP_ENFORCE = true`. The opsec ledger falls by 2.
  Red first: add `the shipped cap enforces` (`expect(CURSOR_CAP_ENFORCE).toBe(true)`) to `cursor-cap.test.js` and see
  it fail before the flip. Without it, a flag left false forever stays green under every other test.
- [ ] **Mutant** M-U30: drop the `fail` branch, and the 31 KB case goes RED. Commit with `Mutation-Proof:`.
- [ ] **Mutant** M-U30b: delete the `checkCursorCap` call from doc-currency, and the wiring case goes RED.

**Rollback:** set the flag to false, or revert.

### U31 — D4 (order half): the read order is 5 entries on one surface

**Files:**
- `frontend/scripts/ci/read-order.mjs` ORDER: (1) git main + CI; (2) ACTIVE_PLAN; (3) STATUS, whose §3 names the campaign plan; (4) DECISIONS, before deciding; (5) INDEX, where anything unmapped is not current.
- `SURFACES` becomes `['.agent/AGENTS.md']`, and the charter's rendered block is deleted.
- `read-order.test.js:36-37`: ORDER `toBe(5)`, SURFACES `toBe(1)`.
- `docs/superpowers/LOOP-CHARTER.md`: the 2026-07-13 mandate block becomes a pointer to DECISIONS 2026-10-27. Keep §3, §4, §6.4, §6.5 and §8 (`doc-anchors` pins them).
- `git mv docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md docs/archive/2026-Q3/`; QUEUES drops it; the `.queue-ledger.json` key is removed.
- The `LOOP-CHARTER §3` strings in `commit-msg-gate.mjs` and `mutation-proof-trailer.mjs` stay unchanged, because §3 remains.

- [ ] Change the pins first. Run `npx vitest run tests/scripts/read-order.test.js`. Expected: FAIL.
- [ ] Implement it. Run `node scripts/ci/read-order.mjs --write`, `node scripts/ci/queue-ledger.mjs` and `node scripts/ci/doc-currency.mjs`.
- [ ] **Green:** the tests pass, and `npx vitest run tests/scripts/queue-ledger.test.js tests/scripts/doc-anchors.test.js` passes.
- [ ] **Mutant** M-U31: a stale AGENTS read-order block makes doc-currency go RED (spec: the `read-order` case of
  `doc-currency-wiring.test.js`, through U1 with the identity control).
- [ ] After QUEUES drops HOLISTIC, U27's every-queue parsed == stated test still runs on STATUS and the umbrella plan;
  check it reports 2 queues, not 0.
- [ ] Commit with `Mutation-Proof:`. **Order:** after U28 and U29.

**Rollback:** revert.

### U32 — D6: every doc is mapped in INDEX, or the push is red

**Files:**
- `docs/superpowers/INDEX.md`: rewritten in 4 tiers (Canonical, Records, Reference, Archive with one line per quarter). Hand-typed counts are replaced by the commands that produce them.
- Create `frontend/scripts/ci/index-map.mjs` (its own module, like `plan-status.mjs`; never an export from
  doc-currency, which `cli-guard` would flag and whose import would run the whole lint, unless U8a's seam is in place):
  - **Produces:** `unmappedDocs(indexMd, trackedFiles) -> { unmapped: string[], scope: number }`. It covers tracked files under `docs/superpowers/` outside `plans/` and `specs/`; a file is mapped when INDEX names its path or its directory (one line each for `masterpiece-2026-10/` and `sota-2026-09/`). `scope` is the denominator.
  - Its CLI (behind the `isCli` guard) prints `N unmapped of S in scope` and exits 3 when S is 0. The exit-3 branch lives in the CLI, not in the function.
- `frontend/scripts/ci/doc-currency.mjs`: call `unmappedDocs`; it fails with `UNMAPPED DOC`, and errors `COULD NOT CHECK` when `scope` is 0. Fix `:5` "142 docs" so the docblock carries no count. Add an `index-map` wiring case (U8a).
- Create `frontend/tests/scripts/index-mapped.test.js`.

- [ ] Write the failing tests:
  - a mapped path passes;
  - a directory line maps its children;
  - an unmapped file fails;
  - 0 files in scope returns `scope: 0`, and the CLI exits 3 on it;
  - the doc-currency wiring case: a fixture with one unmapped doc errors.
- [ ] Run them. Expected: FAIL. Today 66 tracked files are in scope.
- [ ] Rewrite INDEX and implement the check.
- [ ] **Mutant** M-U32: directory lines match nothing, and the directory case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U33 — D9: CHANGELOG split by quarter (with F5)

**Files:**
- `memory/CHANGELOG.md` keeps Q4 under a header pointing to the archived quarters.
- Create `memory/archive/CHANGELOG-2026-Q2.md` and `CHANGELOG-2026-Q3.md`.
- Back-fill September and October by SCRIPT, not by a model: `git log --since=2026-09-01 --date=short --format='- %ad %h %s'` on main,
  grouped by date, written under a `Back-filled from git log` header. A line generated from the commit cannot
  misdescribe it, which a sha-existence check could never establish. OVERNIGHT's Shipped section is linked, not paraphrased.
- OVERNIGHT stays the operator brief.
- Ledger: `opsec-scan --rekey --split memory/CHANGELOG.md:memory/archive/CHANGELOG-2026-Q2.md,memory/archive/CHANGELOG-2026-Q3.md`.

- [ ] The split is mechanical (a lane on `claude-sonnet-5-5`, effort high, or a script); the back-fill is the script
  above, with no model in the loop. **Check:** for every back-filled line, the text after the sha equals
  `git log -1 --format=%s <sha>` (a script in scratch prints the mismatch count, which must be 0 of N lines, N > 0).
- [ ] **Green:**
  - doc-currency and opsec pass;
  - `wc -c memory/CHANGELOG.md` is far below 573,459;
  - `session-archivist-kz`'s target path `memory/CHANGELOG.md` is unchanged;
  - the concatenation of the three files, minus the back-fill and headers, is byte-identical to the old file (a `diff` in scratch).
- [ ] Commit.

**Rollback:** revert.

### U34 — D10: ROADMAP becomes a stub; SOTA-INITIATIVE keeps only its vision

**Files:**
- `memory/ROADMAP.md`: about a 10-line stub pointing at the umbrella plan. It keeps the 4-piece contract.
- Create `memory/archive/ROADMAP-2026-04-to-08.md`.
- `SOTA-INITIATIVE.md`: §3 moves verbatim to `docs/archive/2026-Q2/SOTA-INITIATIVE-status-2026-06.md`; delete the L18-21 precedence chain; keep §1, §2, §5, Kevin's quoted grants, AND §6's **"Decisions of record"** list (`SOTA-INITIATIVE.md:150-152` as of 2026-10-27: audience-broad, soft death, the Aspect sequence, game-direction "Ember Frontier + Blight-Heart climax", and the rest) verbatim. The umbrella plan (:102-103) and DECISIONS.md (:61-62) cite `SOTA-INITIATIVE.md` as the home of the soft-death decision, and doc-currency checks only that the path exists, so dropping the list would leave both citations dangling while staying green.
- The Phase-26 sky warning goes into the umbrella plan, via `main`.

- [ ] **Green:** doc-currency and opsec pass; `grep -c 'Decisions of record' SOTA-INITIATIVE.md` is 1 or more, and
  `grep -c 'soft death' SOTA-INITIATIVE.md` is 1 or more (presence of the list the two citations rely on). Commit.

**Rollback:** revert.

### U35 — D11: DECISIONS gets a generated TOC and a newest-first rule

**Files:**
- Create `frontend/scripts/ci/decisions-toc.mjs`. It renders a block between markers (date, KEVIN/LOOP, title, supersedes).
  **Produces:** `checkOrder(md) -> {ok, offender?}`, which checks the entries from the TOC down to a `<!-- LEGACY ORDER BELOW -->` marker are in non-increasing date order. Old entries are not reordered.
- `doc-currency.mjs`: calls it. Add a `decisions-toc` wiring case (U8a): a fixture DECISIONS with an out-of-order entry above the marker errors.
- Create `frontend/tests/scripts/decisions-toc.test.js`.
- Back-port the September decisions (sota QUEUE "KEVIN DECISION BATCH", OPEN-ITEMS) as dated entries naming their source, via `main`.

- [ ] Write the failing tests:
  - a stale TOC is red;
  - an out-of-order entry above the marker is red;
  - entries below the marker are ignored.
- [ ] Run them. Expected: FAIL.
- [ ] Implement it. **Mutant** M-U35: `checkOrder` always returns ok, and the out-of-order case goes RED.
  **Mutant** M-U35b: delete the call from doc-currency, and the wiring case goes RED.
- [ ] Commit with `Mutation-Proof:`.

**Rollback:** revert.

### U36 — D12: ARCHITECTURE rewritten from the code

**Files:** `memory/ARCHITECTURE.md`, 400 lines or fewer. Create `memory/archive/ARCHITECTURE-addenda-2026-04-to-08.md` (the old addenda, verbatim).

- [ ] Run one Opus 5.5 xhigh builder per subsystem cluster: world/mesher, render/post, physics/input, store/ECS,
  UI/i18n, audio, and CI/harness. Each section cites code paths, and each claim is re-read against source. Today the
  file has 0 mentions of FrameCap, farField, PanelBoundary, perfectDodge, heavyAttack or lazyPanels (lane-measured).
- [ ] **Reviewer:** an `adversarial-reviewer-kz` stage at xhigh samples claims, briefed to REFUTE; refuted claims are corrected.
- [ ] **Green:** doc-currency passes, so every cited path exists. Commit.
- [ ] **Tranche D review:** the fresh-process `/code-review xhigh` over tranche D's range (Global Constraints).

**Rollback:** revert.

### Tranche E — closeout

### U37 — E1 (superseded): the lookbook pointer, after `feat/instruments` merges

- [ ] Precondition: `git ls-tree main -- frontend/scripts/visual/lookbook.mjs` is non-empty.
- [ ] Add one AGENTS Gates line: `node scripts/visual/lookbook.mjs` gives real-GPU, motion-on, production-build frames
  (Chromium ANGLE-Metal; WebKit at 1180x820 and 820x1180) to judge looks by eye. It is an instrument, not a gate.
  **No new script.**
- [ ] **Green:** `grep -c lookbook ci/pipeline.sh` prints `0`; agents-shape and doc-currency pass. Commit.

**Rollback:** revert.

### U38 — E3: closeout

- [ ] **Prompt audit:** check that `/doctor prompt-audit` exists in the installed Claude Code (its `/doctor` listing).
  If it does, run it over AGENTS and `.claude/rules` and fix what it finds. If it does not, record the absence as a
  named gap, with the version checked. Never claim it ran.
- [ ] **DECISIONS entry, via `main`:**
  - the standing procedure: after each model upgrade, re-audit, cut or restore one section at a time, and restore
    only on recurrence;
  - before and after for AGENTS bytes and lines, rule bytes, orientation bytes, commit-tier time, the killability count and opsec `_total`;
  - the R1-R3 results, each with its presence control's outcome;
  - the four tranche `/code-review xhigh` ranges and their finding counts;
  - push wall time and full-path push count, before and after (metric 7);
  - the lived-proof log (Acceptance).
- [ ] Regenerate the operator pages, republish them to the SAME urls (with the account check), `--sync` both, and push.
  `gh run list --workflow=ci.yml --branch main --limit 3` shows the push's run as `success`.
- [ ] Run the Verify Gate (`plan-verify-kz`) against this file's unit list. The command session marks T16 DONE or PARTIAL.

---

## Acceptance

This pass changes what an agent does, not what the game draws. Its proof is therefore **a real session behaving
differently, observed**, plus the plan-wide invariant that nothing in `frontend/src` changed. No lookbook frames are
owed: no unit renders anything, and the lookbook itself belongs to `feat/instruments`.

| Lived proof | Observed how | What would still pass if the feature were deleted? |
|---|---|---|
| `git push --no-verify` is denied in a session rooted at ROOT or a lane | headless Haiku session; the denial is in its output (U10), with the U10 pattern probe as control (the same command allowed where the rule is absent) | harness-integrity (d) would go red; the session would print the push's dry-run output instead of a denial. Without the control, an auto-mode refusal would pass this row with the rule deleted |
| `sed -i` on `frontend/src/*.jsx` is denied, and `sed -n` runs | headless session (U12) | the guard's unit tests would fail; the lived session would show the file rewritten |
| The compaction context reaches the model | the hook's per-run nonce appears in the transcript after the compact boundary, in an entry that is not a tool result (U6) | nothing: a grep for `PATH-SCOPED RULES` would still pass, because that string sits in files the session re-reads; the nonce cannot |
| A commit in a lane is fast, prints its denominator, and still selects tests | wall time against T_commit at a comparable load, plus 1 or more tests selected for a staged scripts change (U17 lived 1, 1b) | the timing alone would pass MORE easily if the tier tested nothing; the selection line would not |
| A push without a certify receipt certifies in full; one with a receipt skips the core | pre-push output lines (U17), and the writer-to-reader seam test | prepush tests with hand-written receipts would pass with the real writer broken; the seam test would not |
| Pushes do not simply get slower | push wall time and full-path push count from the push log, before and after (U17 lived 4) | — |
| A bypassed push is visible | `sh ci/push-audit.sh` exits 1 after a fixture `--no-verify` push (U13 test) and 0 after the lane's real push | push-audit tests |
| No graft hook error in a lane session | headless session output (U5), counted only if P0's presence control showed the error before | harness-integrity (a) |
| AGENTS costs less every session | `/context` memory row before and after (R1 script, U22), counted only if the row is printed at all | the agents-shape byte cap |
| No `src` byte changed | `git diff --stat main...HEAD -- frontend/src` is empty; `bundle-budget.mjs` output is identical | — |

## Verification gates (run at the end, from APP unless noted)

- [ ] `node scripts/ci/opsec-scan.mjs --all`: clean, with `_total` below 423.
- [ ] `node scripts/ci/doc-currency.mjs`: PASSED. Rules are canonical, and the INDEX map, plan banners, cursor cap,
  AGENTS cap, RULES block and DECISIONS TOC all hold.
- [ ] `npm run lint`, `node scripts/ci/gate-shape.mjs`, `node scripts/ci/killability-ledger.mjs` (the count does not
  rise; every new file is receipted), and `node scripts/ci/cli-guard.mjs`.
- [ ] `npx vitest run tests/scripts`: all pass. This includes harness-integrity, which prints non-zero H/E/R/G/D.
- [ ] `node scripts/ci/queue-ledger.mjs`: STATUS and the umbrella plan both counted, with non-zero denominators.
- [ ] `node scripts/ci/read-order.mjs` (1 surface current) and `node scripts/ci/artifact-currency.mjs` (exit 0).
- [ ] `sh ../ci/pipeline.sh --tier=certify` (background): every step passes, and the receipt is written.
- [ ] `git push`: pre-push passes; then `gh run list --workflow=ci.yml --branch main --limit 1` shows `success`.
- [ ] From ROOT: `git diff --stat main...HEAD -- frontend/src` is empty; `wc -c .agent/AGENTS.md` is 12,000 or less;
  `wc -c .claude/rules/*.md` is 8,000 or less each.
- [ ] `sh frontend/scripts/dev/kill-test-procs.sh`: no orphan. If a local run bound a port, say so; whether it left a tab is not visible.

## Risks

- **B7 reverses Kevin's 2026-09-22 direction.** Intermediate commits landed on main stop carrying a unit or build
  result, and the slow step sits at the push, which deploys. Mitigations:
  - it lands last in tranche B;
  - the certify receipt, keyed by tree so lanes do not evict each other, and the AGENTS push line;
  - the push log (metric 7), so a push-time regression is measured rather than invisible;
  - the push audit (U13);
  - CI on the tip;
  - Vercel Deployment Checks (Kevin);
  - a rollback that is one revert plus a DECISIONS entry.
- **Merge conflicts** with the live lanes on AGENTS, settings, pipeline, STATUS and DECISIONS. Mitigations:
  - one unit per commit, merged ff-only from the main checkout;
  - shared docs are edited by `main`, or with its go-ahead;
  - tranche D waits for the Phase 0 lanes to merge where they touch the same files.
- **The launch root (M4).** Every hook and deny here binds only to sessions rooted at ROOT or a lane. R3 measures it
  with an inert sentinel and a positive control (never with `cmux close-surface`), and AGENTS states it.
- **The U4 merge deletes a live file.** An ff-merge of the untracking commit removes `.state/compaction-events.jsonl`
  from disk, or is refused while it is modified. U4's save, merge, restore procedure is sent to `main` with the merge.
- **Guard false positives** block a legitimate command. Mitigations: the guard fails open, every allow case sits one
  token from a deny, and the error reason names the Edit tool as the way through.
- **The SessionEnd sweep** kills another lane's detached run. It runs in non-force mode, which kills only orphans with
  no live owner; Playwright under node counts as an owner (`kill-test-procs.sh:20-24`, `:52-69`).
- **Caps that block the command session's flush.** The AGENTS and rule caps land already satisfied, and the cursor cap ships warn-only (U30).
- **A trim that drops a load-bearing fact.** Mitigations: the per-section disposition table, agents-shape, the xhigh
  refuting review, the pre-trim SHA, and restore on recurrence.
- **The artifact-currency 30-commit window.** The midpoint checkpoint refreshes both pages.
- **The shared hooksPath switch (U15)** changes every worktree's hooks at once, and a stale lane then runs its older
  hook files. `main` is told before the first `prepare` run, the old value is recorded, and pre-push's pipeline stays
  the pushed sha's own.
- **Account rotation:** republishing to the same URL needs the owning account (F3, PLAUSIBLE). It is checked before
  any sha bump, and a page that cannot be republished is recorded, never synced.
- **Load 33-42 makes timings noisy.** Each timing is relative and paired with `uptime`.
- **`vitest related` sees only static imports,** so the lazy panels are invisible at commit. The printed denominator
  says so, and the full suite runs at certify, push and CI.

## Out of scope

- The harness plan's whole `not_doing` list:
  - installing Blender;
  - project skills;
  - `.claude/agents` effort overrides;
  - retiring era-review or sota-audit, or the artifact-currency gate;
  - a graft upgrade;
  - purging history;
  - the CI e2e shard limit;
  - a task-success ablation;
  - an age gate on STATUS;
  - reordering old DECISIONS;
  - `onFailure: block` on the B2 guard;
  - moving `sota-2026-09`.
- **Not carried over from that list:** "tree-SHA receipts". Its stated reason (harness-plan json :291: "B7 stops
  pre-commit writing receipts, so cross-lane receipt eviction stops mattering") no longer holds once the refute's
  B7 amendment keeps a receipt path (refute :32): certify runs in any lane, and one shared file would let them evict
  each other. U17 keys receipts by tree.
- **Any `frontend/src` edit,** including `cameraKick.js:7`, which goes to the next `src` lane.
- **A new lookbook script:** `feat/instruments` owns it.
- **Configuring Vercel Deployment Checks:** Kevin's dashboard. It is a STATUS §H row.
- **Agentic-Brain files** (messages to the AB owner only):
  - Antigravity's `.agent/workflows` loss in `configs/known-gaps.json`;
  - the installer ignore line for `/.githooks/commit-msg`;
  - the reviewer-effort override.
- **Porting Inkbloom's round-4 spelling guard,** which did not converge (AB handoff principle 4).

## Open questions (none blocking)

1. **B7 supersedes Kevin's 2026-09-22 front-load direction,** decided under his 2026-10-27 grant and recorded as such.
   Kevin can reverse it with one DECISIONS line.
2. **Vercel Deployment Checks** need Kevin's dashboard. They are the only enforcement boundary an agent cannot bypass.
3. **If R1 shows Claude Code loading both `CLAUDE.md` and a root `AGENTS.md`:** should the root name become
   `AGENTS.md` alone? That changes what every estate tool expects, so it is Kevin's call.
4. **If R2 shows the cwd env var resetting worktree subagents to the clone root,** U11 stays unlanded. Claude Code may
   fix this upstream, and it is re-measured on each Claude Code update.
5. **The hostname in `memory/perf/*.json` filenames** stays in public history (`not_doing`). It is a separate decision for Kevin.
6. **Whether `/doctor prompt-audit` exists in 2.1.311** was not verified by this author. U38 checks it before relying on it.

## Review amendments (2026-10-27)

An adversarial review of this plan reported 22 findings: 1 HIGH, 12 MED and 9 LOW. Each one was re-verified against
the code before the plan was changed, because a review verdict is a hypothesis. Three mechanisms were also re-run in
scratch repos on git 2.55 (the GIT_INDEX_FILE behaviour, the ff-merge of an untracking commit, and the `--relative` and
`%gd` output formats). **Disposition: 22 applied, 0 rejected.** Two were applied through a different fix than the
review proposed; the entry says which and why.

| # | Sev | Finding | Re-verified | Disposition |
|---|---|---|---|---|
| 1 | HIGH | P0's R3 probes M4 with `cmux close-surface --help`, which may close the lane session's own tab; it also has no positive control | Refute :262 gives the command. `close-preview-tabs.sh:10-12` records the self-close fall-through for an unresolved `close-surface`. Whether `--help` falls through is unmeasured, but the probe needs none of that risk. | **Applied.** R3 now uses an inert `echo M4SENTINEL` deny in a scratch project, with a ROOTED_INSIDE positive control. Destructive probes are banned (P0, Risks). |
| 2 | MED | U17's commit tier can select 0 tests and still pass, and its timing proof gets greener when it does | Both mechanisms MEASURED. (a) Without `--relative`, a `git diff --cached --name-only` run from `frontend/` prints `frontend/src/a.js`; with it, `src/a.js`. (b) Under `commit -a` and `commit <path>`, the hook sees `GIT_INDEX_FILE=.git/index.lock` or `next-index-<pid>.lock`; unset, `diff --cached` listed nothing. | **Applied.** `staged_frontend_files` (with `--relative`) runs outside `run_scrubbed`. Added a positive-control fixture, a `commit -a` / `commit <path>` index control, mutants M-U17e/f, and lived proof (1b), using a scripts file because `src` edits are banned. |
| 3 | MED | U17 omits `write-receipt.sh`, which hard-codes `commit` | `write-receipt.sh:57` `printf '%s commit %s\n'`; `pre-push:126` reads `GREEN_TIER`; `prepush-range-gates.test.js:81` hand-writes its receipts | **Applied.** The writer takes the tier as an argument. Added a writer-to-reader seam test and M-U17d, and corrected the rollback line. |
| 4 | MED | Nothing runs certify automatically, and the single receipt file is shared by every lane | `pipeline.sh:81-83` derives one path from `--git-common-dir`; `write-receipt.sh:57` overwrites it with `>|`; harness-plan json :291 premise vs refute :32 | **Applied, option (a).** Receipts are keyed by tree in `crafty-green-trees/`, the `not_doing` item is withdrawn with its reason, the AGENTS push line says to certify before pushing, and metric (7) adds push time and full-path push count from a push log (U13). Option (b), a background certify per commit, is not taken: it would start a full suite and build on every commit at load 33-42, the cost B7 removes. |
| 5 | MED | Untracking `.state/…` in the lane (U4) breaks or erases AB's log at the ff-merge into main | MEASURED. A dirty target refuses the merge. Once clean, the merge succeeds and `.state/` is gone from disk. Main shows the file modified in this session's snapshot. | **Applied.** U4 has a save, merge, restore procedure that `main` runs in any checkout holding the file, and a Risks line. |
| 6 | MED | The queue specs miss STATUS's bullet items and its `▣` marker, and the umbrella plan's Phase 1-3 bullets. The only parsed-vs-stated check dies with U31. | MEASURED in STATUS §2: 64 marker bullets (3 `▣`), 14 unmarked `**` bullets, 0 marker table rows. `STATUS.md:103` defines `▣`. Umbrella :64-98 are bullets. `queue-ledger.test.js:71-76` reads `QUEUES[0]` only. | **Applied.** `rows` is now a list of real shapes, the marker set includes `▣`, every queue states `**Items: N**`, and parsed == stated is checked for every queue. Added mutants M-U27c/d/e, and U29 counts both of the umbrella plan's shapes. |
| 7 | MED | The identity mutant (an appended comment) breaks JSON, and the U9 settings mutants rewrite the lane session's live settings | U1's own text; JSON has no comment syntax; `mutate.sh:58-68` writes the subject in place | **Applied.** `identityMutant` is chosen by file type (JSON is re-indented). Settings mutants run on a scratch copy through `HARNESS_SETTINGS` (`_harness.js` `settingsPath()`). Added M-U1c. |
| 8 | MED | The checks wired into doc-currency are untested at their call sites, and its CLI mutants cannot get the identity control | `doc-currency.mjs` has no export and no `isCli`, and `process.exit(1)` sits at :321. No test spawns or imports it (grep: 5 tests mention it in comments only). `mutate.sh:76-79` runs vitest only. | **Applied, through a different route.** The new U8a gives doc-currency a `run({root, only, enforce})` seam and `doc-currency-wiring.test.js`. Every wiring unit adds a case, and its "doc-currency goes RED" mutant uses that spec, so it gets the identity control without a CLI mode in mutate-batch. U30's flag flip gets a red-first pin. |
| 9 | MED | U22 refuses "`/code-review xhigh` is the default" (refute F6), which contradicts a decision of record. The plan runs no `/code-review`. | DECISIONS.md :111 and :130-131 (2026-10-27): "built-in `/code-review xhigh` as the default", run as a fresh process. Umbrella rule 5 (:31-32). AGENTS :213-217 set only the effort ceiling. | **Applied.** The refute's F6 is overruled on this point. AGENTS Models carries both the quote and the default. Each of tranches A-D gets a fresh-process `/code-review xhigh` (Global Constraints, with a step in U8a, U17, after U24 and U36). Added an agents-shape assert and M-U22e. |
| 10 | MED | U34 drops SOTA-INITIATIVE §6's decisions-of-record list, which two documents cite as the home of soft death | `SOTA-INITIATIVE.md:150-152`; umbrella :102-103; DECISIONS :61-62; doc-currency checks paths only | **Applied, keep-verbatim option.** The list stays in SOTA-INITIATIVE, with a presence grep at green. Migrating it to DECISIONS is not taken: that file is `main`'s, and the move would re-point two citations for no gain. |
| 11 | MED | U6's lived proof greps a token found in files the session re-reads, so it passes with the hook deleted | The token is in `post-compact-rules.sh:28`, in this plan (U6 and Acceptance), and in the planned script and test. The midpoint step says to re-read this plan. | **Applied.** The hook emits a per-run nonce and records it under `.git/`. The proof requires the compact boundary (presence), the nonce after it, and no tool-result carrier. Added M-U6d and updated the Acceptance row. |
| 12 | MED | R1, U10's lived denial and U5's lived check are absence-only, with no presence control | R1's pass is "no second row". Global settings run `defaultMode: auto` (:159) with `Bash(*)` (:21), so a denial can come from the classifier. U5 never showed the error appearing before the change. | **Applied.** R1 requires `before.txt` to show the CLAUDE.md row (else COULD NOT CHECK, and U24 does not land). U10's probe runs the same command where the rule is absent. P0 records a U5 baseline that must show the error. |
| 13 | MED | push-audit's floor needs a time, but its reflog format has none, and the first test pushes before stamping | `%H %gs` has no time. `pre-push:170` stamps before the ref update. MEASURED: `--date=unix` with `%gd` prints `origin/main@{<unix>}`. | **Applied.** The time comes from `%gd`, and stamps match by sha with the floor bounding history only. Fixtures stamp first, a forced-late stamp case was added (M-U13c), the docblock states the manual `--stamp` limit, and `Bash(*push-audit.sh --stamp*)` is denied. |
| 14 | LOW | M-U20a (drop the `_total` check) is an equivalent mutant | The other rules make a `_total` rise impossible (a split's sum cannot grow, other caps are fixed, renames move caps) | **Applied.** The `_total` rule is dropped and recomputed on write. M-U20a now loosens the per-split comparison by 1, and an extra `_total` == sum case was added. |
| 15 | LOW | U32 exports `unmappedDocs` from a module-scope script, which trips cli-guard, and the test expects an exit code from a function | `cli-guard.mjs:20-25`; doc-currency has no guard | **Applied.** The function moves to its own `index-map.mjs`, which returns `{unmapped, scope}`. Exit 3 lives in its CLI, and doc-currency treats scope 0 as COULD NOT CHECK. |
| 16 | LOW | The Goal overclaims "only through a certified push", and `git -C <path> push --no-verify` is not denied | The plan's own scope notes (commit `--no-verify` stays allowed, advisory push-audit, Vercel is Kevin's). The `git -C` spelling appears at P0 and DECISIONS.md:104. | **Applied.** The Goal is restated as "certified, or reported after the fact; the hard boundary waits on Vercel". Four `git *` patterns were added. Since Claude Code's `*` matching is unmeasured, a pattern probe with a control comes before relying on them. |
| 17 | LOW | U3 expects the files-scanned count to rise for CLAUDE.md, but CLAUDE.md is already scanned | `opsec-scan.mjs:189-191` uses `statSync`, which follows the link. The ledger has `CLAUDE.md: 3`. `git ls-files -s` shows CLAUDE.md as the only mode-120000 entry. | **Applied.** The count stays the same and the CLAUDE.md key is removed in U3. U6's ledger numbers are now relative, because U3 shifts the totals first. |
| 18 | LOW | physics.md cites the melee-cone line as the movement code | `Components.jsx:255-257` is `checkMobsInMeleeCone` / `lookDir`. Movement is `moveVector` at :1193, imported from `game/locomotion.js` (:19). | **Applied.** The citation is by symbol (`moveVector`). |
| 19 | LOW | U16's tests run the real commit-msg gate against the real repo's index | `commit-msg:21` `exec node …gate.mjs`; `commit-msg-gate.mjs:31-32` resolves ROOT from its own path, and :59 runs `git diff --cached` | **Applied.** A stub `node` goes first on PATH, and a test asserts the chain still reaches it. |
| 20 | LOW | U6's ROOT-by-script-location interface contradicts its CLAUDE_PROJECT_DIR-steered tests | Plan text (old :383 vs :394-402) | **Applied, copy seam.** Tests copy the script byte-for-byte into the fixture, and ROOT stays git-from-location. |
| 21 | LOW | U12 matches the written path, not where it points, so a cwd under `frontend/src` evades it | Hook input carries `cwd` (the estate's `pretooluse-worktree-path-guard.sh` reads `data.get("cwd")`). Bash cwd persists (AGENTS REPO LAYOUT). U11 is conditional. | **Applied.** `decide(command, cwd, root)` resolves operands against the effective cwd, including a leading `cd X &&`. The prefilter keys on `src`. cwd-relative deny and allow-twin cases were added with M-U12d, and other `cd` forms are a stated gap. |
| 22 | LOW | U33 calls the back-fill "mechanical", but its check (sha exists) cannot tell whether a line describes its sha | `git cat-file -e` measures that a sha exists, not that the line describes it | **Applied.** The back-fill is generated from `git log` by a script with no model, and each line's text is checked against `git log -1 --format=%s <sha>` (0 mismatches of N > 0). |

**What this pass did not establish.** It did not run R1-R3, the U10 pattern probe or any Claude Code headless
behaviour (permission `*` matching, `/context` under `-p`, the transcript entry type that carries SessionStart
context). Those remain P0's and the units' measurements, and each now has a presence control, so a silent result
reads as COULD NOT CHECK rather than PASS. Beyond what the review reported, absence of further defects is not
asserted.
