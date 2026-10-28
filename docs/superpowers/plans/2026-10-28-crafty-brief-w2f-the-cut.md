# Brief: W2-F, the Cut (2026-10-28)

**Plan:** `2026-10-28-crafty-sota-reset.md`, rows 19-24 and the rest of row 8, lane W2-F (Wave 2). **Decisions:**
DECISIONS 2026-10-28 (W1-H) items 4 (one costed build mode), 5 (Ember), 6 (talents and relics), 7 (the Forge), 10 (the
placement-count quests).
**Status:** unstarted. Starts after #24 (landed), combat stance (#6), the light and colour lane (#5) and W1-A, because
those lanes own `store/useGameStore.jsx`, `HUD.jsx`, `MenuSystem.jsx` and `world/survivalSystem.js`. It shares the HUD's
files with W2-D: run them in sequence, W2-F's HUD edits first (they only delete bars). **Owner:** the command session.

## What the player gets

A game with one economy instead of four. Placing a block spends a block, so a wall is a choice. One ember-gold bar
replaces four meters. Each level grants one talent point that changes how a verb plays, and loot brings relics. Mara's
Forge shows what each upgrade costs. No hidden recipe grid, no hunger bar, and quests name the creatures on screen.

## The order (one small PR each)

1. **Tombstone pass-through (row 20).** Unknown progression and game-state keys survive load and save unchanged for
   one release, so a rollback loses nothing. Lands first; every later step relies on it.
2. **One costed mode (row 19).** `resolvePlacement` always costs one block; the creative/survival toggle
   (`ui/GamePanels.jsx` Settings, the `setGameMode` button) and the Mode chip (`ui/GameHud.jsx:82-83`) go; `gameMode`
   stops being written (`game/saveSchema.js:52`). The three placement-count quests (builder, architect, world_builder in
   `QuestSystem.jsx` `QUEST_LIST`) go: with placement costed, placing and breaking one block completes them for free
   (item 10).
3. **Ember (row 21).** One `ember` bank replaces `ferocityBanked`, `kineticBanked`, `soulBanked` and `resonanceBanked`
   (`game/saveSchema.js:46-49`), with the four spends unchanged. Accrual: day kills (the `world/accrualHooks.js` bridges)
   and building (`game/resonance.js` `PLACE_GAIN`), with a per-day cap. Load migrates the four old banks into one (sum,
   clamped). One HUD bar replaces four.
4. **Talents and relics (row 22).** Delete hand attribute allocation (`allocateAttribute`, `store/useGameStore.jsx:326`;
   five points per level at `:450-456`), the free spell-mastery click (`upgradeSpell`, `world/spellUpgrades.js:90`), the
   crystal wallet and wand discount (`game/crystalWallet.js`) and `game/affixes.js`. A level grants one talent point;
   spells scale with level. First a damage rebalance: `solveSpellDamage` (`utils/combat.js:18`) reads attributes.
5. **The Forge (row 23).** A Forge card on Mara (G) with a weapon upgrade and a relic upgrade, each showing its cost.
   Delete `ui/panels/CraftingTable.jsx`, `data/recipes.js`, the C key, the touch-tray Craft slot and the pickaxe item.
   The lantern entry joins the card when the lantern block exists (lantern brief).
6. **Hunger, the rest of row 8.** Delete the `hunger` store field (`store/useGameStore.jsx:898` and its setters), the
   hunger bar, raw and cooked meat. W1-B already deleted the drain interval.
7. **Quest text from `displayName` (row 24 half).** Quest titles and descriptions name mobs by `MOB_TYPES[type].displayName`
   (`game/mobTypes.js`: zombie reads Husk), and a `kills_by_type` key map keeps old progress counting.

## Acceptance

- **Every PR** carries one real-input e2e: the removed surface is gone, and the game boots, fights and saves.
- **A pre-cut save fixture** (written by Task 0 from today's main) loads after every step with no NaN damage and its
  level kept.
- **Live, after the series:** a fresh profile shows no Mode chip, one ember bar, no C key and no grid, and a Talents page
  of one screen; placing a block lowers its stack; the old save fixture, loaded on the live site, keeps its level.

## One-way doors

The save fields the Cut stops writing (`gameMode`, the four banks, `attributes`, `spellLevels`, crystals). Each door
closes at the first push that stops writing the field; the tombstone pass-through holds it open one release. Write the
pre-cut fixture before step 2, never after.

## Registry rows this lane closes

`OPEN_ITEMS:OI-60` and `STATUS:E-ter:item-sets-set-bonuses-affixes/b`: the aspect-underbanked denied-reason, built as
"not enough ember" (Task 3).

Not this lane's: the item-id decouple (`STATUS:F4`, `OPEN_ITEMS:OI-45`). Loot tables (`data/lootTables.js:6-8`) and
`inventory.blocks` (`store/useGameStore.jsx:640`) stay keyed by display name through the Cut; deleting `recipes.js` and
the pickaxe item only shrinks that work. W3-D owns it, and zh-CN content (`OPEN_ITEMS:OI-71`) waits on it.

---

## Task script

Run from `frontend/`. Re-verify every file:line at lane start. Each task: red test first, the change, `npm run lint`,
the touched unit tests, one e2e in CI on a `land/` branch, a commit with `Mutation-Proof:` for any new gate.

### Task 0: The pre-cut save fixture

- [ ] On today's main, play a scripted profile through the DEV bridge to level 5 with attributes allocated, two spell
      levels, all four banks non-zero, crystals, a wand and `gameMode: 'survival'`; save; copy the save JSON to
      `tests/fixtures/pre-cut-save.json`.
- [ ] Unit test: `loadWorldData(fixture)` then a damage roll against a zombie: finite damage, level 5. GREEN on main.
- [ ] Commit: `test(save): a pre-cut save fixture, loaded and fought with, before the Cut`.

### Task 1: Tombstone pass-through (row 20)

- [ ] Red first: a save with an unknown key `progression.futureField` round-trips through load and save unchanged.
- [ ] Implement in `game/saveSchema.js`: unknown keys under `progression` and `game_state` are kept in a `_tombstone`
      bag on load and written back on save, for one `SAVE_VERSION`.
- [ ] Mutant: drop the bag on save. RED.
- [ ] e2e: load the fixture with a planted unknown key, save, read localStorage: the key is there.

### Task 2: One costed mode (row 19, item 4)

- [ ] Red first: `resolvePlacement` with any mode and 0 owned refuses; with 3 owned consumes 1.
- [ ] Simplify `resolvePlacement` to one rule; delete the toggle, the chip and `gameMode`; delete builder, architect and
      world_builder from `QUEST_LIST` and their lore (item 10).
- [ ] e2e (real input): place a block; the hotbar count falls by one; with zero left, placement is refused.
- [ ] Fixture: still loads, level kept.

### Task 3: Ember (row 21, item 5)

- [ ] Pure `game/ember.js`: `clampEmber`, `emberForKill(type, isDay)`, `emberForPlace()`, `dailyCap`, and
      `migrateBanks(old)` (sum of the four, clamped). Unit tests including the cap and the migration of the fixture.
- [ ] Mutant: migration takes only `ferocityBanked`. RED.
- [ ] Store: one `ember` bank and its accrue/spend; the four spends read and spend `ember`; delete the four banks and
      their clamps; the Resonance build bridge feeds `ember`.
- [ ] HUD: one ember-gold bar in place of four.
- [ ] Red first: `game/deniedReason.js` gains a `no-ember` kind ("Not enough ember", through `t()` in both locales), and
      a spend refused for want of ember shows it. Today such a refusal shows nothing: only `aspect-locked` and `no-mana`
      reach `notifyDenied` (`Components.jsx:400-420`, `EnhancedMagicSystem.jsx:215`). Mutant: drop that `notifyDenied`
      call. RED.
- [ ] e2e: kill a mob by day, the bar rises; roar spends it; night kills add nothing.

### Task 4: Talents and relics (row 22, item 6)

- [ ] Damage rebalance first: a table test of player damage at levels 1, 5, 10 and 20 against each hostile, today's
      values recorded; the new level-only scaling must land within the stated band (state it in the test).
- [ ] Red first: a level-up grants exactly one talent point and no attribute points.
- [ ] Delete `allocateAttribute`, the attribute panel UI, `upgradeSpell`'s free click, `crystalWallet.js`, the wand
      discount and `affixes.js`. Talents: rewrite `game/talentTree.js` nodes so each changes a verb (a longer roar, a
      second grab, a wider snare, an imbue that chains); keep capstone exclusivity and respec.
- [ ] Relics: a relic slot fed by loot (`data/lootTables.js`), each relic a verb modifier from the same vocabulary.
- [ ] e2e: reach level 2, spend the point on a verb talent, see the verb change (the roar's duration read from the store).
- [ ] Fixture: loads with no NaN, level kept; its attribute points are dropped and refunded as talent points (state the
      rule in the test).

### Task 5: The Forge (row 23, item 7)

- [ ] Pure `game/forge.js`: offers for a player state (weapon upgrade, relic upgrade), each with a cost in mined blocks
      and coins, and `buy(state, offer)` that spends exactly that cost or refuses.
- [ ] Red first: buying with too little refuses and changes nothing; buying with enough spends the shown cost.
- [ ] UI: a Forge card in Mara's dialogue (G), costs shown; delete CraftingTable, recipes.js, the C key, the tray's Craft
      slot and the pickaxe item.
- [ ] e2e (real input): walk to Mara, press G, buy the weapon upgrade, the hotbar weapon's damage rises.

### Task 6: Hunger (row 8)

- [ ] Delete the `hunger` field, its setters and readers, the bar, and raw and cooked meat (loot tables and items).
- [ ] e2e: a 10-minute world clock fast-forward deals no damage with no food in the inventory.

### Task 7: Quest text from displayName (row 24)

- [ ] Red first: the Zombie Slayer description reads "Defeat 10 Husks"; progress recorded under `kills_by_type.zombie`
      before the change still counts.
- [ ] Generate quest text from `MOB_TYPES[type].displayName` through `t()` keys with a count; map old keys.
- [ ] zh-CN: the same quests render translated.

### Task 8: Live acceptance and land

- [ ] Each step lands on its own (`land/<date>`, `ci ok` green on that sha, fast-forward main).
- [ ] After the last: a fresh profile and the pre-cut fixture, both on https://crafty-game.vercel.app, checked by hand
      on Chromium and the WebKit iPad viewport; lookbook frames of the new HUD bar attached.
- [ ] Close the registry rows above with the merge commits.
