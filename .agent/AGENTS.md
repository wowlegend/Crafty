# Crafty — Project Agent Instructions

## Tech Stack
- React 18, Three.js (R3F), Zustand, Vite
- Language: JavaScript (JSX)
- Styling: TailwindCSS
- Package manager: pnpm

## Coding Standards
- Think step-by-step. Validate empirically. Never use `// ... rest of code`.
- Initialization: Run `pwd`, identify git branch, read `package.json` scripts, verify framework before proposing solutions.
- When bridging React with game loops / WebGL / real-time systems, NEVER bind with reactive state. Use refs or `.getState()`.
- Pure AST tools are context-blind. Merge AST with domain-specific sweeps for cleanup.

## Session Documentation
Use the `session-archivist` skill. After major tasks, update files in `memory/`:
- `ACTIVE_PLAN.md` — Current sprint / task checklist
- `CHANGELOG.md` — Historical record (reverse-chronological, newest at top)
- `ARCHITECTURE.md` — Current blueprint and tech specs
- `ROADMAP.md` — Future goals and features (priority-descending, most urgent at top)

## Codebase Maintenance
When cleaning up or auditing code, invoke the `ruthless-cleaner` skill.

## Project-Specific Workflows
Check `.agent/workflows/` for domain-specific debug workflows:
- `debug-physics-Crafty-kz` — Physics collision / terrain issues
- `fix-movement-Crafty-kz` — WASD, camera, pointer lock movement issues
