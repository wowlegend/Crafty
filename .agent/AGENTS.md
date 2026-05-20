# Crafty — Project Agent Instructions

## Tech Stack & Architecture
- **Core:** React 19, Three.js (R3F), Vite
- **Game Architecture:** ECS (Entity-Component-System) via `miniplex`. Keep logic in Systems, data in Components.
- **Physics & UI:** `@react-three/rapier` (Physics), `framer-motion` (UI), `Zustand` (Global App State).
- **Styling:** TailwindCSS
- **Language:** JavaScript (JSX)
- **Package Manager:** npm (using package-lock.json)

## Execution & Workflow Protocols
- **Anti-Execution Tunneling (CRITICAL):** Do not chain multiple distinct features/fixes into a monolith. If an ongoing task modifies >3 distinct logical systems or requires >5 sequential code-altering tool calls, PAUSE. Autonomously execute a `git commit`, then run the `session-archivist-kz` skill to checkpoint progress before continuing.
- **Read-Before-Write:** Before surgical modifications, explicitly use text discovery (`grep_search` or line ranges) to establish exact coordinates. Verify the target state before applying edits.
- **Initialization:** On turn 1, silently orient: run `pwd`, identify the git branch, read `package.json` scripts, and verify the framework state before proposing solutions.

## Performance & Coding Standards
- **Architecture-First (Tell, Don't Ask):** Decompose before building. Never start writing code until you understand the component boundaries.
- **Game Loop Isolation:** NEVER bind declarative React frameworks with high-frequency imperative systems (R3F `useFrame`, Rapier physics) using reactive state (`useState`/Zustand subscriptions). Use transient reads (`refs`, `.getState()`, or Miniplex queries).
- **AST-Safe Edits:** Pure AST tools are context-blind. Merge AST with domain-specific sweeps for cleanup. Verify behavior, not implementation. Never use `// ... rest of code`.

## Core Agent Skills
Always evaluate invoking these specialized skills based on the task:
- **`brainstorming`:** Use before creating new game features or UI components.
- **`react-perf-audit-kz`:** Use to audit frame rates, re-renders, and stale closures in the R3F/React bridge.
- **`ruthless-cleaner-kz`:** Invoke when auditing, refactoring, or cleaning up ECS systems and dead code.
- **`pre-commit-kz`:** Run BEFORE any git commit to catch debug commands and broken builds.

## Session Documentation (The 4-Piece Method)
Use the `session-archivist-kz` skill strictly. After major tasks, update the `memory/` directory:
- `ACTIVE_PLAN.md` — Must be updated BEFORE execution.
- `CHANGELOG.md` — Historical record (reverse-chronological, newest at top).
- `ARCHITECTURE.md` — Current blueprint, ECS structure, and tech specs.
- `ROADMAP.md` — Future goals and features.

## Project-Specific Workflows
Check `.agent/workflows/` for domain-specific debug workflows:
- `debug-physics-Crafty-kz` — Rapier physics collision / terrain issues
- `fix-movement-Crafty-kz` — WASD, camera, pointer lock movement issues
