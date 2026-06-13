# S3-M4 — AdvancedGameFeatures Dissolve, Part 4 (the BOSS domain — the finale) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M4). Parts 1-3 cleared the capture-clean surface (AGF 1397→689). **This is the RISKY finale** — the boss is the LAST domain, and (a) it carries the trap-3 indexOf capture-anchor, (b) it IS in the gated `boss-obsidian` + `boss-closeup` baselines, (c) two gates pin it (character-render ×3, danger-bridge ×2). After it, **AGF is deleted** (zero importers) → S3-M4 closes. Extraction-only — byte-exact → the boss renders identically → the 2 boss baselines SHOULD hold 13/13 (VERIFY; the part-1 lesson: don't trust gate-pass, measure the actual diff; any sub-6% drift = a deliberate re-baseline w/ HD eyeball). **An adversarial review IS warranted** (run it after the build, before close-out).

**Goal:** Dissolve the boss domain into 4 files — `game/bossConfig.js` (BOSS_CONFIG), `world/bossSystem.js` (useBossSystem + the dangerLevel bridge), `ui/BossHealthBar.jsx`, `render/BossEntity.jsx` — then DELETE `AdvancedGameFeatures.jsx` (now empty). 5 gate-assertion repoints; the boss baselines verified byte-stable.

**Architecture:** Staged (config first, then the 3 consumers), each a checkpointed commit. The riskiest (BossEntity — the trap-3 + the baselines) is isolated to its own task with a dedicated baseline verify. BOSS_CONFIG becomes an `export` consumed by all 3 boss files. Convention: data → game/, system hook → world/, HUD → ui/, R3F render → render/.

**Tech Stack:** React hooks + a Panel/StatBar HUD + a heavy R3F (useFrame/THREE/Outlines) render comp (verbatim moves); vitest gates; the visual gate is the load-bearing check for BossEntity (the boss appears in 2 gated baselines).

---

> **Verified at plan time (live, post-part-3, 2026-06-13):**
> - **Boundaries:** `const BOSS_CONFIG` :14-33 · `useBossSystem` :34-146 · `BossHealthBar` :147-241 · `BossEntity` :242-689 (EOF). After all 4 move, AGF holds only its (now-dead) import block → DELETE it.
> - **BOSS_CONFIG consumers:** all three — useBossSystem (health/phases/xpReward), BossHealthBar (name/phases), BossEntity (phases/colors/secondaryColor/attackRange/attackCooldown). → `export const BOSS_CONFIG` in `game/bossConfig.js`; the 3 import it.
> - **Deps (dep-usage grep):** `useBossSystem` → useState/useEffect/useRef/useCallback + useGameStore + GameMethods + BOSS_CONFIG (its capture-guard uses `useGameStore.getState().isCaptureMode` the STORE FLAG, NOT the imported fn → no isCaptureMode import). `BossHealthBar` → React + Panel/StatBar/Icon + useGameStore + BOSS_CONFIG. `BossEntity` → React + useState/useEffect/useRef/useCallback + useFrame/useThree + Outlines + `* as THREE` + motion (verify/prune at build — 1 match, may be comment) + useGameStore + `isCaptureMode` (the imported fn — the trap-3 guard `if (isCaptureMode()) {`) + OUTLINE (render/characterStyle) + TIERS (render/quality) + BOSS_CONFIG.
> - **Importers:** App (`useBossSystem`), HUD (`BossHealthBar`), GameScene (`BossEntity`). After part 4 NOTHING imports AGF (parts 1-3 already moved every other consumer) → AGF deletable.
> - **The 5 gate repoints:** character-render-gates ×3 (boss emissive `emissive={bodyEmissive}`+`emissiveIntensity={emissiveIntensityVal}`, boss-not-toon `not /MobToonMaterial/`, boss-capture-indexOf `if (isCaptureMode()) {` before `bossPositionRef.current = [next`) → all read `src/render/BossEntity.jsx`. danger-bridge-gates ×2 (`setDangerLevel(bossActive ? 2 : 0)` + its capture-guard) → read `src/world/bossSystem.js`. [character-render's M2b worker-tick `it` reads SimplifiedNPCSystem — UNCHANGED.]
> - **The allegiance gate file-list:** `allegiance-gates.test.js` reads `AdvancedGameFeatures.jsx` in its worldBlocks-comma-key array — at AGF DELETION, drop `'AdvancedGameFeatures.jsx'` from that array (boss touches no worldBlocks; the moved boss files don't either → no replacement needed).
> - **Baselines:** boss-obsidian + boss-closeup (both gated) render the boss → byte-exact should hold; the boss-closeup uses the dev `forceBossSpawn` hook (in useBossSystem) → confirm that dev hook still wires after the move.

### T1 — `game/bossConfig.js` (BOSS_CONFIG)

**Files:** Create `frontend/src/game/bossConfig.js`; Modify `frontend/src/AdvancedGameFeatures.jsx`

- [ ] Create `src/game/bossConfig.js`: docstring + `export const BOSS_CONFIG = { ... };` VERBATIM (:14-33). In AGF: replace the `const BOSS_CONFIG = {...}` block with `import { BOSS_CONFIG } from './game/bossConfig.js';` (top, beside the other `./game/*` imports). Battery → commit `refactor(s3-m4): BOSS_CONFIG extracts to game/bossConfig.js`. (This stages the shared data so the next 3 tasks import it cleanly; the boss code in AGF still works via the import.)

### T2 — `world/bossSystem.js` (useBossSystem + the dangerLevel bridge)

**Files:** Create `frontend/src/world/bossSystem.js`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`, `frontend/tests/gates/danger-bridge-gates.test.js`

- [ ] Header `import { useState, useEffect, useRef, useCallback } from 'react'; import { useGameStore } from '../store/useGameStore'; import { GameMethods } from '../GameMethods'; import { BOSS_CONFIG } from '../game/bossConfig.js';` + move `export const useBossSystem = (playerLevel) => { ... };` VERBATIM. Delete from AGF (BOSS_CONFIG import stays in AGF — BossHealthBar/BossEntity still use it until T3/T4). Repoint App's `useBossSystem` → `./world/bossSystem`.
- [ ] **TRAP 1 (same commit):** repoint `danger-bridge-gates.test.js` `read('src/AdvancedGameFeatures.jsx')` → `read('src/world/bossSystem.js')` (both the `setDangerLevel(bossActive ? 2 : 0)` + capture-guard `it`s). Battery → commit `refactor(s3-m4): useBossSystem + the dangerLevel bridge extract to world/bossSystem.js`.

### T3 — `ui/BossHealthBar.jsx`

**Files:** Create `frontend/src/ui/BossHealthBar.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/HUD.jsx`

- [ ] Header `import React from 'react'; import { Panel, StatBar, Icon } from './primitives/index.js'; import { useGameStore } from '../store/useGameStore'; import { BOSS_CONFIG } from '../game/bossConfig.js';` + move `export const BossHealthBar = React.memo(...)` VERBATIM. Delete from AGF; repoint HUD's `BossHealthBar` → `./ui/BossHealthBar`. Battery → commit `refactor(s3-m4): BossHealthBar extracts to ui/`.

### T4 — `render/BossEntity.jsx` (the trap-3 + the gated baselines — the careful one)

**Files:** Create `frontend/src/render/BossEntity.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/GameScene.jsx`, `frontend/tests/gates/character-render-gates.test.js`

- [ ] Header `import React, { useState, useEffect, useRef, useCallback } from 'react'; import { useFrame, useThree } from '@react-three/fiber'; import { Outlines } from '@react-three/drei'; import * as THREE from 'three'; import { useGameStore } from '../store/useGameStore'; import { isCaptureMode } from '../devtest/captureMode'; import { OUTLINE } from './characterStyle'; import { TIERS } from './quality'; import { BOSS_CONFIG } from '../game/bossConfig.js';` (+ `import { motion } from 'framer-motion';` ONLY if the build-time grep confirms BossEntity uses `<motion`). Move `export const BossEntity = React.memo(...)` VERBATIM (the big R3F block — anchored slice; do NOT hand-transcribe). Delete from AGF; repoint GameScene's `BossEntity` → `./render/BossEntity`.
- [ ] **TRAP 1+3 (same commit):** repoint character-render-gates' 3 boss `it`s — change their `read('src/AdvancedGameFeatures.jsx')` → `read('src/render/BossEntity.jsx')` (the emissive, the non-toon, and the indexOf capture-gate-before-movement). The indexOf assertion now finds the boss `if (isCaptureMode()) {` + `bossPositionRef.current = [next` in BossEntity.jsx (byte-exact preserves the guard-before-movement order). [The M2b worker-tick `it` stays reading SimplifiedNPCSystem.]
- [ ] **Battery + the BASELINE VERIFY (load-bearing):** `npx vitest run` · `npm run build` · the visual gate. The boss is in `boss-obsidian` + `boss-closeup` — byte-exact extraction SHOULD hold 13/13. If it does NOT, do NOT blind-rebaseline: re-capture, measure the actual diff %, HD-eyeball the 2 boss frames (the part-1 lesson), confirm the only delta is acceptable, then deliberate-rebaseline + KRB entry. Commit `refactor(s3-m4): BossEntity extracts to render/ (the trap-3 indexOf + the 3 boss gates repoint)`.

### T5 — DELETE AdvancedGameFeatures.jsx + close S3-M4

**Files:** Delete `frontend/src/AdvancedGameFeatures.jsx`; Modify `frontend/tests/gates/allegiance-gates.test.js`

- [ ] Verify ZERO importers remain: `grep -rn "AdvancedGameFeatures" src/` = 0. (Parts 1-3 + T2/T3/T4 moved every export.) If any straggler, repoint it first.
- [ ] Drop `'AdvancedGameFeatures.jsx'` from the allegiance-gates worldBlocks-comma-key file array (the file is gone; the boss code that moved touches no worldBlocks).
- [ ] `git rm frontend/src/AdvancedGameFeatures.jsx`. Full battery (the file is gone → any missed import fails the build LOUDLY). **Run the adversarial-review workflow** over the full part-4 delta (byte-equality of the boss bodies / the 5 gate repoints faithful + non-vacuous / the baselines genuinely byte-stable / no dangling AGF ref). Fix confirmed findings.
- [ ] Close-out: banner this plan ✅ SHIPPED; the spec's S3-M4 row → **✅ COMPLETE (AGF dissolved, 1397→0 — file deleted)**; refresh SOTA §3 (a god-file eliminated); CHANGELOG milestone entry; ACTIVE_PLAN → an EXPERIENCE INTERLEAVE is now due (night-siege juice = the ranked fast-follow) OR S3-M5 (Components). Commit `refactor(s3-m4): AGF dissolved — delete the emptied god-file; S3-M4 COMPLETE`.

## Self-review
- **Spec coverage:** the boss domain (the last AGF surface) → 4 files + the file deletion = S3-M4 done. The de-monolith ladder's M4 fully closed.
- **Trap catalog:** 1 — FIRES at T2 (danger-bridge) + T4 (character-render ×3) + T5 (allegiance file-list); all repointed same-commit. 3 — the boss indexOf anchor MOVES this time (it's the boss being extracted) → T4 repoints character-render to read BossEntity.jsx where the guard-before-movement order is byte-preserved (the loud-fail the trap warns of is AVERTED by the same-commit repoint). 2 — N/A (boss has no postMessage/worldBlocks). 4 — N/A (useBossSystem is App-mounted). 5 — N/A.
- **Placeholder scan:** exact ranges + verified dep sets; the 5 gate repoints are exact read-path swaps; the `motion`-in-BossEntity + the dev `forceBossSpawn` wiring are named build-verify steps; the baseline verify is explicit (measure, don't trust). The AGF deletion is gated on a grep-verify of zero importers.
- **Type/path consistency:** `game/bossConfig.js` is pure data; `render/BossEntity.jsx` imports `./characterStyle`+`./quality` (same-dir) + `../game/bossConfig.js`; `world/bossSystem.js` + `ui/BossHealthBar.jsx` import `../game/bossConfig.js`. All 3 consumers share the one BOSS_CONFIG export.
- **Ratchet:** no test weakened; 5 repoints preserve intent; the boss baselines are byte-verified (or deliberately rebaselined w/ eyeball). Count holds. Extraction-only → clean revert if T4's baseline can't verify.
