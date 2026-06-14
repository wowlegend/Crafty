# S3 de-monolith — GamePanels: extract CraftingTable + shared itemUi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** De-god-file `ui/GamePanels.jsx` (1094 LOC) by extracting its largest component — `CraftingTable` (`:473-817`, ~344 LOC) — to `ui/panels/CraftingTable.jsx`, byte-exact, taking GamePanels **1094 → ~750 LOC, UNDER the 900 god-file threshold** in one cut. The shared `ItemIcon` helper (used by both Inventory and CraftingTable) moves to a leaf `ui/panels/itemUi.jsx` that both import (avoids a GamePanels↔CraftingTable circular import).

**Architecture (charter §2 #4 S3 de-monolith — extraction-only, NO behavior change):** the proven byte-exact line-range slice (same method as S3-M6 MobModel / S3-M5 leaves). `CraftingTable` is `export const CraftingTable = React.memo(...)` (self-exported) and is imported by `MenuSystem.jsx:6` from `'./ui/GamePanels'` — so GamePanels **re-exports** it (`export { CraftingTable } from './panels/CraftingTable'`), keeping MenuSystem unchanged. `RECIPES` is internal to CraftingTable (a `React.useMemo` at :480 — moves with it). `ItemIcon`'s deps are all imports (`getItemIcon`, `Icon`, `BLOCK_TYPES`) → trivially relocatable. The behavior-lock: 18 visual baselines (incl. `inventory-open` which renders Inventory→ItemIcon) + 1028 unit + the build (rollup import-resolution gate).

**Why capture-safe:** byte-exact → zero pixel change. `inventory-open` + `achievements-open` baselines hold byte-identical (Inventory keeps ItemIcon via the itemUi import); CraftingTable isn't even in a baseline (extra safety). No re-baseline.

**Tech Stack:** byte-exact extraction (Python line-range slice) + the dep-completeness grep (done: CraftingTable's sole module-local dep is `ItemIcon`) + vitest/build/visual battery.

**New paths (one level deeper than `src/ui/` → add one `../`):** `../GameMethods`→`../../GameMethods`, `../store/`→`../../store/`, `../world/`→`../../world/`, `../i18n/`→`../../i18n/`, `./primitives/`→`../primitives/`, `../data/`→`../../data/`.

---

### Task 1: the shared `itemUi.jsx` (ItemIcon)

**Files:** Create `frontend/src/ui/panels/itemUi.jsx`

- [ ] **Step 1:** create `ui/panels/itemUi.jsx` = the byte-exact `ItemIcon` (`:44-59`) + its computed import header:
```jsx
import { BLOCK_TYPES } from '../../world/Blocks';
import { Icon } from '../primitives/index.js';
import { getItemIcon } from '../../data/items.js';

// [byte-exact ItemIcon from GamePanels :44-59]
export const ItemIcon = ({ itemName, size = 42 }) => { ... };
```
(Add `export` to the moved `const ItemIcon`.)

### Task 2: the byte-exact CraftingTable extraction

**Files:** Create `frontend/src/ui/panels/CraftingTable.jsx`; Modify `frontend/src/ui/GamePanels.jsx`

- [ ] **Step 1:** create `ui/panels/CraftingTable.jsx` = the computed import header + the VERBATIM `:473-817` slice (it begins `export const CraftingTable = React.memo(...)` — already exported):
```jsx
import React from 'react';
import { GameMethods } from '../../GameMethods';
import { useGameStore } from '../../store/useGameStore';
import { BLOCK_TYPES } from '../../world/Blocks';
import { useT } from '../../i18n/i18n.js';
import { Panel, Button, Slot, Icon } from '../primitives/index.js';
import { Grid } from 'lucide-react';
import { getItemRarity } from '../../data/items.js';
import { ItemIcon } from './itemUi';

// [byte-exact :473-817]
```
- [ ] **Step 2:** in `GamePanels.jsx`: remove the `:473-817` CraftingTable block AND the `:44-59` ItemIcon def (remove the LATER range first so line numbers don't shift, or build a keep-set in Python). Add `import { ItemIcon } from './panels/itemUi';` (Inventory/PaperDollSlot/GearInspector still use ItemIcon) and `export { CraftingTable } from './panels/CraftingTable';` (keeps MenuSystem's import working). Prune now-dead GamePanels imports (grep each top import for remaining in-file use; remove zero-use — e.g. `getItemIcon`/`Grid`/`getItemRarity` if only CraftingTable/ItemIcon used them).

### Task 3: verify + close-out

- [ ] **Step 1: battery** (from `frontend/`): `npx vitest run` (1028 holds; extraction-only) · `npm run build` clean (the import-resolution gate — catches a missing import or the re-export) · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (esp. `inventory-open`) · `wc -l src/ui/GamePanels.jsx` → ~750 (< 900) · arrow-grep the 2 new files.
- [ ] **Step 2: byte-equality proof:** diff the moved CraftingTable slice vs `HEAD:GamePanels.jsx:473-817` == identical (the MobModel adversarial-verification pattern).
- [ ] **Step 3: commit + close-out** — `refactor(s3): GamePanels -> extract CraftingTable + itemUi (byte-exact; GamePanels 1094->~750, de-god-filed)` + banner this plan ✅ SHIPPED + ACTIVE_PLAN/CHANGELOG + SOTA god-file-count refresh. Next GamePanels cuts (optional): Inventory / the remaining panels → `ui/panels/` (the panels-dir ladder).

## Self-Review
**Spec coverage:** S3 de-monolith (the god-file tax) ✓ — GamePanels wasn't in the original 5-audit list (it emerged); this is the same method. **Placeholder scan:** the import lists are computed from the actual usage grep (concrete). **Type consistency:** `import { CraftingTable } from './ui/GamePanels'` (MenuSystem) still resolves via the re-export; `ItemIcon` signature unchanged. **Capture-safety:** byte-exact → 18/18 holds; inventory-open exercises ItemIcon through the itemUi import. **Risk:** the only module-local dep is ItemIcon (grep-verified); RECIPES is internal; build is the import gate.
