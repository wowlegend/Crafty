# S3-M4 — AdvancedGameFeatures Dissolve, Part 2 (survival + the upgrades hook) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M4). Part 1 shipped the 2 panels (→ui/) + the 3 accrual hooks (→world/); AGF is now 1120 LOC. Part 2 takes the next-safest cores — the **survival domain + the lone spell-upgrades hook** (both capture-clean: no survival fixture in any baseline, verified). **Boss (the trap-3 indexOf + the gated boss-obsidian/boss-closeup baselines) = Part 3 [reviewed]; pets = a separate part.** Extraction-only — NO behavior change.

**Goal:** Extract the survival domain (`useSurvivalMode` → `world/survivalSystem.js`; `SurvivalWarning` → `ui/SurvivalWarning.jsx`) and the spell-upgrades hook (`useSpellUpgrades` → `world/spellUpgrades.js`) out of AdvancedGameFeatures. AGF ~1120 → ~995 LOC, leaving just the boss + pet domains.

**Architecture:** Same proven safe-strip pattern (byte-exact anchored slice; capture-clean → no re-baseline). Target convention: non-R3F system/progression hooks → `world/*.js`; HUD warning comp → `ui/*.jsx`. ONE trap-1 gate repoint (siege-gates follows `useSurvivalMode`). The boss capture indexOf anchor (character-render-gates) is NOT touched (boss stays).

**Tech Stack:** React hooks + a framer-motion/Toast HUD comp (verbatim moves); vitest static gates; the visual gate is unaffected (survival's only render, SurvivalWarning, is a night-transition toast — capture-suppressed).

---

> **Verified at plan time (live, post-part-1, 2026-06-13):**
> - **Boundaries:** `useSurvivalMode` :14-66 · `SurvivalWarning` :67-87 · `useSpellUpgrades` :1070-1120 (the file tail). Boss (:88-764) + pets (:765-1069) stay.
> - **Importers:** `App.jsx` imports `useSurvivalMode` + `useSpellUpgrades` (+ `useBossSystem`, `usePetSystem` which STAY); `HUD.jsx:17` imports `SurvivalWarning` (+ `PetIndicator`, `BossHealthBar` which STAY).
> - **Deps (dep-usage grep):** `useSurvivalMode` → `useEffect, useRef, useState` (react) + `useGameStore`. `SurvivalWarning` → React(memo) + `motion` (framer) + `Icon, Toast` (ui/primitives). `useSpellUpgrades` → `useState, useEffect, useCallback` (react) + `useGameStore`. (None use isCaptureMode/THREE/GameMethods.)
> - **The trap-1 gate:** `siege-gates.test.js:15` reads `src/AdvancedGameFeatures.jsx` + asserts `useSurvivalMode` (a) does NOT write dangerLevel from isDay, (b) reads `useGameStore((s) => s.nightCount)` (the single-SoT). Both follow `useSurvivalMode` to `world/survivalSystem.js`.
> - **Capture-clean:** no survival/upgrades capture fixture exists (capture.mjs states: menu/explore/boss/closeups/showcases — none trigger a night-transition toast or the upgrade panel). → no baseline shift.
> - **NOT in scope:** boss (Part 3, the indexOf + boss baselines + danger-bridge-gates), pets (separate part — usePetSystem/PetIndicator/PetEntities).

### T1 — the survival domain → `world/survivalSystem.js` + `ui/SurvivalWarning.jsx`

**Files:** Create `frontend/src/world/survivalSystem.js` + `frontend/src/ui/SurvivalWarning.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`, `frontend/src/HUD.jsx`, `frontend/tests/gates/siege-gates.test.js`

- [ ] **Step 1:** Create `src/world/survivalSystem.js`: header `import { useEffect, useRef, useState } from 'react'; import { useGameStore } from '../store/useGameStore';` + a docstring (`// survivalSystem.js — the day/night survival hook (extracted from AdvancedGameFeatures S3-M4 part 2: same nightCount-single-SoT + dawn-bleed + dawn-reward behavior; mounted once in App). NOTE: it deliberately does NOT write dangerLevel (the boss bridge is the sole dangerLevel writer — siege-gates locks this).`) then move `export const useSurvivalMode = (isDay) => { ... };` VERBATIM (AGF :14-66; confirm the close at build).
- [ ] **Step 2:** Create `src/ui/SurvivalWarning.jsx`: header `import React from 'react'; import { motion } from 'framer-motion'; import { Icon, Toast } from './primitives/index.js';` then move `export const SurvivalWarning = React.memo(({ message }) => { ... });` VERBATIM (AGF :67-87).
- [ ] **Step 3:** In `AdvancedGameFeatures.jsx`: DELETE both blocks (:14-87); grep-verify + prune any now-dead imports (likely NONE — boss/pets reuse react hooks + useGameStore + motion/Icon/Toast; confirm each before pruning, the part-1 discipline).
- [ ] **Step 4:** Repoint importers — `App.jsx`: move `useSurvivalMode` to `import { useSurvivalMode } from './world/survivalSystem';` (keep useBossSystem/usePetSystem on AGF; useSpellUpgrades moves in T2). `HUD.jsx`: move `SurvivalWarning` to `import { SurvivalWarning } from './ui/SurvivalWarning';` (keep PetIndicator/BossHealthBar on AGF).
- [ ] **Step 5 (TRAP 1, same commit):** Repoint `siege-gates.test.js` — change its `read('src/AdvancedGameFeatures.jsx')` to `read('src/world/survivalSystem.js')` for the two `useSurvivalMode` assertions (no-dangerLevel-write + nightCount-from-store). Justify in the commit body; intent preserved verbatim.
- [ ] **Step 6:** Full battery from `frontend/` (absolute path): `cd /Users/kz/Code/Crafty/frontend && npx vitest run` (holds) · `npm run build` clean (headers resolve) · `npx vitest run --config vitest.visual.config.js` (13/13). Commit `refactor(s3-m4): the survival domain extracts to world/survivalSystem.js + ui/SurvivalWarning.jsx`

### T2 — the spell-upgrades hook → `world/spellUpgrades.js`

**Files:** Create `frontend/src/world/spellUpgrades.js`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`

- [ ] **Step 1:** Create `src/world/spellUpgrades.js`: header `import { useState, useEffect, useCallback } from 'react'; import { useGameStore } from '../store/useGameStore';` + docstring + move `export const useSpellUpgrades = () => { ... };` VERBATIM (AGF :1070-1120, the tail; confirm close at build — note SpellUpgradePanel already left in part 1, so useSpellUpgrades is the last export).
- [ ] **Step 2:** In `AdvancedGameFeatures.jsx`: DELETE the block; grep-verify + prune any now-dead imports (confirm none).
- [ ] **Step 3:** Repoint `App.jsx`: move `useSpellUpgrades` to `import { useSpellUpgrades } from './world/spellUpgrades';`.
- [ ] **Step 4:** VERIFY no gate references useSpellUpgrades by path (grep `tests/` for `useSpellUpgrades`/`SPELL_UPGRADES` — aspect-trees-gates was repointed in part 1; confirm nothing else pins it in AGF). Full battery → commit `refactor(s3-m4): the spell-upgrades hook extracts to world/spellUpgrades.js`

### T3 — close-out

- [ ] Banner THIS plan `✅ SHIPPED`; update the spec's S3-M4 row (part 2 done; **Part 3 = pets, Part 4 = boss [the trap-3 indexOf + the gated boss baselines, reviewed]**). Update `memory/ACTIVE_PLAN.md` → NEXT = **S3-M4 Part 3 (pets: usePetSystem→world/, PetIndicator→ui/, PetEntities→render/; verify the allegiance-gates file-list)**, with boss as Part 4. CHANGELOG entry. AGF LOC noted. (Review optional — same proven capture-clean safe pattern; boss part 4 gets the review.)

## Self-review
- **Spec coverage:** the survival domain + the upgrades hook — the next-safest non-boss cores. Pets + boss explicitly deferred (each its own part).
- **Trap catalog:** 1 — FIRES ONCE (siege-gates → survivalSystem), repointed T1-5. 2 — N/A (no postMessage/no-re-mesh). 3 — the boss indexOf anchor (character-render-gates) is SAFE: boss does not move (Part 3/4). 4 — N/A (hooks are App-mounted, not Player-loop SM blocks). 5 — N/A.
- **Placeholder scan:** exact line ranges + verified dep sets (the headers are concrete); the importer repoints are named; the gate repoint is the exact read-path swap. The "confirm close at build" + "grep-verify dead imports before pruning" are named proven procedures (part-1-established), not vague TODOs.
- **Type/path consistency:** `world/*.js` import store via `../store`; `ui/SurvivalWarning.jsx` imports primitives via `./primitives/index.js`; siege-gates reads the path T1 creates.
- **Ratchet:** no test weakened; 1 gate repoint preserves intent; capture-clean → no re-baseline; count holds. Extraction-only → clean reverts.
