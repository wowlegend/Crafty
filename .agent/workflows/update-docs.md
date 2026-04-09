---
description: how to update the architecture and changelog at the end of every major phase or session
---

# Update Documentation After Major Phases

At the end of each major implementation phase (or before closing the session), update `memory/CHANGELOG.md` and `memory/ARCHITECTURE.md` to reflect all changes.

## Steps

1. **Review what changed this phase/session**
   - Check `git diff` or `git log` for recent changes
   - Review modified source files or completed task checklist items

2. **Update the Changelog**
   - Add a new dated entry under `# Changelog & Development History` in `memory/CHANGELOG.md`
   - Use format: `### Month Day, Year (Phase N) — Brief Title`
   - List all features added, bugs fixed, and architectural changes

3. **Update Architecture details if needed (`memory/ARCHITECTURE.md`)**
   - New block types → update **Block Types** table
   - New mobs → update **Mob Types** table
   - New spells → update **Spell Types** table
   - New controls → update **Controls** table
   - New source files → update **Architecture** section
   - Deleted source files → remove from **Architecture** section
   - If game constants changed (RENDER_DISTANCE, etc.), update **Key Configuration**.
   - Add checkmarks for newly tested features under **Testing Status**.

4. **Document code cleanup or refactoring in `CHANGELOG.md`**
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
