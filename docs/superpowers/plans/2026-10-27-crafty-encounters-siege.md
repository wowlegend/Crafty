# Crafty Phase 3 — Encounters and a Siege That Marches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one encounter table that four systems draw from (day groups, siege waves, shrine events, dungeon guardians),
and a night siege that comes from a direction you can see, marches on your base, and has a captain whose death ends
the night early. All of it stays inside today's mob caps, and death stays soft.

**Architecture:** pure modules hold every decision (`game/encounters.js` holds the table, stat scaling and elite
rules; `game/siegeDirector.js` holds the wave schedule, bearings and objective; `game/mobObjective.js` holds the idle
goal the AI worker steers by; `systems/groupPlacement.js` places a group). Thin R3F systems run them at 15 Hz or 1 Hz
and read the store through `getState()`. The worker learns one new main-thread-owned field pair (an anchor) and keeps
its stateless round trip.

**Tech Stack:** React 19, R3F 9.5, miniplex ECS (`frontend/src/ecs/world.js`), zustand 5, the AI web worker
(`frontend/src/workers/ai.worker.js`), vitest, Playwright (CI e2e), the lookbook probe (`feat/instruments`).

**Spec:** roadmap move 10, `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` (rank 10), as amended by
refute F11 (`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md:74-77`) and by the umbrella plan
`docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 3, and "Decisions taken with this plan"). Where they
differ, the umbrella and the refute win: **the ember cache is NOT built** (death stays soft).

Read before planning: the umbrella plan, roadmap move 10 and its sequencing, refute F11 and the per-move table, the
upside notes S3/S4/G5/G6, `.claude/rules/gates-and-probes.md`, `.claude/rules/voxel-mesher.md` (because Unit 9
touches `terrain.worker.js`), and every live file cited below. Each `file:line` was read on 2026-10-27, not inferred
from a symbol name.

---

## Goal (player-facing)

By day, the frontier has authored groups instead of lone random mobs: a boar herd near the Hearth, a pack of three
duskhounds further out, a moss brute with two husks guarding a spot deep in the frontier. Groups get tougher with
distance, and an ember-crowned elite shows up only far from home. At nightfall a war horn sounds and a red mark appears
on the compass. Three waves come out of the dark from that direction and march on the Hearth, or on the walls you just
built. The third wave is led by the Ashen Captain, who carries a banner. Kill him and the siege breaks: the sun rushes
up and the dawn reward pays out early. You never lose items, coins or XP for dying. If you fall during the siege, the
light pushes nearby attackers back when you get up. Underground, the old cobblestone dungeons finally have guardians.

## Current state (cited)

**Spawning is one random pick at a time.**
- `spawnMob(x, z, forceType, explicitY)` builds the entity at `frontend/src/systems/SpawnerSystem.jsx:27-85`. With no
  forced type it makes one weighted pick: at night it picks hostile-only with chance `siegeParams(...).hostileChance`
  (`:45-50`), otherwise it picks from every type (`:51-52`). Health, damage and XP are copied from the registry
  unscaled (`:64-69`).
- The registry and its weights are at `frontend/src/game/mobTypes.js:7-20`. Summed weights: 8.75. Passive (pig 1, cow 1,
  villager 0.6) is 2.6, so a day pick is **70.3% hostile** and **2.86% moss brute**, at any distance, including next to
  the Hearth.
- **The boot ring:** once terrain exists, 20 mobs spawn on a 30-50 m ring around the origin (`SpawnerSystem.jsx:97-104`)
  through the same untyped pick, so a moss brute can stand 30 m from a new player. With the 4 hub NPCs
  (`:109-117`) that makes 24 live mobs against a day cap of 16.
- **The ambient loop:** every 1 s (`:138`) it counts live mobs, **including the 4 hub NPCs**, which are `isMob`,
  `isStatic`, have 200 HP and are never culled (`:149`, `:194`; `frontend/src/world/npcSpawn.js:24-34`). It fills toward
  `maxMobs` (`:154-155`) at **at most 3 per tick** (`:158`), with points in loaded chunks 20-90 m out (`:162-168`)
  inside the band [28, 85] m from the player (`frontend/src/systems/spawnPlacement.js:28`), bounded at 12 attempts
  (`SpawnerSystem.jsx:180`). It culls mobs past 100 m (`:189-199`).

**The caps (refute F11 corrected the roadmap here).** `siegeParams(nightCount, zoneTier)` at
`frontend/src/game/dayNight.js:125-133` gives maxMobs = 16 + min(4n, 24) + min(2z, 8), so **16 by day near spawn, up
to 40 from the night ramp, and 48 with the zone term** (`:90`, `:98-99`, `:108-109`). Hostile bias is 0.7 + 0.05n
(capped at 0.95) plus 0.04z (capped at 0.98) (`:93`, `:102-103`, `:110-111`). Distance already scales count, hostility
(`:128-131`) and loot (`frontend/src/QuestSystem.jsx:394-397`); only health and damage do not. Zone tier is
`floor(dist/256)` capped at 4 (`frontend/src/world/zoneTier.js:10-16`). Because the hub NPCs take 4 cap slots, the live
hostile ceiling is cap - 4: **at most 44 AI-ticked mobs.**

**The "siege" is a bigger cap.** Nightfall is a genuine clock crossing in `setGameTime`, the single writer
(`frontend/src/store/useGameStore.jsx:804-825`), which also bumps `nightCount` (`:817-821`). The survival hook shows an
English-only toast (`frontend/src/world/survivalSystem.js:26-28`; the string is built at `dayNight.js:142-150`; the
gate `tests/gates/siege-warning-gates.test.js:16-28` pins it to `/Night 1/`). Dawn bleeds the Aspect meters and pays the
dawn reward once per night (`survivalSystem.js:31-56`; `useGameStore.jsx:789-801`). Nothing marches, nothing has a
direction, and nothing ends a night early. One half-cycle is 600 units at 4 units/s, so **a night lasts 150 s**
(`dayNight.js:13`, `:26`). The clock is a 1 Hz interval that advances only while input is live and the player is alive
(`frontend/src/game/useDayNightClock.js:21-31`).

**The AI loop, and what it costs today.**
- The bridge ticks at 15 Hz (`frontend/src/systems/AIWorkerSystem.jsx:34`, `:204-207`). Each tick it builds one payload
  per live non-static mob (`:211-222`; field list at `frontend/src/game/mobStateSync.js:28-57`) and posts it.
- **Only aggro hostiles get a terrain grid** (`AIWorkerSystem.jsx:213-216`). The grid is 81 floor queries
  (`frontend/src/game/localPath.js:156-166`), and each query walks its column with at least one Rapier `castRay`
  (`frontend/src/world/mobFloorProbe.js`, `frontend/src/game/mobFloor.js:72-83`). Every reply is ground-snapped, one
  floor query per mob (`AIWorkerSystem.jsx:121`).
- In the worker: pack alert is O(mobs x aggroed) (`ai.worker.js:67-82`), and each moving gridded mob runs one 9x9 A*
  (`:272-298`). Non-aggro mobs take the wander branch, which overwrites `targetX/Z` with a random roll (`:299-316`).
  **That is why nothing can march today:** a mob that is not aggro has no goal but wandering.
- **No instrument measures any of this** (no `performance.mark`, no timing anywhere under `src/`; grep 2026-10-27).
- The worst case today: 44 aggro mobs x 81 = 3,564 floor queries inside one tick frame, every 4th frame at 60 fps.

**Rewards and death.** XP comes from `entity.xp` (`frontend/src/systems/CombatSystem.jsx:124`). A kill emits
`emitMobKill(type, position, source)` with **no entity** (`CombatSystem.jsx:158`; `frontend/src/game/mobKillBus.js:25`),
so no subscriber can tell which mob died. Respawn restores health, mana and hunger and stamps `_spawnTime`, the start
of 5 s of protection, and loses nothing (`useGameStore.jsx:1002-1011`).

**Looks hooks.** The per-instance rim colour (`frontend/src/render/MobToonMaterial.jsx:19-31`) is drawn **only on high
tier**: `rimStrength` is 0 unless `q.charRim` (`frontend/src/render/MobModel.jsx:49-51`), and `charRim` is false on
low and med (`frontend/src/render/quality.js:20-21`, `:32`). An elite marked only by rim would be invisible on the iPad.
Feature boxes (`frontend/src/game/mobFeatures.js`) render with an outline on every tier
(`MobModel.jsx:344-350`; `charOutline: true` at `quality.js:20,21,32`). Nametag names are the registry's English
`displayName` (`frontend/src/game/nametagData.js:15`). The compass is an every-frame `innerHTML` loop with
hardcoded English labels (`frontend/src/HUD.jsx:306-473`: cardinals from `:306`, BOSS `:354`, HOME `:371`, SHRINE
`:395`, BLIGHT HEART `:414`, Chest and NPC below), rendered on desktop and touch alike (`HUD.jsx:534`). The strip is a
180-degree window (`fov = Math.PI`, `HUD.jsx:303`) inside an `overflow-hidden` track (`:505`), and `bearingToMarker`
reports `inView` false for anything behind (`frontend/src/game/compass.js:24-25`).

**The hit flash owns every body material's emissive.** `MobModel.jsx:195-217` traverses the group EVERY frame and, for
each toon or standard material that is not hit-flashing or charging, writes `emissive = black` and
`emissiveIntensity = 0`. Feature boxes use `MobToonMaterial` (`MobModel.jsx:348`), which is a `MeshToonMaterial`
(`frontend/src/render/MobToonMaterial.jsx:10`), so an authored emissive on a feature box is erased on the first frame.
Every feature box also has `castShadow` (`MobModel.jsx:346`) under a shadow-casting sun on every tier
(`GameScene.jsx:224` `shadows`; `frontend/src/render/Atmosphere.jsx:316`), so one box costs a colour draw, an outline
draw and a shadow-map draw.

**Soulbind takes any weakened hostile.** The snare candidate filter is `e.passive || e.health > 0.3 * e.maxHealth`
(`frontend/src/Components.jsx:759`), `convertMobToAlly` refuses only `villager` (`frontend/src/game/allegiance.js:10`,
`:14`) and heals the bound mob to full (`:18`), and a weakened hostile's nametag turns jade as the "bindable" cue
(`frontend/src/game/nametagData.js:24`).

**The horn and the night toast fire on the raw `isDay` edge**, which a load also flips: `frontend/src/ui/DayNightAudio.jsx:21`
(`playSiegeHorn`) and `frontend/src/world/survivalSystem.js:19-27` (`siegeWarning`).

**Dungeons exist but only inside the terrain worker.** A 13x13x6 cobblestone room is stamped in 2.5% of chunks
(`frontend/src/world/terrain.worker.js:195-239`, `:242-245`), centred at local 8 (`:192`) on y = 12 (`:262`), with an
altar at its centre. `isDungeonChunk` is private to the worker, so the main thread cannot find a dungeon.

**Placed blocks are already recorded, in order.** Placing writes `worldBlocks.set("x_y_z", type)` on a copied Map
(`frontend/src/world/Terrain.jsx:1002-1014`), and mining writes 0 (`:961-962`). A Map keeps insertion order, so its last
non-zero entries are the most recent placements **of NEW keys only**: `Map.set` on an existing key keeps that key's
original position, and mining writes 0 instead of deleting, so a cell that was mined and then built on again keeps its
old position (checked with node, 2026-10-27). Unit 8 makes placement delete before it sets. Saves persist it
(`useGameStore.jsx:1034`).

**Element zones damage mobs, not the player** (`frontend/src/game/elementZones.js:100`), so the roadmap's "burning zone
on elite death" would be a player reward, not a threat. It is cut (Out of scope).

**Bytes.** The `index` chunk ceiling is 760,000 B (`frontend/scripts/ci/bundle-budget.mjs:35`). The last local build,
`frontend/build/assets/index-RM8RWfkj.js`, is 696,924 B (built 2026-10-27 05:22). That leaves about 63 KB of headroom
for all of Phases 1-3, so re-measure before trusting it.

**Gates already in force on this ground.** `tests/gates/siege-gates.test.js:111-116` requires
`siegeParams(store.nightCount…).hostileChance` and `….maxMobs` to stay literally in `SpawnerSystem.jsx`. This plan keeps
both lines and does not rewrite that gate. `tests/gates/mob-charge-loop-gates.test.js` drives the real worker through a
`self` shim, and this plan's march gate copies that pattern.

## Global Constraints

- **Death stays soft.** No item, coin, XP or Aspect-meter loss on death. The ember cache is not built (DECISIONS.md;
  `SOTA-INITIATIVE.md:150-152`, "soft death" among the decisions of record).
- **Within today's caps:** never raise `siegeParams`' maxMobs, and never spawn more than 3 mobs per 1 s (the
  `SpawnerSystem.jsx:158` spike guard), from any source. Both are enforced in ONE place, the shared spawn budget of
  Unit 2b, which every consumer (ambient, boot, siege, dungeon, shrine) draws from. A consumer that does not fit
  queues; nothing bypasses the budget.
- **No WebGPU/TSL, no three.js bump.** This milestone adds no shader term.
- **Bytes:** every unit records the `index` chunk's bytes before and after in its commit body. **This milestone's
  ceiling is +14,000 B to `index`.** If a unit pushes past its share, its rare-moment code (dungeon guardians, shrine
  waves) moves behind a dynamic `import()`.
- **Heat:** no GPU cost added without stating it. Kevin's M3 Max runs hot, and the iPad (low tier, WebKit) must stay
  correct.
- **Game-loop isolation:** systems read `useGameStore.getState()`, refs and miniplex queries. A store write that React
  subscribes to happens on a CHANGE only (horn, wave, captain, end): at most about 8 per night, never per frame.
- **Capture determinism:** every new system does nothing under `isCaptureMode()`. The 31 baselines must not change. A
  re-shoot, if one is ever needed, is its own `Baseline-Review:` commit, never bundled with `src/`.
- **i18n:** every new player string goes through `t()` with `en` and `zh-CN` in `frontend/src/i18n/strings.js`.
- **No emoji in `src/`.** No `sed` on `.js/.jsx`. Commit messages carry no AI footer. A new check file carries a
  `Mutation-Proof:` line in its body (`scripts/ci/killability-ledger.mjs`). A new file under `tests/gates/` also needs the
  commit trailer (`scripts/ci/mutation-proof-trailer.mjs`) and must **not** call `readFileSync`, because the
  source-grep population is frozen (`tests/gates/.source-grep-ledger.json`).
- **Sequencing (umbrella, which wins over the roadmap):** Phase 3 builds move 11 (feedback grammar, merged mob
  meshes), then 12 (the lantern), then this move (10), then 14 (relight), then 13 (the dragon)
  (`2026-10-27-crafty-masterpiece.md`, Phase 3). The roadmap's order put this move before 12; the umbrella does not, so
  the lantern's spawn filter may already be in `spawnMob` when Unit 3 lands. Move 6 (the first minute, Phase 2) has
  already put its prologue filter there. Unit 2b reconciles all three. Move 5 (combat stance, which edits
  `ai.worker.js` and `mobArchetypes.js`) lands in Phase 1, before this.

## Design

### The metric, and what would pass if the feature were deleted (goal-frame)

- **Goal:** nights with a shape (warning, direction, waves, captain, early win) and days with authored groups that
  scale with distance, at no rise in the per-frame ceiling.
- **Metric, lived:** the running game's spawn log. Every spawn records its source, encounter id, members, tier,
  bearing and fallback flag. Each claim is a log assertion plus a world observation: siege mobs closing on the
  objective, and a captain kill flipping `isDay`.
- **Anti-attack (Goodhart).** A table nobody calls passes every unit test. That is why each consumer has an e2e whose
  delete-the-call mutant goes red. A siege that "spawns within 30 degrees" by widening its fallback every time would
  pass a bearing test, so the e2e asserts the fallback ratio as well. "Within caps" could be met by spawning nothing,
  so every absence assertion has a presence twin (`gates-and-probes.md` rule 2).

### Move A: the encounter table (`frontend/src/game/encounters.js`)

**What it is.**
- Rows: `{ id, contexts, tiers: [min, max], weight, members: [{ type, count: [min, max], elite? }] }`. A member's
  `elite: 'ember'` forces the affix (the `dungeon_warden` brute) and still counts toward `ELITE_ALIVE_CAP`. Contexts are `day`,
  `night`, `siege`, `shrine` and `dungeon`. `pickEncounter` rolls the counts and returns the members in order, leader
  first.
- `hostileBias` keeps today's night knob: with probability `hostileBias` the pick is restricted to all-hostile rows.
  SpawnerSystem still computes it as `siegeParams(store.nightCount, …).hostileChance`, so the existing gate stays green
  unedited. **The knob only selects if the night context has a passive row**, so the table carries two
  (`night_strays`, `night_ox`). Without them every night row is all-hostile, the bias changes nothing, and night 1
  would be 100% hostile against today's 92.6%. With them, the member-weighted hostile share at tier 0 is 0.927 / 0.942
  / 0.957 for nights 1 / 2 / 3, against today's 0.926 / 0.941 / 0.955 (computed from the table, 2026-10-27).
- Stats scale with zone tier: HP x[1, 1.15, 1.30, 1.45, 1.60], damage x[1, 1.10, 1.20, 1.30, 1.40]. **Tier 0 is the
  identity**, so the capture showcases, boss adds and near-spawn play are byte-identical.

**Elites.**
- `ember`: HP x1.6, damage x1.15, XP x2. `captain`: HP x2.4, damage x1.25, XP x3.
- XP does not scale with tier, because loot already does (`QuestSystem.jsx:394-397`).
- An ember elite rolls only at tier >= 2 (chance 0.15 per group, on the group's first hostile member). At most 4 live
  elites at once (`ELITE_ALIVE_CAP`); past that, an elite roll spawns as a normal mob.

**Kid safety (threat P5).**
- At tier 0 by day: no moss brute, no duskhound pack, no elite.
- The expected hostile share of SPAWNED MEMBERS stays within [0.55, 0.75] of today's 0.703. The v1 table below gives
  **0.611** at tier 0 by day (hostile 4.4 / passive 2.8 member-weight; the first draft's boar 1.0 and ox 0.8 weights
  gave 0.489 and failed its own band). So near-Hearth days are about 13% calmer than today, at the same cap. This is a
  Kevin-batched tuning number, stated, not hidden.
- The refill rate stays today's: each 1 s tick draws groups until up to 3 members are placed (at most 3 groups); a
  group that does not fit the tick's remaining budget waits whole for the next tick. One group per tick would have
  dropped the refill from 3 mobs/s to about 1.4.
- Ambient groups have at most 3 members, which matches the spike guard.

**The table v1.** All numbers are tunable and batched to KEVIN-REVIEW-BATCH.

| id | contexts | tiers | weight | members |
|---|---|---|---|---|
| `lone_husk` | day, night | 0-4 | 1.0 | zombie x1 |
| `lone_bonepicker` | day, night | 0-4 | 0.8 | skeleton x1 |
| `lone_spider` | day, night | 0-4 | 0.8 | spider x1 |
| `lone_ember` | day, night | 0-4 | 0.6 | emberhusk x1 |
| `skitter_pair` | day | 0-0 | 0.6 | skitterling x2 |
| `skitter_trio` | day, night | 1-4 | 0.8 | skitterling x3 |
| `boar_herd` | day | 0-4 | 0.6 | pig x2-3 |
| `ox_pair` | day | 0-4 | 0.4 | cow x2 |
| `settler` | day | 0-4 | 0.5 | villager x1 |
| `night_strays` | night | 0-4 | 1.6 | pig x1 |
| `night_ox` | night | 0-4 | 0.4 | cow x1 |
| `hound_pack` | day 1-4; night 0-4 | 0-4 by context | 0.7 | duskhound x3 (night tier 0: x2) |
| `archer_screen` | day, night | 1-4 | 0.6 | zombie x1, skeleton x2 |
| `ember_patrol` | day, night | 1-4 | 0.6 | emberhusk x2 |
| `brute_camp` | day, night | 2-4 | 0.5 | moss_brute x1, zombie x2 |
| `night_brute` | night | 1-4 | 0.4 | moss_brute x1 |
| `siege_line` | siege | 0-4 | 1.0 | zombie x2, emberhusk x1 |
| `siege_archers` | siege | 0-4 | 0.7 | skeleton x2 |
| `siege_runners` | siege | 0-4 | 0.7 | skitterling x2, spider x1 |
| `siege_hounds` | siege | 1-4 | 0.6 | duskhound x2 |
| `siege_brute` | siege | 2-4 | 0.4 | moss_brute x1 |
| `shrine_wardens` | shrine | 0-4 | 1.0 | emberhusk x1, skeleton x1 |
| `shrine_swarm` | shrine | 1-4 | 0.7 | skitterling x3 |
| `dungeon_guard` | dungeon | 0-1 | 1.0 | skeleton x1, zombie x2 |
| `dungeon_warden` | dungeon | 2-4 | 1.0 | moss_brute x1 (ember), skeleton x2 |

`hound_pack` is two rows in code, one per context, with tiers set separately. The table holds data only.

**Costs.**
- GPU: 0. Group spawning stays under the same cap (Move E covers elites).
- Main chunk: about 2.0 KB.

### Move B: placing a group (`frontend/src/systems/groupPlacement.js`, `frontend/src/game/spawnLog.js`)

**What it is.**
- An ambient anchor comes from the existing `runSpawnPlacement` with `spawnCount: 1` and a `trySpawn` that places the
  whole group around that point. `runSpawnPlacement` changes in one place only: it counts a spawn when `trySpawn`
  returns `!= null`, because `spawnMob` now returns an id and id 0 is falsy (Unit 2b).
- `placeGroup` puts the members within `spread` (3 m) of the anchor, tries at most 3 points per member, and asks
  `spawnMob` to ground-check each one (the 5-column `spawnGroundAt`, `mobFloor.js:123-130`).
- `fitToCap` truncates a group to the free slots and keeps the leader.
- `sectorAnchor` serves the siege. It accepts a point only if:
  - it lies in a loaded chunk,
  - it is within `halfAngle` of a bearing measured from the objective,
  - it is in [minD, maxD] from the objective,
  - it is in [28, 85] from the player (the same visible-safe band).
  It **proposes** points as polar samples inside the sector band (bearing +/- `halfAngle` about the objective, radius
  in [minD, maxD]) and then filters by loaded chunk and player band. It does not sample a random loaded chunk the way
  `runSpawnPlacement` does (`spawnPlacement.js:21-24`): that would waste most tries outside a 60-degree sector.
  It gives up after 12 tries. On the iPad's low tier the loaded box is only +/-2 chunks
  (`quality.js:20`; `Terrain.jsx:785-798`), so the sector band is [30, 56] m and the chunk filter does the rest.
- `spawnLog` is a 64-entry ring of `{ t, source, encounterId, types, elites, x, z, tier, isDay, bearing, fallback }`,
  read by a dev hook and the lookbook seam.

**Costs.**
- GPU: 0.
- CPU: at most 3 members x 3 tries x one `spawnGroundAt` (5 column checks) per second.
- Main chunk: about 1.2 KB.

### Move C: the siege director (`frontend/src/game/siegeDirector.js`, `frontend/src/systems/SiegeDirectorSystem.jsx`)

**Waves are keyed to the game clock, not to wall time.**
- Waves launch at 0, 45 and 95 s into the night, which is 0, 180 and 380 units of the 600-unit half
  (`GAME_UNITS_PER_SECOND` = 4). The schedule therefore pauses with the clock: menus, death and capture all stop it,
  for free.
- **The horn is `lastNightfall`, NOT a `nightCount` change.** `nightCount` is also written directly by a load
  (`useGameStore.jsx:1077`, `:1139`; `:1060` only reads it into `hydrateBossState`) and by the perf probe (`frontend/src/devtest/PerfProbeRunner.jsx:53`). A watcher on
  it would sound a horn on every night-save reload, which is the B2f trap documented at `useGameStore.jsx:811-816`.
  `setGameTime`'s genuine-crossing branch (`:817-821`) becomes the only writer of `lastNightfall: { night, gameTime }`,
  and `loadWorldData` resets it to null.
- **A reload mid-night therefore ends that night's siege.** Mobs are not saved (`frontend/src/game/saveSchema.js`
  holds no mobs) and ambient night spawning resumes. There is no burst and no second captain. Perf scenario B (direct
  writes) stays siege-free, so it remains a valid "today" baseline after this lands.

**Wave sizes.**
- `size(n, k) = min(10, base[k] + floor(n * growth[k]))`, with base [2, 2, 3] and growth [0.5, 0.75, 1.0].
- Ember elites: `min(3, floor((n - 1) / 2))`, placed in waves 2 and 3.
- Wave 3 always carries one captain: an emberhusk at tier <= 1, a moss brute at tier >= 2.
- **Night 1 is gentle:** one bearing, sizes [2, 2, 3], no ember elites, and the captain at x1.6 HP instead of x2.4.
- Two bearings from night 3 on, with waves alternating between them.
- A unit test proves every wave's SIZE fits `siegeParams(n, z).maxMobs - 4` for n in 1..12 and z in 0..4. That is a
  size bound only: it says nothing about the population already alive at the horn, which is what starves a wave
  (below).

**Bearings.**
- Eight candidates scored by an injected `landScore(bearing)`: 3 ground probes along each bearing at 40 m, with
  ground above `SEA_LEVEL` 28 (`frontend/src/world/oceanProfile.js:8`). That is 24 casts, once per night.
- The best is picked with a seeded tie-break, and two bearings are never within 90 degrees. A siege never comes out
  of the sea.

**Objective.**
- `siegeObjective` picks the anchor nearest the player within 32 m, from the Hearth at (0, 0) and the build anchor
  (Move F). If none is in range, the objective is the player.
- 32 m, not the roadmap's "nearer of the two": chunks load only around the player, and the cull is at 100 m. A base
  300 m away cannot be marched on in a world that does not exist there.

**Spawning, the queue, and the march.**
- Each wave's members are queued and drained through the shared spawn budget (Unit 2b): at most 3 per second across
  every source, and **never above the cap**. Members that do not fit wait in the queue, which is dropped at dawn.
- From the horn until the last wave is fully placed, ambient night spawning is off (`ambientAllowed`). That alone
  does NOT keep waves fed: the day population carries over. The day fill tops up to 16 (NPCs and passives included,
  `SpawnerSystem.jsx:149`), and the boot ring can leave 24 alive (Open question 1), against a night-1 cap of 20. With
  no kills, nights n = 1..3 have at most 4n free slots, fewer than the wave totals of 7, 11 and 13. So:
  - **Horn clearance.** At the horn, the director retires non-static, non-aggro, non-siege mobs more than 30 m from
    the player, farthest first, until the free slots reach the night's wave total or none are left. A retired mob
    leaves through the death dissolve without a kill: `dyingUntil` is stamped while `health` stays above 0, so
    CombatSystem's kill path (`CombatSystem.jsx:119`, `health <= 0 && !dyingUntil`) never fires and there is no XP,
    loot or kill event. The per-frame sweep removes it (`frontend/src/systems/corpseSweep.js:38-41`).
  - **The captain is first in wave 3's queue**, not last. If no slot is free when wave 3 launches, the director retires
    one more mob (the same rule) so the captain spawns within 2 s of wave 3.
  - The test is cumulative and seeded with a carried population (Unit 6, Step 5), not per wave in isolation.
- Wave members carry `siegeRole` ('wave' or 'captain'), `anchorMode: 'march'` and `anchorX/Z` (the objective).
- **Pathing.** Marchers, hunters and routers run the worker's 9x9 A* step (today it runs only inside the aggro branch,
  `ai.worker.js:272-298`). Without it, the grid only feeds `clampMove` (`:336-341`), which stops a mob at a wall.
- Stuck detection: a marcher that moves less than 1.5 m in 6 s of world time **sidesteps**: its anchor moves 8 m to
  one side, perpendicular to the blocked line (alternating sides), for 4 s, then returns to the objective. After two
  sidesteps that fail, it switches to `anchorMode: 'hunt'`, whose anchor follows the player each director tick. The
  first draft switched straight to hunting, which changes nothing in the common case: when the objective is the
  Hearth with the player on it, or is the player, the hunt anchor is the same point on the same blocked line.

**The worker.**
- The non-aggro branch (`ai.worker.js:299-316`) first asks `idleGoal`:
  - `march`, `hunt`, `rout`: steer to the anchor.
  - `camp`: wander, but turn back past a 4 m leash.
  - `null`: today's wander, unchanged.
- Aggro still wins, and pack alert still works, **with one exception: a mob whose `routUntil` is in the future is
  never aggro.** The worker checks `routUntil > now` before its aggro test (`ai.worker.js:128`), steers to the rout
  anchor, and re-enables aggro when it expires.
- `anchorMode/X/Z` and `routUntil` are main-thread-owned and travel in the payload the way `staggerUntil` does
  (`mobStateSync.js:41`), on the same clock. They are NOT in `MOB_STATE_FIELDS`.
- `AIWorkerSystem` gives march, hunt and rout mobs a grid, as it does for aggro mobs, and the worker's A* steering step
  runs for any mob with a goal and a grid (lifted out of the aggro block). The cost model is unchanged: at most N A*
  solves per tick.

**Seen and heard.**
- One red compass wedge per bearing (`data-siege-wedge`, label `t('siege.compass')`), from the pure
  `siegeMarkers(...)` in `frontend/src/game/compass.js`. **A bearing outside the 180-degree strip is pinned to the
  nearer edge (pct 0 or 100) with a direction chevron and `behind: true`**, never filtered and never placed off the
  clipped track. A siege from behind is the case the wedge most needs to show.
- A `SiegeBanner` toast for the horn, each wave, the captain's arrival and the break.
- **The audible horn and the numbered night toast move to `lastNightfall`** too. Today they fire on the raw `isDay`
  edge (`DayNightAudio.jsx:21`, `survivalSystem.js:19-27`), which a night-save load also flips; after this plan a
  reload ends that night's siege, so a horn on load would announce a siege that never comes. The dawn chime and the
  dawn bleed stay on the `isDay` edge.
- The siege toast becomes `t()`-keyed: `siegeWarningKey(n)` returns `{ key, vars }`, and `siegeWarning(n)` keeps
  returning the same English by interpolating `STRINGS.en`, so the existing gate stays green unedited.

**Soft death in a siege.**
- When the player respawns during a siege, every non-captain siege mob within 16 m gets `routUntil = now + 8 s` and a
  rout anchor 30 m from the player along the player-to-mob direction, then goes back to `march`. Respawn does not
  move the player (`useGameStore.jsx:1002-1011`).
- **`routUntil` overrides aggro** (The worker, above). Without that override the rout is dead on arrival: every mob
  within 16 m is inside its own aggro range (20 m by default, 16 m skitterling, 28 m duskhound;
  `frontend/src/game/mobArchetypes.js:40`, `:55`, `:57`), so the worker would re-aggro it on the next 15 Hz tick and it
  would attack as soon as the 5 s protection ended.
- At about 2 m/s for 8 s a routed mob ends near 30 m out, beyond most aggro ranges. With the existing 5 s spawn
  protection, a child is not spawn-camped at the Hearth. The proof is the worker-driven gate in Unit 6, not the
  runtime test, which can only see that a field was set.

**The end.**
- At natural dawn or an early break, every non-aggro siege mob routs outward (anchor = objective + 120 m along its
  bearing), and the existing 100 m cull removes it.

**Costs.**
- GPU: 0 (the wedge is DOM).
- The cost per frame is set out below.
- Main chunk: about 3.0 KB (director, system, banner, compass marker).
- The worker change ships in the AI worker's own chunk, not `index`.

### Move D: the captain and the early dawn

**What it is.**
- `emitMobKill` gains a 4th argument, the entity. Existing 3-argument subscribers are unaffected.
- The director subscribes. A kill of the entity whose `id === store.siege.captainId`, from any source, breaks the
  siege. It matches on `captainId`, not on `siegeRole`, so a captain carried over in any form cannot break a later
  night. **The break is applied synchronously in the bus callback** (`setSiege({ phase: 'broken' })` and
  `store.startDawnRush()`; a kill is a change event, so the write is allowed), not deferred to the next director
  tick. The director ticks on `worldDelta`, which is 0 through a hitstop, and a kill usually lands inside one.
- The captain and every elite are unbindable (Move E), so the captain ends only by a kill or a cull.
- The 1 Hz clock steps `clockStepUnits({ dawnRush })` units per tick: 60 while rushing, else 4. `setGameTime` (still
  the single writer) clears `dawnRush` on the crossing into day.
- The natural dawn chain then runs exactly as it always does: Aspect bleed, the once-per-night dawn reward, zones
  cleared.
- A captain killed at 95 s leaves at most 220 units, about 4 s of time-lapse sunrise.

**Costs.**
- GPU: 0, but the light lane's sky must tolerate 4 s of 60 units/s. That is Open question 2.
- Main chunk: about 0.8 KB.

### Move E: elites you can see on every tier

**The crown and banner.**
- `eliteFeatures(rank, dims)` (`frontend/src/game/eliteLook.js`) returns feature boxes in the `mobFeatures`
  vocabulary:
  - `ember`: a 3-box crest above the head, tone `ember`.
  - `captain`: the same crest plus a 2-box banner (pole and flag) on the back.
- `featureColor('ember')` returns ember `#FF7A2A`. The crest material is emissive, so it reads at night without the
  rim (the rim is off on low and med). **That needs a MobModel change:** the hit-flash traverse
  (`MobModel.jsx:195-217`) zeroes every toon material's emissive every frame (Current state). The traverse learns to
  remember and restore an authored emissive the way it already remembers and restores colour
  (`rememberAuthoredColor` / `restoreAuthoredColor`): `rememberAuthoredEmissive(mat)` on first touch, and the idle
  branch restores `emissive` and `emissiveIntensity` instead of writing black and 0. The decision is a pure
  `idleEmissive(material)` in `frontend/src/render/characterStyle.js`, so it is testable without a renderer.
- Elite crest and banner boxes set `castShadow={false}`: they are small, and each would otherwise add a shadow-map
  draw.

**Unbindable.** `convertMobToAlly` refuses any entity with `elite` set (`allegiance.js`, by flag, beside the
`villager` type rule). The snare candidate filter (`Components.jsx:759`) and the nametag's jade "bindable" tell
(`nametagData.js:24`) read the same pure `isBindable(entity)`, so an elite at 30% HP shows its normal colour, is never
snared, and cannot become a full-HP x2.4 ally wearing a captain's banner.
- If move 11's merged pipeline has landed, these are instances in it. Otherwise they render through the existing
  `features.map` (`MobModel.jsx:344-350`).

**Nametags.**
- Nametags read `t('mob.<type>')`. An `en` entry equals the registry's `displayName`, checked by a test, so capture
  frames with nametags do not change.
- Elites read `t('encounter.elite_name', { name })` in ember; the captain reads `t('siege.captain_name')`.

**Costs.**
- **GPU: +3 meshes per ember elite and +5 per captain, each with an outline child on every tier.** With
  `castShadow={false}` on these boxes, that is +6 draw calls per elite and +10 per captain before move 11's merge, and
  about 0 after it. (With `castShadow` left on, as every existing feature box has it, each box is 3 draws and the worst
  case below is 42, not 28.) Not checked: whether N8AO on med and high adds a further depth or normal pass; Acceptance 2
  measures the real count.
- Worst case alive: 3 ember plus 1 captain = +28 draws. **`ELITE_ALIVE_CAP` = 4 is enforced in one place, `spawnMob`
  with `opts.elite`, for every source** (ambient, siege, dungeon). It counts every live elite including the captain.
  An ember roll is downgraded to a normal mob when 3 or more elites are alive, which keeps one slot for a captain; the
  captain itself is never refused. The first draft consulted the cap only in the ambient consumer, so a siege could
  stack 4 more elites on 4 ambient ones. No new light, no new pass.
- Main chunk: about 1.6 KB (20 mob-name and 12 siege strings in two locales, plus the feature specs).

### Move F: the build anchor (walls matter)

- `buildAnchor(worldBlocks, { nearX, nearZ, radius })` (`frontend/src/game/buildMemory.js`) scans the Map once and
  keeps the last 48 non-zero entries. The cluster is the entries within 12 m of the most recent one; it needs at
  least 6 blocks, and its centroid is the anchor.
- The scan runs only at the horn and at each wave launch (4 times a night).
- **`Terrain.jsx` gets one line**: placement deletes the key before it sets it (`Terrain.jsx:1013`), so a re-placed
  cell moves to the end of the Map. Without it, a player who clears ground and then walls those same cells leaves the
  wall's keys at their old positions, and the anchor clusters on an older build or comes back null. Saves keep the
  same entries; only their order changes.
- Costs: GPU 0. One O(M) scan of `worldBlocks` per call. Main chunk about 0.6 KB.

### Move G: dungeon guardians (consumer 3)

**Finding a dungeon on the main thread.**
- Move `isDungeonChunk`, the centre offset and the floor Y into `frontend/src/world/dungeonStamp.js`, which the worker
  already imports from. `terrain.worker.js` then imports them, which changes no behaviour.
- Add `dungeonSiteNear(x, z)`, which looks at the 3x3 chunks around the player.

**The consumer.**
- A 1 Hz check in a small `DungeonGuardianSystem` fires when the player is within 20 m horizontally of a site centre
  and below y = 26, so the guardians are in place while the player is still digging toward the room. (The first
  draft's 10 m put the trigger at or inside the 13x13 room's wall, a visible pop-in.)
- It spawns the `dungeon` context's group at the room's floor: explicit Y 13, at 3 m from the centre and clear of the
  altar. **This is a stated exception to the [28, 85] m visible-safe band**: the room is enclosed cobblestone, so the
  player cannot see inside until they break in, and the guardians are an authored set piece, like the boss adds.
- **Guardians go through the shared spawn budget** (Unit 2b): `fitToCap(maxMobs - active)` and the 3-per-second
  bucket. Guardians that do not fit are queued and placed on later seconds, as siege members are. The first draft
  consumed neither, so a dungeon entered at night could reach cap + 3.
- Guardians are `anchorMode: 'camp'`, anchored on the centre, so they guard the room.
- A session-only `cleared` set means a room spawns its guardians once per session.

**Costs.**
- GPU 0. CPU: 9 `Math.sin` hashes per second.
- Main chunk about 1.0 KB. It goes behind a dynamic import if Unit 9 measures over 1 KB, because it is a rare-moment
  path.

### Move H: shrine events (consumer 4, the hand-off)

- `planHoldWaves({ zoneTier, holdSec, seed })` builds the waves for a hold-the-light event from the `shrine` context,
  through the same wave assembly the siege uses, cap-checked.
- **The relight plan's own seam is `shrineWaves(tier) -> [string[], string[]]`, each wave at most 4 long**
  (`2026-10-27-crafty-relight-frontier.md:260`, `:606`: "It replaces `shrineWaves(tier)`, keeping that signature").
  This plan therefore ships `shrineWaves(tier)` as a thin adapter over `planHoldWaves` that maps members to type
  strings, keeping relight's signature exactly. Both live in `frontend/src/game/holdWaves.js`, imported only by
  relight's lazy chunk, so they leave the `index` chunk (they move out of `siegeDirector.js`). If knip flags the
  adapter as an unused export before relight lands, Unit 10 lands with relight's consuming unit instead.
- **One spawn-refusal seam, not three.** Relight adds a `blocked(x, z)` predicate to `runSpawnPlacement`
  (relight `:245`), the lantern refuses inside `spawnMob` on `!forceType` (lantern `:203`, `:741`), and the first draft
  of this plan offered `canSpawnAt` on `placeGroup` and `sectorAnchor`. This plan adopts the lantern's place, inside
  `spawnMob`, keyed on `opts.source` rather than `!forceType` (Unit 2b). A refused spawn returns null and every anchor
  finder already retries within its bound, so the anchor finders need no predicate. `canSpawnAt` is dropped.
- **The event itself, its call site and its lived proof belong to "Relight the frontier"** (roadmap 14, built after
  this). This milestone ships the rows, the function and its tests, and states the interface below.
- Three consumers are lived here. The fourth is lived in that plan.
- Costs: GPU 0. Main chunk 0: `holdWaves.js` ships in relight's lazy chunk (about 0.5 KB there).

### Mob AI cost per frame (the statement the brief asks for)

The model is below. Unit 0's meter replaces the estimates with measurements before Unit 6 lands.

- **The ceiling does not move.** AI-ticked mobs N <= cap - 4 <= 44. Gridded mobs G <= N. Worst tick: 44 x 81 = **3,564
  floor queries (each at least 1 castRay) in one frame**, every 4th frame at 60 fps. That is about **891 per frame
  amortised**, plus N reply snaps. The worker does at most N 9x9 A* solves per tick. This is today's worst case,
  reached when every mob is aggro. Lifting the A* step to march, hunt and rout mobs (Move C) raises the TYPICAL A*
  count during an approach to "aggro plus marching", never above N.
- **The typical cost rises during a wave's approach.** G grows from "aggro mobs" to "aggro plus marching", for about
  10-25 s per wave: 30-56 m covered at 1.2-3.8 m/s base speed (`mobTypes.js`).
- **The ambient pause pulls the other way.** Today the night cap refills within seconds. During the waves this plan
  holds ambient spawning off, so the live count during a siege is at most today's and usually below it.
- **New per-tick work:** the director at 15 Hz is arithmetic over the queue and the siege mobs. Spawns are at most 3
  per second x 5 column checks. Bearing scoring is 24 casts per night. Stuck checks are one distance per siege mob per
  tick. The dungeon check is 9 hashes per second.
- **GPU per frame:** draws stay under today's ceiling because the cap does not change, except elites, at +6 per elite
  (+10 per captain) and at most +28, which holds only because elite boxes do not cast shadows and `spawnMob` enforces
  the elite cap for every source (Move E).
- **Conditional Unit 12.** If Unit 6 measures `buildMs` p95 above max(1.25 x the Unit 0 baseline, 4 ms) at wave 3 of
  night 6 on the M3 Max in Chromium, Unit 12 staggers grid rebuilds by id parity. That halves the spike frame and
  costs every mob an alternate-tick straight step.

### Interfaces other lanes consume

- **Relight the frontier (move 14):** `shrineWaves(tier)` with relight's own signature, `planHoldWaves({ zoneTier,
  holdSec, seed })` (both in `game/holdWaves.js`), `pickEncounter({ context: 'shrine', zoneTier, rng })`,
  `placeGroup(...)`, and the shared `store.spawnMob(x, z, type, y, opts)` of Unit 2b, where relight's
  `{ shrineEventKey, isAggro }` are keys of the one `opts` schema and `source: 'shrine'`. The spawn-log `source` is set
  by the caller's `logSpawn`. Lit-shrine spawn suppression registers a refusal rule in `spawnMob` (Unit 2b) instead of
  adding `blocked(x, z)` to `runSpawnPlacement`; this needs relight's owner to agree (hand-off, Unit 10).
- **The lantern (move 12, which lands BEFORE this move):** its "no hostile spawn at light >= 8" rule stays inside
  `spawnMob`, where its plan puts it, but keys on `opts.source` in `{ ambient, boot, siege }` instead of
  `!forceType`. After Unit 3 every natural spawn has a forced type, so `!forceType` would never be true and lanterns
  would stop refusing anything. `siegeObjective`'s `anchors` list takes lantern clusters.
- **The first minute (move 6, Phase 2):** its `prologueActive` passive-only rule keys on `opts.source` in
  `{ ambient, boot }` (Unit 2b), and the table pick honours it (`pickEncounter({ ..., passiveOnly: true })`). Its
  `clockHeld` already keeps the prologue off a siege night (first-minute D6), so this plan offers no
  `siegeSuppressed`: no lane would write it.
- **Feedback grammar (move 11):** `entity.elite` ('ember' or 'captain') plus `eliteFeatures` specs. The merged
  pipeline instances them.

---

## Units

The order is the dependency order, and each unit ships independently and keeps the game playable. Run tests from
`<repo>/frontend`. Before a unit's commit, also run the commit tier (`npm run test:unit`, `npm run lint`,
`npm run build && node scripts/ci/bundle-budget.mjs`) and record the `index` bytes in the commit body.

### Unit 0: the AI cost meter (instrument first)

**Files:**
- Create: `frontend/src/game/aiCostMeter.js`, `frontend/src/game/aiCostMeter.test.js`
- Modify: `frontend/src/systems/AIWorkerSystem.jsx:205-245` (time payload build through `postMessage` and count
  grids); `:52-124` (time the reply apply); `frontend/src/workers/ai.worker.js:360-364` (add `workerMs` to
  `TICK_RESULT`)
- Modify: `frontend/src/App.jsx` near `:335` (`registerTestHook('readAiCost', …)`); `frontend/src/devtest/PerfProbeRunner.jsx` (add `ai: summary` to `__craftyPerfResult`)

**Interfaces:**
- Produces: `makeCostMeter(capacity = 240)` returns `{ record({ buildMs, applyMs, workerMs, grids, mobs }), summary() }`.
  `summary()` returns `{ n, buildMs: {p50, p95, max}, applyMs: {...}, workerMs: {...}, gridsP95, mobsP95 }`. p95 is
  nearest-rank. With n = 0 every stat is 0, never NaN.
- Produces: a module singleton `aiCost` (one meter), read by the hook and the perf probe.

- [ ] **Step 1: Write the failing test** in `aiCostMeter.test.js`:
  `p95 is nearest-rank, not the mean` (records 1..100 ms; expect p95 95, p50 50, max 100);
  `the window evicts the oldest` (capacity 10, records 20; expect n 10 and min-based p50 from the last 10);
  `an empty meter reads zeros, not NaN`;
  `grids and mobs are summarised`. The file carries `Mutation-Proof:` lines for M0a and M0b.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/aiCostMeter.test.js`. Expected: FAIL, "makeCostMeter is
  not a function".
- [ ] **Step 3: Implement** the meter as a ring buffer of plain numbers, with sort-on-summary only (summary is called
  by hooks, not per frame). Wire the bridge: `performance.now()` around `:209-244` with `grids` counted in the map
  callback. The worker stamps `workerMs` around its loop.
- [ ] **Step 4: Run, expect PASS.** Mutants, by hand from a `cp` backup: **M0a** p95 returns the mean, so the p95 test
  goes RED. **M0b** the ring never evicts, so the window test goes RED. **M0-id**, the identity, stays GREEN.
- [ ] **Step 5: Measure the baseline (local, real hardware, lightly loaded machine; `uptime` first).**
  `npx playwright test tests/e2e/perf-siege.spec.js` (`@local-only`). Record the logged `ai` block (buildMs, applyMs,
  workerMs p50/p95/max, gridsP95, mobsP95) in this plan under "Measured" below, with the machine load average.
  Afterwards report leftover processes and listening ports read-only (`pgrep`, `lsof`); the command session runs the
  sweep, `scripts/dev/kill-test-procs.sh` (DECISIONS 2026-11-01 item 536).
- [ ] **Step 6: Commit.** `git commit -m "feat(ai): a cost meter on the AI bridge — build, apply and worker ms per tick, grids per tick; the siege baseline measured"`.

### Unit 1: the encounter table

**Files:**
- Create: `frontend/src/game/encounters.js`, `frontend/src/game/encounters.test.js`

**Interfaces:**
- Consumes: `MOB_TYPES` (`frontend/src/game/mobTypes.js`), `weightedPick` (`frontend/src/game/spawnWeights.js`).
- Produces:
  - `ENCOUNTERS` (frozen rows, as in the Design table).
  - `MAX_AMBIENT_GROUP` = 3. `ELITE_ALIVE_CAP` = 4. `TIER_HP`, `TIER_DMG`, `ELITE`.
  - `pickEncounter({ context, zoneTier = 0, rng, hostileBias = 0, allowElite = true, passiveOnly = false })` returns
    `{ id, members: Array<{ type, elite: null | 'ember' }> }`, or `null` when no row is eligible.
  - `scaledStats(type, { zoneTier = 0, elite = null })` returns `{ health, damage, xp }`.
  - `eligibleRows(context, zoneTier)` returns the rows.
  - `isHostileType(type)`.

- [ ] **Step 1: Write the failing tests.**

```js
it('no moss brute near spawn by day: every eligible row, and 2,000 seeded draws', () => {
  const rows = eligibleRows('day', 0);
  expect(rows.length).toBeGreaterThan(3); // denominator
  expect(rows.flatMap((r) => r.members.map((m) => m.type))).not.toContain('moss_brute');
  let n = 0, brutes = 0; const rng = seeded(7);
  for (let i = 0; i < 2000; i++) { const e = pickEncounter({ context: 'day', zoneTier: 0, rng }); n++; brutes += e.members.filter((m) => m.type === 'moss_brute').length; }
  expect(n).toBe(2000); expect(brutes).toBe(0);
});
it('groups exist at tier 0 (presence before absence)', () => {
  expect(eligibleRows('day', 0).some((r) => r.members.reduce((s, m) => s + m.count[0], 0) >= 2)).toBe(true);
});
it('no elite below tier 2 by day or night; some elites at tier 3', () => { /* 2,000 draws each; 0 at tiers 0-1, > 0 at tier 3 */ });
it('scaledStats is the identity at tier 0 with no elite, for every registry type', () => {
  for (const [k, c] of Object.entries(MOB_TYPES)) expect(scaledStats(k, {})).toEqual({ health: c.health, damage: c.damage, xp: c.xp });
});
it('scaledStats varies along BOTH axes (tier and elite)', () => {
  const t4 = scaledStats('zombie', { zoneTier: 4 }), e0 = scaledStats('zombie', { elite: 'ember' });
  expect(t4.health).toBe(160); expect(e0.health).toBe(160); expect(t4.xp).toBe(25); expect(e0.xp).toBe(50); // same HP, different XP: a wrong axis cannot match both
  expect(scaledStats('zombie', { zoneTier: 4, elite: 'captain' }).health).toBe(384);
});
it('tier-0 day hostile member share stays within [0.55, 0.75] (today 0.703)', () => { /* analytic expectation over weights x mean counts; v1 table gives 0.611, assert toBeCloseTo(0.611, 3) too so a silent retune is seen */ });
it('hostileBias selects at night, both ways', () => { /* 500 night draws at tier 0: bias 0 gives passive members > 0 (denominator); bias 1 gives 0 */ });
it('night member share tracks today at bias 0.75 / 0.80 / 0.85', () => { /* analytic: 0.927 / 0.942 / 0.957, each within 0.01 of today's 0.926 / 0.941 / 0.955 */ });
it('passiveOnly picks only passive rows, by day and by night', () => { /* the prologue hook of Unit 2b; 1,000 draws each, denominator asserted */ });
it('every ambient group fits the 3-per-tick spike guard', () => { /* all day/night rows: max count sum <= MAX_AMBIENT_GROUP */ });
it('every member type exists in MOB_TYPES and every id is unique', () => {});
it('a seeded rng gives the same sequence', () => {});
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/encounters.test.js`. Expected: FAIL, the module cannot be
  resolved.
- [ ] **Step 3: Implement** `encounters.js` from the Design table. `pickEncounter` filters with `eligibleRows`, then
  (if `passiveOnly`) restricts to all-passive rows, else (if `rng() < hostileBias`) restricts to all-hostile rows, then picks with `weightedPick`, rolls each `count` with
  `rng`, and rolls `ember` on the first hostile member when `allowElite && zoneTier >= 2 && rng() < 0.15`.
  `scaledStats` rounds HP and damage with `Math.round`.
- [ ] **Step 4: Run, expect PASS.** Mutants: **E1** `brute_camp` tiers [0, 4] makes the brute test RED. **E2** the elite
  roll drops its tier gate, so the elite test goes RED. **E3** `scaledStats` ignores tier, so the both-axes test goes
  RED. **E4** `TIER_HP[0]` = 1.05 makes the identity test RED. **E5** `hostileBias` is ignored, so the bias-1 half of
  the two-sided bias test goes RED (it can only go red because the night rows now include passives). **E5b** the two
  night passive rows deleted makes the bias-0 half RED. **E6** `hound_pack` count [3, 4] makes the spike-guard test
  RED. **E7** `passiveOnly` ignored makes the passive-only test RED. Record them as `Mutation-Proof:` lines in the
  file.
- [ ] **Step 5: Commit.** `git commit -m "feat(encounters): one encounter table — five contexts, tier-scaled stats with tier 0 the identity, elites only far out"`.

### Unit 2: group placement and the spawn log

**Files:**
- Create: `frontend/src/systems/groupPlacement.js`, `frontend/src/systems/groupPlacement.test.js`,
  `frontend/src/game/spawnLog.js`, `frontend/src/game/spawnLog.test.js`

**Interfaces:**
- Produces:
  - `fitToCap(members, free)` returns `members.slice(0, max(0, free))`.
  - `placeGroup({ anchorX, anchorZ, members, spread = 3, rng, trySpawn })` returns
    `{ placed, ids }`. `trySpawn(x, z, member)` returns an id or null, with at most 3 tries per member.
  - `angleDiff(a, b)` is in [-PI, PI].
  - `sectorAnchor({ candidateChunks, originX, originZ, bearing, halfAngle, minD, maxD, playerX, playerZ, rng, maxAttempts = 12 })`
    returns `{ x, z }` or `null`.
  - `logSpawn(event)`, `readSpawnLog()` (copies), `_resetSpawnLog()`. The ring holds 64.

- [ ] **Step 1: Write the failing tests:**
  `fitToCap keeps the leader` (`[a, b, c]` with free 2 gives `[a, b]`, free 0 gives `[]`);
  `placeGroup stays inside spread` (500 seeded runs, all points within 3 m);
  `placeGroup is bounded when every try fails` (`trySpawn` always null: exactly `members.length * 3` calls, placed 0);
  `sectorAnchor wraps at +/-PI` (bearing 3.1 rad accepts a point at -3.1 rad);
  `sectorAnchor keeps the visible-safe band from the PLAYER` (a point 20 m from the player is refused even inside the
  sector);
  `sectorAnchor returns null after maxAttempts on an empty sector` (counts rng calls);
  `sectorAnchor proposes inside the sector band` (every one of 500 proposals, captured through an injected
  `onPropose`, is within `halfAngle` and [minD, maxD] of the objective, before any filter);
  `the spawn log is a 64-ring and readSpawnLog returns copies`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/systems/groupPlacement.test.js src/game/spawnLog.test.js`.
- [ ] **Step 3: Implement.** Offsets are polar (`r = spread * sqrt(rng())`).
- [ ] **Step 4: Run, expect PASS.** Mutants: **G1** `angleDiff` without wrap makes the wrap test RED. **G2** the
  player-band check dropped makes the band test RED. **G3** tries unbounded makes the bound test RED. **G4** `fitToCap`
  keeps the tail makes the leader test RED. **G5** proposals drawn from a random loaded chunk (the
  `runSpawnPlacement` way) makes the sector-band test RED.
- [ ] **Step 5: Commit.** `git commit -m "feat(spawn): group placement, a siege sector anchor and a spawn log — bounded tries, wrap-safe bearings"`.

### Unit 2b: one spawn contract and one spawn budget (shared with the first-minute and lantern lanes)

**Why this unit exists.** Unit 3 turns every natural spawn into a typed spawn (the type comes from the table), and two
sibling plans key their safety filters on the untyped pick. The first-minute plan makes the prologue passive-only by
routing the boot ring and ambient through `pickSpawnType` (its `:569`), and the lantern refuses only `!forceType`
spawns (its `:203`, `:741`). After Unit 3, neither fires: hostiles would spawn during the Ember Prologue, and lanterns
would refuse nothing. Three plans also give `spawnMob` incompatible 5th parameters: this plan's `opts` returning an id,
first-minute's whitelisted `overrides` returning a boolean (its `:558`), and relight's `tags` (its `:221`). If
first-minute's whitelist lands first, this plan's `elite`, `encounterId`, `siegeRole` and `anchorMode` are dropped.
Build this unit on current main after re-reading what Phase 2 and the lantern actually landed in `SpawnerSystem.jsx`.

**Files:**
- Create: `frontend/src/systems/spawnContract.js` (pure: `SPAWN_OPTS_KEYS`, `NATURAL_SOURCES`, `normalizeSpawnOpts`,
  `spawnRefused(rules, ctx)`), `frontend/src/systems/spawnBudget.js` (pure: `makeSpawnBudget({ perSecond = 3 })`
  returning `{ take(n, nowMs) -> granted, free(maxMobs, active) }`), and their tests
- Modify: `frontend/src/systems/SpawnerSystem.jsx:27-85` (the signature and return), `:149-186` (ambient draws from the
  budget); `frontend/src/systems/spawnPlacement.js:29` (`if (trySpawn(x, z) != null) spawned++`) and its test
- Modify: `frontend/src/game/encounters.js` (add `eliteAllowed({ rank, liveElites })` beside `ELITE_ALIVE_CAP`)

**Interfaces:**
- `spawnMob(x, z, type = null, y = null, opts = {}) -> number | null`: the new entity's id, or `null` when refused
  (every `return false` becomes `return null`). Callers test `!= null`, never truthiness, because ids start at 0
  (`SpawnerSystem.jsx:24`, `:61`) and the first spawn in a capture fixture can be id 0.
- `opts` is ONE schema, the union of every lane's keys, whitelisted once: `{ source, elite, encounterId, siegeRole,
  anchorMode, anchorX, anchorZ, zoneTier, prologue, damage, shrineEventKey, isAggro }`. A lane adds its key to
  `SPAWN_OPTS_KEYS`; nothing is whitelisted per lane.
- `opts.source` is `'ambient' | 'boot' | 'siege' | 'dungeon' | 'shrine' | 'authored'`. Default: `'ambient'` when no
  type is given, else `'authored'`. `NATURAL_SOURCES = ['ambient', 'boot']`.
- Refusal rules live in one list consulted inside `spawnMob`, each keyed on source, not on `!forceType`:
  - prologue (move 6): while `prologueActive`, a hostile type with a NATURAL source is refused, and the table pick for
    natural sources passes `passiveOnly: true`;
  - light (move 12): a hostile type with source in `{ ambient, boot, siege }` is refused where `lightBound >= 8`;
  - lit shrine (move 14): proposed for relight's owner, same shape.
- Elite cap: `spawnMob` with `opts.elite === 'ember'` downgrades to `elite: null` (normal stats) when live elites
  (captain included) >= `ELITE_ALIVE_CAP - 1`; `'captain'` is never refused and is counted.
- The budget: one instance owned by `SpawnerSystem` and exported through the store (`store.spawnBudget`). Ambient,
  the siege drain, dungeon guardians and shrine waves all `take()` from it; together they place at most 3 per 1 s and
  never above `maxMobs - active`.

- [ ] **Step 1: Write the failing tests:**
  - `unknown opts keys are dropped and every lane's keys survive` (this plan's, first-minute's, relight's);
  - `the first spawn returns id 0 and runSpawnPlacement counts it` (a stub `trySpawn` returning 0, then 1: spawned 2);
  - `with prologueActive, 500 table-driven ambient and boot spawns contain zero hostiles` (types from Unit 1's
    `pickEncounter`, run through `normalizeSpawnOpts` and `spawnRefused`; denominator asserted), and the presence twin:
    with it false, hostiles > 0;
  - `a lantern-lit point refuses a typed ambient spawn and a siege spawn, but not an authored one`;
  - `ambient plus dungeon plus siege in the same second place at most 3 in total` (budget);
  - `an ember elite past the cap spawns as a normal mob, from the siege and dungeon sources too; the captain is never
    refused`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/systems/spawnContract.test.js src/systems/spawnBudget.test.js src/systems/spawnPlacement.test.js`.
- [ ] **Step 3: Implement.** Merge whatever Phase 2 and the lantern landed into this one contract, rather than
  layering a third signature on top.
- [ ] **Step 4: Run, expect PASS**, plus `npx vitest run tests/gates -t spawn`. Mutants: **P1** the prologue rule
  ignores typed natural spawns (`!forceType` restored), so the prologue test goes RED. **P2** the light rule keyed on
  `!forceType`, so the lantern test goes RED. **P3** `runSpawnPlacement` back to truthiness, so the id-0 test goes RED.
  **P4** the budget per source instead of shared, so the same-second test goes RED. **P5** the elite cap checked only
  for ambient, so the siege/dungeon elite test goes RED.
- [ ] **Step 5: Hand-off.** Record the contract in `docs/superpowers/KEVIN-REVIEW-BATCH.md` for the first-minute,
  lantern and relight owners (this plan does not edit theirs).
- [ ] **Step 6: Commit.** `git commit -m "feat(spawn): one spawn contract — an id or null, one opts schema, refusals keyed on source, one 3-per-second budget for every consumer"`.

### Unit 3: day and night groups in the live spawner (consumer 1, lived)

**Files:**
- Create: `frontend/src/systems/ambientSpawn.js`, `frontend/src/systems/ambientSpawn.test.js`
- Modify: `frontend/src/systems/SpawnerSystem.jsx`:
  - `:27-85`: on Unit 2b's contract (`spawnMob(x, z, type, y, opts) -> id | null`); when `opts.zoneTier != null` or
    `opts.elite`, stats come from `scaledStats`, and the entity carries `elite`, `encounterId`, `siegeRole`,
    `anchorMode/X/Z`. The existing callers at `frontend/src/App.jsx:448,706,774,792,843` and
    `frontend/src/render/BossEntity.jsx:375-376` ignore the return value or only log it (`App.jsx:843`), so `null`
    for a refusal changes none of them.
  - `:97-104`: the boot ring keeps its 20 positions and count but takes each member's TYPE from
    `pickEncounter({ context: isDay ? 'day' : 'night', zoneTier: 0 })`, using the leader's type only, with
    `opts.source: 'boot'` so the prologue and light rules still see it as natural.
  - `:148-186`: ambient draws groups until up to `free = min(maxMobs - activeMobs, 3)` members are placed (at most 3
    groups), through the shared budget, with `opts.source: 'ambient'`. A drawn group that does not fit the tick's
    remaining budget is held whole as `pending` and placed first on the next tick, never re-rolled, so the logged
    sequence of encounter ids equals the rng's sequence of picks.
  - The encounter picks consume their OWN rng stream (`encounterRng`, `Math.random` by default), separate from
    placement's, so a seeded stream gives the same picks however many placement tries the terrain costs.
- Modify: `frontend/src/App.jsx` near `:335`:
  - `readMobs` adds `elite, encounterId, siegeRole, anchorMode, maxHealth`.
  - New dev hooks `readSpawnLog`, `resetSpawnLog`, `clearHostiles` (removes live, non-static, non-passive mobs without
    a kill event), `clearMobs` (removes every live non-static mob, passives included, without a kill event; passives
    hold cap slots, so `clearHostiles` alone leaves the free count to chance) and `setEncounterSeed(seed)` (swaps
    `encounterRng` for the LCG of Unit 5; dev only).
- Create: `frontend/tests/e2e/encounters-siege.spec.js` (test 1)

**Interfaces:**
- Consumes: Unit 1 (`pickEncounter`, `scaledStats`, `ELITE_ALIVE_CAP`) and Unit 2 (`fitToCap`, `placeGroup`,
  `logSpawn`).
- Produces: `spawnAmbientGroup({ x, z, isDay, hostileBias, free, liveElites, rng, spawnMember, source = 'ambient' })`
  returns `{ encounterId, placed }`. `ambientAllowed({ isDay, siegePhase })` returns false while
  `siegePhase === 'waves'`.

- [ ] **Step 1: Write the failing unit tests** in `ambientSpawn.test.js`:
  `free 0 spawns nothing and logs nothing`;
  `a 3-member group with free 2 places the leader and one more`;
  `members get scaled stats at the anchor's tier` (`spawnMember` receives `opts.zoneTier` = `zoneTier(x, z)`);
  `an elite roll beyond ELITE_ALIVE_CAP spawns as a normal mob` (liveElites 3, so elite null; the cap itself is Unit
  2b's, in `spawnMob`);
  `every placed group is logged with its encounterId and source`;
  `free 3 with picks [lone, pair] places both in one tick` (the refill rate stays 3 per second);
  `a pair drawn with 1 left in the tick is held whole and placed first next tick, not re-rolled`;
  `a seeded encounterRng gives the same id sequence whatever the placement rng does`;
  `ambientAllowed is false during siege waves and true otherwise, by day and by night`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/systems/ambientSpawn.test.js`.
- [ ] **Step 3: Implement** `ambientSpawn.js`, then the three SpawnerSystem edits. The night `hostileBias` stays
  `siegeParams(store.nightCount, zoneTier(x, z)).hostileChance` **in SpawnerSystem** (keep `:45`'s shape; the existing
  `siege-gates` regex must still match), passed in. By day it is 0. Gate ambient spawning on
  `ambientAllowed({ isDay: store.isDay, siegePhase: store.siege?.phase })`.
- [ ] **Step 4: Run, expect PASS**, plus the existing gates: `npx vitest run src/systems tests/gates/siege-gates.test.js tests/gates/spawn-surface-gates.test.js`. Expected: PASS, with `siege-gates` unedited.
- [ ] **Step 5: Write e2e test 1** (`encounters-siege.spec.js`), `day groups near the Hearth draw from the table`:
  `bootDev`, `startPlayActive`, `setTimeOfDay(0.5)` (noon), wait out `_spawnTime` + 5.5 s, then `clearMobs`,
  `setEncounterSeed(SEED)` and `_resetSpawnLog`. Poll `readSpawnLog` for up to 30 s until there are 8 `source:
  'ambient'` events.
  - **Deterministic, not probabilistic.** The spec imports `encounters.js` and the LCG, computes the first 8
    `pickEncounter({ context: 'day', zoneTier: 0 })` results for SEED in node, and asserts the logged `encounterId`
    sequence EQUALS it. SEED is chosen (and asserted in the spec) so that its first 8 picks include at least one group
    of 2 or more. The first draft polled for 3 events and asserted "at least one group": the correct code failed that
    about 1 run in 3 (30% of tier-0 picks are groups), so the identity mutant was itself flaky and no kill meant
    anything.
  - Assert at least one event has `types.length >= 2` (presence; guaranteed by SEED, so a failure is real).
  - Assert no event contains `moss_brute`, every event has `tier === 0`, and all `elites` are 0.
  - Assert every live mob with an `encounterId` has `maxHealth === MOB_TYPES[type].health` (tier 0 is the identity).
  - Sample the live count every 250 ms and assert it never exceeds `siegeParams(0, 0).maxMobs` + the boot overflow.
    The boot ring is pre-existing (Open question 1), so record the observed maximum in the failure message.
- [ ] **Step 6: Run e2e test 1 in CI or on a lightly loaded machine** (not now; the machine is loaded):
  `npx playwright test tests/e2e/encounters-siege.spec.js -g "day groups"`. Expected: PASS. Mutants (mutate-e2e
  batch with an identity mutant):
  - **S1** the ambient path reverted to the single `weightedPick` makes it RED (no `encounterId`). This is the "what if
    the feature were deleted" mutant.
  - **S2** group size forced to 1 makes it RED (no group of 2+, and the type lists differ from the computed picks).
  - `brute_camp` at tier 0 is killed by the unit test (E1), not here: in e2e it would surface in under 10% of events,
    so an e2e S3 survived about 3 runs in 4.
- [ ] **Step 7: Commit.** `git commit -m "feat(spawn): day and night groups come from the encounter table — tier 0 at the same cap and refill rate, a hostile share of 0.61 against today's 0.70, no brute near the Hearth by day, the boot ring typed by the table"`.

### Unit 4: elites you can see (crown, banner, nametag, mob names in two locales)

**Files:**
- Create: `frontend/src/game/eliteLook.js`, `frontend/src/game/eliteLook.test.js`
- Modify: `frontend/src/game/mobFeatures.js:105` (`featureColor('ember')` returns `'#FF7A2A'`); the mob renderer:
  - Without move 11: `frontend/src/render/MobModel.jsx:44-47` (append `eliteFeatures(entity.elite, dims)` to the
    `features` memo, deps + `entity.elite`) and `:344-350` (tone `ember` gets `emissive` `#FF7A2A`,
    `emissiveIntensity` 1.6, set against the bloom threshold the light lane lands; elite boxes `castShadow={false}`).
  - **And the hit-flash traverse, `MobModel.jsx:195-217`**: `rememberAuthoredEmissive(child.material)` beside
    `rememberAuthoredColor`, and the idle branch calls `restoreAuthoredEmissive` instead of writing black and 0. Without
    this the crest's emissive is zeroed every frame and the "reads at night on low tier" claim is false.
  - With move 11: its instanced feature path, with the same emissive rule.
- Modify: `frontend/src/render/characterStyle.js` (pure `rememberAuthoredEmissive`, `restoreAuthoredEmissive`,
  `idleEmissive(material)`)
- Modify: `frontend/src/game/nametagData.js:15-25` (names via `t('mob.<type>')` falling back to `displayName`; elite
  and captain names; ember colour `#FF9A4A` for elites; no jade "bindable" tell where `!isBindable(entity)`)
- Modify: `frontend/src/game/allegiance.js:14` (refuse `entity.elite`; export `isBindable(entity)`);
  `frontend/src/Components.jsx:759` (the snare candidate filter calls `isBindable`; one condition, Edit tool only)
- Modify: `frontend/src/i18n/strings.js` (en and zh-CN keys below)
- Test: `frontend/src/game/eliteLook.test.js`, and the existing `frontend/tests/render/characterStyle.test.js`,
  `frontend/tests/data/nametagData.test.js`, `frontend/src/game/allegiance.test.js` and `frontend/tests/i18n/*.test.js`
  (the first draft named a `src/game/nametagData.test.js` that does not exist)

**Interfaces:**
- Consumes: `entity.elite` from Unit 3; `entity.siegeRole` from Unit 6. The captain's visuals key off
  `elite === 'captain'`.
- Produces: `eliteFeatures(rank, { bodyW, bodyH, bodyD, headW, headH, headD })` returns box specs. `ember` gives 3
  boxes, `captain` gives 5, `null` gives `[]`.

**Strings (en / zh-CN; the zh copy is proposed, and native review outranks it):**

| key | en | zh-CN |
|---|---|---|
| `mob.pig` .. `mob.emberhusk` | each `displayName` verbatim (`mobTypes.js:7-20`) | 野猪 · 牛 · 行尸 · 拾骨者 · 边境蜘蛛 · 定居者 · 窜行虫 · 暮犬 · 苔藓巨兽 · 余烬行尸 |
| `encounter.elite_name` | Ember-touched {name} | 余烬·{name} |
| `siege.captain_name` | Ashen Captain | 灰烬队长 |

- [ ] **Step 1: Write the failing tests:**
  `ember gives three crest boxes, all above the head top` (`pos[1] - box[1]/2 >= bodyH + headH`, checked for two
  different dims sets, so a hardcoded height fails);
  `captain adds a two-box banner behind the body` (`pos[2] < 0`);
  `no rank, no boxes`;
  `featureColor('ember') is the ember hex`;
  `en mob names equal the registry displayName for every type` (so capture nametags cannot drift);
  `an elite nametag reads the prefix in ember; a plain hostile is unchanged`;
  `an authored emissive survives 3 simulated idle frames, a hit flash still overrides it, and it comes back after the
  flash` (`idleEmissive` over a plain object standing in for the material);
  `a material with no authored emissive still idles at black and 0` (today's behaviour, the control);
  `convertMobToAlly refuses an ember elite and a captain, and still binds a plain zombie` (presence twin);
  `an elite at 25% HP has no jade tell; a plain hostile at 25% still does`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/eliteLook.test.js tests/data/nametagData.test.js tests/render/characterStyle.test.js src/game/allegiance.test.js tests/i18n`.
- [ ] **Step 3: Implement.** Add the keys to both locales.
- [ ] **Step 4: Run, expect PASS.** Mutants: **L1** `eliteFeatures('ember')` returns [], so the crest test goes RED.
  **L2** the nametag ignores `elite`, so the prefix test goes RED. **L3** the zh-CN `encounter.elite_name` is deleted,
  so the i18n coverage gate goes RED. **L4** the en `mob.zombie` reads "Zombie", so the displayName test goes RED.
  **L5** the idle branch zeroes emissive again, so the emissive test goes RED. **L6** `convertMobToAlly` drops the
  elite refusal, so the allegiance test goes RED. **L7** the nametag ignores `isBindable`, so the tell test goes RED.
- [ ] **Step 5: See it (probe, local, lightly loaded).** In dev, `spawnMob(x, z, 'zombie', y, { elite: 'ember', zoneTier: 2 })`
  and `{ elite: 'captain' }` 4 m in front of the camera at `setTimeOfDay(0.0)` (midnight), on `setQualityTier('low')`
  and on `'high'`. Screenshot both and **open them**: the crest must read at night on low tier with no rim. Keep these
  as dev-probe evidence. The real-GPU frames are Unit 11's.
- [ ] **Step 6: Commit.** `git commit -m "feat(elites): an ember crest and a captain's banner readable on every tier (the rim is high-only); mob names and elite names in en and zh-CN"`.

### Unit 5: the siege director (pure)

**Files:**
- Create: `frontend/src/game/siegeDirector.js`, `frontend/src/game/siegeDirector.test.js`

**Interfaces:**
- Consumes: `GAME_UNITS_PER_SECOND`, `HALF_CYCLE_UNITS` and `siegeParams` (`dayNight.js`); `eligibleRows`,
  `pickEncounter`, `scaledStats` (Unit 1); `angleDiff` (Unit 2).
- Produces:
  - `WAVE_SEC = [0, 45, 95]`, `WAVE_UNITS` (derived), `HUB_SLOTS = 4`, `OBJECTIVE_RADIUS = 32`, `SECTOR_HALF = PI/6`.
  - `unitsIntoNight(gameTime)` returns `gameTime mod 600` for a night unit, else -1.
  - `waveSizes(nightCount)` returns `[a, b, c]`. `eliteCount(nightCount)`.
  - `planSiege({ nightCount, zoneTier, seed, bearings })` returns
    `{ night, bearings, waves: [{ index, atUnit, bearingIndex, members: [{ type, elite, role: 'wave' | 'captain' }] }] }`.
  - `chooseBearings({ count, seed, landScore })` returns angles.
  - `waveLaunchesBetween(plan, prevUnits, nowUnits)` returns `number[]`.
  - `siegeObjective({ playerX, playerZ, anchors })` returns `{ x, z, kind: 'hearth' | 'build' | 'player' }`.
  - `routsOnRespawn(mobs, px, pz, radius = 16, now, { routMs = 8000, routDist = 30 } = {})` returns
    `[{ id, routUntil, anchorX, anchorZ }]` (non-captain siege mobs only; the anchor is 30 m from the player along the
    player-to-mob direction).
  - `planHoldWaves` moves to `frontend/src/game/holdWaves.js` (Unit 10), out of the main chunk.

- [ ] **Step 1: Write the failing tests:**
  `waves launch at 0, 180 and 380 units into the night`;
  `wave sizes ramp with the night and cap at 10`, as a table for n = 1..12;
  `night 1 is gentle: one bearing, [2, 2, 3], no ember, the captain at x1.6`;
  `exactly one captain, always in wave 3`;
  `every wave's size fits siegeParams(n, z).maxMobs - HUB_SLOTS`, for n in 1..12 and z in 0..4 (65 cases; assert the
  count is 65; a size bound only, the carried-population test is Unit 6's);
  `the captain is the FIRST member of wave 3's list`;
  `two bearings from night 3, never within 90 degrees, and the same per seed`;
  `a sea-facing bearing is never chosen while a land one exists` (`landScore` gives 0 for half the circle);
  `launches fire once each, across a jump over two waves` (prev 10, now 400 gives [1, 2]);
  `a resumed night launches nothing on mount` (prev = now = 250 gives []);
  `the boundary unit launches exactly once` (prev 179, now 180 gives [1]; prev 180, now 181 gives []);
  `the objective is the nearest anchor within 32 m, else the player`;
  `respawn routs only non-captain siege mobs inside 16 m, each with routUntil = now + 8000 and an anchor 30 m from the
  player on the mob's side`;
  `unitsIntoNight is constant while the clock is paused, and -1 by day` (the same gameTime gives the same units; a day
  unit never launches a wave).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/siegeDirector.test.js`.
- [ ] **Step 3: Implement.** Wave members are drawn by repeated `pickEncounter({ context: 'siege' })`, truncating the
  last group to the size. Ember elites go on the first hostile members of waves 2 and 3. The captain replaces one of
  wave 3's members and is placed FIRST in its list, so the drain queue places it first. Seeded rng: an LCG of
  `seed ^ nightCount`, the same family as `frontend/src/game/affixes.js`.
- [ ] **Step 4: Run, expect PASS.** Mutants:
  - **D1** the captain dropped makes the captain test RED.
  - **D2** night 1 uses the general ramp, so the gentle test goes RED.
  - **D3** `>=` becomes `>` in launches, so the boundary test goes RED.
  - **D4** `landScore` ignored makes the sea test RED.
  - **D5** the 10-cap removed makes the cap-fit test RED at night 12.
  - **D6** `routsOnRespawn` includes the captain, so the respawn test goes RED.
  - **D7** the captain appended last, so the captain-first test goes RED.
- [ ] **Step 5: Commit.** `git commit -m "feat(siege): a pure siege director — waves on the game clock, bearings that avoid the sea, a captain in wave three, a gentle first night, every wave inside the cap"`.

### Unit 6: the siege runs, marches and is seen (consumer 2, lived)

**Files:**
- Create: `frontend/src/game/mobObjective.js`; `frontend/tests/gates/mob-march-loop-gates.test.js` (drives the real
  worker; no `readFileSync`)
- Modify: `frontend/src/workers/ai.worker.js`: `:299-316` (call `idleGoal` before `rollWander`); `:128` (a mob with
  `routUntil > now` skips the aggro test and is not aggro); `:272-298` (the A* steering step lifted out of the
  `if (isAggro)` block, keyed on "is moving, has a goal (aggro, or an anchor mode), has a grid");
  `frontend/src/game/mobStateSync.js:28-57` (payload `anchorMode, anchorX, anchorZ, routUntil`, main-owned, NOT in
  `MOB_STATE_FIELDS`); `frontend/src/systems/AIWorkerSystem.jsx:213` (grid when `isAggro` or `anchorMode` is march,
  hunt or rout)
- Modify: `frontend/src/ui/DayNightAudio.jsx:21` (the horn plays on a `lastNightfall` change, not on the `isDay`
  edge; the dawn chime keeps the edge); `frontend/src/world/survivalSystem.js:19-27` (the night toast likewise; the
  dawn branch keeps the edge). Test: `frontend/tests/store/lastNightfall.test.js` gains `a night-save load plays no
  horn and shows no night toast; a genuine crossing does both`, through the real store with `playSiegeHorn` and the
  toast setter spied. Mutant **N2**: the horn back on the `isDay` edge, so the load half goes RED.
- Create: `frontend/src/systems/siegeRuntime.js` (pure); `frontend/src/systems/SiegeDirectorSystem.jsx`; mount it
  next to `<SpawnerSystem />` in `frontend/src/SimplifiedNPCSystem.jsx:120`
- Modify: `frontend/src/store/useGameStore.jsx`:
  - near `:768`: state `siege: null`, `lastNightfall: null`; action `setSiege(next)`, written on change only (no
    `siegeSuppressed`: first-minute holds the clock instead, Risks);
  - `:817-822`: the `enteringNight` branch also writes `lastNightfall: { night: nightCount + 1, gameTime: newTime }`;
  - `loadWorldData` (the `:1077` and `:1139` writes of `nightCount`): writes `lastNightfall: null`.
- Test: `frontend/tests/store/lastNightfall.test.js`, through the real store:
  - `only a genuine crossing writes lastNightfall`;
  - `loadWorldData at night and a direct nightCount write leave it null`.
  Mutant **N1**: `lastNightfall` written on any `isDay` flip, so the load test goes RED.
- Modify: `frontend/src/game/compass.js` (add `siegeMarkers`); `frontend/src/HUD.jsx` compass loop (wedge element
  `data-siege-wedge`, red `#FF3A3A`, label `t('siege.compass')`; on the persistent node pool if Phase 0g has landed);
  a `SiegeBanner` next to `SurvivalWarning` at `HUD.jsx:614`
- Modify: `frontend/src/game/dayNight.js:142-150` (`siegeWarningKey(n)`; `siegeWarning(n)` interpolates
  `STRINGS.en`); `frontend/src/world/survivalSystem.js:27` (`t(key, vars)`)
- Modify: `frontend/src/i18n/strings.js` (siege keys below); `frontend/src/App.jsx` (dev hooks `readSiege` and
  `placeMob(id, x, y, z)`)
- Test: `frontend/src/systems/siegeRuntime.test.js` (the pure step the system calls), `frontend/src/game/compass.test.js`,
  e2e test 2

**Interfaces:**
- Consumes: Units 1-5 and 2b. `store.spawnMob(..., opts)` and `store.spawnBudget` from Units 2b and 3.
- Produces:
  - `idleGoal({ mode, anchorX, anchorZ, x, z })` returns `{ targetX, targetZ, isMoving }` or `null`. `CAMP_LEASH = 4`.
  - `siegeTick(state, input)` returns `{ state, spawns, writes }`, in `frontend/src/systems/siegeRuntime.js`.
    `SiegeDirectorSystem` is a thin caller. This makes the producer testable (rule 4c).
  - `store.siege` is `{ phase: 'idle' | 'waves' | 'holding' | 'broken' | 'ended', night, bearings, objective, wave, total, captainId }`.
  - `siegeMarkers({ siege, playerX, playerZ, heading, fov })` returns `[{ pct, bearingIndex, behind }]`, with `pct`
    clamped to [0, 100] and `behind: true` for a bearing outside the strip (rendered as an edge-pinned wedge with a
    chevron).

**Strings:**

| key | en | zh-CN |
|---|---|---|
| `siege.warning.1` .. `.5` | `Night {n} — <phrase>. Hold until dawn!`, with the five phrases of `dayNight.js:144-148` | 第{n}夜——第一次围攻开始了 / 敌群攻得更猛了 / 围攻越来越激烈 / 凶猛的围攻来了 / 围攻一波接一波，不会停。坚持到天亮！ |
| `siege.horn` | A war horn sounds. They come from the red mark on your compass. | 号角响了。敌人从罗盘上的红色标记方向来。 |
| `siege.wave` | Wave {k} of {total} | 第{k}波，共{total}波 |
| `siege.compass` | SIEGE | 围攻 |

`siege.captain_arrives` moves to Unit 7, which wires the break it promises. **Units 6 and 7 are pushed together**
(Vercel deploys on push), so the live site never shows a captain whose death does nothing.

- [ ] **Step 1: Write the failing march gate** `tests/gates/mob-march-loop-gates.test.js`, following the self-shim
  harness of `tests/gates/mob-charge-loop-gates.test.js:36-60`. The tests:
  - `a non-aggro marcher closes on its anchor over 40 ticks`: start 40 m away, player 200 m away (no aggro), distance
    falls by at least `speed * 0.9 * elapsed`.
  - `the anchor rides the payload every tick` (`buildMobPayload` carries `anchorMode/X/Z`, and `applyMobUpdate` does
    not overwrite them).
  - `aggro still wins` (player inside aggroRange: `targetX` equals `playerX`).
  - `a routed mob inside aggro range moves AWAY` (player 10 m away, `anchorMode: 'rout'`, `routUntil` 2 s ahead: the
    distance to the player grows over 20 ticks, and `isAggro` stays false). This is the respawn rout's only real proof.
  - `the rout ends: aggro returns after routUntil` (same setup, `routUntil` in the past: `isAggro` true on the first
    tick).
  - `a marcher routes around a wall` (WITH a 9x9 grid holding a 2-high wall across the straight line between mob and
    anchor: the mob reaches within 3 m of the anchor in 200 ticks). The charge-loop harness passes no grid
    (`mob-charge-loop-gates.test.js:31`), so this case builds one.
  - `camp turns back past the leash` (start 6 m from the anchor: the next target is closer to the anchor).
  - `no anchor, today's wander` (`anchorMode` undefined: the target equals `rollWander`'s for the same seed).
  The file carries the `Mutation-Proof:` lines.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run tests/gates/mob-march-loop-gates.test.js`. Expected: FAIL, the
  marcher wanders.
- [ ] **Step 3: Implement** `mobObjective.js`, the payload fields, the worker branch and the grid rule.
- [ ] **Step 4: Run, expect PASS**, plus `npx vitest run tests/gates/mob-charge-loop-gates.test.js tests/gates/mob-senses-gates.test.js`.
  Mutants: **W1** the worker skips `idleGoal`, so the closure test goes RED. **W2** the payload drops `anchorX`, so the
  closure and payload tests go RED. **W3** `idleGoal` runs before the aggro check, so the aggro test goes RED.
  **W4** the worker ignores `routUntil`, so the rout-away test goes RED. **W5** A* gated on `isAggro` again, so the
  wall test goes RED. **W-id**, the identity, stays GREEN.
- [ ] **Step 5: Write the failing runtime tests** in `siegeRuntime.test.js`:
  `a new lastNightfall starts the plan and writes siege once`;
  `a nightCount change with no lastNightfall (a load, the perf probe) starts nothing`;
  `the player 300 m from the Hearth: the objective is the player and spawns land only in the given chunks`;
  `a sector with no acceptable point widens once to PI/3, logs fallback and never loops`;
  `a captain removed without a kill (culled) lets the night end naturally, never stuck in 'waves'`;
  `wave members are queued and drained at most 3 per second of world time`, through the shared budget;
  `nothing spawns under capture` (input `capture: true`);
  `a carried population does not starve the captain`: for every A in [cap - 8, cap] live at the horn, with no kills,
  the horn clearance plus the captain-first queue place the captain within 2 s of world time after wave 3 launches
  (this replaces trusting the per-wave size bound);
  `horn clearance retires only non-static, non-aggro, non-siege mobs beyond 30 m, farthest first, and emits no kill`;
  `a marcher that moved under 1.5 m in 6 s sidesteps (anchor offset 8 m perpendicular), and after two failed
  sidesteps becomes a hunter anchored on the player`;
  `a respawn during waves sets routUntil and a rout anchor on nearby non-captains, then they march again` (the field
  half; the movement half is the worker gate);
  `natural dawn ends the siege and routs the non-aggro siege mobs outward`;
  `writes happen only on phase or wave change` (100 ticks with no change give 0 writes).
  Then `compass.test.js`: `one wedge per bearing at the bearing's pct; none when idle`; `a bearing behind the camera
  is pinned to the nearer edge with behind: true, never dropped`.
- [ ] **Step 6: Run, expect FAIL**, then implement `siegeRuntime.js`, `SiegeDirectorSystem.jsx` (15 Hz on
  `worldDelta` like `frontend/src/world/ElementZoneSystem.jsx:33-43`, `getState()` reads, `logSpawn` with
  `source: 'siege'`, `fallback` set when `sectorAnchor` returned null and a widened half-angle of PI/3 was used), the
  store field, the compass wedge, the banner and the warning keys. Run again and expect PASS. Also run
  `npx vitest run tests/gates/siege-warning-gates.test.js tests/gates/siege-gates.test.js tests/i18n`; expect PASS
  with both gates unedited. Mutants: **R1** drain uncapped makes the drain test RED. **R2** the capture guard removed
  makes the capture test RED. **R3** writes every tick makes the writes test RED. **R4** stuck detection off makes the
  sidestep test RED. **R5** no horn clearance, so the carried-population test goes RED. **R6** behind-bearings
  filtered (today's `inView` rule), so the compass behind test goes RED.
- [ ] **Step 7: Write e2e test 2**, `the siege comes from its bearing and marches on the Hearth`:
  - Setup: boot, `startPlayActive` (the player starts on the Hearth), wait out spawn protection, `clearMobs`,
    `_resetSpawnLog`.
  - Make it night 3, so there are enough events to judge a bearing: a direct `nightCount = 2` write (which starts
    nothing, by design), then force a GENUINE nightfall through the single writer: `setGameTime(596)` then
    `setGameTime(604)`, which crosses and bumps `nightCount` to 3. Then advance through the single writer past units
    180 and 380, so all three waves (3 + 4 + 6 = 13 members, two bearings) launch.
  - Wait up to 15 s for `readSiege().phase === 'waves'` and at least 6 siege spawn events.
  - Assert:
    - The DOM compass has 1 or more `[data-siege-wedge]`, and each wedge's bounding box lies inside the compass
      track's box (a wedge clipped by `overflow-hidden` does not count). Before the horn it had 0, and the presence
      follows the absence in the same run.
    - Every `fallback: false` siege event satisfies `abs(angleDiff(atan2(x - ox, -(z - oz)), bearing)) <= PI/6` about
      the objective, and at least 4 such events exist. With one event (the first draft's night 1), a bypassed
      sector filter still landed inside a 60-degree sector about 1 run in 6; with 4 it is about 1 in 1,300.
    - The fallback ratio is <= 0.5.
    - Let the clock run 8 s: at least 60% of the non-aggro `anchorMode: 'march'` mobs are 3 m or more closer to the
      objective, and their count is >= 1.
  - Print the measured ratios on failure.
- [ ] **Step 8: Run e2e test 2** (CI, or a lightly loaded machine). Expected: PASS. Mutants (mutate-e2e batch +
  identity): **X1** `SiegeDirectorSystem` unmounted makes it RED (no wave). **X2** the sector filter bypassed (any band
  point) makes the bearing assertion RED. **X3** the worker march branch removed makes the closure assertion RED.
  **X4** the wedge render removed makes the DOM assertion RED. **X5** wedges rendered at their raw pct (unclamped)
  makes the bounding-box assertion RED whenever a bearing is behind; the spec turns the camera to face away from
  bearing 0 before the assertion so that case is always exercised.
- [ ] **Step 8b: Write e2e test 2b**, `a populated night still gets its captain`: the same genuine night-1 crossing
  but **without** `clearMobs` or `clearHostiles` (the boot ring and the day fill left as they are, no kills). Advance
  through the single writer past unit 380 and assert a `siegeRole === 'captain'` mob exists within 2 s of real time
  after wave 3 launches. Log the live count at the horn in the failure message. Mutant: horn clearance removed and the
  captain queued last, so RED whenever the day population fills the cap (the reviewer's repro: idle 150 s at the
  Hearth, then count live mobs before the clock crosses 600).
- [ ] **Step 9: Measure the AI cost under a siege** (local, real hardware, `uptime` first). Add perf scenario `F` to
  `frontend/src/devtest/perfScenarios.js`: night 6, with a `siegeWave: 3` field. `PerfProbeRunner.jsx` applies it
  through a GENUINE crossing, `setGameTime` to just before the boundary, then past it, then to wave 3's unit, because
  its direct `nightCount` write at `:53` no longer starts a siege. Run the perf-siege spec with `?perf=F`. Record the `ai` block next to Unit 0's baseline below. **If `buildMs` p95 exceeds
  max(1.25 x baseline, 4 ms), schedule Unit 12.**
- [ ] **Step 10: Commit** (two commits: the worker seam, then the system). The gate commit carries
  `Mutation-Proof: W1 worker skips idleGoal -> closure RED; W2 payload drops anchorX -> closure+payload RED; W3 idleGoal before aggro -> aggro RED; W4 routUntil ignored -> rout-away RED; W5 A* gated on isAggro -> wall RED`.
  `git commit -m "feat(siege): a siege that marches — waves from a seen bearing, a red compass wedge, an AI anchor the worker steers by, soft-death routs on respawn"`.

### Unit 7: the captain and the early dawn

**Files:**
- Modify: `frontend/src/game/mobKillBus.js:25-33` (`emitMobKill(mobType, position, source = 'player', entity = null)`);
  `frontend/src/systems/CombatSystem.jsx:158` (pass `entity`)
- Modify: `frontend/src/game/dayNight.js` (`DAWN_RUSH_UNITS_PER_SECOND = 60`, `clockStepUnits({ dawnRush })`);
  `frontend/src/game/useDayNightClock.js:28`; `frontend/src/store/useGameStore.jsx:804-825` (state `dawnRush: false`;
  `startDawnRush()`; `setGameTime` clears `dawnRush` on the crossing into day)
- Modify: `frontend/src/systems/siegeRuntime.js` and `SiegeDirectorSystem.jsx` (subscribe; the pure
  `onSiegeKill(siege, entity) -> { writes, rush }` matches `entity.id === siege.captainId`, and the system applies its
  writes and `startDawnRush()` synchronously inside the bus callback, not on the next `worldDelta` tick;
  `phase: 'broken'`; `siege.captain_arrives` at wave 3; `siege.broken` at the kill)
- Modify: `frontend/src/i18n/strings.js` (`siege.captain_arrives`: "The Ashen Captain leads this wave. Defeat it to
  break the siege!" / 灰烬队长带队进攻。打倒它就能解除围攻！, moved here from Unit 6; `siege.broken`: "The captain has
  fallen. The siege breaks, and dawn comes early!" / 队长倒下了，围攻解除，天提前亮了！)
- Ships in ONE push with Unit 6 (Unit 6's note).
- Test: `frontend/src/game/mobKillBus.test.js`, `frontend/src/game/dayNight.test.js`, `frontend/tests/store/dawnRush.test.js`,
  `siegeRuntime.test.js`, e2e test 3

**Interfaces:**
- Consumes: `store.siege.captainId` and `entity.id` (Unit 6); `entity.siegeRole` only for display.
- Produces: `startDawnRush()`; `clockStepUnits({ dawnRush }) -> 60 | 4`; the kill bus's 4th argument;
  `onSiegeKill(siege, entity)`.

- [ ] **Step 1: Write the failing tests:**
  - `emitMobKill passes the entity as the 4th argument, and a 3-argument subscriber still runs`.
  - `clockStepUnits is 60 rushing, 4 otherwise`.
  - In `tests/store/dawnRush.test.js`, through the real store:
    - `a rush clears on the crossing into day, nightCount unchanged` (gameTime 900, `startDawnRush`, then
      `setGameTime(t => t + 60)` x5: `isDay` true, `dawnRush` false, `nightCount` the same).
    - `the next night does not rush`.
  - In `siegeRuntime.test.js`:
    - `the captain's death breaks the siege and asks for the rush`.
    - `a wave mob's death does not` (the control).
    - `a hazard or ally kill of the captain still breaks it`.
    - `the break matches captainId, not siegeRole` (an entity with `siegeRole: 'captain'` but another id does not
      break it).
    - `the break is applied in the callback, with zero world time elapsed` (no `siegeTick` call between the kill and
      the assertion).
    - `a wave due on the rush's crossing tick does not launch`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/mobKillBus.test.js src/game/dayNight.test.js tests/store/dawnRush.test.js src/systems/siegeRuntime.test.js`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Mutants: **C1** the subscription is deleted, so the break test goes RED. **C2**
  `dawnRush` is never cleared, so the next-night test goes RED. **C3** any siege kill breaks it, so the control goes
  RED. **C4** the 4th argument is dropped at `CombatSystem.jsx:158`, which is green here and RED in e2e test 3: the
  producer half (rule 4c) is proven only in the running game. **C5** the match on `siegeRole`, so the captainId test
  goes RED. **C6** the break deferred to the next tick, so the zero-time test goes RED.
- [ ] **Step 5: Write e2e test 3**, `killing the captain with a real click breaks the siege and brings dawn early`:
  - Set up a genuine nightfall as in test 2, then advance through the single writer to `nightStart + 384` units
    (crossing 180 and 380, so waves 2 and 3 launch).
  - Wait for a `readMobs` entry with `siegeRole === 'captain'`.
  - Then, as `tests/e2e/heavy-melee.spec.js:42-70` does: pin `Math.random` high, `placeMob` the captain 2.5 m along
    the camera's facing at its floor, set its health to 1 (setup), and `triggerHitstop(1500)`: a SHORT freeze that
    covers only the press and release. The first draft copied heavy-melee's 30 s freeze, which holds `worldDelta` at
    0, so a director that applied the break on its next tick could not pass, and the control could not fail.
  - Real `page.mouse.down()` and `page.mouse.up()`, issued immediately after the freeze starts.
  - Assert, within 12 s of real time (the freeze ends after 1.5 s; the 1 Hz clock is not hitstop-gated,
    `useDayNightClock.js:23-28`):
    - the captain is gone, and `readSiege().phase === 'broken'`;
    - `isDay === true` and `lastRewardedNight === nightCount`;
    - the banner shows `t('siege.broken')`'s text in the current locale.
  - **The control, in the same spec:** a fresh night, a wave mob killed the same way (same 1.5 s freeze), and with
    the world UNFROZEN for the following 6 s, `isDay` is still false and the phase is not `broken`. Assert the
    director ticked during those 6 s (its tick counter, read through `readSiege`, advanced), so the control can fail.
- [ ] **Step 6: Run e2e test 3** (CI or a lightly loaded machine). Expected: PASS. Mutants: **C1** (the subscription
  deleted) makes it RED, which is the "end hook removed" mutant the roadmap names. **C4** (the 4th argument dropped)
  makes it RED.
- [ ] **Step 7: Commit.** `git commit -m "feat(siege): the Ashen Captain — killing him breaks the siege and the sun rushes up; the dawn reward pays through the one natural dawn path"`.

### Unit 8: the build anchor (walls matter)

**Files:**
- Create: `frontend/src/game/buildMemory.js`, `frontend/src/game/buildMemory.test.js`
- Modify: `frontend/src/systems/siegeRuntime.js` (anchors = Hearth (0, 0) `'hearth'` plus `buildAnchor(getState().worldBlocks, …)` `'build'`, at the horn and each wave)
- Modify: `frontend/src/world/Terrain.jsx:1013` (one line, Edit tool: `placeBlockKey(newBlocks, key, numericType)`
  from `buildMemory.js`, which deletes the key and then sets it, so a re-placed cell moves to the end of the Map)
- Test: e2e test 4; the existing build-placement tests stay green (only the Map's order changes)

**Interfaces:**
- Produces: `buildAnchor(worldBlocks, { nearX, nearZ, radius = 32, recent = 48, cluster = 12, minBlocks = 6 })` returns
  `{ x, z, count }` or `null`.

- [ ] **Step 1: Write the failing tests:**
  `6 recent blocks in one place make an anchor at their centroid`;
  `5 do not`;
  `mined entries (0) are ignored`;
  `an older cluster far from the newest one is ignored`;
  `an anchor beyond radius from the player is null`;
  `only the last 48 non-zero entries count` (fill with 200 and assert the centroid of the last cluster);
  `a wall built on mined ground is the newest cluster` (build 6 far away, then mine 6 cells near the player and place
  6 blocks on those same keys through the delete-then-set path: the anchor is at the second set's centroid). Under
  plain `Map.set` this returns the old cluster; the test drives the same helper `Terrain.jsx` calls, so extract the
  two-line write into `placeBlockKey(map, key, type)` in `buildMemory.js` and import it there.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/game/buildMemory.test.js`.
- [ ] **Step 3: Implement**: one pass over `worldBlocks.entries()` keeping a 48-slot ring of non-zero keys, then
  cluster by distance to the newest entry.
- [ ] **Step 4: Run, expect PASS.** Mutants: **B1** zeros counted makes the mined test RED. **B2** the cluster built on
  the OLDEST entry makes the recency test RED. **B3** `minBlocks` = 1 makes the 5-block test RED. **B5**
  `placeBlockKey` without the delete makes the mined-ground test RED.
- [ ] **Step 5: Write e2e test 4**, `a wall you just built becomes the siege's objective`:
  - Real `W` held for 2 s (walk off the Hearth). Read `playerPosition` and assert it is more than 16 m from the
    origin. If it is not, the failure message names the walk.
  - Place 6 blocks through `GameMethods.terrainVerbs.place` with synthetic hits on the ground ahead, the closure the
    mouse router calls, exactly as `tests/e2e/build-placement.spec.js:9-30` does. That spec records why it does not
    raycast: three runs failed inside `castBuildRay`, each one the test being wrong.
  - **What the substitution changes:** it skips the build raycast and the mouse router. Their reachability is that
    spec's claim, not this one's. This test proves the placed blocks reach the siege objective.
  - Genuine nightfall: `readSiege().objective.kind === 'build'`, within 3 m of the centroid of the placed blocks read
    back from `worldBlocks`.
- [ ] **Step 6: Run e2e test 4.** Expected: PASS. Mutant: **B4** the `buildAnchor` call is removed from `siegeRuntime`,
  so the objective kind is `'player'` or `'hearth'` and the test goes RED.
- [ ] **Step 7: Commit.** `git commit -m "feat(siege): the siege marches on the walls you just built when you stand by them"`.

### Unit 9: dungeon guardians (consumer 3, lived by probe)

Read `.claude/rules/voxel-mesher.md` §3c before touching `terrain.worker.js`.

**Files:**
- Modify: `frontend/src/world/dungeonStamp.js` (export `isDungeonChunk`, `DUNGEON_CENTRE_OFFSET = 8`,
  `DUNGEON_FLOOR_Y = 13`, `dungeonSiteNear(x, z)`); `frontend/src/world/terrain.worker.js:191-192`, `:242-245`,
  `:262` (import them; delete the private copies; `dCenterY` = `DUNGEON_FLOOR_Y - 1`)
- Create: `frontend/src/systems/dungeonGuardians.js` (pure: `guardiansDue({ playerX, playerY, playerZ, site, cleared })`,
  `guardianSpots(site)`), `frontend/src/systems/DungeonGuardianSystem.jsx` (1 Hz, capture-guarded), mounted in
  `frontend/src/SimplifiedNPCSystem.jsx:120`
- Test: `frontend/src/world/dungeonStamp.test.js` (extend), `frontend/src/systems/dungeonGuardians.test.js`
- Create: `frontend/scripts/visual/dungeon-guardian-probe.mjs` (manual); register its port in `frontend/scripts/visual/_serve.mjs`

**Interfaces:**
- Consumes: `pickEncounter({ context: 'dungeon' })`, `placeGroup`, the shared spawn budget (`store.spawnBudget`,
  Unit 2b: `fitToCap(maxMobs - active)` and the 3-per-second bucket; guardians that do not fit are queued per site and
  placed on later seconds), `store.spawnMob(..., y, { source: 'dungeon', encounterId, elite, anchorMode: 'camp',
  anchorX, anchorZ, zoneTier })` (the warden's forced ember is downgraded past the elite cap, like any other), and
  `logSpawn({ source: 'dungeon', ... })`.
- Produces: `dungeonSiteNear(x, z)` returns `{ x, z, cx, cz }` or `null`.

- [ ] **Step 1: Write the failing tests:**
  `isDungeonChunk matches the original formula on a 128x128 chunk grid` (the test carries the pre-extraction formula
  as its oracle; assert equality everywhere and a match count > 0);
  `dungeonSiteNear finds the site whose chunk is within 1`;
  `guardians are due within 20 m and below y 26, once per site`;
  `guardian spots sit on the floor clear of the altar and the pillars` (`|dx|` or `|dz|` >= 2, `|dx|` and `|dz|` <= 4);
  `guardians that do not fit the budget are queued, not dropped and not forced` (budget of 1 free slot, a 3-member
  group: 1 placed now, 2 on later seconds, never above the cap).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/world/dungeonStamp.test.js src/systems/dungeonGuardians.test.js`.
- [ ] **Step 3: Implement**, then the worker import. AST-safe edits only (Edit tool).
- [ ] **Step 3b: Re-point the existing worker assertion.** `dungeonStamp.test.js:99` asserts the worker still declares
  `const DUNGEON_CENTRE_OFFSET = 8;`, which this unit deletes, so it goes RED on a correct change. Rewrite it to
  assert the worker IMPORTS `DUNGEON_CENTRE_OFFSET` from `./dungeonStamp.js` (anchored to the import statement, so a
  comment cannot satisfy it), and keep `:100`'s raw-literal check. Mutant **G-d4**: a local re-declaration of the
  constant in the worker, so the re-pointed assertion goes RED. The commit carries a `Mutation-Proof:` line for this
  rewrite, because it rewrites an existing assertion.
- [ ] **Step 4: Run, expect PASS**, plus the terrain gates that read the worker:
  `npx vitest run tests/gates/ocean-coastline-gates.test.js tests/gates/biome-flora-gates.test.js tests/gates/m1-bugfix-gates.test.js`.
  Mutants: **G-d1** the hash constant 78.233 becomes 78.2 in `dungeonStamp.js`, so the oracle test goes RED. **G-d2**
  the y gate is dropped, so the due test goes RED. **G-d3** the spots include the altar, so the spot test goes RED.
  **G-d5** the guardians bypass the budget, so the queue test goes RED.
- [ ] **Step 5: Write and run the probe** (local, lightly loaded; `_serve.mjs` lifecycle, sweep after):
  - Boot dev and find the nearest site to the origin via `dungeonSiteNear` over a spiral.
  - Teleport into the room through a dev hook: `settlePlayerToGround` is not usable underground, so add `placePlayer`
    if none exists.
  - Wait for the chunk, then assert:
    - the block at the altar centre is sand (type 4). This proves the worker stamps where the shared function says,
      i.e. the wiring.
    - `readSpawnLog` holds 1 or more `source: 'dungeon'` events, and every guardian is inside the room at y 13-14.
    - leaving and returning does not spawn twice.
  - Screenshot, open it.
- [ ] **Step 6: Commit.** `git commit -m "feat(dungeons): the cobblestone rooms get guardians — the dungeon hash shared by worker and main thread, one spawn per room per session"`.

### Unit 10: shrine waves (consumer 4's hand-off)

**Files:**
- Create: `frontend/src/game/holdWaves.js` (`planHoldWaves({ zoneTier, holdSec, seed })` built on Unit 5's wave
  assembly, and `shrineWaves(tier) -> [string[], string[]]`, relight's exact signature, each wave at most 4 long) and
  `frontend/src/game/holdWaves.test.js`. Nothing in the main chunk imports it; relight's lazy `shrineEvent.js` does.
- Modify: `docs/superpowers/plans/2026-10-27-crafty-relight-frontier.md` is **not** edited from here. Hand the
  interface to that plan's author through `docs/superpowers/KEVIN-REVIEW-BATCH.md` or the lane's message channel,
  including the one spawn-refusal seam (Unit 2b: lit-shrine suppression as a `spawnMob` rule keyed on source, not a
  `blocked(x, z)` on `runSpawnPlacement`), and relight's spawn keys as members of the one `opts` schema.

- [ ] **Step 1: Write the failing tests**: `the shrine context draws from the same ENCOUNTERS table` (every
  `planHoldWaves` member's encounter id is in `ENCOUNTERS`, and no row outside `shrine` is used, over 500 seeds);
  `hold waves fit the cap`; `shrineWaves(tier) keeps relight's signature` (two arrays of type strings, each length
  1..4, every string a `MOB_TYPES` key, for tiers 0..4).
- [ ] **Step 2 to Step 4:** fail, implement, pass. Mutants: **H1** hold waves draw `siege` rows, so the test goes RED.
  **H2** `shrineWaves` returns member objects instead of type strings, so the signature test goes RED. Then build and
  confirm `holdWaves` is absent from the `index` chunk. If knip reports the exports unused before relight lands, this
  unit merges with relight's consuming unit instead of shipping alone.
- [ ] **Step 5: Commit.** `git commit -m "feat(encounters): hold-the-light waves from the shared table, ready for Relight the Frontier"`.

### Unit 11: the lookbook siege stage and the real-GPU frames (acceptance for everything visible)

**Files:**
- Modify: `frontend/src/render/lookbookSeam.js` (on main once `feat/instruments` lands). Add
  `siege({ night, wave })`, which drives the clock through `setGameTime` (a genuine crossing) and advances to the wave.
  Its `info()` gains `siege` and `aiCost`, a PRODUCTION-reachable read path (refute F7).
- Modify: `frontend/scripts/visual/_lookbook.mjs` (a `siege-hearth` place and shot at cycle 0.75, night 6, wave 3)
- Test: `frontend/src/render/lookbookSeam.test.js` (`siege` is inert without `?lookbook=1`; it is a genuine crossing)

- [ ] **Step 1: Write the failing test** for `siege` (inert without the param; `nightCount` rises by exactly 1).
- [ ] **Step 2 to Step 4:** fail, implement, pass. Mutant: **K1** `siege` writes `nightCount` directly instead of
  crossing, so the crossing test goes RED.
- [ ] **Step 5: Shoot** (local, lightly loaded): `npm run build && node scripts/visual/lookbook.mjs --targets chromium-1280x800,webkit-1180x820,webkit-820x1180`.
  It refuses SwiftShader (exit 3) unless told otherwise. **Open every siege frame by eye** and check:
  - the crest and the banner read at night on WebKit (the iPad's low tier);
  - the wedge is legible at 820 wide and does not overprint HOME (the known overprint, umbrella plan line 58);
  - the banner toast does not cover the touch controls;
  - motion is on, with mobs mid-march.
  Keep the frames in `docs/superpowers/masterpiece-2026-10/evidence/encounters-*.jpg`.
- [ ] **Step 6: Commit** the seam (src) and, **separately**, the evidence images. Neither is a baseline. A capture
  re-shoot is not expected (capture mode suppresses every spawner); if one turns out to be needed, that is a defect to
  find, not a re-baseline.

### Unit 12 (conditional): stagger the grid tick

Build this only if Unit 6, Step 9 trips its threshold.
- [ ] A failing test in `mob-march-loop-gates`: `with stagger on, a mob gets a grid on alternate ticks and still
  closes`. Implement id-parity grid rebuilds in `AIWorkerSystem.jsx:213`. Re-measure scenario F and record the spike
  frame before and after. Mutant: parity ignored, so the alternate-tick test goes RED.

### Measured (filled in by Units 0 and 6)

| scenario | machine, load | buildMs p50/p95/max | applyMs p95 | workerMs p95 | grids p95 | mobs p95 |
|---|---|---|---|---|---|---|
| B (today's night 6) | — | — | — | — | — | — |
| F (siege, wave 3) | — | — | — | — | — | — |

---

## Acceptance

1. **Lived, in the running game.** `frontend/tests/e2e/encounters-siege.spec.js` is green in CI, with five tests: day
   groups (U3, seeded and exact), bearing + march + wedge (U6), a populated night still gets its captain (U6, 2b), the
   captain's real-click break with its control (U7), and the built-wall objective (U8). For each, a mutate-e2e batch with an identity mutant shows the delete-the-feature mutant RED: S1, X1,
   C1, B4. The dungeon probe's run log and frames are attached (U9). **What would still pass if the feature were
   deleted:** nothing in these five tests. Each asserts a spawn-log field or a world change that only the feature
   produces.
2. **Heat.** The Measured table is filled from real hardware, scenario F is compared with B, and Unit 12 is built if
   its threshold tripped. The GPU draw delta stays inside the stated +28 worst case. Read draw calls from the
   Diagnostics readout (Phase 0d) on high and low tier at wave 3 of a night that began with 3 ambient ember elites
   alive (so the cap's downgrade of the siege's embers is exercised, not assumed), and record whether N8AO on high
   added a pass.
3. **Looks.** Real-GPU, motion-on lookbook frames (Chromium ANGLE-Metal; WebKit 1180x820 and 820x1180) of the siege
   stage, opened by eye, with the checks in Unit 11 Step 5 written down next to the frames.
4. **Gates.** All 17 pipeline gates are green at push. `bundle-budget` `index` stays under 760,000 B, and this
   milestone's measured delta is 14,000 B or less. `siege-gates` and `siege-warning-gates` pass unedited. The capture
   frames are unchanged.
5. **i18n.** Every string in the three tables above exists in `en` and `zh-CN`, and `tests/i18n/*.test.js` is green.
   The zh-CN copy is flagged for Kevin's native review.
6. **Touch/iPad.** No new verb: the siege is played with the existing touch verbs (fighting; move 3's press-and-hold
   heavy and roar). The wedge renders on the touch layout (`HUD.jsx:534` renders the compass on both). Waves from
   behind rely on move 5's off-screen windup chevrons, a dependency stated in Risks. Unit 11's WebKit frames are the
   check.
7. **Review.** A fresh headless `/code-review xhigh` per change range. One adversarial reviewer at xhigh
   (`adversarial-reviewer-kz`, `claude-opus-5-5`) on the two runtime seams: the worker payload and march branch
   (U6), and the clock and kill bus (U7).

## Review Focus

Each line names an input the spec is silent on, the behaviour a player would expect, and the test that pins it in its
owning unit.

1. **Night falls while the player is far from home.** The objective becomes the player, and waves still spawn in
   loaded chunks on the low tier's +/-2 chunk box and inside the 100 m cull. Pinned by: U2 `sectorAnchor keeps the
   visible-safe band from the PLAYER`; U5 `the objective is the nearest anchor within 32 m, else the player`; U6
   Step 5 `the player 300 m from the Hearth ...`.
2. **A bearing that faces the sea or a cliff.** Waves come from land, or from a widened sector, logged. Pinned by:
   U5 `a sea-facing bearing is never chosen ...`; U6 Step 5 `a sector with no acceptable point widens once ...`; U6
   e2e fallback ratio <= 0.5.
3. **Reload, pause or death mid-siege.** A pause freezes the schedule; a reload ends that night's siege with no burst;
   a death never spawn-camps. Pinned by: U5 `unitsIntoNight is constant while the clock is paused ...` and
   `a resumed night launches nothing on mount`; U6 `a nightCount change with no lastNightfall ... starts nothing`,
   `tests/store/lastNightfall.test.js` (including the no-horn-on-load case) and, for the death case, the worker-driven
   `a routed mob inside aggro range moves AWAY` in `mob-march-loop-gates` (the runtime test only sees a field set).
4. **The captain dies to something other than a sword, or is never killed.** Any kill breaks the siege; a culled
   captain lets the night end naturally. Pinned by: U7 `a hazard or ally kill of the captain still breaks it`; U6
   Step 5 `a captain removed without a kill (culled) ...`.
5. **A dawn rush and a wave launch on the same tick.** No wave launches by day. Pinned by: U5 `... and -1 by day`;
   U7 `a wave due on the rush's crossing tick does not launch`.

## Risks

- **Difficulty for an 8-year-old (threat P5).** Groups, waves and a combat stance together.
  - Mitigations: tier 0 keeps today's cap and refill rate at a calmer hostile share (0.61 against 0.70) with no
    brutes or elites by day (U1 tests); night 1 is gentle; respawn routs that override aggro, plus 5 s of
    protection; the captain's early win; the captain and elites cannot be soulbound.
  - All numbers are Kevin-tunable and batched to KEVIN-REVIEW-BATCH.
  - The first-minute lane holds the clock through the prologue (`clockHeld`, its D6), so the prologue is never a
    siege night. This plan no longer offers `siegeSuppressed`: nothing would write it.
- **Shared files with earlier lanes.**
  - `ai.worker.js` and `mobArchetypes.js` (move 5), `MobModel.jsx` (move 11) and `HUD.jsx`'s compass (Phase 0g node
    pool) are edited by lanes that land first.
  - **`SpawnerSystem.jsx` and `spawnPlacement.js`** are edited by the first-minute lane (Phase 2: `spawnMob`'s
    signature, the prologue pick) and the lantern (move 12: the light refusal), both before this move, and relight
    (move 14) proposes a third parameter after it. Unit 2b is the reconciliation; build it against what actually
    landed.
  - `Components.jsx:759` (the snare filter, one condition; the file is the Player controller, whose per-frame order is
    load-bearing, so a one-line Edit only) and `Terrain.jsx:1013` (one line).
  - Build each unit on current main and re-read every cited line first: the line numbers here are as of 2026-10-27.
- **Pathing.** Marchers now run the 9x9 A* (U6), which routes around a boulder or trunk but not around a wall longer
  than about 4 m. Past that, stuck detection sidesteps them twice and then switches them to hunting the player (U6).
  A siege that reaches nothing is a felt defect, so the march gate asserts closure around a wall and the e2e asserts
  closure in the world.
- **CPU heat.** More mobs carry grids during a wave's approach. The meter (U0) and the measured gate in U6 decide
  whether Unit 12 is built. The worst case is today's.
- **The dawn rush looks wrong** if the light and colour script interpolates badly under 60 units/s on a 1 Hz clock,
  as 4 visible jumps. Judge it on the lookbook frames (U11). The fallback is Open question 2.
- **The hub NPCs eat 4 cap slots.** Wave fit is computed against cap - 4 (U5).
- **e2e time.** Five more tests, about 3-5 min on CI's serialized, sharded run. They are certified by
  CI's `ci ok` on the exact sha (push to a `land/` branch), since W2-C deleted e2e-freshness.
- **Bytes.** About 13.6 KB estimated against the 14 KB ceiling (the review amendments add about 1.0 KB for Unit 2b's
  contract and budget plus about 0.4 KB for the rout, sidestep, clearance and emissive rules, and move about 0.4 KB of
  hold waves out to a lazy chunk), with about 63 KB of shared headroom. That is close to the ceiling: measure per
  unit; dungeon guardians go lazy first.

## Out of scope

- **The ember cache.** Death stays soft (DECISIONS.md; refute F11).
- **The horizon glow toward a siege bearing.** It needs move 4's night palette. A follow-up once that lands.
- **The "burning zone on elite death."** Element zones damage mobs, not the player (`elementZones.js:100`).
- **Camp stamps** (a campfire structure in terrain). Camps here are a leash only.
- **The lantern's "no hostile spawn at light >= 8"** (move 12, which lands first). Unit 2b only re-keys it on
  `opts.source`.
- **The hold-the-light event itself** (move 14). Only its waves are here.
- **Dungeon entrances or compass markers.** Merging mob draws (move 11). Raising any cap.
- **Localising the existing compass labels** (HOME, SHRINE, BLIGHT HEART at `HUD.jsx:354-414`) and the loot toast
  (`QuestSystem.jsx:407-410`). This is pre-existing English-only debt; it is listed, not fixed.

## Open questions

1. **The boot ring** spawns 20 at 30-50 m (`SpawnerSystem.jsx:97-104`), plus 4 hub NPCs: 24 against a day cap of 16.
   This plan types it through the table and keeps its count, so no e2e population moves. Should it obey the cap?
   Default: keep it as is. Batched to Kevin. **The siege no longer depends on the answer**: the horn clearance and the
   captain-first queue (Move C) make room whatever the boot ring left, and e2e test 2b proves it on an uncleared
   night.
2. **Ending the night early.** Time-lapse the clock (default: one natural dawn path, the reward paid there), or keep
   the night sky and pay the reward at the kill? It depends on how the light lane's script looks at 60 units/s.
3. **Tuning.** Wave sizes, the tier multipliers, elite chance and multipliers, the 32 m objective radius, and the 0.15
   elite roll. All are Kevin-tunable.
4. **The first night of a fresh profile.** Answered by the first-minute plan (D6): the clock holds through the
   prologue, so night 1 comes a full day after it and is this plan's gentle night 1. No `siegeSuppressed` flag.
5. **zh-CN copy.** Native review of the strings above (the mob names especially), on the in-game UI register for a
   young player.
6. **Kevin's iPad.** Is the wedge legible to him at 820 wide on the real device? WebKit on macOS is not iPadOS
   (lookbook blind spot).

## Review amendments (2026-10-27)

An adversarial review returned 20 findings: 4 HIGH, 10 MED and 6 LOW. Its verdict text says 5 LOW because it leaves
out the citation-drift row. Each was
re-checked against the code on 2026-10-27 before the plan changed, because a review verdict is a hypothesis. **20
applied, 0 rejected.** Two were PLAUSIBLE rather than CONFIRMED (F4, F12). For both, the mechanism checked out in code
and only a live measurement is missing, so they are applied, and each fix carries the test that settles it. One extra
defect found while amending is listed at the end.

| # | Sev | Finding | Re-check (what was read) | Disposition |
|---|---|---|---|---|
| F1 | HIGH | The respawn rout cannot work: "aggro still wins", and every mob within 16 m is inside its aggro range | `ai.worker.js:128-129` (aggro test before `:137`'s branch), `mobSenses.js:51`, `mobArchetypes.js:40,55,57` (20 / 16 / 28 m), `useGameStore.jsx:1002-1011` (respawn does not move the player) | **Applied.** A main-owned `routUntil` overrides aggro and is checked before the aggro test (Move C "The worker" and "Soft death"; Unit 6 Files). Worker-driven gate `a routed mob inside aggro range moves AWAY`, plus `the rout ends`, with mutant W4. Review Focus 3 now pins the death case on the worker gate |
| F2 | HIGH | The crest's emissive is zeroed every frame by MobModel's hit-flash traverse | `MobModel.jsx:195-217` (idle branch writes black and 0), `characterStyle.js` `flashableMaterial` (toon passes), `MobToonMaterial.jsx:10` (extends `MeshToonMaterial`), `MobModel.jsx:348` | **Applied.** `rememberAuthoredEmissive` / `restoreAuthoredEmissive` and a pure `idleEmissive` in `characterStyle.js`; the traverse restores instead of zeroing (Move E; Unit 4 Files). Tests: 3 idle frames keep it, a flash overrides it, a plain material still idles at black (the control). Mutant L5. The Unit 4 Step 5 night low-tier screenshot stays as the lived proof |
| F3 | HIGH | Unit 3 types every natural spawn, so first-minute's prologue filter and the lantern's `!forceType` rule never fire; three incompatible `spawnMob` 5th parameters | first-minute `:558`, `:569`; lantern `:203`, `:741`; relight `:221`; umbrella Phase 3 order (lantern before encounters); `SpawnerSystem.jsx:27-85` | **Applied.** New **Unit 2b**: one `spawnMob(x, z, type, y, opts) -> id or null`, one whitelisted `opts` schema (the union of every lane's keys), refusal rules keyed on `opts.source`, and a `passiveOnly` table pick for the prologue. Gate: 500 table-driven natural spawns under `prologueActive` contain 0 hostiles, with a presence twin; mutants P1 and P2. SpawnerSystem.jsx and spawnPlacement.js are added to the Risks shared-files list. The sequencing line now follows the umbrella |
| F4 | HIGH (PLAUSIBLE) | Waves and the captain starve: the cap is already filled by the carried day population, and the captain is queued last | `SpawnerSystem.jsx:98-117` (20 + 4), `:149` (counts passives and NPCs), `dayNight.js:129` (night-1 cap 20). Arithmetic: free slots 4n against wave totals of 7 / 11 / 13 | **Applied.** Horn clearance retires distant non-aggro, non-siege mobs through the dissolve with no kill event; the captain goes first in wave 3's queue, with a guaranteed slot. A cumulative test seeded with A in [cap-8, cap] (mutant R5), and **e2e test 2b** with no clearing. The live population count at nightfall remains unmeasured; test 2b measures it and logs it |
| F5 | MED | The tier-0 day table gives a hostile share of 0.489, outside its own [0.55, 0.75] band | Recomputed: hostile 4.4 / passive 4.6 | **Applied.** `boar_herd` weight 1.0 to 0.6 and `ox_pair` 0.8 to 0.4 give **0.611** (recomputed). The "same density" claim is replaced by "same cap and refill rate, about 13% calmer", batched to Kevin. Ambient now draws groups until 3 members per tick, which keeps today's refill rate |
| F6 | MED | `hostileBias` is dead because every night row is all-hostile; mutant E5 survives | `mobTypes.js` (every night-row type has `passive: false`); `siege-gates.test.js:112-113` | **Applied.** Two passive night rows (`night_strays`, `night_ox`) give a night share of 0.927 / 0.942 / 0.957 against today's 0.926 / 0.941 / 0.955 (computed). Two-sided bias test; mutants E5 and E5b |
| F7 | MED | Marchers get a grid but no A*, and the stuck fallback to hunting changes nothing when the objective is the player or the Hearth | `ai.worker.js:137`, `:272-298` (A* inside the aggro block), `:299-316` (wander has no A*), `:336-341` (clamp only) | **Applied.** The A* step is lifted out of the aggro block for any mob with a goal and a grid (still at most N solves per tick). Stuck now sidesteps 8 m perpendicular twice before hunting. Gate `a marcher routes around a wall` with a real grid; mutant W5. Risks "Pathing" rewritten |
| F8 | MED | Elite draws are understated (the shadow pass is missed, so 42 not 28), and `ELITE_ALIVE_CAP` is enforced only for ambient | `MobModel.jsx:346` (`castShadow`), `GameScene.jsx:224` (`shadows`), `Atmosphere.jsx:316` (the sun casts on every tier), `quality.js` (`charOutline` true on every tier) | **Applied.** Elite boxes get `castShadow={false}`, so +6 / +10 holds. The cap is enforced in `spawnMob` for every source, counting the captain, with embers downgraded at 3 live (one slot reserved for a captain). Acceptance 2 measures with 3 ambient embers alive and records N8AO's pass. N8AO is still unchecked, and stated as such |
| F9 | MED | Dungeon guardians bypass the cap and the 3-per-second guard, and pop in 3 m from the player | Unit 9's Consumes listed no `fitToCap` or budget; `SpawnerSystem.jsx:158` | **Applied.** One shared budget (Unit 2b) that every consumer draws from; guardians queue. Test: ambient + dungeon + siege in one second place at most 3 (P4); a guardian queue test (G-d5). The trigger moves to 20 m and y < 26, and the [28, 85] band exception is stated with its reason (an enclosed room) |
| F10 | MED | The captain and elites can be soulbound: no kill event, healed to full, and the jade tell invites it | `Components.jsx:759`, `allegiance.js:10,14,18`, `nametagData.js:24` | **Applied.** `convertMobToAlly` refuses `entity.elite`; one `isBindable` feeds the snare filter and the jade tell; the break matches `captainId`, not `siegeRole`. Tests and mutants L6, L7, C5 |
| F11 | MED | Several e2e kills are probabilistic (S3 survives about 75% of runs, the identity flakes about 1 in 5, X2 survives about 1 in 6) | Plan arithmetic re-run on the retuned table: P(group) = 0.30 per event, brute_camp at tier 0 = 8.6%. `spawnPlacement.js:21-24` (random-chunk proposals) | **Applied.** e2e test 1 is seeded (`setEncounterSeed`, a separate encounter rng stream, groups held rather than re-rolled) and asserts the exact 8-pick sequence; `clearMobs` clears passives too. S3 is dropped from e2e (E1 kills it). `sectorAnchor` proposes polar points inside the sector (test plus G5). e2e test 2 runs on night 3 with at least 4 non-fallback events, about 1 in 1,300 for a bypassed filter |
| F12 | MED (PLAUSIBLE) | e2e test 3's 30 s hitstop freezes the director under test, and the control is vacuous | `ElementZoneSystem.jsx:34` (`worldDelta`, 0 through a hitstop), `useGameStore.jsx:370-377` (no clear-hitstop action), `heavy-melee.spec.js:67` | **Applied.** The break is applied synchronously in the bus callback (`onSiegeKill`; test with zero world time, C6); e2e uses a 1.5 s freeze; the control runs unfrozen and asserts the director ticked |
| F13 | MED | Shrine and lantern interfaces conflict with the relight plan | relight `:245`, `:260`, `:606` (`shrineWaves(tier) -> [string[], string[]]`, `blocked(x, z)`) | **Applied.** `shrineWaves(tier)` ships as an adapter with relight's exact signature, in `game/holdWaves.js` (lazy, out of `index`). One refusal seam inside `spawnMob`, keyed on source; `canSpawnAt` is dropped. Hand-off through KEVIN-REVIEW-BATCH, because this plan does not edit relight's |
| F14 | MED | The compass wedge assertion counts DOM nodes inside a clipped 180-degree strip | `HUD.jsx:303` (`fov = Math.PI`), `:505` (`overflow-hidden`), `compass.js:24-25` | **Applied.** `siegeMarkers` pins an out-of-strip bearing to the edge with `behind: true` and a chevron. Unit test (R6); the e2e asserts each wedge's box lies inside the track's, and turns the camera away first (X5) |
| F15 | LOW | Unit 9 deletes the worker's `DUNGEON_CENTRE_OFFSET`, which `dungeonStamp.test.js:99` pins | `dungeonStamp.test.js:92-99`; `terrain.worker.js:192` | **Applied.** Unit 9 Step 3b re-points the assertion to the import form, with mutant G-d4 and a `Mutation-Proof:` line |
| F16 | LOW | `spawnMob` returning the id is not "truthy for existing callers": id 0 is falsy | `SpawnerSystem.jsx:24`, `:61`; `spawnPlacement.js:29`; `App.jsx:843` (a capture fixture can spawn first) | **Applied.** It returns `id` or `null`, every `return false` becomes `return null`, and `runSpawnPlacement` counts `!= null`. Test: id 0 is counted (P3). Ids are not restarted at 1, because they feed `rollWander({ id, ... })` (`ai.worker.js` wander branch), and shifting them would change every mob's wander |
| F17 | LOW | The horn audio and the night toast still fire on the raw `isDay` edge, including on a load | `ui/DayNightAudio.jsx:21`; `survivalSystem.js:19`, `:27` | **Applied.** Both move to `lastNightfall` (Move C; Unit 6 Files), with a store-level test that a night-save load plays no horn and shows no toast (N2). `siege-warning-gates` still matches `/siegeWarning/` and `/nightCount/`. The dawn chime stays on the edge |
| F18 | LOW | Map order gives the newest placements only for NEW keys; a re-placed mined cell keeps its old position | `Terrain.jsx:961-962`, `:1013`; node check of `Map.set` order | **Applied.** `placeBlockKey` deletes and then sets, and is called at `Terrain.jsx:1013` (one line). Test: a wall on mined ground is the newest cluster (B5). Move F and Current state are corrected |
| F19 | LOW | `siegeSuppressed` has no writer (first-minute uses `clockHeld`), and Unit 6 announces a captain break that Unit 7 wires | first-minute `:80` (D6), `:461-474` | **Applied.** `siegeSuppressed` is removed from the Interfaces, store, tests, Risks and Open question 4. `siege.captain_arrives` moves to Unit 7, and Units 6 and 7 ship in one push |
| F20 | LOW | Citation drifts | `useGameStore.jsx:1060` (a read), `:1077`, `:1139` (the writes); `CombatSystem.jsx:124`; `mobFloor.js:123-130`; `HUD.jsx:306-473`; `BossEntity.jsx:375-376` | **Applied.** Each is re-anchored; none changed a design decision |

**Found while amending (not in the review):** Unit 4 named `src/game/nametagData.test.js`, which does not exist. The
tests live at `frontend/tests/data/nametagData.test.js` and `frontend/tests/render/characterStyle.test.js`, and Unit 4
now names them.

**Still open after these amendments:**
- The live mob count at first nightfall (e2e 2b logs it).
- Whether N8AO adds a pass (Acceptance 2 records it).
- The first-minute, lantern and relight owners' agreement to the Unit 2b contract (a hand-off; this plan edits none of
  theirs).
- Kevin's sign-off on the 0.611 near-Hearth hostile share (KEVIN-REVIEW-BATCH).
