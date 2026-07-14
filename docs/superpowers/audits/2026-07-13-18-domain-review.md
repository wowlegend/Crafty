# The 18-Domain Deep Review — MEASURED coverage + 91 refutation-surviving bugs

> **Run** `wf_e310cbcd-7b8` — started 2026-07-13, killed mid-flight by an API session limit, recovered from the
> run journal and **completed 2026-07-14**. 18 domain agents + 187 executed probes + 135 independent
> refutation agents. ~5M subagent tokens.
>
> **The design that makes this trustworthy: the evaluator is not the generator.** Each of the 135 raw findings
> was handed to a *separate* agent whose job was to KILL it. That is the arXiv 2606.26300 result applied
> (unit-test-as-verifier is exploitable; an independent judge is not).
>
> **91 survived. 43 were killed** — and the refuters earned their keep: they threw out 22 LOW/15
> MEDIUM/6 HIGH claims as no-player-impact or plain wrong, and caught one agent citing **fabricated evidence**.
>
> Machine-readable: `2026-07-13-18-domain-review-raw.json` (findings + coverage + every verdict).

## 1. The measured coverage number (REPLACES the inherited "0.5% of 185")

Each domain agent enumerated its features and measured how each one is *actually* validated. **650 features:**

| How the feature is actually validated | Features | Share |
|---|---:|---:|
| Behavioral test (drives the code; goes RED on a real break) | 276 | 42.5% |
| Live probe (real browser / real worker) | 24 | 3.7% |
| **Source-grep only** — proves the code EXISTS, not that it RUNS | 156 | 24.0% |
| Visual-diff only (6% pixel gate) | 20 | 3.1% |
| **Nothing at all** | 174 | 26.8% |
| **TOTAL** | **650** | |

**Real validation = 300/650 = 46.2%.**  The other 53.8% is a text-assertion, a loose pixel diff, or nothing —
and that is precisely where these 91 bugs were hiding.

*(The old "of 185 features, ONE (0.5%) is validated" line was inherited from `AUDIT-2026-06-28-full-status.md`,
which agent-audited 10 of its 18 domains and inventory-inferred the rest. It was never a measurement.)*

### Per-domain

| Domain | Features | Behavioral | Probe | Grep-only | Visual-only | **None** | Confirmed bugs |
|---|---:|---:|---:|---:|---:|---:|---:|
| Boss + the Blight-Heart win state | 40 | 7 | 0 | 10 | 3 | **20** | 3 |
| UI panels — inventory, crafting, trading, qu | 40 | 16 | 1 | 4 | 3 | **16** | 7 |
| NPCs, hub, mobs, AI worker | 50 | 12 | 0 | 21 | 2 | **15** | 8 |
| Voxel editing: mine / place / block round-tr | 30 | 8 | 0 | 7 | 0 | **15** | 3 |
| Progression | 35 | 18 | 2 | 2 | 2 | **11** | 3 |
| Desktop input — verb router, pointer-look, k | 35 | 14 | 0 | 10 | 0 | **11** | 4 |
| Crafting, recipes, coins, trading economy | 29 | 15 | 1 | 3 | 0 | **10** | 6 |
| Day/night, siege, weather | 41 | 20 | 2 | 10 | 0 | **9** | 4 |
| Save / load / persistence / migration | 29 | 15 | 1 | 4 | 0 | **9** | 7 |
| Combat: melee, damage, telegraphs, hitstop,  | 40 | 20 | 1 | 11 | 0 | **8** | 5 |
| Spells / magic | 36 | 18 | 1 | 8 | 1 | **8** | 9 |
| The four Aspects | 51 | 29 | 1 | 14 | 0 | **7** | 7 |
| World: terrain, biomes, ocean, worldgen | 39 | 25 | 0 | 6 | 1 | **7** | 8 |
| Quests + achievements | 27 | 9 | 1 | 8 | 2 | **7** | 3 |
| Loot, inventory, equipment, affixes | 38 | 25 | 4 | 2 | 0 | **7** | 3 |
| Touch / mobile input | 25 | 8 | 5 | 5 | 1 | **6** | 6 |
| UI/HUD — bars, compass, minimap, ability bar | 37 | 6 | 3 | 18 | 5 | **5** | 4 |
| Audio | 28 | 11 | 1 | 13 | 0 | **3** | 1 |

## 2. The 91 confirmed bugs (survived an independent refuter)

Independently re-derived by me before integration: hub-NPC melee kill (`mobsQuery` has no `isNPC`/`isStatic`
guard — confirmed), free block placement (confirmed), the sword tree (confirmed, and I re-computed it: exactly
4 recipes are unmatchable, exactly the swords — `normalizeGrid` trims the player's grid to its bounding box,
and the 4 sword patterns are the only ones declared with null-padded outer columns).


### CRITICAL

**Melee permanently kills all 4 hub questgivers (merchant / smith / guide / healer) -- 2.7s of holding LMB**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames  ·  *at:* `src/systems/CombatSystem.jsx:174 (checkMobsInMeleeCone) + :22 (damageMob) + src/world/npcSpawn.js:24`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — and the reachability is WORSE than the claim states. verbRouter.js:25 `if (meleeHit) return 'attack'` is fed by meleeHit (Components.jsx:438), computed from the SAME unguarded cone. So a hub NPC standing in the cone hijacks LMB into 'attack' ahead of 'mine'. The player need not intend to attack anyone: standing at the merchant stall and left-clicking to mine a block routes to a swing at Bram
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
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/data/recipes.js:9-28 (the 4 sword recipes) × /Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:27-54 (normalizeGrid) and :75 (RECIPES.find(gridsEqual))`
- *verdict:* CONFIRMED (mechanical defect) — but headline, severity, and "PROBE H" evidence REFUTED
- *player impact (refuter's words):* REAL BUT MUCH SMALLER THAN CLAIMED. What genuinely happens: a player who mines iron/diamond, opens the crafting table, and lays out the universal two-materials-plus-a-stick vertical sword pattern gets nothing — the result slot stays Empty. All 4 sword recipes are dead rows, and the ore->weapon sink at the table does not exist. That is a real, unfixed, player-facing defect deserving the one-line fi
- *executed evidence:*
  ```
  PROBE A drove the real CraftingTable and clicked the real grid cells for all 26 recipes: the 4 swords are the ONLY ones whose result slot reads "Empty" (all 22 others render their item). PROBE H then enumerated every grant path in the game — the real store's starting loadout, every row of LOOT_TABLES (11 mob tables), every row of CHEST_LOOT, dawnReward() for nights 1..100, and bossSystem's drops (Crown of the Dragon King / Dragon Scale) — and printed: 'Iron Sword (dmg 20): recipe UNREACHABLE; recipe (Nuggets) UNREACHABLE -- NO OTHER SOURCE' and 'Diamond Sword (dmg 35): recipe UNREACHABLE -- NO OTHER SOURCE'.
  ```

**Resuming a save made at NIGHT silently adds a night to the siege -- and it RATCHETS across every reload (persisted)**
- *domain:* Day/night, siege, weather  ·  *at:* `src/world/survivalSystem.js:17-25 (the day->night branch) + src/App.jsx:176 (useSurvivalMode mounted UNCONDITIONALLY at App top level) + src/store/useGameStore.jsx:858 (loadWorldData derives isDay from gameTime)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a real player hits this on an ordinary action. MenuSystem is rendered INSIDE App (App.jsx:774) and renders WorldManager with onWorldLoad={gameState.loadWorldData} (MenuSystem.jsx:170), so App — and useSurvivalMode with prevIsDay=true — is mounted the entire time the title/menu is up, before any world is loaded. The autosave (App.jsx:220-250) schedules on inventory/worldBlocks/ferocityBanked c
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
- *domain:* Loot, inventory, equipment, affixes  ·  *at:* `src/ui/TradingInterface.jsx:40 + :48 + :62-67 (deposit to blocks, spend from magic); src/store/useGameStore.jsx:589 (only writer); src/EnhancedMagicSystem.jsx:175 (reads magic.wand); src/data/recipes.js:127`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — a real player is affected on every playthrough. Interacting with any default-role villager (InputManager.jsx:206) opens the merchant. The player mines ore and trades it for crystals; the crystals visibly pile up (my probe: 35 earned) but land in inventory.blocks.crystals, while the merchant panel's Crystals counter and the "Crystals to Wand" affordability check both read inventory.magic.crys
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
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/workers/ai.worker.js:124 (`const [playerX, playerY, playerZ] = playerPos;`) and :166 (`distToPlayer2D = Math.sqrt(dx*dx + dz*dz)`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Severe and central, not theoretical. Crafty is a voxel game with a night-siege loop (SpawnerSystem ramps hostile spawns with nightCount) and a block-place verb — "build to survive the night" is the core fantasy, and every vertical defense against it is a no-op.

Measured player consequences: pillar up 30 blocks to escape a siege and the zombies at the base keep landing full 10-dmg hits at the exac
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
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/systems/CombatSystem.jsx:174 (`checkMobsInMeleeCone` = `mobsQuery.entities.filter(...)` — no isStatic/isNPC filter), :161 (`checkMobCollision` — same), :22 (`damageMob` — no guard)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and easy to hit, not theoretical. You spawn at the hub; the 4 NPC anchors are 9-13u out (hubLayout.js:13-18) and you must stand within melee range to press G and trade/craft/heal. Because the verb router treats an NPC in the melee/aim cone as a combat target, a left-click intended to mine a block next to Bram becomes a swing at Bram — 7 swings (32 dmg vs 200hp) and the shop is deleted for the
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
- *domain:* Progression  ·  *at:* `src/world/spellUpgrades.js:57-66 (hydratedRef one-shot) + :103-107 (push effect); src/App.jsx:181 (useSpellUpgrades mounts at boot); src/store/useGameStore.jsx:449 (spellLevels default {}), :873/:931 (loadWorldData sets store.spellLevels)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and unavoidable for any returning player. The ONLY way to resume a save is World Manager → Load (WorldManager.jsx:110-125), and that path always runs after GameApp has already mounted the hook with an empty store — so the restore is dead 100% of the time, not in an edge case. Impact 1 (needs only a load): every spell casts at Level 1 for the entire session — Fireball III deals 50 instead of 1
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
  ```

**Every "Defeat N mobs" quest completes at HALF the advertised cost — each kill counts twice**
- *domain:* Quests + achievements  ·  *at:* `src/QuestSystem.jsx:199 (the `quest.type === 'kill' && (type === 'kill' || type === 'kill_type')` match arm) + src/QuestSystem.jsx:317-318 (onMobKill fires updateQuestProgress('kill') AND updateQuestProgress('kill_type') for the same kill)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — a player experiences this on their very first mob kill, in the default fresh-save state.

first_blood and hunter are both `type:'kill'` and both sit in the fresh-save active set (QuestSystem.jsx:105 takes the first 3 tier-1 quests). champion and the entire endless bounty ladder (makeRepeatableQuest, line 67, `type:'kill'`, target 15+n*5) are also `type:'kill'`, so the whole late-game retenti
- *executed evidence:*
  ```
  PROBE 7/D6 (real hook, real mobKillBus): 'Defeat 5 mobs' -> COMPLETED after 3 kills. 'Defeat 50 mobs' -> COMPLETED after 25 kills. Bounty 'Defeat 15 mobs' -> COMPLETED after 8 kills. PROBE 1/P3 step-by-step: kill#1 -> 2/5, kill#2 -> 4/5, kill#3 -> 5/5 completed=true. PROBE 8/S1, rendered DOM text after ONE spider kill on a fresh save: QuestTracker = "Hunter ... 2/5", Achievements panel Stats cell = "1 Kills". Both on screen, contradicting each other.
  ```

**The kill_type mobType filter is DEAD — killing any mob advances EVERY targeted-hunt quest**
- *domain:* Quests + achievements  ·  *at:* `src/QuestSystem.jsx:197 (`if (quest.type === type) matches = true;` — fires for a kill_type quest whenever type==='kill_type', never comparing quest.mobType to extra.mobType). Line 198, the CORRECT mobType check, is unreachable dead code: it can only set matches=true when it is already true.`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, reachable in ordinary play, but severity is INFLATED (claim says CRITICAL; honest grade is HIGH). Reachability: all 5 kill_type quests (zombie_slayer, spider_hunter, ember_hunter, undead_destroyer, brute_breaker) enter the active set via the normal claim drip-feed, and the targets are real spawning content — moss_brute is a 220-HP, weight-0.25 rare heavy tank with its own loot table (src/gam
- *executed evidence:*
  ```
  PROBE 1/P2 (one SPIDER kill, real bus): zombie_slayer(wants zombie) 1/10, ember_hunter(wants emberhusk) 1/10, brute_breaker(wants moss_brute) 1/5 — ALL advanced. stats.kills_by_type = {"spider":1} (correct). PROBE 7/D6, killing ONLY spiders: 'Defeat 5 moss brutes' -> COMPLETED after 5 spider kills. 'Defeat 25 skeletons' -> COMPLETED after 25 spider kills. 'Defeat 10 emberhusks' -> COMPLETED after 10 spider kills.
  ```

**The autosave DESTROYS the player's world on their next visit: nothing auto-resumes the save at boot, but the autosave still targets the SAME world slot**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/App.jsx:220-261 (autosave effect, deps []) + src/store/useGameStore.jsx:967-973 (saveActiveWorld reuses getActiveWorldId()); loadWorldData is called from exactly ONE place: src/MenuSystem.jsx:170 -> the WorldManager 'Load' button`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — on the DEFAULT player path, no World Manager interaction required.

Session 1: player boots, clicks "Start Adventure", plays. The autosave mints slot local_X on its first fire and persists level/coins/blocks/inventory/win-state there. Player closes the tab.
Session 2: player returns. There is no Continue/Resume, and nothing calls loadWorldData at boot, so they land on the title menu with the
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
- *domain:* Spells / magic  ·  *at:* `src/systems/CombatSystem.jsx:160-168 (checkMobCollision); consumed at src/EnhancedMagicSystem.jsx:331`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, real and severe. You aim dead-centre at a monster and your spell kills the settler standing beside it — reproduced on all four spells, with the aimed target taking zero damage. In any pack you cannot focus-fire: which mob eats your shot is decided by ECS bucket order, which is not insertion order and flips between runs, so it is effectively arbitrary.

Worst case is unrecoverable: the 4 stati
- *executed evidence:*
  ```
  PROBE P24 (magic4.probe.test.jsx -- real EnhancedMagicSystem useFrame + real CombatSystem + real miniplex ECS, fresh world, controlled insertion order zombie->villager->cow):
    ### P24 mobsQuery order = 3,2,1
    ### P24 aimed DEAD AT the zombie. damageMob calls = [{"id":2,"dmg":162},{"id":1,"dmg":48},{"id":3,"dmg":34}]
    ### P24 zombie= 952 /1000 | VILLAGER= -42 /120 | COW= 46 /80
  Camera at (0,140,0) looking straight down -Z; the zombie is at (0,140,-10) -- dead centre of the crosshair. The 162-damage DIRECT hit landed on id=2, the VILLAGER standing 2u off-axis at (2,140,-9). The villager ended at -42/120 HP: dead.
  ```

**The joystick knob is 100% TRANSPARENT and every touch-button ink border is silently dropped -- bare var(--ui-*) against space-separated RGB-CHANNEL tokens**
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControlsSurface.jsx:11-12 (and BTN() at :16-20, ring/knob at :53-58)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Reachable by every real touch player: TouchControls.jsx:28 `if (!isTouchDevice()) return null;` -> TouchControlsLive -> the same <TouchControlsSurface> (line 118) I probed, so this is not capture-only or dead code. On any phone/tablet the joystick thumbstick knob is 100% transparent (the W4-T11 rAF knob-follow at TouchControls.jsx:74-81 animates an invisible element -> zero directional feedback), 
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
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControls.jsx:126-127 (hit: right:8) vs src/ui/TouchControlsSurface.jsx:76 (glyph: right:64)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and unavoidable on every touch device. (1) The drawn Pause glyph is dead: tapping the visible || icon does literally nothing (swallowed as a look-zone touch) — verified live. (2) The Settings gear is unreachable: its center sits inside the transparent Pause hit-button, which wins on z-order (z-40 vs z-20), so tapping the gear pauses the game and kicks the player to the tap-to-play screen inst
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
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/TradingInterface.jsx:24-75 (executeBlockTrade/executeCrystalTrade) + :93-97 (trades table) + :144,148,151 (readouts); src/EnhancedMagicSystem.jsx:175; src/store/useGameStore.jsx:589,595`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and on the ordinary play path — not theoretical. npcSpawn.js:11 spawns "Bram the Trader" (role:'merchant'); the G-interact opens the panel (InputManager.jsx:206 -> MenuSystem.jsx:189). A player who mines 16 stone and trades it watches the stone vanish and the merchant's Crystals counter refuse to move (it sits at the starting 8 — note the claim's prose says "stays at 0", which is wrong; the c
- *executed evidence:*
  ```
  PROBE 1 (vite-node, real store): FRESH GAME magic.crystals=8, blocks.crystals=undefined. After the real executeBlockTrade body for 'Stone to Crystal': blocks.stone 16->0, blocks.crystals=1, magic.crystals STILL 8. Wand-trade row: 'Have' reads 8, need 15 -> canTrade=false. After the real executeCrystalTrade body: blocks.wand=1, magic.wand still 1 -> applyWandFocus(15, magic.wand=1)=14 (the purchased wand contributed NOTHING; with it counted it would be 13). Panel prints '-6% spell mana' -- the starting wand's discount, unchanged by the purchase.
  PROBE 2 (grind simulation): seeded 1000 gold, ran the Gold->Crystal trade 500x + crafted the 'Magic Crystal' recipe 50x -> blocks.crystals = 700, magic.crystals = 8. 'Crystals to Wand' row: Have=8, Cost=15, button enabled? FALSE. PROVEN UNREACHABLE.
  PROBE 3: `npx vitest run tests/integration tests/gates/wand-economy-gates.test.js tests/gates/inventory-flat-bucket-gates.test.js ...` -> 11 files / 37 tests, ALL PASSED. The bug ships green.
  ```

**The player's HEALTH BAR is 100% invisible during normal play — the QUESTS panel is painted on top of it (mana bar 59% buried)**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker  ·  *at:* `src/HUD.jsx:547 (stat stack `absolute top-16 left-4 z-20`) vs src/QuestSystem.jsx QuestTracker (`absolute top-4 left-4 z-20`, maxWidth 280); same z-index, QuestTracker is LATER in HUD.jsx DOM (line 594 > 547) so it wins the paint`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and immediate for DESKTOP players in the default state. QuestTracker computes `expanded = userToggled === null ? !touch : userToggled`, so desktop boots EXPANDED and the opaque panel covers the health bar completely from the first frame of play. The single most important survival readout in a build-by-day/survive-the-night RPG is unreadable, and the night baseline (explore-night.png) confirms
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
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence  ·  *at:* `frontend/src/world/Terrain.jsx:657 (requestedChunks), :592-595 (load_modifications_done handler), :683-702 (the request guard + cull)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a player hits this. "Load World" is reachable from the in-game settings/pause menu (MenuSystem.jsx:170 -> WorldManager onLoad -> gameState.loadWorldData). GameScene/Terrain mounts unconditionally at page-load, so the streamer has ALWAYS populated requestedChunks around spawn by the time a player can click Load. Clicking Load on a save leaves the terrain permanently gone: 0 chunks, no meshes, 
- *executed evidence:*
  ```
  LIVE Playwright against the real booted game (2 independent runs).
  RUN 1 (PROBE-H1): `CHUNKS before load: 81` -> loadWorldData via the REAL save path (saveActiveWorld -> localStorage -> loadWorldData) -> `CHUNKS after load, 1s samples over 10s: [0,0,0,0,0,0,0,0,0,0]` -> `VERDICT: WORLD DID NOT REBUILD (81 -> 0)`. Ten seconds is ~67 ticks of the 150ms streamer loop.
  RUN 2 (PROBE-H1b, mechanism isolation): `chunks before load: 44` / `chunks after load: 2` / `worker health check: worker replied with 5536 verts` (worker is ALIVE — I asked it directly for chunk 99,99) / then teleported the player to VIRGIN chunk keys the guard has never seen -> `chunks after teleport: 32`. Already-requested keys are permanently blocked; never-seen keys load fine. That isolates the stuck `requestedChunks` Set as the cause and rules out a dead worker.
  ```

**The ocean plane renders INSIDE every inland cave and mineshaft — a fake turquoise sea 1000+ blocks from any water**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/render/Ocean.jsx:38-60 (ungated useFrame, mesh pinned at y=SEA_LEVEL, frustumCulled={false}) + src/GameScene.jsx:212 (<Ocean /> mounted unconditionally)`
- *verdict:* CONFIRMED (with material corrections: claim's screenshot/mechanism REFUTED, severity inflated CRITICAL -> HIGH/MEDIUM visual bug)
- *player impact (refuter's words):* YES, real but narrower than claimed. A player exploring the large cavern system 13 blocks from spawn, standing on a genuine cave floor (1,124 such standable spots in 169 chunks) and looking down/across, sees a bright animated turquoise sea filling the cave — with zero actual water anywhere in 169 chunks. Verified by rendered A/B from a real player eye position. Immersion/visual-integrity bug: the 
- *executed evidence:*
  ```
  LIVE PUPPETEER CAPTURE of the real app (probeA-cave-at-sealevel.png, camera driven to world (-19, 26, -30) via __craftyTest 'enterCapture'): I can SEE a bright turquoise Gerstner wave plane slicing horizontally through the middle of a solid rock cavern, clipping through the walls. That cavern is 42 blocks from spawn. Executed radial scan (16 directions, 1-block step, real computeHeight+oceanSurfaceY): the NEAREST actual water is 102 blocks away (180deg); on +X it is 1144 blocks. Executed census of the real worker's generateChunkData over 169 chunks around spawn: 0 columns contain ANY water voxel, yet 6,828 / 43,264 columns (15.8%) have AIR at exactly y=28. Control frame probeC (same spot, camera above ground) is clean — no plane, no tint — so the artifact is strictly below y=28.
  ```


### HIGH

**Spatial audio is DEAD until the first hostile mob spawns — footsteps, jump, swing and hit are SILENT at game start**
- *domain:* Audio  ·  *at:* `src/SoundManager.jsx:558 (`audioContext: audioContext.current` in the context `value`) + src/render/SpatialAudioController.jsx:75 (`if (!camera || !audioContext) return;`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* REAL but SMALL, and severity HIGH is inflated. I sized the actual window: SpawnerSystem.jsx:88 bursts 20 mobs on a 500ms poll once isSpawnChunkLoaded, and App.jsx:148-155 auto-pointer-locks the player 100ms after that same flag. So the player-controllable silent window is ~100ms to ~750ms after chunk-load (a lost footstep or two / a silent jump), plus a longer window if the player clicks "Start Ad
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

**A page reload mid-fight resets the 700-HP climax boss to full health and re-aggros it**
- *domain:* Boss + the Blight-Heart win state  ·  *at:* `src/world/bossSystem.js:11-18 (useState/useRef) + src/game/saveSchema.js:55 (only gameWon is serialized)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and player-facing. blightHeartSite() executes to {x:725,z:725} (1025 blocks from spawn) and BOSS_CONFIG.health is 700 across 3 phases — this is the game's climax, reachable at level 5 via the compass-marked lair. Autosave (App.jsx:219-261) flushes on beforeunload/visibilitychange and loadGame (useGameStore.jsx:845-935) restores world, level, inventory, questState, position and gameWon — so ev
- *executed evidence:*
  ```
  P11: fought the boss to 10/700 HP (phase 2), unmounted the hook and remounted it (what a page refresh does), walked back to the lair. Printed: 'before reload: hp=10 phase=2' -> 'AFTER reload: bossActive=true hp=700 phase=0 gameWon=false'.
  ```

**The boss never de-aggros, never de-spawns, never leashes - boss music, boss health bar and the obsidian danger grade lock ON forever**
- *domain:* Boss + the Blight-Heart win state  ·  *at:* `src/world/bossSystem.js:89 (the ONLY setBossActive(false) in the domain) + src/GameScene.jsx:249 (BossEntity mounted unconditionally) + src/render/BossEntity.jsx:169-247`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and reachable via the single most likely player action — dying to the climax boss. Engage the Shadow Dragon at the Blight Heart lair (1025 blocks from spawn), and for the rest of the session the boss battle music loops, the arpeggiator pins to 150bpm, the boss health bar stays welded to the HUD, and the whole world stays drenched in the dangerLevel=2 obsidian red grade — no matter where you g
- *executed evidence:*
  ```
  P9: spawned the boss at the lair, hit it once, then teleported the player back to spawn (0,0) - 1025 blocks away - and advanced 5s of timers. Printed: 'after fleeing 1000 blocks: bossActive=TRUE hp=600 dangerLevel=2'. Structural grep confirms no leash/despawn/maxDist token exists in bossSystem.js or BossEntity.jsx.
  ```

**A pack of N enemies deals the damage of ONE: the 500ms global lockout caps ALL incoming damage at 2 hits/sec**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames  ·  *at:* `src/store/useGameStore.jsx:747 (`if (now - state.lastDamageTime < 500) return;`)`
- *verdict:* CONFIRMED (mechanism + player impact real; stated magnitude INFLATED ~4x)
- *player impact (refuter's words):* REAL, and reachable in normal play through three live damage paths. Honest magnitude (correcting the claim's 4x overstatement): incoming damage is hard-capped at 2 hits/sec, i.e. roughly 3.8 melee mobs' worth of DPS — so every attacker beyond ~4 concurrent contributes EXACTLY ZERO. A 20-mob siege is ~4x a lone zombie, not 20x; ~80% of a horde's swings are deleted (and the mob still burns its own 1
- *executed evidence:*
  ```
  Probe P1/P3/P4 (vitest, REAL useGameStore):
    5 x damagePlayer(10) => playerHealth = 90   (would be 50 if all land)
    3 simultaneous strikes: hits that LANDED = 1 /3 ; hp = 90
    hp after each of 10 hits @100ms apart: 90,90,90,90,90,80,80,80,80,80   <-- 10 hits, 2 landed
  ```

**Camera shake decays PER FRAME, not per second -- identical crit shakes for 1067ms @30fps vs 267ms @120fps**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames  ·  *at:* `src/Components.jsx:1236 (`store.triggerCameraShake(trauma * 0.85); // Decay`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a player experiences this on every hit. src/systems/CombatSystem.jsx:60 calls triggerCameraShake(isCrit ? 1.6 : 1.0, hitDir[0], hitDir[2]) on every player melee hit; EnhancedMagicSystem.jsx:136, HurlSystem.jsx:62 and BossEntity.jsx:296/385 also drive it. The shake therefore lasts ~1067ms on a 30fps laptop and ~267ms on a 120Hz ProMotion iPad — a 4x swing in the duration of the single most-fel
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
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TradingInterface.jsx:47-75 (executeCrystalTrade spends prev.magic.crystals, banks the item into prev.blocks) vs :35-42 (executeBlockTrade banks bought crystals into prev.blocks) vs /Users/kz/Code/Crafty/frontend/src/EnhancedMagicSystem.jsx:175 (reads inventory.magic.wand)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, reachable turn-1. npcSpawn.js:11 spawns 'Bram the Trader' (role merchant) and InputManager.jsx:206 opens TradingInterface on the interact key. A new player has magic.crystals=8 against a 15-crystal wand cost, and NOTHING can ever raise it — so the merchant's headline "Crystals to Wand" trade is greyed out permanently, showing "Have: 8" forever while the merchant's own Crystals counter stays f
- *executed evidence:*
  ```
  PROBE B clicked the REAL 'Stone to Crystal' Trade button 10 times in the rendered TradingInterface: 'magic.crystals = 8' (unchanged), 'blocks.crystals = 10', 'Crystals to Wand button disabled? -> true', 'Crystals shown in the merchant HUD -> 8'. 160 stone spent, zero progress toward the wand, and the merchant's own crystal counter never moved. PROBE C then pre-seeded 30 magic.crystals, clicked the real 'Crystals to Wand' button, and applied the REAL applyWandFocus() exactly as EnhancedMagicSystem:175 does: 'magic.wand = 0, blocks.wand = 1, spell mana cost before buy = 20, after buy = 20'.
  ```

**Placing a block is FREE (no inventory cost) while mining grants +1 — infinite diamonds, infinite everything, in seconds**
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/world/Terrain.jsx:819-848 (place() — zero removeFromInventory calls, zero inventory check) vs :581-591 (worker 'block_broken' -> store.addToInventory(blockForId(id), 1))`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — trivially reachable in normal play, not theoretical. place() is live code: registered at Terrain.jsx:893 on GameMethods.terrainVerbs and dispatched by the #72 verb router at Components.jsx:479. verbRouter.js:31-35 routes a right-click to 'place' whenever no mob is in the aim cone and terrain is within 8m, and a left-click to 'mine' — i.e. "look at the ground and click." Hotbar selection is u
- *executed evidence:*
  ```
  PROBE F replayed the two real lines (idForBlock at Terrain.jsx:826, addToInventory(blockForId(...)) at Terrain.jsx:590) against the real store and the real blockIds table, starting from an EMPTY inventory: 'after 10 place->mine cycles per hotbar block: {grass:10, dirt:10, stone:10, wood:20, glass:10, diamond:10, sand:10, cobblestone:10} — net cost to the player: 0 of anything.' It then fed 8 free diamonds into the REAL CraftingTable, clicked the real cells, and the result slot read '1x Diamond Chestplate' — crafted, inventory {diamond:0, Diamond Chestplate:1}. (Honest scope note: the '+1 on mine' half is EXECUTED; the 'place costs nothing' half is established by exhaustive callsite grep — 0 removeFromInventory in Terrain.jsx — because driving Rapier's raycast headlessly was out of reach.)
  ```

**Stars and a moon disc render in the sky at MIDDAY during every storm (~half of all daytime)**
- *domain:* Day/night, siege, weather  ·  *at:* `src/render/nightSky.js:12-16 (starIntensity) + src/game/weatherGate.js:11 (STORM_MOOD_BOOST = 0.85) + src/render/mood.js:91-94 (moodTarget MAXes weatherBoost in) + src/render/Atmosphere.jsx:182 (`u.uStar.value = starIntensity(moodRef.current)`) + Atmosphere.jsx:110 (shader `if (uStar > 0.001)` draws the star field + the moon disc)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and pervasive, on the game's most-seen surface.

REACHABILITY: WeatherSystem.jsx:99 toggles clear<->storm on a 90s setInterval with NO isDay gate (verified: `const states = ['clear','storm']` ... `}, 90000)`). A day half is ~150s (dayPhase.js:18 "a ~150s day half"). Storm is therefore active ~50% of the time and uncorrelated with day phase, so roughly half of all daytime is a storm. During ea
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
- *domain:* Day/night, siege, weather  ·  *at:* `src/HUD.jsx:80-81 and :102 (`rotate(${p.angleDeg - 180}deg)`) + src/game/dayPhase.js:26-30 (cycleFraction doc: "0=midnight, 0.25=dawn, 0.5=noon") -- but the real clock's gameTime 0 is the START OF DAY (dayNight.isDayAtUnit: day = [0,600))`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and always-on, but cosmetic. Booting a new world (gameTime 0, isDay true): the sky is broad daylight while the HUD dial shows the SUN at the BOTTOM of the ring, below its own drawn horizon line (HUD.jsx:101). The sun stays below the horizon for the entire first half of the day (gameTime 0-300 = the first ~75 real seconds of a 150s day half), sits exactly ON the horizon at true midday, and rea
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
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate  ·  *at:* `src/Components.jsx:387-412 (handleKeyUp) + src/Components.jsx:501-511 (listener set) — no 'blur'/'visibilitychange' listener anywhere in src/`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, not theoretical — it fires on the single most common desktop interaction. Hold W (or W+D), Cmd-Tab/Alt-Tab to Discord or a wiki, come back, click to re-lock: the character immediately walks/strafes at full 14.00 units/s with nothing held. It only stops when the player taps AND releases each stuck key individually — releasing W still leaves them strafing from D — which is deeply unintuitive b
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
- *domain:* Loot, inventory, equipment, affixes  ·  *at:* `src/QuestSystem.jsx:325  `const killTier = zoneTier(position?.x ?? 0, position?.z ?? 0);`  vs  src/systems/CombatSystem.jsx:141  `emitMobKill(entity.type, [entity.position.x, entity.position.y, entity.position.z], source)``
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and player-facing. There are no world bounds (grep for WORLD_SIZE/bounds/clamp: zero hits) and world/zoneTier.js sets TIER_RING=256, so tier 1 is only a ~256-block walk in an infinite voxel sandbox; tier 4 caps at 1024+.

The harm is an ASYMMETRY, which is what elevates it above cosmetic: SpawnerSystem.jsx:139 scales DANGER correctly -- `const pTier = zoneTier(playerX, playerZ)` (scalars, pro
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

**Two of the twelve achievements can NEVER unlock — updateLevel has zero callers**
- *domain:* Quests + achievements  ·  *at:* `src/QuestSystem.jsx:398-404 (updateLevel — the ONLY writer of stats.level) and src/QuestSystem.jsx:423 (returned from the hook). The real player level lives in useGameStore.level (src/store/useGameStore.jsx:129).`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but narrower than the HIGH rating suggests — I'd call it MEDIUM, not HIGH. Every player who levels up past 5 and 10 (which happens through normal play: mob-kill XP orbs, spells, crafting, boss kills, dawn rewards, quest turn-ins) still sees "Rising Star — Reach Level 5" and "Shining Star — Reach Level 10" as padlocked tiles, and the panel's counter can never exceed 10/12. Permanent, silent, 1
- *executed evidence:*
  ```
  PROBE 2/A1: set useGameStore.level = 10 (the real level source that SimpleExperienceSystem reads), then emitted a kill so checkAchievements actually runs. Printed: 'A1 store.level = 10 / A1 questSystem stats.level = 1 / A1 unlocked = [first_step, first_kill] / A1 has level5? false / A1 hook exposes updateLevel? function'. I also OPENED tests/visual/baseline/achievements-open.png: it renders 'Rising Star — Reach Level 5' and 'Shining Star — Reach Level 10' as padlocked tiles under a '1 / 12 unlocked' counter.
  ```

**Every autosave clobbers the player's chosen world name with `Save_<timestamp>`**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/store/useGameStore.jsx:972 (`writeWorld(id, { name: data.save_name, created_at: new Date().toISOString(), ... }, data)`) + src/game/worldSaves.js:35 (`list.unshift({ id, ...meta })`) + src/game/saveSchema.js:16 (`save_name: 'Save_' + new Date().toLocaleString()`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and guaranteed, but metadata-only — no data loss. Player creates a world named "Marcus's Castle" (or hits WorldManager Save, which names it "Guest's World - <date>"), places a single block, and 5 seconds later the World Manager index entry is renamed to `Save_<toLocaleString>`. The world blob itself is intact and still loads; what is corrupted is the index metadata: name (destroyed), created_
- *executed evidence:*
  ```
  probe2 P11 (real store + real worldSaves): 'after Create/Save-As: index name = "Marcus's Castle"' -> one saveActiveWorld -> 'after ONE autosave: index name = "Save_7/13/2026, 10:25:06 AM"; blob.name = "Save_7/13/2026, 10:25:06 AM"'. Confirmed LIVE in the browser: after a real play session the world list read `["Save_7/13/2026, 10:46:45 AM"]`.
  ```

**'Create New World' does not create a new world — it silently clones the current one**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/WorldManager.jsx:65-108 (createWorld: builds `freshBlob`, calls writeWorld + setActiveWorldId, but never resets the store and never calls loadWorldData)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — a real player is affected via a fully reachable UI path (Settings -> Manage Worlds -> Create New World -> Create).

The player asks for a new world (fresh run, or a second world for a sibling) and gets a copy of their old one: same level, coins, totalXP, talent points, chest loot, quest progress, and even the same inventory. Within 5 seconds, the first block placed / item picked up / quest t
- *executed evidence:*
  ```
  probe1 P4 (real store + real worldSaves): after Create + ONE autosave into the new slot -> 'blocks = 2 [["1_2_3",5],["4_5_6",2]]  level = 12  coins = 4321' — i.e. the old world verbatim. probe1 P3 (loading the exact freshBlob literal from WorldManager.jsx:73-88): 'level = 12 (fresh world should be 1) / coins = 4321 (should be 0) / totalXP = 99999 / talentPts = 9 / nightCount = 7 / chests = 1 entries -> [["10_5_10",{inventory:{Diamond:64}}]] (should be 0) / questState = {...old quests...} (should be null)'. Only worldBlocks was actually cleared.
  ```

**Chain lightning auto-zaps passive villagers and livestock (no passive/friendly filter)**
- *domain:* Spells / magic  ·  *at:* `src/game/chainLightning.js:10-46 (solveChainTargets); wrapper at src/EnhancedMagicSystem.jsx:55-75`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and serious. Cast lightning at any hostile within ~8u of a neutral and the chain silently fans into it — the player cannot aim or avoid it, since solveChainTargets picks its own targets by nearest-distance. Cows/pigs/settlers spawn ambiently (villager weight 0.6 in MOB_TYPES), and night sieges drive hostiles into the settlement, so a husk standing among your cattle or settlers is routine, not
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
- *domain:* Spells / magic  ·  *at:* `src/EnhancedMagicSystem.jsx:295-297 (`if (type === 'fireball' || type === 'iceball') projectile.velocity.y -= 12 * delta`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, not theoretical. `activeSpell: 'fireball'` (useGameStore.jsx:554) is the DEFAULT starting spell, and castSpell is the live gameplay path (store-bound, input-driven) — not dead code. Every enemy engagement range sits outside fireball's ~12.5m reach: mobs aggro at AGGRO_RANGE=20 (ai.worker.js:126), archer mobs shoot the player from ARCHERY_RANGE=12 (:128) — exactly at the cliff edge — and the 
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
- *domain:* Spells / magic  ·  *at:* `src/EnhancedMagicSystem.jsx:376-390 (the `case 'pierce'` branch)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — fully reachable, not dead code. arcane is a shipped, hotkey-bound spell: InputManager.jsx:130 binds Digit4 -> setActiveSpell('arcane'), it has an upgrade-tree entry (ui/SpellUpgradePanel.jsx:16, label '4'), and EnhancedMagicSystem is mounted at GameScene.jsx:243.

The UI literally promises the broken behavior. GamePanels.jsx:457: `{ name: 'Arcane', key: '4', damage: 60, mana: 18, description
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
- *domain:* The four Aspects  ·  *at:* `src/Components.jsx:477 (castFiredRef set unconditionally) + :785-788 (consume/spend); src/EnhancedMagicSystem.jsx:175 (mana guard returns) vs :214 (consumeImbueCast)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a player hits this on the KB+mouse path. Unlock Elemental Imbue, press Z with >=30 Resonance (white-gold ring on), then right-click while out of mana or inside the 333ms cast cooldown: the ring goes out, 30 Resonance (a third of the bank; Resonance is earned by mining/placing at 1-2 per block) is consumed, and NOTHING is cast — out of mana there is literally zero projectile. Out-of-mana right
- *executed evidence:*
  ```
  PROBE 12/13, importing the REAL elemancer.js + elemancerChannel.js + resonance.js and re-enacting the apply-site: `ARMED (ring on). Resonance still 100` -> `CONSUME -> spent 30 Resonance (now 70); _castArm := burning` -> `RESULT: Resonance = 70 (was 100) | zones spawned = 0 | imbue ring = OFF`. Then: `EnhancedMagicSystem:214 builds the projectile with imbueKind: consumeImbueCast() -> burning` on a cast that was never imbued.
  ```

**"Base-as-anvil" 3x fires on the natural GROUND — the Voidhand's marquee build-reward is free, and building is pointless**
- *domain:* The four Aspects  ·  *at:* `src/game/hurl.js:80 (resolveAnvil) + src/world/Terrain.jsx:878-889 (castWorldRay)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real. On open grass with zero blocks ever placed, ~32% of connecting Voidhand hurls — including the natural point-blank aim at a mob ~3m away — deal 3x damage (30 -> 90) and pop the gold "WALL HIT!" text plus the anvil ping. Because mob centers sit 1.6m below eye level, the player is aiming downward at essentially every mob, so the descending flight dir at impact reliably finds the ground within A
- *executed evidence:*
  ```
  PROBE 10, using the REAL makeHurl/stepHurlChunked/resolveAnvil to compute impact geometry on a flat field with ZERO player-built blocks: aim -20deg / mob 6m -> impact y=-0.01, flight dir.y=-0.334 -> anvil 3x -> 90 damage. aim -30deg / mob 4m -> dir.y=-0.461 -> 3x -> 90 damage. (Flat aims correctly give 1x/30.) HONESTY: I modelled the terrain collider as a ground plane; I did not drive the live Rapier world. What IS executed-proven from real code: resolveAnvil cannot distinguish a wall from the ground, and the impact dir.y values above come from the real flight integrator.
  ```

**A stray tap anywhere in the LEFT half kills a held joystick -- the player freezes with the stick fully deflected**
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/input/touchHandlers.js:39-44 (handleTouchEnd)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* YES — real, on the shipped iPad/iPhone touch build. The overlay makes the ENTIRE left half (minus the tray button) a move zone, and the HUD above it is pointer-events-none, so any second finger there — a regripping thumb, a resting finger, a tap on the quest tracker / combat log / the left half of the hotbar — is routed as a move-zone touch. When it lifts, all four move intents are zeroed while th
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
  ```

**The hotbar physically overflows the phone viewport -- 2 of 9 blocks are entirely off-screen on an iPhone**
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/GameHud.jsx:20-24 (MinecraftHotbar: fixed 9 x 62px slots, centred, no wrap/scroll)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but narrower than claimed. Every phone player sees a hotbar that physically bleeds off BOTH screen edges — 2 of 9 slots entirely off-glass on an iPhone 13, 4 of 9 on an iPhone SE, with no horizontal scroll to reach them. That is a permanent, visible layout break on the mobile build, and the pinned visual baseline (mobile.png) has been cementing it as "correct".

Functionally, the exclusive lo
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
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/panels/CraftingTable.jsx:22 (grid is React-local useState), :79-90 (handleGridClick removes from inventory on place), and src/MenuSystem.jsx:122-130 (`{gameState.showCrafting && <CraftingTable/>}` -> close UNMOUNTS, grid state is discarded)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* REAL, and reachable in one keystroke/click by three separate routes, all live on HEAD: (1) the header X Button onClick={onClose}; (2) the Modal backdrop, dismiss-on-backdrop defaults ON and CraftingTable never disables it, so any stray click outside the panel while selecting materials wipes the grid; (3) ESC — InputManager.jsx:65-71, with any panel open ESC calls state.setShowCrafting(false), the 
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
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/SpellUpgradePanel.jsx:40 (`absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto`) -- same class string in src/ui/ChestInventoryPanel.jsx:29`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* A player presses U and the panel opens with ZERO scroll offset already showing the broken state — no title, no talent-point counter, no player level, and a close X that document.elementFromPoint proves is unclickable. The entire budget readout that drives the spend decision is invisible, so the player cannot see how many points they have while deciding which talent to buy. ESC/U still close the pa
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
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/GamePanels.jsx:252 (`h-[440px]` body) + :254 (column 1 is `overflow-y-auto`) + :326-337 (the Core Attributes Panel is `mt-auto`, i.e. pushed to the BOTTOM of that overflowing column)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and on the critical progression path. Every level-up grants 5 attribute points (grantXP → attributePoints += 5). The player levels up, opens the Inventory to spend them, and column 1 renders 492px of content into a 400px clipped column — the entire Core Attributes panel (the "{n} points to spend" banner AND all three allocate buttons) sits below the fold at scrollTop 0, with no badge, no bann
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
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker  ·  *at:* `src/ui/primitives/StatBar.jsx:18 (root is `inline-flex` = inline-level) + src/HUD.jsx:547 (container uses `space-y-2`, which only sets margin-top and CANNOT stack inline-level boxes)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — reachable from the first second of play, not theoretical. At default spawn the two vital bars sit side-by-side across the top-left, with the health bar entirely occluded by the QuestTracker panel and only part of mana visible. Once the Aspects unlock (late game), the stack becomes a 1232px ribbon spanning virtually the full 1280px viewport at eye level, cutting across the play area — the opp
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
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker  ·  *at:* `src/HUD.jsx:81 and :102 — `rotate(${p.angleDeg - 180}deg)`. Root cause: src/game/dayPhase.js:29-30 documents `cycleFraction 0=midnight, 0.5=noon`, but the LIVE clock (src/game/dayNight.js:48 `isDayAtUnit`: day = floor(t/600)%2===0, i.e. t in [0,600)) makes gameTime 0 = DAWN and 600 = DUSK. The -180 display offset should be -90.`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — every player, every session, continuously. DayPhaseDial mounts at HUD.jsx:545 gated only on `isPointerLocked && gameSystems.isAlive && isWorldBuilt` (the normal playing state); it is suppressed only in capture mode, which is a dev/test path. So this is not theoretical or dead code.

What the player actually sees: at spawn (gameTime 0, broad daylight, sun icon) the sun marker is rendered at t
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
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence  ·  *at:* `frontend/src/input/verbRouter.js:24-29 (left button has no chestTargeted branch) + frontend/src/world/Terrain.jsx:808-812 (mine() deletes the chest entry)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — fully reachable, and worse than the claim states. `chest` is HOTBAR slot 9 (Blocks.js), so any player can place one; the deposit UI is real and wired (ChestInventoryPanel.jsx:63 -> store.transferItem 'to_chest', which REMOVES the item from player inventory so the loot then lives ONLY in the chests Map); chests are persisted across saves (saveNormalizer.test.js:79 restores the chests Map), so
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
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/render/Ocean.jsx:38-60 (useFrame body; only guard is `if (!mesh) return`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but smaller than advertised. Every player pays an ungated ~1.68 ms/frame main-thread CPU sweep (~10% of a 60fps budget on a fast M-series Mac) plus a 331 KB/frame GPU re-upload, in EVERY location — including inside caves where the y=28 plane is fully buried in rock, and deep inland where it is occluded. There is genuinely no visibility, distance, or camera-height gate, so the cost is paid for
- *executed evidence:*
  ```
  Measured by importing the REAL oceanProfile.js and running the exact per-vertex math for 9,409 vertices x 120 frames in node/V8: 2.37 ms/frame of gerstner math alone = 14.2% of a 16.67 ms frame — and that EXCLUDES the BufferAttribute get/set churn and the 331 KB/frame upload that the real useFrame also pays. Executed transect: the nearest water on +X is 1,144 blocks from spawn, so at spawn this cost buys literally zero visible pixels.
  ```

**Greedy meshing destroys vertex AO — contact shadows vanish, and the ones that survive smear across 64-block quads**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/world/terrain.worker.js:757,760 (merge key = `blockType | (dir << 8)`; AO is NOT in the key) + :890-896 (AO sampled only at the merged quad's 4 corners)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a player sees this. The mesher is the only terrain mesher, runs on every chunk, and its AO output feeds an unconditional shader multiply (0.55x..1.0x albedo). On real generated terrain 59.6% of the top faces a player walks on/looks at are merged quads, and 56% of those quads' corners carry wrong AO with errors up to the full 0..3 scale.

Severity is directionally right but the claim's HEADLIN
- *executed evidence:*
  ```
  Drove the REAL worker (load_modifications + generate) with a synthetic chunk: flat stone plane at y<=40, air above, ONE stone block at (8,41,8). The emitted top (+Y) faces were 4 quads of area 128 / 64 / 56 / 7 blocks. Printed cornerAO: the 128-block quad ADJACENT to the pillar reads [3,3,3,3] — NO shadow at all. The 64-block quad reads [2,3,3,3] — a single AO=2 vertex, so the pillar's contact shadow is smeared across 8x8 blocks of ground. Total vertices with AO<3 on the entire plane: 4. A correct per-face AO would darken ~12 face-corners immediately around the block.
  ```


### MEDIUM

**The 'Shadow Dragon' is a purple box with grey planks for wings**
- *domain:* Boss + the Blight-Heart win state  ·  *at:* `tests/visual/baseline/boss-closeup.png (rendered from src/render/BossEntity.jsx:461-578)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — reachable in normal play, not dead code or a test-only fixture. frontend/src/world/bossSystem.js:37 is the real spawn path: playerLevel >= 5 AND the player travels within 24 units of the Blight Heart lair → setBossActive(true), with the notification "The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]". BossEntity is mounted in the live scene at frontend/src/GameScene.jsx:249 insid
- *executed evidence:*
  ```
  I READ the PNG. What I SEE: a flat, untextured dark-purple cuboid body; a lighter-purple cuboid head stuck on the front-left, visibly clipping INTO the torso at an offset (two different purples, reading as two different materials); two flat lavender ellipses for eyes with no pupils; two thin, flat, zero-volume SLATE-GREY quads jutting out sideways as 'wings' - they read as grey planks or rulers taped on, and the grey clashes with the purple body; two tiny spikes for horns. No neck, no legs, no tail, no claws, no teeth. It does not read as a dragon.
  ```

**The hitstop weight hierarchy collapses to 'crit' for any geared player -- the exact gap the feature was built to close**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames  ·  *at:* `src/systems/CombatSystem.jsx:39 (`const weight = damage >= 40 ? 'crit' : damage >= 30 ? 'heavy' : 'light';`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and easily reached, not theoretical. Iron Sword has a live recipe (recipes.js:15-22, iron or Iron Nugget + wood) and starting strength is 10 (useGameStore.jsx:145), so the moment a player crafts and equips their first iron sword, EVERY swing deals >=40 and therefore always fires max hitstop (130ms), max camera shake (1.6), and the 60-particle gold crit spark. A lucky crit becomes physically i
- *executed evidence:*
  ```
  Probe P16 (vitest, REAL solveMeleeDamage + REAL getWeaponBaseDamage + REAL HITSTOP table, CombatSystem:39 tier fn verbatim):
    weapon=Wooden Sword  base=5  | str10: nonCrit=20(light/45ms) crit=40(crit/130ms)
    weapon=Iron Sword    base=20 | str10: nonCrit=35(heavy/90ms) crit=70(crit/130ms) | str20: nonCrit=50(crit/130ms)
    weapon=Diamond Sword base=35 | str10: nonCrit=50(crit/130ms) crit=100(crit/130ms) | str40: nonCrit=95(crit/130ms)
  With a Diamond Sword, EVERY hit at EVERY strength is tier 'crit'.
  ```

**Closing the crafting panel with materials staged on the grid DESTROYS them**
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:22 (grid is component-local useState) + :79-90 (handleGridClick removes from inventory on placement) — no unmount cleanup anywhere in the file`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — and reachable via MORE paths than the claim states. InputManager.jsx's toggleUI closes EVERY panel before opening a new one, so setShowCrafting(false) fires on: Escape (:71, the panic key during a night siege), KeyC (:120 — the panel's own footer says "Press C to close"), the X button (:123), the Modal backdrop click (Modal.jsx:47), AND E / B / M / L / Tab (:101, :155) — so a player who taps
- *executed evidence:*
  ```
  PROBE D rendered the real CraftingTable with 6 Leather, clicked 5 real grid cells, then unmounted the panel exactly as pressing C / Esc / the X does: 'Leather after placing 5 in the grid : 1' -> 'Leather after CLOSING the panel : 1 (started with 6)'. Five Leather destroyed.
  ```

**Four recipes produce items that do not exist — and the result slot lies about what you are getting ("5x Bow" hands you 5 Arrows; there is no bow in the game)**
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/data/recipes.js:104-108 (Bow -> {Arrow:5}), :109-113 (Torch -> {torch:4}), :119-123 (Planks -> {planks:4}), :124-128 (Magic Crystal -> {crystals:4}); label rendered at /Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:178`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — and reachability is STRONGER than the claim itself argued. The starting loadout (useGameStore.jsx:583) is `wood: 16, coal: 8`, and `C` opens the crafting table (InputManager.jsx:120). So Planks (1 wood) and Torch (coal + wood) are both craftable in the FIRST MINUTE of a fresh game with zero mining. The player drops wood into the grid, the slot promises "4× Planks", the toast says "Crafted Pl
- *executed evidence:*
  ```
  PROBE I asked the real modules about every craft output token: 'Arrow (recipe LABELLED "Bow") placeable=false consumable=false equip=null -> *** DEAD ITEM ***'; same for torch, planks, and crystals. PROBE A confirmed the panel really does render the misleading label: the Bow row printed 'result slot: "5x Bow"'. Separately, PROBE F3 showed 'cobblestone' — an ingredient of Stone Pickaxe and Stone Sword — has NO legitimate source: worldgen never emits id 14 (the only 'cobblestone' hit in terrain.worker.js is a comment), blockForId(3) for a natural stone voxel returns 'stone', and it is not in the starting loadout. tests/gates/ore-drop-gates.test.js is green on this because it asserts idForBlock(ing) !== null — i.e. PLACEABLE — which is not the same as OBTAINABLE.
  ```

**Loading a save while the live phase is NIGHT wipes the loaded save's ferocity / kinetic / soul / resonance banks to zero**
- *domain:* Day/night, siege, weather  ·  *at:* `src/world/survivalSystem.js:27-36 (the night->day 'dawn bleed' branch, which also fires on a LOAD-induced isDay flip)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, reachable, not dead code. In-game path fully traced: ESC = "Settings / pause" (game/keyMap.js:34) plus a HUD Settings button (ui/GameHud.jsx:68) -> SettingsPanel.onOpenWorldManager (MenuSystem.jsx:155-157) -> WorldManager, whose load calls onWorldLoad(worldData) = loadWorldData DIRECTLY (WorldManager.jsx:119-120). There is NO window.location.reload in that path, so App stays mounted and the 
- *executed evidence:*
  ```
  PROBE D (live phase = NIGHT, load a DAY save whose banks are ferocity 90 / kinetic 80 / soul 70 / resonance 60):
    after load banks = {"ferocityBanked":0,"kineticBanked":0,"soulBanked":0,"resonanceBanked":0}
  PROBE E (CONTROL -- identical save, but the live phase is already DAY):
    after load banks = {"ferocityBanked":90,"kineticBanked":80,"soulBanked":70,"resonanceBanked":60}
  So the wipe is caused by the phase transition the load induces, not by the load itself.
  ```

**`dodge` is the ONLY intent with no keyup handler — it LATCHES while input is inactive and fires an uncommanded dodge-roll the instant play resumes**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate  ·  *at:* `src/Components.jsx:347-349 (keydown sets dodge) vs src/Components.jsx:387-412 (handleKeyUp has NO ShiftLeft/ShiftRight branch); consumer at src/Components.jsx:881-883`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and reachable, not theoretical. `InputManager.jsx` calls `document.exitPointerLock()` when the player opens the inventory/building tools (:111), achievements (:161), crafting via a smith NPC (:198), trading (:207), spell upgrades (:234), and settings — every one of these sets `active=false` while the window keydown listener stays attached and UNGATED. So a Shift press anywhere the pointer is 
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
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate  ·  *at:* `src/InputManager.jsx:96-117 (toggleUI) — closes only 6 of the 13 PANEL_FLAGS, but calls requestPointerLockSafely() unconditionally on close`
- *verdict:* CONFIRMED (mechanism + player-reachable trap) — with the headline chest scenario REFUTED
- *player impact (refuter's words):* YES, a player is affected — but via the merchant/trading panel, not the chest. Talk to a merchant villager (G) to open the trade panel, press E (muscle memory for inventory), press E again to dismiss it: the trade panel is still on screen, but the pointer is re-locked, so there is no cursor to click trade slots with, and LMB/RMB now mine/place blocks behind the visible panel (mutating the world un
- *executed evidence:*
  ```
  Real keys against the real app, with requestPointerLock/exitPointerLock instrumented:
    chest opened -> showChestInterface: true
    after E #1: {"inv":true,"chest":true,"lock":0,"unlock":1}   <- inventory stacks ON TOP of the chest
    after E #2: {"inv":false,"chest":true,"lock":1,"unlock":1}
    VERDICT: TRAP — pointer RE-LOCKED while the chest panel is still open
  ```

**No `e.repeat` guard: holding a panel key strobes the panel and thrashes pointer-lock, which can kill input entirely**
- *domain:* Desktop input — verb router, pointer-look, keybinds, intent gate  ·  *at:* `src/InputManager.jsx:58 (handleKeyDown) and src/Components.jsx:337 (handleKeyDown) — neither checks event.repeat`
- *verdict:* CONFIRMED (core defect) — but severity INFLATED and the stated causal chain REFUTED
- *player impact (refuter's words):* REAL but milder than claimed. Holding a panel key past the OS auto-repeat delay (~500ms macOS default) — trivially easy on E, the most-used panel key in a Minecraft-like, and also on C/B/M/L/Tab/U — makes the panel flicker open/closed at the repeat rate (~30/s) while pointer lock is exited and re-acquired ~15x/s each, so the cursor and mouse-look flicker with it. On key release the panel lands on 
- *executed evidence:*
  ```
  Real app, instrumented lock/unlock counters, 6 OS-style auto-repeat keydowns of E (repeat:true) + one keyup:
    6 auto-repeat keydowns of E -> {"inv":false,"lock":3,"unlock":3}
    VERDICT: STROBE — 3 exitPointerLock + 3 requestPointerLock from ONE held key
  ```

**The boss's unique legendary drop is unequippable, statless trash**
- *domain:* Loot, inventory, equipment, affixes  ·  *at:* `src/world/bossSystem.js:99-100 (grants 'Crown of the Dragon King' + 'Dragon Scale' x3); src/game/equipment.js:5-11 (SLOT_ITEMS omits both); src/store/useGameStore.jsx:16-39 (EQUIPMENT_STATS omits both)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and it lands on the single most emotionally loaded moment in the game. A player who reaches level 5, follows the compass to the Blight Heart lair, and kills the 700-HP Shadow Dragon (slow-mo hitstop, bloom spike, victory stinger, persisted win-latch, +600 XP) receives a LEGENDARY 'Crown of the Dragon King' and 3 EPIC 'Dragon Scale'. Because both are registered in items.js with correct rarity
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
  ```

**Mobs attack THROUGH solid terrain — there is no line-of-sight gate anywhere on the attack path.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/workers/ai.worker.js:265-273 (melee) and :251-254 (archery) — neither calls `hasLineOfSight`; the function (defined at :97) is used ONLY by the cover-seek branch at :202`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and reachable, not theoretical. Block placement is a live player verb (Terrain.jsx:819 `place(h)`, wired to the 'place' verb at Components.jsx:479), so a player can build a wall. Through a standard 1-block wall the mob stands ~2.0 world units from the player, inside MELEE_RANGE = 2.5, so it lands melee damage that reaches real HP (damagePlayer has no terrain gate). Skeleton archers (ARCHERY_R
- *executed evidence:*
  ```
  Real worker, 30-block-tall wall column placed between the mob and the player (heightGrid gx=5 -> world x=1; mob at x=0, player at x=2):
    melee hits landed = 2   <-- HITS THROUGH THE WALL
  And the LOS routine itself works when you actually call it (control): `hasLineOfSight(wall, 4,4, 4,8)` with a wall at (4,6) returns false. It is simply not wired to the attack path.
  ```

**Infinite free full-heal + full-mana at the healer NPC: no cooldown, no cost, no gate.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/InputManager.jsx:199-203 (KeyG, `role === 'healer'` branch) -> src/store/useGameStore.jsx:789-799 (healPlayer / restoreMana)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and reachable within the first minute of play. Walk ~13 units from spawn to Sister Wren in the starting hub, stand within 4 units, and tap G: instant full HP + full mana, repeatable at 0ms with no cost, no cooldown, no item, no currency, no quest gate. Verified 500 consecutive presses all restore to 100/100.

What makes this more than a balance nitpick: the game ALREADY has a designed, SCARC
- *executed evidence:*
  ```
  Executed the store actions VERBATIM from useGameStore.jsx:789-799 driven by the verbatim InputManager KeyG healer branch, over a real zustand vanilla store:
    hp/mana before      : 12 / 3
    after 1x G          : 100 / 100
    drain, G again (0ms): 100 / 100   <-- NO COOLDOWN, NO COST
    after 10,000 G press: 100 / 100   (unbounded)
  ```

**Cover-seeking reads the WRONG grid cells whenever the player is more than ~4 units away — the LOS call passes unclamped coordinates and the index silently wraps.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/workers/ai.worker.js:185-186 (`relPlayerX/relPlayerZ` computed, NOT clamped) then :202 (`hasLineOfSight(heightGrid, cx, cz, relPlayerX, relPlayerZ)`); contrast :302-303 where the main A* path DOES clamp with `Math.max(0, Math.min(8, ...))``
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and the claim UNDERSTATES it in two ways. Trigger is just "a mob you wounded below 25% while it's aggroed"; relPlayer goes out of grid range whenever the player is more than ~4 units away — i.e. most of the 20-unit aggro range. It is self-inflicted: cover-seeking's own retreat (with its 1.2x coverBoost) is what pushes the player out of range, so the feature corrupts itself the moment it star
- *executed evidence:*
  ```
  Called the REAL `hasLineOfSight` extracted from the worker:
    relPlayer = 14 4  (grid is 0..8 — OUT OF RANGE)
    endH = heightGrid[50] = 10     <-- reads cell (5,5), not the player
    wrap demo on a grid where grid[i]=i:  px=12,pz=3 -> idx 39 => silently reads cell (x=3,z=4), value 39
  Observable behaviour is only partly degraded — I drove the full worker and a wounded zombie still hides behind a real wall (isCoverSeeking=true, steers away from the player), and correctly finds NO cover on flat ground (control: isCoverSeeking=false at every distance). So the wrap corrupts WHICH cover cell is chosen, not whether cover-seeking fires at all.
  ```

**The spider's signature LEAP deals zero damage, applies no vertical impulse, and costs it a full attack cooldown — the 'fast aggressive leaper' is the second-weakest hostile.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/systems/AIWorkerSystem.jsx:41-52 (the `attack.type === 'leap'` branch sets `entity.knockback` and returns — it never calls `damagePlayer`) vs src/workers/ai.worker.js:261 (`pendingAttack = { id, type: 'leap', damage: 8, ... }`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — and more reachable than the claim argues. Because a freshly-spawned mob has lastAttackTime = 0, the leap gate (`now - lastAttackTime > ATTACK_COOLDOWN + 1000`) is ALWAYS open on first contact, so EVERY spider engagement opens with a 0-damage pounce: the player sees the telegraphed windup (380ms), the spider lunges ~1 unit horizontally with no vertical arc, deals nothing, and then cannot mele
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

**Spell Mastery rank pips are INVISIBLE for Fireball/Iceball/Lightning — Tailwind never compiles the dynamically-built bg-spell-* classes**
- *domain:* Progression  ·  *at:* `src/ui/SpellUpgradePanel.jsx:208 (`l < lvl ? `bg-spell-${elem}` : 'bg-track'`); tailwind.config.cjs:14-20 (safelist has only text-spell-*, no bg-spell-*)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and universal, and slightly worse than claimed. In tests/visual/baseline/progression-open.png all four spells read LEVEL 1/3, so `l < lvl` is true for l=0 and the first pip should be tinted on ALL FOUR — yet only Arcane's leading pip is visibly lighter. This is therefore not a high-rank edge case: EVERY player hits it at the default rank the first time they open the Progression panel. Firebal
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
- *domain:* Progression  ·  *at:* `src/App.jsx:233-248 (autosave transition-key predicate omits spellLevels AND attributes); src/game/autosave.js:8 (`flush() { if (timer !== null) ... }`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes. Open the pause menu, spend level-gated Fireball/Iceball/etc. upgrades (and/or allocate attribute points), close the tab -> reopen and you're back at Fireball I with the points unspent. Recoverable, not corrupting: upgrades are free and level-gated, so the player just re-clicks them — but it reads as the game eating progress.

Genuinely intermittent, which is why it survived: the autosave's sa
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

**Loading a versionless / legacy / fresh blob silently inherits the CURRENT character; SAVE_VERSION is written but never read**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/game/saveSchema.js:9 (SAVE_VERSION = 2) and :61-68 (migrateSaveData does no version dispatch at all) + src/store/useGameStore.jsx:862-883 (`prog?.level ?? state.level` etc. for every progression key)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and reachable today without any legacy save. The claim's headline (SAVE_VERSION never read) is actually its WEAKER half — largely latent, since no player has a v99 save and a v1 save requires a pre-A3 localStorage entry. The live harm is the WorldManager path: createWorld's freshBlob omits `progression`, `chests`, and `questState`, so it trips the `?? state.X` fallback that was written for l
- *executed evidence:*
  ```
  probe1 P6: 'SAVE_VERSION = 2'; 'migrateSaveData(v99) returned version = 99 (no rejection)'; 'loaded a v99 save blindly -> level = 3 coins = 7'; 'loaded a VERSIONLESS (v1) save -> level = 8 (kept 8: silently inherits the CURRENT character)'. probe1 P3 shows the same inheritance for the WorldManager fresh blob (level 12 / coins 4321 / chests / questState all carried over).
  ```

**Save failure is completely silent — quota exhaustion or Safari Private Mode means the game never saves and never says so**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/store/useGameStore.jsx:972 (ignores writeWorld's boolean return) + src/game/worldSaves.js:11-13 (safeGet/safeSet swallow every throw) + :29-38 (writeWorld returns false on a failed write)`
- *verdict:* CONFIRMED (with a stale premise corrected and severity trimmed to LOW-MEDIUM)
- *player impact (refuter's words):* Real, but narrower and rarer than the claim asserts. Both failing paths are player-reachable: autosave is fully wired (App.jsx:220-260, transition-subscribe + flush on visibilitychange/beforeunload), and WorldManager is reachable via Settings -> "Open World Manager" -> Save World (MenuSystem.jsx:167, GamePanels.jsx:801). When a write fails, autosave says nothing at all, and the manual Save button 
- *executed evidence:*
  ```
  probe2 P10 (real store; Storage.prototype.setItem monkeypatched to throw QuotaExceededError): 'saveActiveWorld under a FULL localStorage: returned no-throw; setItem attempts swallowed = 2; worlds in index = 0; active id = null; -> the save silently did nothing; saveActiveWorld returns undefined'. Same probe measured the real blob size so the quota risk is quantified, not guessed: '20,000 player-edited blocks -> blob = 305737 bytes (0.29 MB); blocks affordable at a ~5MB quota ~= 342,966' — so ordinary building will not hit quota, but private mode / storage pressure will.
  ```

**Fireball's burn DoT shakes the camera and hitstops the player once per second, for free**
- *domain:* Spells / magic  ·  *at:* `src/EnhancedMagicSystem.jsx:39-53 (applyBurnEffect) -> src/systems/CombatSystem.jsx:38-42 (hitstop) + :59-61 (camera shake)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — reachable on the default spell. fireball is castSpell's default and spells.js:27-31 arms `secondary: {type:'burn', duration:4, damagePerSecond:8}`, so EVERY connecting fireball triggers it. For the next 4 seconds, with zero player input, each burn tick fires a camera shake of magnitude 1.0 (the SAME magnitude as a full melee connect; crit is 1.6) and clamps player movement to zero for 45ms, 
- *executed evidence:*
  ```
  PROBE P15 (magic2.probe.test.jsx, real system, fake timers; after the direct hit the player does NOTHING):
    ### P15 on the direct hit: cameraShakes = 2 | hitstop writes = 1
    ### P15 after 5s of BURN ticks (player did NOTHING): +cameraShakes = 4 | +hitstop writes = 4
    ### P15 shake magnitudes = [1.6,0.4,1,1,1,1]
  (P5 separately confirms the burn itself is correct: exactly 4 ticks of 8 damage = 32, matching the spell's duration:4 / damagePerSecond:8.)
  ```

**Corpses eat your spells for 320ms after a kill**
- *domain:* Spells / magic  ·  *at:* `src/systems/CombatSystem.jsx:160-168 (checkMobCollision has no health filter) + :144 (`entity.dyingUntil = now + DEATH_DISSOLVE_MS`, deathFx.js:7 = 320ms)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and felt in the core combat loop. Killing the front mob of a pack and keeping the trigger down is THE most common way players fight. On the kill, an entity whose render scale has collapsed to 0 (dissolvePose(t>=1) => scale 0, clamped to 0.001 at MobModel.jsx:141) stays in mobsQuery as a fully valid, INVISIBLE spell hitbox with a generous 2.7u capture radius (fireball size 1.2 + 1.5).

The ve
- *executed evidence:*
  ```
  PROBE P3 (magic.probe.test.jsx, real system). Mob 1 at z=-8, mob 2 (LIVE) at z=-14. Kill mob 1 via the production damageMob path, then cast a fireball straight down the same line:
    ### P3 corpse: health = -4000 | dyingUntil set = true | STILL in mobsQuery = true
    ### P3 fireball damageMob calls = [{"id":1,"dmg":60,"type":"fireball"}]
    ### P3 corpse health = -4060 | LIVE mob health = 1000 (1000 => the corpse ate the shot)
  ```

**Spell secondaries do NOTHING to the boss -- the climax fight has zero elemental depth**
- *domain:* Spells / magic  ·  *at:* `src/EnhancedMagicSystem.jsx:396-416 (the boss branch calls store.damageBoss and returns; it never runs the `spellConfig.secondary` switch)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, real and player-facing. bossSystem.js:36-56: at playerLevel >= 5, arriving within 24u of the compass-marked Blight Heart lair awakens the Shadow Dragon with the notification "The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]" (700 HP, 3 phases). This is the game's intended climax encounter and spells are a core combat verb (castSpell is input-wired). In that fight: fireball's 4s/8
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
- *domain:* The four Aspects  ·  *at:* `src/game/voidhand.js:26-36 (PHANTOM_BLOCK_COLORS, covers ids 1-9 only) vs src/world/blockIds.js (id space now runs to 15); consumed at src/Components.jsx:637 and passed to requestHurl at :645`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, reachable, cosmetic. Reachability is closed: voidhand_grasp is a genuine unlockable talent (talentTree.js:18, prereq voidhand_force, bound to V in keyMap.js:22) gated only on banked Kinetic. Cobblestone, glass and diamond are obtainable ONLY by player placement, and the grab tint resolves ONLY player-edited (worldBlocks) voxels — so these are precisely the blocks the feature was built to ide
- *executed evidence:*
  ```
  PROBE on the REAL blockIds.js + Blocks.js + voidhand.js, cross-joining HOTBAR_BLOCKS against both tables: `glass | id 15 | real #F0F8FF | PHANTOM undefined | *** BEIGE FALLBACK ***`; `diamond | id 13 | real #4FD0E7 | PHANTOM undefined | *** BEIGE FALLBACK ***`; `cobblestone | id 14 | real #7F7F7F | PHANTOM undefined | *** BEIGE FALLBACK ***`. 3 of the 9 hotbar-placeable blocks. Separately: id 8 is now `cactus` but is tinted '#7A5A38' (tree-trunk brown) — a stale mislabel.
  ```

**Element zones are infinite vertical cylinders — they burn, slow and annihilate through solid floors**
- *domain:* The four Aspects  ·  *at:* `src/game/elementZones.js:25 (`const d2 = (a,b) => (a.x-b.x)**2 + (a.z-b.z)**2` — Y dropped) and :103-126 (applyZoneEffects uses the same x/z-only test)`
- *verdict:* CONFIRMED (mechanism) — but evidence FABRICATED and severity INFLATED; true severity LOW
- *player impact (refuter's words):* REAL BUT MUCH SMALLER THAN CLAIMED. Since zone Y ≈ topmost-surface(zone column) and mob Y ≡ topmost-surface(mob column)+0.5, the only reachable Y-delta is the height difference between two columns within the small horizontal radius (2.5 burning / 3 frozen; 3.75/4.5 amplified) — i.e. a player-built roof or pillar, or a steep terrain cliff.

Reachable in ordinary play: player builds a base, stands o
- *executed evidence:*
  ```
  PROBE 4 (real applyZoneEffects): a burning zone at y=0 emits damage events for mobs at y=+30 and y=-25 — `[{"id":"ground"...},{"id":"onRoof"...},{"id":"inCellar"...}]`. PROBE 5: a frozen zone at y=0 sets zoneSlowMult=0.4 on a mob at y=+50. PROBE 2 (real spawnZone): a fire cast 80 blocks ABOVE a basement ice zone returns `null` and leaves `zones: 0` — both annihilated through the floor. Compounding (read from real code): ElementZoneSystem.jsx:51 guards the SFX on `if (z && ...)`, so an annihilation is silent — and `grep -ri steam src/` finds no steam VFX anywhere (the code comment at ElementZoneSystem.jsx:49 concedes "an annihilation stays silent steam in v1").
  ```

**1 of the 4 fusion hybrids is unreachable dead content; 25 of the 28 squads a player can assemble cannot fuse at all**
- *domain:* The four Aspects  ·  *at:* `src/game/hybrids.js:36 (`'cow+skeleton': 'bonehide_bulwark'`) vs src/Components.jsx:684 (snare filter rejects `e.passive`) and src/game/mobTypes.js:8 (`cow: { ... passive: true }`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but narrower than the title claims. CONFIRMED player impact: Bonehide Bulwark — 240 HP, the roster's ONLY bruiser/tank — cannot be obtained by any player action, ever. That is 1 of 4 hybrids (25% of the fusion roster) and the entire tank archetype, dead. FUSE is a real advertised 50-Soul capstone: aspectGuide.js:37 tells the player "Stand TWO bound creatures together and hold X to FUSE them i
- *executed evidence:*
  ```
  PROBE 11, importing the REAL hybrids.js + mobTypes.js and enumerating every assemblable ally pair: `SNAREABLE: zombie, skeleton, spider, skitterling, duskhound, moss_brute, emberhusk` / `NEVER snareable (passive): pig, cow, villager` / `assemblable pairs: 28 | pairs that FUSE: 3 | pairs that do NOTHING: 25` / `bonehide_bulwark  role=bruiser  hp=240  *** UNREACHABLE — DEAD CONTENT ***` (dreadweaver, grimhound, marrowspinner are reachable).
  ```

**Squad allies are immortal — the Soulbind squad is a permanent, risk-free 16 DPS buff**
- *domain:* The four Aspects  ·  *at:* `src/systems/CombatSystem.jsx:23 (`damageMob` = `mobsQuery.entities.find(e => e.id === id)`); src/game/allegiance.js:15-16 (the isMob -> isAlly component swap)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and live on HEAD. A player who unlocks the soulbind_snare talent and spends 35 Soul owns two (three with the pack talent) permanently invulnerable allies that auto-engage any hostile within ENGAGE_RADIUS=18m of the player and deal 16 DPS combined, forever. They cannot be damaged (no code path reduces ally health), cannot die, cannot be culled, and cannot be lost — leash overflow teleports the
- *executed evidence:*
  ```
  PROBE 18, driving the REAL ecs/world.js + allegiance.js: before bind `in mobsQuery = true`; after bind `in mobsQuery = false | in alliesQuery = true`; then `mobsQuery.entities.find(e => e.id === 1)` -> `undefined => 'if (!entity) return null;' NO-OP`. PROBE 19 (real stepSquad): ALLY_DPS_HIT=12 per ATTACK_COOLDOWN_SEC=1.5s each => 2 allies = 16.0 DPS, forever. Corroborating read: nametagData.js:19 hardcodes `hpFrac: 1, showBar: false` for allies — the HP field is already decorative.
  ```

**The joystick knob recentres on ANY touchend -- including a look-drag release -- while the stick is still held**
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/TouchControls.jsx:83-89 (onEnd recentres unconditionally, without checking the ended touch's zone)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — real, in the standard two-thumb mobile control scheme. Every time the player finishes a look-drag while running (constant in normal play), AND every time they tap Jump/Action/Cast/Pause/tray while running, the joystick knob snaps to centre even though the thumb is still on the stick and the character is still moving. It then STAYS centred indefinitely, because a resting thumb generates no fu
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13 (scratchpad/touch-audit5.mjs):
     stick held      : moveF=true  | knob=translate(calc(-50% + 0px), calc(-50% - 42px))
     look drag ended : moveF=true  | knob=translate(-50%, -50%)
     => knob *** RECENTRED while the thumb is still on the stick (visual desync) ***
  Movement correctly CONTINUES (moveF stays true) -- this is purely a visual lie, not a control failure.
  ```

**The joystick is FLOATING in logic but FIXED in visuals -- the drawn ring is decorative and in the wrong place**
- *domain:* Touch / mobile input  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/input/touchMath.js:70 (zone = entire left half; origin = the touchstart point) vs src/ui/TouchControlsSurface.jsx:53 (ring drawn at a FIXED left:7% bottom:13%)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, a real mobile player is affected, but the impact is cosmetic/affordance, not functional. The visible 148px ring at bottom-left says "put your thumb here," while the code re-anchors the stick wherever the thumb lands in the entire left half — and the knob deflection is then drawn inside that fixed ring, up to ~600px away from the actual thumb. Even a player who obeys the ring gets a mis-anchor
- *executed evidence:*
  ```
  LIVE puppeteer, iPhone 13 (scratchpad/touch-audit6.mjs):
     drawn ring center: (101, 660)
     thumb touched at (117,253) -- far from the drawn ring -- and dragged up: moveF=true
     => the joystick is FLOATING in logic (works anywhere on the left half) but the RING is drawn at a FIXED spot.
  ```

**4 of 26 crafting recipes produce items with ZERO consumers -- Planks (the cheapest recipe in the game), Torch, Bow->Arrow, and Magic Crystal->crystals**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/data/recipes.js:104-127 (Bow -> {Arrow:5}, Torch -> {torch:4}, Planks -> {planks:4}, Magic Crystal -> {crystals:4})`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — a real player hits this, and the cheapest/most obvious first craft in the game is one of the four.

Reachable: crafting panel is mounted at MenuSystem.jsx:122-129 (`showCrafting`). Planks = one `wood` in the grid; wood is a minable voxel (BLOCK_ID.wood=6). Torch = coal + wood, both minable. Magic Crystal = diamond + gold, both minable. So all four WILL be crafted.

What the player experience
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
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/GamePanels.jsx:386-393 (any item with getItemSlot()===null -> `setSelectedBlock(type); onClose();`) vs src/world/Terrain.jsx:824-826 (`const numericType = idForBlock(type); if (numericType === null) return;`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and reachable on turn 1 with zero prerequisites. The starting loadout ships 2 Health Potions and 1 Mana Potion inside inventory.blocks, so they render as clickable tiles in the item grid. The "Use" affordance is a tiny hover-only overlay button in the tile corner, so clicking the tile body — the natural "use this" gesture — instead falls into the else-branch: it sets selectedBlock='Health Pot
- *executed evidence:*
  ```
  PROBE (vite-node, real store + real equipment/consumables/blockIds): for every item the player can hold (starting loadout U all recipe outputs U all trade outputs U loot-table drops), computed getItemSlot / isConsumable / idForBlock. 14 items are NOT equippable AND idForBlock() === null, yet the Inventory grid routes a click on them to setSelectedBlock + close:
    Health Potion, Mana Potion, Arrow, torch, planks, crystals, Cooked Porkchop, Cooked Beef, wand, Raw Porkchop, Raw Beef, Rotten Flesh, Diamond, Star Fragment
  HOTBAR_BLOCKS (world/Blocks.js:23) contains none of them, so GameHud highlights nothing either.
  ```

**The CombatLog is not a log — every entry self-deletes after 4 seconds, so there is no scrollback**
- *domain:* UI/HUD — bars, compass, minimap, ability bar, combat log, nametags, target frame, day-phase dial, hotbar, quest tracker  ·  *at:* `src/QuestSystem.jsx:161-167 (addNotification arms `setTimeout(... filter out this id ..., 4000)`) consumed by src/ui/CombatLog.jsx:24 (`notifications.slice(-8)` over that same self-expiring array)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* REAL, and every player hits it — not theoretical, not dead code. CombatLog is rendered unconditionally in the HUD; its only suppression is `if (isCaptureMode()) return null` (CombatLog.jsx:23), a visual-baseline test hook, not a player-facing flag. There is no setting that hides it.

So in normal play the bottom-left "combat log" shows the last few events and then blanks itself 4 seconds later. A 
- *executed evidence:*
  ```
  Live puppeteer probe: pushed 3 events (`addNotification('Slain: Husk','danger')`, `'Loot: Iron Ore'`, `'Quest Complete: First Blood'`) into the real store, then counted the CombatLog container's children over time:
    CombatLog lines 0.5s after 3 events : 3
    CombatLog lines 2.5s after 3 events : 3
    CombatLog lines 5.0s after 3 events : -1   (container unmounted -> all entries expired)
  Confirms the feed retains nothing beyond 4s.
  ```

**26% of all terrain geometry is permanently invisible — chunk-boundary walls buried in the neighbour chunk**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/world/terrain.worker.js:708-711 (getBlock returns 0 for any out-of-chunk coord, so every chunk emits full boundary walls against 'air')`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, continuous, and measurable — not theoretical. At renderDistance high (81 loaded chunks), ~71,224 of 253,334 terrain triangles (28.1%) are permanently unviewable yet are uploaded to VRAM and vertex-shaded every single frame, twice (shadow pass + main pass), because the terrain mesh casts and receives shadows and nothing culls per-quad. This is a pure ~28% waste of the vertex/memory/index-buff
- *executed evidence:*
  ```
  Generated chunk (2,2) through the real worker and independently generated its 4 neighbours, then classified every emitted quad: 1,484 quads / 2,968 tris total; 386 quads (26.0%, 772 tris) lie on a chunk-boundary plane AND are fully backed by solid voxels in the neighbouring chunk — never visible. Reproduced across chunks.
  ```

**Footsteps at the spawn Hearth play GRASS while the player is standing on stone**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/world/climate.js:16-26 (surfaceBlockAt recomputes from noise; it does not know about stampHomeAnchor/stampHub) -> src/Components.jsx:1202,1208 (footstep SFX), src/SoundManager.jsx:226 (biome ambience), src/render/WeatherSystem.jsx:87,190 (precip type)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* YES — reachable by every player, every session, unavoidably. Components.jsx:853 hardcodes spawn to world (0,0) — `camera.position.set(0, safeY + 1.2, 0)` — with ground Y resolved by a physics raycast against the REAL meshed voxels, i.e. the stone cap at y=51. So the player provably stands on stone at the exact column where footstepTypeAt returns 'grass'. Not theoretical, not dead code.

Two real (
- *executed evidence:*
  ```
  Ran the REAL worker's generateChunkData and compared voxel-by-voxel against climate.surfaceBlockAt. At (0,0) — where the player spawns — the REAL voxel is STONE @ y51 (the Hearth cap), while footstepTypeAt(0,0) returns 'grass'. Across the spawn footprint (225 columns sampled), 109 (48%) disagree with the real voxel; climate also reports surfaceY 43-46 vs the real 51 (8 blocks off). CONTROL: in the open world (x,z in 32..110, 729 columns) climate matches the worker EXACTLY except where a tree occupies the column (grass->leaves 110, snow->leaves 18, grass->wood 1) — so this is NOT general drift, it is bounded to the Hearth/hub stamps.
  ```

**Caves are systematically pinched at every chunk boundary — a 16-block lattice of stone ribs underground**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/world/terrain.worker.js:289 (`getTempBlockAt` returns 3 = SOLID for any out-of-chunk neighbour, so the CA over-consolidates walls at every chunk border)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes, real and player-facing. The CA's active band (caRangeHeight = 20, loop y=1..18) coincides exactly with the game's dense-cave layer (`caveThreshold = y < 20 ? 0.3 : 0.45`, terrain.worker.js:456) and contains the cobblestone dungeon chambers (`dCenterY = 12`, line 264) plus the depth-banded ores that exist to reward mining. So the defect covers the entire underground content zone that players e
- *executed evidence:*
  ```
  Over 121 real chunks, air fraction in the CA band (y 1..18) by LOCAL coordinate: x0=18.9%, x15=18.5%, z0=16.9%, z15=17.3% vs 24-26% mid-chunk (mid/edge ratio 1.34x). Connectivity test across 110 chunk pairs: a cave passage is open across a chunk SEAM plane in 3,864/28,160 cases (13.7%) but across an identical INTERIOR plane in 5,617/28,160 (19.9%) — a cave is 1.45x LESS likely to pass through a chunk seam.
  ```


### LOW

**HYPOTHESIS (not executed): mid-air hitstop banks gravity and drops you faster on release**
- *domain:* Combat: melee, damage, telegraphs, hitstop, dodge, i-frames  ·  *at:* `src/Components.jsx:1063 (gravity integrates velocityY) vs :1125 (`velocityY.current * delta * hitstopScale`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and BROADER than the claim stated. The claim framed it as crit-only and as a fall-side "drop-snap." Executed evidence shows: (a) EVERY hitstop tier banks gravity, not just crits — light 45ms -> 1.44 u/s, heavy 90ms -> 2.88, crit 130ms -> 4.16, boss 160ms -> 5.12; (b) the larger effect is on the RISE, not the fall — a mid-air hit during ascent eats the player's upward velocity (4.533 -> 0.267
- *executed evidence:*
  ```
  NONE -- I could not execute this. Reaching it requires the Rapier KCC + the real R3F useFrame, which I did not drive. This is a code-reading hypothesis, stated as such. The two lines are confirmed by grep (`grep -n "velocityY.current" src/Components.jsx` -> :1063 integrate, :1125 scaled displacement); the consequence is inferred, not observed.
  ```

**The crafting panel's material picker hijacks the world hotbar — after closing the panel, left-click-to-place silently does nothing**
- *domain:* Crafting, recipes, coins, trading economy  ·  *at:* `/Users/kz/Code/Crafty/frontend/src/ui/panels/CraftingTable.jsx:201 (picker calls the GLOBAL setSelectedBlock) -> /Users/kz/Code/Crafty/frontend/src/world/Terrain.jsx:822-827 (place() reads store.selectedBlock; idForBlock null -> silent return)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but bounded, and LOW severity is honest. On a fresh save a player can open the craft panel (C), click any staged material — including the default Stone Sword / Health Potion / Mana Potion, so crafting is not even a prerequisite — close the panel, and terrain placement is silently dead: no sound, no message, no highlighted hotbar slot. But the claim's "clicks do nothing / player assumes the ga
- *executed evidence:*
  ```
  PROBE G clicked the real 'Leather' picker button in the rendered CraftingTable, unmounted the panel, and printed: 'selectedBlock after picking "Leather" in the craft panel: "Leather"' / 'idForBlock("Leather") = null (null => Terrain.place() silently returns)' / 'is it a hotbar slot the player can see selected? NO — every hotbar slot renders unselected'.
  ```

**All four NAMED hub NPCs pop a generic 'Villager' tutorial bubble; the intended ambient emote system (`nextEmote`) is unit-tested dead code with zero callers.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/render/MobModel.jsx:62-93 (dialogue effect keyed on `entity.type !== 'villager'`) and :356 (header hardcoded `Villager`); src/game/npcRoutine.js:17 (`nextEmote`)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — and reachability is GUARANTEED, not incidental, which is stronger than the claim argues.

InputManager.jsx:174 sets the G-interact radius to 4; the bubble gate is dist < 3.5. A player cannot trade, craft, or heal — the entire purpose of the hub NPCs — without standing inside the bubble radius. So every player sees this on every hub interaction. This is not theoretical or unreachable dead cod
- *executed evidence:*
  ```
  `grep -rn "nextEmote" src/ tests/` returns 9 hits: 1 definition (src/game/npcRoutine.js:17) and 8 test assertions across src/game/npcRoutine.test.js and tests/data/npcRoutine.test.js. ZERO callers in src/. Executed it: `nextEmote(0..2)` -> `… | *hums* | *sweeps*` — the ambient emotes exist, are tested in two separate files, and are never rendered. Confirmed the hub NPCs carry type 'villager' by running makeNpcEntity against the real module (they appear in mobsQuery as Sister Wren / Old Pike the Warden / Mara the Smith / Bram the Trader, all type villager).
  ```

**'Day stays the calm baseline' is 70.3% hostile — the neutral spawn roll spans ALL mob types, so daytime is only marginally safer than a siege.**
- *domain:* NPCs, hub, mobs, AI worker  ·  *at:* `src/systems/SpawnerSystem.jsx:43-48 (the `else` branch calls `weightedPick(entriesFor(mobTypeKeys))` over EVERY type, hostiles included); comment at :45 claims 'day stays the calm baseline'`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Yes — fully reachable in normal gameplay, and the player fights hostiles all day.

The spawner's useFrame path is gated only on isCaptureMode(), so it runs every 1s in real play, filling to maxMobs=16 concurrent by day. At 70.3% hostile that is ~11 aggro-capable hostiles roaming in broad daylight.

I specifically hunted for a mechanism that would make day calm anyway, and there is none:
- No dawn-
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

**gameTime uses a falsy `||` fallback, so a save at time 0 does not round-trip**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/store/useGameStore.jsx:853 (`const gameTime = saveData.game_state?.gameTime || state.gameTime;`) — every other numeric restore correctly uses `??``
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, player-visible, but gated behind an in-session world load. A player who loads a world from a cold page load sees nothing (live clock is still 0, so `0 || 0` accidentally yields 0). The bug bites when a world is loaded WITHOUT a reload — Esc -> Settings -> World Manager -> Load, which is exactly how a freshly-created world is entered. Because the clock advances 4 units/s and a half-cycle is 6
- *executed evidence:*
  ```
  probe1 P1: saved with game_state.gameTime = 0, live clock moved to 0.77, then loadWorldData -> 'after load: gameTime = 0.77  isDay = true   EXPECTED gameTime 0'. Control P2 (non-zero): saved 0.42, live 0.9, loaded -> 'gameTime = 0.42' (correct). P3 confirms the freshBlob's `gameTime: 0` is likewise ignored.
  ```

**Deleting the world you are currently playing resurrects it as a duplicate on the next autosave**
- *domain:* Save / load / persistence / migration  ·  *at:* `src/game/worldSaves.js:40-44 (deleteWorld clears the active id) + src/store/useGameStore.jsx:970-971 (saveActiveWorld mints a NEW id when none is active)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real and reachable via a normal path. Mid-game the player presses ESC -> pause menu -> "Manage Worlds" -> deletes the world they are currently in. The panel confirms "World deleted successfully." They close it, return to the game, and the next time any progression/world key changes (mine or place a block, pick up an item, gain a level, open a chest), the 5s debounced autosave fires, finds no activ
- *executed evidence:*
  ```
  probe1 P5 (real store + real worldSaves): 'saved world id = local_1783963418272  worlds = 1' -> deleteWorld -> 'after deleteWorld: worlds = 0  active = null' -> one more autosave -> 'after the next autosave: worlds = 1 ["local_1783963418272"]'. (The id matched only because Date.now() was identical inside the test tick; in real time it mints a fresh id, i.e. a DUPLICATE entry rather than the same one.)
  ```

**Spell crits are invisible, and the damage solver still returns the legacy pre-unify palette**
- *domain:* Spells / magic  ·  *at:* `src/EnhancedMagicSystem.jsx:202 (`const { damage: finalDamage } = solveSpellDamage(...)`) + src/utils/combat.js:16-35`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and it is the readability half only. Spell crits are a 1.8x swing at up to 50% chance, and every feedback channel the game owns -- camera shake, hitstop, spark count, damage-number font and the "!" suffix -- renders a crit and a non-crit spell IDENTICALLY, because all four spells clear the damage>=40 crit proxy even on a normal hit. The player's only cue that a crit landed is reading the raw
- *executed evidence:*
  ```
  Probe P13/P16 show the crit multiplier is live: the same arcane cast produced 72 damage in P1 and 130 in P13 (72 * 1.8 = 130). The player receives no signal distinguishing them. Grep: `grep -rn 'solveSpellDamage' src/` -> the only production consumer is EnhancedMagicSystem.jsx:202, which drops `isCrit` and `color`.
  ```

**VISUAL (my eyes on the baseline PNGs): the additive glow shell washes the fireball into a grey egg; the lightning bolt is nearly invisible**
- *domain:* Spells / magic  ·  *at:* `tests/visual/baseline/spell-cast.png, spell-lightning.png, spell-iceball.png; profiles at src/game/spellVisualProfiles.js:22-45`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but cosmetic, and correctly rated LOW — the claim does not inflate itself (it explicitly labels itself a look judgement, and its own body concedes the orange teardrop "reads well"). A player firing fireball toward the sky/horizon sees a large pale grey-white egg around the flame (~5× its area) instead of the intended orange halo; lightning's bolt silhouette is barely legible against Crafty's 
- *executed evidence:*
  ```
  I opened all four baselines and looked at them. Corroborating measurement: the projectile-silhouette region differs 57-58% between elements, so the SHAPES are genuinely distinct (that part of the v7-S3 work landed). The problem is contrast/legibility of fire's halo and lightning's bolt against the bright sky, not shape sameness.
  ```

**aspectGuide tells the player to "Hold X" to snare, but the channel does not require the key to be held**
- *domain:* The four Aspects  ·  *at:* `src/game/aspectGuide.js:37 ("Hold X while aiming at it") vs src/game/soulbind.js:19-46 (decideSoulbind's ctx has no held-key field at all)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and WORSE than the claim stated — the claim called it "arguably in the player's favour," which my probe refutes.

PROBE D: a player doing exactly what the guide says (hold X, keep aiming) suffers an aim slip — which the design explicitly EXPECTS ("the mob keeps moving, so holding aim IS the skill", soulbind.js:5). The channel breaks free and silently (no cooldown, no message; the tether VFX 
- *executed evidence:*
  ```
  PROBE 14 on the REAL soulbind.js: `t=0.0 press X -> startChannel`, then every subsequent frame passed with the key RELEASED, and at `t=1.1 -> bind <-- bound anyway`.
  ```

**Progression panel: the 'Locked' badge overlaps the talent-node title text on long names**
- *domain:* UI panels — inventory, crafting, trading, quest log, settings, progression  ·  *at:* `src/ui/SpellUpgradePanel.jsx:118-122 (`absolute top-2 right-2` lock overlay) vs :125 (the node title `<div>` has no right-padding reserved for it)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but cosmetic, and severity LOW is HONEST (not inflated). The progression panel is player-facing (U key), and locked talent nodes are exactly what a player looks at while planning a build. On 2 of 10 locked nodes the trailing characters of the talent name are overprinted by the "Locked" badge, hurting legibility. No functional/progression breakage -- the Prerequisite line and "Rank 0/N" row st
- *executed evidence:*
  ```
  I LOOKED at the PNG I captured from the live app (scratchpad/shots/progression-scroll-top.png) and at the repo's own pinned baseline tests/visual/baseline/progression-open.png. In both, 'Elemental Imbue' and 'Locked' visibly collide (the badge overprints the last characters); 'Primal Endurance' in the baseline shows the same overlap. Not a probe -- a direct read of the pixels.
  ```

**A no-op edit still triggers a full chunk re-mesh + TrimeshCollider rebuild**
- *domain:* Voxel editing: mine / place / block round-trip / chunk persistence  ·  *at:* `frontend/src/world/terrain.worker.js:111-173 (the bounds check gates the write, but generateMesh runs unconditionally afterwards)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real, and it fires repeatedly in every Shadow Dragon fight — the most CPU/GPU-loaded moment in the game (lava zones, summoned minions, particles). Each boss stomp/lava-breath (Phase 3: every 5.2s) picks 4-8 cells, roughly half of which are the phantom AIR voxel above the surface. Each of those sends update_block to the worker, which correctly drops no item but STILL re-meshes the entire 16x16x256 
- *executed evidence:*
  ```
  PROBE-F, real worker in node:
    1st mine -> block_broken? true | 2nd mine -> block_broken? false (correct: no double drop)
    BUT the 2nd still re-meshes: true -> full chunk re-mesh + collider rebuild for a NO-OP edit
  ```

**The spawn chunk is ALWAYS a dungeon chunk — sin(0) = 0**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/world/terrain.worker.js:250-253 (`isDungeonChunk`: `Math.sin(dcx*12.9898 + dcz*78.233) * 43758.5453`, frac < 0.025)`
- *verdict:* CONFIRMED
- *player impact (refuter's words):* Real but modest — LOW is the right call. Every world, on every seed, deterministically contains a dungeon room directly under spawn: world x,z in [2,14], y=12..17, with the altar at (8,13,8) — 8 blocks from the origin. The player spawns on the Hearth plinth at HEARTH_Y=51, so the room sits ~35 blocks straight down, reachable by mining down at spawn or by caving (a core voxel verb, and the single m
- *executed evidence:*
  ```
  Executed against the real worker: `isDungeonChunk(0,0) === true`. Measured rate over 81x81 chunks: 176/6561 = 2.68% (the code comment claims 2.5%). The blueprint centre is world (8, 12, 8), i.e. 8 blocks from the origin at y=12..17.
  ```

**OBSERVATION (render domain, not worldgen): the underground has no lighting model — caves read as flooded navy**
- *domain:* World: terrain, biomes, ocean, worldgen  ·  *at:* `src/render/Atmosphere.jsx:26-28 (FOG_SEA_LEVEL=56 -> heightMul 1.0 for ALL y<=56), :208 ambientLight, :224 hemisphereLight`
- *verdict:* CONFIRMED (core observation) — but mechanism MISATTRIBUTED, cited evidence INVALID, and the "ores indistinguishable" impact REFUTED
- *player impact (refuter's words):* REAL BUT OVERSTATED. Players do reach and see this: caves are carved near spawn and are content-bearing — I counted 1738 coal, 1241 iron, and 347 gold ore faces exposed to cave air within |x|,|z|<=60 of origin, and ores are depth-banded for mining payoff (oreGen.js). So the entire underground genuinely renders as a dark blue murk lit only by a sky-blue ambient — a real visual-quality gap, and LOW 
- *executed evidence:*
  ```
  LIVE PUPPETEER CAPTURE probeB-cave-looking-up.png (camera at world (-19, 22, -37), looking up): the entire cave is drenched in dark navy; stone, coal and ore textures are nearly indistinguishable. probeC (same area, above ground) is normal green/snow — so it is strictly a below-surface effect.
  ```


## 3. The 43 KILLED claims (refuted or no player impact) — do NOT act on these

Kept on the record so nobody re-files them.

- ~~The domain's ONLY live probe is vacuous — `playSpatialSound?.()` cannot fail, so it reports playable=true even when spat~~ — **REFUTED**. File:line is real and verbatim as quoted (/Users/kz/Code/Crafty/frontend/scripts/visual/esc-pause-probe.mjs:42), and the JS semantics point is true in isolation (node check: `o.playSpatialSound?.('hit', arg())` -> `resul
- ~~The attack telegraph is bypassable: a stale `windupUntil` survives de-aggro and produces an instant, zero-telegraph, und~~ — **REFUTED**. The cited code is REAL and the state leak is REAL, but the player-facing consequence is fabricated by an impossible probe input.

VERIFIED TRUE (premise): /Users/kz/Code/Crafty/frontend/src/workers/ai.worker.js:280-287 (
- ~~The mob-bestiary visual gate is VACUOUS: all six mobs are 1.495% of the frame and the diff threshold is 6%. Every silhou~~ — **NO-PLAYER-IMPACT**. CITATIONS REAL + NOT FIXED: frontend/tests/visual/diff.test.js:32 is `const THRESHOLD = 0.06`; mob-bestiary is in STATES (line 22); App.jsx mobBestiary fixture spawns ['skitterling','duskhound','skeleton','emberhusk','co
- ~~inventory.tools is read by NOTHING — the starting sword / pickaxe / shovel / axe are invisible and unusable~~ — **NO-PLAYER-IMPACT**. MECHANISM REPRODUCED, IMPACT REFUTED. Cited line is real and unfixed on HEAD (1386b5e): useGameStore.jsx:588 `tools: { pickaxe: 1, shovel: 1, axe: 1, sword: 1 }`. Census of every inventory access in src/ (`grep -rnoE "in
- ~~The kill block runs 11 side effects inside a React setState updater, with the idempotency latch set FIRST and the win la~~ — **REFUTED**. Cited code is REAL and unfixed on HEAD (1386b5e): frontend/src/world/bossSystem.js:84-110, bossKilledRef.current=true at :88 (first), markGameWon() at :107 (last), ~9 effects in between, all inside setBossHealth(prev => 
- ~~flush() on tab-close is a no-op unless a debounce is already pending — and coins / XP / gameWon / nightCount are not aut~~ — **REFUTED**. Cited code is real and unfixed on HEAD (1386b5e): autosave.js:8 is verbatim `flush() { if (timer !== null) { clear(); save(); } }`, and the App.jsx:234-249 predicate really does omit coins/currentXP/gameWon/nightCount/ga
- ~~EnemyProjectileSystem's multi-arrow damage loop is dead code -- 3 arrows deal 15 damage, not 45~~ — **NO-PLAYER-IMPACT**. Mechanism REPRODUCED (claim did not fabricate): vitest probe vs REAL useGameStore -> 3x damagePlayer(15,'projectile') = playerHealth 85, with only ONE [hit] log for three calls. Cited file:line is real and still on HEAD 
- ~~Arpeggiator burns ~28 WebAudio nodes/sec during ALL combat while producing ZERO sound (PROC_MUSIC_GAIN = 0)~~ — **NO-PLAYER-IMPACT**. Every MECHANICAL sub-claim reproduces; the player impact does not. (1) Citations accurate: SoundManager.jsx:14 `const PROC_MUSIC_GAIN = 0;` (grep shows this is the sole definition, 5 read-only use-sites, no dev toggle/ov
- ~~Wildheart's 4 beast forms have ZERO visual validation — and 4 orphaned PNGs manufacture the illusion that they do~~ — **NO-PLAYER-IMPACT**. The structural core reproduces; the claim's evidence and framing do not. CONFIRMED: I parsed tests/visual/diff.test.js:22 programmatically -> STATES count 24, zero beast-* entries; orphan baselines = beast-{arcane,fire,i
- ~~The dawn branch can pay out a FREE dawn reward (XP + coins + a legendary drop) merely for LOADING a save~~ — **REFUTED**. Cited lines are real and unmodified on HEAD (git status clean; no fix commit) — but the claim's reachability is fabricated. Decisive code: useGameStore.jsx:858 `const isDay = isDayAtUnit(gameTime)` — the loaded phase is 
- ~~setTimeOfDay uses a DIFFERENT day/night convention than the clock -- they disagree on 50% of the input range, and that i~~ — **NO-PLAYER-IMPACT**. The technical core REPRODUCES and every cited file:line is real and accurate. (1) `src/store/useGameStore.jsx:693` is `const isDay = frac >= 0.25 && frac < 0.75;` (grep on HEAD); `src/game/dayNight.js:48-50` is `Math.flo
- ~~The day-phase dial's own live probe is a FALSE PASS — it drives the clock through a convention the real game never uses~~ — **NO-PLAYER-IMPACT**. Every technical assertion REPRODUCED — I wrote my own probe (scratchpad/kz-dayphase-refute.mjs) importing the REAL frontend/src/game/dayNight.js + dayPhase.js, and it matched the claimed output byte-for-byte. (Integrity 
- ~~refundUnknownTalents validates the talent ID but never the RANK — an over-limit rank loads unchanged (armor 300 vs legal~~ — **NO-PLAYER-IMPACT**. MECHANISM FULLY REPRODUCED (claim did not fabricate). HEAD=1386b5e; talentTree.js:80-88 is real and verbatim as cited: `if (NODE_BY_ID[id]) kept[id] = unlockedTalents[id]` — key-checked, value copied through. My own vite
- ~~A corrupt/legacy save with a null in questState.quests white-screens the quest HUD — the guard that exists to prevent th~~ — **NO-PLAYER-IMPACT**. The DEFECT reproduces — the claim is not fabricated. I re-ran it myself: rendering QuestTracker with quests=[null] (touchDevice mocked false to force the expanded desktop tracker) throws "Cannot read properties of null (
- ~~Chain lightning targets a 250ms-stale MINIMAP snapshot, not the live ECS~~ — **REFUTED**. MECHANISM IS REAL, MAGNITUDE IS FABRICATED. Verified: EnhancedMagicSystem.jsx:58 does read `useGameStore.getState().mobEntities`; MinimapSyncSystem.jsx:13 (`now - _lastMinimapUpdate > 250`) is its only writer. Not fixed 
- ~~The entire affix system is dead code — zero importers outside its own test~~ — **NO-PLAYER-IMPACT**. Every factual assertion reproduces, but the finding is a documented unbuilt feature, not a bug. (1) File is real: src/game/affixes.js, 51 LOC, exports AFFIX_POOL/rollAffixes/foldAffixStats; the quoted deferral header is 
- ~~Phase 1 - 40% of the boss's health - cannot be hit with melee at all~~ — **REFUTED**. Cited lines are REAL and the mechanical core REPRODUCES (they did not fabricate), but the finding is intended design and the player-impact story is false.

REPRO: I re-implemented the BossEntity.jsx:216-223 phase-0 solve
- ~~boss-obsidian.png contains no boss, and BossHealthBar has zero validation of any kind~~ — **NO-PLAYER-IMPACT**. Every factual OBSERVATION in the claim reproduces (the agent did not fabricate), but the defect it infers does not exist.

VERIFIED TRUE: capture.mjs:280 is `window.__craftyTest.call('setDangerLevel', 2)` with no boss sp
- ~~The entire voxel-edit engine has ZERO executing tests — the gates that "cover" it regex source text, one of them matchin~~ — **REFUTED**. I ran the claim's own falsifiable experiment and it failed. CLAIM: "deleting the entire triggerGPUSparks call while keeping the comment leaves the gate green." I applied exactly that mutation to frontend/src/world/Terrai
- ~~NOTE (outside my domain, currently blocking): src/ui/GameHud.jsx is syntax-broken in the working tree — vite dev will no~~ — **REFUTED**. Working tree is clean for the cited file: `git status --short frontend/src/ui/GameHud.jsx` returns EMPTY (file committed at 361a045, not an in-flight edit). frontend/src/ui/GameHud.jsx:19-20 reads `return (` immediately 
- ~~loadWorldData has no shape validation: a malformed blob either throws a TypeError or writes garbage straight into the st~~ — **NO-PLAYER-IMPACT**. REPRODUCED the code behavior, REFUTED the player path.

(1) Evidence re-run (my own probe test against the real store, since deleted): every claimed shape matched exactly — THREW: null/undefined -> "Cannot read propertie
- ~~Starvation damage is silently swallowed by the combat damage lockout~~ — **NO-PLAYER-IMPACT**. Cited lines are REAL and accurate on HEAD (1386b5e): useGameStore.jsx:816 `state.damagePlayer(1, 'starvation')` and :747 `if (now - state.lastDamageTime < 500) return;`. Not touched by 926751e/15fcc96. I wrote my own vit
- ~~`slam` is 20.5 dB louder than `footstep` (peak 0.98 vs 0.092) — it will slam the limiter and duck the whole mix~~ — **REFUTED**. The MEASUREMENTS reproduce; the MECHANISM and IMPACT do not.

1) Evidence re-run (vitest probe over all 36 VOICES, 100 RNG seeds each): slam peak 0.953-0.980 (-0.2 dBFS), footstep 0.083-0.099 (-20.1 dBFS), spread ~19.9 d
- ~~Two vacuous assertions in the BEHAVIORAL audio tests (stormBed asserts nothing; synthVoices title lies about the count)~~ — **NO-PLAYER-IMPACT**. Both cited facts reproduce on HEAD (1386b5e), so this is not fabricated and not already fixed — but it is test-hygiene only. (1) frontend/src/audio/stormBed.test.js:36-37 does contain `// does not throw; the gain ramps w
- ~~A held Voidhand phantom survives a menu open (the HELD branch never checks ctx.active)~~ — **REFUTED**. The mechanism reproduces, but the claim's load-bearing premise is factually false about the codebase.

(1) File:line is REAL. /Users/kz/Code/Crafty/frontend/src/game/voidhand.js:56-64 — HELD guards `!ctx.alive` (:58), no
- ~~weatherMoodBoost is never reset -- the WeatherSystem cleanup tears down the storm AUDIO but leaves the dark, starry SKY ~~ — **NO-PLAYER-IMPACT**. The code asymmetry is REAL and I reproduced it; the player-facing premise is REFUTED.

MECHANISM CONFIRMED (executed): WeatherSystem.jsx:101 is verbatim `return () => { clearInterval(interval); if (stormBedRef.current) s
- ~~The storm notification is NOT capture-gated -- a toast can land in a visual baseline (gate flake)~~ — **NO-PLAYER-IMPACT**. MECHANISM CONFIRMED (stronger than claimed), but fails the player bar. (1) Cited lines are real at HEAD 1386b5e, NOT fixed: /Users/kz/Code/Crafty/frontend/src/render/WeatherSystem.jsx — the storm-bed audio is wrapped in 
- ~~COVERAGE GAP (not a bug): the Modal Tab focus-trap, chest item transfer via the panel, gear equip/unequip via the panel,~~ — **NO-PLAYER-IMPACT**. Re-ran the evidence on HEAD (1386b5e). The coverage facts are largely real: tests/gates/modal-a11y.test.jsx exists, has exactly 5 tests, passes green (npx vitest run -> 5 passed / 5), and `grep -n Tab` returns nothing, s
- ~~cooldownMirror hardcodes ability durations, duplicating the state-machine constants (currently correct — latent drift ri~~ — **NO-PLAYER-IMPACT**. Everything the claim asserts is factually TRUE — I re-ran all of it on HEAD 1386b5e. /Users/kz/Code/Crafty/frontend/src/game/cooldownMirror.js:13-16 really does hardcode 0.6/1.5/1.5/1.0, and line 18/20 reads dodge.cooldo
- ~~Store-level spendTalentPoint enforces the rank limit but NOT the prereq — the tree's dependency graph is a UI-only conve~~ — **NO-PLAYER-IMPACT**. Mechanism REPRODUCED independently (own probe, not the claim's). Wrote tests/store/zz-refute-prereq.test.js seeding talentPoints:10 / unlockedTalents:{} and calling the real store action for three orphan nodes; vitest ou
- ~~allocateAttribute has no attribute whitelist — a bad key writes NaN into attributes, burns the point, and serializes to ~~ — **NO-PLAYER-IMPACT**. Every technical assertion reproduces; the finding fails only on reachability. (1) Cited code is real: useGameStore.jsx:256 `allocateAttribute: (attr) => set(...)` does `[attr]: state.attributes[attr] + 1` with no key che
- ~~The Q key and the tracker disagree on the claim predicate — a quest can become permanently unclaimable~~ — **NO-PLAYER-IMPACT**. Cited lines are REAL and NOT fixed on HEAD: InputManager.jsx:137 = `if (quest.progress >= quest.target && !quest.claimed)`; questClaim.js:46 (claim said 47, off-by-one) = `q.completed && !q.claimed`; QuestSystem.jsx:469 
- ~~A save with unlockedAchievements: [] silently loses the auto-granted 'first_step' achievement~~ — **REFUTED**. Cited file:line is REAL and unchanged at HEAD (frontend/src/QuestSystem.jsx:157; `git diff` shows the only uncommitted edits are at lines 196/322, unrelated). NOT already fixed — but there is nothing player-reachable to 
- ~~DOC-TRUTH: questClaim.js claims it is locked by a test file that does not exist~~ — **NO-PLAYER-IMPACT**. Factual core CONFIRMED, player gate FAILED. (1) The comment is real and on HEAD (1386b5e): src/game/questClaim.js lines 18-19 read "Locked by quest-multiclaim-gates.test.jsx (behavioral, RED against the old code) + quest
- ~~Lightning's `stunDuration` is dead data -- the stun was never built~~ — **NO-PLAYER-IMPACT**. The mechanical grep reproduces, but the claim's framing and its "zero gates" evidence are both refuted.

REPRODUCED: `grep -rn 'stunDuration' src/ tests/` in /Users/kz/Code/Crafty/frontend returns exactly one line — src/
- ~~HYPOTHESIS (root cause NOT proven): the impact spark burst carries no element identity in the pinned baselines~~ — **REFUTED**. Reproduced the claim's inputs, then disproved its conclusion.

WIRE IS GENUINE (not fabricated): SPARK_PROFILE = fire 52/ice 42/lightning 48/arcane 46 (/Users/kz/Code/Crafty/frontend/src/game/spellVisualProfiles.js:13-19
- ~~CONTEXT (not a domain defect): the working tree was uncompilable mid-audit -- another agent's in-flight GameHud.jsx edit~~ — **NO-PLAYER-IMPACT**. The claim is self-refuting by its own text ("CONTEXT (not a domain defect)", "never shipped", "player_impact: NONE"), and I confirmed nothing survives in the tree. (1) `git show HEAD:frontend/src/ui/GameHud.jsx | diff - 
- ~~equipItem performs NO slot validation — any item can be forced into any slot, stacking its stats 5x~~ — **NO-PLAYER-IMPACT**. Cited line is REAL and NOT fixed: HEAD=1386b5e; useGameStore.jsx:165 is verbatim `equipItem: (slot, itemName) => set((state) => {` with no slot check. The store mechanic REPRODUCES: my own vitest probe against the real s
- ~~Unequip migrates an item across inventory buckets (tools -> blocks) when a duplicate was looted~~ — **REFUTED**. Mechanism is REAL in code but UNREACHABLE by any player; not fixed, but not player-facing either.

(1) RE-RAN the evidence (vitest probe against the real store, tests/store/zz_probe.test.js, now deleted). Probe A reprodu
- ~~BOSS_CONFIG.damage / .speed / .aggroRange / .size are dead fields that silently do nothing~~ — **NO-PLAYER-IMPACT**. CODE FACT CONFIRMED, PLAYER IMPACT ABSENT.

file:line is real on HEAD (1386b5e, not fixed): /Users/kz/Code/Crafty/frontend/src/game/bossConfig.js:9-12 = damage:20, speed:3.5, size:3.2, aggroRange:30.

Dead-field claim re
- ~~Water (id 9) is placeable by id but the mesher emits no faces — an invisible, non-colliding ghost voxel~~ — **NO-PLAYER-IMPACT**. Mechanism reproduced with my own probe driving the real terrain.worker.js in-process (vitest, since deleted): placing STONE(3) in an air cell added 60 verts; placing WATER(9) in the same cell added 0 verts (13212 -> 1321
- ~~KEY_MAP anti-drift gate is one-directional — Q (claim quest) and L (quest log) are live but never advertised, hiding the~~ — **REFUTED**. The mechanical half reproduces; the load-bearing player-impact half is false. VERIFIED TRUE: src/game/keyMap.js has no L/Q/F3 rows; src/InputManager.jsx:123 (KeyL), :133 (KeyQ), :145 (F3) are live; tests/game/keyMap.test
- ~~gameWon is serialized, restored and commented as a persisted win-state, but nothing in the app reads it~~ — **REFUTED**. The claim's core assertion ("nothing reads gameWon") is false — it is an artifact of the claim's own grep filter. The claim ran `grep -rn --include='*.jsx' 'gameWon' src/`, which only searches .jsx files. The actual cons

## 4. Unjoined (verdict not recoverable)

- SpawnerSystem's spawn loop can spin forever on the main thread — `attempts++` sits INSIDE the distance guard, so rejected samples never count against maxAttempts. — `src/systems/SpawnerSystem.jsx:163-178 (`while (spawnedThisTick < spawnCount && attempts < maxAttempts)`; `attempts++` is on line 172, inside `if (dist >= 28 && dist <= 85)`)`  *(re-verify before acting)*