# Crafty S1-C-M2c — Neon Surfaces → bold-flat + Flip the Single-Language Gate — Implementation Plan

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **STATUS: ✅ COMPLETE + MERGED (2026-06-01)** — neon surfaces (QuestSystem + AdvancedGameFeatures UI + HUD banners) → bold-flat; last `.game-panel` glass removed; **single-UI-language hard gate FLIPPED GREEN** (honest: bans minecraft-*/game-panel everywhere + backdrop-blur on shipped surfaces; splash/dev excluded + documented). `achievements-open` capture state. 3D entities untouched. `test:unit` 91+1todo · `test:visual` 10/10. **DISCOVERY:** 3 residual in-game glass usages in `SimplifiedNPCSystem.jsx` (NPC trading modal + dialogue bubble) the class-migration missed → **M2d** added (burn-down reporter tracks them).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [x]` checkboxes. **Opus 4.8. Sequential where files are shared. NO Claude footer. NEW commits. AST-safe edits (no `sed` on `.js/.jsx`).**

**Goal:** Migrate the last UI language — the **neon-glow animated** surfaces in `QuestSystem.jsx` + `AdvancedGameFeatures.jsx` (+ the HUD notification banners) — to the bold-flat primitives (`Toast`/`StatBar`/`Panel`/`Button`/`Icon`), remove the last glass CSS (`.game-panel` base + `.glow-button`), migrate the remaining UI-chrome hex to tokens, and **flip the single-UI-language hard gate GREEN** — completing M2 (one unified design language; bevel+glass+neon all gone). Behavior preserved throughout.

**Architecture:** The neon language = high-saturation colored borders + emissive `box-shadow` glows + gradient bg-clip text + framer spring entries. It lives in: `QuestSystem.jsx` (`QuestTracker`, `NotificationStack`, `AchievementsPanel` [still `.game-panel` glass], `ChestIndicator`); `AdvancedGameFeatures.jsx` (`SurvivalWarning`, `BossHealthBar`, `PetIndicator`, `SpellUpgradePanel`, `ChestInventoryPanel`); and the HUD's boss/pet/spell-upgrade notification banners (`HUD.jsx` ~348-375). The bold-flat primitives + tokens are validated (M1/M2a/M2b). M2c rewrites these surfaces' chrome, leaving the 3D entities (`BossEntity`, `PetEntities`) + all data/handlers untouched. Then the `it.todo('single UI design language…')` gate in `tests/gates/static-gates.test.js` becomes a real assertion (no `.minecraft-*`, no `.game-panel*`, no `backdrop-blur`/`backdrop-filter` glass in `src/`).

**Tech Stack:** React 19, M1 bold-flat primitives, i18n `t()`/`useT()`, Tailwind tokens, framer-motion 12, lucide-react, puppeteer+pixelmatch.

---

## Pre-flight facts
- **Migrate UI components only** — in `AdvancedGameFeatures.jsx` (1386 lines) the 3D `BossEntity`/`PetEntities` are NOT UI; touch ONLY `SurvivalWarning`/`BossHealthBar`/`PetIndicator`/`SpellUpgradePanel`/`ChestInventoryPanel`. In `QuestSystem.jsx` touch `QuestTracker`/`NotificationStack`/`AchievementsPanel`/`ChestIndicator` (the `ACHIEVEMENTS` data + the chest-resolve logic stay).
- **Map to primitives:** transient notifications/warnings (`NotificationStack`, `SurvivalWarning`, the HUD boss/pet/spell-upgrade banners) → `Toast` (status variant). Health/progress bars (`BossHealthBar`) → `StatBar` (kind danger/a boss variant). Panels/trackers (`QuestTracker`, `AchievementsPanel`, `SpellUpgradePanel`, `ChestInventoryPanel`, `PetIndicator`, `ChestIndicator`) → `Panel`/`Slot`/`Button`/`Icon`. Emoji (🐉/📦/🧙/etc. in markers/headers) → `Icon` where a game-icon maps; the in-world compass markers in HUD already capture-gated — don't regress.
- **Preserve behavior** — quest claim, achievement unlock display, chest open/transfer, spell upgrade purchase, boss health/phase display, pet list, survival warnings. Presentational only.
- **Last glass:** after `AchievementsPanel` leaves `.game-panel`, remove the `.game-panel` base rule + `.glow-button` (migrate the MenuSystem `.glow-button` usages to `Button` first, or keep `.glow-button` if MenuSystem is out of scope — grep-guard; MenuSystem is the title screen, arguably its own surface — if so, KEEP `.glow-button` + scope the gate to exclude the menu, and flag MenuSystem for a later pass). Decide via grep; document.
- **The single-language gate** (`tests/gates/static-gates.test.js`, currently `it.todo`): implement as — `grep src for /minecraft-/`, `/game-panel/`, `/backdrop-blur|backdrop-filter/` → assert each count is 0 (or only in deliberately-excluded surfaces like the title MenuSystem, if kept). This proves the 3 in-game languages are unified.
- **Capture:** `QuestTracker`/`BossHealthBar`/notifications render in explore-day/night/boss-obsidian → those re-baseline. Add an `achievements-open` capture state (open `AchievementsPanel` via a test hook) to gate that panel.

## File structure
```
src/QuestSystem.jsx            MOD  QuestTracker/NotificationStack→Toast/AchievementsPanel→Panel/ChestIndicator → bold-flat
src/AdvancedGameFeatures.jsx   MOD  SurvivalWarning→Toast/BossHealthBar→StatBar/PetIndicator/SpellUpgradePanel/ChestInventoryPanel → bold-flat (3D entities untouched)
src/HUD.jsx                    MOD  boss/pet/spell-upgrade notification banners → Toast
src/App.css                    MOD  remove .game-panel base (+ .glow-button if MenuSystem migrated) — grep-guarded
src/App.jsx + scripts/visual/capture.mjs + tests/visual/diff.test.js  MOD  achievements-open capture state
tests/gates/static-gates.test.js  MOD  flip the single-language it.todo → real assertion (GREEN)
tests/visual/baseline/{explore-day,explore-night,boss-obsidian,achievements-open}.png  re-baseline (reviewed)
```

---

### Task 1: QuestSystem neon → bold-flat
**Files:** `src/QuestSystem.jsx` (QuestTracker:303, NotificationStack:387, AchievementsPanel:425, ChestIndicator:705).
- [x] Read those 4 + the primitives + the migrated GamePanels (pattern). Rewrite: `NotificationStack` → stacked `Toast`s (status by notif type); `QuestTracker` → a bold-flat `Panel` (quest rows, claim `Button`, progress via a thin bar/`StatBar`); `AchievementsPanel` → `Panel` (glass shell gone — this removes the last `.game-panel` consumer; achievement tiles → `Slot`/bold-flat rows, locked/unlocked states); `ChestIndicator` → bold-flat marker/`Panel`. Map emoji → `Icon` where possible. Preserve quest-claim + achievement-unlock + chest-indicator logic + the `ACHIEVEMENTS` data. Verify build+unit. Commit `feat(s1c-m2c): QuestSystem (quests/notifications/achievements/chest) → bold-flat`.

### Task 2: AdvancedGameFeatures neon → bold-flat
**Files:** `src/AdvancedGameFeatures.jsx` (SurvivalWarning:46, BossHealthBar:193, PetIndicator:837, SpellUpgradePanel:1116, ChestInventoryPanel:1295). **Do NOT touch `BossEntity`/`PetEntities` (3D).**
- [x] Read those 5 + primitives. Rewrite: `SurvivalWarning` → `Toast status="warn/danger"`; `BossHealthBar` → a bold-flat boss `StatBar`/`Panel` (boss name + phase + health bar — use `StatBar` for the health, a `Panel` frame, keep `bossActive`/`bossHealth`/`bossMaxHealth`/`bossPhase`); `PetIndicator` → bold-flat `Panel`/`Slot`s; `SpellUpgradePanel` → `Panel` + `Slot`/`Button` (spell upgrade tiles + purchase buttons — keep the upgrade/cost logic); `ChestInventoryPanel` → `Panel` + `Slot`s (keep transfer logic). Preserve ALL handlers + data. Verify build+unit. Commit `feat(s1c-m2c): AdvancedGameFeatures UI (boss-bar/survival/pets/spell-upgrade/chest) → bold-flat`.

### Task 3: HUD notification banners → Toast
**Files:** `src/HUD.jsx` (~348-375: bossNotification/petNotification/upgradeNotification banners).
- [x] Read those banners. Replace the 3 inline gradient/glow banners with `Toast` (status). Keep the conditional rendering + the message sources. Verify build+unit. Commit `feat(s1c-m2c): HUD boss/pet/spell-upgrade banners → Toast`.

### Task 4: Remove last glass CSS + migrate remaining UI-chrome hex
**Files:** `src/App.css` (+ MenuSystem if migrating `.glow-button`).
- [x] Grep-guard `.game-panel` across `src/` — after T1, `AchievementsPanel` no longer uses it → if zero refs, DELETE the `.game-panel` rule. `.glow-button`: grep — if only MenuSystem uses it, EITHER migrate MenuSystem's buttons to `Button` (preferred — then delete `.glow-button`) OR keep `.glow-button` + exclude the title MenuSystem from the gate (document the choice). Migrate remaining UI-chrome hex in the M2c-touched files → tokens (leave VFX/3D/gameplay hex). Verify build+unit. Commit `feat(s1c-m2c): remove last glass CSS + migrate neon-surface chrome hex to tokens`.

### Task 5: `achievements-open` capture state + FLIP the single-language gate
**Files:** `src/App.jsx`, `scripts/visual/capture.mjs`, `tests/visual/diff.test.js`, `tests/gates/static-gates.test.js`.
- [x] Add a DEV test hook to open `AchievementsPanel` (whatever store flag MenuSystem gates it on, e.g. `showAchievements`) + an `achievements-open` capture state (data-testid wait, deterministic). Add to STATES.
- [x] **FLIP the gate:** replace `it.todo('S1-C: single UI design language — no minecraft-bevel + glass + neon coexisting')` with a real `it(...)`: read all `src/**/*.{js,jsx}` + `src/App.css`, assert `/\bminecraft-[a-z]/` count 0, `/game-panel/` count 0, `/backdrop-blur|backdrop-filter/` count 0 (or document any deliberately-excluded surface like the title MenuSystem). It must PASS. Verify `npm run test:unit` green (the gate now asserts, not todos). Commit `test(s1c-m2c): flip single-UI-language hard gate green (bevel+glass+neon unified)`.

### Task 6 (CONTROLLER): re-baseline + review
- [x] `npm run visual:capture`; explore-day/night/boss-obsidian changed (QuestTracker/BossHealthBar/notifications now bold-flat) → view + re-baseline; baseline `achievements-open`; all states green. Add frames to `KEVIN-REVIEW-BATCH.md`.

### Task 7 (CONTROLLER): final review + docs + merge + flush
- [x] Focused review (handlers preserved, 3D entities untouched, no collateral, gate genuinely green). Full gate. Update docs (plan STATUS; CHANGELOG M2c — **S1-C UI consolidation COMPLETE**; ACTIVE_PLAN → M3 or S1-D next; ARCHITECTURE single-language note; native memory + flush). Merge `s1c-m2c-neon-and-gate` → main, push.

---

## Self-Review
- Coverage: QuestSystem (T1) + AdvancedGameFeatures UI (T2) + HUD banners (T3) + last glass + hex (T4) + gate flip + capture (T5) + review/merge (T6/7). 3D entities explicitly excluded. The single-language gate flips only after all 3 languages are gone ✓.
- Risk: (a) AdvancedGameFeatures mixes UI + 3D — touch UI only (T2 explicit). (b) `.glow-button`/MenuSystem decision — grep-guard + document (T4). (c) the gate's "neon" detection is structural (glass/bevel class signatures) not a perfect "neon" detector — that's acceptable + honest (document the gate asserts the removable class signatures). (d) BossHealthBar/QuestTracker re-baseline explore/boss states — reviewed.

## Execution Handoff
Subagent-Driven Development (Opus, sequential per shared file, continuous). Controller owns T6/T7. Review frames → `KEVIN-REVIEW-BATCH.md`.
