# W2-F steps 6 and 7: hunger out, and quests that name the creatures (task script, 2026-10-29)

**Brief:** `2026-10-28-crafty-brief-w2f-the-cut.md`, "The order" items 6 and 7, "Acceptance", "One-way doors", Task 6
and Task 7. **Plan:** `2026-10-28-crafty-sota-reset.md` row 8 (the rest of it) and row 24 (the quest-text half).
**Builds on:** steps 1-5 on main `ddd4fe78` (tombstone pass-through and the pre-cut fixture, one costed mode, Ember,
talents and relics, the Forge). **Branches:** PR A `feat/w2f-hunger` from `ddd4fe78`; PR B `feat/w2f-quest-text` from
PR A's head, landing after it. DECISIONS items for this lane start at 70 (41-69 are taken).

## What the player gets

No meter that never moves and can still kill, and no food to carry for it: the hunger field, its last readers and the
four meats and rotten flesh leave the game, and a long session costs no health with nothing in the bag to eat. Quests
call the creatures by the names their nametags show in English ("Defeat 10 Husks", not "Defeat 10 zombies") and by
hand-written names in Chinese (the nametags stay English), and a hunt begun before the change keeps its count.

## Decisions this script makes (routine calls, stated; DECISIONS items 70 on record them)

1. **What already went.** W1-B deleted the hunger drain (the 5 s interval) and W2-F step 2 the HUD bar and
   `PlayerHungerBar` (`00c0a8d4`). Left on `ddd4fe78`: the store field (`store/useGameStore.jsx:882`), `setHunger`
   (`:906`), `consumeHunger` (`:1015`, the only `damagePlayer(…, 'starvation')`), `feedPlayer` (`:1025`), respawn's
   refill (`:1035`), the `GameSystems.jsx` context's copies (`:23`, `:28`, `:44`, `:52`, `:56`, `:59`, `:106`, `:113`),
   the inventory's `feed` effect (`ui/GamePanels.jsx:211`), the StatBar's `hunger` kind (`ui/primitives/StatBar.jsx`)
   and the showcase's hunger bar (`ui/PrimitivesShowcase.jsx:117`, which shows the ember bar instead, as the HUD does).
2. **Meat is five items, all food:** Raw Porkchop, Raw Beef, Cooked Porkchop, Cooked Beef and Rotten Flesh. Their
   only effect was `feed` (`game/consumables.js`; the cooked ones also heal 10). With hunger gone a raw meat or rotten
   flesh would be a Use button that destroys the item for nothing, so all five go: `data/items.js`, `game/consumables.js`,
   the loot rows (`data/lootTables.js`: pig, cow, zombie, duskhound), the `meat` and `food` icon names
   (`ui/primitives/Icon.jsx`) and the baked `meat` glyph (`ui/primitives/gameIcons.js`). No quest, recipe, tutorial,
   help line or i18n key names one (grep on `ddd4fe78`; the grid that cooked meat went in step 5).
3. **The loot tables lose the meat rows and gain nothing.** A replacement would be another drop with no use
   (registry `REVIEW:w2f:forge-orphan-loot`). The XP that pickups paid moves: expected XP a kill, mob XP plus each row's
   chance times its XP, falls for the pig 14.6 to 10.6, the cow 20.9 to 16.9, the zombie 30.75 to 28.65 and the
   duskhound 34.7 to 33.2. Recorded in DECISIONS.
4. **Old saves.** No build wrote hunger into a save (`buildSaveData` never had the key; `git log -S hunger` on
   `saveSchema.js` and `WorldManager.jsx`). A save that holds `hunger` under `progression` or `game_state` (hand-made or
   from a later build) is an unknown key: the store never reads it and the tombstone writes it back for one
   SAVE_VERSION. Meat joins `RETIRED_INVENTORY_KEYS`: it leaves every bag and every chest on load and rides the tombstone
   back into the same container. **Dropped, not credited:** raw meat and rotten flesh only fed a meter that has drained
   nothing since W1-B; cooked meat also healed 10, and its one source, the grid, left in step 5; the merchant and chests
   still give Health Potions (30). A credit would come back doubled on a rollback, which finds the meat as well. The
   crystals, the wand and the pickaxe set the precedent (DECISIONS items 46, 66).
5. **The e2e's fast-forward is Playwright's page clock**, installed before boot so every timer the game creates is the
   fake clock's, paused once play is live, then advanced in 120 jumps of 5 s (`page.clock.fastForward`): each timer at
   least 5 s apart fires at its real rate (the deleted hunger interval was 5 s), each faster one once a jump, and the
   frame loop draws one frame a jump. Hostiles are swept after every jump, so a mob is not the damage read. Presence
   first: mana emptied before the window is full after it (the regen interval lives in the provider that held the
   hunger interval), the day clock's units rise, frames are drawn, and a staged hit after the window lowers health.
6. **Tests that read the deleted field change, and say why:** `pause-holds-timers-gates` (84 minutes cost no health,
   and the store holds no hunger), `hud-stat-wire-gates` (`hunger` leaves the required keys), `softDeath.test.js`,
   `consumables.test.js`, `items.test.js`, `loot-characterization.test.js` (its snapshots), `inspector-truth-gates`
   (a Star Fragment stands for "a consumable"), and the keyless-caller cases in `pack-damage-gates` and
   `packThreat.test.js` (`'starvation'` becomes `'projectile'`, a live keyless caller). `tests/e2e/hunger-starvation.spec.js`
   is deleted with its subject.
7. **PR B keeps every save key.** Quest ids (`zombie_slayer`, ...) and the `kills_by_type` keys (MOB_TYPES keys:
   `zombie`) are what saves hold, so neither is renamed: the key map is the identity, frozen as literals in a test so a
   later rename must add a migration. Only text moves: a quest's title and description render from its id and
   `mobType` through `t()`, never from the strings the save carries.
8. **Text.** `src/game/questText.js` (pure): `mobNoun(t, type, count)` picks `mob.<type>.<one|other>` by
   `Intl.PluralRules` for the locale; `questTitle(t, quest)` and `questDescription(t, quest)` give a creature quest
   (one with a `mobType`) `quest.<id>.title` and `quest.defeatType` ("Defeat {count} {mob}") and any other quest its
   stored text. English mob names are generated in `i18n/strings.js` from `MOB_TYPES[type].displayName` (singular)
   and an English plural (`displayName` + "s", irregular forms listed: Ox to Oxen), so the nametag and the quest share
   one home; zh-CN names each mob by hand. Creature quests: zombie_slayer (Husk Slayer), spider_hunter, ember_hunter,
   undead_destroyer (title unchanged, "Undead Destroyer"), brute_breaker. The rest of the quest text stays English in
   zh-CN (registry row).
9. **The tracker is not restyled** (W2-D owns it): `QuestTracker` and `ui/QuestLog.jsx` swap only their text source;
   the "Quest Complete" notice names the quest by `questTitle`. The saved quest keeps English `title`/`description`;
   a rollback build keeps the title and rewrites the objective from its own list.

## PR A steps (red first; run from `frontend/`)

### A1: the gates first, red on `ddd4fe78`
- [ ] `tests/store/hungerCut.test.js`: a fresh store has no `hunger`, `setHunger`, `consumeHunger` or `feedPlayer`;
      respawn writes no `hunger`; a save planting `progression.hunger: 0`, `game_state.hunger: 0`, the five meats in
      two bags and a chest loads with no hunger in the store, health unchanged, no meat in any live bag or chest, and
      writes all of it back where it was; a save older than SAVE_VERSION drops them; the pre-cut fixture with meat
      planted keeps level 5 and deals finite damage. RED (the store still has the field; meat stays live).
- [ ] `tests/gates/retired-items-no-source-gates.test.js`: no source hands the player a retired key (loot tables,
      chest loot, quest and retired-quest rewards, the starting loadout, the Forge's offers, the merchant's stock, the
      item registry, the consumable registry), and no consumable carries `feed`; the denominator is printed and
      asserted. RED (meat in the loot tables and registries).
- [ ] `pause-holds-timers-gates`: 84 minutes cost no health and leave no `hunger` in the store. RED.

### A2: delete
- [ ] Store, context, inventory consume path, StatBar kind, showcase bar, consumables, items, loot rows, icons; add
      the five names to `RETIRED_INVENTORY_KEYS`. Update the tests in decision 6; delete `hunger-starvation.spec.js`.
- [ ] Green: the touched suites, then the full unit run in the background.
- [ ] Mutants (`scripts/dev/mutate.sh`): a meat name dropped from `RETIRED_INVENTORY_KEYS`; Raw Beef back in the
      cow's loot; a `feed` effect back on a consumable; `hunger: 100` back in the store's initial state; a 5 s
      starvation interval back in `GameSystemsProvider`; and an identity mutant (a comment edit) per suite, which
      must survive.

### A3: the e2e (`tests/e2e/the-cut.spec.js`, CI only)
- [ ] New case: install the page clock, boot, `startPlayActive`; the stat stack shows health, mana and ember (presence)
      and nothing else, no hunger key in the store, no food in the bag; pause the clock; 120 jumps of 5 s with the
      hostile sweep; health never falls, `isAlive` and the input gate hold (read beside the subject); mana refilled,
      day units risen, frames drawn; resume; a staged hit lowers health (the instrument is live); a real left click
      hurts a staged zombie; the autosave's blob holds no hunger and no meat.
- [ ] The fixture case gains the meat rule through the browser: meat planted in the fixture's bag leaves the live bag
      and is written back.

### A4: records and land
- [ ] DECISIONS 70 on (the deletion, the meat and the loot XP, the old-save rule, the e2e proof that nothing still
      promised depends on what was cut). `memory/ARCHITECTURE.md` stops listing hunger. Registry: note
      `ACTIVE_PLAN:owed:command-record-exceptions` (its hunger half is gone); rows for what is left.
- [ ] VERIFY: lint, unit (background), doc-currency, gate-shape, build, bundle-budget, knip. Commit, push, open PR A,
      read CI on its head (each shard's first attempt).

## PR B steps (branch from PR A's head)

### B1: red first
- [ ] `src/game/questText.test.js` against a module that does not exist: RED. The zombie quest reads "Defeat 10
      Husks" and "Husk Slayer"; one Husk reads "Defeat 1 Husk"; zh-CN renders each creature quest in Chinese with no
      Latin letters; every MOB_TYPES key has an English noun equal to its `displayName` and a plural; Ox reads Oxen;
      a quest with no `mobType` keeps its stored text.
- [ ] `tests/store/questKeyMap.test.js`: THE KEY MAP, as literals (each creature quest's id and mob key, exactly as a
      pre-change save holds them); a pre-change save with `zombie_slayer` at 7 of 10 and `kills_by_type.zombie` 7
      seeds the hook, reads "Defeat 10 Husks", three zombie kills complete it, and `kills_by_type.zombie` reads 10.
- [ ] The tracker in jsdom (`tests/gates/quest-text-gates.test.jsx`): the HUD tracker and the quest log show the
      Husk text in en and the Chinese in zh-CN, after a presence check. RED.

### B2: build
- [ ] `questText.js`, the i18n keys (en generated from MOB_TYPES, zh-CN by hand), QUEST_LIST's creature rows,
      `QuestTracker`, `QuestLog`, the completion notice. Green; mutants: the plural pick fixed to `other`; the English
      noun read from the type key; the tracker reading `quest.title`; a quest id renamed with no map entry; identity.

### B3: the e2e and land
- [ ] `tests/e2e/quest-text.spec.js` (CI only): load a save with Zombie Slayer active at 9 of 10; the tracker reads
      "Defeat 10 Husks"; a real left click kills a staged 1-HP zombie; the quest completes; zh-CN shows the Chinese
      line; the autosave's blob holds the quest completed and `kills_by_type.zombie` one higher.
- [ ] DECISIONS, registry, VERIFY, push, open PR B against main ("stacks on PR A; lands after it"), read CI.
