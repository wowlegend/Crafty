# S3-M4 — AdvancedGameFeatures Dissolve, Part 3 (the pet domain) — Implementation Plan

> **✅ SHIPPED (2026-06-13, loop iter 102, 306f4e2):** usePetSystem → `world/petSystem.js`, PetIndicator → `ui/PetIndicator.jsx`, PetEntities → `render/PetEntities.jsx`. Byte-exact + capture-clean; no dead imports (boss reuses all); no gate repoint (allegiance unaffected). **AGF 994 → 689 LOC (boss-only).** 874 unit/105 · build · visual 13/13. **Part 4 = boss (the trap-3 indexOf + gated boss baselines, reviewed) is the finale.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M4, multi-part). Parts 1+2 cleared the panels/accrual/survival/upgrades (AGF 1397→994). Part 3 takes the **pet domain** — the last non-boss surface, capture-clean (no pet fixture in any baseline). Boss = Part 4 (the trap-3 indexOf + the gated boss baselines, reviewed). Extraction-only.

**Goal:** Extract the 3 pet exports out of AGF — `usePetSystem` → `world/petSystem.js`, `PetIndicator` → `ui/PetIndicator.jsx`, `PetEntities` → `render/PetEntities.jsx` — leaving AGF as the boss-only file (~690 LOC). The proven safe-strip pattern (byte-exact anchored slice; capture-clean → no re-baseline).

**Architecture:** 3 files across the established buckets (system hook → world/, HUD panel → ui/, R3F render → render/). 3 importer repoints (App/HUD/GameScene). **NO gate repoint:** allegiance-gates' AGF reference is its worldBlocks-comma-key check (pets touch no worldBlocks); its removeComponent-isMob check targets NPC/Components only — both unaffected. The boss indexOf gate (trap 3) is untouched (boss stays).

**Tech Stack:** React hook + a Panel HUD comp + an R3F (useFrame/Outlines) render comp (verbatim moves); vitest gates; visual gate unaffected (no pet capture fixture).

---

> **Verified at plan time (live, post-part-2, 2026-06-13):**
> - **Boundaries (contiguous, the file tail):** `usePetSystem` :691-778 · `PetIndicator` :779-818 · `PetEntities` :819-EOF. Boss (:14-689) stays.
> - **Importers:** `App.jsx` (`usePetSystem`), `HUD.jsx:17` (`PetIndicator`, with BossHealthBar staying), `GameScene.jsx:18` (`PetEntities`, with BossEntity staying).
> - **Deps (dep-usage grep):** `usePetSystem` → `useCallback, useEffect, useRef, useState` (react) + `useGameStore`. `PetIndicator` → React(memo) + `Panel, Icon` (ui/primitives) + `useGameStore`. `PetEntities` → React(memo) + `useRef` (react) + `useFrame, useThree` (@react-three/fiber) + `Outlines` (@react-three/drei) + `useGameStore` + `OUTLINE` (render/characterStyle) + `TIERS` (render/quality). (None use isCaptureMode/THREE/GameMethods/motion.)
> - **No gate repoint** (allegiance unaffected — verified above). **Capture-clean** (no pet fixture in capture.mjs states).

### T1 — `usePetSystem` → `world/petSystem.js`

**Files:** Create `frontend/src/world/petSystem.js`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`

- [ ] Header `import { useState, useEffect, useRef, useCallback } from 'react'; import { useGameStore } from '../store/useGameStore';` + docstring; move `export const usePetSystem = () => { ... };` VERBATIM (:691-778). Delete from AGF; repoint App's `usePetSystem` import to `./world/petSystem`. (Done with T2/T3 in one battery — pets are one domain; commit once.)

### T2 — `PetIndicator` → `ui/PetIndicator.jsx`

**Files:** Create `frontend/src/ui/PetIndicator.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/HUD.jsx`

- [ ] Header `import React from 'react'; import { Panel, Icon } from './primitives/index.js'; import { useGameStore } from '../store/useGameStore';` + move `export const PetIndicator = React.memo(({ pets }) => { ... });` VERBATIM (:779-818). Delete from AGF; repoint HUD's `PetIndicator` import to `./ui/PetIndicator` (BossHealthBar stays on AGF).

### T3 — `PetEntities` → `render/PetEntities.jsx`

**Files:** Create `frontend/src/render/PetEntities.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/GameScene.jsx`

- [ ] Header `import React, { useRef } from 'react'; import { useFrame, useThree } from '@react-three/fiber'; import { Outlines } from '@react-three/drei'; import { useGameStore } from '../store/useGameStore'; import { OUTLINE } from './characterStyle'; import { TIERS } from './quality';` + move `export const PetEntities = React.memo(({ pets }) => { ... });` VERBATIM (:819-EOF). Delete from AGF; repoint GameScene's `PetEntities` import to `./render/PetEntities` (BossEntity stays on AGF).

### Build + close-out (one commit for the pet domain, or 1-per-export — builder's call; all 3 are independent verbatim moves)

- [ ] After the 3 moves: grep-verify + prune any now-dead AGF imports (likely NONE — BossEntity reuses useFrame/useThree/Outlines/OUTLINE/TIERS/useGameStore/useRef; BossHealthBar reuses Panel/Icon; useBossSystem reuses useCallback/useState/useEffect — confirm each before pruning).
- [ ] Full battery from `frontend/`: `npx vitest run` (holds) · `npm run build` clean (the 3 headers resolve; `render/PetEntities` imports `./characterStyle` + `./quality` — same-dir, NOT `../render/`) · visual 13/13 (capture-clean). Commit `refactor(s3-m4): the pet domain extracts to world/ + ui/ + render/`.
- [ ] Close-out: banner this plan ✅ SHIPPED; spec S3-M4 row (parts 1-3 done, part 4 = boss); CHANGELOG; ACTIVE_PLAN → **Part 4 = boss** (the trap-3 indexOf + the gated boss-obsidian/boss-closeup baselines → author its plan + an adversarial review). AGF LOC noted (~690, boss-only).

## Self-review
- **Trap catalog:** 1 — N/A this part (no gate references the pet exports by path; allegiance's AGF ref is the worldBlocks check, pets touch no worldBlocks — verified). 2 — N/A. 3 — boss indexOf anchor SAFE (boss unmoved). 4 — N/A (App-mounted hook, not a Player-loop SM block). 5 — N/A.
- **Placeholder scan:** exact ranges + verified dep sets (concrete headers); importer repoints named; the dead-import prune is the proven grep-verify step. Note the `render/PetEntities.jsx` same-dir imports (`./characterStyle`, `./quality`) — NOT `../`.
- **Ratchet:** no test touched; capture-clean → no re-baseline; count holds. Extraction-only → clean revert.
