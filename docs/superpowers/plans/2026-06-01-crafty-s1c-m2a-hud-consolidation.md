# Crafty S1-C-M2a — HUD Consolidation (Minecraft-bevel → bold-flat primitives) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. **All subagents: Opus 4.8. Sequential only (shared HUD files). NEVER add a Claude footer / Co-Authored-By. Fix-ups = NEW commits. AST-safe edits for `.js/.jsx` (no `sed` on code).**

**Goal:** Migrate Crafty's always-on gameplay HUD from the Minecraft pixel-bevel language (+ its emoji bars) to the locked bold-flat primitives (`StatBar`/`Slot`/`Button`/`Panel`/`Icon`), matching the HUD already built in `PrimitivesShowcase`, and delete the redundant fake health/hunger display + the `.minecraft-*` CSS — without changing gameplay behavior.

**Architecture:** The HUD renders via two paths that M2a unifies: `Components.GameUI` (info-panel + settings btn + `MinecraftHotbar` + `MinecraftHealthHunger` + left toolbar) and `HUD.jsx` (real `PlayerHealthBar/ManaBar/HungerBar` from `GameSystems`, spell display, `Minimap`, `Compass`, XP/level via `SimpleExperienceSystem`). The bold-flat **primitives + `RARITY_FILL` + tokens already exist and are visually validated** (the M1 showcase). M2a rewrites the HUD pieces to consume them. The visual gate's `explore-day`/`explore-night` states render the live HUD (pointer-locked) → they WILL change and get re-baselined (human-reviewed). This is the bevel-killing third of M2 (glass=M2b, neon=M2c); the single-language hard gate flips in M2c once all three are gone.

**Tech Stack:** React 19, the M1 bold-flat primitives (`src/ui/primitives/`), i18n `t()`/`useT()`, Tailwind tokens, framer-motion 12, lucide-react, the puppeteer+pixelmatch visual gate.

---

## Pre-flight facts (verified 2026-06-01)
- **Two health/hunger renderers exist** — `Components.MinecraftHealthHunger` (Components.jsx:64) is a STATIC, always-full, 10×❤ + 10×🍖 decorative fake (not data-driven) shown bottom-center; the REAL data-driven bars are `GameSystems.PlayerHealthBar/ManaBar/HungerBar` (also ❤/🍖 emoji) shown top-left via `HUD.jsx`. M2a **deletes the fake** + migrates the real ones to `StatBar`.
- **The bold-flat HUD reference is `src/ui/PrimitivesShowcase.jsx`** — its HUD region (level badge, health/mana/hunger StatBars with icons, hotbar Slots, spell rings, minimap/locale chrome) is the visual + structural target. Mirror it.
- **`PlayerHealthBar`/`ManaBar`/`HungerBar` are imported by `HUD.jsx`** (top-left block, lines ~290-294) and consumed via `gameSystems.health/maxHealth/mana/maxMana/hunger`. Their prop signatures must stay compatible OR `HUD.jsx`'s call site updates in lockstep.
- **`MinecraftHotbar` + `GameUI`** live in `Components.jsx`; `GameUI` is rendered by `HUD.jsx`. The hotbar uses `HOTBAR_BLOCKS` + `BLOCK_TYPES` (top of Components.jsx) + `gameState.selectedBlock`/`setSelectedBlock` + `inventory.blocks`.
- **`.minecraft-*` CSS** is `App.css:1-185` (hotbar/slot/health/hunger/info-panel/toolbar/tool-button/button + the `Minecraft` @font-face + Orbitron @import). Remove the bevel rules M2a orphans; KEEP anything still referenced by non-HUD code until M2b/c (grep before deleting each class).
- **Gameplay must not change** — click handlers (`setSelectedBlock`, `setShowInventory`, etc.), the data each bar reflects, and the spell-select behavior stay identical. This is a presentational migration.
- **Visual gate:** `explore-day`/`explore-night` render the live HUD → expect them to change; re-baseline + human-review (controller task). The other 6 states (menu has no HUD; closeups suppress it; boss-obsidian) should stay green. Keep the new no-hex gate scoped to `src/ui/primitives/` (HUD files may transiently keep gameplay/3D hex; migrate only UI-chrome hex).
- **Emoji:** migrating the bars to `StatBar`+game-icons removes the ❤/🍖 HUD emoji. Do NOT flip the zero-emoji `it.todo` gate (that's M3, when ALL emoji + the data-coupled emoji are gone). The static-gate emoji REPORTER will simply show a lower count.

## File structure
```
src/GameSystems.jsx        MOD  PlayerHealthBar/ManaBar/HungerBar → StatBar primitive (data-driven, game-icons, no emoji)
src/Components.jsx         MOD  MinecraftHotbar → Slot row; DELETE MinecraftHealthHunger; GameUI info-panel/settings/toolbar → bold-flat
src/HUD.jsx               MOD  top-left bars block + spell display + Minimap/Compass chrome → bold-flat; call sites for the rewritten bars
src/SimpleExperienceSystem.jsx  MOD  SimpleExperienceBar → bold-flat (StatBar-style xp + level badge)
src/App.css               MOD  remove orphaned .minecraft-* bevel rules (grep-guarded)
tests/visual/baseline/explore-day.png   re-baseline (controller, human-reviewed)
tests/visual/baseline/explore-night.png re-baseline (controller, human-reviewed)
tests/gates/static-gates.test.js  MOD (optional) note the bevel removal; do NOT flip the single-language todo yet
```

---

### Task 1: Player health/mana/hunger bars → `StatBar`

**Files:** Modify `src/GameSystems.jsx` (PlayerHealthBar:181, PlayerManaBar:210, PlayerHungerBar:232); verify `src/HUD.jsx` call sites (~290-294).

- [ ] **Step 1 — Read** `src/ui/primitives/StatBar.jsx` + the showcase's StatBar usage (`PrimitivesShowcase.jsx`) + the current bars + `HUD.jsx:288-295`.
- [ ] **Step 2 — Rewrite the three bars** to render the `StatBar` primitive (data-driven, leading game-icon, tabular value, NO emoji). Replace the bodies:

```jsx
import { StatBar } from './ui/primitives/StatBar.jsx';
// ...
export const PlayerHealthBar = ({ health, maxHealth }) => (
  <StatBar kind="health" icon="health" value={health} max={maxHealth} showValue className="w-44" />
);
export const PlayerManaBar = ({ mana, maxMana }) => (
  <StatBar kind="mana" icon="water" value={mana} max={maxMana} showValue className="w-44" />
);
export const PlayerHungerBar = ({ hunger }) => (
  <StatBar kind="hunger" icon="meat" value={hunger} max={100} showValue className="w-44" />
);
```
(Keep the exports + prop names so `HUD.jsx` call sites are unchanged. Remove the now-unused `motion`/emoji code in these three functions only. `DamageOverlay`/`DeathScreen`/`SPELL_*` stay untouched.)

- [ ] **Step 3 — Verify** `npm run test:unit` green (no test imports these directly; if one does, update); `npm run build` succeeds.
- [ ] **Step 4 — Commit** `git commit -m "feat(s1c-m2a): player health/mana/hunger bars → StatBar primitive (data-driven, game-icons, drop emoji)"`

---

### Task 2: Hotbar → `Slot` row; delete the fake `MinecraftHealthHunger`

**Files:** Modify `src/Components.jsx` (MinecraftHotbar:36, DELETE MinecraftHealthHunger:64, GameUI:98).

- [ ] **Step 1 — Read** `Components.jsx:1-126` (imports, HOTBAR_BLOCKS/BLOCK_TYPES, MinecraftHotbar, MinecraftHealthHunger, GameUI) + the showcase hotbar.
- [ ] **Step 2 — Rewrite `MinecraftHotbar`** as a `Panel` row of `Slot`s (mirror the showcase hotbar): each block = a `Slot` (selected → `selected`), an `Icon` or the block-color swatch inside, a hotkey badge, a quantity badge. Keep the `onClick={() => gameState.setSelectedBlock(blockType)}` + `title`. Use `bg-panel-frame`/`border-ink` Panel + `Slot`s. (Block-color swatch may keep its `blockConfig.color` inline — that's gameplay/3D data, not UI-chrome hex.)
- [ ] **Step 3 — DELETE `MinecraftHealthHunger`** (the static fake bars) entirely + remove its `<MinecraftHealthHunger />` usage in `GameUI` (line 112). The real bars in `HUD.jsx` are the single source.
- [ ] **Step 4 — Migrate `GameUI`'s chrome:** the info-panel (`.minecraft-info-panel` "Mode:") → a small bold-flat `Panel`; the settings button (`.minecraft-button`) + the left toolbar (`.minecraft-toolbar` inventory/craft/magic/build) → bold-flat `Button variant="ghost"`/`Panel` with the lucide `Icon`s (settings/Package→ use Icon names; keep the onClick handlers). Match the showcase's left-rail + top-right chrome.
- [ ] **Step 5 — Verify** build + unit green; confirm the click handlers still fire (the buttons keep their onClick).
- [ ] **Step 6 — Commit** `git commit -m "feat(s1c-m2a): hotbar → Slot row + GameUI chrome → bold-flat; delete redundant static health/hunger display"`

---

### Task 3: HUD spell display + Minimap/Compass + XP/level chrome → bold-flat

**Files:** Modify `src/HUD.jsx` (spell display ~296-304, Minimap ~91-100, Compass ~246-256), `src/SimpleExperienceSystem.jsx` (SimpleExperienceBar:176).

- [ ] **Step 1 — Read** the HUD spell-display block, the Minimap/Compass container markup, `SimpleExperienceBar`, and the showcase's spell/minimap/xp/level treatment.
- [ ] **Step 2 — Spell display** (`HUD.jsx` top-center "Spell: X (n MP)") → a bold-flat `Panel`/chip using `t()` + the spell color from tokens (`text-spell-*`), tabular MP. (Optionally use a `SpellRing` — but the in-HUD spell *indicator* can stay a chip; the bottom-right spell SELECTOR rings are a later/optional add.)
- [ ] **Step 3 — Minimap + Compass chrome** → wrap in a bold-flat `Panel` (4px ink + offset + `bg-panel-frame`), replacing the `.minimap-container` glass + the slate/blur compass bar. Keep the canvas/marker LOGIC (the rAF/draw code) intact — only the frame chrome changes. (Note: the Compass rAF is already capture-gated from the residuals fix — preserve that guard.)
- [ ] **Step 4 — XP bar + level badge** (`SimpleExperienceBar`) → bold-flat (a `StatBar kind="xp"` or a thin gold bar in a `Panel` + a level badge `Panel`), mirroring the showcase top-left. Keep the level/XP props + logic.
- [ ] **Step 5 — Verify** build + unit green.
- [ ] **Step 6 — Commit** `git commit -m "feat(s1c-m2a): HUD spell display + minimap/compass + XP/level chrome → bold-flat"`

---

### Task 4: Remove orphaned `.minecraft-*` bevel CSS + migrate HUD UI-chrome hex

**Files:** Modify `src/App.css` (1-185).

- [ ] **Step 1 — Grep-guard:** for each `.minecraft-*` class in App.css:1-185, `grep -rn "minecraft-<class>" src/` — if it has ZERO remaining references after Tasks 1-3, delete the rule. KEEP any class still referenced (flag it for M2b/c). Also remove the now-unused `Minecraft` @font-face (the broken empty-base64 one) if nothing references `font-family: 'Minecraft'`. Decide on the Orbitron @import: if the minimap canvas still draws `Orbitron` text, keep it for now (flag for M2c); else remove.
- [ ] **Step 2 — Migrate HUD UI-chrome hex** that Tasks 1-3 left inline → tokens (only true UI-chrome; leave gameplay/3D/block colors). Re-run the hex burn-down reporter to confirm the HUD count dropped.
- [ ] **Step 3 — Verify** build + unit green; no broken styles (grep clean).
- [ ] **Step 4 — Commit** `git commit -m "feat(s1c-m2a): remove orphaned .minecraft-* bevel CSS + migrate HUD chrome hex to tokens"`

---

### Task 5 (CONTROLLER): re-baseline explore-day/night + visual review

- [ ] **Step 1** `npm run visual:capture` → the 6 non-HUD states should still pass; `explore-day`/`explore-night` now show the bold-flat HUD (changed). View both current frames; verify the HUD reads as the locked bold-flat language (matches the showcase HUD — StatBars with icons, Slot hotbar, bold-flat chrome, no emoji hearts/drumsticks, no bevel).
- [ ] **Step 2** Surface the 2 re-baselined frames for Kevin. After sign-off: `npm run visual:baseline` re-captures ONLY if needed — surgically `cp current → baseline` for explore-day/night; run `npx vitest run --config vitest.visual.config.js` → 8/8 green. Commit the baselines.

---

### Task 6 (CONTROLLER): final review + docs + merge
- [ ] Final whole-branch review (Opus): gameplay-handler preservation (no click/behavior change), no collateral, bevel removal clean, primitives consumed correctly. Fix blocking findings as NEW commits.
- [ ] Full gate: `test:unit` · `test:visual` 8/8 · `build` green.
- [ ] Update docs: this plan STATUS→COMPLETE; CHANGELOG (M2a); ACTIVE_PLAN (M2a done → M2b next); ARCHITECTURE (HUD now bold-flat); native memory. The single-language hard gate stays `it.todo` (flips in M2c).
- [ ] `superpowers:finishing-a-development-branch` → merge `s1c-m2a-hud` → `main`, push.

---

## Self-Review (writing-plans checklist)
- **Spec coverage:** bevel HUD → bold-flat (T1 bars, T2 hotbar+chrome+fake-removal, T3 spell/minimap/xp, T4 CSS+hex) ✓; the showcase is the visual target ✓; gameplay preserved (T1-3 keep handlers/data) ✓; re-baseline + review (T5) ✓; merge (T6) ✓. The glass (M2b) + neon (M2c) languages are explicitly out of M2a; the single-language gate flips in M2c.
- **Placeholder scan:** the bar rewrites have concrete code; the rest references the showcase + existing primitives + reads the current code (a migration, so "match the showcase + preserve handlers" is the concrete instruction, not a placeholder).
- **Risk:** (a) the explore-day/night baselines change — expected, human-reviewed (T5). (b) deleting MinecraftHealthHunger / .minecraft CSS must be grep-guarded (T4 Step 1). (c) the player-bar prop signatures must stay HUD-compatible (T1 keeps them). (d) the Compass rAF capture-guard from the residuals fix must be preserved (T3 Step 3).

## Execution Handoff
Subagent-Driven Development (Opus per task; sequential — shared HUD files; continuous). Controller owns T5 (human re-baseline) + T6 (merge). Kevin reviews the re-baselined gameplay-HUD frames.
