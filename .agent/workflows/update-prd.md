---
description: how to update the PRD at the end of every major phase or session
---

# Update PRD After Major Phases

At the end of each major implementation phase (or before closing the session), update `memory/PRD.md` to reflect all changes.

## Steps

1. **Review what changed this phase/session**
   - Check `git diff` or `git log` for recent changes
   - Review modified source files or completed task checklist items

2. **Update the Development History section**
   - Add a new dated entry under `## Development History` in `memory/PRD.md`
   - Use format: `### Month Day, Year (Phase N) — Brief Title`
   - List all features added, bugs fixed, and architectural changes

3. **Update feature tables if needed**
   - New block types → update **Block Types** table
   - New mobs → update **Mob Types** table
   - New spells → update **Spell Types** table
   - New controls → update **Controls** table
   - New source files → update **Architecture** section
   - Deleted source files → remove from **Architecture** section

4. **Update Testing Status**
   - Add checkmarks for newly tested features
   - Note any known issues or incomplete features

5. **Update Key Configuration**
   - If any game constants changed (RENDER_DISTANCE, physics params, spell costs), reflect them

6. **Document code cleanup or refactoring**
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

## Important Notes

- Always use actual source code as source of truth, not memory
- Keep entries concise but comprehensive
- PRD lives at `/Users/kz/Code/Crafty/memory/PRD.md`
- **Cleanup and refactoring work is a real change — always document it**
