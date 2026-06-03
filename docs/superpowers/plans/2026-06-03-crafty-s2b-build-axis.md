# S2-A-M2b — Build Axis (A7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Fresh Opus implementer per task + spec + quality review. SEQUENTIAL (both tasks touch `src/ui/GamePanels.jsx`). NO Claude commit footer. AST-safe edits only. Fix-ups = NEW commits.

**Goal:** Complete the fight→loot→equip→**allocate**→fight-harder build axis. The paper-doll UI, equipment fold (`getEffectiveAttributes`), and combat solvers already exist + are wired (M2a). A7 closes the two real gaps: (1) **`attributePoints` are unspendable** — every level-up awards +5 (M2a `grantXP`) but no UI calls the existing `allocateAttribute` store action, so the build axis dead-ends; (2) the **weapon base-damage ladder is duplicated** (`Components.jsx` melee ↔ `GamePanels.jsx` preview) and `getItemSlot` is a module-local hardcode.

**Architecture:** one shared, pure `src/game/equipment.js` is the single source for item→slot + weapon→base-damage metadata (consumed by both the combat loop and the build UI). The allocate UI calls the existing store action; it renders the "+" affordance ONLY when `attributePoints > 0` (so the deterministic `inventory-open` visual fixture — which has 0 points — stays byte-identical; visual gate remains 12/12).

**Tech Stack:** React 19, zustand 5, Vitest 3.2.4 (run from `frontend/`). Grounding: the M2a recon (equipment/combat reader) + verified file:line below.

## Verified current reality
- `allocateAttribute(attr)` EXISTS in the store (bumps base attr, decrements `attributePoints`, recomputes caps via `deriveMaxStats`) — **unit-tested** (`tests/store/equipBuildAxis.test.js`) but has **NO UI caller** (recon-confirmed).
- `attributePoints` lives in `state.attributes.attributePoints`; awarded +5/level in `grantXP` (store). Displayed nowhere; spendable nowhere.
- `GamePanels.jsx` Inventory: Core Attributes panel (`:362-371`) renders `effective.{strength,agility,intellect,armor}` READ-ONLY (no buttons). The `useShallow` selector (`~:188-200`) pulls `getEffectiveAttributes` but NOT `attributes`/`allocateAttribute`.
- `getItemSlot` (`GamePanels.jsx:30-38`): module-local, hardcoded slot→name-list arrays.
- Weapon base-dmg ladder DUPLICATED verbatim: `Components.jsx:235-240` (real melee dmg → `solveMeleeDamage`) and `GamePanels.jsx:254-259` (the `meleeDmg` preview). Values: Stone 12 / Iron 20 / Diamond 35 / pickaxe 8 / sword 10 / default 5.
- `effective` = base + equipment fold (+ frost_shield talent). The allocate "+" bumps BASE; `effective` (shown) then increases by the same.

## Out of scope (deferred)
- **Loot→bucket routing + `addToInventory` rarity arg** — works today (looted gear lands in `inventory.blocks`, which the bag grid renders + equip reads), so it's low-value hygiene; defer to a later slop pass. (The dead 3rd `rarity` arg some callers pass is harmless.)
- **items.js ↔ EQUIPMENT_STATS dual-registry merge** — medium refactor, not needed for the build loop; defer.
- **A4 talent→4-Aspect-trees** — the next milestone (M2c).

---

## Task 1: Shared equipment-metadata module (`equipment.js`) + DRY the duplicated ladder/slot map

**Files:** Create `src/game/equipment.js` + `src/game/equipment.test.js`; modify `src/ui/GamePanels.jsx` (remove local `getItemSlot`, import shared; weapon-ladder → `getWeaponBaseDamage`); modify `src/Components.jsx` (weapon-ladder → `getWeaponBaseDamage`); create gate `tests/gates/equipment-dry-gates.test.js`.

- [ ] **Step 1 — failing test** `src/game/equipment.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { getItemSlot, getWeaponBaseDamage } from './equipment.js';

describe('getItemSlot', () => {
  it('maps gear names to slots', () => {
    expect(getItemSlot('Diamond Sword')).toBe('weapon');
    expect(getItemSlot('pickaxe')).toBe('weapon');
    expect(getItemSlot('Iron Shield')).toBe('offhand');
    expect(getItemSlot('Golden Crown')).toBe('head');
    expect(getItemSlot('Diamond Chestplate')).toBe('chest');
    expect(getItemSlot('Leather Boots')).toBe('boots');
  });
  it('returns null for non-gear / null', () => {
    expect(getItemSlot('grass')).toBeNull();
    expect(getItemSlot(null)).toBeNull();
  });
});

describe('getWeaponBaseDamage', () => {
  it('matches the canonical ladder', () => {
    expect(getWeaponBaseDamage('Stone Sword')).toBe(12);
    expect(getWeaponBaseDamage('Iron Sword')).toBe(20);
    expect(getWeaponBaseDamage('Diamond Sword')).toBe(35);
    expect(getWeaponBaseDamage('pickaxe')).toBe(8);
    expect(getWeaponBaseDamage('sword')).toBe(10);
  });
  it('defaults to 5 for unarmed / unknown', () => {
    expect(getWeaponBaseDamage(null)).toBe(5);
    expect(getWeaponBaseDamage('grass')).toBe(5);
  });
});
```
- [ ] **Step 2 — run, see FAIL** `npx vitest run src/game/equipment.test.js`.
- [ ] **Step 3 — implement** `src/game/equipment.js`:
```js
/**
 * equipment.js — pure, single source of truth for item→slot + weapon→base-damage
 * metadata (consumed by the combat loop AND the build UI). React/store-free.
 */
const SLOT_ITEMS = {
  weapon: ['sword', 'pickaxe', 'Stone Sword', 'Iron Sword', 'Diamond Sword'],
  offhand: ['Wooden Shield', 'Iron Shield', 'Diamond Shield'],
  head: ['Golden Crown', 'Leather Helmet', 'Iron Helmet', 'Diamond Helmet'],
  chest: ['Leather Chestplate', 'Iron Chestplate', 'Diamond Chestplate'],
  boots: ['Leather Boots', 'Iron Boots', 'Diamond Boots'],
};

/** itemName -> equip slot ('weapon'|'offhand'|'head'|'chest'|'boots') or null. */
export function getItemSlot(itemName) {
  if (!itemName) return null;
  for (const slot in SLOT_ITEMS) if (SLOT_ITEMS[slot].includes(itemName)) return slot;
  return null;
}

const WEAPON_BASE_DAMAGE = { 'Stone Sword': 12, 'Iron Sword': 20, 'Diamond Sword': 35, pickaxe: 8, sword: 10 };

/** Flat base melee damage for the equipped weapon name (default 5 = unarmed/unknown). */
export function getWeaponBaseDamage(weaponName) {
  return WEAPON_BASE_DAMAGE[weaponName] || 5;
}
```
- [ ] **Step 4 — DRY the consumers:**
  - `src/ui/GamePanels.jsx`: delete the local `getItemSlot` (`:30-38`); add `import { getItemSlot, getWeaponBaseDamage } from '../game/equipment.js';`. Replace the `:254-259` ladder (`let baseWeaponDmg = 5; if (...) ...`) with `const baseWeaponDmg = getWeaponBaseDamage(equippedWeapon);`.
  - `src/Components.jsx`: add `import { getWeaponBaseDamage } from './game/equipment.js';` (next to the existing combat imports). Replace `:235-240` (`let baseWeaponDmg = 5; if (equippedWeapon === 'Stone Sword') ...`) with `const baseWeaponDmg = getWeaponBaseDamage(equippedWeapon);`.
- [ ] **Step 5 — gate** `tests/gates/equipment-dry-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('equipment DRY gates', () => {
  it('the weapon base-damage ladder is not inlined in Components or GamePanels', () => {
    for (const f of ['src/Components.jsx', 'src/ui/GamePanels.jsx']) {
      expect(/===\s*'Stone Sword'\)\s*baseWeaponDmg\s*=\s*12/.test(read(f))).toBe(false);
    }
  });
  it('both consumers import getWeaponBaseDamage from the shared module', () => {
    expect(/getWeaponBaseDamage/.test(read('src/Components.jsx'))).toBe(true);
    expect(/getWeaponBaseDamage/.test(read('src/ui/GamePanels.jsx'))).toBe(true);
  });
  it('GamePanels no longer defines a local getItemSlot', () => {
    expect(/const\s+getItemSlot\s*=/.test(read('src/ui/GamePanels.jsx'))).toBe(false);
  });
});
```
- [ ] **Step 6 — verify** `npx vitest run src/game/equipment.test.js tests/gates/equipment-dry-gates.test.js && npm run test:unit && npm run build && npm run test:visual` → all green; visual **12/12** (pure refactor, no UI change).
- [ ] **Step 7 — commit** `feat(s2b): shared equipment.js (item-slot + weapon-base-dmg) — DRY the duplicated melee ladder + local getItemSlot`.

---

## Task 2: Allocate-attribute UI (spend the accumulating points)

**Files:** modify `src/ui/GamePanels.jsx` (extend the Inventory selector; add the allocate affordance to Core Attributes); create gate `tests/gates/allocate-ui-gates.test.js`.

The Core Attributes panel gains: a points banner + a per-attribute "+" button, rendered ONLY when `attributePoints > 0`. Spending calls the existing `allocateAttribute(attr)` store action. (`armor` is not directly allocatable — only STR/AGI/INT, matching `allocateAttribute`'s use; Def stays display-only.)

- [ ] **Step 1 — gate (failing)** `tests/gates/allocate-ui-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('allocate-attribute UI gates', () => {
  const src = read('src/ui/GamePanels.jsx');
  it('the Inventory selector exposes attributePoints + allocateAttribute', () => {
    expect(/allocateAttribute/.test(src)).toBe(true);
    expect(/attributePoints/.test(src)).toBe(true);
  });
  it('allocate buttons call allocateAttribute for str/agi/int', () => {
    expect(/allocateAttribute\(\s*['"]strength['"]\s*\)/.test(src)).toBe(true);
    expect(/allocateAttribute\(\s*['"]agility['"]\s*\)/.test(src)).toBe(true);
    expect(/allocateAttribute\(\s*['"]intellect['"]\s*\)/.test(src)).toBe(true);
  });
});
```
Run → FAIL.
- [ ] **Step 2 — store unit test (guards the round-trip via the existing action)**: confirm `tests/store/equipBuildAxis.test.js`'s `allocateAttribute` case still passes (already exists from M2a — no new store test needed; the UI calls that proven action). If absent, add: allocate STR with 1 point → strength+1, points 0, maxHealth recomputed.
- [ ] **Step 3 — implement** in `src/ui/GamePanels.jsx`:
  - Extend the Inventory `useShallow` selector (`~:188-200`) to also pull `attributes: state.attributes` and `allocateAttribute: state.allocateAttribute`.
  - Derive `const attributePoints = gameState.attributes?.attributePoints || 0;`.
  - In the Core Attributes panel (`:362-371`): above the grid, when `attributePoints > 0`, render a banner: `<div className="text-[10px] font-bold text-accent ...">{attributePoints} points to spend</div>`. For STR/AGI/INT rows, when `attributePoints > 0`, append a small "+" `<Button variant="ghost" size="xs">` (or a minimal styled button — match the bold-flat token language; reuse the `Button` primitive if imported, else a token-styled `<button>`) with `onClick={() => gameState.allocateAttribute('strength')}` (resp. 'agility'/'intellect'). The Def (armor) row stays display-only. When `attributePoints === 0`, render EXACTLY the current read-only rows (no banner, no buttons) — this keeps the 0-point `inventory-open` capture fixture byte-identical.
  - Keep the existing `effective.*` value displays.
- [ ] **Step 4 — verify** `npx vitest run tests/gates/allocate-ui-gates.test.js tests/store/equipBuildAxis.test.js && npm run test:unit && npm run build && npm run test:visual` → all green; **visual 12/12 UNCHANGED** (the capture fixture has 0 attributePoints → the allocate affordance is hidden → frame identical). If `inventory-open` diffs, the affordance is leaking into the 0-point state — STOP + fix the `> 0` gate (do NOT re-baseline).
- [ ] **Step 5 — commit** `feat(s2b): allocate-attribute UI — spend level-up points on STR/AGI/INT (wires the existing store action)`.

---

## Exit criteria (M2b / A7)
- `test:unit` green (new: equipment + 2 gates); build clean; **visual 12/12 unchanged**.
- The build axis is closed: level-up → +5 points → **spend them** in the inventory → STR/AGI/INT (+maxHealth/maxMana) rise → fight harder. Weapon base-dmg + item-slot metadata are single-sourced.
- Final whole-branch review + 4-piece docs (resume → M2c = talent→4-Aspect-trees A4) + pre-compact-flush.
- **Note for Kevin (review-batch):** the allocate "+" UI only shows when points>0, so it's not in any visual baseline — if you want it eyeballed, I can add a points>0 capture variant, or you'll see it in play.
