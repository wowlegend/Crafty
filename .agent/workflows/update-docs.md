---
description: how to update the architecture, changelog, and roadmap at the end of every major phase or session
---

# Update Documentation After Major Phases

At the end of each major implementation phase (or before closing the session), update the modular memory structure (`CHANGELOG.md`, `ARCHITECTURE.md`, `ROADMAP.md`) to reflect all changes, and clear the `ACTIVE_PLAN.md`.

## Steps

1. **Review what changed this phase/session**
   - Check `git diff` or `git log` for recent changes
   - Review `memory/ACTIVE_PLAN.md` to see the completed checklist.

2. **Update the Changelog (`memory/CHANGELOG.md`)**
   - Add a new dated entry under `# Changelog & Development History`.
   - Use format: `### Month Day, Year (Phase N) — Brief Title`
   - List all features added, bugs fixed, and architectural changes.

3. **Update Architecture details if needed (`memory/ARCHITECTURE.md`)**
   - New source files → update **Architecture** section
   - Deleted source files → remove from **Architecture** section
   - If game constants/configs changed, update them.

4. **Update the Roadmap (`memory/ROADMAP.md`)**
   - If a feature was completed, remove it from the Roadmap (or check it off if you prefer preserving the history).
   - Add any new technical debt or requested features discovered during the session to the Roadmap.

5. **Clear the Active Plan (`memory/ACTIVE_PLAN.md`)**
   - Reset the scratchpad so the `Current Task:` section is wiped and ready for the next agent session, but **always preserve the instructional preamble sentences at the top of the file**.

6. **Document code cleanup or refactoring in `CHANGELOG.md`**
   - Dead files removed (which ones and why)
   - Dependencies added or removed
   - console.logs cleaned (count)
   - Significant comment/code simplification
   - Total file/size impact

## Tech Stack Reference

- **Build**: Vite 6.4 (NOT CRA/webpack)
- **React**: React 19 (NO StrictMode in dev)
- **File extensions**: `.jsx` (not `.js`)
- **Dev command**: `npm run dev` (starts Vite dev server)
- **Build command**: `npx vite build`
- **Physics**: @react-three/rapier (TrimeshCollider for terrain)
- **3D**: @react-three/fiber + drei
- **State**: Zustand (`useGameStore`)
- **ECS**: miniplex (for NPC logic)

## Important Notes

- Always use actual source code as source of truth, not memory.
- Keep entries concise but comprehensive.
- **Cleanup and refactoring work is a real change — always document it.**
