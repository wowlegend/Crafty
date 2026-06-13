# S3-M4 — AdvancedGameFeatures Dissolve, Part 1 (the safe strips) — Implementation Plan

> **✅ SHIPPED (2026-06-13, loop iter 100):** T1 the 2 panels (SpellUpgradePanel + ChestInventoryPanel) → `ui/` (a9ceed8; 5 dead imports pruned, the aspect-trees-gates trap-1 repoint) · T2 the 3 accrual hooks → `world/accrualHooks.js` (def1e37; 4 dead imports pruned, the kill-attribution-gates trap-1 repoint). Both byte-exact (anchored slice) + capture-clean (no re-baseline). **AGF 1397 → 1120 LOC** (−18.4k chars). The boss indexOf gate (trap 3) verified untouched. 874 unit/105 files · build · visual 13/13. **Part 2 (the stateful cores: boss/pet/survival + the indexOf gate) is the next S3-M4 unit.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (the S3-M4 row + the 5-trap catalog). AGF is the 3rd-biggest god-file (1397 LOC, 4+ domains, 6 gates incl. the boss capture indexOf anchor). The de-monolith pattern is now 3×-proven (M1 SoundManager, M2 EnhancedMagicSystem, M3 NPC strips). **Prime directive: extraction-only — NO behavior change.** Behavior locks: the 13-frame visual gate, 874 unit tests, 26 static-gate files.

**Goal:** Peel the two SAFEST surfaces off AdvancedGameFeatures.jsx — the two standalone UI panels (→ `ui/`, mirroring S3-M3's TradingInterface/CombatInstructions) and the three Aspect-economy accrual hooks (→ `world/accrualHooks.js`) — leaving the stateful boss / pet / survival SYSTEMS (the indexOf-gated, render-heavy cores) for Part 2. AGF shrinks ~1397 → ~1120 LOC.

**Architecture:** Two independent extractions, each with ONE trap-1 gate repoint (same commit). Target convention (S3-established): standalone panels → `src/ui/`; event-driven world-state system hooks → `src/world/` (the accrual hooks are non-R3F `useEffect` kill-bus subscriptions — not pure-logic [game/], not render [render/], not UI [ui/]; `world/` is the systems bucket). The boss capture indexOf anchor (character-render-gates) stays VALID because the boss code does NOT move in Part 1.

**Tech Stack:** React 19 components/hooks (verbatim moves); vitest static gates (path-addressed readFileSync regex); the visual gate is the render-side lock (the panels are capture-suppressed — opened only by user action — so they don't appear in baselines; the accrual hooks self-null in capture).

---

## AGF domain map (the dissolve plan, full)

```
src/AdvancedGameFeatures.jsx (1397 LOC) — exports + line ranges (verified 2026-06-13):
  ACCRUAL hooks   :23-47   useFerocityAccrual · useSoulAccrual · useKineticAccrual   ← PART 1 (T2)
  SURVIVAL        :48-121  useSurvivalMode · :101 SurvivalWarning                    ← Part 2
  BOSS            :122-798 BOSS_CONFIG · useBossSystem · BossHealthBar · BossEntity  ← Part 2 (the indexOf gate lives here)
  PETS            :799-1103 usePetSystem · PetIndicator · PetEntities               ← Part 2
  TALENT/CHEST    :1104-1397 useSpellUpgrades · SpellUpgradePanel · ChestInventoryPanel
                              └─ SpellUpgradePanel + ChestInventoryPanel             ← PART 1 (T1)
                              └─ useSpellUpgrades (hook, App-mounted)                ← Part 2
```

> **Verified at plan time (live, 2026-06-13):**
> - **Importers:** `MenuSystem.jsx:16` imports `{ SpellUpgradePanel, ChestInventoryPanel }`; `App.jsx:10` imports the 7 hooks (incl. the 3 accrual hooks); `HUD.jsx:17` imports `{ PetIndicator, SurvivalWarning, BossHealthBar }`; `GameScene.jsx:18` imports `{ BossEntity, PetEntities }`. Part 1 touches only the MenuSystem (panels) + App (accrual hooks) import lines.
> - **Panel deps** (both standalone, no AGF-internal refs): `useT` (i18n), `useGameStore`, `Panel/Button/Slot/StatBar/Icon/Toast` (ui/primitives), `motion/AnimatePresence` (framer-motion); SpellUpgradePanel also `ASPECT_TREES` (game/talentTree), `ASPECT_GUIDE` (game/aspectGuide); ChestInventoryPanel also `GameMethods`(verify at build). All importable → no circular import.
> - **Accrual-hook deps:** `useEffect`, `subscribeMobKill` (game/mobKillBus), `useGameStore`, `ferocityForKill` (game/ferocity), `kineticForKill` (game/kinetic), `soulForKill` (game/soul), `isCaptureMode` (devtest/captureMode). All importable.
> - **The 2 trap-1 gate repoints:** (a) `aspect-trees-gates.test.js:8-10` reads `src/AdvancedGameFeatures.jsx` + asserts `/ASPECT_TREES/` — follows SpellUpgradePanel to `ui/SpellUpgradePanel.jsx`. (b) `kill-attribution-gates.test.js:31-40` reads AGF + counts `subscribeMobKill(` (≥3) and `source === 'player' && s.isDay && !isCaptureMode()` (== subscribers) — follows the accrual hooks to `world/accrualHooks.js`.
> - **Trap 3 SAFE:** `character-render-gates.test.js:42-43` indexOf-anchors the BOSS capture guard (`if (isCaptureMode()) {` before `bossPositionRef.current = [next`) in AGF — boss does NOT move in Part 1, so the anchor stays valid. (Verify at build: confirm AGF still holds exactly the 3 `subscribeMobKill` of the accrual hooks — no boss/pet kill-subscriber would be left behind.)

---

### T1 — the two talent/chest panels → `ui/` (mirrors S3-M3)

**Files:** Create `frontend/src/ui/SpellUpgradePanel.jsx` + `frontend/src/ui/ChestInventoryPanel.jsx`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/MenuSystem.jsx`, `frontend/tests/gates/aspect-trees-gates.test.js`

- [ ] **Step 1:** Create `src/ui/SpellUpgradePanel.jsx`: enumerate its imports from AGF's header (verified deps above — `React` + `useT` + `useGameStore` + the primitives + `motion/AnimatePresence` + `ASPECT_TREES` + `ASPECT_GUIDE`; relative paths re-based one level — they're already `./...` from `src/`, so from `src/ui/` they become `../...` EXCEPT `./primitives/index.js` stays `./primitives/index.js`). Move the `export const SpellUpgradePanel = React.memo(({ onClose }) => { ... });` block VERBATIM (AGF :1156-1307; confirm the exact closing line at build). Read the block at build for the complete dep set (any helper used).
- [ ] **Step 2:** Create `src/ui/ChestInventoryPanel.jsx`: same header discipline; move `export const ChestInventoryPanel = React.memo(({ coords, onClose }) => { ... });` VERBATIM (AGF :1308-end; verify deps incl. whether it uses `GameMethods`).
- [ ] **Step 3:** In `AdvancedGameFeatures.jsx`: DELETE both `export const` blocks. Then PRUNE now-dead imports (run the S3-M3 dead-import discipline: after deleting, grep AGF for each header import — `ASPECT_TREES`, `ASPECT_GUIDE`, `Slot`, `StatBar`, `useT`, etc. — and drop any with zero remaining uses; KEEP those still used by the boss/pet/survival code that stays). Verify the build for unused-import cleanliness.
- [ ] **Step 4:** Repoint `MenuSystem.jsx:16` → `import { SpellUpgradePanel } from './ui/SpellUpgradePanel';` + `import { ChestInventoryPanel } from './ui/ChestInventoryPanel';` (two lines).
- [ ] **Step 5 (TRAP 1, same commit):** Repoint `aspect-trees-gates.test.js` — the `it('SpellUpgradePanel imports ASPECT_TREES ...')` currently reads `src/AdvancedGameFeatures.jsx`; change that read to `src/ui/SpellUpgradePanel.jsx` (the ASPECT_TREES import + usage moved with the panel). The other assertion (the live `ASPECT_TREES.map(...aspect order)` import from `game/talentTree.js`) is unchanged. Justify in the commit body.
- [ ] **Step 6:** Full battery from `frontend/` (absolute path — cwd resets between turns): `cd /Users/kz/Code/Crafty/frontend && npx vitest run` (count holds — MenuSystem panel-interaction integration test must stay green) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js` (13/13 — panels are capture-suppressed, no baseline shift). Commit `refactor(s3-m4): the talent + chest panels extract to ui/`

### T2 — the Aspect-accrual hooks → `world/accrualHooks.js`

**Files:** Create `frontend/src/world/accrualHooks.js`; Modify `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`, `frontend/tests/gates/kill-attribution-gates.test.js`

- [ ] **Step 1:** Create `src/world/accrualHooks.js` with a docstring (`// accrualHooks.js — the Aspect-economy kill-bus accrual bridges (extracted from AdvancedGameFeatures S3-M4: same player-kill/day-only/capture-guarded attribution contract). Non-R3F useEffect subscriptions, mounted once in App.`) + header `import { useEffect } from 'react'; import { useGameStore } from '../store/useGameStore'; import { isCaptureMode } from '../devtest/captureMode'; import { subscribeMobKill } from '../game/mobKillBus.js'; import { ferocityForKill } from '../game/ferocity.js'; import { kineticForKill } from '../game/kinetic.js'; import { soulForKill } from '../game/soul.js';` then move `useFerocityAccrual` + `useSoulAccrual` + `useKineticAccrual` VERBATIM (AGF :23-47).
- [ ] **Step 2:** In `AdvancedGameFeatures.jsx`: DELETE the 3 hooks; prune the now-dead imports IF unused by remaining AGF code (`subscribeMobKill`/`ferocityForKill`/`kineticForKill`/`soulForKill` — verify: do the boss/pet/survival hooks use them? almost certainly not → drop). KEEP `useGameStore`/`isCaptureMode` (still used).
- [ ] **Step 3:** Repoint `App.jsx:10` — move `useFerocityAccrual, useKineticAccrual, useSoulAccrual` out of the AGF import into `import { useFerocityAccrual, useKineticAccrual, useSoulAccrual } from './world/accrualHooks';` (keep `useSurvivalMode, useBossSystem, usePetSystem, useSpellUpgrades` on the AGF import). Mount sites unchanged.
- [ ] **Step 4 (TRAP 1, same commit):** Repoint `kill-attribution-gates.test.js:31-40` — the `it('EVERY meter accrual subscriber filters on player kills ...')` reads `agf = read('AdvancedGameFeatures.jsx')`; change to `read('world/accrualHooks.js')` (the 3 `subscribeMobKill` subscribers + the filter moved there). The QuestSystem assertion (`if (source !== 'player') return;`) is unchanged. Justify in the commit body; the invariant (filtered === subscribers, ≥3) is preserved verbatim against the new file.
- [ ] **Step 5:** Full battery → commit `refactor(s3-m4): the Aspect-accrual hooks extract to world/accrualHooks.js`

### T3 — close-out

- [ ] Banner THIS plan `✅ SHIPPED` with final counts; mark the spec's S3-M4 row (note: **part 1 of 2** — the boss/pet/survival systems + their render components + the boss indexOf gate are Part 2). Update `memory/ACTIVE_PLAN.md` → NEXT UNIT = **S3-M4 Part 2** (the stateful systems: useBossSystem+BossEntity [trap 3 — the indexOf gate repoints with the boss], usePetSystem+PetEntities, useSurvivalMode+SurvivalWarning, useSpellUpgrades; OR an experience interleave is due ~2 milestones out — track the ledger). `CHANGELOG.md` milestone entry. A short adversarial review optional given the proven pattern + the small safe surface (the panels are capture-suppressed; the accrual move is byte-verbatim + gate-locked).

## Self-review
- **Spec coverage (S3-M4 part 1):** the safe strips of the AGF dissolve — 2 panels → ui/ (T1) + accrual hooks → world/ (T2). The dangerous cores (boss/pet/survival) are explicitly Part 2. Matches the S3 ladder's "the four unrelated domains BEGIN separating."
- **Trap catalog:** 1 — FIRES TWICE (aspect-trees-gates → SpellUpgradePanel; kill-attribution-gates → accrualHooks), both repointed same-commit (Steps T1-5, T2-4). 2 — N/A (no postMessage/no-re-mesh code moves). 3 — the boss capture indexOf anchor (character-render-gates) is SAFE: boss does not move in Part 1 (verify at build that AGF still holds the boss guard + exactly the 3 accrual `subscribeMobKill`). 4 — N/A (no Player-loop SM blocks; the hooks are App-mounted, unchanged). 5 — N/A (no worker URL).
- **Placeholder scan:** the moved blocks name exact line ranges + the verified dep sets; the 2 gate repoints are the exact `it`s + their read-path swaps; the dead-import prune is a named grep-verify step (the S3-M3-proven discipline). The 2 "confirm at build" items (ChestInventoryPanel's exact closing line + GameMethods use; the exact-3 subscribeMobKill count in AGF) are named verification steps, not vague TODOs.
- **Type/path consistency:** new `ui/` files import primitives via `./primitives/index.js`, everything else via `../`; `world/accrualHooks.js` imports store/devtest/game via `../`; the gate reads resolve to the new paths the tasks create.
- **Ratchet:** no test deleted/weakened; the 2 gate repoints preserve intent (read the moved file). Count holds; the panels are capture-suppressed (no re-baseline). Extraction-only → reverts are clean if any task can't reach green.
