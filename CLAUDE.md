# Crafty — Project Instructions

> Auto-loaded by Claude Code from the working tree (survives compaction). This is the
> **path source-of-truth**. If a relative `ls`/`find` disagrees with this map, the cwd is
> wrong — re-check with an ABSOLUTE path before concluding anything.

## ⚠️ REPO LAYOUT — read before ANY path/Bash op (the #1 recurring mistake)

This repo is **TWO-LEVEL**. The Bash cwd drifts between tool calls and **resets after every
compaction**. ALWAYS use absolute paths or an explicit `cd`. **NEVER** assert a file is
"missing / gone / deleted" from a relative `ls`/`find`/`grep` without re-checking the
**absolute** path first — that is the false-absence trap (it bit twice on 2026-06-01:
`ls: src: No such file or directory`, and a wrong ".superpowers is gone").

```
REPO ROOT = /Users/kz/Code/Crafty/            ← .git lives here; docs + memory + mockups live here
  ├─ .git/
  ├─ CLAUDE.md                                  ← this file
  ├─ docs/superpowers/                          ← plans/, specs/, KEVIN-REVIEW-BATCH.md
  ├─ memory/                                    ← ACTIVE_PLAN, CHANGELOG, ARCHITECTURE, ROADMAP (4-piece),
  │                                                REALITY-AUDIT-2026-05-30.md, SOTA-INITIATIVE.md (master plan)
  └─ .superpowers/                              ← GITIGNORED mockups + _icons.json (s1c-mockups/v2/);
                                                   NOT lost on compaction — it lives HERE at the root

APP DIR   = /Users/kz/Code/Crafty/frontend/    ← the React/Vite app — run npm + tests FROM HERE
  ├─ src/                                        ← ALL source (.jsx/.js). NOT at the repo root.
  ├─ tests/  gates/ (static-gates) · data/ (characterization) · visual/baseline/*.png
  ├─ scripts/visual/capture.mjs
  └─ package.json, node_modules/, vite.config.js, tailwind.config.cjs
```

**Rule of thumb:** source edits → `frontend/src/…`; npm/tests → `cd frontend && …`; plans/specs/memory →
repo ROOT (one level ABOVE `frontend/`). The compaction summary may paraphrase "Crafty = …/frontend" —
that's the APP only; docs/memory/.superpowers are at the ROOT.

## Build / test (from `frontend/`)
- `npm run build` · `npm run test:unit` (vitest) · `npm run test:visual` (puppeteer+pixelmatch, 6% gate) · `npm run visual:capture` (regen frames).
- Visual gate is deterministic (forced `high` tier); re-baseline + human-review per intended look change.

## Conventions (load-bearing)
- **Commits:** NO "Generated with" / "Co-Authored-By: Claude" footer. Subagent fix-ups = NEW commits (never `git commit --amend` / `reset`).
- **Source `.js/.jsx`:** AST-safe edits only (no `sed`/`cat` rewrites). `sed` OK for markdown docs.
- **Method:** subagent-driven-development (Opus 4.8) per task — implementer + spec-review + code-quality-review; sequential where files are shared; HARD GATE: approved design before implementation.
- **Design language:** ONE bold-flat UI (`tokens.js` → `cssVars.js` `--ui-*` → `tailwind.config.cjs`). Filled game-icons (`src/ui/primitives/gameIcons.js`, baked from game-icons.net CC BY 3.0 via Iconify) for game CONTENT; lucide outline for app-chrome. NO emoji in `src/` (zero-emoji hard gate, M3).

## Resume after compaction
Read `memory/ACTIVE_PLAN.md` (the resume pointer) FIRST → then the active `docs/superpowers/plans/*.md`.
Ground truth = git `main` + `docs/superpowers/`. Master plan = `memory/SOTA-INITIATIVE.md`.
