# W2-F step 5: The Forge (task script, 2026-10-29)

**Brief:** `2026-10-28-crafty-brief-w2f-the-cut.md`, "The order" item 5, "Acceptance", "One-way doors" and Task 5.
**Decisions:** DECISIONS 2026-10-28 (W1-H) items 7 and 8; reset plan row 23. **Builds on:** steps 1-4 on main
`dadbee65` (tombstone pass-through and the pre-cut fixture, one costed mode, Ember, talents and relics).
**Branch:** `feat/w2f-forge`. DECISIONS items for this lane start at 60 (41-49 are the talents', 50-59 the media lane's).

## What the player gets

No 3x3 grid, no C key and no hidden recipe shapes. Mara the Smith runs a Forge: walk up to her and press G (on touch,
the tray's Talk button), and one card shows what she can make for you now, each line with its price in mined blocks
and coins beside what you hold. The weapon line reforges your best blade into the next one (sword, Stone Sword, Iron
Sword, Diamond Sword), and the new blade goes straight into your hand. The relic line tempers the relic you wear, so
its verb change counts twice, then three times. The goods the grid used to make and the world never generates (a
storage chest, cobblestone, glass) are on the card at the grid's own rates. A purchase you cannot pay for says what you
are short and changes nothing.

## Decisions this script makes (routine calls, stated; DECISIONS items 60-68 record them)

1. **Pure first.** `src/game/forge.js`: `forgeOffers(state)` lists the offers for a player state, `canAfford(state,
   offer)` and `shortfall(state, offer)` say what is held against the price, and `buy(state, offer)` returns the next
   state having spent exactly the shown price, or refuses and returns the same state. A stale offer (one no longer in
   `forgeOffers(state)`, such as a tier already bought) refuses too. State is `{ inventory, coins, equipment,
   relicTiers }`; prices are `{ blocks: { key: n }, coins, blade? }`, mined block keys only.
2. **The weapon line** is `['sword', 'Stone Sword', 'Iron Sword', 'Diamond Sword']`, damage 10, 12, 20, 35
   (`game/equipment.js`, unchanged). The offer reforges the best blade the player holds, in hand or in any bag, into
   the next one; the price lists that blade, and buying takes it, adds the next and equips it, so the hand's damage
   rises to a number above every blade held in hand or in a bag. Prices climb: Stone Sword 4 stone and 10 coins, Iron Sword 4 iron and 30,
   Diamond Sword 4 diamond and 80. At the Diamond Sword the line says so and offers nothing. Holding no blade, the
   offer is the sword itself (no blade taken).
3. **The pickaxe goes.** Damage 8, below the sword (10) every profile starts with, so it is a weapon stat stick the
   line already covers. Deleted from `data/items.js`, `game/equipment.js`, `EQUIPMENT_STATS`, the starting loadout,
   `render/playerRender.jsx` and the recipes. **Old saves:** `pickaxe` joins `RETIRED_INVENTORY_KEYS`, so it leaves
   every bag and chest on load and rides the tombstone back for one SAVE_VERSION; an equipped pickaxe is replaced in
   the hand by the sword, so no player's weapon damage falls (8 to 10). It is dropped, not credited: every profile
   holds one, so a credit would be a free tier for everyone. The grid kept no saved state (its escrow lived in React
   state and went back to the bag on close and on pagehide), so nothing else needs a rule.
4. **The relic line** tempers the equipped relic: `relicTiers` (relic name to tier, 1 to `RELIC_MAX_TIER` = 3) is a
   new persisted progression field, and `foldVerbMods` applies a relic's modifier once per tier. Tier II costs 3 gold
   and 40 coins, tier III 3 diamond and 100. No relic worn: the line says to equip one and offers nothing. A relic's
   tier stays with that relic when it is swapped out. Lodestone at III gives a grab three more throws, so the hurl
   pool's bound (`hurl.test.js` derives it from the trees and relics) now multiplies the relic by its top tier, and
   `MAX_FLIGHTS` rises to what it derives (10).
5. **Goods.** The grid was the only source of the storage chest and cobblestone, and the renewable one of glass; the
   hotbar gate (`tests/gates/place-executor-gates.test.jsx`, every hotbar block obtainable) would go red without one.
   The card sells them at the grid's rates and no coins: a Wooden Chest for 8 wood, 4 cobblestone for 4 stone, 4 glass
   for 4 sand. The hotbar gate's craft source becomes the Forge's goods, and it now also checks that each good's
   price is itself obtainable (closes `REVIEW:w2f:hotbar-gate-ingredient-reach`).
6. **No lantern offer.** Block id 16 is not shipped (`world/blockIds.js` ends at 15); W3-A ships it with its Forge
   price (lantern brief: 2 coal, 1 iron, 20 coins). The Forge sells nothing that does nothing. A registry row.
7. **What the grid made that nothing replaces:** armour and shields (crafted only; Golden Crown stays chest loot),
   the Health Potion recipe (the merchant and chest loot still give potions), cooked meat (step 6 deletes meat), and
   the uses of Iron Nugget, Leather, Spider Eye and Emerald as ingredients. Recorded in DECISIONS with the proof that
   nothing still promised depends on them; armour gets a registry row (does it return as a Forge line?).
8. **Talking.** G finds the nearest villager within 4 m through the ECS (`mobsQuery`, live, health above 0) instead
   of the store's 250 ms mirror, and routes by role as before, the smith now to the Forge. The routine moves to
   `src/input/talk.js` so touch reaches it: the touch tray's Craft slot becomes Talk (same position), and it yields
   control only when talking opened a panel. Touch had no way to talk to a villager before this; the tray was its
   only way to the grid. The store flag `showCrafting` becomes `showForge`.
9. **Deletions:** `ui/panels/CraftingTable.jsx`, `data/recipes.js`, `game/crafting.js`, `game/craftingGrid.js`, the
   C key (`game/keyMap.js`, `InputManager.jsx`), the HUD rail's hammer button (`ui/GameHud.jsx`), the tray's Craft
   slot, the pickaxe item, and every reader: `panelBundle`, `lazyPanels`, `GamePanels`, `MenuSystem`, `itemUi`,
   `App.jsx`'s DEV `openModal('crafting')`, `UISounds`, `TouchControls`, `panelState`, `hudState`,
   `world/placeAtHit.js` (a forge-made block's refusal now points at Mara's Forge), `game/deniedReason.js`, i18n keys
   (`ui.craft`, `a11y.crafting`, the grid's panel strings), and the gates that test the grid itself. The controls panel
   teaches G (`Talk / open chest`, no longer hidden) in place of C.
10. **Ember's spends and prices and the talents' numbers do not move.** `tests/store/ember.test.js`, the talent and
    verb-mod suites run unchanged; only the relic fold gains a tier argument whose default is 1.

## Steps (red first; run from `frontend/`)

### Step 1: the pure Forge
- [ ] `src/game/forge.test.js` first, against a `forge.js` that does not exist: RED (import fails). Cases: a fresh
      profile's offers (the Iron Sword reforging its Stone Sword, no relic offer, three goods); the line climbs and
      stops at the Diamond Sword; holding no blade offers the sword; a relic offer only with a relic worn, tier II then
      III then none; prices climb along each line; `buy` with too little refuses and returns the same state object for
      each missing part (a block, the coins, the blade); `buy` with enough spends exactly the shown price (every other
      key unchanged) and equips the new blade; a stale offer refuses; a NaN or negative count holds nothing.
- [ ] Write `forge.js` until green.
- [ ] Mutants (`scripts/dev/mutate.sh`): buy skips the coin debit; buy debits one block short; the blade not taken;
      canAfford compares with `>` instead of `>=`; the line offers the tier after next; a relic tier above the max.
      Each RED; an identity mutant (comment) SURVIVES.

### Step 2: the store, the save and the relic tier
- [ ] Red first, `tests/store/forge.test.js`: the store's `buyForgeOffer` spends through `buy`, recomputes max health
      and mana as `equipItem` does, and the melee base damage read from the store rises; `relicTiers` round-trips
      through `buildSaveData` and `loadWorldData`; `getVerbMods()` counts a tier-II Ember Fang twice; the pre-cut
      fixture loads with level 5 kept, no NaN damage, no pickaxe in any bag, its Stone Sword in hand; a save with a
      pickaxe in hand loads with the sword in hand and the pickaxe in the tombstone; a save holding no `relicTiers`
      loads with `{}`.
- [ ] Implement: `relicTiers` in the store, `buildSaveData`, `loadWorldData`; `foldVerbMods(talents, relic, tier)`;
      `pickaxe` retired; `MAX_FLIGHTS` from the derivation, `hurl.test.js` multiplying by `RELIC_MAX_TIER`.
- [ ] Mutants: the save drops `relicTiers`; the fold ignores the tier; the equipped pickaxe left in hand.

### Step 3: the card, G, touch and the deletions
- [ ] Red first, `tests/gates/forge-panel-gates.test.jsx` (jsdom, the real store): the card lists the weapon, relic
      and goods lines with each price and the held count beside it; a tap on Buy with enough spends and the hand's
      weapon changes; a tap on Buy with too little shows what is short and changes nothing; `talkToNearest` with Mara
      in range opens the Forge and with the healer heals; the tray's Talk opener reaches it.
- [ ] Build `ui/panels/ForgePanel.jsx` (the TradingInterface layout, `data-testid` on every line and button),
      `input/talk.js`, the G branch, the tray's Talk row; delete the grid and its readers (decision 9); rewrite the
      gates that name the grid: `place-executor-gates` (forge goods, the ingredient walk), `ore-drop-gates` (every
      Forge price key places), `modal-static-gates`, `m1-bugfix-gates` (the craft sound moves to a Forge purchase),
      `ui-sounds-gate`, `touchTray.test.js`, `panelState.test.js`, `keyMap.test.js`; delete `crafting-grid-escrow-gates`,
      `crafting-recipe-match-gates`, `recipe-output-gates`, `recipe-output-usable`, `recipes-gates`,
      `tests/integration/crafting-escrow` and `crafting-table` (their subject is gone).
- [ ] Mutants: the G branch routes the smith to the trade panel; the panel's Buy ignores the refusal; the tray row
      calls nothing.
- [ ] `npm run build` after the JSX change.

### Step 4: the e2e (CI arbitrates)
- [ ] `tests/e2e/forge.spec.js`, real input: from a staged spot 8 m from Mara facing her, hold W until within talk
      range (drawn frames, no wall clock), release, press G; the Forge card is up; with the coins set for the Iron
      Sword, click Buy: `equipment.weapon` becomes Iron Sword and its base damage (20) is above the Stone Sword's (12).
      Second case: with 0 coins, Buy shows the shortfall line, coins and weapon unchanged. Also: C opens nothing, and
      the game still fights and saves.

### Step 5: the record and the land
- [ ] DECISIONS 2026-10-29 items 60-68; registry: close `REVIEW:w2f:hotbar-gate-ingredient-reach`, add rows for the
      lantern offer (W3-A), armour's place, the e2e's browser mutants and whatever review leaves; ARCHITECTURE and
      CHANGELOG lines if they name the grid; `node scripts/ci/measure.mjs --write` if the size blocks move.
- [ ] VERIFY: `npm run lint`, `npm run test:unit` (background, deadline), `node scripts/ci/doc-currency.mjs`,
      `node scripts/ci/gate-shape.mjs`, `npm run build`, `node scripts/ci/bundle-budget.mjs`, `npm run knip`.
- [ ] `git fetch; git merge origin/main` (commit `Mutation-Proof: carried from the merged commits`), push, open the PR,
      wait for `ci ok` on the exact head sha. Do not merge.

## Gates this lane runs

`src/game/forge.test.js`, `tests/store/forge.test.js`, `tests/gates/forge-panel-gates.test.jsx` (new, mutation-proven),
the rewritten hotbar, ore-drop, key-map, tray and panel-state gates, `tests/store/preCutSave.test.js`, the ember and
talent suites unchanged, and `tests/e2e/forge.spec.js` on CI.

## Not proven by this lane (rows)

The feel of the prices (no playtest); the card on a real iPad (touch is driven in jsdom and by the tray's DOM, not on a
device); the e2e's browser mutants (no local browser run); whether armour returns.
