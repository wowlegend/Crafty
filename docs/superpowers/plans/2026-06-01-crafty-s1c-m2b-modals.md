# Crafty S1-C-M2b — Modals Consolidation (glassmorphic → bold-flat primitives) — Implementation Plan

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **STATUS: ✅ COMPLETE + MERGED (2026-06-01)** — all 5 glass modals (Inventory/CraftingTable/MagicSystem/BuildingTools/SettingsPanel) → bold-flat primitives; `.game-panel-item` glass removed (`.game-panel` base kept — still used by QuestSystem AchievementsPanel → M2c); `inventory-open` capture state added; handlers preserved. `test:unit` 89+2todo · `test:visual` 9/9. Glass language dead; neon (M2c) next.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [x]` checkboxes. **Opus 4.8 subagents. Sequential (shared `GamePanels.jsx`). NO Claude footer. NEW commits. AST-safe edits (no `sed` on `.js/.jsx`).**

**Goal:** Migrate the 5 glassmorphic modals in `src/ui/GamePanels.jsx` (Inventory / CraftingTable / MagicSystem / BuildingTools / SettingsPanel) to the locked bold-flat primitives (`Panel`/`Slot`/`Button`/`Icon`/`Tooltip`/`StatBar`), kill the `.game-panel`/`.game-panel-item` glass CSS + the emoji headers, and gate them with new modal capture states — without changing any modal behavior/data/handlers. This is the GLASS-killing second third of M2 (bevel=M2a done, neon=M2c next).

**Architecture:** `ui/GamePanels.jsx` (957 lines) exports the 5 modals, each a `.game-panel` glass shell (backdrop-blur, rgba) rendered by `MenuSystem` when the corresponding `show*` store flag is true. The **Inventory** (lines 173-442) is the richest — paper-doll gear `Slot`s + a rarity-tinted item grid (`.game-panel-item` with an existing `rarityStyle` border/bg/glow helper) + a `GearInspector` hover tooltip + stats — i.e. exactly the composition already built + validated in `src/ui/PrimitivesShowcase.jsx`. M2b rewrites each modal's chrome to the primitives, mapping the existing rarity logic → the `Slot` `rarity` prop. The visual gate gains an `inventory-open` (and `crafting-open`) capture state so the migrated modals are regression-gated; the existing 8 states are unaffected (modals aren't open in them).

**Tech Stack:** React 19, the M1 bold-flat primitives, i18n `t()`/`useT()`, Tailwind tokens, framer-motion 12, lucide-react, puppeteer+pixelmatch.

---

## Pre-flight facts
- **The Inventory is the showcase composition on real data** — mirror `PrimitivesShowcase.jsx`'s inventory card (paper-doll well + gear `Slot`s + rarity-FILLED item `Slot`s + stats `Panel` + gold + Equip `Button`), but wired to the REAL store (`gameState.equipment`, `inventory.blocks`, `getEffectiveAttributes()`, `equipItem`/`unequipItem`). Map the existing `rarityStyle`/rarity helper → the `Slot` `rarity` prop (common/rare/epic/legendary).
- **Preserve ALL behavior** — `onClose`, equip/unequip, hover-to-inspect (`GearInspector` → `Tooltip`), crafting (recipe match + craft), spell-select, building-tool-select, settings toggles, `onClick={e => e.stopPropagation()}`, the backdrop click-to-close. This is presentational.
- **Emoji headers** (`🔨 Advanced Crafting`, `✨ Magic Spells`, `🏠 Building Tools`, `⚙️ Settings`, any in Inventory) → replace the emoji with an `Icon` (game-semantic: pickaxe/magic/`Grid`/settings) + the text. (Reduces the emoji burn-down; the zero-emoji hard gate still waits for M3's data-decouple.)
- **`.game-panel` / `.game-panel-item` CSS** (App.css ~398-430) → removed once no modal references them (grep-guarded, like M2a). The `.glow-button` (App.css ~388) is used by MenuSystem — KEEP (or migrate in M2c).
- **Don't touch** the 3D/gameplay logic, the store actions, or `MenuSystem`'s open/close wiring (only the modal INNARDS change).
- **Capture:** modals render over the game scene when `show*` is true. Add a test hook to open a modal in capture + new capture state(s). The modal content is largely deterministic (inventory has fixed starting items) — verify non-blank + stable.

## File structure
```
src/ui/GamePanels.jsx     MOD  5 modals: glass shells → Panel; .game-panel-item → Slot (rarity); buttons → Button; emoji headers → Icon; GearInspector → Tooltip
src/App.css               MOD  remove .game-panel/.game-panel-item glass (grep-guarded)
src/App.jsx               MOD  test hook `openModal('inventory'|'crafting')` (DEV) for capture
scripts/visual/capture.mjs MOD  +inventory-open (+crafting-open) capture states
tests/visual/diff.test.js MOD  STATES += inventory-open (+crafting-open)
tests/visual/baseline/inventory-open.png  NEW (generated, reviewed)
```

---

### Task 1: Inventory modal → bold-flat (mirror the showcase)
**Files:** `src/ui/GamePanels.jsx` (Inventory:173-442, PaperDollSlot:57, GearInspector:89).
- [x] **Step 1 — Read** the Inventory + PaperDollSlot + GearInspector + the rarity helper in GamePanels.jsx, the primitives, and `PrimitivesShowcase.jsx`'s inventory card (the visual target).
- [x] **Step 2 — Rewrite** the Inventory's chrome: the `.game-panel` glass shell → `Panel variant="raise"` (header bar `bg-panel-raise` + 4px ink + `shadow-elev-xl`); paper-doll well → `Panel variant="inset"`/`bg-well` + gear `Slot`s (`gear` filled when equipped, empty otherwise); the item grid `.game-panel-item`s → `Slot` with `rarity` mapped from the existing rarity helper + a 2-tone `Icon` (map item→game-icon name; fallback to a color swatch where no icon maps) + quantity badge; the stats → a bold-flat stats `Panel` (colored stat `Icon`s + tabular values) like the showcase; gold + Equip `Button variant="primary"`; close → `Button variant="ghost"` + `Icon name="close"`. `GearInspector` hover → the `Tooltip` primitive. **Preserve** every handler (equip/unequip/select/hover/onClose) + the data reads.
- [x] **Step 3 — Verify** build + unit green; the equip/unequip/hover logic intact (grep the diff).
- [x] **Step 4 — Commit** `git commit -m "feat(s1c-m2b): Inventory modal → bold-flat primitives (mirror showcase; preserve equip/inspect logic)"`

### Task 2: CraftingTable → bold-flat
**Files:** `src/ui/GamePanels.jsx` (CraftingTable:443-765).
- [x] Read CraftingTable + the showcase. Rewrite: glass shell → `Panel`; recipe/ingredient tiles → `Slot`s; the craft action → `Button variant="primary"`; `🔨` header → `Icon name="pickaxe"`/`Hammer` + text. Preserve recipe-match + craft + close logic. Verify build+unit. Commit `feat(s1c-m2b): CraftingTable → bold-flat primitives`.

### Task 3: MagicSystem + BuildingTools + SettingsPanel → bold-flat
**Files:** `src/ui/GamePanels.jsx` (MagicSystem:766-812, BuildingTools:813-897, SettingsPanel:898-957).
- [x] Read the 3 + showcase. Rewrite each: glass shell → `Panel`; `.game-panel-item` rows → `Slot`/bold-flat rows; buttons → `Button`; emoji headers (`✨`/`🏠`/`⚙️`) → `Icon` (magic/`Grid`/settings) + text; SettingsPanel toggles → bold-flat (keep `showStats`/`setShowStats`/`onOpenWorldManager` + all toggles). Preserve all handlers. Verify build+unit. Commit `feat(s1c-m2b): MagicSystem + BuildingTools + SettingsPanel → bold-flat primitives`.

### Task 4: Remove `.game-panel`/`.game-panel-item` glass CSS + emoji-header cleanup
**Files:** `src/App.css`.
- [x] Grep-guard `.game-panel` + `.game-panel-item` across `src/` — if no remaining references after T1-3, delete the rules (App.css ~398-430). KEEP `.glow-button` if MenuSystem still uses it (flag for M2c). Confirm `grep -rn "game-panel" src/` clean (or report kept refs). Verify build+unit. Commit `feat(s1c-m2b): remove orphaned .game-panel glass CSS`.

### Task 5: Modal capture state(s)
**Files:** `src/App.jsx` (DEV test hook), `scripts/visual/capture.mjs`, `tests/visual/diff.test.js`.
- [x] Add a DEV test hook (in the existing `registerTestHook` block) `openModal(which)` → sets `showInventory`/`showCrafting` true (+ `setHudHidden` as appropriate / or keep HUD). In `capture.mjs`, after the showcase shots, drive `start`→stable→`openModal('inventory')`→`document.fonts.ready`→settle→screenshot `inventory-open.png` (optionally `crafting-open.png`). Add the state(s) to `diff.test.js` STATES. (Mind determinism: open the modal from a known state; the inventory starting items are fixed.) Verify capture produces a non-blank modal frame. Commit `feat(s1c-m2b): inventory-open capture state + modal test hook`.

### Task 6 (CONTROLLER): re-baseline + visual review
- [x] `npm run visual:capture`; the 8 existing states stay green; view `inventory-open` (+ crafting) — verify the migrated modal reads bold-flat (matches the showcase inventory). Baseline the new state(s) (`cp current→baseline`); `npx vitest run --config vitest.visual.config.js` → all green. Add the frame to `KEVIN-REVIEW-BATCH.md`. Commit baselines.

### Task 7 (CONTROLLER): final review + docs + merge
- [x] Focused review: modal behavior/handlers preserved, no collateral, glass removed. Full gate. Update docs (this plan STATUS; CHANGELOG M2b; ACTIVE_PLAN → M2c; native memory + flush marker). Merge `s1c-m2b-modals` → main, push. The single-language hard gate still waits for M2c.

---

## Self-Review
- Coverage: 5 modals (T1-3) + glass CSS (T4) + capture gate (T5) + review/merge (T6-7) ✓. Inventory mirrors the validated showcase ✓. Behavior preserved (T1-3 keep handlers) ✓. Single-language gate deferred to M2c (neon still present) ✓.
- Risk: (a) Inventory is complex (rarity logic + inspector + equip) — preserve handlers carefully (T1 grep-verify). (b) modal capture determinism — open from a fixed state (T5). (c) `.glow-button` shared with MenuSystem — keep (T4). (d) item→icon mapping may not cover all items — fallback to a color swatch, don't crash.

## Execution Handoff
Subagent-Driven Development (Opus, sequential, continuous). Controller owns T6 (re-baseline) + T7 (merge). Review frames batched to `KEVIN-REVIEW-BATCH.md`.
