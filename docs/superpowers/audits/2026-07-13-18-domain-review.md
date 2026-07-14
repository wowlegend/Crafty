# The 18-Domain Deep Review — MEASURED coverage + executed-probe findings

> **Run** `wf_e310cbcd-7b8` (2026-07-13, resumed + completed 2026-07-14). 18 domain agents, 187 executed probes, 4.1M subagent tokens.
> **This file is the durable record.** The workflow's phase-1 agents each ENUMERATED their domain's features, MEASURED how each one is actually validated, and then DROVE the real code (vitest / node / Playwright / puppeteer) to find bugs. Raw machine-readable data: `2026-07-13-18-domain-review-raw.json`.

## 1. The measured coverage number (this REPLACES the inherited "0.5% of 185 features" estimate)

The old number was inherited from the 2026-06-28 audit, which agent-audited only 10 of 18 domains and *inventory-inferred* the rest. This one is counted, per feature, across all 18.

| How the feature is actually validated | Features | Share |
|---|---:|---:|
| Behavioral test (drives the code, would go RED on a real break) | 276 | 42.5% |
| Live probe (real browser / real worker) | 24 | 3.7% |
| **Source-grep only** — asserts text exists, not that it RUNS | 156 | 24.0% |
| Visual-diff only (6% pixel gate) | 20 | 3.1% |
| **Nothing at all** | 174 | 26.8% |
| **TOTAL enumerated features** | **650** | |

**Real validation = behavioral + live probe = 300 / 650 = 46.2%.**
The other 53.8% is either a gate that only proves the code is PRESENT, a 6%-threshold pixel diff, or nothing.

### Per-domain

| Domain | Features | Behavioral | Probe | Grep-only | Visual-only | None | Findings |
|---|---:|---:|---:|---:|---:|---:|---:|
| Boss + the Blight-Heart win state | 40 | 7 | 0 | 10 | 3 | 20 | 7 |
| UI panels — inventory, crafting, trading, qu | 40 | 16 | 1 | 4 | 3 | 16 | 8 |
| NPCs, hub, mobs, AI worker | 50 | 12 | 0 | 21 | 2 | 15 | 11 |
| Voxel editing: mine / place / block round-tr | 30 | 8 | 0 | 7 | 0 | 15 | 6 |
| Progression | 35 | 18 | 2 | 2 | 2 | 11 | 6 |
| Desktop input — verb router, pointer-look, k | 35 | 14 | 0 | 10 | 0 | 11 | 5 |
| Crafting, recipes, coins, trading economy | 29 | 15 | 1 | 3 | 0 | 10 | 6 |
| Day/night, siege, weather | 41 | 20 | 2 | 10 | 0 | 9 | 8 |
| Save / load / persistence / migration | 29 | 15 | 1 | 4 | 0 | 9 | 10 |
| Combat: melee, damage, telegraphs, hitstop,  | 40 | 20 | 1 | 11 | 0 | 8 | 7 |
| Spells / magic | 36 | 18 | 1 | 8 | 1 | 8 | 12 |
| The four Aspects | 51 | 29 | 1 | 14 | 0 | 7 | 9 |
| World: terrain, biomes, ocean, worldgen | 39 | 25 | 0 | 6 | 1 | 7 | 8 |
| Quests + achievements | 27 | 9 | 1 | 8 | 2 | 7 | 7 |
| Loot, inventory, equipment, affixes | 38 | 25 | 4 | 2 | 0 | 7 | 7 |
| Touch / mobile input | 25 | 8 | 5 | 5 | 1 | 6 | 7 |
| UI/HUD — bars, compass, minimap, ability bar | 37 | 6 | 3 | 18 | 5 | 5 | 6 |
| Audio | 28 | 11 | 1 | 13 | 0 | 3 | 5 |

## 2. Findings (135 raw, severity-ordered)

⚠️ **Every finding below is a HYPOTHESIS until refuted or confirmed.** Each carries the agent's own executed evidence — these agents RAN code, they did not grep. Independently re-derived by me before integration: hub-NPC melee kill (confirmed), free block placement (confirmed), the 4 unmatchable sword recipes (confirmed, re-computed from `RECIPES` × `normalizeGrid` — exactly 4, exactly the swords).


### CRITICAL

**Melee permanently kills all 4 hub questgivers (merchant / smith / guide / healer) -- 2.7s of holding LMB**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/systems/CombatSystem.jsx:174 (checkMobsInMeleeCone) + :22 (damageMob) + src/world/npcSpawn.js:24`
- *player impact:* A player who swings near the outpost -- or fights a mob that walks in front of Bram the Trader, since one cone swing hits BOTH -- deletes the shop/quest/heal economy for the rest of the session, with no warning, no hostility, and no way to get them back. This is a silent, permanent, trivially-reachable softlock of the entire hub.
- *why:* npcSpawn.js:24 gives hub NPCs `isMob: true` (comment: "reuse the MobModel render + mobsQuery"), so they land in mobsQuery. checkMobsInMeleeCone filters mobsQuery by isPointInCone ONLY -- no isNPC / isStatic / passive guard -- and damageMob has no guard either. The design INTENT is clearly that they are protected: allegiance.js has an explicit `UNBINDABLE = new Set(['villager'])` blocklist so the SNARE verb cannot bind them ("the deepest layer, design §4"). Melee simply never got the same guard. SpawnerSystem.jsx:100 spawns them exactly once behind a `_npcSpawned` ref, so once dead they are gone for the whole session -- no trading, no smith, no healer, no guide until a page reload.
- *executed evidence:*
  ```
  Probe P13/P14 (vitest, real ecs + real isPointInCone + real npcSpawn entity shape + real solveMeleeDamage):
    mobsQuery size = 2 | alliesQuery size = 1
    cone HITS: zombie#9002, villager#9001 (HUB QUESTGIVER Elder Rowan)
    ally in cone?  NO (excluded by query) - correct
    hub NPC in cone? YES  <-- the questgiver is a valid melee target
    Elder Rowan (200 HP) DEAD after 9 swings = 2.7s of holding LMB. health=0
  (9 swings x MELEE_COOLDOWN 300ms. CombatSystem.jsx:101 then sets dyingUntil -> the dying-sweep removes the entity.)
  ```

**The ENTIRE sword tree is uncraftable — Iron Sword and Diamond Sword do not exist in the shipped game, and weapon progression is permanently capped at the starting Stone Sword**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/data/recipes.js:9-28 (the 4 sword recipes) × /Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:27-54 (normalizeGrid) and :75 (RECIPES.find(gridsEqual))`
- *player impact:* The core action-RPG loop — kill mobs, gather iron/diamond, craft a better sword, kill harder mobs — DOES NOT EXIST. getWeaponBaseDamage: Stone Sword 12, Iron Sword 20, Diamond Sword 35. The player is locked at 12 damage forever, for the entire game, no matter how much iron or diamond they mine or how many nights they survive. Mob HP scales with the night siege; the player's weapon does not. Diamond ore, Iron Nuggets (a zombie/skeleton/moss-brute drop) and the whole ore economy feed a weapon tier that cannot be reached. Fix: delete the null padding — Diamond Sword pattern becomes [['diamond'],['diamond'],['wood']].
- *why:* normalizeGrid trims the 3x3 grid to its MINIMAL BOUNDING BOX, so a normalized grid can never contain an all-null edge column. All 4 sword patterns are written as 3x3 with columns 0 and 2 entirely null (e.g. Diamond Sword = [[null,'diamond',null],[null,'diamond',null],[null,'wood',null]]). gridsEqual first compares row LENGTH — 1 vs 3 — so the match is mathematically impossible, no matter where the player lays the pattern. Every other recipe (shields, armour, pickaxe, bow, food) happens to have content in its edge columns and matches fine, which is why this survived. The team already knew and worked AROUND it without seeing it: tests/integration/crafting-table.test.jsx:29 says "every edge row/col has content so it survives normalizeGrid's bounding-box trim (unlike the null-bordered swords)" — it picked Leather Helmet to make the one behavioral craft test pass. And tests/gates/recipes-gates.test.js:40 is titled 'no two recipes share an identical pattern (each is reachable)' but only checks pattern UNIQUENESS — it asserts reachability in its name and never tests it.
- *executed evidence:*
  ```
  PROBE A drove the real CraftingTable and clicked the real grid cells for all 26 recipes: the 4 swords are the ONLY ones whose result slot reads "Empty" (all 22 others render their item). PROBE H then enumerated every grant path in the game — the real store's starting loadout, every row of LOOT_TABLES (11 mob tables), every row of CHEST_LOOT, dawnReward() for nights 1..100, and bossSystem's drops (Crown of the Dragon King / Dragon Scale) — and printed: 'Iron Sword (dmg 20): recipe UNREACHABLE; recipe (Nuggets) UNREACHABLE -- NO OTHER SOURCE' and 'Diamond Sword (dmg 35): recipe UNREACHABLE -- NO OTHER SOURCE'.
  ```

**Resuming a save made at NIGHT silently adds a night to the siege -- and it RATCHETS across every reload (persisted)**
- *domain:* Day/night, siege, weather
- *at:* `src/world/survivalSystem.js:17-25 (the day->night branch) + src/App.jsx:176 (useSurvivalMode mounted UNCONDITIONALLY at App top level) + src/store/useGameStore.jsx:858 (loadWorldData derives isDay from gameTime)`
- *player impact:* Quit/refresh during a night siege and hit Load. The game immediately blasts the siege horn (DayNightAudio fires on the same true->false edge), banners "Night N+1 -- the siege intensifies. Hold until dawn!" for a night you already started, permanently raises the spawn cap and hostile bias, and bumps the next dawn reward a whole rarity tier. Two reloads is enough to saturate the siege at 40 concurrent mobs / 95% hostile -- the entire difficulty curve the siege was built to deliver is destroyed, permanently, by a normal save/resume. It never self-corrects because nightCount is persisted.
- *why:* useSurvivalMode is mounted at App top level with `prevIsDay = useRef(true)`, before any world is loaded. loadWorldData sets `isDay = isDayAtUnit(gameTime)` -> for a save recorded at night that is FALSE. The hook's effect sees prevIsDay=true, isDay=false, and treats the LOAD as a nightfall EDGE: it fires incrementNight(). nightCount is persisted (saveSchema.js:41), so the inflation is written straight back to disk and compounds. The autosave (App.jsx:232-249) schedules on inventory/worldBlocks/ferocityBanked changes -- exactly what happens while you fight a siege -- so a night save is the NORMAL state for anyone who plays into the night.
- *executed evidence:*
  ```
  PROBE (real store + real hook, jsdom, subscribing to every nightCount write):
    save on disk: gameTime=700, isDayAtUnit=false, nightCount=3, lastRewardedNight=2
    nightCount write log: ["0->3","3->4"]      <- the load writes 3; the HOOK then writes 4
    final nightCount    : 4
  Control (DAY save, gameTime=200): `DAY-save load -> nightCount = 3 (save said 3)` -- no increment. So it is specifically the night phase.
  RATCHET PROBE (5 successive reloads of the same night save):
    reload #1 -> nightCount 4   siege={hostileChance:0.90, maxMobs:32}
    reload #2 -> nightCount 7   siege={hostileChance:0.95, maxMobs:40}   <- CAPS SATURATED
    reload #3 -> 10 | #4 -> 13 | #5 -> 16   siege={0.95, 40}
  And the reward inflates with it: after loading a night-3 save and surviving to dawn, `dawnReward` paid for night 5: {night:5, xp:250, coins:50, lootRarity:"legendary", lootItem:"Diamond"} (coins went 0 -> 50).
  ```

**The ore -> crystal -> wand economy is UNREACHABLE: magic.crystals / magic.wand can only ever DECREASE**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/ui/TradingInterface.jsx:40 + :48 + :62-67 (deposit to blocks, spend from magic); src/store/useGameStore.jsx:589 (only writer); src/EnhancedMagicSystem.jsx:175 (reads magic.wand); src/data/recipes.js:127`
- *player impact:* The player mines and trades away 100% of their ore (64 stone + 32 coal + 32 iron + 32 gold = 32 crystals earned) and the Crystals counter on the merchant panel NEVER MOVES OFF 8. The 'Crystals to Wand' button is greyed out from turn 1 and stays greyed out forever. The wand — the game's only spell-focus / mana-discount item — is unobtainable. The mana discount is frozen at the starting -6% for the entire game. An entire advertised progression loop, plus the crafting recipe 'Magic Crystal' (output 4 crystals), produces currency that lands in a bucket nothing can spend.
- *why:* wandFocus.js's own header advertises the loop 'mine ore -> trade ore->crystals -> trade crystals->wands -> cast spells cheaper'. Every step of it is severed by a bucket mismatch. executeBlockTrade DEPOSITS crystals into inventory.blocks. executeCrystalTrade's affordability check, the Trade panel's Crystals/Wands counters, and applyWandFocus all READ inventory.magic. An exhaustive grep for every write to inventory.magic in src/ returns exactly 3 sites: the starting loadout {wand:1, crystals:8}, a Math.max(0, ... - requiredCrystals) SUBTRACTION, and equipItem/unequipItem. Nothing anywhere ever INCREASES magic.crystals or magic.wand. magic.crystals starts at 8, the wand costs 15, and it is monotonically non-increasing — so the wand can never be bought, in any playthrough, ever. Two GREEN gates pin the contradiction from both ends: inventory-flat-bucket-gates.test.js:23 pins `[magicItem]: (prev.blocks[magicItem]||0)+resultCount` (wand -> blocks) while wand-economy-gates.test.js:20 pins `applyWandFocus(baseManaCost, ...inventory?.magic?.wand)` (wand <- magic). Both pass. The feature is dead. And the behavioral test (integration/trading-interface.test.jsx:58) hides it by hand-seeding magic:{crystals:20} — a state the game cannot produce — instead of chaining the ore trade into the wand trade.
- *executed evidence:*
  ```
  LIVE PROBE — mounted the real TradingInterface in jsdom and fired real fireEvent.click on the real Trade buttons (vitest, scratchpad config):
    START                              | UI shows Crystals=  8 Wands=1 || real blocks.crystals=  0 blocks.wand=0 | stone=64
    after 4x "Stone to Crystal" (64 stone) | UI shows Crystals=  8 Wands=1 || real blocks.crystals=  4 blocks.wand=0 | stone=0
    after trading ALL ore away         | UI shows Crystals=  8 Wands=1 || real blocks.crystals= 32 blocks.wand=0 | stone=0
    "Crystals to Wand" button disabled? true  (cost 15, reads magic.crystals)
    after clicking "Crystals to Wand"  | UI shows Crystals=  8 Wands=1 || real blocks.crystals= 32 blocks.wand=0 | stone=0
    crystals earned by trading (blocks.crystals) = 32
    crystals the wand trade can SPEND (magic.crystals) = 8
    spell mana cost base 20, applyWandFocus(magic.wand) = 19
  Plus exhaustive write-path grep: `grep -rn "crystals:|wand:" src --include=*.jsx --include=*.js | grep -v .test.` -> only useGameStore.jsx:589 (init), TradingInterface.jsx:62 (SUBTRACT), recipes.js:127 (output -> addToInventory -> blocks).
  ```

**Mob AI is 100% 2D — the Y axis does not exist. Pillaring up, walling in, or going underground gives ZERO protection in a voxel building game.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/workers/ai.worker.js:124 (`const [playerX, playerY, playerZ] = playerPos;`) and :166 (`distToPlayer2D = Math.sqrt(dx*dx + dz*dz)`)`
- *player impact:* You build a tower to escape a night siege and the mobs at its base keep hitting you for full damage while you cannot see or reach them — damage arrives from an invisible source. You wall yourself into a 1x1 shelter and the zombie on the other side of the wall still kills you. You dig down to hide and the moss brute standing on the roof does 13.75 DPS through 15 blocks of stone. The core build-to-survive loop is non-functional.
- *why:* `playerY` is destructured on line 124 and NEVER referenced again — `grep -n playerY src/workers/ai.worker.js` returns exactly one hit, the destructure. There is no `dy` anywhere in the file. Every gate in the AI (AGGRO_RANGE 20, MELEE_RANGE 2.5, ARCHERY_RANGE 12, LEAP_RANGE 6) is a pure XZ distance. In a voxel game whose entire survival fantasy is 'build to survive the night', the single most fundamental defensive verb — get vertical — does nothing.
- *executed evidence:*
  ```
  Drove the REAL worker (loaded via node:vm with a `self` shim) for 150 ticks at 15Hz:
    A. player on a 30-block pillar (y=40.5), zombie at the base (y=10.5), 2u horizontal:
       -> melee hits landed in 10s: 5, total damage: 50
    B. player at y=210.5 (200 blocks up), same 2u horizontal:
       -> melee hits in 4s: 2   (proves Y is ABSENT, not a threshold)
    C. player in a cave at y=-4.5, moss_brute on the surface at y=10.5, 1u horizontal:
       -> 3 hits, 75 damage in 6s
    D. skeleton at y=10.5 fires 3 arrows at a player 30 blocks straight up
    E. zombie at y=-90 (100 blocks down a cave) AGGROS on a surface player 3u horizontal: isAggro = true
    CONTROL (proves the harness is honest): a speed-0 zombie 3.0u horizontal (outside MELEE_RANGE 2.5) landed 0 hits.
  ```

**The player can permanently kill all 4 hub NPCs (merchant, smith, healer, guide). There is no respawn path — trading, crafting, healing and quests are gone for the rest of the session.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/systems/CombatSystem.jsx:174 (`checkMobsInMeleeCone` = `mobsQuery.entities.filter(...)` — no isStatic/isNPC filter), :161 (`checkMobCollision` — same), :22 (`damageMob` — no guard)`
- *player impact:* Seven left-clicks on Bram the Trader and the shop is gone forever. This is not a griefing edge case: you spawn AT the hub (origin), the NPC anchors are 9-13 units out, and the night siege brings mobs INTO the hub — you will be swinging a 4.5u/90-degree melee cone with named NPCs standing inside it. One stray swing sequence permanently deletes trading (merchant), crafting (smith), full heal/mana (healer) or quest hints (guide) with no warning, no hostility feedback, and no way to get them back short of wiping the save.
- *why:* makeNpcEntity (src/world/npcSpawn.js:23) stamps the hub NPCs with `isMob: true` so they reuse MobModel — so they sit in `mobsQuery` and every hit-candidate query returns them. `damageMob` has no isStatic/isNPC guard, and SpawnerSystem's dying sweep (SpawnerSystem.jsx:185-187) runs BEFORE its `if (entity.isStatic) continue` cull-skip, so it happily `ecs.remove()`s the corpse. `_npcSpawned` is a one-shot useRef — SpawnerSystem.jsx:190 says so in a comment: 'no respawn path'. The intent to protect them EXISTS: allegiance.js:11 `const UNBINDABLE = new Set(['villager'])` explicitly blocklists them from soulbind. The damage path just never got the same guard.
- *executed evidence:*
  ```
  Ran against the REAL modules (src/ecs/world.js, src/world/npcSpawn.js, src/combat/cone.js, src/game/allegiance.js) with CombatSystem.jsx:174 transcribed verbatim:
    hub NPCs in mobsQuery: 4 -> Sister Wren, Old Pike the Warden, Mara the Smith, Bram the Trader
    Bram at -9 -5  hp 200  isStatic true  isNPC true  passive true
    >>> MELEE CONE RETURNS: [ 'Bram the Trader(id=0, isStatic=true)' ]
    >>> Bram dies after 7 melee swings @32 dmg (hp -24).
    >>> After the dying sweep, mobsQuery: Sister Wren, Old Pike the Warden, Mara the Smith
    >>> convertMobToAlly(villager) = null   <-- soulbind IS blocklisted (UNBINDABLE)
    >>> ...but damageMob / checkMobsInMeleeCone have NO isStatic/isNPC guard at all.
  The spell path is identical: EnhancedMagicSystem.jsx:331 calls the unfiltered `checkMobCollision` then `damageMob`.
  ```

**Spell Mastery is DEAD after loading a save: every spell casts at Level 1 while the panel says MAX RANK — and the first Upgrade click wipes your levels to disk**
- *domain:* Progression
- *at:* `src/world/spellUpgrades.js:57-66 (hydratedRef one-shot) + :103-107 (push effect); src/App.jsx:181 (useSpellUpgrades mounts at boot); src/store/useGameStore.jsx:449 (spellLevels default {}), :873/:931 (loadWorldData sets store.spellLevels)`
- *player impact:* Load your save and Fireball III does 50 damage instead of 120 (-58%) — for the whole session, in EVERY session after the one you earned it in. The panel lies to your face: 'Fireball — LEVEL 3/3 — MAX RANK'. Spell Mastery, an entire advertised progression pillar, has never once worked across a load. Then, if you open the panel and upgrade any other spell, your maxed spells silently drop to Level 1 and the next autosave writes that to disk — permanent, unrecoverable loss of earned progression.
- *why:* useSpellUpgrades() is called at App.jsx:181 inside GameApp, which mounts at page boot — BEFORE any world can be loaded (grep confirms there is no boot-time loadWorldData; the ONLY caller is WorldManager, a CHILD of GameApp, via MenuSystem:170). At boot store.spellLevels is `{}`, so the hydration branch (`if Object.keys(restored).length > 0`) does NOT fire, hydratedRef flips to true forever, and the hook pushes all-1s into the store. When the player then clicks Load World, loadWorldData overwrites store.spellLevels with the SAVED map — but the hook never re-hydrates, so store.getSpellStats (the closure the real cast reads) still reports Level 1. The panel reads store.spellLevels and shows Level 3/MAX RANK; the cast reads getSpellStats and deals Level-1 damage. Worse: the push effect at :103 fires on the next upgradeSpell and CLOBBERS store.spellLevels back to hook-local (all-1s + the one bump), which the next autosave writes to disk. The 'restore-fix' test that claims to lock this regression (tests/store/spellUpgradeRestore.test.js) renderHook()s AFTER seeding the store — an ordering production never produces — so it is green on an unreachable code path. The only other guard is a readFileSync regex gate.
- *executed evidence:*
  ```
  Probe reproducing the exact production mount order (store {} at mount, THEN loadWorldData):
    A boot        : store.spellLevels = {"fireball":1,"iceball":1,"lightning":1,"arcane":1} | hook fireball dmg = 50
    A after load  : store.spellLevels = {"fireball":3,"iceball":2,"lightning":3,"arcane":2}
    A after load  : HOOK getSpellStats("fireball").damage = 50   (save says L3 = 120)
    A after load  : HOOK getSpellStats("lightning").damage = 75  (save says L3 = 160)
    A REAL CAST base damage via store.getSpellStats = 50   <-- the exact seam EnhancedMagicSystem.jsx:200 feeds to solveSpellDamage
    A PANEL would render fireball as Level 3 /3
  THE WIPE (one Upgrade click on Iceball after the load):
    B post-load store  : {"fireball":3,"iceball":2,"lightning":3,"arcane":2}
    B store.spellLevels: {"fireball":1,"iceball":2,"lightning":1,"arcane":1}   <-- fireball/lightning were 3
    B NEXT AUTOSAVE persists: {"fireball":1,"iceball":2,"lightning":1,"arcane":1}
  CONTROL (fresh mount, i.e. the unreachable order the existing test uses):
    C fresh-mount hook fireball dmg = 120  <-- correct, and never happens in the real app
  ```

**Every "Defeat N mobs" quest completes at HALF the advertised cost — each kill counts twice**
- *domain:* Quests + achievements
- *at:* `src/QuestSystem.jsx:199 (the `quest.type === 'kill' && (type === 'kill' || type === 'kill_type')` match arm) + src/QuestSystem.jsx:317-318 (onMobKill fires updateQuestProgress('kill') AND updateQuestProgress('kill_type') for the same kill)`
- *player impact:* Every kill quest and every bounty pays out at 2x the intended rate — the core progression + XP + coin economy is inflated 2x on its main axis. The player watches the counter jump 2 per kill while the achievements panel counts 1.
- *why:* onMobKill emits TWO progress events per kill. The third match arm makes a `type:'kill'` quest match BOTH of them, so it gains +2 per mob. This governs the entire kill spine (first_blood, hunter, champion) AND the whole endless bounty ladder — the late-game retention feed. The HUD number is visibly false: the tracker and the Achievements panel disagree on the same screen.
- *executed evidence:*
  ```
  PROBE 7/D6 (real hook, real mobKillBus): 'Defeat 5 mobs' -> COMPLETED after 3 kills. 'Defeat 50 mobs' -> COMPLETED after 25 kills. Bounty 'Defeat 15 mobs' -> COMPLETED after 8 kills. PROBE 1/P3 step-by-step: kill#1 -> 2/5, kill#2 -> 4/5, kill#3 -> 5/5 completed=true. PROBE 8/S1, rendered DOM text after ONE spider kill on a fresh save: QuestTracker = "Hunter ... 2/5", Achievements panel Stats cell = "1 Kills". Both on screen, contradicting each other.
  ```

**The kill_type mobType filter is DEAD — killing any mob advances EVERY targeted-hunt quest**
- *domain:* Quests + achievements
- *at:* `src/QuestSystem.jsx:197 (`if (quest.type === type) matches = true;` — fires for a kill_type quest whenever type==='kill_type', never comparing quest.mobType to extra.mobType). Line 198, the CORRECT mobType check, is unreachable dead code: it can only set matches=true when it is already true.`
- *player impact:* Brute Breaker is authored as an elite hunt for the rare 220-HP moss brute (220 XP, the heavy-tank payoff). You never have to find one — 5 spiders clears it. Same for the emberhusk siege hunt and the skeleton/zombie hunts. A whole tier of intended content is skippable without the player ever knowing it existed.
- *why:* 5 of the 19 authored quests are mobType-targeted hunts (zombie_slayer, spider_hunter, ember_hunter, undead_destroyer, brute_breaker — ~770 XP plus the Iron Chestplate reward chain). The targeted-hunt design dimension does not exist in the shipped game: every one of them is just 'kill N of anything'. Note stats.kills_by_type records the mob type CORRECTLY, so the data layer is fine — only the quest matcher is broken.
- *executed evidence:*
  ```
  PROBE 1/P2 (one SPIDER kill, real bus): zombie_slayer(wants zombie) 1/10, ember_hunter(wants emberhusk) 1/10, brute_breaker(wants moss_brute) 1/5 — ALL advanced. stats.kills_by_type = {"spider":1} (correct). PROBE 7/D6, killing ONLY spiders: 'Defeat 5 moss brutes' -> COMPLETED after 5 spider kills. 'Defeat 25 skeletons' -> COMPLETED after 25 spider kills. 'Defeat 10 emberhusks' -> COMPLETED after 10 spider kills.
  ```

**The autosave DESTROYS the player's world on their next visit: nothing auto-resumes the save at boot, but the autosave still targets the SAME world slot**
- *domain:* Save / load / persistence / migration
- *at:* `src/App.jsx:220-261 (autosave effect, deps []) + src/store/useGameStore.jsx:967-973 (saveActiveWorld reuses getActiveWorldId()); loadWorldData is called from exactly ONE place: src/MenuSystem.jsx:170 -> the WorldManager 'Load' button`
- *player impact:* A player builds for hours, closes the tab, comes back, is dropped into an empty level-1 world, and the moment they pick up a single item their entire world/character/win is permanently gone. Total, unrecoverable, silent progress loss for every returning player. This is a ship-blocker.
- *why:* `crafty_active_world` survives a page reload, but NOTHING calls loadWorldData at boot — the store comes up at its defaults (level 1, 0 coins, empty worldBlocks). The autosave subscription mounts unconditionally with `[]` deps and no gameStarted/isWorldBuilt guard, and saveActiveWorld does `let id = getActiveWorldId()` — i.e. it writes the EMPTY fresh-boot state straight into the slot holding the player's real world. The save system is a data-destruction machine: it faithfully persists a world it never reads back, then overwrites it. It has gone unnoticed precisely because there is no resume path, so the blob is never read in normal play. Fix needs BOTH halves: (a) auto-load the active world at boot / offer a Continue, and (b) refuse to autosave a world that was never loaded (guard on gameStarted or a `hydratedFromSlot` flag).
- *executed evidence:*
  ```
  LIVE, real Chromium + real vite dev + a REAL page reload (playwright, scratchpad live-save.spec.js):
    SESSION 1 - PERSISTED blob: {"level":15,"coins":3150,"blocks":3,"won":true,"inv":{...,"Diamond":12}}
    SESSION 2 @boot - live store: level 1 coins 0 blocks 0 won false   <-- the game did NOT auto-resume
    SESSION 2 @boot - blob on disk still: level 15 coins 3150
    SESSION 2 @boot - active id: local_1783964805615 (UNCHANGED - still points at the real save)
    SESSION 2 - player picks up ONE item, 16s pass. Same slot local_1783964805615 now holds:
       {"level":1,"coins":0,"blocks":0,"won":false}
    >>> SESSION-1 WORLD RECOVERABLE? NO -- DESTROYED BY THE FRESH-BOOT AUTOSAVE
  (1 passed). Independently reproduced at unit level against the real store + real worldSaves + a verbatim copy of the App.jsx:220-261 wiring (probe3 P12/P13): 'SESSION 1 saved: level 21 coins 3150 blocks 4 gameWon true' -> reload -> 'AFTER 5 IDLE SECONDS: level 1 coins 0 blocks 0 gameWon false'.
  NOTE / honest correction: at unit level the mere App+QuestSystem mount fires the overwrite within 5s of an IDLE title screen; LIVE it does not (React effect ordering — the quest mirror effect at App.jsx:174 writes questState BEFORE the autosave effect at :220 subscribes, so boot itself is not a trigger). The destruction is therefore not instant-on-idle, but it fires on the FIRST inventory/block/level change of the new session. I verified that live.
  ```

**Your aimed spell hits the WRONG mob: checkMobCollision returns FIRST-in-ECS, not nearest**
- *domain:* Spells / magic
- *at:* `src/systems/CombatSystem.jsx:160-168 (checkMobCollision); consumed at src/EnhancedMagicSystem.jsx:331`
- *player impact:* You aim at a monster and kill a settler. In any pack you cannot focus-fire -- the spell lands on a random neighbour. Villagers are quest NPCs (role/npcName) with 120 HP; two lightning casts near your settlement wipe them out permanently. Affects all four spells.
- *why:* checkMobCollision is `mobsQuery.entities.find(e => dist < range)` -- it returns the first entity in miniplex BUCKET order whose distance is inside the projectile's fat radius (fireball 2.7u, arcane 2.6u, lightning 2.3u, iceball 2.5u), NOT the nearest and NOT the one you aimed at. Mobs in a pack routinely sit 2-3u apart, so more than one is inside the radius on the same frame. Bucket order is not insertion order (probe printed `mobsQuery order = 3,2,1` for entities added 1,2,3), so which mob eats your shot is effectively arbitrary. EnhancedMagicSystem is the ONLY caller of checkMobCollision -- this is squarely a spell bug. Coverage: the only thing 'covering' this is spell-vfx-gates.test.js regexing the source for the string.
- *executed evidence:*
  ```
  PROBE P24 (magic4.probe.test.jsx -- real EnhancedMagicSystem useFrame + real CombatSystem + real miniplex ECS, fresh world, controlled insertion order zombie->villager->cow):
    ### P24 mobsQuery order = 3,2,1
    ### P24 aimed DEAD AT the zombie. damageMob calls = [{"id":2,"dmg":162},{"id":1,"dmg":48},{"id":3,"dmg":34}]
    ### P24 zombie= 952 /1000 | VILLAGER= -42 /120 | COW= 46 /80
  Camera at (0,140,0) looking straight down -Z; the zombie is at (0,140,-10) -- dead centre of the crosshair. The 162-damage DIRECT hit landed on id=2, the VILLAGER standing 2u off-axis at (2,140,-9). The villager ended at -42/120 HP: dead.
  ```

**The joystick knob is 100% TRANSPARENT and every touch-button ink border is silently dropped -- bare var(--ui-*) against space-separated RGB-CHANNEL tokens**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControlsSurface.jsx:11-12 (and BTN() at :16-20, ring/knob at :53-58)`
- *player impact:* The primary movement control of the entire mobile build has NO visible thumbstick. The player sees a ghostly grey smudge and gets zero feedback that the stick is deflected or in which direction. The whole W4-T11 rAF-throttled knob-follow code path (TouchControls.jsx:74-81) is faithfully animating a fully transparent element. Every touch button also loses its 4px ink border, so the bold-flat design language degrades to soft translucent blobs over the terrain.
- *why:* src/theme/cssVars.js:9 emits the design tokens as space-separated RGB CHANNELS ('#0B0E14' -> '11 14 20') for Tailwind's `rgb(var(--x) / <alpha>)` convention. Every other consumer in src/ correctly wraps them (`rgb(var(--ui-ink))`). TouchControlsSurface.jsx is the ONE file that uses the bare form: `const INK = 'var(--ui-ink, #0C1322)'` and `const GOLD = 'var(--ui-accent, #C9A86A)'`. These resolve to `background: 201 168 106` and `border: 4px solid 11 14 20` -- INVALID CSS -> the declarations are DROPPED. The `#C9A86A` fallback NEVER fires, because a var() fallback only applies when the variable is UNSET, not when its value is invalid for the property. The author already hit this exact trap for the SVG glyphs and worked around it with a literal hex (comment at :13-15 blames it on 'the headless capture'), but misdiagnosed the cause and left the ring, the knob and every 4px ink border broken. No gate can see this: the source-grep gates read the string `border: 4px solid ${INK}` and pass; the pinned mobile.png baseline has the bug BAKED IN, so the pixel gate is green against a wrong baseline.
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13 (390x844), git HEAD df9a964, computed styles read from the real running app (scratchpad/touch-audit6.mjs):
    CSS vars on :root -> --ui-ink=11 14 20   --ui-accent=201 168 106      <-- channel triplets, NOT colors
    joystick KNOB  -> {"bg":"rgba(0, 0, 0, 0)", "border":"0px none rgb(0, 0, 0)", "rect":[69,628,64,64]}
    joystick RING  -> {"bg":"rgba(10, 14, 24, 0.6)", "border":"0px none rgb(0, 0, 0)", "rect":[27,586,148,148]}
    Action (Sword) -> {"bg":"rgba(10, 14, 24, 0.84)", "border":"0px none rgb(0, 0, 0)"}
    => knob background is GOLD (rgb(201,168,106))? *** NO -> rgba(0, 0, 0, 0) ***
  The knob element has full layout (64x64 at 69,628) and its transform updates correctly -- it is simply INVISIBLE. The ring survives only because its rgba(10,14,24,0.6) fill is a literal. I also LOOKED at both the pinned baseline tests/visual/baseline/mobile.png and a fresh live render: in both, the bottom-left shows only a faint translucent grey disc with no gold knob and no ink outline, while every other control has a crisp gold glyph.
  ```

**Pause hit-button is 100% DISJOINT from the Pause glyph -- and it hit-covers the Settings gear, so tapping Settings pauses the game instead**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControls.jsx:126-127 (hit: right:8) vs src/ui/TouchControlsSurface.jsx:76 (glyph: right:64)`
- *player impact:* On any touch device the Pause button is dead where it is drawn -- tapping the visible || glyph does literally nothing (the tap is swallowed as a look-zone touch). Meanwhile the Settings gear is unreachable: tapping it pauses the game. Settings is where lookSensitivity lives, so a mobile player who finds the look too fast or too slow has no way to change it, and every attempt to reach Settings kicks them to the tap-to-play screen.
- *why:* TouchControls.jsx:110 comments 'transparent hit-target geometry mirrors the visible glyphs in TouchControlsSurface.' For Pause it does not: the glyph sits at right:64 and the hit-button at right:8. They do not overlap at all (12px gap). Worse, right:8/44x44 lands exactly on top of the GameHud Settings gear (GameHud.jsx:57, `absolute top-4 right-4`, z-20) -- and the touch layer is z-40, so it wins. Feature #5 (Pause) and #21 (Settings on touch) are both in the NONE coverage bucket: no unit test, no gate, no e2e, and touch-probe.mjs never taps either. I computed the rects analytically first, then confirmed them live.
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13, git HEAD (scratchpad/touch-audit.mjs):
    pause HIT-button rect : {"x":338,"y":8,"w":44,"h":44}
    pause GLYPH rect      : {"x":280,"y":10,"w":46,"h":46}      <-- 0% overlap, 12px gap
    settings GEAR rect    : {"x":332,"y":16,"w":42,"h":42}      <-- sits INSIDE the pause hit-button
    elementFromPoint(pause glyph center 303,33)   = DIV z=40                   (the touch root, not a button)
    TAP the VISIBLE pause glyph -> active before=true after=true  *** NOTHING HAPPENED ***
    elementFromPoint(settings gear center 353,37) = BUTTON[aria-label=Pause]   (the gear is hit-covered)
    TAP the SETTINGS GEAR -> showSettings before=false after=false | active before=true after=false
    => *** SETTINGS DID NOT OPEN *** AND THE GAME GOT PAUSED INSTEAD
  ```

**The crystal/wand economy is a BLACK HOLE: the Crystals->Wand trade is mathematically unreachable, ore->crystal trades destroy ore for nothing, and a bought wand gives 0% mana discount. Two green gates lock the bug in place.**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/TradingInterface.jsx:24-75 (executeBlockTrade/executeCrystalTrade) + :93-97 (trades table) + :144,148,151 (readouts); src/EnhancedMagicSystem.jsx:175; src/store/useGameStore.jsx:589,595`
- *player impact:* A player who mines 16 stone and trades it for a crystal watches 16 stone vanish and the Crystals counter stay at 0. They can do this forever. The Crystals->Wand trade button is permanently greyed out no matter what they do. The entire merchant magic economy and the 'Magic Crystal' recipe (4x crystals) are a pure resource sink with zero output. Rated CRITICAL because it is a full advertised progression loop that cannot be completed, and the player is actively punished (ore destroyed) for engaging with it.
- *why:* `inventory` has two buckets: `blocks` (rendered/usable) and `magic` (currency). The M5 #15 'flat-bucket' fix routed EVERY purchased item into `blocks` -- including the two things that are CURRENCY read from `magic`. Result: (a) executeBlockTrade writes blocks.crystals, but the panel's Crystals readout AND the wand trade's affordability check both read magic.crystals; (b) executeCrystalTrade writes blocks.wand, but the panel readout AND applyWandFocus (the only consumer, EnhancedMagicSystem.jsx:175) both read magic.wand. Nothing anywhere in src/ ever INCREMENTS magic.crystals (grep -rn 'crystals' src/ : the only write is a decrement in TradingInterface). It starts at 8. The wand costs 15. Whole ore->crystal->wand->cheaper-spells loop -- the documented B7 feature, `wandFocus.js` header: 'This closes the loop' -- is dead. The two gates that 'cover' this are BOTH readFileSync+regex and they CONTRADICT each other: tests/gates/inventory-flat-bucket-gates.test.js:26 asserts the wand goes into `blocks`, tests/gates/wand-economy-gates.test.js:20 asserts the mana math reads `magic`. Both green. And tests/integration/trading-interface.test.jsx:57 is a REAL behavioral test that asserts the bug as correct -- it seeds `magic: { crystals: 20 }`, a state the game can never produce.
- *executed evidence:*
  ```
  PROBE 1 (vite-node, real store): FRESH GAME magic.crystals=8, blocks.crystals=undefined. After the real executeBlockTrade body for 'Stone to Crystal': blocks.stone 16->0, blocks.crystals=1, magic.crystals STILL 8. Wand-trade row: 'Have' reads 8, need 15 -> canTrade=false. After the real executeCrystalTrade body: blocks.wand=1, magic.wand still 1 -> applyWandFocus(15, magic.wand=1)=14 (the purchased wand contributed NOTHING; with it counted it would be 13). Panel prints '-6% spell mana' -- the starting wand's discount, unchanged by the purchase.
  PROBE 2 (grind simulation): seeded 1000 gold, ran the Gold->Crystal trade 500x + crafted the 'Magic Crystal' recipe 50x -> blocks.crystals = 700, magic.crystals = 8. 'Crystals to Wand' row: Have=8, Cost=15, button enabled? FALSE. PROVEN UNREACHABLE.
  PROBE 3: `npx vitest run tests/integration tests/gates/wand-economy-gates.test.js tests/gates/inventory-flat-bucket-gates.test.js ...` -> 11 files / 37 tests, ALL PASSED. The bug ships green.
  ```

**The player's HEALTH BAR is 100% invisible during normal play — the QUESTS panel is painted on top of it (mana bar 59% buried)**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `src/HUD.jsx:547 (stat stack `absolute top-16 left-4 z-20`) vs src/QuestSystem.jsx QuestTracker (`absolute top-4 left-4 z-20`, maxWidth 280); same z-index, QuestTracker is LATER in HUD.jsx DOM (line 594 > 547) so it wins the paint`
- *player impact:* You cannot see your own health. In survival/night-siege you have no idea how close you are to dying; the death screen is the first feedback. Mana is also mostly unreadable, so spell affordability is guesswork. Ship-blocker.
- *why:* This is an action-RPG whose core loop is 'build by day, SURVIVE the night siege'. The single most important survival readout — how much health you have left — cannot be seen at all. The bar is correctly WIRED and holds the correct value (my probe read text '100/100', fill bg-danger); it is simply painted underneath an opaque panel. The gate named `hud-stat-wire-gates.test.js` PASSES because it readFileSync's HUD.jsx and regexes `<PlayerHealthBar health={gameSystems.playerHealth}` — it proves the data binding, and is structurally incapable of seeing that the result is behind a panel. Data right, pixels wrong.
- *executed evidence:*
  ```
  Live puppeteer probe against the real Vite app (forcePlay -> HUD mounted), reading getBoundingClientRect() from the live DOM:
    questPanel : x 16..296, y 16..279  (280x263, the QUESTS panel)
    healthBar  : x 16..192,  y 72..92  fill=bg-danger text='100/100'  -> hiddenByQuestPanelPct = 100
    manaBar    : x 192..368, y 72..92  fill=bg-info   text='100/100'  -> hiddenByQuestPanelPct = 59.1
  Corroborated three independent ways: (a) these live rects; (b) a live screenshot (/tmp/crafty-hud-live-topleft.png) showing the QUESTS panel with ONLY the mana bar's right tail ('00') escaping past its right edge and NO health bar anywhere; (c) the PINNED BASELINE tests/visual/baseline/explore-day.png, which I opened and read — the same clipped '00' sliver is visible in the shipped baseline, meaning this has been pinned as 'correct' for some time.
  And `npx vitest run` on the 8 HUD gates: 45/45 PASSED while this is true.
  ```

**"Load World" permanently destroys the terrain — the chunk streamer can never re-request a chunk it already requested**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/src/world/Terrain.jsx:657 (requestedChunks), :592-595 (load_modifications_done handler), :683-702 (the request guard + cull)`
- *player impact:* Click "Load World" on any save and your world is GONE — an empty void with no terrain and no colliders. The player free-falls forever. Every save in the game is effectively unloadable. This is a ship-blocker: the save system's only purpose is to be loaded, and loading it deletes the world.
- *why:* `requestedChunks` is a closure-local Set that guards chunk requests: `if (!newChunks[key] && !requestedChunks.has(key)) { requestedChunks.add(key); worker.postMessage('generate') }`. On `load_modifications_done` the handler wipes the rendered world (`setChunks({})` + `chunksRef.current.clear()`) but NEVER clears `requestedChunks`. The only place keys are removed is the CULL path, which iterates `newChunks` — now empty. So the set can never drain, every chunk around the player is permanently marked 'already requested', and no chunk is ever re-generated. The worker is fine; it has the restored modifications and is waiting for requests that never come. Zero tests touch this: `grep -rl load_modifications tests src --include='*test*'` returns NOTHING, and tests/e2e/save-load.spec.js drives this exact path but only asserts coins/level/inventory.
- *executed evidence:*
  ```
  LIVE Playwright against the real booted game (2 independent runs).
  RUN 1 (PROBE-H1): `CHUNKS before load: 81` -> loadWorldData via the REAL save path (saveActiveWorld -> localStorage -> loadWorldData) -> `CHUNKS after load, 1s samples over 10s: [0,0,0,0,0,0,0,0,0,0]` -> `VERDICT: WORLD DID NOT REBUILD (81 -> 0)`. Ten seconds is ~67 ticks of the 150ms streamer loop.
  RUN 2 (PROBE-H1b, mechanism isolation): `chunks before load: 44` / `chunks after load: 2` / `worker health check: worker replied with 5536 verts` (worker is ALIVE — I asked it directly for chunk 99,99) / then teleported the player to VIRGIN chunk keys the guard has never seen -> `chunks after teleport: 32`. Already-requested keys are permanently blocked; never-seen keys load fine. That isolates the stuck `requestedChunks` Set as the cause and rules out a dead worker.
  ```

**The ocean plane renders INSIDE every inland cave and mineshaft — a fake turquoise sea 1000+ blocks from any water**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/render/Ocean.jsx:38-60 (ungated useFrame, mesh pinned at y=SEA_LEVEL, frustumCulled={false}) + src/GameScene.jsx:212 (<Ocean /> mounted unconditionally)`
- *player impact:* Every player who mines down or walks into a cave sees a fake ocean cutting through the rock. And they MUST go there: oreGen requires depth>=4 (coal), >=12 (iron), >=24 (gold), >=40 (diamond); with the spawn grade at y~49 that puts gold at y<=25 and diamond at y<=9 — the ENTIRE mid/late mining game happens below the phantom sea. Your own mineshaft appears flooded with animated turquoise water. scripts/visual/ocean-probe.mjs cannot catch this: all 4 of its cameras are at the ocean.
- *why:* Ocean.jsx is a 220x220 plane pinned at y=SEA_LEVEL (28), re-centred on the camera's XZ EVERY frame, frustumCulled={false}, with NO check that the camera is anywhere near water. It is therefore a global infinite sea at y=28 that intersects every subsurface air pocket in the world. The mesher emits no water faces (Ocean owns the surface), so nothing else can mask it.
- *executed evidence:*
  ```
  LIVE PUPPETEER CAPTURE of the real app (probeA-cave-at-sealevel.png, camera driven to world (-19, 26, -30) via __craftyTest 'enterCapture'): I can SEE a bright turquoise Gerstner wave plane slicing horizontally through the middle of a solid rock cavern, clipping through the walls. That cavern is 42 blocks from spawn. Executed radial scan (16 directions, 1-block step, real computeHeight+oceanSurfaceY): the NEAREST actual water is 102 blocks away (180deg); on +X it is 1144 blocks. Executed census of the real worker's generateChunkData over 169 chunks around spawn: 0 columns contain ANY water voxel, yet 6,828 / 43,264 columns (15.8%) have AIR at exactly y=28. Control frame probeC (same spot, camera above ground) is clean — no plane, no tint — so the artifact is strictly below y=28.
  ```


### HIGH

**Spatial audio is DEAD until the first hostile mob spawns — footsteps, jump, swing and hit are SILENT at game start**
- *domain:* Audio
- *at:* `src/SoundManager.jsx:558 (`audioContext: audioContext.current` in the context `value`) + src/render/SpatialAudioController.jsx:75 (`if (!camera || !audioContext) return;`)`
- *player impact:* From world-load until the first hostile spawns, the player walks, jumps and swings in SILENCE, and there is no 3D positioning, no distance falloff, no cavern reverb, no raycast occlusion and no underground muffle. Mining still makes noise (flat/mono), so it reads as "the game's audio is half-broken for the first few seconds, then suddenly snaps on." DAY_HOSTILE_CHANCE=0.7 and the spawner drops 20 mobs once the spawn chunk loads, so the window normally closes within a second or two of chunk-load — but it is genuinely reachable, because the player can pointer-lock and start moving while chunks are still streaming. Severity is HIGH primarily for the latent fragility: one innocuous refactor silently kills all spatial audio forever.
- *why:* SoundProvider publishes `audioContext: audioContext.current` — a REF read during RENDER — but the ctx is created in a useEffect that sets no state. React runs child effects BEFORE parent effects, so on mount SpatialAudioController sees `audioContext === null`, early-returns, and NEVER calls `useGameStore.setState({ playSpatialSound })`. `App()` (App.jsx:54-60) has zero state and zero store subscriptions, so SoundProvider re-renders ONLY on its own subs: activeHostilesCount / bossActive / sfxVolume / masterMuted / soundEnabled / musicEnabled / volume. None change at startup — and MinimapSyncSystem writing `activeHostilesCount: 0` over 0 every 250ms does NOT re-render (zustand Object.is). So the ctx stays null until the first HOSTILE actually spawns. Every DIRECT `store.playSpatialSound?.(...)` call site has NO fallback and becomes a silent no-op: footstep (Components.jsx:1204,1209), jump (:1052), swing (:911,:1033), hit (:295, CombatSystem.jsx:65), attack/aggroGrowl (AIWorkerSystem.jsx:58,82), roar/grab/hurl/slam/bind + all 4 Aspect motifs (Components.jsx:581-754), anvilHit (HurlSystem.jsx:96), element-zone SFX (ElementZoneSystem.jsx:52,56). Block place/break survive only because useGameSounds has an `else playSound(...)` flat fallback. THE DEEPER PROBLEM: spatial audio is alive ONLY by accident of SoundProvider's `activeHostilesCount` subscription — which exists to drive the arpeggiator BPM, and the arpeggiator is DEAD CODE (PROC_MUSIC_GAIN=0, finding #3). Delete that now-pointless subscription — an obviously correct-looking cleanup — and ALL spatial audio dies permanently and silently, with every gate still green.
- *executed evidence:*
  ```
  Mounted the REAL SoundProvider in jsdom with an instrumented fake AudioContext, plus a child replicating SpatialAudioController's exact gate. Printed:
    t=0   playSpatialSound: undefined | regs: 0
    after 20 minimap ticks (hostiles still 0):
       playSpatialSound: undefined | regs: 0
       footstep/jump/swing/hit fired -> 0 sounds actually played  <-- 0 means SILENT
    after first HOSTILE spawns:
       playSpatialSound: function | regs: 1
       footstep fired -> 1 sounds played (cumulative)  <-- now it works
  And separately: `[MOUNT] api.audioContext = NULL` / `[MOUNT] store.playSpatialSound = undefined`, then `[HOSTILE] api.audioContext = ctx` / `= function`. Contrast: the storm bed reads the SAME ctx via `getAudioBridge()` LAZILY at call time (WeatherSystem.jsx:74) and is therefore correct — proving the bug is the render-captured ref, not the ctx itself.
  ```

**The domain's ONLY live probe is vacuous — `playSpatialSound?.()` cannot fail, so it reports playable=true even when spatial audio does not exist**
- *domain:* Audio
- *at:* `scripts/visual/esc-pause-probe.mjs:42`
- *player impact:* None directly — this is the reason finding #1 shipped and would survive any future regression. Fix: assert `typeof playSpatialSound === 'function'` BEFORE calling, and drop the `?.`.
- *why:* The probe is: `try { w.useGameStore.getState().playSpatialSound?.('hit', w.__threeCamera.position, 1, 20); return true; } catch (e) { return 'throw:' + e.message; }`. The optional chaining is the whole bug: when `playSpatialSound` is `undefined` (exactly the state in finding #1) the expression short-circuits to `undefined`, nothing throws, and the probe returns `true` -> logs `[esc-probe] spatial-sfx playable=true`. It literally cannot distinguish "spatial audio works" from "spatial audio was never registered." It is doubly blind: it also runs after `waitForFunction(isSpawnChunkLoaded)` + `delay(5000)` + up to 8 pointer-lock retries, by which point hostiles have spawned and finding #1 has already self-healed. The companion gate (tests/gates/spatial-sfx-bus-gates.test.js) is 100% readFileSync+regex and asserts `filter.connect(busInput)` EXISTS IN THE SOURCE — which it does, inside an effect that never runs on mount. Green gate, green probe, dead feature: this is the project's stated failure mode, reproduced exactly, on the one bug in this domain.
- *executed evidence:*
  ```
  Read the probe source (esc-pause-probe.mjs:37-46) and confirmed the `?.` short-circuit. Confirmed by my own probe that `useGameStore.getState().playSpatialSound` is `undefined` at mount and that calling `st.playSpatialSound?.('footstep', ...)` produced `0 sounds actually played` while throwing nothing — i.e. the exact input on which this probe returns `true`. Also verified `grep -rln 'audio|Sound|music' tests/e2e/` -> NONE (0 of 11 e2e specs touch audio) and that all 15 tests/gates/*audio* files call readFileSync.
  ```

**A page reload mid-fight resets the 700-HP climax boss to full health and re-aggros it**
- *domain:* Boss + the Blight-Heart win state
- *at:* `src/world/bossSystem.js:11-18 (useState/useRef) + src/game/saveSchema.js:55 (only gameWon is serialized)`
- *player impact:* The Shadow Dragon is a 700-HP, 3-phase fight at the far edge of the world (the lair is at (725,725), 1025 blocks from spawn - blightHeartSite() executed). A refresh, tab crash, laptop sleep, or Vercel redeploy mid-fight throws away the entire fight. The player must win in a single unbroken sitting. Combined with the no-leash bug below, they also cannot safely disengage to save.
- *why:* bossHealth, bossPhase, bossDefeated and bossSpawned are React useState/useRef LOCAL TO THE HOOK. None of them is in the zustand store, and saveSchema.js serializes exactly one boss field: gameWon. So the fight has no durable state. Everything else in the game persists across a reload; the climax does not.
- *executed evidence:*
  ```
  P11: fought the boss to 10/700 HP (phase 2), unmounted the hook and remounted it (what a page refresh does), walked back to the lair. Printed: 'before reload: hp=10 phase=2' -> 'AFTER reload: bossActive=true hp=700 phase=0 gameWon=false'.
  ```

**The boss never de-aggros, never de-spawns, never leashes - boss music, boss health bar and the obsidian danger grade lock ON forever**
- *domain:* Boss + the Blight-Heart win state
- *at:* `src/world/bossSystem.js:89 (the ONLY setBossActive(false) in the domain) + src/GameScene.jsx:249 (BossEntity mounted unconditionally) + src/render/BossEntity.jsx:169-247`
- *player impact:* Aggro the dragon once and you can never end the encounter except by killing it. Boss battle music plays forever, the boss health bar stays pinned to the HUD forever, and the world stays drenched in the obsidian red danger grade forever. The dragon then flies the full 1025 blocks home behind you and - in phases 2 and 3 - calls destroyVoxelsInRadius (BossEntity.jsx:316, 339) and spawns skeleton pairs (BossEntity.jsx:350-351) at your base, permanently. The only escape is a reload, which then resets the boss to 700 HP (finding 1).
- *why:* grep proves setBossActive(false) occurs exactly once in the whole domain - inside the kill block. There is no leash, no max-distance check, no despawn. BossEntity is mounted with no conditional, and its useFrame chases camera.position at phase.speed (4.0 -> 7.0 u/s) forever. SoundManager gates the boss battle music on state.bossActive (SoundManager.jsx:42/161/208/391) and the dangerLevel=2 obsidian colour grade is bridged off the same flag (bossSystem.js:143).
- *executed evidence:*
  ```
  P9: spawned the boss at the lair, hit it once, then teleported the player back to spawn (0,0) - 1025 blocks away - and advanced 5s of timers. Printed: 'after fleeing 1000 blocks: bossActive=TRUE hp=600 dangerLevel=2'. Structural grep confirms no leash/despawn/maxDist token exists in bossSystem.js or BossEntity.jsx.
  ```

**The kill block runs 11 side effects inside a React setState updater, with the idempotency latch set FIRST and the win latch LAST - one throw voids the win irrecoverably**
- *domain:* Boss + the Blight-Heart win state
- *at:* `src/world/bossSystem.js:84-110 (side effects inside setBossHealth(prev => ...); bossKilledRef set at :88, markGameWon() at :107)`
- *player impact:* If it fires: the player kills the final boss and the game does not record the win. The dragon is dead (0 HP) but still 'active', so boss music and the red danger grade never stop, no Crown of the Dragon King drops, and gameWon is never persisted - so on the next reload the dragon respawns at full health and must be killed again. This is the game's single win condition; it is the highest-stakes instance of backlog task #13 (closure-mutation inside setState updaters).
- *why:* React requires setState updater functions to be PURE. This one performs, in order: bossKilledRef.current = true (:88), setBossActive(false), setBossDefeated(true), setBossNotification(), scheduleNotifClear(), GameMethods.grantXP(), addToInventory() x2 (:99-100), useGameStore.setState({hitstopUntil}), triggerBloomSpike(), and FINALLY markGameWon() (:107). The ordering is maximally unsafe: the latch that makes the block run-once is set BEFORE the effects, and the flag that records the win is the LAST statement. If anything in between throws - or if React discards a concurrent render - the retry sees the latch already true, skips the whole block, and the win is gone with no way to re-earn it.
- *executed evidence:*
  ```
  P12: injected a throw into addToInventory (called at bossSystem.js:99, mid-block). React logged 'error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root'. Final state printed: gameWon=FALSE, bossHealth=0, bossActive=TRUE *and* bossDefeated=TRUE simultaneously (self-contradictory), dangerLevel=2 stuck, zero loot, XP granted (it ran before the throw). A follow-up damageBoss(50) could NOT recover it: 'after a RECOVERY hit: gameWon = false, inventory = {grass:32}'. HONESTY: I proved the FRAGILITY and the unrecoverable end-state. I did NOT prove a production trigger - I had to inject the throw. Treat the trigger as a hypothesis; the structural defect is confirmed.
  ```

**A pack of N enemies deals the damage of ONE: the 500ms global lockout caps ALL incoming damage at 2 hits/sec**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/store/useGameStore.jsx:747 (`if (now - state.lastDamageTime < 500) return;`)`
- *player impact:* A horde of 20 mobs is exactly as dangerous as 1 mob. Crowd control, positioning, and kiting have no mechanical value; there is no such thing as being overwhelmed. Combat difficulty is capped at 2 hits/second no matter what the game throws at you.
- *why:* The guard is deliberate and tested (soft-death-protections.spec.js:41 calls it "the cooldown") -- a Minecraft-style invulnerability window. But it is GLOBAL across every source, so it is also a hard cap on crowd threat that nothing tests. AIWorkerSystem.jsx:35 loops `for (const attack of attacks) store.damagePlayer(...)`: 5 zombies striking on the same 15Hz tick land ONE hit. This is the mechanical root cause of open task #19 ("Incoming-hit hitstop + boss-entrance beat -- enemies must feel dangerous").
- *executed evidence:*
  ```
  Probe P1/P3/P4 (vitest, REAL useGameStore):
    5 x damagePlayer(10) => playerHealth = 90   (would be 50 if all land)
    3 simultaneous strikes: hits that LANDED = 1 /3 ; hp = 90
    hp after each of 10 hits @100ms apart: 90,90,90,90,90,80,80,80,80,80   <-- 10 hits, 2 landed
  ```

**Camera shake decays PER FRAME, not per second -- identical crit shakes for 1067ms @30fps vs 267ms @120fps**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/Components.jsx:1236 (`store.triggerCameraShake(trauma * 0.85); // Decay`)`
- *player impact:* The single most-felt piece of combat juice is 4x weaker on the device the project explicitly supports (120Hz iPad) and 2x too long / nauseating on a 30fps laptop. Same crit, different game. It also means shake duration silently changes whenever framerate dips mid-fight -- the shake gets LONGER exactly when the game is already struggling.
- *why:* The decay multiplier 0.85 is applied once per rendered frame and never touches `delta`. Every other juice channel in this domain IS delta-correct (cameraKick's stepKick uses `Math.exp(-decay * delta)`), and trauma.js EXPORTS a delta-correct `decayTrauma(trauma, dt, rate)` -- fully unit-tested in trauma.test.js -- which is DEAD: grep of src/ shows `decayTrauma` and `addTrauma` have zero consumers outside their own test. The correct function was written, tested, and then not wired. The codebase elsewhere explicitly cares about this exact hazard (AIWorkerSystem.jsx:155 "120Hz ProMotion iPads no longer pay double"), and iPad is a shipped target.
- *executed evidence:*
  ```
  Probe P7/P8 (vitest, replaying the REAL Components.jsx:1221-1239 loop against the REAL store + REAL shakeOffset):
    30fps: shake lasted 32 frames = 1067 ms   (peak offset 0.956)
    60fps: shake lasted 32 frames = 533 ms   (peak offset 0.956)
    120fps: shake lasted 32 frames = 267 ms   (peak offset 0.956)
  vs the UNUSED decayTrauma(rate=1.5):
    30fps: 667 ms | 60fps: 667 ms | 120fps: 667 ms   <-- FRAMERATE-INDEPENDENT
  ```

**The crystal/wand economy is severed at the bucket boundary — crystals you buy or craft are unusable, and the wand trade can never be afforded**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TradingInterface.jsx:47-75 (executeCrystalTrade spends prev.magic.crystals, banks the item into prev.blocks) vs :35-42 (executeBlockTrade banks bought crystals into prev.blocks) vs /Users/kz/Code/Crafty/frontend/src/EnhancedMagicSystem.jsx:175 (reads inventory.magic.wand)`
- *player impact:* The merchant is a money pit. The player mines 160 stone, trades it, watches the 'Crystals' number on the merchant panel stay frozen at 8, and can never buy the wand — the panel just says 'Have: 8' next to a greyed-out button forever. The one advertised payoff of the whole ore->crystals->wand ladder (a live '-X% spell mana' figure the panel proudly renders at :151) is unreachable. And in the one case they DO reach it (a save with 15+ magic.crystals), the purchased wand does literally nothing: spells still cost full mana.
- *why:* Every EARN path writes to inventory.blocks.crystals (the M5 #15 'flat bucket' fix routed bought/crafted items there so the Inventory panel renders them) — the 4 ore->crystal trades AND the Magic Crystal recipe. Every SPEND path reads inventory.magic.crystals — the affordability check (:49), the subtract (:62) and the merchant's own Crystals readout (:144). NOTHING in the entire codebase ever increments magic.crystals (grep: it appears only in the starting loadout at useGameStore.jsx:589, and in the two TradingInterface lines that READ/DECREMENT it). The player starts with 8 and the wand costs 15, so the wand trade is permanently disabled. The same split hits the wand itself: the purchase banks it in blocks.wand, while EnhancedMagicSystem:175 charges mana off magic.wand. Two GREEN source-grep gates each assert one half of this bug and neither notices they contradict: tests/gates/inventory-flat-bucket-gates.test.js regexes that the bought item lands in `prev.blocks[magicItem]`, while tests/gates/wand-economy-gates.test.js regexes that the mana cost is computed from `inventory?.magic?.wand`. Both pass. The economy is broken.
- *executed evidence:*
  ```
  PROBE B clicked the REAL 'Stone to Crystal' Trade button 10 times in the rendered TradingInterface: 'magic.crystals = 8' (unchanged), 'blocks.crystals = 10', 'Crystals to Wand button disabled? -> true', 'Crystals shown in the merchant HUD -> 8'. 160 stone spent, zero progress toward the wand, and the merchant's own crystal counter never moved. PROBE C then pre-seeded 30 magic.crystals, clicked the real 'Crystals to Wand' button, and applied the REAL applyWandFocus() exactly as EnhancedMagicSystem:175 does: 'magic.wand = 0, blocks.wand = 1, spell mana cost before buy = 20, after buy = 20'.
  ```

**Placing a block is FREE (no inventory cost) while mining grants +1 — infinite diamonds, infinite everything, in seconds**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/world/Terrain.jsx:819-848 (place() — zero removeFromInventory calls, zero inventory check) vs :581-591 (worker 'block_broken' -> store.addToInventory(blockForId(id), 1))`
- *player impact:* The entire gathering / crafting / trading economy is a formality. ~30 seconds of place-mine gives a full Diamond armour set; a few minutes gives unlimited stone to feed the ore->crystal trades. This directly nullifies the deliberate design intent recorded at useGameStore.jsx:575-580 ('a HUMBLE frontier start so the loot/craft loop matters... Iron/Diamond gear is CRAFTED or LOOTED; diamond/gold ore is MINED'). Note this is the exact opposite failure from the sword bug: the gear the player is SUPPOSED to grind for is free, and the gear they're supposed to be able to craft is impossible.
- *why:* place() reads store.selectedBlock, resolves it through idForBlock(), posts the voxel to the worker, and returns. It never checks that the player HAS the block and never decrements it. mine() posts a delete and the worker's block_broken message hands the player +1 of whatever was there. `grep -c removeFromInventory src/world/Terrain.jsx` = 0 (its only two callsites in all of src are GamePanels.jsx:199, consuming a potion, and CraftingTable.jsx:87, staging a craft material). HOTBAR_BLOCKS (src/world/Blocks.js:23) includes 'diamond'. So the player selects diamond in the hotbar — with zero diamonds — right-clicks the ground, left-clicks the block they just made, and is +1 diamond.
- *executed evidence:*
  ```
  PROBE F replayed the two real lines (idForBlock at Terrain.jsx:826, addToInventory(blockForId(...)) at Terrain.jsx:590) against the real store and the real blockIds table, starting from an EMPTY inventory: 'after 10 place->mine cycles per hotbar block: {grass:10, dirt:10, stone:10, wood:20, glass:10, diamond:10, sand:10, cobblestone:10} — net cost to the player: 0 of anything.' It then fed 8 free diamonds into the REAL CraftingTable, clicked the real cells, and the result slot read '1x Diamond Chestplate' — crafted, inventory {diamond:0, Diamond Chestplate:1}. (Honest scope note: the '+1 on mine' half is EXECUTED; the 'place costs nothing' half is established by exhaustive callsite grep — 0 removeFromInventory in Terrain.jsx — because driving Rapier's raycast headlessly was out of reach.)
  ```

**Stars and a moon disc render in the sky at MIDDAY during every storm (~half of all daytime)**
- *domain:* Day/night, siege, weather
- *at:* `src/render/nightSky.js:12-16 (starIntensity) + src/game/weatherGate.js:11 (STORM_MOOD_BOOST = 0.85) + src/render/mood.js:91-94 (moodTarget MAXes weatherBoost in) + src/render/Atmosphere.jsx:182 (`u.uStar.value = starIntensity(moodRef.current)`) + Atmosphere.jsx:110 (shader `if (uStar > 0.001)` draws the star field + the moon disc)`
- *player impact:* WeatherSystem.jsx:99 toggles clear<->storm every 90 seconds, unconditionally -- so roughly HALF of all daytime is a storm. During each one the player sees a night-blue sky filled with stars and a bright moon disc, while the Sun billboard (Sun.jsx, always rendered) is still hanging in the same sky. It reads as a rendering glitch, not as weather. This is the single most-seen frame in the game after the ground.
- *why:* nightSky.js's own doc states the star/moon layer must READ ONLY on the everyday-night sky and "never on the bright-blue day sky (mood 0)". It gates on `mood`, assuming mood is driven only by isDay + dangerLevel. W4 then added `weatherBoost` into moodTarget (weatherGate STORM_MOOD_BOOST = 0.85, deliberately chosen as 'less than obsidian(2)' so a daytime storm reads overcast). Nobody re-checked starIntensity -- and its triangle peaks at 1.0 at mood 1, so mood 0.85 yields uStar 0.85. The two modules drifted exactly like the diamond/stone id maps.
- *executed evidence:*
  ```
  PROBE (real moodTarget + real starIntensity + real sampleMood):
    scenario           mood   uStar(stars+moon)  skyTop     fogDensity
    clear DAY          0.00     0.000            #1a5ad0    0.0025
    STORM at midday    0.85     0.850            #172b65    0.0106   <-- 85% stars + 85% moon disc, in BROAD DAYLIGHT
    clear NIGHT        1.00     1.000            #161b3a    0.0120
    BOSS day           2.00     0.000            #0a0c14    0.0200
  The midday-storm sky (#172b65) is essentially the night sky (#161b3a). Cross-check against the pinned baselines: tests/visual/baseline/explore-day.png has NO stars (uStar=0 confirmed) and explore-night.png HAS the big white moon disc + a starfield -- so uStar>0 demonstrably draws exactly that, and a daytime storm sets uStar to 0.85.
  I could NOT screenshot the live storm: the app does not currently boot (src/ui/GameHud.jsx:20 `Unexpected token, expected ","` from another agent's in-flight edit -> vite 500). The mood/uStar values above are EXECUTED; the shader branch that consumes them is a one-line read.
  ```

**The HUD day-phase dial is 90 degrees out of phase: the sun sits BELOW the horizon all morning and hits zenith exactly at nightfall**
- *domain:* Day/night, siege, weather
- *at:* `src/HUD.jsx:80-81 and :102 (`rotate(${p.angleDeg - 180}deg)`) + src/game/dayPhase.js:26-30 (cycleFraction doc: "0=midnight, 0.25=dawn, 0.5=noon") -- but the real clock's gameTime 0 is the START OF DAY (dayNight.isDayAtUnit: day = [0,600))`
- *player impact:* Boot a brand-new world: it is broad daylight, and the HUD dial shows the SUN sitting at the BOTTOM of the ring, below the drawn horizon line. At the actual midpoint of the day the sun is on the horizon. The sun reaches its zenith at the exact instant night falls, and the moon spends the second half of the night below the ground. The dial answers "how much day is left?" a quarter-cycle wrong, in the direction that makes you think you have more day than you do.
- *why:* The dial's stated design (HUD.jsx:64-66 + the drawn horizon line at :100) is "noon at top, sunrise left, sunset right, midnight bottom ... above = sky, below = ground -> the orbit reads as a sky arc". cycleFraction assumes gameTime 0 = midnight. It isn't -- gameTime 0 is dawn. The display offset should be -90deg, not -180deg. The dial is the ONLY always-on readout of "how much day is left", i.e. the actionable half of the onboarding promise "build by day, survive the night".
- *executed evidence:*
  ```
  PROBE (real dayPhase() + real isDayAtUnit(), replicating the component's exact `rotate(angleDeg - 180)`):
    gameTime | store isDay | icon | dial rotate | marker position
        0    |   DAY       | sun  |  -180deg    | BOTTOM (nadir, BELOW the horizon line)
      150    |   DAY       | sun  |  -135deg    | lower-left (BELOW horizon)
      300    |   DAY       | sun  |   -90deg    | LEFT  (the comment's "sunrise")
      599    |   DAY       | sun  |    -0deg    | TOP   ("noon") -- one second before night falls
      600    |   NIGHT     | moon |     0deg    | TOP   ("noon") -- night has JUST begun
      900    |   NIGHT     | moon |   +90deg    | RIGHT ("sunset")
     1199    |   NIGHT     | moon |  +180deg    | BOTTOM (below horizon) -- at dawn
  WHY IT WAS NEVER CAUGHT: scripts/visual/dayphase-probe.mjs:64 pins "day-noon" via `setTimeOfDay(0.5)` -> gameTime 600, isDay=true -> sun at TOP -> looks perfect. But gameTime 600 IS the nightfall boundary in the real clock (Finding #6). The probe validated a state the real game can never be in.
  ```

**Alt-tab leaves movement keys STUCK ON — the player runs by themselves on return. No blur/focus reset exists anywhere.**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate
- *at:* `src/Components.jsx:387-412 (handleKeyUp) + src/Components.jsx:501-511 (listener set) — no 'blur'/'visibilitychange' listener anywhere in src/`
- *player impact:* Alt-tab / Cmd-Tab to Discord or a wiki mid-session — the single most common thing a PC player does — while holding W. Come back, click to re-lock, and the character immediately sprints forward (and strafes right) with NO key pressed: off a ledge, into lava, into a mob pack. It only stops when the player taps and RELEASES W and D, which is unintuitive because they aren't holding anything. Affects every movement key, jump, and all four Aspect verbs.
- *why:* When the window loses focus the browser NEVER delivers the keyup, so moveF/moveR stay true forever. `grep -rn "'blur'|visibilitychange|resetInput" src/` proves the only resetInput() call site in the entire app is Components.jsx:211 (on player DEATH). App.jsx's visibilitychange listener only flushes autosave — it does not touch input. On re-lock, the useFrame reader does `isLocked && input.moveF` and walks.
- *executed evidence:*
  ```
  Playwright drove the REAL booted app (localhost:4179) and fired REAL keys, reading the LIVE inputState singleton via a dynamic `import('/src/input/inputState.js')` (same Vite module instance Components.jsx writes to; identity proven because real keydowns flip its intents).
    holding W+D, in play                          {"active":true,"moveF":true,"moveR":true}
    after alt-tab AWAY and BACK (no keys held)    {"moveF":true,"moveR":true}
  Separate probe firing the events explicitly:
    W held                                        {"active":true,"moveF":true}
    after window blur + visibilitychange fired    {"active":true,"moveF":true}
  REPRODUCED BYTE-IDENTICALLY ACROSS TWO FULL RUNS.
  ```

**Zone-tier loot rarity bonus is DEAD: killTier is always 0 because onMobKill reads .x/.z off an ARRAY**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/QuestSystem.jsx:325  `const killTier = zoneTier(position?.x ?? 0, position?.z ?? 0);`  vs  src/systems/CombatSystem.jsx:141  `emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z], source)``
- *player impact:* Walking 2000 blocks into the dangerous high-tier frontier — the core risk/reward premise of the Ember Frontier loop — yields EXACTLY the same loot as farming mobs at the spawn point. The moss_brute's Diamond stays at 6% instead of doubling to 12%; its Iron Nugget stays at 70% instead of becoming guaranteed. The player takes all of the added danger and receives none of the promised reward. Shrine chests DO scale (that path indexes the array correctly), so the inconsistency is also visible in-game: chests get better far out, mob drops never do.
- *why:* mobKillBus.js's own doc says the callback receives `(mobType, position[], source)` — an ARRAY — and CombatSystem.jsx:141 confirms it passes a plain [x,y,z]. An array has no `.x` / `.z`, so `position?.x ?? 0` evaluates to 0 EVERY time and zoneTier(0,0) returns tier 0 unconditionally. tierLootChance(base, rarity, 0) is the identity function, so the entire S7 'far from spawn = rarer drops' reward mechanic is a no-op. Six lines below (QuestSystem.jsx:331) the SAME `position` is correctly indexed as an array by spawnLootDrop (pos[0], pos[1], pos[2]) — the two accesses in one function have drifted apart. The chest path at QuestSystem.jsx:806 uses the correct `zoneTier(chest.position[0], chest.position[2])`, which proves array-indexing is the intended contract and this is a bug, not a design. lootTier.js has a full GREEN behavioral unit suite (tests/game/lootTier.test.js, 10 assertions) that tests the pure function and never touches the caller — textbook 'the math is right, the wiring is dead'.
- *executed evidence:*
  ```
  EXECUTED probe replaying the exact production expression against the exact emitMobKill payload:
    $ node --input-type=module -e "import {zoneTier} ..."
    payload sent by emitMobKill: [1400,12,1400]
    QuestSystem killTier  (position?.x / position?.z) = 0
    CORRECT tier          (position[0] / position[2]) = 4
    --- moss_brute Diamond drop chance at the FAR frontier ---
      Iron Nugget  rarity=epic      base=0.7   ACTUAL=0.7   INTENDED=1
      Emerald      rarity=epic      base=0.35  ACTUAL=0.35  INTENDED=0.7
      Diamond      rarity=legendary base=0.06  ACTUAL=0.06  INTENDED=0.12
  ```

**inventory.tools is read by NOTHING — the starting sword / pickaxe / shovel / axe are invisible and unusable**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/store/useGameStore.jsx:588  `tools: { pickaxe: 1, shovel: 1, axe: 1, sword: 1 }``
- *player impact:* Four items the player is told they own but can never see, select, or equip. The `sword` is a real weapon (slot 'weapon', +2 STR / +1 AGI, 10 base damage) and the `pickaxe` is a real weapon too (8 base damage) — both permanently locked away. The player's only usable starting weapon is the Stone Sword (which is in blocks). Perversely, CRAFTING a pickaxe works, because doCraft routes through addToInventory -> blocks, so the crafted copy is visible while the one you started with is not.
- *why:* The starting loadout puts 4 items in inventory.tools. A grep for every reader of `tools` across all of src/ (excluding the store itself, and excluding the unrelated 'Building tools' button + a local `const tools = [...]` UI action array in GamePanels:521) returns ZERO hits. The Inventory grid renders only `Object.entries(gameState.inventory.blocks)` (GamePanels.jsx:376). The hotbar renders the static `HOTBAR_BLOCKS` const, not the inventory (GameHud.jsx:22). Crafting reads only `inventory.blocks[selectedBlock]` (CraftingTable.jsx:85). Trading reads blocks + magic. Nothing reads tools. The only code that touches it is equipItem/unequipItem — and their only UI caller (GamePanels handleEquip) is driven by clicks on the BLOCKS grid, so a tools item can never be clicked. inventory-flat-bucket-gates.test.js:11 even states the invariant in its own header ('NO panel renders inventory.magic/tools') — and then only enforces it for the trade paths, never noticing that the starting loadout violates it. Meanwhile startingLoadout.test.js:38 asserts the tools bucket exists and calls it 'the craft loop is REACHABLE — basic tools', pinning the dead bucket as if it were a feature.
- *executed evidence:*
  ```
  grep -rn "tools" src --include=*.jsx --include=*.js | grep -v '.test.' | grep -v useGameStore.jsx | grep -viE 'TouchControls|tooltip|toolbar'
    -> src/ui/GameHud.jsx:82   aria-label="Building tools"  (a UI button, unrelated)
    -> src/ui/GamePanels.jsx:521  const tools = [   (a local action-list array, unrelated)
    -> src/world/HurlSystem.jsx:80  (the word 'devtools' in a comment)
  ZERO reads of inventory.tools. Store-side confirmation: grep -n "tools" src/store/useGameStore.jsx -> only lines 170/208/224/246 (equipItem/unequipItem internals) and 588 (the loadout literal).
  Also executed against the real store (vite-node): getItemSlot('sword')='weapon', EQUIPMENT_STATS['sword']={strength:2,agility:1}, getWeaponBaseDamage('sword')=10 — a fully-specified weapon that is unreachable.
  ```

**The attack telegraph is bypassable: a stale `windupUntil` survives de-aggro and produces an instant, zero-telegraph, undodgeable hit on re-aggro.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/workers/ai.worker.js:280-287 (the windup gate) — it lives INSIDE `if (isAggro) { ... }` (line 177), so the de-aggro branch at :319 never clears `windupUntil``
- *player impact:* You die, respawn, walk back to reclaim your loot — and the first hit from every mob that was mid-swing when you died lands instantly with no tell. It reads as unfair/broken hit registration exactly at the moment the player is most fragile (fresh respawn, low gear).
- *why:* M2 #4 (the whole readable/fair-combat feature) defers every strike behind a 380ms windup and re-checks intent at strike time so you can dodge. The gate that 'verifies' it (tests/gates/attack-telegraph-gates.test.js) readFileSync's the worker and regexes 6 strings — it cannot see that the state machine leaks. Once `windupUntil` is stale (already in the past), the very next tick where the mob re-aggros with the player in melee range takes the `now >= windupUntil` branch and pushes the attack IMMEDIATELY — no coil-back pose, no charge glow, no 380ms reaction band.
- *executed evidence:*
  ```
  Real worker, real ticks:
    tick@0     player 2u   -> isAggro=true  windupUntil=100380   (ARMED, strike due at 100380)
    tick@66    player 500u -> isAggro=false windupUntil=100380   <-- de-aggroed, windup STILL ARMED
    tick@10min player back at 2u -> attacks THIS SAME TICK:
       [{"id":1,"type":"melee","damage":10,"position":[0,10.5,0]}]
    >>> INSTANT HIT, ZERO TELEGRAPH.
  CONTROL (proves the telegraph normally works): player in melee range for only 3 ticks (200ms < WINDUP 380ms) then steps out -> hits = 0, clean whiff. The mechanic is correct; the de-aggro path leaks it.
  Reachable path: Components.jsx:205 is a 'Safe-respawn coordinator: when player isAlive transitions false->true, teleport player back to safe spawn coordinates'. Dying during a siege teleports you >30u away in one frame, which is exactly the >AGGRO_RANGE*1.5 de-aggro condition — every mob that had an armed windup at the moment of death keeps it. Mobs within 100u are not culled, so walking back to the fight makes the first hit of EACH of them undodgeable.
  ```

**The mob-bestiary visual gate is VACUOUS: all six mobs are 1.495% of the frame and the diff threshold is 6%. Every silhouette feature could be deleted and the gate stays green.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `tests/visual/diff.test.js:32 (`const THRESHOLD = 0.06`) vs src/App.jsx:529-541 (the `mobBestiary` fixture, camera at OZ+20)`
- *player impact:* No direct in-game symptom — this is the reason the OTHER art findings can ship undetected. Any regression that silently drops a mob's feature boxes, its eyes, its legs, or the whole mob, passes CI. The 'silhouette distinctness' the milestone was built to deliver is unverifiable at the size it is captured.
- *why:* capture.mjs:303 calls mob-bestiary 'the silhouette-distinctness eyeball surface' — it is the ONLY validation the entire mob-distinctness milestone (game/mobFeatures.js: antennae, ribs, horns, head-crest, shoulder slabs, humanoid arms) has at the render layer. It cannot fail. This is the source-grep vacuity pattern, in the VISUAL layer.
- *executed evidence:*
  ```
  I READ tests/visual/baseline/mob-bestiary.png with my eyes: six tiny mobs floating in a blank blue sky, no ground plane, no plinth. Then I MEASURED it with pngjs (classifying sky as blue-dominant AND bright):
    frame 1280x800 = 1,024,000 px
    MOB pixels (non-sky): 15,308 = 1.495% of the frame
    bounding box x 331..954, y 342..444 -> the TALLEST subject is 102 px in an 800 px frame
    THRESHOLD = 0.06  =>  if every mob VANISHED the diff would be 1.495% << 6%. GATE STILL GREEN.
  Also: the fixture (App.jsx:540) renders only 6 of the 10 MOB_TYPES — `['skitterling','duskhound','skeleton','emberhusk','cow','moss_brute']`. zombie, pig, spider and **villager** have no bestiary frame — and `villager` is the exact render used for all 4 hub NPCs (npcSpawn.js:27 `type: 'villager'`), so the entire named hub roster's art is un-gated.
  ```

**SpawnerSystem's spawn loop can spin forever on the main thread — `attempts++` sits INSIDE the distance guard, so rejected samples never count against maxAttempts.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/systems/SpawnerSystem.jsx:163-178 (`while (spawnedThisTick < spawnCount && attempts < maxAttempts)`; `attempts++` is on line 172, inside `if (dist >= 28 && dist <= 85)`)`
- *player impact:* If the chunk set ever becomes player-local-only (a stall in the terrain worker, a cull edge, a future teleport/fast-travel feature, a render-distance change), the browser tab hard-freezes with no error — the classic 'game just died' report. Even without the hang, the loop is an unbounded main-thread retry spin at 1Hz.
- *why:* `maxAttempts = 12` is commented as the guard that 'prevents spikes'. It bounds only ACCEPTED samples. A rejected sample increments neither `attempts` nor `spawnedThisTick`, so the loop condition never advances. If the loaded-chunk set contains no chunk overlapping the [28,85]u annulus around the player, the loop never exits — inside a `useFrame`, on the main thread. Note the fallback at line 155-157 (`if (candidateChunks.length === 0) candidateChunks = loadedChunkKeys`) is what removes the last safety net: it deliberately re-admits chunks the [20,90] pre-filter just rejected as too close.
- *executed evidence:*
  ```
  Transcribed SpawnerSystem.jsx:141-179 verbatim, added only an iteration counter:
    A. healthy 5x5 chunk box, player at origin: {"spawned":3,"attempts":3,"iters":7} — terminates fine.
    B. ONLY the player-local chunk loaded (['0_0'], player at 0,0):
       chunk center (8,8) is 11.3u away -> fails the [20,90] pre-filter -> candidateChunks EMPTY
       -> fallback re-admits ['0_0'] -> every sampled point is <= 22.6u -> `dist >= 28` NEVER true
       {"spawned":0,"attempts":0,"iters":2000001,"HUNG":true}   <<<< hard-stopped at 2,000,000 iterations
    C. 2x2 near chunks: {"spawned":0,"attempts":0,"iters":2000001,"HUNG":true}
    D. even in the terminating case (chunk centers near the 20u edge): mean 8.8 iterations/tick over 200 runs — maxAttempts=12 bounds nothing.
  HONEST CAVEAT: I could NOT prove a near-only chunk set is reachable in normal play. Terrain.jsx:677-678 requests chunks corner-first (nx=-renderDistance upward, 2 per tick), so the FAR chunks land before the near ones and candidateChunks is non-empty at startup. This is a proven-non-terminating loop whose trigger state I have not proven reachable.
  ```

**Two of the twelve achievements can NEVER unlock — updateLevel has zero callers**
- *domain:* Quests + achievements
- *at:* `src/QuestSystem.jsx:398-404 (updateLevel — the ONLY writer of stats.level) and src/QuestSystem.jsx:423 (returned from the hook). The real player level lives in useGameStore.level (src/store/useGameStore.jsx:129).`
- *player impact:* The achievements panel advertises two level milestones with padlocks and a progress counter that can never exceed 10/12. A player who grinds to level 20 sees both still locked. Permanent, silent, 100% of players.
- *why:* `grep -rn 'updateLevel' src/ | grep -v QuestSystem.jsx` returns NOTHING. The hook exports it, nobody calls it, so stats.level is pinned at 1 for the entire game, and checkAchievements' level branch can never fire. This is the identical dead-wire class that the M6 terrain-quest-callback fix already closed for onBlockPlace/onBlockBreak — it was never closed for updateLevel.
- *executed evidence:*
  ```
  PROBE 2/A1: set useGameStore.level = 10 (the real level source that SimpleExperienceSystem reads), then emitted a kill so checkAchievements actually runs. Printed: 'A1 store.level = 10 / A1 questSystem stats.level = 1 / A1 unlocked = [first_step, first_kill] / A1 has level5? false / A1 hook exposes updateLevel? function'. I also OPENED tests/visual/baseline/achievements-open.png: it renders 'Rising Star — Reach Level 5' and 'Shining Star — Reach Level 10' as padlocked tiles under a '1 / 12 unlocked' counter.
  ```

**Every autosave clobbers the player's chosen world name with `Save_<timestamp>`**
- *domain:* Save / load / persistence / migration
- *at:* `src/store/useGameStore.jsx:972 (`writeWorld(id, { name: data.save_name, created_at: new Date().toISOString(), ... }, data)`) + src/game/worldSaves.js:35 (`list.unshift({ id, ...meta })`) + src/game/saveSchema.js:16 (`save_name: 'Save_' + new Date().toLocaleString()`)`
- *player impact:* The World Manager is unusable as a save picker: every world is named an identical-looking timestamp instead of what the player called it. Combined with the CRITICAL finding, a player trying to recover their world cannot even tell which entry it is.
- *why:* saveActiveWorld passes a GENERATED meta (name = `Save_<toLocaleString>`, created_at = now) into writeWorld, which unshifts it over the existing index entry. So the name the player typed in Create World, and the name WorldManager's Save gives ('Guest's World - <date>'), are both destroyed by the very next autosave (<=5s later). created_at is also rewritten to 'now' on every save, so the World Manager's 'created' column actually shows 'last autosaved'. saveActiveWorld should preserve the existing index entry's name/created_at, not synthesize new ones.
- *executed evidence:*
  ```
  probe2 P11 (real store + real worldSaves): 'after Create/Save-As: index name = "Marcus's Castle"' -> one saveActiveWorld -> 'after ONE autosave: index name = "Save_7/13/2026, 10:25:06 AM"; blob.name = "Save_7/13/2026, 10:25:06 AM"'. Confirmed LIVE in the browser: after a real play session the world list read `["Save_7/13/2026, 10:46:45 AM"]`.
  ```

**'Create New World' does not create a new world — it silently clones the current one**
- *domain:* Save / load / persistence / migration
- *at:* `src/WorldManager.jsx:65-108 (createWorld: builds `freshBlob`, calls writeWorld + setActiveWorldId, but never resets the store and never calls loadWorldData)`
- *player impact:* The player asks for a new world (e.g. to start a fresh run, or to make a second world for a sibling) and gets a copy of their old one — same level, same coins, same chest loot, same quest progress, under a name that is then also overwritten. Multi-world play is fundamentally broken.
- *why:* createWorld writes a minimal blob and points the active slot at it, but leaves the LIVE store untouched. The next autosave (<=5s, triggered by any worldBlocks/inventory/questState change) overwrites that fresh blob with a full snapshot of the world the player was already in. Separately, the freshBlob literal itself is not a valid fresh world: it has no `version`, no `progression`, no `chests`, no `questState` — and loadWorldData falls back to CURRENT state for every missing key, so even explicitly Loading it keeps the old character.
- *executed evidence:*
  ```
  probe1 P4 (real store + real worldSaves): after Create + ONE autosave into the new slot -> 'blocks = 2 [["1_2_3",5],["4_5_6",2]]  level = 12  coins = 4321' — i.e. the old world verbatim. probe1 P3 (loading the exact freshBlob literal from WorldManager.jsx:73-88): 'level = 12 (fresh world should be 1) / coins = 4321 (should be 0) / totalXP = 99999 / talentPts = 9 / nightCount = 7 / chests = 1 entries -> [["10_5_10",{inventory:{Diamond:64}}]] (should be 0) / questState = {...old quests...} (should be null)'. Only worldBlocks was actually cleared.
  ```

**flush() on tab-close is a no-op unless a debounce is already pending — and coins / XP / gameWon / nightCount are not autosave triggers, so a grind session dies with the tab**
- *domain:* Save / load / persistence / migration
- *at:* `src/game/autosave.js:8 (`flush() { if (timer !== null) { clear(); save(); } }`) + src/App.jsx:234-249 (the trigger predicate) + :251-252 (visibilitychange/beforeunload -> flush)`
- *player impact:* Kill mobs for 40 minutes without levelling up or picking anything up, close the tab — all the XP and coins are gone. Beat the final boss and close the tab — the win is not recorded. Losses are silent and look like the game 'forgot'.
- *why:* The comment says 'flush on tab-hide/close', but flush() only fires a PENDING debounce; with no timer armed it does nothing. And the subscribe predicate only watches level, equipment, chests, talentPoints, gameMode, worldBlocks, inventory, questState + the 4 banked aspects. Everything else buildSaveData persists — coins, currentXP, totalXP, gameWon, nightCount, lastRewardedNight, gameTime, playerStats, achievements, spellLevels, attributes, unlockedTalents, selectedBlock, activeSpell — never arms the timer. So if the player's last actions were 'earn coins / gain XP / win the game', nothing is pending and the tab-close flush writes nothing. Correct fix: flush() should save unconditionally (or App should call saveActiveWorld directly on hide), AND the trigger list should cover the persisted surface.
- *executed evidence:*
  ```
  probe4 P14 (real store, exact App.jsx predicate) printed, for each PERSISTED field: coins(addCoins) >>> NO AUTOSAVE; currentXP(grantXP, no level-up) >>> NO AUTOSAVE; gameWon(markGameWon) >>> NO AUTOSAVE; nightCount >>> NO AUTOSAVE; gameTime >>> NO AUTOSAVE; playerStats >>> NO AUTOSAVE; selectedBlock >>> NO AUTOSAVE; spellLevels >>> NO AUTOSAVE; unlockedTalents >>> NO AUTOSAVE; attributes >>> NO AUTOSAVE; achievements >>> NO AUTOSAVE. Controls (worldBlocks / inventory / level) DID schedule.
  probe4 P15 (tab-close simulation): after a block-triggered autosave, the player earns 2000 coins and wins the game, then flush() runs -> 'autosave.flush() called (tab hidden / beforeunload). saves = 1' (unchanged) -> 'PERSISTED blob now: coins = 0  gameWon = false' -> '>>> 2000 coins + the WIN survived the tab close? NO — LOST'. Control P16 (timer pending) flushes correctly: blob coins = 777.
  ```

**Chain lightning auto-zaps passive villagers and livestock (no passive/friendly filter)**
- *domain:* Spells / magic
- *at:* `src/game/chainLightning.js:10-46 (solveChainTargets); wrapper at src/EnhancedMagicSystem.jsx:55-75`
- *player impact:* Fight a husk anywhere near your village and the chain executes your settlers and your cattle. It is not aimable and not avoidable -- the chain picks its own targets. Combined with the CRITICAL above, a single lightning cast at a monster standing among villagers can kill two of them.
- *why:* solveChainTargets filters candidates ONLY by `hit.has(mob.id)` and distance. It never checks `passive`, `type === 'villager'`, or health. Its input is `useGameStore.getState().mobEntities`, which MinimapSyncSystem.jsx:15-17 populates with EVERY mob including villagers (health 120, xp 0, quest NPCs), cows and pigs -- it even carries the `passive` flag through and then ignores it. So one lightning cast at a hostile fans out into every neutral within 8u. Allies are safe (convertMobToAlly swaps isMob->isAlly, exiting mobsQuery) -- villagers are not, because allegiance.js UNBINDABLE blocklists them from ever becoming allies.
- *executed evidence:*
  ```
  PURE probe (node, real module):
    solveChainTargets([zombie@(0,0), villager@(0,4) {passive:true}], start=(0,0), {excludeId:1, baseDamage:75, maxChains:3, range:8, damageReduction:0.3})
    -> [{"id":9,"position":[0,140,4],"damage":22}]   // the passive villager IS a chain target
  END-TO-END probe P24 (full system): chain hit the COW for 34 and, in P14, VILLAGER2 for 13 and the COW for 18:
    ### P14 damageMob calls = [{"id":2,"dmg":90},{"id":1,"dmg":27},{"id":4,"dmg":18},{"id":3,"dmg":13}]
    ### P14 zombie=973 | VILLAGER1=30 (120 start) | VILLAGER2=107 | COW=62 (80 start)
  ```

**Fireball -- the DEFAULT starting spell -- cannot hit anything past ~12 metres**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:295-297 (`if (type === 'fireball' || type === 'iceball') projectile.velocity.y -= 12 * delta`)`
- *player impact:* The spell every new player starts with is a 12-metre weapon while two others are effectively 90m+ hitscan -- a 7.5x range gap nobody designed. Aim at a mob 20m out with a perfectly centred crosshair and the fireball silently vanishes into the dirt. The player has no feedback and no reason to understand why.
- *why:* Gravity is applied to fireball and iceball but not to lightning or arcane. The muzzle is `camera.position + dir*2`, and the camera sits at translation.y + 1.2 (Components.jsx:798), i.e. roughly 2.2u above the ground surface. Ground impact fires at `y <= groundLevel + 0.5`. Solving: the ball eats dirt after ~0.45s. At fireball speed 25 that is ~11-12 units; at iceball speed 20, ~10. Lightning (60) and arcane (30) fly flat and reach their 3000ms maxAge. Nothing in the codebase tests, gates, or documents this -- projectile ballistics is one of the 8 NONE-coverage features.
- *executed evidence:*
  ```
  PROBE P22 (magic3.probe.test.jsx -- real system, realistic geometry: ground=140, camera eye = ground+1.2, perfectly LEVEL shot down -Z, one mob at body-centre ground+1.0, sweeping distance 4u..40u and asking 'did its health drop?'):
    ### P22 fireball:  farthest mob a PERFECTLY-AIMED level shot can hit = 12u
    ### P22 iceball:   farthest mob a PERFECTLY-AIMED level shot can hit = 10u
    ### P22 lightning: farthest = 90u
    ### P22 arcane:    farthest = 90u
  Cross-check P19: fireball at a mob 40u away, aimed dead-on -> `hits = []`, mob health 1000 (untouched). P20: lightning, same setup -> hit for 90.
  ```

**Arcane 'pierce 3 targets' actually TRIPLE-HITS one target: 3x damage, 3x lifesteal, zero pierces**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:376-390 (the `case 'pierce'` branch)`
- *player impact:* Three separate harms. (1) Arcane's entire design identity -- the line-clearing piercing bolt -- does not exist; it is a single-target spell. (2) It silently deals 216 damage where the upgrade panel says 60, making it by far the strongest single-target spell in the game (3x) and wrecking the spell balance the upgrade tree is built on. (3) Three damage numbers stack on one mob.
- *why:* On a mob hit the code does `projectile.pierceCount = (projectile.pierceCount||0) + 1; if (pierceCount < sec.pierceCount) willPierce = true` and keeps the projectile alive. But there is NO per-projectile hit-set. The projectile advances only speed*delta = 30/60 = 0.5u per frame while the collision radius is size+1.5 = 2.6u, so `checkMobCollision` returns the SAME mob on the next frame. It burns all 3 'pierces' on the first target over 3 consecutive frames (~50ms) and then dies there. It never reaches a second mob. Lifesteal (15%) and grantXP(5) fire on every one of those frames too. Coverage for pierce/lifesteal: NONE -- no test, no gate, no baseline.
- *executed evidence:*
  ```
  PROBE P1/P2/P17 (magic.probe.test.jsx, real system):
    ### P1 damageMob calls = [{"id":1,"dmg":72,"type":"arcane"},{"id":1,"dmg":72,"type":"arcane"},{"id":1,"dmg":72,"type":"arcane"}]
    ### P1 DISTINCT mobs hit = 1
    ### P1 mob A health 1000 -> 784   | lifesteal healed = 30
  P2 (mob A at 10u, mob B directly behind at 20u):
    ### P2 A.health = 784 | B.health = 1000 (both start 1000)
  P17 (dense pack, mobs at 10u/12u/14u):
    ### P17 healths = 1:784 2:1000 3:1000
  ```

**An imbue-armed cast that is REFUSED burns 30 Resonance AND leaks a free element zone onto a later, unpaid cast**
- *domain:* The four Aspects
- *at:* `src/Components.jsx:477 (castFiredRef set unconditionally) + :785-788 (consume/spend); src/EnhancedMagicSystem.jsx:175 (mana guard returns) vs :214 (consumeImbueCast)`
- *player impact:* You arm the imbue (white-gold ring), right-click while out of mana or inside the 333ms cast cooldown: the ring goes out, 30 Resonance — a third of your bank, ~15 placed blocks or 30 mined blocks of day labour — silently vanishes, and no zone appears. Then a later ordinary spell you never imbued spawns a FREE zone, of whatever element was loaded at the failed cast (so possibly the wrong one), which then joins the chemistry and can annihilate a real zone you did pay for. Out-of-mana during a night siege is the single most common moment a player reaches for a big imbued play.
- *why:* `castFiredRef.current = true` is set on the SAME line as `triggerSpellCast()`, outside any success check. But triggerSpellCast() early-returns on the 333ms CAST_COOLDOWN (Components.jsx:318), and castSpell() early-returns on `!useMana(manaCost)` (EnhancedMagicSystem.jsx:175). Either way NO projectile is built -> `consumeImbueCast()` (which lives at :214, AFTER the mana guard) never runs. The latch still sees castFired=true, fires 'consume', spends ZONE_COST, and calls armImbueCast(kind) — leaving _castArm permanently set. The next projectile built — an ordinary, un-imbued, unpaid cast — picks that kind up.
- *executed evidence:*
  ```
  PROBE 12/13, importing the REAL elemancer.js + elemancerChannel.js + resonance.js and re-enacting the apply-site: `ARMED (ring on). Resonance still 100` -> `CONSUME -> spent 30 Resonance (now 70); _castArm := burning` -> `RESULT: Resonance = 70 (was 100) | zones spawned = 0 | imbue ring = OFF`. Then: `EnhancedMagicSystem:214 builds the projectile with imbueKind: consumeImbueCast() -> burning` on a cast that was never imbued.
  ```

**"Base-as-anvil" 3x fires on the natural GROUND — the Voidhand's marquee build-reward is free, and building is pointless**
- *domain:* The four Aspects
- *at:* `src/game/hurl.js:80 (resolveAnvil) + src/world/Terrain.jsx:878-889 (castWorldRay)`
- *player impact:* Aim down ~20 degrees — the natural aim at any mob within ~6m — and every hurl deals 3x damage (30 -> 90) with the gold "WALL HIT!" text and the anvil ping, on open grass, having placed zero blocks. The Aspect's entire stated payoff (aspectGuide.js:27 "Your base is ammunition: build by day, throw it by night"; hurl.js:76 "rewards day-building directly") is obtainable without building. Conversely the player who DOES build a wall gets nothing distinguishable for it.
- *why:* resolveAnvil returns ANVIL_MULT for ANY ray hit within ANVIL_RANGE — it performs ZERO filtering on what was hit. castWorldRay filters only the player's own rigid body; terrain chunk colliders pass straight through the predicate. Because the hurl arcs downward under gravity, the flight dir at impact already points into the ground.
- *executed evidence:*
  ```
  PROBE 10, using the REAL makeHurl/stepHurlChunked/resolveAnvil to compute impact geometry on a flat field with ZERO player-built blocks: aim -20deg / mob 6m -> impact y=-0.01, flight dir.y=-0.334 -> anvil 3x -> 90 damage. aim -30deg / mob 4m -> dir.y=-0.461 -> 3x -> 90 damage. (Flat aims correctly give 1x/30.) HONESTY: I modelled the terrain collider as a ground plane; I did not drive the live Rapier world. What IS executed-proven from real code: resolveAnvil cannot distinguish a wall from the ground, and the impact dir.y values above come from the real flight integrator.
  ```

**A stray tap anywhere in the LEFT half kills a held joystick -- the player freezes with the stick fully deflected**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/input/touchHandlers.js:39-44 (handleTouchEnd)`
- *player impact:* The player is running, touches the left half with a second finger, and the run stops dead while their thumb is still jammed against the stick. It only un-sticks when the thumb jitters. Realistic triggers are common precisely because the left-half HUD is hit-covered by this same overlay: the quest tracker (top-left), the combat log (bottom-left), and the left half of the hotbar (which straddles the x=195 move/look midline) all register as stray move-zone touches. Honest caveat: a real thumb jitters constantly, so in practice this reads as intermittent stutter-stops rather than a permanent freeze -- but the knob snapping to centre while the thumb is still on it is unambiguous and constant.
- *why:* handleTouchEnd clears ALL FOUR move intents whenever ANY move-zone touch ends -- it does not check whether another move-zone touch is still active. The 'move' zone is the ENTIRE left half of the viewport (touchMath.js:70), not just the joystick ring, so any second finger that lands and lifts on the left half nukes the movement of a stick that is still physically held. And because touchmove only fires when a finger actually moves, a still thumb never re-asserts the intent. The knob also visually snaps back to centre while the thumb is still on it. Note: touch-purity/touch-wiring gates are pure regex and touchHandlers.test.js only ever exercises ONE finger at a time, so nothing catches this.
- *executed evidence:*
  ```
  TWO independent executions.
  (a) Pure-module, node, real imports (touchMath.js + touchHandlers.js):
      zones bound: A=move B=move
      PROBE A1 after A drags up:                       {"F":true,...}
      PROBE A2 after STRAY finger B lifts (A STILL HELD): {"F":false,"B":false,"L":false,"R":false}  <- A is still pressed up!
      router still tracks A? activeCount= 1
  (b) LIVE puppeteer, iPhone 13, CONTROL vs TREATMENT reading the REAL intent object (scratchpad/touch-audit4.mjs):
      CONTROL   (no stray)  | stick held UP    : moveF=true
      CONTROL   (no stray)  | after idle 0.9s  : moveF=true          <-- harness holds intents correctly
      CONTROL   (no stray)  | after 1px jitter : moveF=true
      TREATMENT (stray tap) | stick held UP    : moveF=true  | knob=translate(calc(-50% + 0px), calc(-50% - 42px))
      TREATMENT (stray tap) | after stray lift : moveF=FALSE | knob=translate(-50%, -50%)   <-- stick is STILL PHYSICALLY DOWN
      TREATMENT (stray tap) | after 1px jitter : moveF=true
  And measured as speed (scratchpad/touch-audit3.mjs): steady-state 1.00 u/s with the stick held -> 0.00 u/s after the stray tap. The CONTROL arm rules out a puppeteer multi-touch artifact.
  ```

**The hotbar physically overflows the phone viewport -- 2 of 9 blocks are entirely off-screen on an iPhone**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/GameHud.jsx:20-24 (MinecraftHotbar: fixed 9 x 62px slots, centred, no wrap/scroll)`
- *player impact:* A phone player can never select grass or chest, no matter what happens to X3 -- the slots are off the glass. In a voxel BUILDING game that permanently removes two block types from the mobile build. It also means the X3 fix currently in flight is necessary but NOT sufficient; shipping it will still leave the phone hotbar broken.
- *why:* Nine 62px slots plus gaps and padding is a ~622px-wide row rendered centred with `left-1/2 -translate-x-1/2` and no responsive handling. On a 390px iPhone 13 it spans x[-116 .. 506] -- it bleeds off BOTH edges. This is INDEPENDENT of, and compounds, the known X3 hit-cover bug (task #21): the in-flight X3 fix makes the hotbar tappable, but two slots will still be physically outside the viewport and therefore still unselectable on a phone. Feature #19 (hotbar selection on touch) is in the NONE coverage bucket.
- *executed evidence:*
  ```
  LIVE puppeteer, git HEAD, getBoundingClientRect on [data-hotbar-block] (scratchpad/touch-audit2.mjs):
    iPhone 13  390x844 : HOTBAR: 9 slots, 2 entirely OFF-SCREEN -> grass, chest
                         span x[-116 .. 506]  viewport width=390
    iPad Pro  1024x1366: HOTBAR: 9 slots, 0 entirely OFF-SCREEN -> (none)
                         span x[201 .. 823]  viewport width=1024
  Also confirmed with my eyes in the PINNED baseline tests/visual/baseline/mobile.png: slots 1-2 are cut off at the left edge (only a truncated '32' quantity is visible) and slot 9 is cut off at the right; only slots 3-8 are fully on screen. The baseline has been locking this in.
  ```

**CraftingTable PERMANENTLY DESTROYS every material left in the 3x3 grid when the panel is closed (X, ESC, or a backdrop click)**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/panels/CraftingTable.jsx:22 (grid is React-local useState), :79-90 (handleGridClick removes from inventory on place), and src/MenuSystem.jsx:122-130 (`{gameState.showCrafting && <CraftingTable/>}` -> close UNMOUNTS, grid state is discarded)`
- *player impact:* You stage a Diamond Sword pattern (2 diamonds + 1 wood), get distracted, and press ESC -- your diamonds are gone. Diamonds are mined ore; this is the most expensive material in the game. Any accidental backdrop click while dragging materials in wipes them. Silent, no toast, no undo.
- *why:* Placing a material into a grid cell calls `gameState.removeFromInventory(selectedBlock, 1)` immediately. The staged grid lives ONLY in the component's local `useState`. MenuSystem mounts the panel conditionally, so onClose unmounts it and the grid is garbage-collected -- with no unmount cleanup and no refund. There are THREE ways to trigger it and all are one keystroke/click: the header X, the global ESC handler, and the Modal backdrop (Modal.jsx:47 wires onClick={onClose} on the backdrop by default). The existing behavioral test (tests/integration/crafting-table.test.jsx) tests place/refund-by-clicking-the-cell/craft -- but never closes the panel. There is NO test for this path.
- *executed evidence:*
  ```
  PROBE (jsdom vitest, real CraftingTable + real store, act()-wrapped):
    start                        {"diamond":3,"gold":3}
    placed 1 diamond in cell 0   {"diamond":2,"gold":3}
    placed 1 gold    in cell 1   {"diamond":2,"gold":2}
    result slot now shows        4x Magic Crystal
    closed WITHOUT crafting      {"diamond":2,"gold":2}   <-- diamond+gold NOT refunded
  Assertion `expect(blocks.diamond).toBe(3)` FAILED: expected 3, received 2. A reopen shows an empty grid (0 filled cells) and the inventory never gets the items back.
  ```

**Progression panel (U): the ENTIRE header -- 'Talent Points', 'Player Level', the title, and the close X -- is off-screen and UNREACHABLE at 1280x800**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/SpellUpgradePanel.jsx:40 (`absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto`) -- same class string in src/ui/ChestInventoryPanel.jsx:29`
- *player impact:* A player levels up, gets 3 talent points, presses U -- and the panel gives them NO indication of how many points they have or what level they are. They also cannot click the close button. (ESC/U still close it, so they are not trapped, but the entire budget readout that drives the spend decision is invisible.) At any viewport shorter than ~1950px, which is every laptop and every tablet.
- *why:* This is the classic `align-items: center` + `overflow-y-auto` top-clipping bug: when the flex child is taller than the container, it overflows equally top AND bottom, and scrollTop cannot go negative -- so the top overflow is permanently unreachable. The panel is 1952px tall in a 800px viewport. The scroll container's scrollHeight (1392) is 560px SHORTER than the panel it contains. The visual baseline `progression-open.png` HIDES this: scripts/visual/capture.mjs:443 explicitly does `sc.scrollTop = sc.scrollHeight` to force-scroll to the bottom before the screenshot, so the pinned baseline has never captured the header.
- *executed evidence:*
  ```
  LIVE PUPPETEER PROBE against `vite dev` at 1280x800, real app, real store (talentPoints set to 3), opened via __craftyTest.call('openModal','spellUpgrades'), then `sc.scrollTop = -5000` (scroll as far up as the browser allows):
  { viewportH: 800, panelH: 1952, panelTopY: -576,
    scrollTopAfterScrollingUp: 0,        <-- ALREADY at the top of the scroll range
    scrollHeight: 1392, clientHeight: 800,
    closeX:            { top: -526, bottom: -486, onScreen: false },
    h2Title:           { top: -540, bottom: -504, onScreen: false, text: 'Progression - Aspects & Spells' },
    talentPointsLabel: { top: -536, bottom: -507, onScreen: false } }
  I also screenshotted it and LOOKED: the frame opens mid-talent-node ('+3 Strength per rank -- kinetic strikes...'), with no title, no points counter, no level, no X button anywhere on screen.
  ```

**Inventory (E): the attribute-point banner and all three '+' allocate buttons are BELOW THE FOLD with no scroll affordance -- a player with 5 unspent points sees zero indication they exist**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/GamePanels.jsx:252 (`h-[440px]` body) + :254 (column 1 is `overflow-y-auto`) + :326-337 (the Core Attributes Panel is `mt-auto`, i.e. pushed to the BOTTOM of that overflowing column)`
- *player impact:* Levelling up grants attribute points. The player opens their Inventory expecting to spend them and the panel is silent -- no badge, no banner, no buttons. The core RPG progression reward is effectively undiscoverable unless the player happens to scroll-wheel inside an unmarked 400px column.
- *why:* Column 1 stacks: avatar well (160px, flex-none) + Gear Slots + Core Attributes. Content is 492px in a 400px column. The Core Attributes panel -- which holds the '{n} point(s) to spend' banner and the three allocate buttons -- is `mt-auto`, so it is pinned to the bottom of the overflow, entirely out of view at scrollTop 0. There is no scrollbar hint, no badge on the panel header, nothing. tests/integration/inventory-attributes.test.jsx passes because jsdom has no layout -- it finds the buttons in the DOM and clicks them. A green behavioral test on an invisible button.
- *executed evidence:*
  ```
  LIVE PUPPETEER PROBE, 1280x800, real app, attributes.attributePoints set to 5, showInventory:true:
  { column1: { top: 219, bottom: 619, clientH: 400, scrollH: 492, scrollTop: 0, overflowsBy: 92 },
    allocateButtons: 3,
    coreAttributesHeading: { top: 622, bottom: 637, fullyInsideColumn: false, pxBelowColumnFold: 17 },
    firstAllocateBtn:      { top: 664, bottom: 680, fullyInsideColumn: false, pxBelowColumnFold: 60 } }
  I screenshotted it and LOOKED: with 5 unspent points the Inventory shows a 2px sliver of the Core Attributes panel's top border under BOOTS and nothing else. No '5 points to spend'. The pinned baseline tests/visual/baseline/inventory-open.png shows the exact same clipping.
  ```

**All 7 player stat bars lay out as a 1232px HORIZONTAL RIBBON across the top of the screen instead of a vertical stack (`space-y-2` is a no-op on `inline-flex` children)**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `src/ui/primitives/StatBar.jsx:18 (root is `inline-flex` = inline-level) + src/HUD.jsx:547 (container uses `space-y-2`, which only sets margin-top and CANNOT stack inline-level boxes)`
- *player impact:* In the late game (all Aspects unlocked) the stat bars form a ribbon spanning virtually the entire screen width at eye level, cutting across the play area — the opposite of the intended tidy corner cluster. Combined with the occlusion above, the two bars that matter most are the two you cannot read.
- *why:* The author's intent is unambiguous — `space-y-2` plus the source comments describe a compact vertical stack of Health/Mana/Hunger/Ferocity/Kinetic/Soul/Resonance in the top-left corner. Because StatBar's root is `inline-flex`, the children are inline-level and flow HORIZONTALLY on a line box; `space-y-2` adds a margin-top that never stacks anything. This is also the ONLY reason any part of the mana bar is currently visible — so naively 'fixing' the occlusion by re-stacking vertically would push every bar fully under the QUESTS panel and make things WORSE. The correct fix is BOTH: make the container `flex flex-col items-start` (or make StatBar's root `flex`) AND relocate the stack clear of the QuestTracker footprint (QuestTracker owns x 16..296, y 16..279).
- *executed evidence:*
  ```
  Live puppeteer probe, default spawn: statContainer measured w=352, h=33 — one row, not a column. healthBar x 16..192 and manaBar x 192..368, BOTH at y 72..92 (identical y => same row).
  Then I unlocked all 4 Aspects + survival mode in the live store and re-measured — all 7 bars rendered on ONE row:
    danger    x   16..192   y 72..92
    info      x  192..368   y 72..92
    warn      x  368..544   y 72..92
    ferocity  x  544..720   y 72..92
    kinetic   x  720..896   y 72..92  ('GRAB!50/100')
    soul      x  896..1072  y 72..92  ('SNARE!50/100')
    resonance x 1072..1248  y 72..92  ('IMBUE!50/100')
    statContainer: w=1232 on a 1280px viewport.
  Screenshot /tmp/crafty-hud-full-bars.png visually confirms bars marching off to the right.
  ```

**The day/night dial is a quarter-cycle (90°) out of phase — it draws the SUN at its ZENITH one second before nightfall, while simultaneously printing 'DUSK'**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `src/HUD.jsx:81 and :102 — `rotate(${p.angleDeg - 180}deg)`. Root cause: src/game/dayPhase.js:29-30 documents `cycleFraction 0=midnight, 0.5=noon`, but the LIVE clock (src/game/dayNight.js:48 `isDayAtUnit`: day = floor(t/600)%2===0, i.e. t in [0,600)) makes gameTime 0 = DAWN and 600 = DUSK. The -180 display offset should be -90.`
- *player impact:* The ambient clock — the widget whose entire job is to answer 'how much daylight do I have left?' — lies by a quarter cycle. A player glances at a sun sitting at high noon and commits to a mining trip; the siege lands seconds later. It is at its most wrong exactly when it matters most (the last moments of day). At spawn it draws the sun underground.
- *why:* The dial is mounted for every non-capture session (HUD.jsx:545, gated only on isPointerLocked && isAlive && isWorldBuilt) and reads the live `gameTime`, which ticks from 0 at +4 units/sec. dayPhase.js's docstring encodes a midnight-at-zero convention that the real clock does not use, and the component trusted the docstring. Classic doc-vs-code drift that produced a visibly wrong HUD. The dial even self-contradicts within a single returned object: at gameTime 500-599 it returns duskApproaching=true (the 'DUSK' text lights up — that predicate IS correct) while angleDeg puts the sun marker at the top of the ring.
- *executed evidence:*
  ```
  node --input-type=module probe importing the REAL modules (src/game/dayPhase.js + src/game/dayNight.js), computing the exact CSS rotation HUD.jsx writes:
   gameTime | live phase | CSS rot | marker sits at   | icon | label
      0     | DAY (dawn) |  -180   | BOTTOM (midnight)| SUN  | (none)   <-- sun BELOW the horizon line the widget itself draws, at spawn, in broad daylight
    300     | DAY (noon) |   -90   | LEFT (sunrise)   | SUN  | (none)
    500     | DAY        |   -30   | TOP (noon)       | SUN  | DUSK     <-- 'DUSK' text + sun at ZENITH, same widget, same tick
    599     | DAY (dusk) |    -0   | TOP (noon)       | SUN  | DUSK     <-- 1 second before nightfall, sun drawn at high noon
    600     | NIGHT      |     0   | TOP (noon)       | MOON | NIGHT
    900     | NIGHT      |    90   | RIGHT (sunset)   | MOON | NIGHT
  Verified the fix: with rot = cf*360 - 90, all four cardinal moments land correctly (dawn->LEFT, noon->TOP, dusk->RIGHT, midnight->BOTTOM).
  ```

**Left-clicking a chest MINES it — the chest and every item inside are deleted with no drop and no confirmation**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/src/input/verbRouter.js:24-29 (left button has no chestTargeted branch) + frontend/src/world/Terrain.jsx:808-812 (mine() deletes the chest entry)`
- *player impact:* You fill a chest with your best loot, mis-click once while mining next to it, and the chest plus everything in it is deleted permanently. No warning, no drop, no undo. You get one wood block. In Minecraft — the game this is modelled on — breaking a chest drops its contents; here the loot is annihilated. This is the kind of loss that makes a player quit.
- *why:* `routeMouseVerb` handles `chestTargeted` ONLY on button 2 (right-click -> 'interact'). The button-0 ladder is `held -> attack; meleeHit -> attack; aimedMobDist<=terrainDist -> attack; terrainDist<Infinity -> MINE`. A chest IS a terrain hit, so a left-click on your own chest routes to `mine`. `mine()` then does `newChests.delete(h.targetCoords); setState({chests: newChests})` — and there is NO code anywhere that returns the chest's `inventory` to the player. The chest voxel is the `chest -> wood` alias (BLOCK_ALIAS), so the worker's block_broken emits id 6 and you receive exactly ONE 'wood' block for a chest full of loot. Chests hold real, persisted loot (tests/store/saveNormalizer.test.js:79 stores `{inventory:{'Gold Coin':9}}`; inventoryConservation.test.js:32 tests chest transfer). Zero tests execute chest create/destroy.
- *executed evidence:*
  ```
  EXECUTED the real router module:
  $ node -e "import {routeMouseVerb} from './src/input/verbRouter.js' ..."
    LEFT-click  on a chest -> mine
    RIGHT-click on a chest -> interact
    LEFT-click  on plain terrain -> mine
  And `grep -rn chests src/world/Terrain.jsx` shows the only chest code in mine() is the `newChests.delete(...)` at :808-812 — no drop path, no read of `chest.inventory` before deletion, anywhere in the file.
  ```

**Ocean.jsx burns ~14% of the 60fps frame budget everywhere in the world — including underground and 1.1km from the nearest water**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/render/Ocean.jsx:38-60 (useFrame body; only guard is `if (!mesh) return`)`
- *player impact:* A flat ~14%+ frame-budget tax at spawn, in every forest, and inside every cave — for a plane that is invisible or buried in rock. iPad/touch is a shipped target (touch-probe gate exists); this is exactly the budget a mobile GPU cannot spare.
- *why:* The useFrame sweeps ALL 9,409 plane vertices every frame: gerstnerHeight + gerstnerNormal (4 sin + 4 cos each), a THREE.MathUtils.smoothstep, and 6 BufferAttribute get/set calls per vertex — then flags position + normal + color needsUpdate, re-uploading 331 KB to the GPU per frame. There is no distance gate, no water-proximity gate, no camera-height gate, no visibility gate.
- *executed evidence:*
  ```
  Measured by importing the REAL oceanProfile.js and running the exact per-vertex math for 9,409 vertices x 120 frames in node/V8: 2.37 ms/frame of gerstner math alone = 14.2% of a 16.67 ms frame — and that EXCLUDES the BufferAttribute get/set churn and the 331 KB/frame upload that the real useFrame also pays. Executed transect: the nearest water on +X is 1,144 blocks from spawn, so at spawn this cost buys literally zero visible pixels.
  ```

**Greedy meshing destroys vertex AO — contact shadows vanish, and the ones that survive smear across 64-block quads**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/world/terrain.worker.js:757,760 (merge key = `blockType | (dir << 8)`; AO is NOT in the key) + :890-896 (AO sampled only at the merged quad's 4 corners)`
- *player impact:* Every tree, cliff edge and player-placed block either casts NO contact shadow or smears a large soft dark gradient across the terrain. The S1 'vertex AO' feature is effectively dead on exactly the large flat surfaces (plains, plateaus, the player's own builds) where it would read most — and where it does fire, it reads as a lighting artifact, not a shadow.
- *why:* The classic greedy-mesh + AO bug: faces with DIFFERENT true AO get merged into one quad because AO is not part of the mask key, and the merged quad then carries AO only at its 4 corners. The GPU bilinearly interpolates those 4 values across the whole quad, so a 1-block contact shadow becomes an 8x8-block gradient — or disappears entirely if the occluder isn't at a corner.
- *executed evidence:*
  ```
  Drove the REAL worker (load_modifications + generate) with a synthetic chunk: flat stone plane at y<=40, air above, ONE stone block at (8,41,8). The emitted top (+Y) faces were 4 quads of area 128 / 64 / 56 / 7 blocks. Printed cornerAO: the 128-block quad ADJACENT to the pillar reads [3,3,3,3] — NO shadow at all. The 64-block quad reads [2,3,3,3] — a single AO=2 vertex, so the pillar's contact shadow is smeared across 8x8 blocks of ground. Total vertices with AO<3 on the entire plane: 4. A correct per-face AO would darken ~12 face-corners immediately around the block.
  ```


### MEDIUM

**Arpeggiator burns ~28 WebAudio nodes/sec during ALL combat while producing ZERO sound (PROC_MUSIC_GAIN = 0)**
- *domain:* Audio
- *at:* `src/SoundManager.jsx:14 (PROC_MUSIC_GAIN = 0), :311 (gain ramp target), :318-381 (25ms scheduler interval)`
- *player impact:* Nothing is heard (correct — the music is intentionally muted), but the player pays GC churn and a 25ms timer for it, continuously, for as long as any hostile is alive. Deleting the arpeggiator + synth-pad code paths costs zero audio and removes the allocation. It must be done together with a fix for finding #1, because removing the `activeHostilesCount` subscription is precisely what would permanently kill spatial audio.
- *why:* PROC_MUSIC_GAIN is 0 (the procedural music was deliberately muted in favour of the ElevenLabs tracks), so the arpeggiator's masterGain ramps to `0.75 * volume * 0 = 0`. But the effect at :388-427 still STARTS the arpeggiator whenever `activeHostilesCount > 0 || bossActive`, and it keeps running its 25ms setInterval for the entire duration of combat, allocating an oscillator + biquad + gain per 16th note and a setTimeout per note — all routed into a gain node pinned at 0. It is a pure-waste allocator running in the most frame-critical moments of the game. The same is true of the synth pad (:126-236), which also multiplies through PROC_MUSIC_GAIN=0 (its wind-bed sibling, which is NOT gated by PROC_MUSIC_GAIN, is the only audible part). This is also what makes finding #1 so fragile: the only reason spatial audio ever comes alive is SoundProvider's `activeHostilesCount` subscription, which exists purely to feed this dead arpeggiator.
- *executed evidence:*
  ```
  Drove the real SoundProvider with an ADVANCING-clock fake AudioContext and set `activeHostilesCount: 3` for 1.0s of wall time:
    nodes created in 1.0s of combat: {"gain":10,"osc":9,"biquad":9}
    => osc/sec: 9  total WebAudio nodes/sec: 28
    gain linear ramps (target values): [ 0 ]     <-- masterGain target is 0 => INAUDIBLE
  So: 28 WebAudio nodes + ~9 setTimeouts per second of combat, all silent.
  ```

**Phase 1 - 40% of the boss's health - cannot be hit with melee at all**
- *domain:* Boss + the Blight-Heart win state
- *at:* `src/render/BossEntity.jsx:216-223 (targetY = currentGroundY + 13.0 +/- 2.0, orbitRadius 14) vs src/Components.jsx:267 (const range = 4.5)`
- *player impact:* A melee-built player who completes the 1025-block journey to the climax cannot damage the boss at all until it lands - and cannot disengage (finding 2). They must have a working ranged/spell option or they are soft-locked in an unwinnable, unendable encounter. Nothing in the game warns them. This MAY be intended (the health bar reads 'Phase 1: Aerial Barrage'), but there is no fallback and no telegraph of the requirement.
- *why:* Phase 0 pins the dragon to groundY + 13.0 + sin()*2.0 altitude while orbiting the player at radius 14. The player's melee cone is range 4.5 (3D, via isPointInCone). The altitude alone (~11.3 blocks after player eye height) already exceeds 4.5, so the dragon is out of melee reach even when directly overhead - the orbit radius just makes it worse. Phase 1 spans 700 -> 420 HP: 280 HP, 40% of the fight. Mirror defect: the boss's OWN bite check uses XZ-ONLY distance (BossEntity.jsx:201-203 computes dist from dx,dz and ignores Y) against attackRange 5, so a grounded-phase dragon can bite the player through 13 blocks of vertical separation.
- *executed evidence:*
  ```
  P13: re-implemented BossEntity's phase-0 solver faithfully (60fps, 30s) and measured against the REAL isPointInCone from src/combat/cone.js. Printed: 'phase-1 steady-state 3D player->boss distance: min=11.57 max=14.94 blocks | melee cone range = 4.5 | boss in melee reach EVER? false | isPointInCone(...) = false'.
  ```

**The 'Shadow Dragon' is a purple box with grey planks for wings**
- *domain:* Boss + the Blight-Heart win state
- *at:* `tests/visual/baseline/boss-closeup.png (rendered from src/render/BossEntity.jsx:461-578)`
- *player impact:* The climax of the game looks like a cardboard box. Corroborates existing task #9 (mob/boss/player art pass, Kevin de-gated 2026-07-13) - this finding is evidence for prioritizing the BOSS within it, since it is the single most emotionally-loaded model in the game.
- *why:* This is the payoff for the entire run - the thing the compass points at for 1025 blocks.
- *executed evidence:*
  ```
  I READ the PNG. What I SEE: a flat, untextured dark-purple cuboid body; a lighter-purple cuboid head stuck on the front-left, visibly clipping INTO the torso at an offset (two different purples, reading as two different materials); two flat lavender ellipses for eyes with no pupils; two thin, flat, zero-volume SLATE-GREY quads jutting out sideways as 'wings' - they read as grey planks or rulers taped on, and the grey clashes with the purple body; two tiny spikes for horns. No neck, no legs, no tail, no claws, no teeth. It does not read as a dragon.
  ```

**boss-obsidian.png contains no boss, and BossHealthBar has zero validation of any kind**
- *domain:* Boss + the Blight-Heart win state
- *at:* `scripts/visual/capture.mjs:280 + src/world/bossSystem.js:142 + src/ui/BossHealthBar.jsx (whole file)`
- *player impact:* No direct player impact - this is a COVERAGE-HONESTY defect. It makes the domain look covered in a file listing ('boss-obsidian.png' + 7 boss gate files) when the boss HUD - the thing that tells the player how the climax is going, including the phase subtext and the HP readout - is validated by absolutely nothing and could render blank, NaN, or off-screen without any gate turning red.
- *why:* The baseline NAMED after the boss validates the colour grade only. capture.mjs:280 drives it with `window.__craftyTest.call('setDangerLevel', 2)` - a direct dev hook - with no boss spawned; and bossSystem.js:142 explicitly SKIPS the real bossActive->dangerLevel bridge in capture mode, so the production bridge can never be exercised by a capture. Separately, BossHealthBar.jsx has no unit test, no gate, and no baseline: grep for BossHealthBar across tests/ returns zero. It is never mounted anywhere in the test suite.
- *executed evidence:*
  ```
  I READ boss-obsidian.png: no dragon in frame, NO boss health bar at top-center (BossHealthBar renders at `top-36 left-1/2` - only the compass strip is there), and the HUD reads 'Level 1', '50 / 100 XP', quests at 0/1, 0/5, 0/20 - a fresh level-1 game, while the boss requires level 5. Confirmed against source with `grep -n -A6 'boss-obsidian' scripts/visual/capture.mjs`.
  ```

**EnemyProjectileSystem's multi-arrow damage loop is dead code -- 3 arrows deal 15 damage, not 45**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/systems/EnemyProjectileSystem.jsx:42 (`if (damagePlayer) for (let i = 0; i < hits; i++) damagePlayer(15, 'projectile');`)`
- *player impact:* An archer volley (multiple Bonepickers) is no more threatening than a single arrow. Ranged enemies cannot ever be a real threat by massing, which is the only threat model archers have.
- *why:* The author wrote an explicit loop over `hits` -- the intent is unambiguous: N arrows landing in one frame should deal N x 15. Every iteration after the first is a guaranteed no-op, because damagePlayer's 500ms lockout (useGameStore.jsx:747) rejects it. The loop is either a silent bug or dead code; either way the source reads as if volley damage works and it does not. Nothing tests this: stepEnemyProjectiles has a behavioral test, but the damagePlayer call site it feeds has NONE.
- *executed evidence:*
  ```
  Probe P2 (vitest, REAL useGameStore):
    3 x damagePlayer(15) => playerHealth = 85   (would be 55 if all land)
  Only the first of the three iterations mutated health.
  ```

**The hitstop weight hierarchy collapses to 'crit' for any geared player -- the exact gap the feature was built to close**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/systems/CombatSystem.jsx:39 (`const weight = damage >= 40 ? 'crit' : damage >= 30 ? 'heavy' : 'light';`)`
- *player impact:* By mid-game every swing punches identically -- max hitstop, max shake, max sparks. A lucky crit feels exactly like a routine poke, and progression makes combat feedback WORSE (mushier, less legible), not better. The light/heavy/crit hierarchy exists only for a level-1 player holding a wooden sword.
- *why:* The tiering was added specifically because "a flat 28ms collapsed the light/heavy/crit hierarchy -- the audit's #1 game-feel gap" (comment at CombatSystem.jsx:35). But the thresholds are ABSOLUTE damage numbers (30/40) that never scale with weapon or level, while melee damage is `baseWeaponDmg + strength*1.5`. Equip an Iron Sword and every non-crit already crosses 30; equip a Diamond Sword and every single swing crosses 40. The same `damage >= 40` value is also the `isCrit` proxy driving camera-shake magnitude (1.6 vs 1.0) and spark count -- so all three feedback channels saturate together.
- *executed evidence:*
  ```
  Probe P16 (vitest, REAL solveMeleeDamage + REAL getWeaponBaseDamage + REAL HITSTOP table, CombatSystem:39 tier fn verbatim):
    weapon=Wooden Sword  base=5  | str10: nonCrit=20(light/45ms) crit=40(crit/130ms)
    weapon=Iron Sword    base=20 | str10: nonCrit=35(heavy/90ms) crit=70(crit/130ms) | str20: nonCrit=50(crit/130ms)
    weapon=Diamond Sword base=35 | str10: nonCrit=50(crit/130ms) crit=100(crit/130ms) | str40: nonCrit=95(crit/130ms)
  With a Diamond Sword, EVERY hit at EVERY strength is tier 'crit'.
  ```

**Closing the crafting panel with materials staged on the grid DESTROYS them**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:22 (grid is component-local useState) + :79-90 (handleGridClick removes from inventory on placement) — no unmount cleanup anywhere in the file`
- *player impact:* A player half-builds a pattern, gets confused (very likely, given 4 of the recipes silently cannot match), or is interrupted by a night-siege mob, and closes the panel — their Leather / iron / diamond is silently deleted with no message. Leather is a 50%-chance cow drop; diamond is the rarest ore. Escape is the natural panic key during a siege, which is exactly when this fires.
- *why:* Materials are decremented from inventory the instant they are placed into a grid cell (:87). The grid lives in React local state and is discarded on unmount. There is no useEffect cleanup, no onClose refund, and onClose (:123, and the Modal backdrop) is wired straight to the parent's close. Anything staged in the grid when the panel closes is gone.
- *executed evidence:*
  ```
  PROBE D rendered the real CraftingTable with 6 Leather, clicked 5 real grid cells, then unmounted the panel exactly as pressing C / Esc / the X does: 'Leather after placing 5 in the grid : 1' -> 'Leather after CLOSING the panel : 1 (started with 6)'. Five Leather destroyed.
  ```

**Four recipes produce items that do not exist — and the result slot lies about what you are getting ("5x Bow" hands you 5 Arrows; there is no bow in the game)**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/data/recipes.js:104-108 (Bow -> {Arrow:5}), :109-113 (Torch -> {torch:4}), :119-123 (Planks -> {planks:4}), :124-128 (Magic Crystal -> {crystals:4}); label rendered at /Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:178`
- *player impact:* The player spends 3 wood + 3 String (a spider drop) on what the UI explicitly promises is a Bow, and receives 5 items that nothing in the game can use. Torch costs coal + wood and produces an unplaceable counter — in a game with a night cycle, a torch that cannot be placed is a cruel joke. Magic Crystal burns a DIAMOND and a GOLD (the two rarest ores) to produce the same dead blocks.crystals the merchant refuses to recognise (see finding 2). These are pure material sinks with a lying label.
- *why:* The result slot renders `${Object.values(result.output)[0]}x ${result.name}` — the COUNT of the output token next to the RECIPE's name, not the item you actually receive. The 'Bow' recipe's output is {Arrow: 5}, so the slot reads '5x Bow' and the toast says 'Crafted Bow!' — but you get 5 Arrows and no bow. There is no 'Bow' anywhere in src/data/items.js, no bow in equipment.js SLOT_ITEMS, and no player ranged attack: the only 'Arrow' consumer in src is AIWorkerSystem.jsx:37, which is the ENEMY archer's projectile. torch / planks / crystals are equally inert: none is in BLOCK_ID (so idForBlock returns null -> Terrain.place() refuses them), none is in CONSUMABLES, none is in any equipment slot.
- *executed evidence:*
  ```
  PROBE I asked the real modules about every craft output token: 'Arrow (recipe LABELLED "Bow") placeable=false consumable=false equip=null -> *** DEAD ITEM ***'; same for torch, planks, and crystals. PROBE A confirmed the panel really does render the misleading label: the Bow row printed 'result slot: "5x Bow"'. Separately, PROBE F3 showed 'cobblestone' — an ingredient of Stone Pickaxe and Stone Sword — has NO legitimate source: worldgen never emits id 14 (the only 'cobblestone' hit in terrain.worker.js is a comment), blockForId(3) for a natural stone voxel returns 'stone', and it is not in the starting loadout. tests/gates/ore-drop-gates.test.js is green on this because it asserts idForBlock(ing) !== null — i.e. PLACEABLE — which is not the same as OBTAINABLE.
  ```

**Loading a save while the live phase is NIGHT wipes the loaded save's ferocity / kinetic / soul / resonance banks to zero**
- *domain:* Day/night, siege, weather
- *at:* `src/world/survivalSystem.js:27-36 (the night->day 'dawn bleed' branch, which also fires on a LOAD-induced isDay flip)`
- *player impact:* You are mid-night in world A. You open the World Manager and load world B (which is at day). World B's four hard-earned banked resources are silently zeroed -- you lose a fully-charged roar you may have spent a whole day banking. No message, no undo.
- *why:* Same root as Finding #1, opposite edge. The dawn branch calls setFerocityBanked(0) / setKineticBanked(0) / setSoulBanked(0) / setResonanceBanked(0). It runs AFTER loadWorldData's set() commits, so it stomps the freshly-restored values. All four are persisted resources (saveSchema) that gate the Aspect roars.
- *executed evidence:*
  ```
  PROBE D (live phase = NIGHT, load a DAY save whose banks are ferocity 90 / kinetic 80 / soul 70 / resonance 60):
    after load banks = {"ferocityBanked":0,"kineticBanked":0,"soulBanked":0,"resonanceBanked":0}
  PROBE E (CONTROL -- identical save, but the live phase is already DAY):
    after load banks = {"ferocityBanked":90,"kineticBanked":80,"soulBanked":70,"resonanceBanked":60}
  So the wipe is caused by the phase transition the load induces, not by the load itself.
  ```

**The dawn branch can pay out a FREE dawn reward (XP + coins + a legendary drop) merely for LOADING a save**
- *domain:* Day/night, siege, weather
- *at:* `src/world/survivalSystem.js:41-46 (grantDawnReward called on the load-induced night->day flip) + src/store/useGameStore.jsx:661-673`
- *player impact:* An exploit and a progression corruption in one: repeatedly loading a night-inflated save pays out the top-tier dawn reward (legendary Diamond) with zero gameplay. Even for an honest player it means the dawn reward fires at the wrong moment, for the wrong night.
- *why:* grantDawnReward's once-per-night guard is `nightNumber <= lastRewardedNight -> null`. It holds for a re-fired dawn WITHIN a run (my probe confirms this, and the e2e spec covers it). But if a save has lastRewardedNight < nightCount, loading it while the live phase is NIGHT fires the dawn branch and pays out instantly. Finding #1 manufactures exactly that state: a night-save load leaves nightCount = N+1 while lastRewardedNight is still N-1, and the autosave writes it to disk.
- *executed evidence:*
  ```
  PROBE F (live isDay=false; load a save with coins=100, nightCount=6, lastRewardedNight=2):
    after load -> {"coins":160, "lastRewardedNight":6, "nightCount":6, "totalXP":300}
    inventory Diamond = 1
  No night was survived. +60 coins, +300 XP and a legendary Diamond, granted by the act of loading.
  ```

**setTimeOfDay uses a DIFFERENT day/night convention than the clock -- they disagree on 50% of the input range, and that is why the dial bug shipped**
- *domain:* Day/night, siege, weather
- *at:* `src/store/useGameStore.jsx:691-695 (`const isDay = frac >= 0.25 && frac < 0.75`) vs src/game/dayNight.js:48-50 (`isDayAtUnit: Math.floor(t / 600) % 2 === 0`)`
- *player impact:* NONE directly (setTimeOfDay is dev/capture-only). The impact is on VALIDATION INTEGRITY: it is the mechanism by which Finding #3 shipped, and it means the 'explore-day' / 'explore-night' visual baselines are pinned to phase states the shipping clock never produces.
- *why:* setTimeOfDay uses a SOLAR convention (day = frac [0.25, 0.75) = gameTime [300, 900)). Everything else -- the ticker's crossedHalfCycle, loadWorldData's isDayAtUnit, dayPhase, the dusk window -- uses a BUCKET convention (day = gameTime [0, 600)). setTimeOfDay is the ONLY bridge the visual-capture harness and 14 probe scripts use to pin a time of day. So every 'day' baseline and every probe frame is captured in a state the real clock cannot reach.
- *executed evidence:*
  ```
  PROBE (real setTimeOfDay logic vs real isDayAtUnit):
    frac  gameTime  setTimeOfDay.isDay  isDayAtUnit  agree?
    0.0      0       false               true        *** DISAGREE ***
    0.1    120       false               true        *** DISAGREE ***
    0.25   300       true                true        ok
    0.5    600       true                false       *** DISAGREE ***   <- 'midday' pin == the NIGHTFALL boundary
    0.6    720       true                false       *** DISAGREE ***
    0.7    840       true                false       *** DISAGREE ***
    0.75   900       false               false       ok
  Consequence, executed: scripts/visual/capture.mjs pins 'day' with setTimeOfDay(0.5) -> gameTime 600 (the exact instant night falls) and 'night' with setTimeOfDay(0.0) -> gameTime 0 (the exact start of day). dayphase-probe.mjs:64-66 does the same and its own comments assert 'gameTime 600, isDay -> sun at top' -- which is why the 90-degree dial error (Finding #3) passed its LOOK probe.
  ```

**`dodge` is the ONLY intent with no keyup handler — it LATCHES while input is inactive and fires an uncommanded dodge-roll the instant play resumes**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate
- *at:* `src/Components.jsx:347-349 (keydown sets dodge) vs src/Components.jsx:387-412 (handleKeyUp has NO ShiftLeft/ShiftRight branch); consumer at src/Components.jsx:881-883`
- *player impact:* Press Shift anywhere the pointer is unlocked — the title menu, the pause/settings panel, or a shift-click to split a stack in the inventory — and the moment you re-enter play you involuntarily dodge-roll. Classic 'I closed my inventory and rolled off the cliff'. It also burns the 0.8s dodge cooldown and the i-frames, so the defensive dodge you needed for the boss's next swing is unavailable. Compounds with Finding 1: alt-tab while holding Shift latches it too.
- *why:* handleKeyUp clears moveF/B/L/R, jump, roar, grab, snare, imbue — every intent EXCEPT dodge. The sole clear is inside useFrame: `if (isLocked && input.dodge) { setIntent('dodge', false); ... }` — gated on isLocked. So while input is inactive (title menu, pause, any open panel) a Shift press latches dodge=true permanently. The verbRouter/keyMap gates structurally cannot catch this: the KEY_MAP 'Shift' row has no `code` field so the anti-lie gate skips it entirely, and even with one, `handlers.includes("'ShiftLeft'")` passes on the keydown alone — a source-grep cannot distinguish keydown from keyup.
- *executed evidence:*
  ```
  Real keys against the real app, reading the live intent singleton:
    === all 8 keys DOWN while inactive ===
    {"moveF":true,"moveL":true,"jump":true,"dodge":true,"roar":true,"grab":true,"snare":true,"imbue":true}
    === all 8 RELEASED while inactive  <-- should be EMPTY ===
    {"dodge":true}          <-- dodge is the ONLY survivor
    === press+release Shift while INACTIVE, then resume play ===
    after Shift press+RELEASE while INACTIVE       {"dodge":true}
    the instant play resumes (pressing NOTHING)    {"active":true,"dodge":true}
  REPRODUCED ACROSS TWO RUNS. Source confirms the missing branch.
  HONEST LIMIT: I could NOT execute-prove the roll actually FIRES — the useFrame consumer does not tick in my headless harness (proof: a Shift press while ACTIVE also left dodge:true, i.e. the consumer never ran; abilityCooldowns.dodge stayed {ready:true,remaining:0}). The LATCH is executed evidence; the resulting roll is a direct read of Components.jsx:881 `if (isLocked && input.dodge) { setIntent('dodge',false); if (!dodge.isActive && cooldownOK) {...roll, i-frames, camera shake, audio...} }`.
  ```

**Panel-stack trap: pressing E twice over an open chest re-locks the pointer while the chest UI is still on screen — the panel becomes unusable and clicks mine terrain through it**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate
- *at:* `src/InputManager.jsx:96-117 (toggleUI) — closes only 6 of the 13 PANEL_FLAGS, but calls requestPointerLockSafely() unconditionally on close`
- *player impact:* Open a chest, press E (muscle memory for inventory), press E again to dismiss it — now the chest UI is on screen but the cursor is gone (pointer-locked), so you cannot click anything in the chest, and your LMB/RMB are mining and placing blocks behind the panel. The only escape is ESC, which nukes every panel. Identical trap with the merchant trading panel (G -> trade -> E -> E).
- *why:* toggleUI closes showInventory/showCrafting/showMagic/showBuildingTools/showSettings/showQuestLog. It does NOT close showChestInterface, showTradingInterface, showAchievements, showSpellUpgrades, showWorldManager, or showCredits — all of which ARE in PANEL_FLAGS (src/ui/panelState.js:12-18). Its close-branch then re-locks the pointer regardless of what is still open. performVerb (Components.jsx:421) gates ONLY on getInput().active, never on anyPanelOpen — so once re-locked, LMB/RMB fire mine/place through the visible panel.
- *executed evidence:*
  ```
  Real keys against the real app, with requestPointerLock/exitPointerLock instrumented:
    chest opened -> showChestInterface: true
    after E #1: {"inv":true,"chest":true,"lock":0,"unlock":1}   <- inventory stacks ON TOP of the chest
    after E #2: {"inv":false,"chest":true,"lock":1,"unlock":1}
    VERDICT: TRAP — pointer RE-LOCKED while the chest panel is still open
  ```

**No `e.repeat` guard: holding a panel key strobes the panel and thrashes pointer-lock, which can kill input entirely**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate
- *at:* `src/InputManager.jsx:58 (handleKeyDown) and src/Components.jsx:337 (handleKeyDown) — neither checks event.repeat`
- *player impact:* Hold E a beat too long (or a sticky/stuck key, or leaning on the keyboard) and the inventory strobes open/closed while the pointer lock is hammered. Chrome rejects the burst re-locks, active flips false, and the player is left with a dead camera and dead controls until they click the canvas again. Applies equally to C, B, M, L, U and Tab.
- *why:* `grep -rn 'e.repeat|event.repeat' src/` returns ZERO hits. OS key auto-repeat begins after ~500ms and fires ~30/s. Every repeat keydown re-runs toggleUI, which calls document.exitPointerLock() on open and requestPointerLockSafely() on close. Chrome rate-limits rapid re-lock and rejects it -> pointerlockerror -> Components.jsx:498 setActive(false) -> input goes dead (the very failure channel KEVIN-FIX C3 was added to catch).
- *executed evidence:*
  ```
  Real app, instrumented lock/unlock counters, 6 OS-style auto-repeat keydowns of E (repeat:true) + one keyup:
    6 auto-repeat keydowns of E -> {"inv":false,"lock":3,"unlock":3}
    VERDICT: STROBE — 3 exitPointerLock + 3 requestPointerLock from ONE held key
  ```

**The boss's unique legendary drop is unequippable, statless trash**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/world/bossSystem.js:99-100 (grants 'Crown of the Dragon King' + 'Dragon Scale' x3); src/game/equipment.js:5-11 (SLOT_ITEMS omits both); src/store/useGameStore.jsx:16-39 (EQUIPMENT_STATS omits both)`
- *player impact:* The player beats the final boss and receives a shimmering legendary Crown that does absolutely nothing: it cannot be worn, grants no stats, cannot be crafted with, cannot be sold. Clicking it in the inventory tries to select it as a placeable building block. The single biggest reward in the game is a no-op. (For contrast, the plain 'Golden Crown' — craftable from gold — IS equippable for +10 INT / +5 armor, so the boss's legendary is strictly worse than a mid-game craft.)
- *why:* Killing the Shadow Dragon — the game's climactic fight, worth 600 XP with a slow-mo hitstop, a bloom spike, a victory stinger and a persisted win-state latch — grants a LEGENDARY 'Crown of the Dragon King' and 3 epic 'Dragon Scale'. Both are registered in data/items.js with the right rarity, so they render with a gorgeous legendary-gold tile and a tall bright drop-beam. Neither appears in equipment.js SLOT_ITEMS, so getItemSlot() returns null and the Inventory panel's `isEquip` check is false — clicking it calls setSelectedBlock() and tries to make it a placeable BLOCK. Neither appears in EQUIPMENT_STATS, so even a forced equip grants nothing. Neither is a recipe ingredient (checked all 26 recipes) nor a trade cost. tests/store/bossReward.test.js is green — it asserts ONLY that the two items are 'a registered legendary'/'a registered epic', i.e. it validates the rarity STRING and never once asks whether the reward is usable. Note the two other hand-written maps (SLOT_ITEMS <-> EQUIPMENT_STATS) ARE perfectly aligned across all 18 real gear items — the drift is specifically that the boss reward was added to the item registry and to nothing else.
- *executed evidence:*
  ```
  EXECUTED cross-map drift probe (vite-node, importing the REAL equipment.js / useGameStore.jsx / items.js / recipes.js):
    === A. EQUIPMENT_STATS entries with NO slot ===
       (none — aligned)
    === B. Has a SLOT but NO stats (equipping does nothing) ===
       (none — aligned)
    === C. Items that LOOK like gear but are UNEQUIPPABLE (slot=null) ===
       !! Shield Scroll              rarity=rare      slot=null stats=NONE   <- actually a consumable, OK
       !! Crown of the Dragon King   rarity=legendary slot=null stats=NONE
       !! Dragon Scale               rarity=epic      slot=null stats=NONE
    === D. BOSS DROPS — what the player actually gets ===
       Crown of the Dragon King   slot=null   stats=null   weaponDmg=5
       Dragon Scale               slot=null   stats=null   weaponDmg=5
    === E. Every recipe output: is it usable? ===
       (checked 26 recipes — no craftable gear lacks stats)
  ```

**The entire affix system is dead code — zero importers outside its own test**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/game/affixes.js (whole file, 51 LOC)`
- *player impact:* There are no affixes in the game. Loot is flat: every 'Iron Sword' is identical to every other 'Iron Sword'. The item-depth pillar the module was written for does not exist for the player. No crash, no corruption — just an absent feature that the test suite makes look present.
- *why:* AFFIX_POOL, rollAffixes() and foldAffixStats() are imported by exactly one file: src/game/affixes.test.js. No loot roll attaches affixes to a drop; no equipment fold merges affix stats into effectiveWith(); the store contains zero occurrences of the string 'affix'. Items therefore have no affixes and never will at runtime. To be fair and precise: the module's own header openly says this is deferred ('the store fold across the 7 effectiveWith call sites is deferred with the loot-integration pass; it is a dormant no-op until items actually carry affixes'). So this is ADVERTISED-BUT-UNBUILT, not a regression. The reason it still matters for this audit: affixes.js carries a full 45-line behavioral test suite that executes and passes, which makes the domain look covered. In a coverage roll-up, 3 of my 38 features are 'BEHAVIORAL' on code that can never run in the game. That is a coverage number inflating on dead weight.
- *executed evidence:*
  ```
  grep -rn "rollAffixes|foldAffixStats|AFFIX_POOL|affixes" src tests scripts
    -> every single hit is inside src/game/affixes.js or src/game/affixes.test.js. Zero others.
    -> grep for 'affix' in src/store/useGameStore.jsx: zero hits.
  The pure functions themselves execute correctly when driven directly (rollAffixes is deterministic + unique + clamped, foldAffixStats stacks duplicates) — the code is fine, it is simply never called.
  ```

**Mobs attack THROUGH solid terrain — there is no line-of-sight gate anywhere on the attack path.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/workers/ai.worker.js:265-273 (melee) and :251-254 (archery) — neither calls `hasLineOfSight`; the function (defined at :97) is used ONLY by the cover-seek branch at :202`
- *player impact:* Sealing yourself behind a block wall — the second-most fundamental voxel defensive verb after pillaring — does nothing. Combined with the 2D bug (finding 1), there is no terrain-based way to break contact with a mob at all.
- *why:* The worker HAS a working LOS routine and a heightGrid — it just never consults them before striking. Same for arrows: stepEnemyProjectiles (src/game/enemyProjectiles.js:12) does a player-distance check and a TTL only; it never tests terrain, so arrows pass through walls too.
- *executed evidence:*
  ```
  Real worker, 30-block-tall wall column placed between the mob and the player (heightGrid gx=5 -> world x=1; mob at x=0, player at x=2):
    melee hits landed = 2   <-- HITS THROUGH THE WALL
  And the LOS routine itself works when you actually call it (control): `hasLineOfSight(wall, 4,4, 4,8)` with a wall at (4,6) returns false. It is simply not wired to the attack path.
  ```

**Infinite free full-heal + full-mana at the healer NPC: no cooldown, no cost, no gate.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/InputManager.jsx:199-203 (KeyG, `role === 'healer'` branch) -> src/store/useGameStore.jsx:789-799 (healPlayer / restoreMana)`
- *player impact:* Stand next to Sister Wren and hold G: infinite HP and infinite mana. The hunger/health survival loop, the mana economy, and the night siege are all neutralised anywhere within 4 units of the healer. A player who finds this (it takes one accidental double-tap) has no reason to ever engage with the survival systems near the hub.
- *why:* The branch is literally `state.healPlayer?.(state.maxHealth || 100); state.restoreMana?.(state.maxMana || 100);` with an addNotification. Neither store action carries a cooldown, a cost, a charge counter or a timestamp — `grep` for cooldown/Date.now/performance.now/lastHeal/cost/coins around the branch returns nothing.
- *executed evidence:*
  ```
  Executed the store actions VERBATIM from useGameStore.jsx:789-799 driven by the verbatim InputManager KeyG healer branch, over a real zustand vanilla store:
    hp/mana before      : 12 / 3
    after 1x G          : 100 / 100
    drain, G again (0ms): 100 / 100   <-- NO COOLDOWN, NO COST
    after 10,000 G press: 100 / 100   (unbounded)
  ```

**Cover-seeking reads the WRONG grid cells whenever the player is more than ~4 units away — the LOS call passes unclamped coordinates and the index silently wraps.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/workers/ai.worker.js:185-186 (`relPlayerX/relPlayerZ` computed, NOT clamped) then :202 (`hasLineOfSight(heightGrid, cx, cz, relPlayerX, relPlayerZ)`); contrast :302-303 where the main A* path DOES clamp with `Math.max(0, Math.min(8, ...))``
- *player impact:* A wounded mob's retreat picks a semi-random cell instead of the one that actually breaks your line of sight — it may duck into the open, or fail to use the cover that is right there. Reads as flaky/dumb AI rather than a bug, which is why it has survived.
- *why:* hasLineOfSight indexes `idx = px + pz * 9` with no bounds check. A relPlayer of (14,4) — which happens for any player 10 units away, well inside the 20u aggro range — reads heightGrid[50], i.e. grid cell (5,5): a completely unrelated column. The A* path-steering branch remembered to clamp; the cover branch did not.
- *executed evidence:*
  ```
  Called the REAL `hasLineOfSight` extracted from the worker:
    relPlayer = 14 4  (grid is 0..8 — OUT OF RANGE)
    endH = heightGrid[50] = 10     <-- reads cell (5,5), not the player
    wrap demo on a grid where grid[i]=i:  px=12,pz=3 -> idx 39 => silently reads cell (x=3,z=4), value 39
  Observable behaviour is only partly degraded — I drove the full worker and a wounded zombie still hides behind a real wall (isCoverSeeking=true, steers away from the player), and correctly finds NO cover on flat ground (control: isCoverSeeking=false at every distance). So the wrap corrupts WHICH cover cell is chosen, not whether cover-seeking fires at all.
  ```

**The spider's signature LEAP deals zero damage, applies no vertical impulse, and costs it a full attack cooldown — the 'fast aggressive leaper' is the second-weakest hostile.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/systems/AIWorkerSystem.jsx:41-52 (the `attack.type === 'leap'` branch sets `entity.knockback` and returns — it never calls `damagePlayer`) vs src/workers/ai.worker.js:261 (`pendingAttack = { id, type: 'leap', damage: 8, ... }`)`
- *player impact:* The spider is the fastest hostile (speed 3.0) and telegraphs a dramatic leap, but the leap is a visual no-op and actively lowers its DPS below the slower zombie. The mob's whole identity — the scary pounce — doesn't land.
- *why:* The worker stages a leap with `damage: 8`, then stamps `lastAttackTime = now` when it fires (ai.worker.js:283), blocking melee for 1500ms. The bridge then DISCARDS the damage. Worse, the knockback vector is `[dx/mag*15, 8, dz/mag*15]` — but the knockback loop (AIWorkerSystem.jsx:145-149) only reads `knockback[0]` and `knockback[2]`, so the `8` vertical boost is dead, and `delta*4` at render rate makes it a ~1-unit horizontal nudge.
- *executed evidence:*
  ```
  Real worker, 300 ticks (20s) at 15Hz with each hostile pinned 2.0u from a stationary player. `melee` is the only attack type the bridge converts into `damagePlayer`:
    type          reg.dmg  hits/20s  attackTypes            DAMAGE DEALT  DPS
    zombie            10       11  {"melee":11}                   110  5.50
    skeleton          15        8  {"projectile":8}                 0  0.00
    spider             8       11  {"leap":1,"melee":10}           80  4.00
    skitterling        5       11  {"melee":11}                    55  2.75
    duskhound         12       11  {"melee":11}                   132  6.60
    moss_brute        25       11  {"melee":11}                   275  13.75
    emberhusk         13       11  {"melee":11}                   143  7.15
  The spider burns one of its 11 attack windows on a 0-damage leap.
  ```

**refundUnknownTalents validates the talent ID but never the RANK — an over-limit rank loads unchanged (armor 300 vs legal 18; maxHealth 750 vs legal 195 at level 1)**
- *domain:* Progression
- *at:* `src/game/talentTree.js:80-88 (refundUnknownTalents); src/store/useGameStore.jsx:872 (the only load-time talent sanitizer)`
- *player impact:* Today: a trivial localStorage edit yields armor 300 (75% damage reduction vs the intended 15%) and 750 HP at level 1 — self-inflicted only, since Crafty is single-player local-first. The real bite is forward: the first time you rebalance a talent's limit downward, every existing save keeps its over-cap ranks and those players stay permanently stronger than the new cap allows, with no refund and no way to notice.
- *why:* spendTalentPoint (useGameStore.jsx:474-478) rigorously enforces TALENT_LIMITS on the way IN, so the rank<=limit invariant is real and intentional. But the load path's only sanitizer, refundUnknownTalents, checks `if (NODE_BY_ID[id])` — the KEY — and then copies the VALUE through verbatim. This is the classic validate-the-key-trust-the-value hole, and it sits in the exact function whose stated job is forward-compat migration. Any future balance patch that REDUCES a node's limit (e.g. voidhand_ward 3->2) leaves every existing save's rank-3 in place, silently over-cap, forever. Negative ranks also pass through (they fold to 0, so they're a dead point-sink rather than a stat gain).
- *executed evidence:*
  ```
  I TALENT_LIMITS.voidhand_ward = 3 (+6 armor/rank)
  I refundUnknownTalents({voidhand_ward:50}) -> {"unlockedTalents":{"voidhand_ward":50},"talentPoints":0}
  I folded armor = 300   (limit*6 = 18 is the legal max)
  J (through the REAL store.loadWorldData with {voidhand_ward:50, wildheart_vigor:40}):
  J unlockedTalents after load = {"voidhand_ward":50,"wildheart_vigor":40}
  J effective = {"strength":130,"agility":10,"intellect":10,"armor":300,"attributePoints":0}
  J maxHealth = 750   (legal max at L1 with 3 ranks of vigor = 195)
  K refund({voidhand_ward:-5}, tp=3) -> {"unlockedTalents":{"voidhand_ward":-5},"talentPoints":3}  (negative rank kept; folds to 0)
  ```

**Spell Mastery rank pips are INVISIBLE for Fireball/Iceball/Lightning — Tailwind never compiles the dynamically-built bg-spell-* classes**
- *domain:* Progression
- *at:* `src/ui/SpellUpgradePanel.jsx:208 (`l < lvl ? `bg-spell-${elem}` : 'bg-track'`); tailwind.config.cjs:14-20 (safelist has only text-spell-*, no bg-spell-*)`
- *player impact:* In the Progression panel, 3 of the 4 spells show three identical grey dots no matter what rank you are — the at-a-glance rank indicator is dead. Arcane's works. The player sees an inconsistent, broken-looking UI and has to read the small 'LEVEL n/3' text to know their rank.
- *why:* Tailwind's JIT scans source text for COMPLETE class strings. `bg-spell-${elem}` is assembled at runtime, so `bg-spell-fire`, `bg-spell-ice` and `bg-spell-lightning` never appear as literals anywhere in src/ and are absent from the safelist (which lists only the text-spell-* variants). Those classes are therefore never emitted, and the 'filled' rank pip renders with no background — visually identical to an empty `bg-track` pip. `bg-spell-arcane` survives ONLY by accident: it happens to appear as a literal in talentTree.js:44 as the Elemancer tree's dot color. The talent-tree pips are all fine for the same reason (bg-stat-atk/spd/def are literals). I found this by LOOKING at tests/visual/baseline/progression-open.png — the Arcane row's first pip is visibly lighter than Fireball/Iceball/Lightning's — then confirmed it deterministically by compiling the real CSS. The visual gate has this exact frame pinned as a baseline and rubber-stamps the broken state; spell-mastery-ui-gates.test.js only regexes the source and never renders.
- *executed evidence:*
  ```
  Compiled the REAL stylesheet: `npx tailwindcss -c tailwind.config.cjs -i src/index.css -o out.css --minify` (Done in 916ms), then grepped the output:
    PRESENT  .text-spell-fire
    PRESENT  .text-spell-ice
    PRESENT  .text-spell-lightning
    PRESENT  .text-spell-arcane
    MISSING  .bg-spell-fire        <-- renders as NO background
    MISSING  .bg-spell-ice         <-- renders as NO background
    MISSING  .bg-spell-lightning   <-- renders as NO background
    PRESENT  .bg-spell-arcane      <-- only because talentTree.js:44 has it as a literal
  Control (talent-tree dots, all literals): PRESENT .bg-stat-atk / .bg-stat-spd / .bg-stat-def / .bg-track
  Corroborated visually in tests/visual/baseline/progression-open.png: Arcane's leading pip is tinted; Fireball/Iceball/Lightning's are not.
  ```

**A spell upgrade never schedules an autosave, and the tab-close flush is a no-op — upgrade then quit and the upgrade is gone**
- *domain:* Progression
- *at:* `src/App.jsx:233-248 (autosave transition-key predicate omits spellLevels AND attributes); src/game/autosave.js:8 (`flush() { if (timer !== null) ... }`)`
- *player impact:* Open the pause menu, spend your level-gated Fireball upgrades, close the tab -> reopen and you are back at Fireball I. Recoverable (upgrades are free, level-gated, so you just re-click), but it reads as the game eating your progress. In practice an active player usually trips inventory/worldBlocks within 5s and gets saved by luck — which is exactly why this is intermittent and never reproduced.
- *why:* The autosave subscriber only calls schedule() when one of level/equipment/chests/talentPoints/gameMode/worldBlocks/inventory/questState/the-4-banks changes by identity. `spellLevels` is not in that list — and neither is `attributes` (so allocateAttribute is in the same boat; talentPoints IS listed, so spendTalentPoint is safe). createAutosave.flush() then only writes if a save is already PENDING, so beforeunload/visibilitychange rescues nothing. Net: upgrading a spell mutates state that nothing watches and nothing flushes.
- *executed evidence:*
  ```
  Drove the REAL upgradeSpell through the REAL App.jsx predicate (copied verbatim) and the REAL createAutosave:
    F spellLevels after upgrade   : {"fireball":2,"iceball":1,"lightning":1,"arcane":1}
    F autosave predicate tripped? : false   <-- NO SAVE IS EVER SCHEDULED
    G flush() with no pending save -> save() called 0 times
    G schedule() then flush()      -> save() called 1 times   (control: the mechanism works when armed)
    H full player story — upgrade Fireball I->II->III, then close the tab:
    H hook says fireball dmg = 120 (L3)
    H saves written to disk  = 0   <-- the upgrade NEVER hit disk
  ```

**A corrupt/legacy save with a null in questState.quests white-screens the quest HUD — the guard that exists to prevent this does not check elements**
- *domain:* Quests + achievements
- *at:* `src/QuestSystem.jsx:92 (`const _arrOr = (v, fb) => (Array.isArray(v) ? v : fb);`) — its own comment (lines 90-91) promises to 'coerce to safe shapes so a bad save can't crash the quest system on load'. It validates the CONTAINER, never the ELEMENTS. Crash site: src/QuestSystem.jsx:464 (`{quest.icon && <Icon .../>}`).`
- *player impact:* Not reachable from clean play — needs a corrupt / hand-edited / older-format localStorage save. When it happens the quest tracker throws during render (white screen or ErrorBoundary fallback) and the player cannot recover without clearing storage.
- *why:* The guard is load-bearing by design (persisted questState comes from localStorage and may be tampered/version-mismatched) and it does not do the job it documents. reduceClaim guards its elements (`quests.find((q) => q && ...)`); the RENDER does not.
- *executed evidence:*
  ```
  PROBE 3/S2: seeded questState {quests: [null, null, 5]} -> printed 'S2 ... -> quests = [null,null,5]' — straight through the guard into the live feed. PROBE 6/R1 (touchDevice mocked to force the DESKTOP/expanded tracker, since jsdom self-reports as touch and collapses the body): QuestTracker with quests=[null] -> 'TypeError: Cannot read properties of null (reading \'icon\')'. Sanity control in the same file, PROBE 6/R0, renders a valid row fine (body = ' QuestsHunterDefeat 5 mobs2/5'), so the map path is genuinely exercised and the crash is real, not a false negative.
  ```

**Loading a versionless / legacy / fresh blob silently inherits the CURRENT character; SAVE_VERSION is written but never read**
- *domain:* Save / load / persistence / migration
- *at:* `src/game/saveSchema.js:9 (SAVE_VERSION = 2) and :61-68 (migrateSaveData does no version dispatch at all) + src/store/useGameStore.jsx:862-883 (`prog?.level ?? state.level` etc. for every progression key)`
- *player impact:* Loading an older save gives a character that is a hybrid of the save and whatever you were just playing — wrong level, wrong coins, ghost chests from another world, quest progress from another run. Silently wrong rather than visibly broken, so it reads as 'the game is buggy'.
- *why:* The header calls migrateSaveData 'a version-gated migration seam', but it never inspects saveData.version — it only normalizes inventory keys. A v1 (pre-progression) save, a WorldManager freshBlob, or a FUTURE v3 save all load blindly, and every missing key silently falls back to whatever the live store currently holds. That means 'load an old save' quietly grafts your current level/coins/talents/chests/quests onto it rather than restoring or rejecting. Any future schema change has no seam to hook, and no way to refuse an unreadable blob.
- *executed evidence:*
  ```
  probe1 P6: 'SAVE_VERSION = 2'; 'migrateSaveData(v99) returned version = 99 (no rejection)'; 'loaded a v99 save blindly -> level = 3 coins = 7'; 'loaded a VERSIONLESS (v1) save -> level = 8 (kept 8: silently inherits the CURRENT character)'. probe1 P3 shows the same inheritance for the WorldManager fresh blob (level 12 / coins 4321 / chests / questState all carried over).
  ```

**Save failure is completely silent — quota exhaustion or Safari Private Mode means the game never saves and never says so**
- *domain:* Save / load / persistence / migration
- *at:* `src/store/useGameStore.jsx:972 (ignores writeWorld's boolean return) + src/game/worldSaves.js:11-13 (safeGet/safeSet swallow every throw) + :29-38 (writeWorld returns false on a failed write)`
- *player impact:* iPad/iPhone players in Private Browsing (or with a full origin quota) play a whole session that is never saved, with zero indication. They close the tab and everything is gone.
- *why:* worldSaves.js deliberately returns false on a blocked/full localStorage — and saveActiveWorld throws that signal away, returning undefined. In Safari Private Browsing (and under iOS storage pressure / a full quota) EVERY setItem throws, so the game silently never persists anything for the entire session and the player gets no warning, no toast, no console error. writeWorld's blob-first-then-index ordering is good defensive design that nothing upstream honours.
- *executed evidence:*
  ```
  probe2 P10 (real store; Storage.prototype.setItem monkeypatched to throw QuotaExceededError): 'saveActiveWorld under a FULL localStorage: returned no-throw; setItem attempts swallowed = 2; worlds in index = 0; active id = null; -> the save silently did nothing; saveActiveWorld returns undefined'. Same probe measured the real blob size so the quota risk is quantified, not guessed: '20,000 player-edited blocks -> blob = 305737 bytes (0.29 MB); blocks affordable at a ~5MB quota ~= 342,966' — so ordinary building will not hit quota, but private mode / storage pressure will.
  ```

**loadWorldData has no shape validation: a malformed blob either throws a TypeError or writes garbage straight into the store**
- *domain:* Save / load / persistence / migration
- *at:* `src/store/useGameStore.jsx:843-951 (no guards on saveData or any of its slices)`
- *player impact:* A single corrupted byte in localStorage yields either a dead 'Failed to load world' with no repair path, or a booted game with a broken hotbar / absurd health bar / a player teleported to a non-position. Low frequency, but unrecoverable when it happens.
- *why:* The blob is read from localStorage — user-writable and corruptible — yet loadWorldData validates nothing. Half the malformed shapes throw (caught by WorldManager's try/catch -> 'Failed to load world', which is at least safe); the other half are accepted and poison the store with non-numeric/non-object state that the HUD and stat math then consume. QuestSystem.jsx:92-93 already has exactly the right pattern (`_arrOr`/`_objOr` coercers) — loadWorldData needs the same, plus a version check.
- *executed evidence:*
  ```
  probe2 P7 (real store, each shape fed to the real loadWorldData):
    THROWS: loadWorldData(null) / (undefined) -> TypeError reading 'world_data'; blocks='notanarray' and blocks=[1,2,3] -> 'Iterator value n is not an entry object'; chests=5 and chests={a:1} -> 'number 5 is not iterable'.
    SILENTLY ACCEPTED (worse): inventory=5 -> '-> inventory is now: 5'; level="999" -> '-> level = "999"  maxHealth = 10080'; level=-5 -> accepted; coins=Infinity -> '-> coins = Infinity' (which JSON.stringify then persists as null on the next save); position="hax" -> '-> playerPosition = "hax"'.
  ```

**Fireball's burn DoT shakes the camera and hitstops the player once per second, for free**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:39-53 (applyBurnEffect) -> src/systems/CombatSystem.jsx:38-42 (hitstop) + :59-61 (camera shake)`
- *player impact:* This is the most FELT bug in the domain. Cast one fireball and for the next 4 seconds your camera jolts and your movement stutters once a second with no input. Set five mobs on fire and you get continuous camera judder plus a movement clamp you cannot escape while you try to kite. It reads as the game being broken.
- *why:* applyBurnEffect calls `GameMethods.damageMob(mobId, dps, 'fireball')` with only 3 args, so `source` defaults to 'player' and `spawnRing` to true. damageMob therefore treats every burn tick as a fresh player swing: it writes `hitstopUntil` (which the player movement loop reads to clamp motion toward zero) and fires `triggerCameraShake(1.0)`, plus a shockwave ring, a GPU spark burst and a damage number. Same defect class in applyChainLightning (line 69): each chained mob gets a full-strength hitstop + shake, so a 3-chain fires 4 shakes in one frame. Burn coverage: NONE.
- *executed evidence:*
  ```
  PROBE P15 (magic2.probe.test.jsx, real system, fake timers; after the direct hit the player does NOTHING):
    ### P15 on the direct hit: cameraShakes = 2 | hitstop writes = 1
    ### P15 after 5s of BURN ticks (player did NOTHING): +cameraShakes = 4 | +hitstop writes = 4
    ### P15 shake magnitudes = [1.6,0.4,1,1,1,1]
  (P5 separately confirms the burn itself is correct: exactly 4 ticks of 8 damage = 32, matching the spell's duration:4 / damagePerSecond:8.)
  ```

**Corpses eat your spells for 320ms after a kill**
- *domain:* Spells / magic
- *at:* `src/systems/CombatSystem.jsx:160-168 (checkMobCollision has no health filter) + :144 (`entity.dyingUntil = now + DEATH_DISSOLVE_MS`, deathFx.js:7 = 320ms)`
- *player impact:* The instant you kill something, the next ~1/3 second of spells is absorbed by the invisible dissolving body. In a pack you lose a cast and the live enemy standing right behind takes nothing -- plus you get a full kill-strength camera shake and a floating damage number on a corpse.
- *why:* CombatSystem defers ECS removal behind a 320ms dissolve so a kill has weight, but checkMobCollision has no `health > 0` filter -- the dissolving corpse is still a valid spell target. The projectile is consumed on it, damageMob drives its health further negative, `hitEntity.health <= 0` sets wasKill=true so the impact fires the beefed-up KILL camera shake (0.8 not 0.4) and 1.8x sparks, and a damage number pops over a dead body. Note MinimapSyncSystem DOES filter `health > 0` -- so chain-lightning targeting is correctly corpse-free, but the direct projectile hit is not. Coverage: NONE.
- *executed evidence:*
  ```
  PROBE P3 (magic.probe.test.jsx, real system). Mob 1 at z=-8, mob 2 (LIVE) at z=-14. Kill mob 1 via the production damageMob path, then cast a fireball straight down the same line:
    ### P3 corpse: health = -4000 | dyingUntil set = true | STILL in mobsQuery = true
    ### P3 fireball damageMob calls = [{"id":1,"dmg":60,"type":"fireball"}]
    ### P3 corpse health = -4060 | LIVE mob health = 1000 (1000 => the corpse ate the shot)
  ```

**Chain lightning targets a 250ms-stale MINIMAP snapshot, not the live ECS**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:58 (`const allMobs = useGameStore.getState().mobEntities`) <- written by src/systems/MinimapSyncSystem.jsx:13 (`if (now - _lastMinimapUpdate > 250)`)`
- *player impact:* Chain lightning unpredictably skips enemies standing right next to the one you hit -- it looks like the mechanic is randomly broken. Bolts visibly fly to empty air where a mob used to be.
- *why:* mobEntities is a throttled ECS->store mirror built for the RadialMinimap, refreshed only every 250ms. Chain lightning is the only combat system that targets off it (everything else reads mobsQuery live). Consequences: (a) mob positions used for the range test are up to 250ms stale -- a skitterling at 3.8 u/s drifts ~0.95u in that window; (b) a mob that spawned in the last 250ms is not in the array at all and is invisible to the chain; (c) the chain ARC VFX endpoints come from the same stale `h.position`, so bolts are drawn to where the mob WAS. The pure solveChainTargets has good behavioral tests -- but nothing tests what it is FED.
- *executed evidence:*
  ```
  PROBE P8 (real system). Mob B is physically 4u from the impact, well inside the 8u chainRange, but its snapshot entry still says 30u out:
    ### P8 stale-snapshot chain calls = [{"id":1,"dmg":90,"type":"lightning"}]
    ### P8 B (actually 4u away, in range) health = 1000 (1000 = chain MISSED a mob that is right there)
  PROBE P9. Mob B is 3u away but not yet in the snapshot (spawned <250ms ago):
    ### P9 calls = [{"id":1,"dmg":90,"type":"lightning"}] | B.health = 1000
  ```

**Spell secondaries do NOTHING to the boss -- the climax fight has zero elemental depth**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:396-416 (the boss branch calls store.damageBoss and returns; it never runs the `spellConfig.secondary` switch)`
- *player impact:* In the game's climax fight the four spells collapse into four different damage numbers -- no burn, no slow, no chain, and critically no lifesteal, which is the player's only spell-based sustain and is dead exactly when it is needed most. Every elemental choice you made in the upgrade tree stops mattering at the boss.
- *why:* The `secondary` dispatch (burn / freeze / chain / pierce+lifesteal) lives only inside the `checkMobCollision` branch. The boss is a separate entity checked afterwards with a plain distance test, and its branch applies raw damage only. Boss collision + secondaries-vs-boss: NONE coverage.
- *executed evidence:*
  ```
  PROBE P16 (magic2.probe.test.jsx, real system, boss active at (0,140,-20), all four spells cast in turn, damageBoss and healPlayer instrumented):
    ### P16 fireball:  damageBoss=[108] | lifesteal so far = 0
    ### P16 iceball:   damageBoss=[48]  | lifesteal so far = 0
    ### P16 lightning: damageBoss=[90]  | lifesteal so far = 0
    ### P16 arcane:    damageBoss=[72]  | lifesteal so far = 0
    ### P16 => the boss takes ONE flat hit per spell; NO burn DoT, NO chain, NO freeze, lifesteal healed = 0
  ```

**The Voidhand phantom (and the hurled projectile) is a featureless BEIGE blob for cobblestone, diamond and glass**
- *domain:* The four Aspects
- *at:* `src/game/voidhand.js:26-36 (PHANTOM_BLOCK_COLORS, covers ids 1-9 only) vs src/world/blockIds.js (id space now runs to 15); consumed at src/Components.jsx:637 and passed to requestHurl at :645`
- *player impact:* You build your base out of cobblestone (the archetypal building block), grab a piece of your own wall, and orbit + hurl a featureless beige cube — not grey stone. Same for a diamond block and for glass. PhantomBlockSystem.jsx:57 states the tint exists so "the 'WHAT am I holding' identity survives night siege lighting" — that identity fails for exactly the blocks a player invests the most in.
- *why:* PHANTOM_BLOCK_COLORS is a SECOND hand-written id->colour table, written when the voxel id space stopped at 9. The canonical table has since grown to 15 (coal/iron/gold/diamond/cobblestone/glass = 10-15). Anything >= 10 falls through `PHANTOM_BLOCK_COLORS[known] || '#A9966E'` to the placeholder. This is precisely the two-drifting-id-maps class that produced today's diamond->stone bug. The module's own comment still asserts "placeable space is {1,2,3,4,6,7}" — stale.
- *executed evidence:*
  ```
  PROBE on the REAL blockIds.js + Blocks.js + voidhand.js, cross-joining HOTBAR_BLOCKS against both tables: `glass | id 15 | real #F0F8FF | PHANTOM undefined | *** BEIGE FALLBACK ***`; `diamond | id 13 | real #4FD0E7 | PHANTOM undefined | *** BEIGE FALLBACK ***`; `cobblestone | id 14 | real #7F7F7F | PHANTOM undefined | *** BEIGE FALLBACK ***`. 3 of the 9 hotbar-placeable blocks. Separately: id 8 is now `cactus` but is tinted '#7A5A38' (tree-trunk brown) — a stale mislabel.
  ```

**Element zones are infinite vertical cylinders — they burn, slow and annihilate through solid floors**
- *domain:* The four Aspects
- *at:* `src/game/elementZones.js:25 (`const d2 = (a,b) => (a.x-b.x)**2 + (a.z-b.z)**2` — Y dropped) and :103-126 (applyZoneEffects uses the same x/z-only test)`
- *player impact:* Exploit: cast one burning zone at the foot of your tower and everything climbing or standing anywhere above it burns, through stone, for free. Frustration: the fire zone you paid 30 Resonance for on the roof silently vanishes because you laid an ice zone in the mine below — no sound, no particle, no zone, no refund. The player has no way to understand what happened.
- *why:* Every zone predicate — annihilation, dedupe, amplification, burn DoT, frozen slow, shock, resonant lure — tests horizontal distance only. In a voxel game built on verticality this makes every zone an unbounded column.
- *executed evidence:*
  ```
  PROBE 4 (real applyZoneEffects): a burning zone at y=0 emits damage events for mobs at y=+30 and y=-25 — `[{"id":"ground"...},{"id":"onRoof"...},{"id":"inCellar"...}]`. PROBE 5: a frozen zone at y=0 sets zoneSlowMult=0.4 on a mob at y=+50. PROBE 2 (real spawnZone): a fire cast 80 blocks ABOVE a basement ice zone returns `null` and leaves `zones: 0` — both annihilated through the floor. Compounding (read from real code): ElementZoneSystem.jsx:51 guards the SFX on `if (z && ...)`, so an annihilation is silent — and `grep -ri steam src/` finds no steam VFX anywhere (the code comment at ElementZoneSystem.jsx:49 concedes "an annihilation stays silent steam in v1").
  ```

**1 of the 4 fusion hybrids is unreachable dead content; 25 of the 28 squads a player can assemble cannot fuse at all**
- *domain:* The four Aspects
- *at:* `src/game/hybrids.js:36 (`'cow+skeleton': 'bonehide_bulwark'`) vs src/Components.jsx:684 (snare filter rejects `e.passive`) and src/game/mobTypes.js:8 (`cow: { ... passive: true }`)`
- *player impact:* FUSE is the 50-Soul capstone the guide advertises ("Stand TWO bound creatures together and hold X to FUSE them into a hybrid"). For 25 of the 28 squads a player can actually build, holding X next to their two allies does absolutely nothing — canStartFuse is false so decideFuse never even starts a channel, giving zero feedback (no error, no denied reason, no tether). And the tank hybrid can never be obtained by any means.
- *why:* Bonehide Bulwark — 240 HP, the roster's ONLY bruiser/tank — is keyed on the pair cow+skeleton. A mob can only become an ally via the snare, and the snare filter skips any mob with `passive: true`. Cows are passive. The recipe can therefore never fire. The reachability of a curated lookup table across a module boundary is exactly what no single unit test can see: hybrids.test.js (7 tests) proves lookupHybrid/applyFusion work; it never asks whether the keys are obtainable.
- *executed evidence:*
  ```
  PROBE 11, importing the REAL hybrids.js + mobTypes.js and enumerating every assemblable ally pair: `SNAREABLE: zombie, skeleton, spider, skitterling, duskhound, moss_brute, emberhusk` / `NEVER snareable (passive): pig, cow, villager` / `assemblable pairs: 28 | pairs that FUSE: 3 | pairs that do NOTHING: 25` / `bonehide_bulwark  role=bruiser  hp=240  *** UNREACHABLE — DEAD CONTENT ***` (dreadweaver, grimhound, marrowspinner are reachable).
  ```

**Squad allies are immortal — the Soulbind squad is a permanent, risk-free 16 DPS buff**
- *domain:* The four Aspects
- *at:* `src/systems/CombatSystem.jsx:23 (`damageMob` = `mobsQuery.entities.find(e => e.id === id)`); src/game/allegiance.js:15-16 (the isMob -> isAlly component swap)`
- *player impact:* Pay 35 Soul once, and you own two (or three, with the pack talent) permanently-invulnerable bots that auto-engage every hostile within 18m and cannot be lost, ever. The night siege — the core loop — is substantially defused, and the Aspect's entire stated tension ("bank on the many, bind the one"; "it heels and fights beside you") has no stakes because attrition does not exist.
- *why:* Binding removes `isMob` and adds `isAlly`, so the entity atomically exits mobsQuery. damageMob resolves its target ONLY from mobsQuery, so after a bind no id lookup can ever reach the ally — `if (!entity) return null;`. Nothing else in src/ reduces ally health. HONESTY: this is a DOCUMENTED v1 deferral, not an accidental defect — docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md:104 lists "hostiles-target-allies, mob-vs-mob, ally HP/retreat" as the named v2 scope. I report it because the balance consequence is live and player-visible today, not because the code is unaware of it.
- *executed evidence:*
  ```
  PROBE 18, driving the REAL ecs/world.js + allegiance.js: before bind `in mobsQuery = true`; after bind `in mobsQuery = false | in alliesQuery = true`; then `mobsQuery.entities.find(e => e.id === 1)` -> `undefined => 'if (!entity) return null;' NO-OP`. PROBE 19 (real stepSquad): ALLY_DPS_HIT=12 per ATTACK_COOLDOWN_SEC=1.5s each => 2 allies = 16.0 DPS, forever. Corroborating read: nametagData.js:19 hardcodes `hpFrac: 1, showBar: false` for allies — the HP field is already decorative.
  ```

**Wildheart's 4 beast forms have ZERO visual validation — and 4 orphaned PNGs manufacture the illusion that they do**
- *domain:* The four Aspects
- *at:* `tests/visual/baseline/beast-{fire,ice,lightning,arcane}.png; tests/visual/diff.test.js:22 (the STATES array)`
- *player impact:* No gate can catch a regression that makes the beast avatar render nothing, render the wrong element, or render the wrong mass-shape — the transform would ship as an invisible no-op and the visual suite would stay green. Meanwhile a reviewer scanning tests/visual/baseline/ sees four confidently-named beast PNGs and concludes the feature is pinned.
- *why:* The 4 distinct beast mass-shapes (comet/bull/hawk/golem — beasts.js calls them the deliberate content-variety payload of the Aspect) are Wildheart's marquee visual. Nothing verifies any of them renders.
- *executed evidence:*
  ```
  I READ the PNGs with my own eyes: beast-fire.png and beast-ice.png are the SAME snow-capped mountain against an orange sky. No beast, no avatar, no claws, no HUD, no player. PROBE 21 (pixelmatch on the real baselines): `beast-lightning vs beast-arcane -> 570 px differ = 0.06%` — literally the same frame. Then the two decisive greps: `grep -rn 'beast-fire' .` (excl node_modules) returns ZERO hits, and a node read of diff.test.js:22 prints `STATES count: 24 | any beast-* state? NONE — the 4 beast-*.png baselines are asserted by NOTHING`. Nothing captures them; nothing compares them. (BeastAvatar IS mounted — Components.jsx:1314 — so this is a validation hole, not a dead component.)
  ```

**The joystick knob recentres on ANY touchend -- including a look-drag release -- while the stick is still held**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControls.jsx:83-89 (onEnd recentres unconditionally, without checking the ended touch's zone)`
- *player impact:* Every time the player finishes a look-drag while running (i.e. constantly, in normal two-thumb play) the joystick knob snaps to centre even though they are still running and still holding the stick. Compounded by the CRITICAL finding above, where the knob is transparent anyway -- fix that one and this one becomes immediately visible to players.
- *why:* handleTouchEnd correctly checks the zone before clearing intents (touchHandlers.js:42), but the knob-recentre in onEnd right below it does NOT -- it fires for every touchend, including a right-half look-drag release. So the visual state of the joystick desyncs from the actual movement state. The knob then stays centred until the next touchmove on the stick.
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13 (scratchpad/touch-audit5.mjs):
     stick held      : moveF=true  | knob=translate(calc(-50% + 0px), calc(-50% - 42px))
     look drag ended : moveF=true  | knob=translate(-50%, -50%)
     => knob *** RECENTRED while the thumb is still on the stick (visual desync) ***
  Movement correctly CONTINUES (moveF stays true) -- this is purely a visual lie, not a control failure.
  ```

**The joystick is FLOATING in logic but FIXED in visuals -- the drawn ring is decorative and in the wrong place**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/input/touchMath.js:70 (zone = entire left half; origin = the touchstart point) vs src/ui/TouchControlsSurface.jsx:53 (ring drawn at a FIXED left:7% bottom:13%)`
- *player impact:* The visible affordance is misleading. A player who anchors their thumb anywhere other than the drawn ring (which the floating design explicitly allows, and which the invisible-knob bug practically forces) gets a knob animation drawn in a place unrelated to their thumb. The intended design -- a floating ring that re-anchors under the thumb -- is not implemented on the visual side.
- *why:* makeTouchRouter binds the joystick origin to wherever the finger lands, anywhere in the left half of the screen -- a floating stick. But TouchControlsSurface draws the 148px base ring at one fixed position and never moves it, and the knob offset (nub) is rendered relative to that FIXED ring rather than to the actual touch origin. So the on-screen ring tells the player 'put your thumb here' while the code accepts input anywhere, and the knob deflection is drawn relative to a point that is not the player's actual anchor.
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13 (scratchpad/touch-audit6.mjs):
     drawn ring center: (101, 660)
     thumb touched at (117,253) -- far from the drawn ring -- and dragged up: moveF=true
     => the joystick is FLOATING in logic (works anywhere on the left half) but the RING is drawn at a FIXED spot.
  ```

**4 of 26 crafting recipes produce items with ZERO consumers -- Planks (the cheapest recipe in the game), Torch, Bow->Arrow, and Magic Crystal->crystals**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/data/recipes.js:104-127 (Bow -> {Arrow:5}, Torch -> {torch:4}, Planks -> {planks:4}, Magic Crystal -> {crystals:4})`
- *player impact:* 'Planks' is 1 wood -> 4 planks, the cheapest and most obvious first craft in a voxel game. The player crafts it and gets 4 items that cannot be placed, worn, eaten, or crafted with. Same for Torch (a voxel-game staple -- there is no light-placement system). 'Bow' outputs Arrows, not a bow, and there is no ranged combat. Fixing the crystals bucket (finding #1) also fixes Magic Crystal.
- *why:* The craft output lands in inventory.blocks via addToInventory. To be usable an item must be one of: equippable (game/equipment.js), consumable (game/consumables.js), placeable (world/blockIds.js idForBlock), or an ingredient in another recipe. These four are NONE of the above. tests/gates/recipes-gates.test.js DOES execute the recipe data -- but it only asserts patterns are unique and outputs are non-empty; it never checks that an output can be USED.
- *executed evidence:*
  ```
  PROBE (vite-node, imports the real RECIPES, equipment.js, consumables.js, blockIds.js):
    Bow ............ 5x Arrow      equip=- consume=false placeable=false usedAsIngredient=false  <<< DEAD
    Torch .......... 4x torch      equip=- consume=false placeable=false usedAsIngredient=false  <<< DEAD
    Planks ......... 4x planks     equip=- consume=false placeable=false usedAsIngredient=false  <<< DEAD
    Magic Crystal .. 4x crystals   equip=- consume=false placeable=false usedAsIngredient=false  <<< DEAD
  (Every other output resolved to equip=<slot> or consume=true or placeable=true.) Ingredient-reachability was also checked: no recipe is uncraftable, so all four ARE reachable and WILL be crafted.
  ```

**The Inventory grid lets you select 14 non-placeable items as the active block; right-click-to-place then silently does nothing, with no toast and no hotbar highlight**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/GamePanels.jsx:386-393 (any item with getItemSlot()===null -> `setSelectedBlock(type); onClose();`) vs src/world/Terrain.jsx:824-826 (`const numericType = idForBlock(type); if (numericType === null) return;`)`
- *player impact:* Player clicks the Health Potion in their bag (a natural 'use this' gesture -- the Use button is a tiny hover-only overlay in the tile corner). The panel closes, and now right-click places nothing at all. The game appears broken until they reopen the Inventory and click a real block. No error, no toast, no visible selection.
- *why:* The R4 block-id fix correctly made place() REFUSE unknown blocks rather than substituting stone -- but it refuses SILENTLY, and the Inventory panel happily hands it an unplaceable name. The panel's click handler has exactly two branches (equip / setSelectedBlock) and no third branch for 'this item is neither'. The panel also closes itself on the way out, so the player is dropped back into the world with a dead build verb and no feedback.
- *executed evidence:*
  ```
  PROBE (vite-node, real store + real equipment/consumables/blockIds): for every item the player can hold (starting loadout U all recipe outputs U all trade outputs U loot-table drops), computed getItemSlot / isConsumable / idForBlock. 14 items are NOT equippable AND idForBlock() === null, yet the Inventory grid routes a click on them to setSelectedBlock + close:
    Health Potion, Mana Potion, Arrow, torch, planks, crystals, Cooked Porkchop, Cooked Beef, wand, Raw Porkchop, Raw Beef, Rotten Flesh, Diamond, Star Fragment
  HOTBAR_BLOCKS (world/Blocks.js:23) contains none of them, so GameHud highlights nothing either.
  ```

**The day-phase dial's own live probe is a FALSE PASS — it drives the clock through a convention the real game never uses**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `scripts/visual/dayphase-probe.mjs:69 (drives via `setTimeOfDay(frac)`) vs src/store/useGameStore.jsx:689-694 (`isDay = frac >= 0.25 && frac < 0.75`, gameTime = frac*1200) — a midnight-at-zero convention that CONTRADICTS dayNight.js:48 `isDayAtUnit``
- *player impact:* No direct player impact (setTimeOfDay is DEV-only). Impact is on the VALIDATION SYSTEM: it manufactures false confidence and is the proximate reason the dial bug is live. Secondary latent risk: loadWorldData (useGameStore.jsx:858) derives isDay = isDayAtUnit(gameTime), so if setTimeOfDay's convention were ever wired to a player-facing 'sleep/skip night' feature, saving and reloading would flip the player's phase.
- *why:* This explains WHY the 90°-off dial shipped, and it generalizes: a LIVE probe is not automatically truth. `setTimeOfDay`'s convention happens to match dayPhase.js's (wrong) docstring, so when a human reviews the probe screenshots the dial looks PERFECT in all four phases. The real game never calls setTimeOfDay (App.jsx:287 registers it behind `import.meta.env.DEV`; it is used only by capture.mjs, the probes, and showcase scenes) — it ticks gameTime from 0 via crossedHalfCycle. So the one artifact a human would have used to sign the dial off validates a code path players never execute.
- *executed evidence:*
  ```
  node probe running BOTH paths against the real modules:
   PATH A — what dayphase-probe.mjs/capture.mjs do (setTimeOfDay):
     setTimeOfDay(0.00) want midnight -> gameTime=  0 isDay=false MOON at BOTTOM=midnight  <-- LOOKS RIGHT
     setTimeOfDay(0.25) want sunrise  -> gameTime=300 isDay=true  SUN  at LEFT=sunrise    <-- LOOKS RIGHT
     setTimeOfDay(0.50) want noon     -> gameTime=600 isDay=true  SUN  at TOP=noon        <-- LOOKS RIGHT
     setTimeOfDay(0.75) want sunset   -> gameTime=900 isDay=false MOON at RIGHT=sunset    <-- LOOKS RIGHT
   PATH B — the REAL game (clock ticks from 0; isDay via crossedHalfCycle == isDayAtUnit):
     gameTime=  0 truth=sunrise  -> SUN  at BOTTOM=midnight  *** WRONG (90deg off) ***
     gameTime=300 truth=noon     -> SUN  at LEFT=sunrise     *** WRONG (90deg off) ***
     gameTime=600 truth=sunset   -> MOON at TOP=noon         *** WRONG (90deg off) ***
     gameTime=900 truth=midnight -> MOON at RIGHT=sunset     *** WRONG (90deg off) ***
  Also note setTimeOfDay(0.5) leaves the store at gameTime=600 with isDay=true, while isDayAtUnit(600)=false — the store is left holding a gameTime/isDay pair that contradicts itself.
  ```

**The CombatLog is not a log — every entry self-deletes after 4 seconds, so there is no scrollback**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `src/QuestSystem.jsx:161-167 (addNotification arms `setTimeout(... filter out this id ..., 4000)`) consumed by src/ui/CombatLog.jsx:24 (`notifications.slice(-8)` over that same self-expiring array)`
- *player impact:* You cannot review what just killed you, what loot dropped, or which quest ticked — the information is gone 4 seconds later. The advertised 'what just happened' affordance does not exist, and the widget spends screen real estate duplicating the toasts.
- *why:* CombatLog.jsx's header comment sells it as a 'quiet, chat-style feed for the classic-RPG "what just happened" read'. But it renders the last 8 entries of the *toast* stream, and every toast removes itself after 4000ms. So the 'log' is a 4-second window that is a strict visual duplicate of the corner NotificationStack — it has no memory. The gate `combat-log-gates.test.js` is readFileSync-only and asserts the component's source text, so it cannot detect that the feed has no history.
- *executed evidence:*
  ```
  Live puppeteer probe: pushed 3 events (`addNotification('Slain: Husk','danger')`, `'Loot: Iron Ore'`, `'Quest Complete: First Blood'`) into the real store, then counted the CombatLog container's children over time:
    CombatLog lines 0.5s after 3 events : 3
    CombatLog lines 2.5s after 3 events : 3
    CombatLog lines 5.0s after 3 events : -1   (container unmounted -> all entries expired)
  Confirms the feed retains nothing beyond 4s.
  ```

**The entire voxel-edit engine has ZERO executing tests — the gates that "cover" it regex source text, one of them matching a CODE COMMENT**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/tests/gates/place-puff-gates.test.js:19 (expect(terrain).toMatch(/place puff/i)); frontend/tests/gates/terrain-quest-callback-gates.test.js; frontend/tests/gates/block-debris-gates.test.js; frontend/tests/gates/verb-router-gates.test.js`
- *player impact:* No direct player impact by itself — but it is the mechanism by which the two bugs above reached a player. Every green run of `npm run test:unit` reports this domain as covered while save-loading is fatally broken.
- *why:* Zero tests import terrain.worker.js. Zero tests import Terrain.jsx. Zero tests import BlockParticleSystem. Nothing anywhere mentions `load_modifications`. The 'coverage' for mine/place/open/debris/puff/quest-ticks is 7 gates that readFileSync the source and regex it. place-puff-gates asserts `toMatch(/place puff/i)` — that string exists only in a comment, so deleting the entire `triggerGPUSparks` call while keeping the comment leaves the gate green. This is not a style complaint: it is the direct, measurable reason the CRITICAL load bug and the chest bug both shipped. The one live e2e (save-load.spec.js) drives loadWorldData in the real browser and passes while the world is being annihilated behind it, because it only asserts coins and level.
- *executed evidence:*
  ```
  `grep -rn '^import.*terrain\.worker|await import.*terrain\.worker' tests src --include='*test*'` -> NONE. `grep -rln 'from.*world/Terrain' tests src --include='*test*'` -> empty. `grep -rl 'load_modifications' tests src --include='*test*'` -> NO TEST FILE MENTIONS IT. `grep -rn 'world_data' tests src --include='*test*' | grep -v 'blocks: \[\]'` -> a single hit asserting [['1_2_3','stone']], a string value the game never produces (mine/place write numeric ids). Repo-wide: 114 of 124 files in tests/gates call readFileSync.
  ```

**NOTE (outside my domain, currently blocking): src/ui/GameHud.jsx is syntax-broken in the working tree — vite dev will not compile**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/src/ui/GameHud.jsx:14-20`
- *player impact:* If committed as-is: total white screen, the game does not load at all. Presumed transient (another agent is mid-edit).
- *why:* Another agent (task #21, the touch-hotbar fix) placed a bare JSX comment `{/* ... */}` between `return (` and the root `<div>`. Babel parses that as an object literal followed by JSX and throws `Unexpected token, expected "," (20:9)`. This is an in-flight edit, not a shipped bug, but right now the app does not build. Reporting it because it blocked my live probing and, if committed, is a white-screen.
- *executed evidence:*
  ```
  `npx playwright test` against the repo: `[vite] Internal server error: /Users/kz/Code/Crafty/frontend/src/ui/GameHud.jsx: Unexpected token, expected "," (20:9)` -> app never boots, `window.__craftyTest` never appears, every e2e times out. I worked around it by copying the app to scratch and moving the comment inside the element; the repo was left untouched.
  ```

**26% of all terrain geometry is permanently invisible — chunk-boundary walls buried in the neighbour chunk**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/world/terrain.worker.js:708-711 (getBlock returns 0 for any out-of-chunk coord, so every chunk emits full boundary walls against 'air')`
- *player impact:* A quarter of the vertex/draw cost of the whole terrain is wasted, at renderDistance high = 4 (~81 loaded chunks). Compounds finding #2 on the iPad target. NOTE the tradeoff: this same redundancy is what makes cross-chunk block edits safe (verified — see the healthy-result probe), so the fix must add neighbour-aware meshing, not just delete the boundary faces.
- *why:* The mesher has no neighbour-chunk data, so it treats everything outside the 16x16 column as air and emits boundary faces even where the adjacent chunk is solid rock. Those quads sit back-to-back inside solid terrain and can never be seen from any viewpoint.
- *executed evidence:*
  ```
  Generated chunk (2,2) through the real worker and independently generated its 4 neighbours, then classified every emitted quad: 1,484 quads / 2,968 tris total; 386 quads (26.0%, 772 tris) lie on a chunk-boundary plane AND are fully backed by solid voxels in the neighbouring chunk — never visible. Reproduced across chunks.
  ```

**Footsteps at the spawn Hearth play GRASS while the player is standing on stone**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/world/climate.js:16-26 (surfaceBlockAt recomputes from noise; it does not know about stampHomeAnchor/stampHub) -> src/Components.jsx:1202,1208 (footstep SFX), src/SoundManager.jsx:226 (biome ambience), src/render/WeatherSystem.jsx:87,190 (precip type)`
- *player impact:* The very first thing every player hears, every single session, is grass crunching underfoot while standing on a crafted stone plinth. The whole hub plaza is affected. Weather also picks rain (the grass-biome variant) over the stone/desert variant across the hub.
- *why:* climate.js is the main-thread surface sampler. It correctly shares computeHeight with the worker (the single-source refactor works — see evidence), but it is blind to the two POST-gen stamps that build the entire spawn hub: stampHomeAnchor (15x15 stone cap at y=51) and stampHub (4 stone terraces). The file's own comment admits this, but the function is wired to live audio.
- *executed evidence:*
  ```
  Ran the REAL worker's generateChunkData and compared voxel-by-voxel against climate.surfaceBlockAt. At (0,0) — where the player spawns — the REAL voxel is STONE @ y51 (the Hearth cap), while footstepTypeAt(0,0) returns 'grass'. Across the spawn footprint (225 columns sampled), 109 (48%) disagree with the real voxel; climate also reports surfaceY 43-46 vs the real 51 (8 blocks off). CONTROL: in the open world (x,z in 32..110, 729 columns) climate matches the worker EXACTLY except where a tree occupies the column (grass->leaves 110, snow->leaves 18, grass->wood 1) — so this is NOT general drift, it is bounded to the Hearth/hub stamps.
  ```

**Caves are systematically pinched at every chunk boundary — a 16-block lattice of stone ribs underground**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/world/terrain.worker.js:289 (`getTempBlockAt` returns 3 = SOLID for any out-of-chunk neighbour, so the CA over-consolidates walls at every chunk border)`
- *player impact:* The underground reads as a regular 16-block grid of stone ribs, and cave systems are systematically chopped up at the seams — exploration and tunnelling are worse exactly on the lattice. Compounds finding #1 (the fake ocean plane) to make caves the worst-looking part of the game.
- *why:* applyCellularAutomata's 27-neighbour solid count treats the world outside the chunk as solid rock. Border cells therefore see an inflated solidCount, so the `solidCount >= 16 -> fill with stone` rule fires far more often and the `solidCount <= 11 -> carve` rule fires far less often, exactly at x=0/15 and z=0/15. The 3D cave NOISE is continuous across chunks; only the CA breaks the seam.
- *executed evidence:*
  ```
  Over 121 real chunks, air fraction in the CA band (y 1..18) by LOCAL coordinate: x0=18.9%, x15=18.5%, z0=16.9%, z15=17.3% vs 24-26% mid-chunk (mid/edge ratio 1.34x). Connectivity test across 110 chunk pairs: a cave passage is open across a chunk SEAM plane in 3,864/28,160 cases (13.7%) but across an identical INTERIOR plane in 5,617/28,160 (19.9%) — a cave is 1.45x LESS likely to pass through a chunk seam.
  ```


### LOW

**`slam` is 20.5 dB louder than `footstep` (peak 0.98 vs 0.092) — it will slam the limiter and duck the whole mix**
- *domain:* Audio
- *at:* `src/audio/synthVoices.js:147 (makeSlamSound); measured against all 36 voices`
- *player impact:* Every Voidhand slam audibly pumps/ducks the rest of the mix for ~250ms (limiter release). Arguably intentional for the game's heaviest verb, and the limiter exists precisely to catch it — so this is a mix-taste call, not a defect. Flagging it because it is the only level anomaly in the bank and no test would ever catch it.
- *why:* The master limiter (audio/masterBus.js) has threshold -3 dBFS, ratio 20, attack 3ms. `slam` peaks at 0.98 = -0.2 dBFS, i.e. ~3 dB INTO the limiter on every single use, with a 250ms release. The existing test (synthVoices.test.js) only asserts `peak <= 1.0`, so a voice at -0.2 dBFS passes cleanly. The voice bank is otherwise genuinely healthy — I measured every one.
- *executed evidence:*
  ```
  Ran all 36 VOICES factories through a fake ctx and measured peak / dBFS / RMS / DC offset / clipped-sample count:
    footstep  0.05s peak=0.092 (-20.7 dBFS)
    slam      0.28s peak=0.980  (-0.2 dBFS)
    PEAK SPREAD: 0.092 -> 0.98 = 20.5 dB between quietest and loudest voice
    QUIET (<0.15 peak): footstep(0.092)
    HOT (>=0.98): slam(0.98)
    DC OFFSET (|dc|>0.01): none
    LONG (>1.5s): none
    clipped samples: 0 across ALL 36 voices
  So: no clipping, no DC offset, no silent voice, no runaway buffer — the bank is solid. Only the slam-vs-footstep spread stands out.
  ```

**Two vacuous assertions in the BEHAVIORAL audio tests (stormBed asserts nothing; synthVoices title lies about the count)**
- *domain:* Audio
- *at:* `src/audio/stormBed.test.js:36 + src/audio/synthVoices.test.js:37`
- *player impact:* None. Test-honesty only. But stormBed is the module behind the storm ambience bed, and its wiring into WeatherSystem has NO test at all, so this shallow test is the only thing standing behind that feature.
- *why:* stormBed.test.js builds the bed, calls start()/setIntensity(1)/stop(), then its final assertion is literally `expect(true).toBe(true)` under the comment `// does not throw; the gain ramps were scheduled` — it never checks that any ramp was scheduled or that anything routed to the destination. It is a smoke test wearing a behavioral test's clothes. Separately, synthVoices.test.js's title claims `VOICES holds EXACTLY the 38 registered names` while the registry holds 36 (the assertion itself is correct — it compares against ALL_NAMES, which has 36 entries — so it passes; only the title is wrong). Doc-truth drift of the kind that regenerates bad work.
- *executed evidence:*
  ```
  Read both files. Confirmed the `expect(true).toBe(true)` tail in stormBed.test.js. Counted the registry by execution: my voice-level probe printed `n voices = 36`, and the mounted SoundProvider printed `voice buffers generated: 36` — while the test title says 38.
  ```

**BOSS_CONFIG.damage / .speed / .aggroRange / .size are dead fields that silently do nothing**
- *domain:* Boss + the Blight-Heart win state
- *at:* `src/game/bossConfig.js:9,10,11,12`
- *player impact:* None directly. It is a designer trap: tuning the boss's damage or speed or aggro range in the config file that exists precisely to tune the boss has no effect, and nothing will tell you. aggroRange (30) is especially misleading - the real aggro trigger is the hardcoded `> 24` arrival radius in bossSystem.js:43.
- *why:* grep for every BOSS_CONFIG field consumer shows only .phases, .attackRange, .attackCooldown, .health, .xpReward, .name and .secondaryColor are ever read. damage (20), speed (3.5), aggroRange (30) and size (3.2) are read by NOBODY - the phases[] array carries its own per-phase speed and damage, and those are what BossEntity uses (phase.speed at :232, phase.damage at :262/308).
- *executed evidence:*
  ```
  grep -rn 'BOSS_CONFIG\.(damage|speed|attackRange|aggroRange|attackCooldown|size)' src -> returns ONLY BossEntity.jsx:258 (.attackRange) and :259 (.attackCooldown). Zero hits for .damage, .speed, .aggroRange, .size. Also: grep -rn 'BOSS_CONFIG|bossConfig' tests/ -> ZERO, so no test asserts the 700 HP, the phase table, or the 600 XP reward.
  ```

**Starvation damage is silently swallowed by the combat damage lockout**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/store/useGameStore.jsx:816 (`state.damagePlayer(1, 'starvation')`) blocked by :747`
- *player impact:* Starvation stops mattering during any fight -- the one situation where it should bite hardest. Minor, but it makes the hunger system quietly inert exactly when it is supposed to add pressure.
- *why:* consumeHunger routes starvation through the same damagePlayer that carries the 500ms combat lockout. Any player who is being hit at all (>= 2 hits/sec is the cap, and combat is continuous) has their starvation tick rejected. Starvation is not a combat hit and should not share the combat i-frame budget.
- *executed evidence:*
  ```
  Probe P5 (vitest, REAL useGameStore):
    hp after melee hit: 90 -> after hunger hits 0 (starvation): 90 | starvation SWALLOWED = true
  ```

**HYPOTHESIS (not executed): mid-air hitstop banks gravity and drops you faster on release**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames
- *at:* `src/Components.jsx:1063 (gravity integrates velocityY) vs :1125 (`velocityY.current * delta * hitstopScale`)`
- *player impact:* Unverified. If real: a mid-air crit (jump-attack) causes a small unnatural drop-snap on release. Low impact either way.
- *why:* applyGravity mutates velocityY every frame unconditionally, but the DISPLACEMENT it produces is multiplied by hitstopScale (0 during hitstop). So a hitstop taken while airborne freezes the fall visually while velocityY keeps accumulating; when the freeze releases, the player carries ~130ms of banked gravity (~3.4 u/s extra at a typical g). Grounded hits are unaffected (velocityY is clamped to GLUE_VELOCITY at :1060), which is the common case.
- *executed evidence:*
  ```
  NONE -- I could not execute this. Reaching it requires the Rapier KCC + the real R3F useFrame, which I did not drive. This is a code-reading hypothesis, stated as such. The two lines are confirmed by grep (`grep -n "velocityY.current" src/Components.jsx` -> :1063 integrate, :1125 scaled displacement); the consequence is inferred, not observed.
  ```

**The crafting panel's material picker hijacks the world hotbar — after closing the panel, left-click-to-place silently does nothing**
- *domain:* Crafting, recipes, coins, trading economy
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:201 (picker calls the GLOBAL setSelectedBlock) -> /Users/kz/Code/Crafty/frontend/src/world/Terrain.jsx:822-827 (place() reads store.selectedBlock; idForBlock null -> silent return)`
- *player impact:* Player crafts some armour, closes the panel, tries to keep building, and their clicks do nothing — with no error, no sound, and a hotbar showing nothing highlighted. They will assume the game froze or that pointer-lock broke. Recovery requires knowing to re-click a hotbar slot or press a number key. Cheap fix: snapshot/restore selectedBlock across the panel's lifetime, or give the craft picker its own local selection state.
- *why:* The crafting panel's 'Select Item to Craft With' row writes to the same global store.selectedBlock the world-placement path and the hotbar HUD read. Picking a non-block craft material (Leather, Iron Nugget, Spider Eye, Raw Beef...) leaves selectedBlock set to that item after the panel closes. Terrain.place() correctly REFUSES to place it (the R4a fix returns instead of substituting stone — good), but it refuses SILENTLY, and GameHud's hotbar renders no slot as selected because the name is not in HOTBAR_BLOCKS.
- *executed evidence:*
  ```
  PROBE G clicked the real 'Leather' picker button in the rendered CraftingTable, unmounted the panel, and printed: 'selectedBlock after picking "Leather" in the craft panel: "Leather"' / 'idForBlock("Leather") = null (null => Terrain.place() silently returns)' / 'is it a hotbar slot the player can see selected? NO — every hotbar slot renders unselected'.
  ```

**weatherMoodBoost is never reset -- the WeatherSystem cleanup tears down the storm AUDIO but leaves the dark, starry SKY behind**
- *domain:* Day/night, siege, weather
- *at:* `src/render/WeatherSystem.jsx:101 (`return () => { clearInterval(interval); if (stormBedRef.current) stormBedRef.current.stop(); }` -- no setWeatherMoodBoost(0)) + src/store/useGameStore.jsx:88-89`
- *player impact:* If the WeatherSystem ever unmounts mid-storm (world switch / exit to menu / GameScene remount), you can re-enter a world into a dark, starry, midday sky with zero rain falling, for up to 90 seconds. Cosmetic but disorienting. HYPOTHESIS on the unmount path -- I verified the missing reset, not the remount.
- *why:* `grep -rn weatherMoodBoost src/` returns exactly 4 hits: the store field, its setter, the WeatherSystem's 90s interval, and Atmosphere's read. Nothing else ever resets it. The unmount cleanup deliberately stops the storm AUDIO bed but leaves the visual boost at 0.85. A remounted WeatherSystem starts with weatherRef='clear' (so no rain/snow renders) while the store still says storm (so the sky stays dark -- and, per Finding #2, starry) until the next 90s transition.
- *executed evidence:*
  ```
  Code-evidenced, not executed (I could not drive an unmount -- the app does not boot). The asymmetry is inside a single 1-line cleanup: `stormBedRef.current.stop()` is called, `setWeatherMoodBoost(0)` is not. The store field's only writer is the interval that the same cleanup just cleared.
  ```

**The storm notification is NOT capture-gated -- a toast can land in a visual baseline (gate flake)**
- *domain:* Day/night, siege, weather
- *at:* `src/render/WeatherSystem.jsx:73-98 (the audio block is wrapped in `if (!isCaptureMode())`; the `if (store.addNotification)` block at :83 sits OUTSIDE that guard) + src/QuestSystem.jsx:161-167 (addNotification has no capture gate; NotificationStack renders it for 4s)`
- *player impact:* None to the player. It is a nondeterminism source in the 'byte-identical baselines' claim: an 'Atmospheric shift... Dynamic rain storm has started!' toast is live for 4s out of every 90s during a >4-minute capture run, so a baseline frame can differ run-to-run -- exactly the kind of noise the 6% pixelmatch threshold is silently absorbing.
- *why:* Atmosphere.jsx:153-156 says it in so many words: 'The weather state machine still ticks during a capture (which runs >90s, longer than the 90s weather cycle)'. Two of the three consumers of the weather transition were hardened for capture (the audio bed, and the mood boost -- forced to 0 in Atmosphere). The third, the notification toast, was not.
- *executed evidence:*
  ```
  Code-evidenced. `grep -rn 'addNotification' src/QuestSystem.jsx` -> the useCallback at :161 has no isCaptureMode() guard, and NotificationStack (:537) renders whatever is in the list. WeatherSystem's `store.addNotification('Atmospheric shift... Dynamic rain storm has started!', 'info')` is outside the `if (!isCaptureMode())` block. I could NOT run the capture to see a toast land in a frame -- the app does not currently boot (GameHud.jsx:20 syntax error, vite 500). This is a HYPOTHESIS with strong code evidence, not proven.
  ```

**KEY_MAP anti-drift gate is one-directional — Q (claim quest) and L (quest log) are live but never advertised, hiding the quest reward loop**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate
- *at:* `tests/game/keyMap.test.js:35-42 (checks map->handler only) ; src/game/keyMap.js:8-35 (no L/Q/F3 rows) ; src/InputManager.jsx:123 (KeyL), :133 (KeyQ), :145 (F3)`
- *player impact:* A player who never guesses L never learns the quest log exists, and never learns that Q claims a finished quest. The controls panel (H) — the game's only teaching surface for bindings — lists neither. The entire quest reward loop sits behind two keys the game never tells you about. (This is the same class as the 'M - Magic' HUD lie the gate was written to prevent; the gate just can't see this direction.)
- *why:* The gate asserts every KEY_MAP row with a `code` has a handler (`handlers.includes("'" + r.code + "'")` — a raw substring match on concatenated source). It NEVER asserts the reverse: that every live handler is advertised. src/ui/CombatInstructions.jsx is the sole KEY_MAP renderer (`grep -rln KEY_MAP src/`), so any handler missing from KEY_MAP is invisible in the H controls panel.
- *executed evidence:*
  ```
  Imported the real KEY_MAP in the running page:
    KEY_MAP advertises: KeyF, KeyT, KeyR, KeyV, KeyX, KeyZ, KeyE, KeyM, KeyC, KeyB, KeyU, KeyG, KeyH, Tab, Escape  (15 codes)
    LIVE handlers in InputManager.jsx (grep): KeyE KeyC KeyB KeyM KeyL KeyQ KeyG KeyH KeyU Tab Escape F3
    -> UNADVERTISED but LIVE: KeyL (quest log), KeyQ (claim all quests), F3 (stats)
  And `grep -n 'Press L' src/ui/QuestLog.jsx` -> line 65: "Press L to close • Q claims a finished quest from the tracker" — i.e. L and Q are taught ONLY inside the quest log, which you can only open with L.
  ```

**equipItem performs NO slot validation — any item can be forced into any slot, stacking its stats 5x**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/store/useGameStore.jsx:165  `equipItem: (slot, itemName) => set((state) => {``
- *player impact:* NONE today via the normal UI — GamePanels always derives the slot from getItemSlot, so a player clicking around cannot reach this. The impact is future/adjacent: any new equip surface (drag-drop, controller, touch radial) that passes a slot chosen by the player, or a save-file edit, silently yields 5x stats and a 525 max-HP character at level 1. Flagging it as a defensive gap, not a shipped bug.
- *why:* equipItem takes the slot as a caller-supplied argument and never checks it against getItemSlot(itemName). computeEffective folds EQUIPMENT_STATS by item NAME across whatever is in each slot, so the same item equipped into 5 slots contributes its bonus 5 times. I want to be precise about reachability: the ONLY UI caller (GamePanels.jsx:203-205) derives the slot via `const slot = getItemSlot(itemName)` and guards `if (slot && ...)`, so a normal player clicking the inventory CANNOT trigger this. This is therefore a latent robustness gap, not a live exploit — the store trusts its callers. It becomes a real dupe the moment anything else calls equipItem: a drag-and-drop equip UI (the natural next feature), the e2e test bridge (window.useGameStore is exposed and the e2e specs already call setState on it), or a hand-edited save. Reporting it as LOW precisely because I could NOT find a player-reachable path today.
- *executed evidence:*
  ```
  EXECUTED against the real store (vite-node):
    ──────── P6. SLOT VALIDATION — can I put a SWORD in every slot?
    base strength = 10
    equipment after equipping Diamond Sword into ALL 5 slots: {
      head: 'Diamond Sword', chest: 'Diamond Sword', boots: 'Diamond Sword',
      weapon: 'Diamond Sword', offhand: 'Diamond Sword'
    }
    effective strength = 85 (base 10 + 15/sword x5)
    maxHealth = 525
  The store accepted all five with no complaint. Contrast with the correctly-guarded cases, which I also executed and which all PASSED: P5 equipping an item you don't own -> correctly rejected (weapon stays null).
  ```

**Unequip migrates an item across inventory buckets (tools -> blocks) when a duplicate was looted**
- *domain:* Loot, inventory, equipment, affixes
- *at:* `src/store/useGameStore.jsx:238-241 (unequipItem checks `currentEquipped in updatedBlocks` BEFORE checking tools)`
- *player impact:* Effectively none, and arguably an accidental IMPROVEMENT: since inventory.tools is rendered by nothing (see the tools finding), landing in blocks is the only way the item becomes visible at all. Recording it so that whoever fixes the tools bucket knows this reordering exists and does not mistake it for a dupe.
- *why:* unequipItem returns the item to whichever bucket it finds FIRST, checking blocks -> tools -> magic. Because addToInventory always writes to blocks, an item that was equipped OUT of tools comes BACK into blocks if a duplicate was acquired in the meantime. Item count is fully conserved — nothing is duped or lost — but the item silently changes bucket. I originally suspected this was a dupe; executing it proved it is NOT. Reporting it honestly as a benign quirk rather than inflating it.
- *executed evidence:*
  ```
  EXECUTED against the real store (vite-node):
    ──────── P4. sword equipped from tools, then a sword DROPS (addToInventory -> blocks). Unequip.
    equipped from tools:      tools.sword = 0  blocks.sword = undefined  total = 1
    after looting 1 sword:    tools.sword = 0  blocks.sword = 1          total = 2
    after unequip:            tools.sword = 0  blocks.sword = 2          total = 2
  Total conserved at 2 throughout — no dupe, no loss. The item merely migrated tools -> blocks.
  ```

**All four NAMED hub NPCs pop a generic 'Villager' tutorial bubble; the intended ambient emote system (`nextEmote`) is unit-tested dead code with zero callers.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/render/MobModel.jsx:62-93 (dialogue effect keyed on `entity.type !== 'villager'`) and :356 (header hardcoded `Villager`); src/game/npcRoutine.js:17 (`nextEmote`)`
- *player impact:* The named frontier-outpost roster — the whole fiction of the hub — is undercut: your merchant is labelled 'Villager' and reads you a generic control tutorial. The designed ambient life (a slow patrol WITH emotes) ships with the patrol but not the emotes.
- *why:* npcSpawn.js:27 sets `type: 'villager'` on Bram/Mara/Old Pike/Sister Wren so they reuse the MobModel villager render. That same key gates the legacy barker effect, so every named hub NPC randomly says things like 'I heard rumors of a Shadow Dragon... Train and prepare!' under a bubble header hardcoded to the word 'Villager'.
- *executed evidence:*
  ```
  `grep -rn "nextEmote" src/ tests/` returns 9 hits: 1 definition (src/game/npcRoutine.js:17) and 8 test assertions across src/game/npcRoutine.test.js and tests/data/npcRoutine.test.js. ZERO callers in src/. Executed it: `nextEmote(0..2)` -> `… | *hums* | *sweeps*` — the ambient emotes exist, are tested in two separate files, and are never rendered. Confirmed the hub NPCs carry type 'villager' by running makeNpcEntity against the real module (they appear in mobsQuery as Sister Wren / Old Pike the Warden / Mara the Smith / Bram the Trader, all type villager).
  ```

**'Day stays the calm baseline' is 70.3% hostile — the neutral spawn roll spans ALL mob types, so daytime is only marginally safer than a siege.**
- *domain:* NPCs, hub, mobs, AI worker
- *at:* `src/systems/SpawnerSystem.jsx:43-48 (the `else` branch calls `weightedPick(entriesFor(mobTypeKeys))` over EVERY type, hostiles included); comment at :45 claims 'day stays the calm baseline'`
- *player impact:* Daytime never feels like a respite — you are still fighting 7 hostiles for every 3 passives. The day/night contrast that the siege system is built to sell is muted before it starts. (Flagging as a design-intent mismatch, not a defect — this may be Kevin's call.)
- *why:* By registry weight, hostiles total 6.15 and passives 2.6 — so the 'neutral' roll is 70.3% hostile. During the day that branch ALWAYS fires. The night siege's hostileChance therefore only lifts hostility from 70.3% to 91.1% (night 0) to 98.5% (night 6). The real siege signal is the mob CAP (16 -> 40), not the mix.
- *executed evidence:*
  ```
  Ran the REAL weightedPick against the REAL MOB_TYPES weights, 200,000 samples:
    pig 11.5% / cow 11.5% / villager 6.9%  (passive)
    zombie 11.5% / skeleton 11.4% / spider 11.4% / skitterling 13.7% / duskhound 10.3% / moss_brute 2.8% / emberhusk 9.0%  (hostile)
    --> DAY spawns are 70.1% HOSTILE
  Then composed with the REAL siegeParams:
    night 0: hostileChance 0.70, maxMobs 16 -> ACTUAL hostile share 91.1%
    night 6: hostileChance 0.95, maxMobs 40 -> ACTUAL hostile share 98.5%
    DAY    :                                -> 70.3%
  ```

**Store-level spendTalentPoint enforces the rank limit but NOT the prereq — the tree's dependency graph is a UI-only convention**
- *domain:* Progression
- *at:* `src/store/useGameStore.jsx:474-496 (checks talentPoints > 0 and TALENT_LIMITS, never node.prereq)`
- *player impact:* NONE via normal play today — the panel is the only caller and it gates correctly (verified behaviorally by tests/integration/spell-upgrade-talents.test.jsx). This is a latent authority gap: the moment a second caller appears (a respec button, a quest reward, a touch verb-wheel, the test bridge), the tree's design collapses. Worth closing because the fix is three lines in the place the invariant actually belongs.
- *why:* ASPECT_TREES encodes a real prereq DAG (voidhand_crush needs voidhand_force; soulbind_pack needs soulbind_snare; wildheart_endurance needs wildheart_roar). SpellUpgradePanel.jsx:101 is the ONLY thing that enforces it. The store — which is the save-authority and the thing every gameplay site reads — will happily grant an orphan node. The existing store test even bakes the hole in: tests/store/progressionXp.test.js spends voidhand_crush 9x with no voidhand_force and asserts it reaches rank 2.
- *executed evidence:*
  ```
  P4 (talentPoints: 10, unlockedTalents: {}), calling the real store action directly:
    spendTalentPoint('wildheart_endurance')  // prereq wildheart_roar NOT owned
    spendTalentPoint('soulbind_pack')        // prereq soulbind_snare NOT owned
    spendTalentPoint('voidhand_crush')       // prereq voidhand_force NOT owned
    P4 unlockedTalents: {"wildheart_endurance":1,"soulbind_pack":1,"voidhand_crush":1}  tp 7
  All three orphan nodes granted; 3 points consumed.
  ```

**allocateAttribute has no attribute whitelist — a bad key writes NaN into attributes, burns the point, and serializes to the save as null**
- *domain:* Progression
- *at:* `src/store/useGameStore.jsx:256-276 (`[attr]: state.attributes[attr] + 1` with no key check)`
- *player impact:* NONE today — GamePanels.jsx:332-334 only ever passes 'strength'/'agility'/'intellect', and addTalentPoint/addAttributePoints have no callers at all. These are unexercised robustness holes in the store's public API, listed for completeness rather than as live defects. I am explicitly NOT claiming a player can hit them.
- *why:* `state.attributes['luck'] + 1` is `undefined + 1` = NaN. The point is still decremented, and the NaN key lands in the persisted `attributes` object (saveSchema.js serializes state.attributes wholesale), where JSON.stringify turns it into `null`. Sibling API addAttributePoints (:278) sanitizes properly (`Math.max(0, Math.floor(Number(amount) || 0))`) — allocateAttribute simply doesn't.
- *executed evidence:*
  ```
  P3 (attributePoints: 3):
    after allocate("armor"):          {"strength":10,...,"armor":1,"attributePoints":2}   (works; armor has no UI '+' button, so this path is unreachable today)
    after allocate("luck"):           {"strength":10,...,"attributePoints":1,"luck":null}  <-- NaN written, point BURNED
    after allocate("attributePoints"): {...,"attributePoints":0}                            <-- net -1, self-cancelling
  Also in the same class (same probe file):
    P5 addTalentPoint(undefined) -> talentPoints = NaN
    P5 addTalentPoint(-5)        -> talentPoints = -2      (no clamp; addTalentPoint has zero callers in src/ — dead API)
    P2 grantXP('75')             -> currentXP = "075"      (string concat; no caller passes a string today)
  ```

**The Q key and the tracker disagree on the claim predicate — a quest can become permanently unclaimable**
- *domain:* Quests + achievements
- *at:* `src/InputManager.jsx:137 claims on `quest.progress >= quest.target && !quest.claimed`; src/game/questClaim.js:47 (reduceClaim) requires `q.completed`. src/QuestSystem.jsx:469 (the tracker's Claim button) also requires `q.completed`.`
- *player impact:* None in clean play. On a legacy/tampered save: one quest slot is dead forever and pressing Q on it does nothing.
- *why:* Two different definitions of 'claimable' across three surfaces. In the divergent state the Q key calls claimQuest, claimQuest returns a silent no-op, no reward is paid, and the quest never leaves the feed — an unrecoverable soft-lock of one feed slot.
- *executed evidence:*
  ```
  PROBE 2/B3: seeded {progress: 5, target: 5, completed: false}. Printed: 'InputManager would claim it? true / QuestTracker shows Claim button? false / after claim -> coins = 0, feed = ["hunter"]' (quest still there, nothing paid). HONEST CAVEAT: the predicate divergence is executed-proven, but I could NOT find a live gameplay path that produces progress>=target with completed=false — updateQuestProgress sets both in the same update. Reachability is therefore a HYPOTHESIS (corrupt/legacy save only), not evidence.
  ```

**A save with unlockedAchievements: [] silently loses the auto-granted 'first_step' achievement**
- *domain:* Quests + achievements
- *at:* `src/QuestSystem.jsx:157 — `setUnlockedAchievements(new Set(_arrOr(qs.unlockedAchievements, ['first_step'])))`. An empty array IS a valid array, so _arrOr returns it and the ['first_step'] default never applies.`
- *player impact:* Cosmetic. The player permanently loses one of twelve achievements and the counter is off by one.
- *why:* 'First Steps / Enter the world' is marked `auto: true` and is skipped by checkAchievements (line 173), so once lost it can never be re-granted.
- *executed evidence:*
  ```
  PROBE 8/S3: loaded questState {unlockedAchievements: []} through the real re-seed path -> printed 'S3 unlocked = []'. The AchievementsPanel would then read '0 / 12 unlocked' with First Steps padlocked.
  ```

**DOC-TRUTH: questClaim.js claims it is locked by a test file that does not exist**
- *domain:* Quests + achievements
- *at:* `src/game/questClaim.js:22 — comment: 'Locked by quest-multiclaim-gates.test.jsx (behavioral, RED against the old code) + questClaim.test.js (pure).'`
- *player impact:* NONE directly. Process risk only.
- *why:* questClaim.test.js has never existed. The pure reducer — the module written specifically to kill the reward-theft bug — has no direct unit test. It IS covered indirectly (quest-multiclaim-gates.test.jsx is genuinely behavioral and does exercise it), so this is a false claim rather than a hole of equal size — but it is the exact kind of comment that makes the next agent skip writing the test.
- *executed evidence:*
  ```
  `find /Users/kz/Code/Crafty/frontend -path ./node_modules -prune -o -name 'questClaim*' -print` -> only ./src/game/questClaim.js. `grep -rn 'questClaim' tests/ src/ scripts/` -> the sole reference is the import in src/QuestSystem.jsx:17.
  ```

**gameTime uses a falsy `||` fallback, so a save at time 0 does not round-trip**
- *domain:* Save / load / persistence / migration
- *at:* `src/store/useGameStore.jsx:853 (`const gameTime = saveData.game_state?.gameTime || state.gameTime;`) — every other numeric restore correctly uses `??``
- *player impact:* Narrow: gameTime only equals exactly 0 in a world's first second (the clock ticks +4/s from 0), so this mainly bites when loading a WorldManager-created world — the time of day does not reset with it. Real but small.
- *why:* gameTime is a NUMBER whose 0 is a legitimate value (world start / the WorldManager freshBlob writes `gameTime: 0` literally). `||` treats it as absent and keeps the live clock instead. isDay is then derived from that wrong time (isDayAtUnit at :858), so the restored time-of-day is wrong too. One-character fix (`??`), and it is the last `||` numeric fallback in the load path.
- *executed evidence:*
  ```
  probe1 P1: saved with game_state.gameTime = 0, live clock moved to 0.77, then loadWorldData -> 'after load: gameTime = 0.77  isDay = true   EXPECTED gameTime 0'. Control P2 (non-zero): saved 0.42, live 0.9, loaded -> 'gameTime = 0.42' (correct). P3 confirms the freshBlob's `gameTime: 0` is likewise ignored.
  ```

**gameWon is serialized, restored and commented as a persisted win-state, but nothing in the app reads it**
- *domain:* Save / load / persistence / migration
- *at:* `src/store/useGameStore.jsx:713-717 (markGameWon) + src/game/saveSchema.js:55 (`gameWon: state.gameWon, // S9c: the win-state survives a reload`)`
- *player impact:* NONE directly — the player can beat the Blight-Heart and see no victory acknowledgement, but that is a missing feature rather than a regression. Flagged because it inflates the apparent test coverage of this domain.
- *why:* `grep -rn --include='*.jsx' 'gameWon' src/ | grep -v store/useGameStore` returns ZERO hits — no victory screen, no HUD element, no gate consumes it. It is persisted state with no consumer, plus a dedicated store test (tests/store/gameWon.test.js) and an e2e assertion that make the domain look better-covered than it is. Either wire a victory beat to it or delete it.
- *executed evidence:*
  ```
  grep (executed): `grep -rn --include='*.jsx' 'gameWon' src/ | grep -v store/useGameStore` -> no output. Confirmed in the live browser: the blob carries `"won":true` after markGameWon (SESSION 1 output) yet nothing renders.
  ```

**Deleting the world you are currently playing resurrects it as a duplicate on the next autosave**
- *domain:* Save / load / persistence / migration
- *at:* `src/game/worldSaves.js:40-44 (deleteWorld clears the active id) + src/store/useGameStore.jsx:970-971 (saveActiveWorld mints a NEW id when none is active)`
- *player impact:* The player deletes a world, it reappears in the list seconds later. Confusing but not destructive.
- *why:* deleteWorld correctly removes the blob + index entry and nulls the active id, but the live store still holds the whole world. The next trigger-key change mints `local_<Date.now()>` and writes the same world straight back under a new id. Deleting the active world should either also reset the store or suppress autosaves until a world is loaded/created.
- *executed evidence:*
  ```
  probe1 P5 (real store + real worldSaves): 'saved world id = local_1783963418272  worlds = 1' -> deleteWorld -> 'after deleteWorld: worlds = 0  active = null' -> one more autosave -> 'after the next autosave: worlds = 1 ["local_1783963418272"]'. (The id matched only because Date.now() was identical inside the test tick; in real time it mints a fresh id, i.e. a DUPLICATE entry rather than the same one.)
  ```

**Lightning's `stunDuration` is dead data -- the stun was never built**
- *domain:* Spells / magic
- *at:* `src/game/spells.js:67 (`stunDuration: 1`)`
- *player impact:* None today -- but a designed mechanic (lightning stunlock, the thing that would justify lightning's 25 mana cost) silently never shipped, and the data file makes it look like it did.
- *why:* The lightning secondary declares a 1-second stun alongside maxChains / chainRange / chainDamageReduction, which ARE all consumed. stunDuration is not.
- *executed evidence:*
  ```
  `grep -rn 'stunDuration' src/ tests/` returns exactly ONE line -- the declaration at src/game/spells.js:67. Zero readers, zero tests, zero gates. (spells.test.js pins the roster shape but does not assert the field is honoured.)
  ```

**Spell crits are invisible, and the damage solver still returns the legacy pre-unify palette**
- *domain:* Spells / magic
- *at:* `src/EnhancedMagicSystem.jsx:202 (`const { damage: finalDamage } = solveSpellDamage(...)`) + src/utils/combat.js:16-35`
- *player impact:* Roughly a third of your big spell hits are crits and you never know -- the single cheapest source of combat readability in the game is being computed and discarded.
- *why:* solveSpellDamage returns `{damage, isCrit, color}`. The cast site destructures ONLY `damage`. isCrit -- a 1.8x multiplier at up to 50% chance -- is thrown away: no crit colour, no crit sound, no distinct shake. Melee DOES surface its crit (Components.jsx:309 fires a 1.6 shake on isCrit). Separately, combat.js's `color` returns #FF4500 / #00BFFF / #FFD700 / #9932CC -- exactly the legacy drifted hexes that spells.js's own header says were KILLED by the B2 spell-color unify -- and src/utils/combat.test.js:42-45 behaviorally PINS them. It is dead output pinned by a live test.
- *executed evidence:*
  ```
  Probe P13/P16 show the crit multiplier is live: the same arcane cast produced 72 damage in P1 and 130 in P13 (72 * 1.8 = 130). The player receives no signal distinguishing them. Grep: `grep -rn 'solveSpellDamage' src/` -> the only production consumer is EnhancedMagicSystem.jsx:202, which drops `isCrit` and `color`.
  ```

**HYPOTHESIS (root cause NOT proven): the impact spark burst carries no element identity in the pinned baselines**
- *domain:* Spells / magic
- *at:* `tests/visual/baseline/spell-{cast,iceball,lightning,arcane}.png; gate at tests/gates/spell-vfx-gates.test.js:41`
- *player impact:* IF real: every spell's impact looks like the same pale lavender confetti, so hits have no elemental read. Unconfirmed.
- *why:* I am flagging this as a HYPOTHESIS, not a confirmed bug -- I could not attribute it. What I MEASURED in the baselines is real. What I could NOT do is stage the studio camera in a live capture to prove where the colour is lost. Do not act on this without a framed live probe. What IS confirmed is that the gate covering it is vacuous: spell-vfx-gates.test.js:41 is `expect(magic()).toMatch(/SPARK_PROFILE/)` -- a regex on the source text; it cannot see the render.
- *executed evidence:*
  ```
  MEASURED (pngjs, per-row-median background rejection so the sky gradient is not counted):
    impact-spray region, fireball vs iceball baseline: 99.72% PIXEL-IDENTICAL (66 of 23,625 px differ, max delta 57) -- despite spec hues fire #FF7A3C (19deg) vs ice #6FC8FF (203deg) and spark counts 94 vs 76.
    mean spark hue in ALL FOUR baselines: 260-273deg (lavender). Spec: fire 19, ice 203, lightning 48, arcane 269.
    CONTROL: the projectile-SILHOUETTE region of the same two frames differs 57.59% -- so per-element content IS rendering; the failure is specific to the impact spray.
  BUT -- COUNTER-EVIDENCE from a LIVE probe I wrote and ran (scratchpad/spellprobe/live-spark-probe.mjs, real vite + puppeteer, instrumented the live store fn): triggerGPUSparks IS called with the CORRECT per-element colour and count:
    ### {"color":"#FF7A3C","count":94,"type":"fireball"}
    ### {"color":"#6FC8FF","count":76,"type":"iceball"}
    ### {"color":"#FFE066","count":86,"type":"lightning"}
    ### {"color":"#B36BFF","count":83,"type":"arcane"}
  So the gameplay wire is CORRECT. The loss is downstream (shader/tonemap/bloom over a bright sky) OR the confetti I measured is not the spark burst at all. My live probe's camera never framed the sky studio (I checked the screenshot -- it shows terrain, no spells), so I could not close this. INCONCLUSIVE.
  ```

**VISUAL (my eyes on the baseline PNGs): the additive glow shell washes the fireball into a grey egg; the lightning bolt is nearly invisible**
- *domain:* Spells / magic
- *at:* `tests/visual/baseline/spell-cast.png, spell-lightning.png, spell-iceball.png; profiles at src/game/spellVisualProfiles.js:22-45`
- *player impact:* Fire's signature look is a dull grey blob at range; lightning's projectile is hard to see at all. Cosmetic, but these are the two spells a player uses most.
- *why:* This is a look judgement from opening the PNGs, offered as such -- not a mechanical bug. spell-cast.png: the orange fire teardrop reads well, but it sits inside a large pale GREY-LAVENDER ellipse (the additive glow shell) that dwarfs and dulls it -- which is precisely the failure the source comment at spellVisualProfiles.js:31 admits it was trying to fix ('additive orange over a bright sky washes pale-pink' -> glowOpacity dropped to 0.12). It did not get fixed. spell-lightning.png: the bolt silhouette is a faint violet scratch, almost invisible against the sky; the trail is a pale yellow line. spell-iceball.png: the shard cluster reads as a small DARK steel-blue arrowhead -- the least magical of the four. spell-arcane.png reads best (a clear magenta sigil orb with rings).
- *executed evidence:*
  ```
  I opened all four baselines and looked at them. Corroborating measurement: the projectile-silhouette region differs 57-58% between elements, so the SHAPES are genuinely distinct (that part of the v7-S3 work landed). The problem is contrast/legibility of fire's halo and lightning's bolt against the bright sky, not shape sameness.
  ```

**aspectGuide tells the player to "Hold X" to snare, but the channel does not require the key to be held**
- *domain:* The four Aspects
- *at:* `src/game/aspectGuide.js:37 ("Hold X while aiming at it") vs src/game/soulbind.js:19-46 (decideSoulbind's ctx has no held-key field at all)`
- *player impact:* Minor and arguably in the player's favour: tap X, look at the target, and it binds. But a player following the in-game guide will hold a key they never needed to hold, and the guide is the only place the Aspect loops are taught.
- *why:* decideSoulbind takes `snareEdge` to START and thereafter gates only on alive/active/targetId. There is no `snare` (held) input to pass. Releasing the key is therefore unobservable to the SM. The module header defends this ("holding aim IS the skill"), so the mechanic is intentional — but aspectGuide.js's own header claims "Every mechanic stated here is verified against the shipped modules — the guide must never drift from the game." It has drifted.
- *executed evidence:*
  ```
  PROBE 14 on the REAL soulbind.js: `t=0.0 press X -> startChannel`, then every subsequent frame passed with the key RELEASED, and at `t=1.1 -> bind <-- bound anyway`.
  ```

**A held Voidhand phantom survives a menu open (the HELD branch never checks ctx.active)**
- *domain:* The four Aspects
- *at:* `src/game/voidhand.js:56-64 — the HELD branch guards `!ctx.alive` but never `!ctx.active`, unlike the CHARGING branch at :68 and unlike beastTransform's charge cancel`
- *player impact:* Cosmetic. The grabbed block keeps orbiting behind the inventory screen and the 8-second max-hold clock keeps running while the player is in a menu, so they can return to find their phantom auto-dropped and 25 Kinetic spent for nothing.
- *why:* Every other cancel path in the domain treats `active` (pointer-lock) as the modal proxy. Voidhand's held state is the one place that ignores it, so the state is asymmetric with its own charging branch two lines below.
- *executed evidence:*
  ```
  PROBE 17 on the REAL voidhand.js: `t=0.40 -> grab | held = true`, then `t=0.50 MENU OPEN (active=false) -> none | held = true`. The phantom is only released by the MAX_HOLD_SEC=8 timer.
  ```

**CONTEXT (not a domain defect): the working tree was uncompilable mid-audit -- another agent's in-flight GameHud.jsx edit**
- *domain:* Touch / mobile input
- *at:* `/Users/kz/Code/Crafty/frontend/src/ui/GameHud.jsx:20 (transient; resolved by the time I finished)`
- *player impact:* NONE (transient dev-time state, never shipped). Flagged purely so the parent agent does not double-count it.
- *why:* While probing I found vite returning HTTP 500 for src/ui/GameHud.jsx: 'Unexpected token, expected "," (20:9)' -- a JSX comment `{/* ... */}` placed immediately after `return (`, which parses as an object literal. The app would not load at all. This was another agent's in-flight X3 fix, not a shipped defect; `git status` at the end of my run shows GameHud.jsx clean again. I report it only to explain why I audited against a git-HEAD sandbox (/private/tmp/.../scratchpad/sandbox, HEAD=df9a964) rather than the working tree, and so nobody mistakes it for a finding of mine.
- *executed evidence:*
  ```
  curl of the vite dev server: `{"message":"/Users/kz/Code/Crafty/frontend/src/ui/GameHud.jsx: Unexpected token, expected \",\" (20:9)", "plugin":"vite:react-babel"}` -> the page never booted (window.useGameStore never defined). After rebuilding the sandbox from `git show HEAD:frontend/src/ui/GameHud.jsx`, @babel/parser parsed it clean and the app booted. Final `git status --short` shows no modification to frontend/src.
  ```

**Progression panel: the 'Locked' badge overlaps the talent-node title text on long names**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/SpellUpgradePanel.jsx:118-122 (`absolute top-2 right-2` lock overlay) vs :125 (the node title `<div>` has no right-padding reserved for it)`
- *player impact:* Cosmetic. The talent name is partly unreadable on locked high-tier nodes. Low, but it is in a pinned visual baseline, i.e. it has been shipping and the gate blessed it.
- *why:* The lock badge is absolutely positioned over the node card and the title is a normal-flow div with no `pr-*` reserve, so any title long enough to reach the right edge is overprinted.
- *executed evidence:*
  ```
  I LOOKED at the PNG I captured from the live app (scratchpad/shots/progression-scroll-top.png) and at the repo's own pinned baseline tests/visual/baseline/progression-open.png. In both, 'Elemental Imbue' and 'Locked' visibly collide (the badge overprints the last characters); 'Primal Endurance' in the baseline shows the same overlap. Not a probe -- a direct read of the pixels.
  ```

**COVERAGE GAP (not a bug): the Modal Tab focus-trap, chest item transfer via the panel, gear equip/unequip via the panel, and the GearInspector stat-diff have ZERO tests of any kind**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression
- *at:* `src/ui/primitives/Modal.jsx:25-36 (Tab trap); src/ui/ChestInventoryPanel.jsx:63,85 (transferItem clicks); src/ui/GamePanels.jsx:202-213 (handleEquip/handleUnequip), :85-167 (GearInspector)`
- *player impact:* NONE observed. This is a risk statement, not a defect.
- *why:* tests/gates/modal-a11y.test.jsx has 5 tests and `grep -n Tab` returns nothing -- the focus-trap keydown handler is never exercised. tests/store/inventoryConservation.test.js covers the transferItem STORE action but nothing drives the chest PANEL. equipItem/unequipItem are store-tested but the panel's click wiring is not. I inspected these paths and did NOT find a defect -- I am reporting the absence of coverage, not a bug. Calling any of them broken would be a hypothesis, and I have no evidence for one.
- *executed evidence:*
  ```
  grep -rn 'Tab' tests/gates/modal-a11y.test.js* -> no output. grep -rln 'transferItem' tests/ -> only tests/store/inventoryConservation.test.js (store-level). grep for equipItem/GearInspector in tests/integration -> no hits. No probe run; this is a measured absence, stated as such.
  ```

**cooldownMirror hardcodes ability durations, duplicating the state-machine constants (currently correct — latent drift risk only)**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker
- *at:* `src/game/cooldownMirror.js:13-16 — literals 0.6 (grab), 1.5 (snare), 1.5 (roar), 1.0 (imbue)`
- *player impact:* NONE today. Purely a latent maintenance hazard.
- *why:* This is a second hand-written copy of numbers owned elsewhere — structurally the same shape as today's diamond->stone block-id drift. If Kevin tunes any of these (they are all explicitly flagged Kevin-tunable), the ability bar's conic cooldown sweep silently desyncs from the real cooldown: the wedge finishes early or late while the ability's actual readiness is unchanged. Recommend importing GRAB_COOLDOWN_SEC / SNARE_COOLDOWN_SEC / COOLDOWN_SEC rather than re-typing them.
- *executed evidence:*
  ```
  I checked for drift and found NONE — reporting the honest negative. grep of the source of truth: src/game/voidhand.js:18 `GRAB_COOLDOWN_SEC = 0.6`; src/game/soulbind.js:10 `SNARE_COOLDOWN_SEC = 1.5`; src/game/beastTransform.js:15 `COOLDOWN_SEC = 1.5`; src/Components.jsx:153 dodge `cooldown: 0.8` (and the mirror reads dodge.cooldown dynamically). All four match the mirror's literals today.
  I also checked the four ability-gating talent ids for the same drift class — `voidhand_grasp`, `soulbind_snare`, `elemancer_imbue`, `wildheart_roar` all EXIST in src/game/talentTree.js and agree across Components.jsx, HUD.jsx and keyMap.js. No drift. Honest negative.
  ```

**A no-op edit still triggers a full chunk re-mesh + TrimeshCollider rebuild**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/src/world/terrain.worker.js:111-173 (the bounds check gates the write, but generateMesh runs unconditionally afterwards)`
- *player impact:* Minor. A hitch/stutter on wasted clicks, plus phantom air entries accumulating in the save file. The quest-tick-on-nothing is only reachable if the build ray resolves to an already-empty cell, which the verb router mostly prevents (mobs are collider-less and route to 'attack').
- *why:* `update_block` correctly guards the ITEM drop on `prevBlock !== 0`, so re-mining an already-air cell does not double-drop. But it then re-meshes the whole 16x16x256 chunk and ships a new geometry + a new TrimeshCollider to the main thread regardless of whether the voxel actually changed. Terrain.mine() is also unconditional on the main-thread side: it plays the break SFX, accrues resonance, writes a phantom `key -> 0` into worldBlocks (which gets SAVED), and fires `store.onBlockBreak?.()` (Miner quest + Deep Digger achievement) even when nothing was there to break.
- *executed evidence:*
  ```
  PROBE-F, real worker in node:
    1st mine -> block_broken? true | 2nd mine -> block_broken? false (correct: no double drop)
    BUT the 2nd still re-meshes: true -> full chunk re-mesh + collider rebuild for a NO-OP edit
  ```

**Water (id 9) is placeable by id but the mesher emits no faces — an invisible, non-colliding ghost voxel**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence
- *at:* `frontend/src/world/blockIds.js:36 (water: 9) vs frontend/src/world/terrain.worker.js:750-763 (every solidity test is `> 0 && !== 9`)`
- *player impact:* None today (water is not in the hotbar). A latent trap: the id table and the mesher disagree about what 'placeable' means, which is the same class of drift that produced the R4 diamond->stone bug.
- *why:* `idForBlock('water')` returns 9, and block-id-gates.test.js proudly asserts 'water is water, not sand'. But W2 moved the water surface to Ocean.jsx, so the greedy mesher treats 9 as non-solid and emits ZERO faces for it. A placed water voxel is invisible, has no collider, and yet is a real entry in the chunk array + the save. It is not reachable today because 'water' is not in HOTBAR_BLOCKS — but the id-space gate says it is a first-class placeable block, so the next person who adds it to the hotbar or a recipe ships an invisible block.
- *executed evidence:*
  ```
  PROBE-H, real worker in node:
    verts before 4428  after placing water 4428 => water voxel emits NO faces: INVISIBLE + NO COLLIDER
    mining that water back -> block_broken? true (fires, dropping a "water" item)
  ```

**The spawn chunk is ALWAYS a dungeon chunk — sin(0) = 0**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/world/terrain.worker.js:250-253 (`isDungeonChunk`: `Math.sin(dcx*12.9898 + dcz*78.233) * 43758.5453`, frac < 0.025)`
- *player impact:* Small in practice — stampHomeAnchor and stampHub run AFTER stampStructures and fill most of the room back in with stone, so a partial dungeon sits buried under the Hearth. But it is a determinism ACCIDENT, not a design choice, and any future change to the Hearth footprint (or a player mining down at spawn) will expose a half-eaten dungeon room. Worth replacing with the imul hash already used in landmarks.js/oreGen.js.
- *why:* At (0,0), sin(0) = 0, so hash = 0, frac = 0, and 0 < 0.025 is unconditionally TRUE. The origin chunk is not a 2.5% roll — it is a guaranteed dungeon. The sin-based hash is also a poor chunk hash generally (periodic, loses precision at large coords).
- *executed evidence:*
  ```
  Executed against the real worker: `isDungeonChunk(0,0) === true`. Measured rate over 81x81 chunks: 176/6561 = 2.68% (the code comment claims 2.5%). The blueprint centre is world (8, 12, 8), i.e. 8 blocks from the origin at y=12..17.
  ```

**OBSERVATION (render domain, not worldgen): the underground has no lighting model — caves read as flooded navy**
- *domain:* World: terrain, biomes, ocean, worldgen
- *at:* `src/render/Atmosphere.jsx:26-28 (FOG_SEA_LEVEL=56 -> heightMul 1.0 for ALL y<=56), :208 ambientLight, :224 hemisphereLight`
- *player impact:* Underground is a flat blue murk where you cannot tell coal from stone from diamond by sight. Combined with finding #1 (the teal plane) it reads as 'the cave is flooded'. I am flagging it because it is what the player ACTUALLY sees underground, but the fix belongs to the render/lighting domain, not worldgen.
- *why:* I want to be explicit that I checked and REJECTED the obvious hypothesis: the old in-mesher 'ocean depth tint' really was removed (ocean-depth-tint-gates.test.js asserts its absence, and grepping Terrain.jsx confirms). The navy cave is instead the outdoor sky ambient + hemisphere light plus the sky-coloured height-fog at FULL density (everything at y<=56 gets heightMul 1.0). There is no torch/cave lighting system.
- *executed evidence:*
  ```
  LIVE PUPPETEER CAPTURE probeB-cave-looking-up.png (camera at world (-19, 22, -37), looking up): the entire cave is drenched in dark navy; stone, coal and ore textures are nearly indistinguishable. probeC (same area, above ground) is normal green/snow — so it is strictly a below-surface effect.
  ```
