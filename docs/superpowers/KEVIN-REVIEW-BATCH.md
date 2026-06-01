# Kevin — Review / Decide Batch (Crafty SOTA master-plan autonomous run)

> Accumulated while building out the master plan autonomously (per Kevin 2026-06-01: "keep building the entire plan, batch anything for me to review/decide for when you complete it, assume all approvals"). Each item = a rendered frame to eyeball or a decision to ratify. Nothing here blocks the build; I proceed on best judgment + log it here. **Review at the end (or any time).**

## 🖼️ Frames to eyeball (visual taste check)
- **S1-C-M1 showcase (DONE, on `main`):** `frontend/tests/visual/baseline/primitives-showcase-{en,zh}.png` — the bold-flat design system, matched to `final-A`. (You caught the first divergence; this is the fixed version.)
- **S1-C-M2a HUD (DONE):** `frontend/tests/visual/baseline/{explore-day,explore-night,boss-obsidian}.png` — the in-game HUD migrated to bold-flat (StatBars with icons, Slot hotbar, bold-flat spell chip + minimap/compass + XP/level; ❤/🍖 emoji + minecraft-bevel gone). My audit: hotbar crisp, StatBars clean. **Mid-migration mix is expected** — the top-left quest panel + top-right controls panel are still the old languages (quests=neon→M2c; controls=its own→folded into M2c). The HUD layout/positions are unchanged from before (M2a migrated chrome, not layout).

## 🤔 Decisions to ratify (proceeded on best judgment)
- **HUD layout polish (deferred):** M2a migrated the HUD *chrome* but kept the existing *layout* (bar positions, the quest panel + controls panel + spell chip all clustering top). A dedicated HUD *layout* pass (hierarchy, spacing, thumb-zone, decluttering) could be an S1-D or M2-polish item — flag if you want it scheduled.
- **zh-body font = real Alibaba PuHuiTi 3.0** (subset common-CJK, 2.9MB lazy) — sourced from a jsDelivr npm mirror (`alibabapuhuiti-3-55-regular`), verified genuine. OK as the shipping zh body?
- **game-icons.net = CC BY 3.0** → a credits screen is owed (scheduled for M3). OK to keep game-icons (vs Lucide-only)?
- **Monetization / S4** (cosmetics + transparent pass, NO gacha) — when I reach S4 I'll surface the concrete monetization plan here for your sign-off before any pricing/store wiring.

## 📋 Known tech-debt / residuals carried (non-blocking)
- explore-night ~0.06% residual (terrain chunk-stream meshing order) — under the 6% gate, separate subsystem.
- `showcase-scene.png` 753KB lives in `src/ui/` (DEV-only, tree-shaken from prod) — could be compressed; cosmetic.
- GameSystems/SimpleExperienceSystem VFX overlays still use raw Tailwind color classes (`text-red-500` etc.) on dramatic effects (not chrome) — a future raw-Tailwind→token pass if desired.

## ✅ Phases completed this run (all merged to `main`, gates green)
- S1-C-M1 (token foundation + primitives + i18n) + fidelity pass + all tech-debt + residuals.
- S1-C-M2a (HUD consolidation → bold-flat).
- _(appended as phases complete…)_

- **S1-C-M2b modals (DONE):** `frontend/tests/visual/baseline/inventory-open.png` — the migrated Inventory modal (glass→bold-flat: Panel shell, paper-doll + gear Slots, rarity-FILLED item grid w/ 2-tone icons, Combat-Stats panel, gold Equip). All 5 modals migrated. (CraftingTable/Magic/Building/Settings not separately captured — verified via build + the shared pattern.) Note: `AchievementsPanel` (QuestSystem) still glass → migrating in M2c.

- **S1-C-M2c neon→bold-flat (DONE):** `frontend/tests/visual/baseline/achievements-open.png` — migrated AchievementsPanel + QuestTracker; explore-day/night/boss-obsidian re-baselined (bold-flat quest panel/boss bar/notifications). The **single-UI-language hard gate is now GREEN**. Achievement/quest TEXT still has emoji (🔪/👣/⚔️…) — that's M3's data-decouple. **NEW: M2d** will retire the last 3 in-game glass usages (`SimplifiedNPCSystem.jsx` NPC trading modal + dialogue bubble).

- **S1-C-M2d NPC glass (DONE):** `SimplifiedNPCSystem.jsx` NPC trading modal + dialogue bubble + controls panel → bold-flat (the last in-game glass). Gate tightened to ban `backdrop-blur` in-game (only App.jsx pre-game splash + dev DebugOverlay excluded — both non-game-chrome). Not in a capture state (mounted via NPC-proximity) — no frame to eyeball; verified via build + the tightened gate. **S1-C UI consolidation COMPLETE.**
