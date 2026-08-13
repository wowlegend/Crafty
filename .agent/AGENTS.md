# Crafty — Project Agent Instructions

> **Single source of truth for all agent frameworks.** Root `CLAUDE.md` is a symlink to this file
> (Claude Code), and Antigravity/Gemini read it here in `.agent/`. **Edit THIS file, never the symlink.**

## ⚠️ REPO LAYOUT — read before ANY path/Bash op (the #1 recurring mistake)

This repo is **TWO-LEVEL**. The Bash cwd drifts between tool calls and **resets after every
compaction**. ALWAYS use absolute paths or an explicit `cd`. **NEVER** assert a file is
"missing / gone / deleted" from a relative `ls`/`find`/`grep` without re-checking the **absolute**
path — that is the false-absence trap.

```
REPO ROOT = /Users/kz/Code/Crafty/            ← .git + docs + memory + master-plan + mockups live HERE
  ├─ .git/   CLAUDE.md (symlink -> .agent/AGENTS.md)
  ├─ SOTA-INITIATIVE.md                          ← MASTER PLAN v2, DIRECTION ONLY (§3 status FROZEN 06-18; S0-S3 DONE, S4 Kevin-gated)
  ├─ SOTA-KICKOFF-PROMPT.md
  ├─ .agent/  AGENTS.md (this file) + workflows/ (debug-physics, fix-movement)
  ├─ docs/superpowers/                           ← plans/, specs/, KEVIN-REVIEW-BATCH.md
  ├─ memory/                                      ← 4-piece (ACTIVE_PLAN, ARCHITECTURE, CHANGELOG, ROADMAP)
  │                                                 + REALITY-AUDIT-2026-05-30.md, IN_DEPTH_AUDIT.md,
  │                                                   MONETIZATION-VIRALITY-SCAN-2026-05-30.md
  └─ .superpowers/                                ← GITIGNORED mockups + _icons.json (s1c-mockups/v2/);
                                                     NOT lost on compaction — it lives HERE at the root

APP DIR   = /Users/kz/Code/Crafty/frontend/    ← the React/Vite app — run npm + tests FROM HERE
  ├─ src/                                         ← ALL source (.jsx/.js). NOT at the repo root.
  ├─ tests/  gates/ (static-gates) · data/ (characterization) · visual/baseline/*.png · store/
  ├─ scripts/visual/capture.mjs
  └─ package.json, node_modules/, vite.config.js, tailwind.config.cjs
```

**Rule of thumb:** source edits → `frontend/src/…`; npm/tests → `cd frontend && …`; plans/specs/memory +
master plan → repo ROOT (one level ABOVE `frontend/`). The compaction summary may paraphrase
"Crafty = …/frontend" — that's the APP only.

## Tech Stack & Architecture
- React 19, Three 0.172 (R3F 9.5 + Drei 10.7 + @react-three/postprocessing), Vite 6, Rapier 2.2 (WASM KCC), zustand 5, framer-motion 12, TailwindCSS (v3, `.cjs` config), simplex-noise, lucide-react 0.439. JavaScript (JSX). npm (`package-lock.json`).
- **Architecture reality — the SIZE NUMBERS BELOW ARE GENERATED, NOT TYPED.** This bullet used to hand-type
  "~14.4k LOC / ~31 JS(X) files" and assert "Components ~1330 is the LAST single large file". Measured
  2026-08-02: **12× wrong on files, 2.5× on LOC, and several files — not one — are ≥900 LOC.** An agent that
  believes this is a ~31-file project reasons about it as a small one, and "Components is the last god-file"
  actively misdirects de-monolith work away from the others. **Read every COUNT from the generated block
  below; this paragraph deliberately states none.** It used to narrate the running total, and by
  2026-08-09 that narration disagreed with the table four lines beneath it — a headline contradicting its
  own data, inside the very paragraph written to stop exactly that, twice over. A number in prose rots no
  matter how emphatically the prose warns about rot; the only fix is to not write one. Regenerate with
  `node frontend/scripts/ci/measure.mjs --write`; `doc-currency` re-measures on every push and fails on drift.

<!-- BEGIN MEASURED (regenerate: node frontend/scripts/ci/measure.mjs --write) -->
- **Size (measured):** **306 source files / 34,447 LOC** in
  `frontend/src`, plus 135 colocated `*.test.js(x)` files (counted separately —
  tests are not the architecture).
- **Files ≥ 900 LOC (5):** `src/Components.jsx` 1378 · `src/store/useGameStore.jsx` 1130 · `src/world/Terrain.jsx` 1018 · `src/App.jsx` 1004 · `src/QuestSystem.jsx` 986.
  Its MEMBERSHIP is checked exactly by `doc-currency`; the LOC beside each name, and the counts above,
  sit under a ±10% band so ordinary churn does not redden the push — so a specific number here
  can be mildly stale and still green. Regenerate before trusting one: `node frontend/scripts/ci/measure.mjs --write`.
<!-- END MEASURED -->

- **What is still true qualitatively:** the codebase is **MONOLITHIC in shape** — a handful of large
  imperative files carry the game loop. De-monolithing is **CLOSED, not pending** — `memory/STATUS.md` records it done (SimplifiedNPCSystem 934→183, GameScene 933→304) and `SOTA-INITIATIVE.md` formally PARKED the remainder as "risky imperative-orchestration, not blocking". Five files remain ≥900 LOC by design, not by backlog.
  `Components.jsx` is a documented IRREDUCIBLE residual rather than an accidental god-file (verified
  2026-06-29): it is the `Player` useFrame imperative controller, already delegating all pure logic to
  imported `game/*` modules, and the remainder is the loop + input wiring that MUST NOT be split
  (Game-Loop-Isolation / ordering, decision-of-record). **The other ≥900-LOC files carry no such finding**
  — do not assume they are irreducible too. `miniplex` ECS is a **NARROW** slice: real and
  load-bearing well beyond the "mobs/loot/XP only" this line used to claim — `grep -rln "ecs/world" frontend/src/ | grep -v "\.test\."` returns 15 files incl. grass, minimap sync, nametags, element zones, hurl and squad AI — but still NOT the whole architecture. Do NOT trust older "clean ECS" claims.
- Engine CORE is real — KEEP, don't rewrite (greedy mesher, DataArrayTexture, Rapier KCC, A* worker, audio occlusion, day/night, chunk-dispose). Touch/mobile is now BUILT (iPad/iPhone, 2026-06-15) — iOS cold-start was Pointer-Lock-gated and is bridged via `enterPlay()` (src/MenuSystem.jsx); QuestTracker collapses on touch, compact SimpleExperienceBarTouch readout, `scripts/visual/touch-probe.mjs` MANUAL probe (in neither pre-push nor CI; the committed guard is `tests/gates/quest-tracker-touch.test.jsx`); only real-device feel is Kevin-gated. The real test surface is the vitest unit suite + the puppeteer visual gate (the old blind `test_swarm.js` rubber-stamp was deleted) — but still distrust old "100% green/SOTA" doc claims; verify against live code + the gates. **Counts deliberately omitted** — read them from the command instead — `npm run test:unit` prints the suite total, `ls tests/visual/baseline/*.png | wc -l` the gated states.

## ⚠️ BROWSER / TEST-PROCESS HYGIENE (Kevin, 2026-07-13 — NON-NEGOTIABLE)

**Anything you launch, you kill — and the SURFACE outlives the process.** Headless Chromium and vite
servers do not die when a script throws. One session leaked 7 vite servers plus a headless Chromium at
622% CPU, drove the machine to load 25, and timed out the capture gate — which read as a flaky gate and
was self-inflicted. Separately, on 2026-08-09 a `vite preview` on 4180 left a Crafty tab running the
render loop and physics step at 75% of a core in Kevin's OWN Chrome, long after the server was killed.

- Sweep after every browser batch: `sh frontend/scripts/dev/kill-test-procs.sh` (touches only this repo's
  vite and Playwright's cached browsers — never Kevin's Chrome/Brave/Safari).
- A local run that binds a port CAN mint a tab nobody can sweep for you — observed once (4180), while three
  later runs on 4178 minted nothing, so it is not a law. `close-preview-tabs.sh` enumerates cmux SURFACES
  only, so "no orphan preview tabs found" is true about cmux and silent about the real browser. You have no
  instrument either way: say "a local run bound port N; I cannot see whether a tab was left" — never "close
  the tab" and never "all clean". Prefer running these in CI, where there is no browser at all.
- `cmux close-surface` is DENIED in `.claude/settings.json` — its fall-through target is your own session,
  and an autonomous iteration once ended itself that way. `--close` on the helper is `ask`. Honest limits:
  a compound `cd x && cmux …` may not match, and `ask` does not prompt under `bypassPermissions`.
- **If the machine is slow, MEASURE before blaming a gate.** `uptime`, then count R-state against cores;
  high load with low CPU is I/O or another process, not your browsers. Verified absence of your own
  processes does NOT license a story about someone else's — that error was made here on 2026-08-09.

Full procedure — the `finally` shape, `_serve.mjs`, the managed ports, deleting throwaway probes — lives in
`.claude/rules/gates-and-probes.md`, which auto-injects on ALL FOUR of its declared globs —
`frontend/tests/**`, `frontend/scripts/**`, `frontend/src/**/*.test.js`, `frontend/src/**/*.test.jsx`. That is where it belongs: at the moment of the mistake, not at orientation.


## Build / Test / Gates (from `frontend/`)

<!-- BEGIN GATES (regenerate: node frontend/scripts/ci/gate-table.mjs --write) -->
**11 gates authorize a push.** Generated from `.githooks/pre-push` in hook order — this
paragraph undercounted itself three times when it was hand-maintained ("three" -> "Six" -> "NINE"),
the last time one commit after the gate landed. Do not edit the table by hand; add the description to
`DESCRIPTIONS` in `gate-table.mjs` and regenerate.

| Gate | Command | pre-push | CI | What it actually stops |
|---|---|:--:|:--:|---|
| mutation-proof-trailer | `node scripts/ci/mutation-proof-trailer.mjs <range>` | ✅ | — | a commit that ADDS a gate under `tests/gates/` or `scripts/ci/`, or REWRITES the ASSERTIONS of an existing one, without a `Mutation-Proof:` trailer stating what was broken and that it went RED |
| baseline-trailer | `node scripts/ci/baseline-trailer.mjs <range>` | ✅ | — | a commit that rewrites the visual ORACLE under `tests/visual/baseline/` without a `Baseline-Review:` trailer, or that BUNDLES the rewrite with `frontend/src/` changes — which makes an intended look change indistinguishable from a regression the baseline was updated to match |
| doc-currency | `node scripts/ci/doc-currency.mjs` | ✅ | ✅ | a canonical doc citing a path that no longer exists (incl. bare, non-backticked paths), a cross-doc section citation aimed at a section that does not exist, and drift in the generated MEASURED and GATES blocks |
| queue-ledger | `node scripts/ci/queue-ledger.mjs` | ✅ | — | a finding in the queue-of-record with no `▣✓/▢/⊘` marker, or a `⊘ DISMISSED` with no proof command |
| artifact-currency | `node scripts/ci/artifact-currency.mjs` | ✅ | — | the published Artifact page drifting from HEAD — informational under the ceiling, hard fail above it. Also rejects an unusable page source (missing, or a fetched copy of the published wrapper), and a row still marked **Queued** whose declared `data-absent` artifact now EXISTS — a status pill is a claim, and one nothing can falsify is how `d90a6b1` read Queued for a day after it shipped |
| eslint | `npm run lint` | ✅ | ✅ | crash-class bugs + dead code; `no-unused-vars` is an **error**, and `no-undef` catches a hook wired into the wrong component |
| gate-shape | `node scripts/ci/gate-shape.mjs` | ✅ | ✅ | a test assertion satisfiable by a COMMENT alone; also ratchets the source-grep gate population (may fall, never rise) |
| cli-guard | `node scripts/ci/cli-guard.mjs` | ✅ | — | a script under `scripts/` that EXPORTS a seam yet runs its CLI at module scope — importing it executes the tool. Runs BEFORE `test:unit` because that is the run it corrupts |
| unit + static gates | `npm run test:unit` | ✅ | ✅ | everything in `tests/**` + `src/**/*.test.js` — incl. the i18n adoption ratchet and key-resolution gates |
| build | `npm run build` | ✅ | ✅ | broken JSX/imports |
| bundle byte budget | `node scripts/ci/bundle-budget.mjs` | ✅ | ✅ | a chunk growing past its byte ceiling |
<!-- END GATES -->

**Not pre-push gates**, kept by hand because they are not in the hook:

| Gate | Command | pre-push | CI | What it actually stops |
|---|---|:--:|:--:|---|
| knip | `npm run knip` | — | ✅ | unused files/exports/deps |
| e2e | `npm run test:e2e` (playwright, **sharded 3×** in CI) | — | ✅ | real-input regressions; `@local-only` specs are excluded in the workflow |
| visual | `npm run test:visual` | — | — | **neither hook nor CI runs it.** Manual, before a milestone or any render change |

- `test:visual` is `capture.mjs && vitest`, i.e. it RE-CAPTURES. Never run it alongside another capture —
  both bind port 4178 with `--strictPort` and the collision fakes a failure.
- `npm run visual:capture` regenerates frames only. It preflights that the browser can present a frame and
  aborts in ~3s with a named cause if not, rather than hanging on a dead compositor.
- Visual gate: capture-determinism is the **DESIGN** (forced `high` tier), **not the ACHIEVED state**.
  Chromium does not guarantee deterministic rendering (playwright#22620, crbug 919955), so exact equality
  is not a property you can demand — `docs/superpowers/DECISIONS.md` (2026-08-09) carries the evidence.
- **THE MEASURED DETERMINISM NUMBERS THAT USED TO SIT HERE ARE VOID, AND THE REASON GENERALISES.** This
  bullet stated a per-frame table (13 byte-identical, `menu` 0.455%, `explore-day` 0.210%) measured
  2026-08-09. On 2026-08-13 `puppeteer` went 24.42.0 → 25.6.0 to remove `extract-zip` (CVE-2026-56876),
  which moved the **bundled Chromium 147 → 151** — four majors. Every one of those numbers was produced
  by a renderer that is no longer installed. **"None is reproducible" was DISPROVEN the same day**: two
  clean captures on Chromium 151 put 17/31 frames byte-identical against the 147-shot baselines with ZERO
  over the 6% gate. The renderer swap is real and the numbers are still void as CURRENT state — but the
  oracle survived it, which is the opposite of what this paragraph predicted. **A determinism measurement is a
  claim about a RENDERER as much as about the code**, so it expires when either moves; that is why this
  file now names the COMMAND and the provenance field rather than a table. Read
  `tests/visual/baseline/.capture-meta.json` → `provenance.ua` for which Chromium a baseline was shot on,
  and re-measure rather than quoting. A re-baseline on 151 is OWED — see `memory/ACTIVE_PLAN.md`.
- **HOW determinism is actually achieved — by SUPPRESSION, not by seeding.** The old wording here said
  "seed RNG; freeze clocks", and an agent who believes that will misdiagnose a flapping frame. Measured:
  `captureRandom` has **one** consumer (`render/WeatherSystem.jsx`) against **72 raw `Math.random()` in
  20 files** (re-measured 2026-08-13; was 73/19 — the ratio, not the exact pair, is the point); there is
  no global clock freeze, just scattered substitutions against clock reads and timers. What actually
  happens is that **127** `isCaptureMode()` guards TURN THINGS OFF. **So the gated
  frames depict a build with weather, mob AI, NPC routines, particles and spawning disabled — a version
  nobody plays, and one structurally incapable of regressing anything that only manifests in motion.**
- **A capture guard must RESET to a declared value, never early-`return`.** Stopping an animation leaves
  it wherever it got to, and capture is enabled AFTER boot, whose length varies per process (measured
  1.68–10.43 s across five runs) — so a freeze is itself run-dependent. Pairwise frame diff tracks that
  window, r = 0.842. The check must also live INSIDE the callback, since the flag flips after mount.
- The gate runs against the **DEV server**, so 3 of its 31 frames (`primitives-showcase-*`,
  `title-mascot`) are dev-only components that cannot exist in the bundle Vercel deploys on every push —
  and **no harness loads that bundle at all**.
- **A gate's PASS is worth nothing without its DENOMINATOR.** SEVENTEEN things here have now shipped a clean
  report over input they never examined (`gate-shape` skipping 42% of gates, `doc-currency` blind to bare
  paths, a test written into `tests/visual/` which vitest EXCLUDES so it never ran, `esc-pause-probe` never
  pressing ESC twice, `tapTestId` never checking WHERE its tap landed, …). Read the count, not the tick.
  **This paragraph was already here when the last two happened** — being read at orientation is not the same
  as being salient while you write the gate, so the full checklist now lives in
  `.claude/rules/gates-and-probes.md`, which auto-loads on any edit under `frontend/tests/**`,
  `frontend/scripts/**`, `frontend/src/**/*.test.js` or `frontend/src/**/*.test.jsx` — **all four** globs;
  this line named two, silently omitting the **135** colocated `src` tests, which are most of the corpus. Keep
  the two in sync; this line is the always-loaded baseline, that file is the moment-of-use activation.
- **A GREEN GATE IS NOT A LIVED RESULT — prove the entry point is REACHED in the running app.** The most
  common defect in the recent log, and nothing catches it: `fddf7d4` (two achievements dead on arrival —
  nothing ever called `updateLevel`), `34f11b0` (mob grass-bending never worked; 81 chunks drove it),
  `869f71e` (the mote layer rendered at the world origin, not with its chunk), `8a5e008` (two live keybinds
  advertised nowhere) — four in ONE day. knip sees the export used, a source-grep gate sees the line exist,
  `build` sees it compile; none sees whether it RUNS. Real-input E2E, a live probe, or a log line you watched
  fire — not a compiling call site. **Ask what would still pass if the feature were simply deleted.** The
  worked checklist is in `.claude/rules/gates-and-probes.md`.

## Execution & Workflow Protocols
- **Anti-Execution Tunneling:** don't chain many distinct fixes into a monolith. >3 logical systems OR >5 sequential code-altering calls → PAUSE, `git commit`, checkpoint via `session-archivist-kz`.
  **When a rule here gets ignored, the first hypothesis is SESSION LENGTH, not weak wording.** This corpus's
  reflex has been to answer a violated rule with more prose about it, and the record shows that does not
  work — the gate-count paragraph undercounted itself three times while warning about undercounting, and
  the architecture bullet contradicted its own table inside the paragraph written to stop that. Adherence
  decays as a session gets long; a paragraph cannot fix that. So the response to a violation is a
  CHECKPOINT (commit, `/clear`, or a fresh session), or escalation to a deterministic layer — a gate, a
  hook, a `permissions.deny`, or a shared helper used at the moment of the mistake. Rewriting the sentence
  is the weakest available move and usually the one that feels most productive.
- **Read-Before-Write:** establish exact coordinates (grep/line-range) + verify target state before editing.
- **Initialization:** on turn 1, silently orient — `pwd`, git branch, `package.json` scripts, framework state — before proposing.
- **Game Loop Isolation (CRITICAL):** NEVER bind declarative React to high-frequency imperative systems (R3F `useFrame`, Rapier) via reactive state (`useState`/zustand subscriptions). Use transient reads (`refs`, `.getState()`, miniplex queries).
- **AST-Safe Edits:** never `sed`/`cat`-rewrite `.js/.jsx` (AST-safe tools/Edit only; `sed` OK for markdown). Verify behavior, not implementation. No `// ... rest of code`.

## Design Language (LOCKED — S1-C)
ONE bold-flat UI. Token SoT chain: `src/theme/tokens.js` → `src/theme/cssVars.js` (`--ui-*` vars + `applyThemeVars()`) → `tailwind.config.cjs`. **Filled 2-tone game-icons** (`src/ui/primitives/gameIcons.js`, baked from game-icons.net **CC BY 3.0** via the Iconify API) for game CONTENT (items/spells/mobs/achievements); **lucide outline** for app-chrome. The UI primitives live in `src/ui/primitives/` (read the set from its `index.js`; this said "7" and was wrong). i18n in `src/i18n/` (en default + lazy-CJK zh-CN). **NO emoji in `src/`** (zero-emoji hard gate). game-icons.net attribution is DISCHARGED by `src/ui/CreditsScreen.jsx` (Settings → Credits).

## Commit Conventions
- NO "Generated with" / "Co-Authored-By: Claude" footer. Subagent fix-ups = NEW commits (never `git commit --amend` / `reset`).

## Method
- **A SUBAGENT DOES NOT INHERIT YOUR CONTEXT — including this file.** `Explore` and `Plan` are the two
  most-used delegates and they start blank, so the agent doing the most file-hunting is precisely the one
  that has never read the TWO-LEVEL layout block above — the repo's own #1 recurring mistake. Restate
  `ROOT = /Users/kz/Code/Crafty` / `APP = frontend/` in every delegation prompt, plus any path rule the
  task touches. A subagent that reports a file "missing" from a relative path is usually reporting that
  you did not tell it where it was.
Subagent-driven-development (Opus 5) per task: implementer + spec-compliance review + code-quality review; sequential where files are shared; a committed design/spec BEFORE implementation — **SELF-gated** per `LOOP-CHARTER.md` §4 (Kevin's pre-loop hard gate is superseded; he reviews async via KEVIN-REVIEW-BATCH + CHANGELOG); superpowers `writing-plans` for plan authoring. Plans/specs live in `docs/superpowers/`.
- **EVERY milestone uses the `superpowers:writing-plans` discipline (Kevin, 2026-06-10):** before building ANY milestone (M0..Mn of any Aspect/stream), author its own plan doc in `docs/superpowers/plans/YYYY-MM-DD-crafty-<stream>-<milestone>.md` (TDD red-first steps + verification gates), THEN build. **No "build directly from the spec" shortcuts**, even for small/foundational milestones — the VOIDHAND-M1 skip (built from the spec's milestone breakdown without a plan doc) is the anti-pattern this rule forbids. The design SPEC is the HARD-GATE approval; the per-milestone PLAN is the build contract.

## Core Agent Skills (evaluate per task)
- `brainstorming` — before new game features / UI.
- `ruthless-cleaner-kz` (via `cleanup-kz`) — auditing/refactoring/dead-code in ECS systems.
- `pre-commit-kz` — BEFORE any git commit (debug commands, broken builds, secrets).
- `session-archivist-kz` — the 4-piece doc update after major tasks.

## Session Documentation (4-Piece, in `memory/`)
- `ACTIVE_PLAN.md` — volatile current-task POINTER (carries the compaction-safe resume + repo-layout block); update BEFORE execution.
- `CHANGELOG.md` — reverse-chronological history. `ARCHITECTURE.md` — current blueprint. `ROADMAP.md` — future goals.
- Master plan = `SOTA-INITIATIVE.md` at the repo ROOT. Review/decide items batch into `docs/superpowers/KEVIN-REVIEW-BATCH.md`.

## Project-Specific Workflows (`.agent/workflows/`)
- `debug-physics-Crafty-kz` — Rapier collision / terrain (player falling through, collider misalignment).
- `fix-movement-Crafty-kz` — WASD / camera / pointer-lock movement.

## Where state lives (READ IN THIS ORDER)

> **A FOURTH INSTRUCTION CHANNEL EXISTS AND NOTHING IN THIS REPO GOVERNS IT.** Claude Code's auto-memory
> (`~/.claude/projects/<cwd>/memory/`) is on by default, is re-injected after every compaction, and is
> MACHINE-LOCAL: not in git, not read by `doc-currency`, not visible to any gate or reviewer here. It can
> therefore contradict this file with no mechanism to notice. Rank it BELOW `memory/STATUS.md` when they
> disagree — this file and the repo docs are the versioned, gated truth — and treat anything it asserts
> about repo state as a hypothesis to re-verify, exactly like a recalled measurement.


This file is the only surface loaded **UNCONDITIONALLY** at session start and re-injected after a
`/compact` — so it has to name the others. It used to claim it was "the ONLY one auto-loaded", which is
false: every `.claude/rules/*.md` carrying `paths:` frontmatter also auto-loads, but **only when you touch a
file it matches**. That difference is the whole point — a conditional rule fires at the moment of the
mistake and cannot be relied on to orient you, so orientation must live here and enforcement should live
there. **Until 2026-08-03 this file never mentioned `memory/STATUS.md` at all**, which pointed a
freshly-compacted agent at the cursor and never at the registry.

<!-- BEGIN READ-ORDER (regenerate: node frontend/scripts/ci/read-order.mjs --write) -->
**Orientation read order — GENERATED. Do not edit here.** It lives in
`frontend/scripts/ci/read-order.mjs` and is rendered into every surface that states it, because three
hand-kept copies drifted three different ways while one of them claimed they "cannot disagree".

1. `git main` + **CI on `main`** — the code is the only truth that cannot lie — and CI IS PART OF THE TREE. `gh run list --workflow=ci.yml --branch main`; a push that leaves CI non-`success` is a RED TREE and outranks every queue item.
2. `memory/ACTIVE_PLAN.md` — the live cursor — the ONE unit in flight right now.
3. `docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` — **DRAINED 2026-08-12 — no longer a work queue.** 215 findings disposed of: 207 fixed, 8 dismissed with runnable proofs, 0 open. Read it as the RECORD of that campaign, not as the next thing to do; the live cursor is ACTIVE_PLAN. **This markdown is the ONLY copy** — the machine JSON it was regenerable from died with a session-scoped tmp scratchpad (verified absent 2026-07-27). Do not hunt for it; its absence is not a blocker.
4. `memory/STATUS.md` — THE source of truth for WHERE WE ARE, and the SECONDARY queue (gameplay/content/UX items the code review did not cover). Both, without contradiction: it owns status, the review owns the work ladder. VERIFY an item is still open before working it — much of the older A-bis/V1 work is DRAINED.
5. `docs/superpowers/LOOP-CHARTER.md` — the constitution — how the loop operates (esp. §0-B harness layer + §3 gates), plus `LOOP-KERNEL-PROMPT.md`, the durable copy of the `/loop` prompt and the cold/git-only recovery source.
6. `docs/superpowers/DECISIONS.md` — the decision RECORD. `KEVIN-REVIEW-BATCH.md` is the append-only INBOX and structurally cannot tell you what is settled. A reversal is a NEW dated entry naming the one it supersedes — never a silent edit.
7. `docs/superpowers/INDEX.md` — the doc map — what to read and what to IGNORE. A stale doc is a LIVE TRAP; never mine old plans for "what is next".
8. `SOTA-INITIATIVE.md` — DIRECTION only. Its §3 status block is FROZEN — do not read status from it.
<!-- END READ-ORDER -->

## Post-compaction re-orientation (BLOCKING — before the first edit)

1. Re-read this file's read order above, then **STATUS.md**.
2. **Re-run the gates you are about to rely on. Do NOT trust a remembered result** — see the compaction
   note below for why.
3. `git status -sb` (the `-b` matters: plain `-s` hides `[behind N]`, so you cannot see you are stale).
4. If a `/loop` is running, re-read `LOOP-CHARTER.md` + `LOOP-KERNEL-PROMPT.md`; the kernel owns the
   orientation sequence.

## Compaction instructions (the compactor reads this section — keep it)
When compacting this session, ALWAYS preserve verbatim: (1) the current milestone + its plan-doc path;
(2) **that the gates must be RE-RUN — never their outcomes.** This used to read "preserve the latest
test/build/visual gate counts and whether they were green", which is actively harmful: a gate result is true
only in the turn it ran, and carrying one across a compaction converts a measurement into an unverified
claim. That is the exact mechanism that put "CI green" into CHANGELOG.md on a day the workflow had concluded
`success` zero times in 88 runs. Preserve the COMMAND, not the number; (3) the exact resume pointer
(next unit of work); (4) any uncommitted-work state (which files, which task); (5) Kevin's standing
directives in force (autonomous-build authority, TDD, gates, no-AI-footer); (6) if an autonomous loop is
running: `docs/superpowers/LOOP-CHARTER.md` is the loop's constitution AND `docs/superpowers/LOOP-KERNEL-PROMPT.md`
is the durable kernel-prompt copy (the cold/git-only recovery source for the `/loop` prompt) — both must be re-read/restored
at the next orientation. Prefer dropping verbose tool output and exploratory dead-ends over ANY of the above.

## Autonomous build loop
If running under `/loop`: `docs/superpowers/LOOP-CHARTER.md` is the loop's constitution — read it EVERY
iteration at orient-time (it encodes Kevin's 2026-06-10 authority grant: enhance/delete/fix anything in the
master plan as judged best, esp. visuals/graphics/gameplay/audio to a SOTA-June-2026 bar, self-gated by the
charter's design discipline; Kevin reviews async via KEVIN-REVIEW-BATCH).
