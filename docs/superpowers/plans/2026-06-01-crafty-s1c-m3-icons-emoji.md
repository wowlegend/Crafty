# Crafty S1-C-M3 — Icon System + Emoji-DATA Decouple + Zero-Emoji Gate — Implementation Plan

> **STATUS: ✅ COMPLETE + MERGED (2026-06-02).** All tasks done. `src/` emoji 215→0; 19 new filled glyphs baked; `src/data/items.js` registry (single source for name/icon/rarity, dup mappers killed); loot/recipe identity decoupled to emoji-free names + save normalizer; deliberate rarity FIX (Golden Crown/Star Fragment→legendary etc.); decorative sweep; Credits screen (CC BY 3.0); **zero-emoji hard gate flipped GREEN** (both S1-C gates assert, 0 todos). 5-lens adversarial review → no BLOCKING; 1 HIGH (trophy shadow) + 4 minor all fixed. `test:unit` **296/0todo** · `test:visual` **10/10** (6 frames re-baselined). Detailed contract: `docs/superpowers/specs/2026-06-01-crafty-s1c-m3-icon-registry-contract.md`. **→ S1-C UI DESIGN SYSTEM COMPLETE. Next: S1-D.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` checkboxes. **Opus 4.8. Sequential where files are shared. NO Claude footer. NEW commits. AST-safe edits (no `sed` on `.js/.jsx`). RIGOROUS TDD — this touches LOAD-BEARING gameplay data (loot identity, rarity match); write characterization tests FIRST.**

**Goal:** Remove ALL emoji from Crafty by formalizing the game-icon system and **decoupling emoji from data structures** — emoji are currently baked into loot-table item NAMES as the item identity (`'🥩 Raw Porkchop'`) and used as rarity match-keys — then flip the zero-emoji hard gate green and add the game-icons.net CC-BY credits screen. Gameplay (loot drops, inventory, rarity, crafting) must be behavior-preserving.

**Architecture:** Today an item's identity = emoji + text (the loot drop `'🥩 Raw Porkchop'` becomes the inventory key + display). `getItemRarity(name)` + `getItemEmoji(name)` are DUPLICATED (SimplifiedNPCSystem:1116/1124 + GamePanels:32/74) and match on substrings (mostly text like `includes('Iron')`, with `includes('🗡️')` fallbacks). M3 introduces a single **`src/data/items.js`** registry (stable id → `{ name, icon, rarity }`), changes loot/recipe data to emoji-free names (or ids), routes all rarity/icon lookups through the registry (the `Icon` primitive is already game-icons-capable from M1/M2), replaces decorative emoji (achievement/quest titles, damage numbers, `✅`/`🔒`, headers) with `Icon`/text, adds a save-load normalizer for legacy emoji-named inventory keys, flips the `it.todo('zero emoji')` gate, and adds a credits screen for game-icons.net (CC BY 3.0).

**Tech Stack:** React 19, M1 bold-flat primitives + `Icon`/`gameIcons.js`, zustand store, the puppeteer+pixelmatch + static-gates suites.

---

## Pre-flight facts (the load-bearing coupling — verified 2026-06-01)
- **Emoji-in-loot-NAMES (the crux):** `QuestSystem.jsx` `LOOT_TABLES`/`CHEST_LOOT` (lines ~13-45) use item names WITH leading emoji: `'🥩 Raw Porkchop'`, `'🦴 Bone'`, `'🗡️ Iron Nugget'`, `'💎 Emerald'`, `'❤️ Health Potion'`, `'👑 Golden Crown'`, `'🌟 Star Fragment'`, etc. These names flow into `addToInventory(name)` → become inventory KEYS + display. **Decoupling = a loot/inventory identity change.**
- **Rarity match** (`getItemRarity`, dup in SimplifiedNPCSystem:1116 + GamePanels:32) mostly matches TEXT (`includes('Diamond')`/`'Iron'`/`'Stone'`/`'Sword'`/`'Helmet'`…) + a few emoji fallbacks (`includes('🗡️')`/`'🛡️'`). After names go emoji-free, the TEXT matches still work — but VERIFY per-item with characterization tests; drop the dead emoji fallbacks.
- **`getItemEmoji`** (dup in SimplifiedNPCSystem:1124 + GamePanels:74) maps name→emoji for display; M2 already added a game-icon `ItemIcon` in GamePanels (with a swatch+emoji fallback). M3 makes ONE registry the source for icon + rarity, kills the dups.
- **Decorative emoji:** achievement/quest TITLES (`'🗡️ First Blood'`, `'👣 First Steps'`, … QuestSystem:50-83 + the `icon:` fields), damage numbers (SimplifiedNPCSystem ~354), `✅`/`🔒` (QuestSystem:359/462), modal/HUD headers (already mostly migrated in M2 — sweep remainders), AdvancedGameFeatures labels. Replace with `Icon`/game-icons or plain text.
- **Save-compat:** old saves have emoji-prefixed inventory keys. Add a normalizer in `loadWorldData` (strip a leading emoji+space, or map via the registry) so old saves don't show emoji or break. (Crafty is early-dev; a normalizer is cleaner than a hard break.)
- **The gate:** `tests/gates/static-gates.test.js` has `it.todo('S1-C: zero emoji as brand/mascot/HUD markers (hard fail)')`. Flip to a real assertion: zero emoji in `src/` (or a documented-narrow scope — e.g. zero in data + UI render paths; console.error logs like `'❌ Save error'` may be allowed/excluded or also cleaned). Decide + document; prefer FULL zero-emoji in `src/`.
- **License:** game-icons.net is CC BY 3.0 → a credits screen is owed. Add a "Credits / Attributions" view (reachable from Settings) listing game-icons.net (CC BY 3.0) + the fonts (Lilita One/Space Grotesk/Smiley Sans OFL, Alibaba PuHuiTi).
- **Caution (the M2 trap):** the emoji burn-down must grep ALL emoji (data + JSX + the unicode ranges incl. variation selectors like `️`), not just obvious ones. 215 instances across 16 files today.

## File structure
```
src/data/items.js                NEW  registry: ITEMS {id:{name,icon,rarity}} + getItemRarity/getItemIcon/normalizeItemName/lootName→id
src/QuestSystem.jsx              MOD  LOOT_TABLES/CHEST_LOOT → emoji-free names (or ids); achievement/quest titles + icon fields → text + Icon; ✅/🔒 → Icon
src/ui/GamePanels.jsx            MOD  use the registry (drop the dup getItemRarity/getItemEmoji); ItemIcon → registry icon
src/SimplifiedNPCSystem.jsx      MOD  drop the dup getItemRarity/getItemEmoji → registry; damage-number emoji → text/Icon
src/store/useGameStore.jsx       MOD  loadWorldData normalizer for legacy emoji inventory keys; any emoji in console logs (optional)
src/AdvancedGameFeatures.jsx, HUD.jsx, MenuSystem.jsx, GameScene.jsx, render/*  MOD  sweep remaining decorative emoji → Icon/text
src/ui/CreditsScreen.jsx         NEW  game-icons CC-BY + font attributions (reachable from Settings)
tests/data/items.test.js         NEW  CHARACTERIZATION: rarity+icon per item (captures current behavior)
tests/gates/static-gates.test.js MOD  flip zero-emoji it.todo → real GREEN assertion
```

---

### Task 1 (TDD FIRST): Characterization tests for loot/rarity/icon behavior
**Files:** Create `tests/data/loot-characterization.test.js`.
- [ ] BEFORE changing any data: write tests that capture the CURRENT behavior so the refactor is provably behavior-preserving. Import the current `getItemRarity` (from SimplifiedNPCSystem or GamePanels) + the `LOOT_TABLES`/`CHEST_LOOT` data. Assert: (a) for a representative set of items, `getItemRarity(name)` → the exact current tier; (b) the loot tables contain the expected items/chances; (c) snapshot the current emoji→item-name set. Run → all PASS (capturing today's behavior). These tests are the safety net for Tasks 2-3. Commit.

### Task 2: The `items.js` registry (single source for name/icon/rarity)
**Files:** Create `src/data/items.js`.
- [ ] Build `ITEMS` keyed by stable id (e.g. `raw_porkchop`, `iron_nugget`, `emerald`, `health_potion`, `golden_crown`, `diamond_sword`, …) → `{ name: 'Raw Porkchop', icon: 'meat', rarity: 'common' }` (icon = a `gameIcons.js` name or a Lucide chrome name). Provide `getItemRarity(idOrName)`, `getItemIcon(idOrName)`, and `normalizeItemName(name)` (strips a leading emoji+space → text name; maps to the registry). Cover every item that appears in LOOT_TABLES/CHEST_LOOT/EQUIPMENT_STATS/inventory starting items. Add unit tests for the registry (rarity/icon per id; normalizeItemName strips emoji). Make the characterization tests (T1) pass against the NEW registry's `getItemRarity` too (behavior-preserving). Commit.

### Task 3: Decouple loot/inventory identity (emoji-free names) + route through the registry
**Files:** `src/QuestSystem.jsx` (LOOT_TABLES/CHEST_LOOT), `src/ui/GamePanels.jsx`, `src/SimplifiedNPCSystem.jsx`, `src/store/useGameStore.jsx`.
- [ ] Change LOOT_TABLES/CHEST_LOOT item names to the emoji-free names (or ids) from the registry. Replace the DUPLICATE `getItemRarity`/`getItemEmoji` in SimplifiedNPCSystem + GamePanels with imports from `src/data/items.js` (icon via the `Icon` primitive + `getItemIcon`). Add the `loadWorldData` save normalizer (legacy emoji keys → registry names). Run the T1 characterization tests → still PASS (rarity/loot behavior preserved). Verify build+unit. Commit.

### Task 4: Sweep remaining decorative emoji → Icon/text
**Files:** `src/QuestSystem.jsx` (achievement/quest titles + `icon:` fields + ✅/🔒), `src/SimplifiedNPCSystem.jsx` (damage numbers), `src/AdvancedGameFeatures.jsx`, `src/HUD.jsx`, `src/MenuSystem.jsx`, `src/GameScene.jsx`, `src/render/*`, `src/i18n/*`, `src/store` (console logs).
- [ ] Replace each remaining emoji with an `Icon`/game-icon or plain text (achievement icons → the achievement's game-icon; quest titles → text; ✅→`Icon name="..."`/check, 🔒→a lock Icon; damage-number emoji → styled text). For non-UI emoji (console.error `❌`, render-comment emoji) → plain text. Re-run the emoji burn-down → approaching 0. Verify build+unit. Commit.

### Task 5: Credits screen (game-icons CC BY 3.0 + fonts)
**Files:** `src/ui/CreditsScreen.jsx` (new), `src/ui/GamePanels.jsx` SettingsPanel (add a "Credits" button), store flag.
- [ ] A bold-flat `Panel` listing: game-icons.net (CC BY 3.0, link), fonts (Lilita One / Space Grotesk / Smiley Sans — OFL; Alibaba PuHuiTi 3.0), and any other attributions. Reachable from Settings. Verify build+unit. Commit.

### Task 6: FLIP the zero-emoji hard gate
**Files:** `tests/gates/static-gates.test.js`.
- [ ] Replace `it.todo('S1-C: zero emoji …')` with a real assertion: walk `src/**/*.{js,jsx}`, assert the emoji regex finds ZERO matches (or a documented narrow allowlist if a few non-UI console logs are intentionally kept — prefer zero). Must PASS honestly (clean the source, don't weaken). `npm run test:unit` → both S1-C hard gates (single-language + zero-emoji) now green; `it.todo` count → 0. Commit.

### Task 7 (CONTROLLER): re-baseline + review + merge + flush
- [ ] `npm run visual:capture`; the emoji→Icon swaps change explore/achievements/inventory frames → view + re-baseline; add frames to `KEVIN-REVIEW-BATCH.md`. Final review (loot/rarity behavior preserved via the characterization tests; no gameplay regression; save normalizer works). Full gate (both hard gates green). Update docs (plan STATUS; CHANGELOG — **S1-C COMPLETE**; ACTIVE_PLAN → S1-D; ARCHITECTURE; native memory + flush). Merge `s1c-m3-icons-emoji` → main, push.

---

## Self-Review
- Coverage: characterization-first (T1) → registry (T2) → loot/identity decouple (T3) → decorative sweep (T4) → credits (T5) → gate flip (T6) → review/merge (T7). The load-bearing loot/rarity logic is protected by T1's tests run after every change ✓. Save-compat handled (T3 normalizer) ✓. Both S1-C hard gates green at the end ✓.
- Risk: (a) loot identity is gameplay-load-bearing → T1 characterization tests are the gate (run them after T2 + T3). (b) save-compat → normalizer. (c) the emoji regex must catch variation-selectors (`️` U+FE0F) + ZWJ sequences — use a thorough unicode-range regex. (d) some items map to no clean game-icon → pick the closest or a generic + log.

## Execution Handoff
Subagent-Driven Development (Opus, sequential per shared file). **TDD-critical**: T1 characterization tests run after T2 + T3 to prove behavior preservation. Controller owns T7. Review frames → `KEVIN-REVIEW-BATCH.md`.
