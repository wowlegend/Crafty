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
- **Architecture reality (per the 2026-05-30 S0 audit — do NOT trust older "clean ECS" claims):** the codebase is **MONOLITHIC** (~14.4k LOC / ~31 JS(X) files; originally 5 god-files >900 LOC, now (post-S3 + v6 de-monolith) **2 still >900 (verified 2026-06-29): Components ~1345, GameScene ~933** — SimplifiedNPCSystem 934→670 (v6 Phase A: MinimapSync/EnemyProjectile/Spawner systems → `src/systems/`, more pending), ui/GamePanels 1094→739 @ iter 148 (CraftingTable+itemUi → ui/panels/), EnhancedMagicSystem 904→474 @ iter 152 (spellVfx render group → render/spellVfx.jsx), SoundManager dropped under, AdvancedGameFeatures deleted @ S3-M4). `miniplex` ECS is a **NARROW** slice — real + load-bearing for **mobs/loot/XP only**, NOT the whole architecture. De-monolithing the god-files + ECS hardening is an **S3** goal, not the current state.
- Engine CORE is real — KEEP, don't rewrite (greedy mesher, DataArrayTexture, Rapier KCC, A* worker, audio occlusion, day/night, chunk-dispose). Touch/mobile is now BUILT (iPad/iPhone, 2026-06-15) — iOS cold-start was Pointer-Lock-gated and is bridged via `enterPlay()` (src/MenuSystem.jsx); QuestTracker collapses on touch, compact SimpleExperienceBarTouch readout, deterministic `scripts/visual/touch-probe.mjs` gate; only real-device feel is Kevin-gated. The real test surface is the vitest unit suite (~1660 tests) + the 21-state puppeteer visual gate (the old blind `test_swarm.js` rubber-stamp was deleted) — but still distrust old "100% green/SOTA" doc claims; verify against live code + the gates.

## Build / Test (from `frontend/`)
- `npm run build` · `npm run test:unit` (vitest) · `npm run test:visual` (puppeteer+pixelmatch, 6% gate) · `npm run visual:capture` (regen frames).
- Visual gate is deterministic (forced `high` tier); re-baseline + human-review per intended look change. Capture-determinism is load-bearing (gate anims on `isCaptureMode()`; seed RNG; freeze clocks).

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

## Resume after compaction
Read `memory/ACTIVE_PLAN.md` (the resume pointer) FIRST → then the active `docs/superpowers/plans/*.md`.
Ground truth = git `main` + `docs/superpowers/`.

## Compaction instructions (the compactor reads this section — keep it)
When compacting this session, ALWAYS preserve verbatim: (1) the current milestone + its plan-doc path;
(2) the latest test/build/visual gate counts and whether they were green; (3) the exact resume pointer
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
