# Crafty — Project Agent Instructions

> **Single source of truth for all agent frameworks.** Root `CLAUDE.md` is a symlink to this file
> (Claude Code), and Antigravity/Gemini read it here in `.agent/`. **Edit THIS file, never the symlink.**

## ⚠️ REPO LAYOUT — read before ANY path/Bash op (the #1 recurring mistake)

This repo is **TWO-LEVEL**. The Bash cwd drifts between tool calls and **resets after every
compaction**. ALWAYS use absolute paths or an explicit `cd`. **NEVER** assert a file is
"missing / gone / deleted" from a relative `ls`/`find`/`grep` without re-checking the **absolute**
path — that is the false-absence trap (it bit twice on 2026-06-01: `ls: src: No such file or
directory`; a wrong ".superpowers is gone"; and a wrong `memory/SOTA-INITIATIVE.md` — it's at root).

```
REPO ROOT = /Users/kz/Code/Crafty/            ← .git + docs + memory + master-plan + mockups live HERE
  ├─ .git/   CLAUDE.md (symlink -> .agent/AGENTS.md)
  ├─ SOTA-INITIATIVE.md                          ← the MASTER PLAN v2 (LIVING; S2-B Aspect spine -> S3 -> S4)
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
  actively misdirects de-monolith work away from the others. **Read the COUNT from the generated block
  below, never from this sentence** — it said "five" until 2026-08-05, when extracting the mesher dropped
  `terrain.worker.js` from 936 to 694 LOC and made it four, i.e. a headline contradicting the table directly
  beneath it, in the very paragraph written to stop exactly that. Regenerate with
  `node frontend/scripts/ci/measure.mjs --write`; `doc-currency` re-measures on every push and fails on drift.

<!-- BEGIN MEASURED (regenerate: node frontend/scripts/ci/measure.mjs --write) -->
- **Size (measured):** **275 source files / 31,032 LOC** in
  `frontend/src`, plus 117 colocated `*.test.js(x)` files (counted separately —
  tests are not the architecture).
- **Files ≥ 900 LOC (4):** `src/Components.jsx` 1325 · `src/store/useGameStore.jsx` 1096 · `src/world/Terrain.jsx` 992 · `src/QuestSystem.jsx` 931.
  This list is checked EXACTLY by `doc-currency`; the counts above carry a ±10% band so
  ordinary churn does not redden the push.
<!-- END MEASURED -->

- **What is still true qualitatively:** the codebase is **MONOLITHIC in shape** — a handful of large
  imperative files carry the game loop, and de-monolithing is an **S3** goal, not the current state.
  `Components.jsx` is a documented IRREDUCIBLE residual rather than an accidental god-file (verified
  2026-06-29): it is the `Player` useFrame imperative controller, already delegating all pure logic to
  imported `game/*` modules, and the remainder is the loop + input wiring that MUST NOT be split
  (Game-Loop-Isolation / ordering, decision-of-record). **The other ≥900-LOC files carry no such finding**
  — do not assume they are irreducible too. `miniplex` ECS is a **NARROW** slice: real and
  load-bearing for **mobs/loot/XP only**, NOT the whole architecture. Do NOT trust older "clean ECS" claims.
  *(De-monolith history — GameScene 933→304, SimplifiedNPCSystem 934→183, GamePanels 1094→739,
  EnhancedMagicSystem 904→474, AdvancedGameFeatures deleted @ S3-M4 — lives in `memory/CHANGELOG.md`. It is
  history, not current state, which is why it no longer sits in the constitution.)*
- Engine CORE is real — KEEP, don't rewrite (greedy mesher, DataArrayTexture, Rapier KCC, A* worker, audio occlusion, day/night, chunk-dispose). Touch/mobile is now BUILT (iPad/iPhone, 2026-06-15) — iOS cold-start was Pointer-Lock-gated and is bridged via `enterPlay()` (src/MenuSystem.jsx); QuestTracker collapses on touch, compact SimpleExperienceBarTouch readout, deterministic `scripts/visual/touch-probe.mjs` gate; only real-device feel is Kevin-gated. The real test surface is the vitest unit suite + the puppeteer visual gate (the old blind `test_swarm.js` rubber-stamp was deleted) — but still distrust old "100% green/SOTA" doc claims; verify against live code + the gates. **Counts deliberately omitted:** this sentence said "~1660 tests" and a "21-state" visual gate; both were stale (2,139 and 31 when checked 2026-08-02), sitting one line below the size numbers that were 12× wrong. A number nobody recomputes rots, so read them from the command instead — `npm run test:unit` prints the suite total, `ls tests/visual/baseline/*.png | wc -l` the gated states.

## ⚠️ BROWSER / TEST-PROCESS HYGIENE (Kevin, 2026-07-13 — NON-NEGOTIABLE)

**Anything you launch, you kill. Every time. This is not optional politeness — it degrades Kevin's machine.**

Browser/E2E/capture/probe work spawns **headless Chromium** and **vite dev servers**. They do **NOT** die when
your script throws or a run is interrupted — they linger, burning CPU and RAM. On 2026-07-13 a single session
leaked **7 vite servers + a headless Chromium spinning at 622% CPU (six cores)**, which drove the machine to
**load average 25** and made the visual-capture gate time out. That looked like a "flaky gate". It was
self-inflicted.

**The rules:**
1. **Every ad-hoc Playwright/Puppeteer probe MUST close the browser in a `finally`** — not on the happy path:
   ```js
   const b = await chromium.launch(...);
   try { /* probe */ } finally { await b.close(); }   // a throw must STILL close it
   ```
2. **Never leave a hand-started dev server running.** Prefer Playwright's `webServer` config (it manages its
   own lifecycle). If you start one by hand (`npx vite --port …`), **kill it in the same turn.**
3. **Delete throwaway probe scripts** when done (`rm -f frontend/dbg-*.mjs`). Do not commit them.
4. **Sweep before you finish a session** (and any time the box feels slow):
   ```
   sh frontend/scripts/dev/kill-test-procs.sh
   ```
   It only kills THIS repo's vite + Playwright's own cached browsers. It can never touch Kevin's
   Chrome/Brave/Safari.
5. **If the machine load is high, check for leaks BEFORE blaming a flaky gate** — `uptime`, then
   `ps aux | grep -E "ms-playwright|Crafty/frontend/node_modules/.bin/vite"`. The capture harness is
   load-sensitive, and a leaked browser is the most common cause of a "mystery" timeout.
6. **cmux PREVIEW TABS are a SECOND kind of leak — the process is only half of it (Kevin, 2026-07-14).**
   cmux opens a **browser preview surface for every localhost port it detects.** Every E2E / capture /
   ad-hoc probe server spawns one, and **the tab OUTLIVES the process you kill** — `kill-test-procs.sh`
   never touched surfaces, so 30+ dead `localhost:*` / "Crafty | Magical" husks piled up across sessions.
   **Prevention is the real fix:** E2E uses ONE managed port (Playwright `webServer`, 4179 `--strictPort`);
   capture uses 4178. **Do NOT hand-start vite on an ad-hoc port** (`vite --port 4197` for a one-off probe
   is what minted the worst husks). If you truly must, reuse a fixed dedicated port and close its surface
   after. To clear husks: `sh frontend/scripts/dev/close-preview-tabs.sh` (LISTS by default; `--close` to
   close).
   **⚠️ THE FOOTGUN — do not touch `cmux close-surface` by hand.** With an UNRESOLVED `--surface` it falls
   back to closing `$CMUX_SURFACE_ID` — **your own Claude Code tab.** An autonomous loop iteration
   self-decapitated its own session this way (exit 0, "OK", session gone). The helper above is the ONLY
   sanctioned path: it excludes SELF by UUID (marker-shift-proof), matches preview titles with globs (an
   awk `\|` regex de-escapes and matches an agent tab titled "Crafty game" — the first version's bug),
   overrides `$CMUX_SURFACE_ID` to the dead target so a fall-through cannot hit you, and aborts if SELF
   ever vanishes. **The autonomous loop must NEVER auto-run `--close`** — a destructive CLI whose default
   target is the caller is not fired unattended. Loop session-close may RUN THE LIST (report only); Kevin
   or an attended agent runs `--close`.

## Build / Test / Gates (from `frontend/`)

**NINE gates authorize a push, and this doc used to name only three of them.** Until 2026-08-02 this section
listed `build` / `test:unit` / `test:visual` and never mentioned `lint`, `knip`, `gate-shape`,
`doc-currency` or `bundle-budget` — so an agent reading the project's own constitution could not know what
would block its push, and learned only by being rejected. The list below is transcribed from
`.githooks/pre-push` and `.github/workflows/ci.yml`; when they change, change this.

*This sentence read "Six" until 2026-08-03, while the table directly beneath it already showed EIGHT ✅ in
the pre-push column — a headline contradicting its own table, in the very paragraph written to fix an
undercount. Count it from the hook, never from memory:*
`grep -cE "printf '\\\\n▶" .githooks/pre-push` *(7 → 8 with cli-guard) plus `mutation-proof-trailer`, which
runs earlier and outside that pattern.*

| Gate | Command | pre-push | CI | What it actually stops |
|---|---|:--:|:--:|---|
| mutation-proof | `node scripts/ci/mutation-proof-trailer.mjs <range>` | ✅ (first) | — | a commit that ADDS a gate (`tests/gates/`, `scripts/ci/`) without a `Mutation-Proof:` trailer stating what was broken and that it went RED |
| queue-ledger | `node scripts/ci/queue-ledger.mjs` | ✅ | — | a finding added to the queue-of-record with no `▣✓/▢/⊘` marker, or a `⊘ DISMISSED` with no proof command |
| doc-currency | `node scripts/ci/doc-currency.mjs` | ✅ | ✅ | a canonical doc citing a path that no longer exists (incl. BARE, non-backticked paths), **and** a cross-doc SECTION citation aimed at a section that does not exist (zero-target; resolves headings, item ids and compound refs) |
| eslint | `npm run lint` | ✅ | ✅ | crash-class bugs + dead code; `no-unused-vars` is an **error**, and `no-undef` catches a hook wired into the wrong component |
| gate-shape | `node scripts/ci/gate-shape.mjs` | ✅ | ✅ | a test assertion satisfiable by a COMMENT alone; also ratchets the source-grep gate population |
| cli-guard | `node scripts/ci/cli-guard.mjs` | ✅ | — | a script under `scripts/` that EXPORTS a seam yet runs its CLI at module scope — importing it executes the tool. Runs BEFORE `test:unit` because that is the run it corrupts |
| unit suite | `npm run test:unit` | ✅ | ✅ | everything in `tests/**` + `src/**/*.test.js` — incl. the i18n adoption ratchet and key-resolution gates |
| build | `npm run build` | ✅ | ✅ | broken JSX/imports |
| bundle-budget | `node scripts/ci/bundle-budget.mjs` | ✅ | ✅ | a chunk growing past its byte ceiling |
| knip | `npm run knip` | — | ✅ | unused files/exports/deps |
| e2e | `npm run test:e2e` (playwright, **sharded 3×** in CI) | — | ✅ | real-input regressions; `@local-only` specs are excluded in the workflow |
| visual | `npm run test:visual` | — | — | **neither hook nor CI runs it.** Manual, before a milestone or any render change |

- `test:visual` is `capture.mjs && vitest`, i.e. it RE-CAPTURES. Never run it alongside another capture —
  both bind port 4178 with `--strictPort` and the collision fakes a failure.
- `npm run visual:capture` regenerates frames only. It preflights that the browser can present a frame and
  aborts in ~3s with a named cause if not, rather than hanging on a dead compositor.
- Visual gate is deterministic (forced `high` tier); re-baseline + human-review per intended look change.
  Capture-determinism is load-bearing (gate anims on `isCaptureMode()`; seed RNG; freeze clocks) — and the
  check must be INSIDE the interval callback, since the harness flips capture mode after mount.
- **A gate's PASS is worth nothing without its DENOMINATOR.** Seven things here have now shipped a clean
  report over input they never examined (`gate-shape` skipping 42% of gates, `doc-currency` blind to bare
  paths, a test written into `tests/visual/` which vitest EXCLUDES so it never ran, `esc-pause-probe` never
  pressing ESC twice, `tapTestId` never checking WHERE its tap landed, …). Read the count, not the tick.
  **This paragraph was already here when the last two happened** — being read at orientation is not the same
  as being salient while you write the gate, so the full checklist now lives in
  `.claude/rules/gates-and-probes.md`, which auto-loads on any edit under `frontend/tests/**` or
  `frontend/scripts/**`. Keep the two in sync; this line is the always-loaded baseline, that file is the
  moment-of-use activation.

## Execution & Workflow Protocols
- **Anti-Execution Tunneling:** don't chain many distinct fixes into a monolith. >3 logical systems OR >5 sequential code-altering calls → PAUSE, `git commit`, checkpoint via `session-archivist-kz`.
- **Read-Before-Write:** establish exact coordinates (grep/line-range) + verify target state before editing.
- **Initialization:** on turn 1, silently orient — `pwd`, git branch, `package.json` scripts, framework state — before proposing.
- **Game Loop Isolation (CRITICAL):** NEVER bind declarative React to high-frequency imperative systems (R3F `useFrame`, Rapier) via reactive state (`useState`/zustand subscriptions). Use transient reads (`refs`, `.getState()`, miniplex queries).
- **AST-Safe Edits:** never `sed`/`cat`-rewrite `.js/.jsx` (AST-safe tools/Edit only; `sed` OK for markdown). Verify behavior, not implementation. No `// ... rest of code`.

## Design Language (LOCKED — S1-C)
ONE bold-flat UI. Token SoT chain: `src/theme/tokens.js` → `src/theme/cssVars.js` (`--ui-*` vars + `applyThemeVars()`) → `tailwind.config.cjs`. **Filled 2-tone game-icons** (`src/ui/primitives/gameIcons.js`, baked from game-icons.net **CC BY 3.0** via the Iconify API) for game CONTENT (items/spells/mobs/achievements); **lucide outline** for app-chrome. The 7 primitives live in `src/ui/primitives/`. i18n in `src/i18n/` (en default + lazy-CJK zh-CN). **NO emoji in `src/`** (zero-emoji hard gate). game-icons.net attribution is owed → a Credits screen.

## Commit Conventions
- NO "Generated with" / "Co-Authored-By: Claude" footer. Subagent fix-ups = NEW commits (never `git commit --amend` / `reset`).

## Method
Subagent-driven-development (Opus 4.8) per task: implementer + spec-compliance review + code-quality review; sequential where files are shared; HARD GATE — an approved design/spec before implementation; superpowers `writing-plans` for plan authoring. Plans/specs live in `docs/superpowers/`.
- **EVERY milestone uses the `superpowers:writing-plans` discipline (Kevin, 2026-06-10):** before building ANY milestone (M0..Mn of any Aspect/stream), author its own plan doc in `docs/superpowers/plans/YYYY-MM-DD-crafty-<stream>-<milestone>.md` (TDD red-first steps + verification gates), THEN build. **No "build directly from the spec" shortcuts**, even for small/foundational milestones — the VOIDHAND-M1 skip (built from the spec's milestone breakdown without a plan doc) is the anti-pattern this rule forbids. The design SPEC is the HARD-GATE approval; the per-milestone PLAN is the build contract.

## Core Agent Skills (evaluate per task)
- `brainstorming` — before new game features / UI.
- `react-perf-audit-kz` — frame rates, re-renders, stale closures in the R3F/React bridge.
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

This file is the ONLY one auto-loaded, and the only surface re-injected after a `/compact` — so it has to
name the others. **Until 2026-08-03 it never mentioned `memory/STATUS.md` at all**, which meant a
freshly-compacted agent was pointed at the cursor and never at the registry. Order matches
`LOOP-CHARTER.md` §0-A so the two documents cannot disagree:

1. **`git main`** — the code is the only truth that cannot lie.
2. **`memory/STATUS.md`** — where we are · the open-work REGISTRY · what's next. **THE source of truth.**
3. **`memory/ACTIVE_PLAN.md`** — the live cursor: the ONE unit in flight.
4. **`docs/superpowers/LOOP-CHARTER.md`** — how the loop operates (+ `LOOP-KERNEL-PROMPT.md`, the durable
   copy of the `/loop` prompt and the cold/git-only recovery source).
5. **`docs/superpowers/DECISIONS.md`** — what has already been decided. Check before re-raising or
   reversing anything; `KEVIN-REVIEW-BATCH.md` is the append-only INBOX and cannot tell you what is settled.
6. **`docs/superpowers/INDEX.md`** — the doc map. A stale doc is a live trap; never mine old plans for
   "what's next".

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
