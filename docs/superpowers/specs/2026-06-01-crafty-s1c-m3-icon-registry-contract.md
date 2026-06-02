# S1-C-M3 — Icon Registry + Emoji-Disposition CONTRACT

> The single source of truth for M3 implementers. Each task (T2–T6) follows this verbatim.
> Design language (LOCKED, from M1 fidelity pass): **filled 2-tone game-icons (game-icons.net) for game CONTENT**
> (items in Slots, spells, mobs, achievements), **lucide outline for app-chrome + transient/decorative UI**.
> game-icons.net is **CC BY 3.0** → credits screen owed (T5).

---

## 1. NEW filled glyphs to bake into `src/ui/primitives/gameIcons.js`

**Fetch recipe (Iconify normalizes game-icons.net author prefixes away — slug-only):**
```bash
curl -s "https://api.iconify.design/game-icons.json?icons=crown,dragon-head,spider-face,eyeball,pig,cow,emerald,cut-diamond,animal-hide,wool,ore,shambling-zombie,trophy-cup,locked-chest,open-treasure-chest,pointy-hat,arrow-cluster,crossed-bones,glowing-artifact"
```
Response shape: `{ "icons": { "<slug>": { "body": "<svg-inner verbatim, already fill=currentColor>" } }, "width":512, "height":512 }`.
**Bake format** (identical to existing entries — `vb` = `0 0 512 512` unless the per-icon `width`/`height` differ):
```js
'<slug>': { vb: '0 0 512 512', inner: '<the body string verbatim>' },
```
All 19 slugs above resolve on Iconify (verified 2026-06-01). Add them to the `GAME_ICONS` object. **Verify after baking:** `npm run build` clean + each renders (no broken `viewBox`).

## 2. `Icon` primitive expansion (`src/ui/primitives/Icon.jsx`)

**`GAME_NAMES` additions** (friendly alias → new baked glyph key):
```
crown:'crown'  dragon:'dragon-head'  spider:'spider-face'  eye:'eyeball'
pig:'pig'  cow:'cow'  emerald:'emerald'  diamond:'cut-diamond'
hide:'animal-hide'  leather:'animal-hide'  string:'wool'  wool:'wool'
ore:'ore'  nugget:'ore'  zombie:'shambling-zombie'  trophy:'trophy-cup'
chest-closed:'locked-chest'  treasure:'locked-chest'  chest-open:'open-treasure-chest'
wizard:'pointy-hat'  mascot:'pointy-hat'  arrow:'arrow-cluster'
bone:'crossed-bones'  pearl:'glowing-artifact'  artifact:'glowing-artifact'
```
(Keep all existing aliases. `gem`→gem-pendant stays; new `diamond`→cut-diamond is additive.)

**`CHROME` additions** — named imports from `lucide-react` (tree-shaken; verify each exists in 0.439):
```
Trophy, Gift, Lock, Check, AlertTriangle, Skull, Sun, Moon, CloudRain,
Snowflake, Home, Globe, Backpack, Footprints, Sparkles, PartyPopper,
ArrowRight, Building2, Dumbbell, Gem, Landmark, Hammer, Heart, Bug
```
Register lowercase keys:
```
trophy:Trophy  gift:Gift  lock:Lock  check:Check  warning:AlertTriangle
skull:Skull  sun:Sun  moon:Moon  rain:CloudRain  snow:Snowflake  home:Home
globe:Globe  backpack:Backpack  footprints:Footprints  sparkles:Sparkles
party:PartyPopper  arrow-right:ArrowRight  building:Building2  strength:Dumbbell
gem-chip:Gem  landmark:Landmark  hammer:Hammer  heart:Heart  bug:Bug
```

## 3. `src/data/items.js` — the registry (single source for name/icon/rarity)

`ITEMS` keyed by **stable id** → `{ name, icon, rarity }`. `icon` = an `Icon` primitive name (§2). Full table:

| id | name | icon | rarity | note |
|---|---|---|---|---|
| raw_porkchop | Raw Porkchop | meat | common | |
| raw_beef | Raw Beef | meat | common | |
| cooked_porkchop | Cooked Porkchop | meat | rare | |
| cooked_beef | Cooked Beef | meat | rare | |
| bone | Bone | bone | common | |
| leather | Leather | leather | rare | word-match preserved |
| rotten_flesh | Rotten Flesh | meat | common | |
| iron_nugget | Iron Nugget | ore | epic | word-match preserved |
| emerald | Emerald | emerald | **epic** | FIX (was common/legendary split) |
| arrow | Arrow | arrow | common | |
| spider_eye | Spider Eye | eye | common | |
| string | String | string | common | |
| ender_pearl | Ender Pearl | pearl | **epic** | FIX (was common at runtime) |
| health_potion | Health Potion | potion | rare | exact-match preserved |
| mana_potion | Mana Potion | potion | **epic** | FIX (emoji prefix broke exact → common) |
| damage_scroll | Damage Scroll | scroll | **rare** | enhance (buff consumable) |
| shield_scroll | Shield Scroll | scroll | **rare** | FIX divergence (NPC epic / Panels common) |
| diamond_gem | Diamond | diamond | legendary | word-match preserved |
| golden_crown | Golden Crown | crown | legendary | FIX (emoji prefix broke exact → common); also head-equip |
| star_fragment | Star Fragment | star | legendary | FIX (was common at runtime) |
| sword | sword | sword | common | equip |
| pickaxe | pickaxe | pickaxe | common | equip |
| wooden_shield | Wooden Shield | shield | common | quirk preserved (no word-match) |
| stone_sword | Stone Sword | sword | rare | |
| leather_helmet | Leather Helmet | helmet | rare | |
| leather_chestplate | Leather Chestplate | chestplate | rare | |
| leather_boots | Leather Boots | boots | rare | |
| iron_sword | Iron Sword | sword | epic | |
| iron_shield | Iron Shield | shield | epic | |
| iron_helmet | Iron Helmet | helmet | epic | |
| iron_chestplate | Iron Chestplate | chestplate | epic | |
| iron_boots | Iron Boots | boots | epic | |
| diamond_sword | Diamond Sword | sword | legendary | |
| diamond_shield | Diamond Shield | shield | legendary | |
| diamond_helmet | Diamond Helmet | helmet | legendary | |
| diamond_chestplate | Diamond Chestplate | chestplate | legendary | |
| diamond_boots | Diamond Boots | boots | legendary | |

**API:**
- `getItemRarity(idOrName)` → normalize emoji prefix → lookup by id, else by exact name, else legacy substring fallback (`includes('Diamond')`→legendary, `'Iron'`→epic, `'Stone'`/`'Leather'`→rare) for blocks/unknowns, else `'common'`. **Preserves every plain-name + lowercase-block case in the T1 tests.**
- `getItemIcon(idOrName)` → registry `icon`; for unknowns/blocks return `null` (caller renders the BLOCK_TYPES color swatch — **never an emoji**).
- `getItemName(id)` → display name.
- `normalizeItemName(name)` → strips a single leading emoji (+ optional U+FE0F + space) → clean name; used by the save normalizer + getItemRarity/getItemIcon.
- Build `NAME_TO_ID` + `NAME_TO_RARITY` lookup maps from `ITEMS`.

Registry unit tests: rarity+icon per id; `normalizeItemName` strips every emoji prefix in the §4 loot set; the legacy substring fallback still fires for blocks.

## 4. Data decouple (T3) — emoji-free identity

`QuestSystem.jsx` `LOOT_TABLES`/`CHEST_LOOT`: change every `item:` string to the **clean name** from §3 (e.g. `'🥩 Raw Porkchop'`→`'Raw Porkchop'`, `'👑 Golden Crown'`→`'Golden Crown'`). Chances/xp/effects unchanged.
`GamePanels.jsx` crafting recipe patterns + outputs: `'🗡️ Iron Nugget'`→`'Iron Nugget'`, `'🧶 Leather'`→`'Leather'`, `'🧵 String'`→`'String'`, `'🏹 Arrow'`→`'Arrow'`.
Replace the **duplicated** `getItemRarity`/`getItemEmoji` in `SimplifiedNPCSystem.jsx` (~1116/1124) AND `GamePanels.jsx` (~37/79) with imports from `src/data/items.js`. `ItemIcon` (GamePanels ~106) renders `getItemIcon` → `<Icon>`; fallback = color swatch (NO `getItemEmoji`, delete it).
`useGameStore.jsx` `loadWorldData`: normalize legacy inventory keys via `normalizeItemName` so old saves don't show/break on emoji keys.

**T1 update (DELIBERATE, diff-visible):** the emoji-prefixed rarity cases + the cross-file divergence test now resolve to the §3 tiers (single registry source). Update those assertions with a comment per change citing the FIX. **Do NOT change** the plain-name / equipment / lowercase-block assertions (registry preserves them). Re-run T1 → green.

## 5. Emoji disposition (T4) — every remaining emoji → Icon/text

**Centralize notification icons:** map `NotificationStack`/`Toast` `type` → a lucide chrome icon, so most notification-string emoji just get DELETED (the Toast renders the status icon):
`achievement→trophy · quest→check · reward→gift · loot→gift · warning→warning · danger→skull · success→check · info→sparkles`.

| File | emoji | → replacement |
|---|---|---|
| QuestSystem | 🏆/✅/🎁/💎 notification prefixes | DELETE (Toast type-icon renders it) |
| QuestSystem | quest titles 🗡️🏹🧱⛏️✨🧟🕷️🧭💰🏗️🏆🧙👑🌍💀 | strip emoji from `title`; add a per-achievement `icon` field (sword/bow/hammer/pickaxe/magic/zombie/spider/compass/coins/building/trophy/wizard/crown/globe/skull) rendered via `<Icon>` |
| QuestSystem | achievement `icon:` 👣⚔️💀🏛️✨🧙📦⭐🌟💪⛏️🏠 | → icon names: footprints/sword/skull/landmark/magic/wizard/chest-closed/star/star/strength/pickaxe/home |
| QuestSystem | 🎉 all-complete · 🔒 locked | → `<Icon name="party">` · `<Icon name="lock">` |
| AdvancedGameFeatures | survival ☠️/☀️ | → strip; SurvivalWarning already Toast (danger/warn) — add skull/sun icon |
| AdvancedGameFeatures | boss 🐉 (marker/bar/notifs) | → `<Icon name="dragon">` (bar header); strip from notif strings |
| AdvancedGameFeatures | 🔥🦖💀✈️ phase subtext | → plain text ("Phase 2: Grounded Carnage [Knockback Roars]") |
| AdvancedGameFeatures | 🔥🔊💀 combat notifs | → strip (Toast danger/warn) |
| AdvancedGameFeatures | pet ❌/❤️/🐾/⚔️ | ❌→strip(warn) · ❤️→strip(success) · 🐾 badge→`<Icon name="pig">`? use a paw — lucide has no paw; use text "Pets" + count · order verbs plain text |
| AdvancedGameFeatures | pet type 🐷/🐮 | → `<Icon name="pig"/cow">` |
| AdvancedGameFeatures | spell titles/icons 🔥❄️⚡🔮💜 | → icon names fire/ice/lightning/arcane (magic-swirl); strip from titles |
| AdvancedGameFeatures | ✨ tree header · 🔒 locked · ⭐ max-rank | → sparkles/lock/star Icons |
| AdvancedGameFeatures | 📦🎒💡 chest-panel headers | → chest-open/backpack Icons; 💡 tip → strip or `<Icon name="sparkles">` |
| SimplifiedNPCSystem | 💥 crit | → drop emoji; keep `${damage}!` with crit styling (no icon on floating number) |
| SimplifiedNPCSystem | 🎒 looted notif | → strip (Toast loot→gift) |
| HUD | 🐉/📦/🧙‍♂️ compass markers (innerHTML) | → clean TEXT labels "BOSS (Nm)" / "Chest (Nm)" / "NPC (Nm)" (no emoji; innerHTML can't host React) |
| GameScene | 🌧️/❄️/☀️ weather notifs | → strip (Toast info/success) |
| MenuSystem | 🧙‍♂️ mascot | → large `<Icon name="mascot">` (pointy-hat) |
| MenuSystem | ⚔️ Start Adventure | → `<Icon name="sword">` + text |
| GamePanels | `{'→'}` crafting arrow | → `<Icon name="arrow-right">` |
| useGameStore | console 🛡️/💥/❌ | → plain text tags `[i-frames]`/`[hit]`/`[save error]`/`[load error]` |
| ALL files | `→` in code COMMENTS | → ASCII `->` |

## 6. Gate (T6)
`tests/gates/static-gates.test.js`: replace `it.todo('S1-C: zero emoji …')` with a real `it(...)` that walks `src/**/*.{js,jsx,css}` and asserts the comprehensive emoji regex (incl. `\u{FE0F}` variation selectors, `\u{1F000}-\u{1FAFF}`, `\u{2600}-\u{27BF}`, `\u{2B00}-\u{2BFF}`, the symbol-emoji `\u{2190}-\u{21FF}`/`\u{2300}-\u{23FF}` ranges) finds **0** matches across all of `src`. No allowlist — clean the source. Both S1-C hard gates green; `it.todo` count → 0.
