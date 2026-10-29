# W2-F step 4: Talents and relics (task script, 2026-10-29)

**Brief:** `2026-10-28-crafty-brief-w2f-the-cut.md`, "The order" item 4, "Acceptance", "One-way doors" and Task 4.
**Decision:** DECISIONS 2026-10-28 (W1-H) item 6. **Builds on:** steps 1-3 on main (tombstone pass-through and the
pre-cut fixture, one costed mode, Ember). **Branch:** `feat/w2f-talents`, cut from main `c3a0a7cb`.

## What the player gets

No attribute panel and no free spell-mastery clicks. Each level raises damage, health and mana on its own and pays one
talent point. A talent changes how an Aspect verb plays: a longer roar, a grab that holds two blocks, a wider snare, an
imbue whose zone leaps to the next hostile. Each tree ends in two capstones, and taking one shuts the other; respec
refunds everything. Hostiles sometimes drop a relic, and one relic slot in the inventory takes it: each relic changes a
verb in the same way a talent does. Crystals and the wand go, with the mana discount they bought. A save from before
the Cut keeps its level, gets every talent rank back as a point, and gets its attribute points back as talent points.

## Decisions this script makes (routine calls, stated)

1. **Damage scales with level only.** `levelAttributes(level)` (`game/progression.js`) is the player's own strength,
   agility and intellect: 10 each at level 1, then +2 strength, +1 agility and +2 intellect a level, the five points a
   level paid, placed by rule. Equipment and relics fold on top; no talent adds a stat. The solvers
   (`utils/combat.js`) and `deriveMaxStats` are unchanged, so health and mana keep their formulas.
2. **The band, stated in the table test before the change:** at level 1 every attack deals exactly what it deals
   today; at levels 5, 10 and 20 each attack's expected damage is no lower than today's unspent build (no point ever
   allocated), no higher than today's focused build (every point in the attack's stat) and within 10% of today's even
   build (five points a level shared equally among strength, agility and intellect). Measured: +1% to +8% over even
   (review round 1 corrected the first figure; DECISIONS 2026-10-29 item 41 states what the band leaves out).
3. **Spells scale with level:** a spell casts at the tier the player's level unlocked through the free click
   (`requiredLevelForUpgrade`: II at level 2 or 3, III at 5), with the same damage and mana table. `spellLevels` stops
   being written; the store's `getSpellStats` derives from `level`; `useSpellUpgrades`, `upgradeSpell` and the Spell
   Mastery section go.
4. **A level grants exactly one talent point** and no attribute points; `attributes`, `allocateAttribute` and the
   Inventory's Core attributes panel go. The Inventory keeps its combat readout (melee, crit, armour, spell power).
5. **The migration rule (once, recorded as `talents.cut` in the save's `migrated` list):** a save whose progression
   holds `attributes` (every pre-Cut save, and no post-Cut one) gets `floor(P / 5)` talent points, where P is its unspent
   attribute points plus every point allocated (each of strength, agility and intellect above 10, armour above 0), and
   every spent talent rank back as a point (the trees changed meaning, so it is a free respec). The pre-cut fixture:
   P = 14 + 3 + 1 + 2 = 20, so 4, plus its 3 unspent and 1 spent rank: 8 talent points at level 5, no ranks. One notice
   says the points are back.
6. **One-way doors, held one release by the tombstone:** `attributes` and `spellLevels` stop being written and ride
   the progression bag. `crystals` and `wand` leave the live inventory on load and ride a new `blocks` bag that
   `buildSaveData` writes back under the live blocks, for the same SAVE_VERSION rule as the other bags.
7. **Crystals and the wand go whole:** `game/crystalWallet.js`, `game/wandFocus.js` and its cast-time discount, the
   four ore-to-crystal trades and the wand trade, the counters in the trade panel, the starting 8 crystals and wand,
   the Magic Crystal recipe row and `crystals`/`wand` in `CURRENCY_KEYS`. `game/affixes.js` (no importer) goes.
8. **One vocabulary for talents and relics** (`game/verbMods.js`): `{ key, add }` per rank, folded over the base
   values. Keys: `roarSec` (14), `beastMeleeMult` (1), `grabThrows` (1), `holdSec` (8), `slamRadius` (3),
   `snareArc` (pi/8 full arc), `snareHpFrac` (0.3), `squadCap` (2), `imbueChain` (0), `zoneRadiusMult` (1). The store's
   `getVerbMods()` folds `unlockedTalents` and `equipment.relic`; every verb site reads it with `getState()`.
9. **The trees** (each root unlocks its verb and needs no prerequisite, so a level-2 player can take one):
   - Wildheart: Primal Roar (unlock); Primal Endurance, +3 s roar a rank, 3 ranks; Apex Predator, the beast's
     strikes +25%, or Untamed, +8 s roar.
   - Voidhand: Kinetic Grasp (unlock); Twin Grasp, a grab holds two blocks (the first hurl or slam keeps the second);
     Long Hold, +4 s hold a rank, 2 ranks; Singularity, slam radius +1.5 m, or Event Horizon, hold +8 s.
   - Soulbind: Soul Snare (unlock); Wide Snare, the aim cone doubles; Pack Warden, +1 squad slot; Communion, binds at
     half health, or Warden Bulwark, +1 more squad slot.
   - Elemancer: Elemental Imbue (unlock); Chain Imbue, the zone leaps to one more hostile within 8 m a rank, 2 ranks;
     Conflux, zones 50% wider, or Wildfire, the zone leaps to two more.
   Capstones need the tree's middle node. Exclusivity and respec keep their code (`canUnlockTalent`, `respecTalents`).
   A loaded rank whose node is gone, over its limit, or whose prerequisite is not held is refunded.
10. **Relics:** one slot (`equipment.relic`, through the existing equip actions), four relics, each one verb modifier:
    Ember Fang (roar +4 s), Lodestone (+1 grab throw), Snare Knot (snare cone +pi/8), Prism Shard (+1 imbue chain).
    Drops: Ember Fang from emberhusks and duskhounds, Lodestone from moss brutes, Snare Knot from spiders and
    skitterlings, Prism Shard from skeletons, each at 4-6%, `epic` rarity (the zone tier boosts it far from spawn).
11. **Ember's prices do not move:** no talent or relic touches a cost in `game/ember.js`.

## The code as it is (re-verified at lane start, main `c3a0a7cb`)

| What | Where |
|---|---|
| Attribute allocation | `store/useGameStore.jsx:216-222` (field), `:328-348` (`allocateAttribute`), `:448-469` (grantXP, +5) |
| Effective stats | `store/useGameStore.jsx:57-58` (`effectiveWith`), seven call sites; `game/progression.js:18-40` |
| Damage solvers | `utils/combat.js:1-36`; melee `Components.jsx:270-283`; spell `EnhancedMagicSystem.jsx:207-240` |
| Spell mastery | `world/spellUpgrades.js` (table, ladder, hook); `App.jsx:14`, `:163`; `ui/SpellUpgradePanel.jsx:9-17`, `:222-277` |
| Attribute UI | `ui/GamePanels.jsx:169-171`, `:207-208`, `:301-312` |
| Talents | `game/talentTree.js` (trees, fold, refund, exclusivity, respec); store `:570-636`; panel `ui/SpellUpgradePanel.jsx` |
| Verb sites | roar `Components.jsx:707-710`; grab `:771-819`; snare `:824-856`; imbue `:369-378`, `:939-947`; squad `game/soulbind.js:21`, `world/SquadAISystem.jsx:35`; zones `world/ElementZoneSystem.jsx:49-51`, `game/elemancerChannel.js` |
| Crystals and wand | `game/crystalWallet.js`, `game/wandFocus.js`, `EnhancedMagicSystem.jsx:12-13`, `:213`, `ui/TradingInterface.jsx`, `game/tradeUpdaters.js:36-47`, store `:728-732`, `data/items.js:111-127`, `data/recipes.js:134-136` |
| Save | `game/saveSchema.js:122-180` (`buildSaveData`), `:96-110` (`splitTombstone`), migrations `:52-90`; load `store/useGameStore.jsx:1068-1223` |
| Loot | `data/lootTables.js`; rolled `QuestSystem.jsx:402-414`; items `data/items.js:13-52`; slots `game/equipment.js:5-11` |

## Steps (red first; each commit runs lint and the touched unit tests)

**S1. The damage table** (`tests/game/levelDamage.test.js`, written before any change). For levels 1, 5, 10, 20 and
each hostile in `MOB_TYPES` (passive false): today's expected damage per hit for unarmed melee, Stone Sword melee
and the four spells, under the unspent, focused and even builds, recorded as literal tables computed from today's
formulas; the hits to kill each hostile. Then the new scaling through `levelAttributes` and the level tier: inside the
band (decision 2). RED: `levelAttributes` does not exist. Mutants: M1 growth 0 (below even at 20: RED); M2 strength
+5 a level (above focused melee at 5: RED); M3 the spell tier stays I (below unspent: RED); M4 the band test reads
the even build at level L-1 (identity of the table: the recorded values change, RED). Identity: a comment edit, GREEN.

**S2. Stats from level; one talent point a level** (`tests/store/levelTalents.test.js` first). grantXP across one and
three levels: `talentPoints` +1 and +3, no `attributes` in the store, maxHealth/maxMana from `levelAttributes`. The
store: `effectiveWith(level, equipment)`; delete `attributes`, `allocateAttribute`, the +5; `getSpellStats` from
`level`; the Inventory's Core attributes panel and its alloc buttons go. Mutants: M5 the level-up grants 2 points;
M6 the store keeps adding attribute points (a field reappears); M7 `getSpellStats` ignores level.

**S3. The migration** (`tests/store/preCutSave.test.js` gains the rule; `game/saveSchema.test.js` the pure part).
Fixture loads at level 5, `talentPoints` 8, no ranks, finite damage; the save writes `attributes` and `spellLevels`
back unchanged, records `talents.cut`; a second load pays nothing; a post-Cut save with ranks and no `attributes` is
not respecced; `crystals` 12 and `wand` 1 leave the live inventory and come back in the save. Mutants: M8 the rule
counts unspent points only (floor(14/5) = 2, so 6 points, not 8: RED); M9 the migration runs without the record check (second load
pays again: RED); M10 a post-Cut save is respecced (RED); M11 the blocks bag dropped on save (RED).

**S4. Deletions.** crystalWallet, wandFocus, affixes, the crystal trades, the hook, the Spell Mastery UI, their tests
and gates (`crystal-wallet-gates`, `wand-economy-gates`, `spell-mastery-*`, `spellUpgradeRestore`, `affixes.test`,
`wandFocus.test`). Rewrite `recipe-output-gates` (CURRENCY_KEYS is `coins`), `trade-fresh-prev-gates` (block trades).

**S5. The vocabulary and the trees** (`src/game/verbMods.test.js`, `src/game/talentTree.test.js` first). `foldVerbMods`
base values; each node and relic folds its key; capstone pairs exclude each other; every node has a `mod` or is an
unlock; every tree's root has no prerequisite; refund of unknown, over-limit and orphaned ranks; respec. Mutants: M12
the fold ignores rank; M13 `excludes` unread; M14 the orphan refund skipped; M15 a relic's mod not folded.

**S6. The verbs read the vocabulary.** Roar: `formDurationSec: mods.roarSec`; the form's swing x `beastMeleeMult`.
Grab: `decideVoidhand` takes `throws` and `holdSec` (a hurl or slam with a throw left keeps the block held; unit tests
in `src/game/voidhand.test.js`, mutant M16 the second throw drops the block); slam radius from `slamRadius`. Snare:
cone `snareArc`, threshold `snareHpFrac`; `squadCapFor(mods)`. Imbue: `armImbueCast(kind, chain)`, the zone request
carries `chain` and `radiusMult`; `ElementZoneSystem` spawns the chained zones at `chainTargets(origin, mobs, n, 8)`
(pure, `src/game/elementZones.test.js`; mutants M17 chain targets passive mobs, M18 chain count ignored).

**S7. Relics.** Items, loot rows, `getItemSlot` 'relic', the Inventory's Relic slot, `verbMods` folds the relic.
Tests: loot-coverage stays green with the new rows; equipping a relic from the bag raises `getVerbMods()` and
unequipping returns it (`tests/store/relicSlot.test.js`); mutant M19 the fold reads a stale slot name.

**S8. The e2e** (`tests/e2e/talents.spec.js`, CI only). A held world at noon; level 1 at 99 XP with the roar unlocked:
(1) the Inventory (E) shows no alloc button and no Core attributes; the Talents page (U) has no Spell Mastery;
(2) a real left click kills a staged 1-HP zombie: level 2, one talent point, no attribute points in the store;
(3) on the Talents page a real click on Primal Endurance's button spends it: rank 1, 0 points, `getVerbMods().roarSec`
17; (4) R held on a full bar enters the form, and the form is still on 15 s after it began (the base ends at 14) and
off by 17 s plus the longest frame plus 3 s; (5) a save written by the store's own path holds the new talent and no
`attributes`. Every release draws frames; notices are read from a DOM log.

**S9. Docs and registry.** `memory/ARCHITECTURE.md` progression lines; a DECISIONS entry (items numbered on from the
last entry); registry rows for what is left; MEASURED regenerated if doc-currency asks.

## Gates

`npm run lint`; `npm run test:unit` (background, deadline); `node scripts/ci/doc-currency.mjs`; `npm run build`;
`node scripts/ci/bundle-budget.mjs`; `node scripts/ci/registry-harvest.mjs`; mutation runs against the named specs
from `cp` backups; the e2e on CI on the PR's head sha. Every commit adding or rewriting a gate carries `Mutation-Proof:`.

## Not proven by this lane (to be restated in the PR)

The feel of the new trees and the relic drop rates (no playtest); the Talents page fitting one screen (no layout
engine here); WebKit and touch for the Talents page; the grab's second throw, the wider snare, the chain and the relic
drop in the running game (unit-proven at their reducers and pure helpers; the e2e drives the roar only); real saves
other than the fixture.
