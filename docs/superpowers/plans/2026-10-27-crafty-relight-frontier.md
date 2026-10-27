# Crafty Phase 3 "Relight the frontier" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Old Pike's promise true. A player walks to a frontier shrine, presses G (or taps the shrine prompt on an
iPad) and holds the light for 45 seconds inside a glowing ring while two waves of the Blight come at them. If they hold
it, the shrine's cold crystal flares ember gold, a gold beam rises from it that they can see from the Hearth at night,
no monster spawns within 48 m of it, and the Shadow Dragon loses 10% of its HP and one of its tricks: first its Skeleton
Cohort, then its ground-breaking, then the throw of its roar. That stacks up to three shrines. Leaving the ring, or
falling, puts the flame out at no cost, and the player can come back and try again. Everything survives a reload, and
old saves load with no shrines lit.

**Architecture:** Pure rules in `src/game/` (the ward arithmetic, the save sanitiser and the event reducer, each with
unit tests), a store field `litShrines` persisted in `game_state`, and three thin runtime seams: an interact dispatcher
shared by the G key and a touch pill, a lazy-loaded event runtime that drives the reducer on a 250 ms interval, and
two cheap render pieces (a dim/lit crystal and instanced gold beams). The dragon reads the ward through
`bossTierStats`, which is the one derivation every boss HP consumer already uses.

**Tech Stack:** React 19, R3F 9.5, three 0.172, zustand 5, miniplex, vitest 4, Playwright 1.64.1.

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 3, "Relight the frontier"), with its design
inputs `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` move 14 (rank 14) and
`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md` (row 14 and the bundle-budget item). Where they differ, the
umbrella plan wins. Decisions of record: `docs/superpowers/DECISIONS.md` 2026-10-27.

## Global Constraints

- Death stays soft (`DECISIONS.md` 2026-10-27, "Soft death — KEPT"). A failed event costs nothing.
- No WebGPU/TSL and no three.js bump. This plan adds **no new shader terms**. If one becomes necessary, it is a pure
  GLSL string module with a JS mirror, following `src/world/oreGlow.js` and `src/world/leafFeel.js`.
- **Bytes:** each unit states its main-chunk (`index-*.js`) bytes against `scripts/ci/bundle-budget.mjs:35`
  (`index` max 760,000 B). Code that runs only during a shrine event goes in a lazy chunk.
- **Heat:** no move adds GPU cost without stating it. No point lights, no shadow casters, no post-chain change.
  The iPad (low tier, WebKit) must stay correct.
- **i18n:** every new or changed player string goes through `t()` with en and zh-CN in `src/i18n/strings.js`
  (`tests/i18n/i18n.test.js` enforces zh-CN coverage). zh-CN copy is in plain game register, in Simplified script. It
  reuses the existing terms 神龛 (shrine) and 凋敝之心 (Blight Heart) from `strings.js:254-255`.
- **Game-loop isolation:** nothing per-frame reaches React state. Store writes happen only on transitions (event
  start or end, a shrine lit, an interact hint changing). Per-frame and interval reads go through `getState()`, refs
  and miniplex queries. The HUD bar and the ring colour are written imperatively.
- **No emoji in `src/`.** Selectors are `data-testid`, never copy.
- Every NEW check file carries a `Mutation-Proof:` line naming its mutants and the RED observed (killability ledger,
  `scripts/ci/killability-ledger.mjs`). An edit to an existing gate's assertions under `tests/gates/` needs the
  `Mutation-Proof:` commit trailer.
- A visual-baseline re-shoot is its own `Baseline-Review:` commit with no `src/` change. It is never bundled.
- Commits: no AI footer. Fix-ups are new commits. Run unit tests from `<repo>/frontend`.
- The machine is shared and loaded: run e2e only when `uptime` allows, with `E2E_WORLD_TIMEOUT=240000` if needed, and
  sweep with `sh frontend/scripts/dev/kill-test-procs.sh` after every browser batch.

## Review Focus

Seven inputs the spec implies and no happy-path test exercises, most likely to bite first. Each has its test in the
owning unit. Items 6 and 7 were added by the 2026-10-27 review (see "Review amendments" at the end).

1. **Knockback carries the player out of the ring.** Mob hits and the dragon's roar push the player. Expected: a 3 s
   grace with the ring turning red and an "outside" countdown, so the event does not fail the instant a hit lands.
   Test: U4 `grace: 2.9 s outside then back in does not fail`.
2. **An old save loaded into a session that already lit shrines.** Expected: the old world loads with **no** shrines
   lit. Falling back to live state is the clone bug `startNewWorld` was written to stop
   (`useGameStore.jsx:1150-1160`). The boss hook must follow: it seeds its state once at mount and is never
   remounted by a load, so it re-seeds from the store on every load. Tests: U2 `an old save without litShrines loads
   with none lit, even mid-session`; U3 `a mid-session load re-seeds the fight`.
3. **`TIERS.map(bossTierStats)` passes the array index as a second argument** (`tests/gates/boss-tier-gates.test.js:24`).
   A positional `shrinesLit` would silently ward tier n by n shrines. Test: U3 `an index passed by .map is not a ward`.
4. **G at a shrine that also has its reward chest.** The S8c-bis chest spawns at the shrine centre
   (`QuestSystem.jsx:796-823`). Expected: the first G opens the chest and the next G starts the event. Never both,
   never the event swallowing the chest. Test: U5 `chest outranks shrine; shrine follows`.
5. **A reload, a new world or a death mid-event.** Expected: the event ends, its interval stops, nothing is saved half
   done, and a soft respawn leaves the shrine unlit and retryable. Tests: U4 `a fallen player fails the event`, U5
   `a world load cancels a live event and stops its driver`.
6. **G pressed with the mob cap already full.** The ambient spawner tops `living` up to the cap every second, and the
   cap counts the 4 hub NPCs, which are never culled. So in normal play `room` is 0 when G is pressed, and pausing
   ambient placement frees nothing. Expected: the event makes room inside the cap at its start (retiring distant,
   non-aggro ambient mobs), so wave 1 places. Tests: U4 `pickRoomToFree`, U5 `a full cap is made room for`, and T1
   built at the cap on purpose.
7. **Leaving the ring under Phase 1's combat stance.** The stance caps retreat away from an engaged threat at 2.0 m/s
   (combat-stance plan, "retreat cap"), and the event's mobs arrive aggro. Expected: walking out still works, only
   slower: from the centre an engaged player needs about 6 s to cross 12 m, and the 3 s grace then fails them. An exit
   by knockback stays covered by the grace; knockback is not meant to be the only way out. T2 does not depend on this,
   because it moves the player out by a fixed teleport rather than by camera-relative keys.

---

## Current state (cited, read 2026-10-27 on `main` at `f0e84766`)

**The promise.** `src/game/questLore.js:24` gives Old Pike the line "Light the frontier shrine. Each one we reclaim
weakens the Blight Heart at the edge of the world." The quest it decorates, `pilgrim` (`src/QuestSystem.jsx:37`), is
`type: 'reach_shrine'`. It completes when the player comes within 10 blocks of a shrine (`QuestSystem.jsx:265-287`),
and nothing anywhere lights a shrine or touches the dragon. A grep for `shrinesLit|litShrine` over `src/` returns
nothing.

**"Shrine" means any landmark, including sky-arches.** `nearestLandmark` (`src/world/shrines.js:11-24`) accepts every
`isLandmarkChunk` hit, and `landmarkTypeAt` splits landmarks 50/50 between spires and sky-arches
(`src/world/landmarks.js:22-24`). Only type 0 renders as a shrine (`src/world/Terrain.jsx:477-486`), and only on land
(`Terrain.jsx:518`, `isWater || surfaceY < 32`). **Measured** with node over the landmark hash and `climate.surfaceBlockAt`
(the render's own land gate):

- the nearest landmark to spawn is a **sky-arch**, chunk (2,-6) at (40,-88), 97 m away;
- the nearest real shrine is chunk (2,-7) at (40,-104), 111 m away, and the second is (6,-5) at (104,-72), 126 m away;
- the third is (-2,21) at (-24,344), 345 m away. 28 landmarks lie within 24 chunks of spawn, and 7 of them are real
  shrines.

So today the cyan guide beam, the compass "SHRINE" marker, the objective arrow and the minimap blip all lead a new
player to a sky-arch. The terrain seed is fixed (`climate.js:12-13`, `lcg(12345)`), so every world has this layout.

**Consumers of `nearestLandmark`.** There are six:

| Consumer | Location | Radius and frequency | Capture-suppressed? |
|---|---|---|---|
| `FarBeacon` | `Terrain.jsx:585` | 16 chunks, **every frame** | yes |
| ObjectiveTracker | `HUD.jsx:236` | 750 ms | yes |
| Compass marker | `HUD.jsx:386` | 750 ms | yes |
| `RadialMinimap` | `ui/RadialMinimap.jsx:46` | 1 s | **no**: it draws in baselines, see "NO EARLY RETURN" at `:59` |
| pilgrim poll | `QuestSystem.jsx:274` | default radius | yes |
| shrine-chest poll | `QuestSystem.jsx:808` | default radius | yes |

Five source-grep gates pin the literal `nearestLandmark(` or `/nearestLandmark/`: `shrine-marker-gates.test.js:14-30`,
`shrine-chest-gates.test.js:22-25`, `objective-tracker-gates.test.js:23-31`, `radial-minimap-gates.test.js:52-53` and
`spawn-legibility-gates.test.js:12-13`. `tests/world/shrines.test.js:24-36` asserts agreement with a brute scan over
**all** landmarks.

**The shrine's look.** `Landmark` type 0 (`Terrain.jsx:477-486`) draws the `shrineParts` cubes (`world/shrineShape.js`)
and, in real play only, `<Emissive ... color="#F5D76E" intensity={5.0} />` at `top + 1` (`Terrain.jsx:484`). Every
shrine glows gold today, so the glow means nothing. `top = Math.max(baseY + 58, 104)` (`Terrain.jsx:476`). `FarBeacon`
(`Terrain.jsx:568-610`) draws an additive cyan core and halo toward the nearest landmark, clamped to 150 m, and a violet
pair toward the Blight Heart. Both use `meshBasicMaterial`, `toneMapped={false}` and `AdditiveBlending`. The main
camera's far plane is 500 (`GameScene.jsx:241`); the `far: 400` at `:216` is the shadow camera's. Each shrine renders
**one** `Emissive` (`Terrain.jsx:484`), a lit `meshStandardMaterial` with `emissive` and `toneMapped={false}`
(`render/mascots/voxelKit.jsx:36`), against today's bloom `luminanceThreshold={0.65}` (`GameScene.jsx:121`). That
glow cube sits at `top + 1` (size 2.6). The stone crystal in `shrineParts` is lower: centred at `pillarTop + 3.4`,
height 3.2 (`shrineShape.js:27, :46`), so for `baseY` 40 its top is about y 100 and the glow cube spans about 103.7-106.3.
`cylinderGeometry` is centred on its origin: FarBeacon's 200 m core placed at y 95 (`Terrain.jsx:586, :599`) spans
-5 to 195.

**The dragon.**
- `bossTierStats(tier)` (`src/game/bossTier.js:35-55`) is the one derivation of max HP. Tier 0 is `BOSS_CONFIG.health`
  700 (`bossConfig.js:8`).
- It is consumed by `bossSystem.js:24` (the stats memo, keyed on `[bossTier]`), `bossSystem.js:31-32` (phase seed),
  `bossPersistence.js:55` (serialize default) and `:80` (hydrate max), and by `BossEntity.jsx:110` (phases only).
- The arrival poll (`bossSystem.js:54-109`) resets HP only for a RETURN (`:99-105`). A tier-0 first spawn keeps
  whatever `bossHealth` the store holds: the store default is 700 (`useGameStore.jsx:469`).
- The dragon's tricks live in `BossEntity.jsx` `useFrame`:
  - phase 1 fireball rain;
  - phase 2 roar (`:314-342`), which applies a Rapier impulse (`:329`), toasts "Pushed back!" (`:337`) and breaks voxels
    (`:341`);
  - phase 3 lava (`:346-364`), which breaks voxels (`:364`);
  - phase 3 Skeleton Cohort summon (`:368-380`, `spawnMob(..., 'skeleton')` at `:375-376`).
- `BossHealthBar.jsx:11-13` hardcodes English phase subtitles that name "Knockback Roars" and "Summons", and the
  phase-change alerts in `bossSystem.js:120-122` hardcode "Pushing you back with ROARS!" and "Skeleton Summons!".
- The hook seeds its state **once**, at mount: `bossHealth`, `bossActive`, `bossTier`, `bossDefeated` and
  `bossPhase` are lazy `useState` initialisers (`bossSystem.js:19-33`), and nothing re-seeds them. `useBossSystem`
  is mounted once in `App.jsx:169`, and a world load does not remount it: `loadWorldData` is called from the World
  Manager (`MenuSystem.jsx:199`) and `startNewWorld` from `WorldManager.jsx:82`, with no page reload. The mirror
  (`bossSystem.js:202-204`) then writes the hook's value back over the hydrated store at its next change. So a
  mid-session load today keeps the previous world's fight in the hook. Quest state solved the same problem with a
  `questLoadedAt` tick (`useGameStore.jsx:1163`, `QuestSystem.jsx:173-195`).
- The summon at `BossEntity.jsx:375-376` spawns plain `skeleton`s, indistinguishable from ambient ones, at `bx ± 7`;
  `lastSummonTime` starts at 0 (`:145`), so the first summon fires on the first phase-3 frame. Skeletons kite 8-12 m
  from the player (`ai.worker.js:198`), and the phase-3 dragon moves at 7.0 (`bossConfig.js:19`).
- Starting an event while the dragon is awake would need a mid-fight max-HP change. The live fight is hook state, so
  this plan refuses that case instead (U5).

**Save and migration.**
- `src/game/saveSchema.js` has `SAVE_VERSION = 2` (`:10`). `buildSaveData` (`:14-66`) puts the boss block in
  `game_state.bossState` (`:63`). `migrateSaveData` (`:69-76`) only normalises inventory keys.
- `loadWorldData` (`useGameStore.jsx:1021-1170`) hydrates with absence-tolerant reads. The boss goes through
  `hydrateBossState(saved, { gameWon, nightCount })` (`:1059-1061`, `bossPersistence.js:73-103`), and `questState` uses
  a **presence** test so that a new world cannot inherit the old one (`:1150-1160`).
- `startNewWorld` (`:1192-1197`) loads a save built from the initial state, so a new persisted field resets for free.
- The autosave fires on an explicit field list (`App.jsx:250-287`). `save-consolidation-gates.test.js:70-80` counts
  three of those triggers, and `save-slot-ownership-gates.test.js:194` DERIVES the persisted keys from saveSchema with
  the regex `(\w+):\s*state\.(\w+)`, so only a plain `key: state.key` line enters its denominator. bossState was added
  without a version bump, so this plan follows that precedent and keeps `SAVE_VERSION` at 2.
- **The debounced autosave never fires during active play** (pre-existing; not this plan's to fix). `schedule()`
  clears the pending timer every time (`autosave.js:7`, `delayMs: 5000` at `App.jsx:236`), and `gameTime` is a
  trigger (`App.jsx:281`) that `useDayNightClock.js:23-29` advances every second whenever the world is built, input is
  active and the player is alive (`dayNight.js:76-77`). So while play is active the 5 s debounce is reset every second
  and only the flush on tab-hide or unload (`App.jsx:291-292`) saves; `crafty_active_world` is set only when a save
  mints a slot (`useGameStore.jsx:1215-1218`). Any test that waits for the debounce in active play waits for nothing.

**Spawning and caps.**
- `spawnMob(x, z, forceType, explicitY)` (`SpawnerSystem.jsx:27-83`) has no cap of its own.
- The ambient cap is `siegeParams(...).maxMobs` against living mobs (`SpawnerSystem.jsx:149-155`), with
  `DAY_MAX_MOBS = 16` (`dayNight.js:90`) plus 4 per night and 2 per zone tier.
- **The cap is normally full.** `living` counts every `mobsQuery` entity with `health > 0`, and `mobsQuery` is
  `ecs.with('isMob', 'position', 'type')` (`ecs/world.js:7`), so it includes the 4 hub NPCs (`npcSpawn.js:24-26`,
  `isMob: true, isStatic: true`), which are never distance-culled (`SpawnerSystem.jsx:194`). The ambient pass runs in
  `useFrame` on a 1 s throttle and tops up by up to 3 per tick (`:156-158`). Slots free only on a death or a cull past
  100 m. Pausing ambient placement therefore frees nothing by itself.
- `runSpawnPlacement` (`systems/spawnPlacement.js`) places in a 28-85 m band **around the player**
  (`spawnPlacement.js:28`). It has no exclusion hook.
- `<SpawnerSystem />` already renders in jsdom with a mocked R3F (`tests/gates/capture-guard-timing-gates.test.jsx:113-140`),
  so its call sites are testable by capturing the `useFrame` callback.
- The AI worker keeps a mob that arrives `isAggro: true` aggroed until it leashes (`workers/ai.worker.js:127-131`).
- A kill sets `dyingUntil = performance.now() + DEATH_DISSOLVE_MS` after its rewards (`CombatSystem.jsx:161`,
  `deathFx.js:7`).
- `zoneTier` is 0 within 256 m (`world/zoneTier.js:10-17`), so the first two shrines are tier 0 and the third is tier 1.

**Input.**
- G (`InputManager.jsx:172-216`) looks for a villager within 4 m, otherwise calls `openNearbyChest`.
- On touch there is **no** G: `TouchControls.jsx:178-270` has no interact button, and the `interact` intent is
  reserved with no producer (`input/inputState.js:33-35`).
- The input rule (`.claude/rules/input-and-pointer-lock.md`) applies to `InputManager.jsx` and `src/input/**`: the
  liveness gate lives inside the router, and `keyMap.test.js` parses `event.code === 'KeyG'` out of the handler.
- The `feat/touch-hold` lane (worktree `.claude/worktrees/touch-hold`) rewrites `TouchControls.jsx` and
  `TouchControlsSurface.jsx`, so this plan does not edit them.

**Bytes.** The `build/assets/index-RM8RWfkj.js` on disk (built 2026-10-27 05:22; which branch built it is not
recorded) is 696,924 B against the 760,000 B ceiling. The refute names move 14 as one of the moves that adds main-chunk
code with no byte plan (`refute-2026-10-27.md:117`).

## Design

Six moves. Each states its GPU cost and its main-chunk bytes. The byte figures are estimates, minified and raw; each
unit's commit records the **measured** delta, from `npm run build` and `ls -l build/assets/index-*.js` before and after.

**M1. One meaning of "shrine", and a guide that leads to an unlit one.**
- `nearestLandmark` returns only real shrines: type 0 and on land, through one predicate `landmarkSiteAt(cx, cz)`.
  `LandmarksRender` uses the same predicate.
- It takes an optional `skip(key)` predicate so that guides skip lit shrines.
- Guides scan 24 chunks (384 m, enough to reach the third shrine at 345 m).
- `FarBeacon` stops scanning every frame and uses a 1 s cached scan.
- The name `nearestLandmark` stays: its own docblock already calls it "the nearest-landmark (shrine) finder", and
  keeping it leaves the five source-grep gates untouched.
- **GPU:** 0. **CPU:** the per-frame 16-chunk scan becomes about 1 Hz. **Main bytes:** about +700.

**M2. The frontier remembers.**
- `litShrines`: a sorted, unique array of `"cx_cz"` keys in the store and in `game_state.litShrines`.
- It is sanitised on load (junk and non-shrine keys are dropped; an absent key means none lit), it triggers the
  autosave, and it resets on a new world.
- Anything that needs the count reads `litShrines.length`. No count is stored separately.
- **GPU:** 0. **Main bytes:** about +1,400.

**M3. The dragon answers the light.**
- `bossTierStats(tier, { shrinesLit })` multiplies max HP by `1 - 0.10 * min(3, shrinesLit)`. Tier 0 goes
  700 → 630 → 560 → 490. XP, loot and phases are unchanged.
- Every HP consumer passes the ward.
- `bossSystem` keeps an invariant effect: health never exceeds max. That one rule covers the tier-0 first spawn, the
  DEV force-spawn and a stale saved 700. It only clamps down, so it cannot carry a load: `loadWorldData` also bumps a
  `bossLoadedAt` tick (modelled on `questLoadedAt`), and the hook re-seeds every lazily-initialised value, and the
  `bossSpawned` / `bossKilledRef` latches, from the hydrated store when that tick changes.
- `dragonTricksOff(n)` returns precomputed frozen Sets that strip, in order, `summon` (Skeleton Cohort), `quake` (both
  voxel-destruction calls) and `knockback` (the roar's impulse and its "Pushed back!" toast; the roar's damage and
  shake stay).
- Fireball and lava stay, so every phase keeps its telegraphed core attack.
- The boss bar's phase subtitle **and the phase-change alerts** (`bossSystem.js:120-122`) go through i18n and stop
  naming a trick that is gone, and a "Weakened by N lit shrines" line appears when N > 0.
- The dragon's summon tags its skeletons `{ summonedBy: 'dragon' }` through `spawnMob`'s new `tags` argument (moved
  into U3 from U5), and DEV counts each applied impulse, quake call and summon, so the e2e can reach every stripped
  trick at its `BossEntity` site.
- **GPU:** 0, slightly negative, because fewer voxel breaks means fewer remeshes. **Main bytes:** about +1,300,
  including about 600 B of strings.

**M4. Hold the light: the rules.**
- A pure reducer, `stepShrineEvent`. It runs 45 s on the world clock, so a hitstop holds it.
- It fails after more than 3 s outside a 12 m ring, or on death.
- Wave 1 starts at 0 s and wave 2 at 44% of the duration. Each wave has up to 4 mobs, chosen by the shrine's zone tier
  and placed at deterministic points 16-20 m out.
- Spawns respect a `room` argument (cap minus living mobs). Mobs that do not fit are carried and retried.
- The wave notice fires on the step that **places** a wave's first mob, never on a wave that is wholly carried.
- `pickRoomToFree` (pure) chooses which ambient mobs the runtime retires at event start so the event fits inside
  the cap (see M5).
- At completion, an event still inside its grace counts as lit.
- **GPU:** 0. **Bytes:** about 2,500 in the **lazy** `shrineEventRuntime` chunk, 0 in main.

**M5. Hold the light: in play.**
- One interact dispatcher (`interactTarget` and `runInteract`) serves both G and a touch pill. Priority is NPC, then
  chest, then unlit shrine. The liveness gate sits inside the dispatcher.
- A 250 ms headless poller publishes `interactHint` on change only, and prefetches the runtime chunk within 40 m of an
  unlit shrine.
- The lazy runtime:
  - begins the event and drives the reducer at 250 ms;
  - spawns through `spawnMob(..., tags)` with `{ shrineEventKey, isAggro: true }`;
  - **makes room inside today's cap at event start.** The cap is normally full (4 of its slots are the hub NPCs), so
    pausing ambient placement alone frees nothing. `beginShrineEvent` computes `need` (the event's total wave size,
    at most 8) and retires the ambient mobs `pickRoomToFree` names until `living + need <= cap`: living, not static,
    not aggro, not event-tagged, not already dissolving, and 40 m or more from the shrine, passives first and then
    farthest first. They leave by the no-reward dissolve the success purge uses. Then it pauses ambient placement for
    the event. If too few qualify (aggro hostiles are already on the player), the rest of each wave is carried by
    the reducer, so the total never exceeds the cap;
  - on success, lights the shrine, announces the trick removed, plays the existing bloom spike and fanfare
    (suppressed in capture), and dissolves the remaining event mobs **without** rewards;
  - on failure, clears the event.
- A ground ring (ember inside, red outside) and an imperative HUD bar render only while an event is live.
- Pike's guide line points at the relight.
- Starting is refused while the dragon is awake.
- **GPU:** +1 draw only during a live event (a 64-segment `ringGeometry`, 128 tris, `meshBasicMaterial`, transparent,
  `depthWrite={false}`, about 5-15% of the screen at the player's feet). The HUD bar is DOM, updated with a
  `transform: scaleX` write in rAF, which is compositor-only.
- **Bytes:** main about +3,000 (dispatcher, poller, prompt, mount stubs, about 1.6 KB of strings). The lazy chunk adds
  about 3,000 (driver, ring, bar).

**M6. The light it leaves.**
- The crystal glow becomes meaningful. Unlit is a `meshBasicMaterial` cube in `#8FA3B8`: it does not respond to
  light, so its luminance is fixed by its colour (linear luminance about 0.35), under today's 0.65 threshold at noon as
  well as at night. Lit is the existing `Emissive`, `#FFB347` at 6.0 (HDR). Both sit where today's glow cube sits
  (`top + 1`).
- `LitShrineBeams` draws every lit shrine as an ember-gold column at its **true** position. The column's **base** is
  `landmarkTop(baseY) + 4`, about 1.7 m above the top of the glow cube (`top + 2.3`), and it rises 160 m. Because
  `cylinderGeometry` is centred on its origin, each instance is translated to `base + height / 2` (core `base + 80`,
  halo `base + 75`), so the column's lowest point is its base and the player at ground level is never inside it. It
  uses `fog={false}` so a shrine within the main camera's 500 m far plane (`GameScene.jsx:241`) reads from the Hearth.
  It is two `InstancedMesh`es (core and halo, up to 16 instances each, `frustumCulled = false`). Matrices are rebuilt
  only when `litShrines` changes.
- A ground light pool (an additive radial disc on the plinth, one `InstancedMesh`) renders on med and high only. The
  iPad's low tier keeps the beam and crystal, which carry the meaning.
- Ambient spawns are suppressed within **48 m** of a lit shrine (`runSpawnPlacement`'s new `blocked(x, z)` predicate).
  The radius has to clear the spawner's 28 m floor around the player (`spawnPlacement.js:28`): at 24 m, a player
  standing at the shrine could never see a difference, because no ambient spawn lands within 28 m of them anyway. At
  48 m, standing on a lit plinth pushes every new spawn out to 48-85 m (about a quarter of the band's area is
  closed). Hostiles spawned outside still walk in: the light does not repel them, and this plan does not claim it
  does. The predicate is the one move 12's lantern can reuse, with its own radius.
- Guides skip lit shrines. The objective reads "Light a frontier shrine (n/3)" until 3 are lit, then the Blight Heart.
- **GPU (steady state, at least one shrine lit):** +2 draws (beams). Each instance is 24 tris (12-segment open
  cylinder), with additive overdraw on a thin column (about 1-3% of pixels when in view). On med and high, +1 draw for
  the pool, whose additive coverage reaches about 30% of the screen only while standing on a lit plinth.
- **GPU with nothing lit:** 0. Dimming the unlit crystal turns one HDR bloom source per loaded shrine (its single
  intensity-5 `Emissive`, `Terrain.jsx:484`) into a sub-threshold one.
- No point light anywhere: changing the light count recompiles every lit material, which is the refute's F3 hitch
  class.
- **Main bytes:** about +2,200.

**Totals.** About +9,300 B main (on 696,924 B that is about 706.2 KB of 760 KB), plus about 5,900 B in one lazy
chunk. The review amendments add about 700 B main (the boss re-seed, the routed alerts and their strings, the DEV
effect counters) and about 400 B lazy (`pickRoomToFree` and the reservation).
In steady state, +2 draws with shrines lit, +3 on med and high, and +1 more during an event.

**Composes with.**
- **Move 10, the encounter table.** It replaces `shrineWaves(tier)`, keeping that signature.
- **Move 12, block light.** It reads `litShrineLights()` (U6 exports it: `[{ x, y, z, level: 15 }]`) to make lit
  shrines block-light sources. Until move 12 lands its only importer is `frontier.test.js`, which pins its shape and
  is what keeps CI's knip from flagging it as an unused export.
- **Move 13, the dragon rebuild.** It maps its own attacks onto `dragonTricksOff(n)`. If 13 lands first, U3's
  `BossEntity` edits rebase onto its attack sites.
- **Phase 1, the light and colour script.** It raises the bloom threshold above 1.0. The beam core's HDR multiplier
  (2.0) and the lit crystal (6.0) are chosen to clear it, and U7's lookbook verifies that.

## File map

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/world/landmarks.js` | modify | export `LANDMARK_MIN_SURFACE_Y = 32` |
| `frontend/src/world/shrines.js` | modify | `landmarkSiteAt`, `shrineSiteAt`, `nearestLandmark` (shrines only, plus `skip`), `GUIDE_CHUNKS`, `createGuideScan` |
| `frontend/src/world/shrineShape.js` | modify | export `landmarkTop(baseY)`, the single source of the `Math.max(baseY + 58, 104)` formula |
| `frontend/src/game/frontier.js` | create | ward math, `dragonTricksOff`, `sanitizeLitShrines`, `insideLitSanctuary`, `litShrineLights`, `SHRINE_EVENT`, `canStartShrineEvent`, `createShrineEvent`, `litBeamLayout`, `pickObjective` |
| `frontend/src/game/shrineEvent.js` | create (lazy) | `shrineWaves`, `waveSpawnPoints`, `stepShrineEvent`, `pickRoomToFree`, `SHRINE_WAVES_VERSION` |
| `frontend/src/world/shrineEventRuntime.jsx` | create (lazy) | `beginShrineEvent`, `ShrineEventRing`, `ShrineEventHud` |
| `frontend/src/world/shrineEventLoader.js` | create | memoised `loadShrineRuntime()` and `prefetchShrineRuntime()` |
| `frontend/src/world/ShrineEventMounts.jsx` | create | `ShrineEventRingMount`, `ShrineEventHudMount` (React.lazy from the runtime chunk) |
| `frontend/src/world/ShrineProximity.jsx` | create | 250 ms poller for `interactHint` and prefetch; DEV hooks `setShrineEventDuration`, `readMobCap` |
| `frontend/src/input/interact.js` | create | `interactTarget`, `runInteract` |
| `frontend/src/ui/InteractPrompt.jsx` | create | desktop "Press G" text and touch pill `data-testid="touch-interact"` |
| `frontend/src/render/LitShrineBeams.jsx` | create | `ShrineCrystalGlow`, `LitShrineBeams` (plus pool); DEV hook `readLitBeams` |
| `frontend/src/game/bossTier.js`, `bossPersistence.js` | modify | ward |
| `frontend/src/world/bossSystem.js`, `render/BossEntity.jsx`, `ui/BossHealthBar.jsx` | modify | ward, tricks, bar, routed alerts, load re-seed, DEV `readDragonEffects` |
| `frontend/src/game/saveSchema.js`, `store/useGameStore.jsx`, `App.jsx` | modify | persist, hydrate, `bossLoadedAt`, autosave trigger, mounts, `readMobs` tags (`summonedBy` in U3, `shrineEvent` in U5) |
| `frontend/src/InputManager.jsx` | modify | G calls `runInteract` |
| `frontend/src/systems/SpawnerSystem.jsx`, `systems/spawnPlacement.js`, `game/dayNight.js` | modify | tags (U3), pause, `blocked`, `mobCapAt`, DEV `readSpawnBlocks` |
| `frontend/src/systems/SpawnerSystem.light.test.jsx` | create | the call-site test: `blocked` and the ambient pause reach the real spawner |
| `frontend/src/world/Terrain.jsx`, `HUD.jsx`, `ui/RadialMinimap.jsx`, `QuestSystem.jsx` | modify | glow, beams, guides |
| `frontend/src/i18n/strings.js` | modify | 30 keys, en and zh-CN |
| `frontend/tests/e2e/relight-shrine.spec.js` | create | the lived proof |

---

## Units

The units are ordered and each is independently green. **U2 and U3 are inert until U5 gives them a producer, so U2-U5
go in ONE push** (separate commits), which means no push ships a field that nothing writes. U1 can push alone, but
only after Phase 0e's re-baseline has landed and with a green e2e receipt for its `src/` tree (U1 Step 7). U6 and U7
follow.

### U1: A shrine is a shrine (M1)

**Files:**
- Modify: `frontend/src/world/landmarks.js` (add the constant after `:20`)
- Modify: `frontend/src/world/shrines.js:11-24`
- Modify: `frontend/src/world/Terrain.jsx:511-521` (LandmarksRender) and `:568-590` (FarBeacon)
- Test: `frontend/tests/world/shrines.test.js` (rewrite `:24-36`; add cases)

**Interfaces:**
- Produces:
  - `landmarkSiteAt(cx, cz) -> { cx, cz, key, worldX, worldZ, baseY, type } | null`, where `key = \`${cx}_${cz}\``
    and the result is null unless the chunk is a landmark chunk on land;
  - `shrineSiteAt(cx, cz) -> same | null` (type 0 only);
  - `nearestLandmark(x, z, maxChunks = 8, skip = null) -> { cx, cz, key, worldX, worldZ, type: 0, dist } | null`;
  - `GUIDE_CHUNKS = 24`;
  - `createGuideScan({ periodMs = 1000, maxChunks = GUIDE_CHUNKS, finder }) -> (x, z, now, skip) => result`. It
    calls `finder(x, z, maxChunks, skip)` only when `now - last >= periodMs`, and otherwise returns the cached
    result. `finder` is **required** (no default). Each caller passes `nearestLandmark` explicitly, so the caller's
    import is real use: no unused import for eslint, and the source-grep gates' `nearestLandmark` match stays
    honest.

- [ ] **Step 1: Write the failing tests** in `tests/world/shrines.test.js`. Keep the null, deterministic and
  world-centre cases. Replace the brute-scan case so it agrees with `shrineSiteAt`, and add:

```js
it('spawn is led to the real shrine at (2,-7), not the sky-arch at (2,-6)', () => {
  expect(nearestLandmark(0, 0, 8)).toMatchObject({ cx: 2, cz: -7, worldX: 40, worldZ: -104, type: 0, key: '2_-7' });
});
it('a type-0 landmark under water or below Y 32 is not a shrine', () => {
  expect(isLandmarkChunk(-10, -9) && landmarkTypeAt(-10, -9)).toBe(0); // the census found it fails the land gate
  expect(shrineSiteAt(-10, -9)).toBeNull();
  expect(nearestLandmark(-152, -136, 0)).toBeNull();
});
it('skip passes over a lit shrine to the next one', () => {
  expect(nearestLandmark(0, 0, 8, (k) => k === '2_-7')).toMatchObject({ key: '6_-5' });
});
it('the guide radius reaches the third shrine once the first two are lit', () => {
  const lit = new Set(['2_-7', '6_-5']);
  expect(nearestLandmark(0, 0, GUIDE_CHUNKS, (k) => lit.has(k))).toMatchObject({ key: '-2_21' });
});
it('createGuideScan recomputes at most once per period', () => {
  let calls = 0; const scan = createGuideScan({ periodMs: 1000, finder: (...a) => (calls++, nearestLandmark(...a)) });
  scan(0, 0, 0); scan(0, 0, 500); scan(0, 0, 999); expect(calls).toBe(1);
  scan(0, 0, 1000); expect(calls).toBe(2);
});
it('denominator: the 24-chunk census holds 28 landmarks and 7 shrines', () => {
  let landmarks = 0, shrines = 0;
  for (let cz = -24; cz <= 24; cz++) for (let cx = -24; cx <= 24; cx++) {
    if (isLandmarkChunk(cx, cz)) landmarks++;
    if (shrineSiteAt(cx, cz)) shrines++;
  }
  expect([landmarks, shrines]).toEqual([28, 7]); // measured 2026-10-27; a hash or land-gate change must be deliberate
});
```

  Add a `Mutation-Proof:` header line, because the file is materially rewritten.

- [ ] **Step 2: Run, expect RED.** `npx vitest run tests/world/shrines.test.js`. Expected: FAIL on the first test
  (it returns `cx: 2, cz: -6`, a sky-arch), and `shrineSiteAt`, `GUIDE_CHUNKS` and `createGuideScan` are not exported.

- [ ] **Step 3: Implement** in `shrines.js`. `landmarkSiteAt` uses `climate.surfaceBlockAt(worldX, worldZ)` and
  rejects `isWater || surfaceY < LANDMARK_MIN_SURFACE_Y`. `nearestLandmark` iterates as today but tests
  `shrineSiteAt` and `skip?.(key)`.

- [ ] **Step 4: Wire the renders.** In `LandmarksRender`, keep `if (!isLandmarkChunk(cx, cz)) continue;` (the
  `landmarks-gates.test.js:18` anchor), then `const site = landmarkSiteAt(cx, cz); if (!site) continue;`, and pass
  `site.baseY` and `site.type`. In `FarBeacon`, add a module-level
  `const guideScan = createGuideScan({ finder: nearestLandmark })` and replace `:585` with
  `guideScan(pp.x, pp.z, performance.now())`. The beacon is still driven by `nearestLandmark`, which is what
  `spawn-legibility-gates.test.js:12-13` asserts.

- [ ] **Step 5: Run, expect GREEN.**
  `npx vitest run tests/world/shrines.test.js tests/gates/landmarks-gates.test.js tests/gates/spawn-legibility-gates.test.js tests/gates/shrine-marker-gates.test.js tests/gates/shrine-chest-gates.test.js tests/gates/objective-tracker-gates.test.js tests/gates/radial-minimap-gates.test.js tests/gates/pilgrim-quest-gates.test.js`.
  Expected: all PASS.

- [ ] **Step 6: Mutants**, with `scripts/dev/mutate.sh` against `src/world/shrines.js`, each RED:
  - **U1-M1** drop the type filter: the "real shrine at (2,-7)" test goes red;
  - **U1-M2** drop the land gate: the "under water" test goes red;
  - **U1-M3** ignore `skip`: the "skip" test goes red;
  - **U1-M4** remove the period check in `createGuideScan`: the "once per period" test goes red;
  - **U1-M0** the identity mutant stays GREEN.

  Record them in the file header.

- [ ] **Step 7: Capture impact, then commit.** **Precondition:** Phase 0e's Chromium re-baseline has landed on `main`
  (`DECISIONS.md` 2026-10-27: it lands alone and BEFORE any look change, so a re-shoot before it would mix a renderer
  change with this content change). If 0e has not landed, U1 commits but waits to push. The push also needs a green
  e2e receipt for the changed `src/` tree (the `e2e freshness` gate). The minimap draws in capture, and its shrine blip moves from bearing
  atan2(40,-88) to atan2(40,-104), about 3.4 degrees on the rim. Run `npm run test:visual` when the load allows. If
  any frame is over its gate or its density ledger, **do not** re-shoot inside this commit. Commit the src change,
  then make a separate `Baseline-Review:` commit with the re-shoot, naming the minimap blip as the only intended
  change. Measure the bytes, then commit:
  `git add frontend/src/world/landmarks.js frontend/src/world/shrines.js frontend/src/world/Terrain.jsx frontend/tests/world/shrines.test.js && git commit -m "fix(world): a shrine is a shrine — guides lead to the real shrine at (40,-104), not the sky-arch at (40,-88); FarBeacon scans at 1 Hz (index +N B)"`

### U2: The frontier remembers (M2)

**Files:**
- Create: `frontend/src/game/frontier.js`
- Create: `frontend/src/game/frontier.test.js`
- Modify: `frontend/src/game/saveSchema.js:51-64`
- Modify: `frontend/src/store/useGameStore.jsx` (initial state near `:473`; `loadWorldData` near `:1052-1135`)
- Modify: `frontend/src/App.jsx:285-286`
- Test: `frontend/tests/store/litShrinesSave.test.js` (create)
- Gate edit: `frontend/tests/gates/save-consolidation-gates.test.js:73`

**Interfaces:**
- Consumes `shrineSiteAt` (U1).
- Produces:
  - from `frontier.js`: `SHRINE_WARD_MAX = 3`; `SHRINE_WARD_HP = 0.10`; `shrineWard(n) -> 0..3` (non-finite gives 0);
    `sanitizeLitShrines(raw) -> string[]` (sorted, unique, `^-?\d+_-?\d+$`, `shrineSiteAt` non-null, at most 64;
    anything that is not an array gives `[]`);
  - store: `litShrines: []`; `lightShrine(key) -> boolean` (true only when newly lit; invalid or duplicate keys give
    false and leave the array identity unchanged); `shrineEvent: null` and `setShrineEvent(ev | null)` (transient,
    never saved); `interactHint: null` and `setInteractHint(h)` (transient);
  - save: `game_state.litShrines`.

- [ ] **Step 1: Write the failing tests.**
  - In `frontier.test.js`: `sanitizeLitShrines(undefined)` → `[]`.
    `sanitizeLitShrines(['6_-5', '2_-7', '2_-7', 'x', 7, '2_-6', '-10_-9'])` → `['2_-7', '6_-5']`; the sky-arch, the
    drowned shrine, junk and duplicates are all dropped. `shrineWard` maps 0,1,2,3,4,NaN,-1 to 0,1,2,3,3,0,0.
  - In `litShrinesSave.test.js`, through the real `buildSaveData` → `JSON` → `loadWorldData` path, modelled on
    `tests/store/bossTierSave.test.js:15-19`:
    - `round-trips the lit set`;
    - `an old save without litShrines loads with none lit, even mid-session` (set live `litShrines: ['2_-7']`, load a
      save with the key deleted, expect `[]`);
    - `junk in a save is dropped`;
    - `startNewWorld resets the lit set`;
    - `lightShrine is idempotent and rejects non-shrines` (a second `'2_-7'` returns false and keeps identity, and
      `'2_-6'` returns false);
    - `loadWorldData clears a live shrineEvent`.

- [ ] **Step 2: Run, expect RED.**
  `npx vitest run src/game/frontier.test.js tests/store/litShrinesSave.test.js`. Expected: FAIL; the module is missing
  and `lightShrine` is not a function.

- [ ] **Step 3: Implement.**
  - `frontier.js` (the persistence half).
  - `saveSchema.js`: a plain `litShrines: state.litShrines,` line in the `game_state` block. It must stay in the
    `key: state.key` form, because that is what `save-slot-ownership-gates.test.js:194` derives its persisted-key
    denominator from: a guarded `Array.isArray(...)` form would silently fall outside that gate. The value is always
    a sanitised array already (initial `[]`, the load sanitiser, and `lightShrine`), and a state with no key
    serialises nothing, which loads as `[]`.
  - Store: the fields and actions above. In `loadWorldData`, use
    `litShrines: sanitizeLitShrines(saveData.game_state?.litShrines)` (an absent key means `[]`; it is **never** a
    fallback to `state`) and `shrineEvent: null`.
  - `App.jsx`: one trigger line, `s.litShrines !== prevS.litShrines ||`.

- [ ] **Step 4: Gate edit** (needs the trailer). Add `'litShrines'` to `TRIGGERS` in
  `save-consolidation-gates.test.js:73`.

- [ ] **Step 5: Run, expect GREEN.**
  `npx vitest run src/game/frontier.test.js tests/store/litShrinesSave.test.js tests/gates/save-consolidation-gates.test.js tests/gates/save-slot-ownership-gates.test.js tests/gates/new-world-reset-gates.test.js src/game/saveSchema.test.js`.

- [ ] **Step 6: Mutants**, each RED:
  - **U2-M1** `loadWorldData` falls back to `state.litShrines`: the "old save" test;
  - **U2-M2** `sanitize` skips `shrineSiteAt`: the junk test (the sky-arch survives);
  - **U2-M3** `buildSaveData` omits the key: the round trip;
  - **U2-M4** `lightShrine` appends duplicates: the idempotence test;
  - **U2-M5** delete the `App.jsx` trigger line: `save-consolidation-gates` and `save-slot-ownership-gates` (the
    derived gate sees `litShrines` only because of the plain serialise form). T1 does **not** see this mutant: its
    flush saves on the `gameTime` trigger anyway, so the trigger line is proven by these two gates alone;
  - **U2-M0** identity: GREEN.

- [ ] **Step 7: Commit** (it does not push alone):
  `git commit -m "feat(save): litShrines in game_state — sanitised on load, absent = none lit, autosaved, reset on a new world (index +N B)" -m "Mutation-Proof: save-consolidation-gates TRIGGERS += litShrines; deleting the App.jsx trigger line went RED"`

### U3: The dragon answers the light (M3)

**Files:**
- Modify: `frontend/src/game/bossTier.js:35-55`
- Modify: `frontend/src/game/bossPersistence.js:52-80`
- Modify: `frontend/src/store/useGameStore.jsx` (pass `shrinesLit` into `hydrateBossState` at `:1059`; hydrate
  `litShrines` first)
- Modify: `frontend/src/world/bossSystem.js:23-32`, plus a new invariant effect, plus a `bossLoadedAt` re-seed
  effect, plus the phase alerts at `:118-123`, plus `shrinesLit` in the return (`:216-220`)
- Modify: `frontend/src/store/useGameStore.jsx` (`bossLoadedAt: 0` in initial state; `loadWorldData` bumps it, as it
  bumps `questLoadedAt` at `:1163`)
- Modify: `frontend/src/render/BossEntity.jsx:325-341, :364, :368-380` (guards, the summon's `tags`, and the DEV
  `readDragonEffects` counters)
- Modify: `frontend/src/systems/SpawnerSystem.jsx:27` (add the `tags` 5th parameter, merged into the entity; moved
  here from U5) and `frontend/src/App.jsx:335-338` (`summonedBy: e.summonedBy || null` in `readMobs`)
- Modify: `frontend/src/ui/BossHealthBar.jsx:11-13` and its props
- Modify: `frontend/src/HUD.jsx:617` (pass `wardCount`)
- Modify: `frontend/src/i18n/strings.js` (the `boss.*` keys)
- Modify: `frontend/src/game/frontier.js` (tricks)
- Test: `frontend/src/game/bossWard.test.js` (create); `frontend/src/world/bossSystem.ward.test.jsx` (create, modelled
  on `tests/gates/boss-persistence-hook-gates.test.jsx`)
- E2E: `frontend/tests/e2e/relight-shrine.spec.js`, test T3 (create the file here)

**Interfaces:**
- Consumes `shrineWard`, `SHRINE_WARD_HP` and the store's `litShrines`.
- Produces:
  - `bossTierStats(tier, opts) -> { ..., health }`. It reads `opts?.shrinesLit` **defensively**: a number, null or
    undefined in `opts` gives a ward of 0.
  - `DRAGON_TRICKS = ['summon', 'quake', 'knockback']`.
  - `dragonTricksOff(n) -> ReadonlySet<string>` (precomputed, frozen, no allocation per call).
  - `serializeBossState({ ..., litShrines })`.
  - `hydrateBossState(saved, { gameWon, nightCount, shrinesLit })`.
  - `useBossSystem(...)` additionally returns `shrinesLit` (the ward count, 0..3).
  - `BossHealthBar` takes a prop `wardCount`.
  - store `bossLoadedAt` (a tick, transient, never saved).
  - `spawnMob(x, z, type, explicitY, tags)`; the summon passes `{ summonedBy: 'dragon' }`.
  - DEV hook `readDragonEffects() -> { impulse, quake, summon }`: counts incremented on the same line as each applied
    `applyImpulse`, each `destroyVoxelsInRadius` call and each summon. A counter proves the guarded branch ran, not
    the size of the push.

- [ ] **Step 1: Write the failing tests.** In `bossWard.test.js`:

```js
it('each lit shrine strips 10% of max HP, up to 3', () => {
  expect([0, 1, 2, 3, 4].map((n) => bossTierStats(0, { shrinesLit: n }).health)).toEqual([700, 630, 560, 490, 490]);
  expect(bossTierStats(2, { shrinesLit: 1 }).health).toBe(Math.round(bossTierStats(2).health * 0.9));
});
it('an index passed by .map is not a ward', () => {
  expect([0, 1, 2].map(bossTierStats)).toEqual([0, 1, 2].map((t) => bossTierStats(t)));
  expect(() => bossTierStats(1, null)).not.toThrow();
});
it('the ward strips HP only: XP, loot and phases are the tier\'s', () => {
  const { health: warded, ...restW } = bossTierStats(1, { shrinesLit: 2 });
  const { health: full, ...restF } = bossTierStats(1);
  expect(restW).toEqual(restF);
  expect(warded).toBe(Math.round(full * 0.8));
});
it('tricks go in order: summon, quake, knockback', () => {
  expect([0, 1, 2, 3, 4].map((n) => [...dragonTricksOff(n)])).toEqual([[], ['summon'], ['summon', 'quake'],
    ['summon', 'quake', 'knockback'], ['summon', 'quake', 'knockback']]);
  expect(dragonTricksOff(2)).toBe(dragonTricksOff(2)); // the same frozen object, so no allocation per frame
});
it('hydrate sizes an untouched dragon to the warded max, and clamps a stale 700', () => {
  expect(hydrateBossState(null, { shrinesLit: 2 }).health).toBe(560);
  expect(hydrateBossState({ health: 700, active: false, defeated: false, tier: 0, killNight: 0 }, { shrinesLit: 2 }).health).toBe(560);
});
it('serialize writes the warded default for junk health', () => {
  expect(serializeBossState({ bossHealth: NaN, litShrines: ['2_-7'] }).health).toBe(630);
});
```

  In `bossSystem.ward.test.jsx`, render `useBossSystem(5)` with fake timers. Set store `litShrines: ['2_-7', '6_-5']`,
  `bossHealth: 700` and the player at `blightHeartSite()`, then advance 1500 ms. Expect `bossActive` true,
  `bossHealth` 560 and `bossMaxHealth` 560, and expect the store's mirrored `bossHealth` to be 560. A second case:
  `litShrines: []` gives 700 (the presence control). Two more cases in the same file:
  - `a mid-session load re-seeds the fight`: with 2 shrines lit and the hook clamped to 560, call `loadWorldData`
    with a save that has no `litShrines` key and a boss block at 700. Expect the hook's `bossHealth` 700 and
    `bossMaxHealth` 700, and the store's mirrored `bossHealth` still 700 after one more tick (the mirror must not
    write the stale 560 back).
  - `the phase alert names only the tricks left`: with 1 shrine lit, damage to phase 3 and expect `bossNotification`
    to equal `t('boss.alert.phase3.noSummon')`; with 0 lit, `t('boss.alert.phase3')` (the control).

- [ ] **Step 2: Run, expect RED.**
  `npx vitest run src/game/bossWard.test.js src/world/bossSystem.ward.test.jsx tests/gates/boss-tier-gates.test.js`.
  Expected: the ward tests FAIL (they get 700 everywhere) and `dragonTricksOff` is missing; boss-tier-gates PASSES
  (the control).

- [ ] **Step 3: Implement.**
  - `bossTier.js`: `health: Math.round(base * (1 - SHRINE_WARD_HP * shrineWard(opts && opts.shrinesLit)))`, applied
    after the tier scaling, for tier 0 too.
  - `bossPersistence.js`: thread `shrinesLit` through both functions.
  - `bossSystem.js`:
    - `const shrinesLit = useGameStore((s) => shrineWard(s.litShrines.length))`. It is a primitive selector and
      changes at most 3 times a game.
    - The stats memo is keyed on `[bossTier, shrinesLit]`, and the phase seed reads the store's `litShrines`.
    - Add the invariant effect
      `useEffect(() => { if (bossHealth > bossMaxHealth) setBossHealth(bossMaxHealth); }, [bossHealth, bossMaxHealth])`.
    - Add the load re-seed: subscribe `(s) => s.bossLoadedAt`, and on a change (skip the initial 0) set
      `bossHealth`, `bossActive`, `bossDefeated`, `bossTier` and `bossPhase` from the hydrated store with the same
      derivations as the lazy initialisers, and reset `bossSpawned.current` and `bossKilledRef.current` to match the
      hydrated `bossActive` and `bossDefeated`. Watch only the tick, as `QuestSystem.jsx:173-195` does, so the
      re-seed cannot fight the mirror.
    - Route the alerts at `:120-122` through `t()`: read `dragonTricksOff(getState().litShrines.length)` at the
      transition and choose `boss.alert.phase2` or `boss.alert.phase2.calm` (knockback off), and
      `boss.alert.phase3` or `boss.alert.phase3.noSummon` (summon off).
  - `BossEntity.jsx`: at each attack decision (not every frame), read
    `const off = dragonTricksOff(useGameStore.getState().litShrines.length)`. Skip the impulse at `:329` and the toast
    at `:337` when `off.has('knockback')`, both `destroyVoxelsInRadius` calls when `off.has('quake')`, and the whole
    summon block (spawns and toast) when `off.has('summon')`, keeping the timer advance so it does not fire every
    frame. The summon's two `spawnMob` calls pass `{ summonedBy: 'dragon' }`. Under DEV, increment the
    `readDragonEffects` counters on the line beside each applied effect (inside the guard, never outside it).
  - `BossHealthBar.jsx`: the subtitle is `t('boss.phase1' | 'boss.phase2' | 'boss.phase2.calm' | 'boss.phase3' | 'boss.phase3.noSummon')`,
    chosen by phase and `wardCount`. When `wardCount > 0`, render
    `<span data-testid="boss-ward">{t('boss.warded', { n: wardCount })}</span>`. The English for an unwarded dragon is
    byte-identical to today, so the `boss-closeup` capture frame does not move.
  - Add the strings to `strings.js` (en and zh-CN):

| key | en | zh-CN |
|---|---|---|
| `boss.phase1` | Phase 1: Aerial Barrage | 第一阶段：空中轰炸 |
| `boss.phase2` | Phase 2: Grounded Carnage [Knockback Roars] | 第二阶段：落地狂袭［击退咆哮］ |
| `boss.phase2.calm` | Phase 2: Grounded Carnage | 第二阶段：落地狂袭 |
| `boss.phase3` | Phase 3: Enraged Inferno [Lava Circles & Summons] | 第三阶段：暴怒炼狱［熔岩圈与召唤］ |
| `boss.phase3.noSummon` | Phase 3: Enraged Inferno [Lava Circles] | 第三阶段：暴怒炼狱［熔岩圈］ |
| `boss.warded` | Weakened by {n} lit shrines | 已被 {n} 座点亮的神龛削弱 |
| `boss.alert.phase2` | PHASE 2: The Shadow Dragon lands! Pushing you back with ROARS! | 第二阶段：暗影巨龙落地了！小心它的咆哮把你击退！ |
| `boss.alert.phase2.calm` | PHASE 2: The Shadow Dragon lands! | 第二阶段：暗影巨龙落地了！ |
| `boss.alert.phase3` | PHASE 3: The Shadow Dragon is ENRAGED! Watch out for LAVA ZONES and Skeleton Summons! | 第三阶段：暗影巨龙暴怒了！小心熔岩区和骷髅召唤！ |
| `boss.alert.phase3.noSummon` | PHASE 3: The Shadow Dragon is ENRAGED! Watch out for LAVA ZONES! | 第三阶段：暗影巨龙暴怒了！小心熔岩区！ |

  The unwarded `boss.alert.*` English is byte-identical to today's literals.

- [ ] **Step 4: Write e2e T3 red-first** in `tests/e2e/relight-shrine.spec.js` (header: `Mutation-Proof:`, plus a
  BLIND SPOT note that whether a weakened dragon is FUN is a person-playing question):
  - **T3 "two lit shrines strip the Skeleton Cohort and the ground-breaking".** Run `bootDev` and `startPlay`. Set
    store `litShrines: ['2_-7', '6_-5']` (setup: the subject is the dragon). Call `forceBossSpawn([px + 12, py + 2, pz])`,
    record `readDragonEffects()` and the set of `worldBlocks` keys, then `damageBoss` until health is at or below 0.3
    of max (phase index 2). Wait 3 s. Count `readMobs` entries with `summonedBy === 'dragon'` (no distance filter:
    the tag, not proximity, says who summoned it, so a kiting skeleton or an ambient one cannot skew the count), and
    count new `worldBlocks` entries set to 0 within 6 m of the player (the lava quake breaks at the player's feet,
    `BossEntity.jsx:364`). Expect 0 and 0, and `readDragonEffects().quake` unchanged.
  - **The control in the same spec, run first** (presence before absence): with `litShrines: []`, the same steps give
    at least 2 dragon-tagged skeletons (the first summon fires on the first phase-3 frame, since `lastSummonTime`
    starts at 0) and at least 1 broken block.
  - **T3c "three lit shrines strip the roar's throw".** Same start with all three shrines lit (`['-2_21', '2_-7', '6_-5']`),
    then `damageBoss` to at or below 0.6 of max (phase index 1) and wait 5 s (the roar fires every 4.2 s and first
    fires on entry). Expect `readDragonEffects().impulse` and `.quake` unchanged. Control first, with `[]`: both rise
    by at least 1 on the same instrument. The counters prove the guarded branches did or did not run; whether the
    push is felt is a play question, named as a BLIND SPOT in the header.

- [ ] **Step 5: Run, expect GREEN** (unit):
  `npx vitest run src/game/bossWard.test.js src/world/bossSystem.ward.test.jsx tests/gates/boss-tier-gates.test.js tests/gates/boss-persistence-gates.test.js tests/gates/boss-persistence-hook-gates.test.jsx tests/gates/boss-tier-loop-gates.test.jsx tests/store/bossTierSave.test.js tests/i18n/i18n.test.js tests/i18n/key-resolution.test.js tests/i18n/adoption.test.js`.
  E2E T3, only when the load allows:
  `E2E_WORLD_TIMEOUT=240000 npx playwright test tests/e2e/relight-shrine.spec.js -g "strip"`. Expected: PASS, with
  each control showing its effect and each warded case at 0.

- [ ] **Step 6: Mutants**, each RED:
  - **U3-M1** cap removed (`min(3, n)` gone): the 4-shrine value is 420;
  - **U3-M2** positional `shrinesLit` (`bossTierStats(tier, shrinesLit = 0)`): the `.map` test;
  - **U3-M3** hydrate ignores the ward: the 560 hydrate test;
  - **U3-M4** delete the invariant effect: `bossSystem.ward` (700 at spawn);
  - **U3-M5** memo not keyed on `shrinesLit`: `bossSystem.ward` (max stays 700);
  - **U3-M6** swap `summon` and `quake` in `DRAGON_TRICKS`: the order test;
  - **U3-M7** `BossEntity` ignores `off.has('summon')`: e2e T3, through `scripts/dev/mutate-e2e.sh` with an identity
    mutant;
  - **U3-M8** the lava site ignores `off.has('quake')` (`:364`): e2e T3 at the broken-block count;
  - **U3-M9** the roar ignores `off.has('knockback')` at the impulse (`:329`): e2e T3c at `impulse`;
  - **U3-M10** the roar ignores `off.has('quake')` (`:341`): e2e T3c at `quake`;
  - **U3-M11** delete the `bossLoadedAt` re-seed: `bossSystem.ward` "a mid-session load re-seeds the fight" (560);
  - **U3-M12** the phase-3 alert ignores the tricks: `bossSystem.ward` "the phase alert names only the tricks left";
  - **U3-M0** identity: GREEN.

  Still unproven, and said so in the T3 header: the "Pushed back!" toast guard at `:337` (no instrument reads it).

- [ ] **Step 7: Commit:**
  `git commit -m "feat(boss): each lit shrine strips 10% of the Shadow Dragon's HP and one trick (summon, quake, knockback), up to 3; health never exceeds max (index +N B)"`

### U4: Hold the light: the rules (M4)

**Files:**
- Modify: `frontend/src/game/frontier.js` (event constants, `canStartShrineEvent`, `createShrineEvent`)
- Create: `frontend/src/game/shrineEvent.js` (imported **only** by the lazy runtime)
- Test: `frontend/src/game/shrineEvent.test.js` (create); extend `frontend/src/game/frontier.test.js`

**Interfaces:**
- Produces:

```js
// frontier.js
export const SHRINE_EVENT = Object.freeze({ durationMs: 45000, startRadius: 9, defendRadius: 12, graceMs: 3000,
  waveAt: Object.freeze([0, 0.44]), spawnRing: Object.freeze([16, 20]), prefetchRadius: 40 });
export function canStartShrineEvent(state, site) // -> { ok: true } | { ok: false, reason: 'capture'|'lit'|'dragonAwake'|'busy'|'dead'|'far' }
export function createShrineEvent(site, now, { durationMs = SHRINE_EVENT.durationMs } = {})
//   -> { id, key, x, z, tier: zoneTier(x, z), startedAt: now, durationMs, outsideSince: null, wavesSent: 0, pending: [] }
// shrineEvent.js
export function shrineWaves(tier)                     // -> [string[], string[]], each wave length <= 4
export function waveSpawnPoints(key, waveIndex, n)    // -> [{ x, z }] deterministic, 16..20 m from centre
export function stepShrineEvent(ev, { now, playerX, playerZ, alive, room })
//   -> { ev, spawns: [{ type, x, z }], outcome: null|'lit'|'failed', reason?: 'left'|'fell', cue?: 'wave'|'outside'|'inside' }
//   cue 'wave' rides the step that PLACES wave 2's first mob, never a step where all of it is carried
export function pickRoomToFree(entities, { cap, need, x, z, minDist = 40 })
//   -> entity[] to retire: living, !isStatic, !isAggro, !shrineEventKey, !dyingUntil, >= minDist from (x, z);
//      passives first, then farthest first; exactly max(0, living + need - cap) of them when that many qualify
export const SHRINE_WAVES_VERSION = 'shrine-waves-v1'
//   the runtime writes it into the live event (`waves: SHRINE_WAVES_VERSION`), so it is USED in the lazy chunk:
//   knip sees an importer, and Rollup cannot tree-shake the literal the U5 Step 6 receipt greps for
```

- The wave table is pinned here and replaced by move 10 behind the same signature:
  - tier 0: `[['zombie','zombie','skitterling'], ['zombie','skeleton','duskhound','skitterling']]`;
  - tier 1: `[['zombie','emberhusk','skitterling'], ['emberhusk','skeleton','duskhound','spider']]`;
  - tier 2 and up: `[['emberhusk','emberhusk','duskhound'], ['moss_brute','emberhusk','skeleton','duskhound']]`.
- All are hostile `MOB_TYPES` keys (`mobTypes.js:9-20`).

- [ ] **Step 1: Write the failing tests** (`shrineEvent.test.js`, with a `Mutation-Proof:` header):
  - `inside for the whole duration lights the shrine` (step at 0, 250, ... 45000; the outcome at 45000 is `'lit'`);
  - `wave 1 at start, wave 2 at 44%` (`spawns` lengths 3 then 4 at tier 0, with `cue: 'wave'` on the second);
  - `grace: 2.9 s outside then back in does not fail` and `3.0 s outside fails with reason 'left'`;
  - `a fallen player fails the event` (`alive: false` gives `failed`, reason `'fell'`, at any time);
  - `room 0 carries the wave and later room places it` (`pending` length 3, then 0 with `room: 3`);
  - `the wave cue waits for a placed mob` (room 0 at 44%: no `cue: 'wave'`; the first later step with `room: 2`
    carries it);
  - `pickRoomToFree`: with `living = cap = 16` (4 static NPCs, 2 aggro hostiles 10 m out, 1 event-tagged mob, and
    9 ambient non-aggro mobs, 2 of them inside 40 m and 3 of the rest passive), plus 1 dissolving corpse, and
    `need: 5`, it returns exactly 5: the 3 passives, then the 2 farthest others, and never a static, aggro,
    event-tagged, dissolving or under-40 m mob. With `need` already fitting it returns `[]`. With `need: 8` it
    returns the 7 candidates and no more;
  - `room never exceeded` (property: over 200 random `room` sequences, `spawns.length <= max(0, room)` at every step);
  - `completion inside grace still lights`;
  - `spawn points are deterministic, 16-20 m out, and distinct`;
  - `waves only use hostile MOB_TYPES and never exceed 4` (walk tiers 0..4: the denominator is 5 tiers, and the test
    asserts that);
  - `the reducer never mutates its input` (use a frozen `ev`).
- Also add to `frontier.test.js`: `canStartShrineEvent` returns each reason from a minimal state (`isCaptureMode`
  injected through `state.isCaptureMode`, `litShrines` containing the key, `bossActive: true`, `shrineEvent` set,
  `isAlive: false`, and the player 10 m away), and `ok` otherwise.

- [ ] **Step 2: Run, expect RED.**
  `npx vitest run src/game/shrineEvent.test.js src/game/frontier.test.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** both modules as pure functions with no store, React or Three. `waveSpawnPoints` uses an
  imul hash of `(key, waveIndex)` in the style of `landmarks.js:9-14` (never `Math.random`).

- [ ] **Step 4: Run, expect GREEN** (same command).

- [ ] **Step 5: Mutants**, each RED:
  - **U4-M1** fail at the first tick outside (no grace): the grace test;
  - **U4-M2** ignore `alive`: the fallen test;
  - **U4-M3** spawn the whole wave regardless of `room`: the room property;
  - **U4-M4** wave 2 at 0.5: the 44% test;
  - **U4-M5** fail check placed after success: the "fallen at 45000" case;
  - **U4-M6** `canStart` drops `dragonAwake`: the frontier test;
  - **U4-M7** `pickRoomToFree` drops the `isStatic` filter: its test (an NPC is picked);
  - **U4-M8** `pickRoomToFree` drops the `isAggro` filter: its test;
  - **U4-M9** the wave cue fires at 44% regardless of placement: "the wave cue waits for a placed mob";
  - **U4-M0** identity: GREEN.

- [ ] **Step 6: Commit:** `git commit -m "feat(game): the hold-the-light reducer — 45 s, 12 m ring, 3 s grace, two waves within the mob cap (lazy chunk; index +N B)"`

### U5: Hold the light: in play (M5)

**Files:**
- Create: `frontend/src/input/interact.js`, `frontend/src/input/interact.test.js`
- Create: `frontend/src/world/shrineEventLoader.js`, `frontend/src/world/shrineEventRuntime.jsx`,
  `frontend/src/world/shrineEventRuntime.test.jsx`
- Create: `frontend/src/world/ShrineEventMounts.jsx`, `frontend/src/world/ShrineProximity.jsx`,
  `frontend/src/ui/InteractPrompt.jsx`
- Modify: `frontend/src/InputManager.jsx:172-216` (the input rule applies; keep the `event.code === 'KeyG'` line)
- Modify: `frontend/src/systems/SpawnerSystem.jsx:149-155` (use `mobCapAt`; skip placement while
  `store.shrineEvent`). The `tags` 5th parameter already exists from U3.
- Create: `frontend/src/systems/SpawnerSystem.light.test.jsx` (the pause case here; U6 adds the sanctuary case)
- Modify: `frontend/src/game/dayNight.js` (`mobCapAt(isDay, nightCount, x, z)`)
- Modify: `frontend/src/App.jsx`: mount `<ShrineProximity/>`, `<ShrineEventHudMount/>` and `<InteractPrompt/>`; add
  `shrineEvent: e.shrineEventKey || null` to `readMobs` at `:335-338`
- Modify: `frontend/src/world/Terrain.jsx:1117` (mount `<ShrineEventRingMount/>` beside `<FarBeacon />`)
- Modify: `frontend/src/i18n/strings.js`
- E2E: `frontend/tests/e2e/relight-shrine.spec.js`, tests T1, T2 and T4

**Interfaces:**
- Consumes `SHRINE_EVENT`, `canStartShrineEvent`, `createShrineEvent`, `stepShrineEvent`, `shrineWaves`,
  `dragonTricksOff` and the store fields.
- Produces:
  - `interactTarget(state) -> { kind: 'npc', mob } | { kind: 'chest' } | { kind: 'shrine', site } | null`. The
    priority is a villager within 4 m (as at `InputManager.jsx:174-189`), then `state.checkNearbyChest?.()`, then
    `nearestLandmark(px, pz, 1, isLit)` within `startRadius`.
  - `runInteract(state) -> kind | null`. It returns null unless `getInput().active && state.isAlive`.
  - `loadShrineRuntime() -> Promise<module>` (memoised) and `prefetchShrineRuntime()`.
  - `beginShrineEvent(site)` (runtime).
  - `mobCapAt(...) -> number`, the single derivation `SpawnerSystem` and the runtime both use.
  - DEV hook `readMobCap() -> number` (`mobCapAt` at the player), registered by `ShrineProximity`.
  - Consumes U3's `spawnMob(x, z, type, explicitY, tags)` and U4's `pickRoomToFree`.

- [ ] **Step 1: Write the failing e2e first** (it cannot run until the end of this unit):
  - **T1 "holding the light at a shrine lights it, saves it, and the dragon arrives weaker".**
    1. Setup: `startPlayActive`. Teleport through `playerRigidBodyRef.current.setTranslation({ x: 40, y: 90, z: -96 })`.
       Wait for `getGeneratedChunks().has('2_-7')`, then call `settlePlayerToGround({ force: true })`. Call
       `__craftyTest.call('setShrineEventDuration', 12000)`.
    2. Presence: `litShrines` is `[]` and `shrineEvent` is null.
    2b. Setup, built on purpose: the starved state real play has. Wait up to 15 s for living `readMobs` entries to
       reach `readMobCap()`. If they have not, top up through `useGameStore.getState().spawnMob` with a passive type,
       50-70 m from the shrine. Then assert `living >= readMobCap()` as a SETUP precondition, so the test cannot
       inherit a transient with free slots (the teleport culls the mobs left behind, and the refill is only 3 a
       second).
    3. Subject: press the **real** key, `page.keyboard.press('KeyG')`. `shrineEvent.key === '2_-7'` within 3 s, and
       at least 1 `readMobs` entry with `shrineEvent === '2_-7'` within 4 s, and the living count never above the
       cap at any 250 ms sample during the event.
    4. Setup again: heal each second (`healPlayer`), because the subject is the ring and not survival.
    5. `litShrines` equals `['2_-7']` within 20 s, and `shrineEvent` is null.
    6. Flush the autosave through its real path, because a debounced wait cannot work here: in active play the 1 s
       `gameTime` trigger resets the 5 s debounce every second (`autosave.js:7`, `App.jsx:281`), so no debounced
       save ever fires. In `page.evaluate`, override `document.visibilityState` to `'hidden'`
       (`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })`), dispatch
       `visibilitychange` (which calls `autosave.flush()`, `App.jsx:291`; `input/blurReset.js` also clears held
       intents, harmless here), then `delete document.visibilityState` and dispatch it again. Read the blob as
       `save-load.spec.js:31-34` does: `game_state.litShrines` contains `'2_-7'`. Assert `readIntents().active` is
       true again before step 7.
    7. `grantXP` to level 5 or more, teleport to `blightHeartSite()`, wait for `bossActive`, and expect
       `bossHealth === 630`.
  - **T2 control "leaving the ring fails the event and changes nothing".** Same start, and the real `KeyG`. Once
    `shrineEvent` is set, move the player out by a fixed teleport to `(40, y, -124)`, 20 m south of the centre, then
    `settlePlayerToGround({ force: true })` and stay there. Set every input the test reads: a camera-relative key
    would depend on the inherited yaw (S with the camera facing away from the shrine walks the player from 8 m out
    through the centre and leaves them inside the ring), and under Phase 1's combat stance an engaged retreat is
    capped at 2.0 m/s, so 2 s of S moves about 4 m. `shrineEvent` is null
    within 6 s and `litShrines` is `[]`. The dragon arrives at 700.
  - **T4 touch** (a separate `test.describe`, using `test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true })`
    and the `enterTouchPlay` pattern from `touch-controls.spec.js:7-22`). Same teleport. Expect
    `getByTestId('touch-interact')` visible, with its `aria-label` equal to the store-locale `t('interact.shrine')`.
    Do a real `.tap()`. `shrineEvent.key === '2_-7'`.
  - Each assertion message names its preconditions (`active`, `isAlive`, `shrineEvent`, distance to the shrine), per
    gates-and-probes rule 4e.

- [ ] **Step 2: Write the failing unit tests.**
  - `interact.test.js`:
    - `npc outranks chest outranks shrine`;
    - `chest outranks shrine; shrine follows` (a state with both a chest and a shrine in range; after the chest is
      gone, the shrine);
    - `a lit shrine is not a target`;
    - `runInteract is inert when input is dead or the player is dead`;
    - `dragonAwake refuses with a notification and never loads the runtime` (spy the loader);
    - `a double G before the chunk resolves begins exactly one event`.
  - `shrineEventRuntime.test.jsx` (fake timers, a real store, a spy `spawnMob` that returns true):
    - `begin -> wave spawns tagged with the key and isAggro`;
    - `inside to the end -> lightShrine, trick notification, event mobs dissolved without rewards` (`dyingUntil` set,
      no `emitMobKill`);
    - `outside past grace -> failed, litShrines unchanged`;
    - `a world load cancels a live event and stops its driver` (call `loadWorldData(fresh)`, advance 2 s, and expect
      no further `spawnMob` calls);
    - `capture mode stops the driver`;
    - `room respects mobCapAt` (seed 15 living aggro hostiles by day at tier 0, none of them retirable: cap 16 gives
      room 1, so 1 spawn);
    - `a full cap is made room for` (seed `living = cap = 16`: the 4 static NPCs plus 12 ambient non-aggro mobs at
      50-80 m from the shrine; begin, and expect wave 1 to place 3 tagged mobs, the living count never above 16, and
      the retired mobs to carry `dyingUntil` with no `emitMobKill`).
  - `SpawnerSystem.light.test.jsx` (with a `Mutation-Proof:` header), modelled on
    `tests/gates/capture-guard-timing-gates.test.jsx:113-140`, but capturing the `useFrame` callback instead of
    no-oping it and calling it on a stubbed `performance.now` 1 s apart. `useThree` gives a camera at the shrine
    centre; `getGeneratedChunks` returns the chunks within 6 of `2_-7`; ground at 64; `Math.random` is seeded:
    - control: with no event, 20 ticks spawn at least 1 ambient mob;
    - `the ambient pause reaches the spawner`: with `shrineEvent` set, 20 ticks spawn 0 ambient mobs.
  - Add `mobCapAt` cases in `src/game/dayNight.test.js`, matching `siegeParams` for day and night.

- [ ] **Step 3: Run, expect RED.**
  `npx vitest run src/input/interact.test.js src/world/shrineEventRuntime.test.jsx src/systems/SpawnerSystem.light.test.jsx src/game/dayNight.test.js`.
  Expected: FAIL (modules missing).

- [ ] **Step 4: Implement.**
  - `interact.js`: move the G body from `InputManager.jsx:173-215` into `runInteract`, unchanged for NPCs and chests,
    except that the `guide` line becomes `t('npc.guide.relight' | 'npc.guide.blight', { who })` (blight once 3 are
    lit). `InputManager` keeps `if (event.code === 'KeyG' && active && !anyPanelOpen) { event.preventDefault(); runInteract(state); return; }`.
  - Shrine branch: `canStartShrineEvent`. On refusal it notifies (only `dragonAwake` has copy). Otherwise
    `loadShrineRuntime().then((m) => m.beginShrineEvent(site)).catch(() => notify(t('notice.shrineLoadFailed')))`,
    behind a module `starting` latch.
  - Runtime: `beginShrineEvent` first makes room: `need` is the total of `shrineWaves(tier)`, and every entity
    `pickRoomToFree(mobsQuery.entities, { cap: mobCapAt(...), need, x, z })` names is retired by the same no-reward
    dissolve the success purge uses (one shared helper). It then sets the store event with
    `waves: SHRINE_WAVES_VERSION` and notifies `shrine.start`. It then starts a 250 ms `setInterval`. Inside each callback, the first checks are `isCaptureMode()` and
    `getState().shrineEvent?.id !== ev.id`, and either one stops the interval. The callback then computes
    `room = mobCapAt(...) - living`, steps the reducer on `worldNow()`, and spawns with tags. It handles each cue: wave
    gives `shrine.wave`; outside and inside flip `ev.outsideSince`, which the ring and bar read.
    - On `lit`: `lightShrine`. Notify `shrine.lit`, then `shrine.trick.<DRAGON_TRICKS[n-1]>` when n ≤ 3, then
      `shrine.wardFull` at n = 3. When not in capture, fire `triggerBloomSpike(450)` and `window.playFanfare?.()`.
      Purge: every `mobsQuery` entity whose `shrineEventKey === key` and whose `health > 0` gets `health = 0` and
      `dyingUntil = performance.now() + DEATH_DISSOLVE_MS`. That is the dissolve path without the reward path at
      `CombatSystem.jsx:150-158`. Then `setShrineEvent(null)` and stop.
    - On `failed`: notify `shrine.failed`, `setShrineEvent(null)` and stop.
  - `ShrineEventRing` (R3F): a mesh at `(x, groundY + 0.05, z)`; `useFrame` reads `getState().playerPosition`, and the
    material colour is set only when the inside/outside state flips (`#FFB347` / `#E5484D`).
  - `ShrineEventHud` (DOM, `top-24` centre, width 280): rAF writes
    `bar.style.transform = scaleX(elapsed / duration)` and the `{s}` text through refs. The outside countdown shows
    while `outsideSince` is set.
  - `ShrineEventMounts`: subscribe `(s) => s.shrineEvent?.id ?? null` (one change per start or end), and render
    `React.lazy(() => loadShrineRuntime().then((m) => ({ default: m.ShrineEventRing })))` (and `ShrineEventHud`)
    inside `<Suspense fallback={null}>`.
  - `ShrineProximity`: an interval of 250 ms. Each tick computes `interactTarget` and calls `setInteractHint` only if
    the `kind:key` string changed. When an unlit shrine lies within `prefetchRadius`, it calls
    `prefetchShrineRuntime()`. Under DEV, `registerTestHook('setShrineEventDuration', ...)` sets the override that the
    G path passes to `createShrineEvent`, and `registerTestHook('readMobCap', ...)` returns `mobCapAt` at the player.
  - `InteractPrompt`: subscribe `interactHint`.
    - On desktop (`!isTouchUIMode()`), render the non-interactive "Press G to light the shrine" only for `shrine`,
      placed under ChestIndicator's spot (`marginTop: 120`).
    - On touch, render
      `<button data-touch-btn data-testid="touch-interact" aria-label={label} onPointerUp={() => runInteract(useGameStore.getState())}>`
      for any kind, at least 48 px tall and 160 px wide, centred at `bottom: 30%`, clear of the joystick (left) and
      the action button (`right: 26px; bottom: 11%`, `TouchControls.jsx:190-192`). `data-touch-btn` makes
      TouchControls' `ownsTouch` leave the tap alone (`TouchControls.jsx:72`).
  - Strings, en and zh-CN:

| key | en | zh-CN |
|---|---|---|
| `interact.shrine` | Light the shrine | 点亮神龛 |
| `interact.shrineKey` | Press G to light the shrine | 按 G 点亮神龛 |
| `interact.chest` | Open chest | 打开宝箱 |
| `interact.npc` | Talk to {name} | 与{name}交谈 |
| `shrine.start` | Hold the light! Stay inside the ring until the flame takes. | 守住光！留在光圈里，直到火焰燃起。 |
| `shrine.wave` | The Blight answers. More are coming! | 凋敝之力回应了，更多敌人来了！ |
| `shrine.hold` | Hold the light | 守住光 |
| `shrine.timer` | {s}s | {s} 秒 |
| `shrine.outside` | Back into the ring! {s}s | 回到光圈里！{s} 秒 |
| `shrine.lit` | The shrine burns ember-gold. The Blight Heart weakens. | 神龛燃起金色余烬。凋敝之心被削弱了。 |
| `shrine.failed` | The flame went out. Come back and try again. | 火焰熄灭了。回来再试一次。 |
| `shrine.dragonAwake` | The dragon is awake. The shrine will not answer until it falls. | 巨龙已经苏醒。在它倒下之前，神龛不会回应。 |
| `shrine.trick.summon` | The Shadow Dragon can no longer call its Skeleton Cohort. | 暗影巨龙再也召唤不出骷髅卫队了。 |
| `shrine.trick.quake` | The Shadow Dragon can no longer break the ground under you. | 暗影巨龙再也无法震碎你脚下的地面了。 |
| `shrine.trick.knockback` | The Shadow Dragon's roar can no longer throw you back. | 暗影巨龙的咆哮再也无法把你击退了。 |
| `shrine.wardFull` | Three shrines burn. The dragon is as weak as the light can make it. | 三座神龛已燃起。光能削弱巨龙的，都已做到。 |
| `notice.shrineLoadFailed` | The shrine could not wake. Check your connection, or reload if the game just updated. | 神龛没能唤醒。请检查网络；如果游戏刚更新，请刷新页面。 |
| `npc.guide.relight` | {who}: light the frontier shrines. Each one we reclaim weakens the Shadow Dragon. | {who}：去点亮边境神龛。每夺回一座，暗影巨龙就弱一分。 |
| `npc.guide.blight` | {who}: three shrines burn. Now the Blight Heart: follow the violet light. | {who}：三座神龛已燃起。现在去凋敝之心，跟着紫色的光走。 |

- [ ] **Step 5: Run, expect GREEN** (unit and the existing input suite):
  `npx vitest run src/input/interact.test.js src/world/shrineEventRuntime.test.jsx src/systems/SpawnerSystem.light.test.jsx src/game/dayNight.test.js tests/game/keyMap.test.js tests/gates/combat-keybind-gates.test.js tests/gates/input-abstraction-gates.test.js tests/gates/touch-wiring-gates.test.js tests/gates/touch-purity-gates.test.js tests/i18n tests/gates/siege-gates.test.js`.
  E2E T1, T2 and T4 when the load allows:
  `E2E_WORLD_TIMEOUT=240000 npx playwright test tests/e2e/relight-shrine.spec.js`. Expected: 5/5 PASS with T3 and
  T3c.

- [ ] **Step 6: Lazy-chunk receipt.** Run `npm run build`, then `ls build/assets | grep -i shrineEventRuntime`
  (expect one chunk).
  - Function names are mangled and `vite.config.js:36` sets `sourcemap: false`, so a name grep proves nothing.
    Instead, give `shrineEvent.js` one unique, unmangleable literal: the frozen wave-table tag
    `'shrine-waves-v1'`, exported as `SHRINE_WAVES_VERSION`. It must be **used** in the chunk, not merely exported:
    an export nothing reads is tree-shaken by Rollup (so the grep would find no file and read as "absent
    everywhere") and flagged by knip. `beginShrineEvent` writes it into the live event (`waves:`), which is that use.
  - Expect `grep -l "shrine-waves-v1" build/assets/*.js` to name ONLY the `shrineEventRuntime-*` chunk. That is the
    presence and absence check in one instrument.
  - Then `node scripts/ci/bundle-budget.mjs` (expect PASS). Record both sizes in the commit message.

- [ ] **Step 7: Mutants**, each RED:
  - **U5-M1** `runInteract` drops the liveness gate: the "inert when dead" test;
  - **U5-M2** shrine checked before chest: the "chest outranks shrine" test;
  - **U5-M3** the driver skips the `shrineEvent?.id` check: the "world load cancels" test;
  - **U5-M4** purge grants rewards (calls the kill path): the "without rewards" test;
  - **U5-M5** the ambient pause stops working: `ambientSpawnPaused(state) -> !!state.shrineEvent` (a pure export of
    `systems/spawnPlacement.js`, which `SpawnerSystem.jsx` calls before `runSpawnPlacement`) is mutated to return
    `false`, and its case in `src/systems/spawnPlacement.test.js` goes red;
  - **U5-M5b** the `ambientSpawnPaused` call is deleted from `SpawnerSystem.jsx`: `SpawnerSystem.light.test.jsx`
    "the ambient pause reaches the spawner" goes red. This closes the call-site blind spot the predicate's unit
    test cannot see (gates-and-probes rule 4c);
  - **U5-M9** `beginShrineEvent` skips the room reservation: the runtime's "a full cap is made room for" and e2e T1
    at "at least 1 event mob within 4 s" (T1's census is built at the cap in step 2b);
  - **U5-M6** the G branch deleted from `InputManager`: e2e T1 red at "shrineEvent within 3 s";
  - **U5-M7** `lightShrine` call deleted from the runtime: e2e T1 red at litShrines;
  - **U5-M8** remove `data-touch-btn` from the pill: e2e T4 red (the touch router eats the tap).

  The e2e mutants run through `scripts/dev/mutate-e2e.sh` with an identity mutant. A `SETUP:` failure scores as COULD
  NOT CHECK, never as a kill.

- [ ] **Step 8: Push U2-U5 together** after the gates pass and a green e2e receipt exists (the `e2e freshness` row in
  `.agent/AGENTS.md`). Commit:
  `git commit -m "feat(shrines): hold the light — G or the touch pill starts a 45 s defence; lighting strips the dragon (index +N B, lazy shrineEventRuntime +M B)"`

### U6: The light it leaves (M6)

**Files:**
- Create: `frontend/src/render/LitShrineBeams.jsx` (its pure layout and objective logic are tested in `src/game/frontier.test.js`)
- Modify: `frontend/src/world/shrineShape.js` (export `landmarkTop`)
- Modify: `frontend/src/world/Terrain.jsx:476, :484` (`landmarkTop` and `<ShrineCrystalGlow cx cz top/>` under the same
  `!isCaptureMode() &&`), `:519` (pass `cx` and `cz`), `:1117` (mount `<LitShrineBeams/>`), and FarBeacon's `skip`
  and `GUIDE_CHUNKS`
- Modify: `frontend/src/game/frontier.js` (`LIT_SANCTUARY_RADIUS = 48`, `insideLitSanctuary`, `litShrineLights`,
  `litBeamLayout`, `pickObjective`; all pure, so `LitShrineBeams.jsx` and `HUD.jsx` stay thin)
- Modify: `frontend/src/systems/spawnPlacement.js` (`blocked` option) and `SpawnerSystem.jsx` (pass it)
- Modify: `frontend/src/HUD.jsx:231-243` (the objective) and `:386` (the compass skip). `GUIDE_CHUNKS` comes in by a
  **separate** import statement: `shrine-marker-gates.test.js:15` requires HUD.jsx to keep exactly
  `import { nearestLandmark } from './world/shrines.js'`, and a merged `{ nearestLandmark, GUIDE_CHUNKS }` import turns
  that gate red.
- Modify: `frontend/src/ui/RadialMinimap.jsx:46`
- Modify: `frontend/src/QuestSystem.jsx:280-282` (delete the `shrineReached` write: after this unit nothing reads it)
- Modify: `frontend/src/i18n/strings.js`
- Test: `frontend/src/systems/spawnPlacement.test.js` (extend); `frontend/src/systems/SpawnerSystem.light.test.jsx`
  (extend with the sanctuary case); extend `frontier.test.js`; extend e2e T1

**Interfaces:**
- Consumes `litShrines`, `shrineSiteAt`, `GUIDE_CHUNKS` and `nearestLandmark(..., skip)`.
- Produces:
  - `landmarkTop(baseY) -> number`;
  - `litBeamLayout(litShrines, { max = 16 }) -> [{ key, x, z, base, coreY, haloY }]`, with
    `base = landmarkTop(baseY) + 4`, `coreY = base + CORE_H / 2` and `haloY = base + HALO_H / 2` (`CORE_H = 160`,
    `HALO_H = 150`, exported). The component uses `coreY` and `haloY` as instance translations, because
    `cylinderGeometry` is centred on its origin;
  - `insideLitSanctuary(x, z, litShrines, r = LIT_SANCTUARY_RADIUS) -> boolean` (48; edge exclusive: `dist < r`);
  - `pickObjective({ litCount, unlitShrine, blight }) -> { kind: 'shrine', key, x, z, labelKey: 'hud.objectiveLightShrine', n }
    | { kind: 'blight', x, z, labelKey: 'hud.objectiveBlightHeart' }`. It returns `shrine` while
    `litCount < SHRINE_WARD_MAX` and an unlit shrine was found; otherwise `blight`. The HUD does the scans and passes
    the results in, so `nearestLandmark(` and `blightHeartSite(` stay in the tracker block for
    `objective-tracker-gates.test.js:23-31`;
  - `litShrineLights(litShrines) -> [{ x, y, z, level: 15 }]` (the move-12 seam);
  - `runSpawnPlacement({ ..., blocked })`;
  - DEV hook `readLitBeams() -> number` (the core `InstancedMesh.count`).

- [ ] **Step 1: Write the failing tests.**
  - `litBeamLayout` (in `frontier.test.js`):
    - one lit key gives one entry at x 40, z -104, `base = landmarkTop(baseY) + 4`;
    - `the column starts above the glow`: `coreY - CORE_H / 2 === base`, `haloY - HALO_H / 2 === base`, and
      `base >= landmarkTop(baseY) + 2.3` (the top of the glow cube), so no part of either column reaches the plinth
      or the ground;
    - non-shrine keys are skipped;
    - the result is capped at `max`;
    - it is deterministic.
  - `insideLitSanctuary`:
    - true at 47.9 m, false at exactly 48.0 m and false at 48.1 m from the (40,-104) centre;
    - false with `[]`.
  - `litShrineLights` (the move-12 seam, pinned so its shape cannot drift before move 12 consumes it, and its only
    importer until then, which keeps knip green): `['2_-7']` gives one `{ x: 40, y, z: -104, level: 15 }`; non-shrine
    keys are skipped; `[]` gives `[]`.
  - `SpawnerSystem.light.test.jsx`, `the sanctuary reaches the spawner`: the same harness as U5's, camera at the
    shrine centre. Control with `litShrines: []`: 30 ticks place at least 1 ambient mob within 48 m of the centre.
    With `litShrines: ['2_-7']`: 30 ticks place 0 there, and at least 1 beyond it (the spawner still runs).
  - `runSpawnPlacement` with `blocked = () => true` places 0 and still stops at `maxAttempts`.
  - With `blocked` covering half the candidate chunks, every placed point satisfies `!blocked`, and at least one point
    is placed (the presence control).
  - Extend e2e T1: before G, `readLitBeams()` returns 0, which proves the component is mounted. After lit, it returns
    1.
  - `pickObjective` (in `frontier.test.js`):
    - with `litCount: 2` and the unlit shrine `-2_21` it gives `{ kind: 'shrine', key: '-2_21', n: 2 }`;
    - with `litCount: 3` it gives `kind: 'blight'` even when an unlit shrine is passed;
    - with `litCount: 0` and `unlitShrine: null` (out of range) it gives `kind: 'blight'`.

- [ ] **Step 2: Run, expect RED.**
  `npx vitest run src/game/frontier.test.js src/systems/spawnPlacement.test.js src/systems/SpawnerSystem.light.test.jsx`.

- [ ] **Step 3: Implement.**
  - `ShrineCrystalGlow` subscribes `(s) => s.litShrines.includes(key)` (boolean; rare change). Lit, it renders
    today's `Emissive` with `#FFB347` / 6.0. Unlit, it renders a plain 2.6 m box with `meshBasicMaterial` in
    `#8FA3B8`, which ignores scene light, so its brightness cannot cross the bloom threshold at noon.
  - `LitShrineBeams` places each instance at `(x, coreY, z)` and `(x, haloY, z)` from `litBeamLayout`, never at
    `base` (that is FarBeacon's centred convention, and it would sink half the column through the plinth).
  - `LitShrineBeams`:
    - Return null in capture. Otherwise subscribe `litShrines` and run `useMemo(litBeamLayout)`.
    - Two `instancedMesh` from the FarBeacon geometry shapes (core: `cylinderGeometry args={[3, 2, 160, 12, 1, true]}`;
      halo: `[7, 5, 150, 12, 1, true]`).
    - `meshBasicMaterial` with `toneMapped={false}`, `fog={false}`, `transparent`, `depthWrite={false}`,
      `side={DoubleSide}` and `blending={AdditiveBlending}`. The core colour is `new Color('#FFB347').multiplyScalar(2.0)`
      at opacity 0.6; the halo is `#FF8A2A` at opacity 0.12.
    - Matrices are set in a `useLayoutEffect` keyed on the layout, then `instanceMatrix.needsUpdate = true`,
      `frustumCulled = false`.
    - The pool: an `instancedMesh` of `circleGeometry(9, 32)` lying flat, with an `alphaMap` from a 64x64 radial
      `DataTexture` built once at module scope. It is additive at opacity 0.35 and mounts only when
      `qualityTier !== 'low'`.
  - Guides:
    - FarBeacon, HUD compass and minimap pass `(k) => litSet.has(k)` from a transient
      `getState().litShrines` read, plus `GUIDE_CHUNKS`.
    - ObjectiveTracker replaces its `!state.shrineReached` branch with
      `pickObjective({ litCount: state.litShrines.length, unlitShrine: <cached nearestLandmark(..., GUIDE_CHUNKS, isLit)>, blight: blightHeartSite() })`.
      It renders `t(o.labelKey, { n: o.n })` in cyan for a shrine and violet for the Blight Heart (today's colours,
      `HUD.jsx:238-242`).
    - The literal `nearestLandmark(` stays in each block, after its capture guard.
  - `SpawnerSystem`: `blocked: (x, z) => insideLitSanctuary(x, z, store.litShrines)`.
  - `frontier.js`: `litShrineLights` derives `y` from `litBeamLayout`'s `base` (the light sits where the beam starts).
  - Strings: `hud.objectiveLightShrine` is "Light a frontier shrine ({n}/3)" in en and "点亮边境神龛（{n}/3）" in
    zh-CN.

- [ ] **Step 4: Run, expect GREEN.** Run the Step 2 command, plus
  `tests/gates/landmarks-gates.test.js tests/gates/objective-tracker-gates.test.js tests/gates/shrine-marker-gates.test.js tests/gates/radial-minimap-gates.test.js tests/gates/spawn-legibility-gates.test.js tests/gates/home-anchor-gates.test.js tests/gates/capture-glow-gates.test.jsx tests/i18n`,
  and `npx vitest run` over the whole suite once.

- [ ] **Step 5: Mutants**, each RED:
  - **U6-M1** `litBeamLayout` ignores `shrineSiteAt`: the skip test;
  - **U6-M2a** `<` changed to `<=` at the sanctuary edge: the 48.0 m case;
  - **U6-M2b** radius 49: the 48.1 m case;
  - **U6-M2c** radius back to 24: `the sanctuary reaches the spawner` (spawns land 28-48 m from the centre);
  - **U6-M3** `runSpawnPlacement` ignores `blocked`: the all-blocked test;
  - **U6-M3b** the `blocked:` option deleted from the `SpawnerSystem` call: `the sanctuary reaches the spawner`;
  - **U6-M6** `litBeamLayout` returns `coreY = base` (FarBeacon's centred convention): `the column starts above the
    glow`. The component reading `base` instead of `coreY` is not unit-reachable; U7's `shrine-lit` frame shows it
    (the column would pierce the plinth), and U7 Step 3 names that check;
  - **U6-M7** delete `litShrineLights`' `shrineSiteAt` filter: its skip case;
  - **U6-M4** `pickObjective` switches at the first lit shrine (`litCount < 1`, the old `shrineReached` semantics):
    the 2-lit case;
  - **U6-M5** `LitShrineBeams` not mounted: e2e T1 red at `readLitBeams` (the hook is absent, so the presence check
    names a dead instrument);
  - **U6-M0** identity: GREEN.

- [ ] **Step 6: Capture check.** In capture `litShrines` is `[]`, and `ShrineCrystalGlow` and `LitShrineBeams` are
  capture-null, so no frame should move. Run `npm run test:visual` when the load allows. Any frame that moves is a
  defect to explain, not a re-shoot to bundle.

- [ ] **Step 7: Commit:**
  `git commit -m "feat(shrines): the light it leaves — unlit crystals dim, lit ones burn ember-gold with a beam seen from the Hearth; no spawns within 48 m; guides lead to the next unlit shrine (+2 draws lit, +1 pool med/high; index +N B)"`

### U7: Lived proof on a real GPU, and the gates (acceptance)

**Files:**
- Modify (once Phase 0d's `feat/instruments` is merged): `frontend/scripts/visual/_lookbook.mjs` (`LOOKBOOK_PLACES`)
  and `frontend/src/render/lookbookSeam.js` (a prod-reachable `light(keys)` and `startShrineEvent(key)` behind
  `?lookbook=1`)
- Test: that branch's `_lookbook` unit test, extended for the new places

- [ ] **Step 1:** Add the places (positions measured against the census above) and their seam steps.
  - `shrine-lit`, camera `[58, 92, -80]` looking at `[40, 80, -104]`. The seam lights `2_-7`.
  - `hearth-beams`: the hearth pose `[13, 81, 13]` turned toward `[60, 90, -90]`. The seam lights `2_-7` and `6_-5`.
  - `shrine-event`: the `shrine-lit` pose with an event started on `6_-5`, shot 3 s in, with the ring and bar visible.
  - The existing `before-*` frames stay the comparison. Write the place-list test red-first: the plan length rises by
    3 places x 4 cycles x 3 targets.
- [ ] **Step 2:** Run `npm run build && node scripts/visual/lookbook.mjs --out <scratch>/relight --targets chromium-1280x800,webkit-1180x820,webkit-820x1180`.
  Expected: exit 0; `lookbook.json` shows `chromiumCandidates` resolved to ANGLE-Metal; every new shot is `valid`.
- [ ] **Step 3: Open every new frame by eye** (the contact sheet `index.html`) and write what is seen into the U7
  commit message:
  - at night (0.75) the lit beams read gold against the night sky from the Hearth, and the unlit crystal does not
    bloom;
  - at noon (0.25) the beam does not wash out the sky, and the unlit crystal (now unlit by scene light, so this is
    the case its material choice was made for) does not bloom;
  - at `shrine-lit` the column starts above the glow cube and does not pass through the plinth;
  - in WebKit iPad portrait the ring and bar sit clear of the touch controls, and the beam renders, with no navy or
    black artefact (the low tier has no pool by design).
- [ ] **Step 4: Heat.** Read `drawCalls` from the Diagnostics readout (Phase 0d) at `hearth-beams` with 0, 1 and 2
  shrines lit. Expect +0, +2 and +2 on low, and +0, +3 and +3 on med and high. Offer Kevin the `power-ab.sh` A/B; it is
  optional.
- [ ] **Step 5: Full gates** from `<repo>/frontend`:
  `npm run lint && node scripts/ci/gate-shape.mjs && node scripts/ci/killability-ledger.mjs && npm run test:unit && npm run build && node scripts/ci/bundle-budget.mjs && node scripts/ci/doc-currency.mjs && npm run knip`.
  `knip` is CI-only in the pipeline, so it is run here by hand: it is the gate that would catch `litShrineLights` or
  `SHRINE_WAVES_VERSION` left exported with no importer, and finding that only after the push is a red CI.
  Expected: all green; `bundle-budget` reports `index` under 760,000. Then sweep with
  `sh scripts/dev/kill-test-procs.sh`.
- [ ] **Step 6: Review.** Run a fresh headless `/code-review xhigh` over the U1..U6 range. Add one
  `adversarial-reviewer-kz` stage at **xhigh** (Crafty's standing rule, `.agent/AGENTS.md` Method) on two runtime
  seams: the lazy runtime driver's lifetime against `loadWorldData` and capture, and the touch pill against
  `TouchControls`' touch router.

---

## Acceptance

1. **Lived, real input** (`tests/e2e/relight-shrine.spec.js`, 5 tests, through `mutate-e2e.sh` with an identity
   mutant). These tests turn red if the feature is deleted:
   - deleting the G branch or the runtime turns T1 red at "event within 3 s";
   - deleting the room reservation turns T1 red at "event mob within 4 s", from a census built at the cap;
   - deleting `lightShrine` turns T1 red at `litShrines`;
   - deleting the `litShrines` serialisation turns T1 red at the blob, read after a real `visibilitychange` flush.
     Deleting only the `App.jsx` trigger line does **not** turn T1 red (the flush saves on the `gameTime` trigger
     anyway); `save-consolidation-gates` and `save-slot-ownership-gates` carry that line;
   - deleting the ward turns T1 red at 630, where the control T2 reads 700 on the same instrument;
   - deleting the summon strip turns T3 red at the dragon-tagged skeleton count, and deleting the lava quake guard
     turns it red at the broken-block count, each against its own control;
   - deleting the roar's knockback or quake guard turns T3c red at `readDragonEffects`, against its own control. The
     counters prove the branch ran, not how far the player flew, and the "Pushed back!" toast guard has no
     instrument;
   - deleting the pill or its `data-touch-btn` turns T4 red;
   - deleting the beams turns T1 red at `readLitBeams`.

   Below the e2e, deleting the ambient pause or the sanctuary's `blocked:` at the `SpawnerSystem` call site turns
   `SpawnerSystem.light.test.jsx` red.

   **What would still pass if the feature were deleted:** the lookbook runs and every unit test of an untouched
   module. That is why the e2e carries the claim.
2. **Looks:** the U7 lookbook frames, Chromium ANGLE-Metal plus WebKit at 1180x820 and 820x1180, are opened by eye
   with what is seen written down. The 31 capture frames are the regression oracle only. They are expected to move
   only for U1's minimap blip, and that move lands in its own `Baseline-Review:` commit.
3. **Heat:** the draw-call delta measured matches the Design (+2 or +3 lit, +1 during an event, 0 when none is lit).
   No light count change, no shadow caster, no post change.
4. **Bytes:** `bundle-budget.mjs` is green, and each commit records the measured `index` delta. The total is expected
   at about +9.3 KB main plus one lazy chunk of about 5.9 KB.
5. **i18n:** 30 new keys, with en and zh-CN both present (`tests/i18n/i18n.test.js`) and keys resolving
   (`key-resolution.test.js`). The adoption ratchet does not rise; it should fall by the BossHealthBar subtitles and
   the two `bossSystem` phase alerts.
6. **Touch:** the starting verb is a tap on `touch-interact` (T4), and holding the light is the joystick: no new
   gesture.
7. **Saves:** an old profile loads with no shrines lit and its dragon at full tier HP, at the store (U2 and U3's
   hydrate tests) **and** in the live fight's hook (U3 `a mid-session load re-seeds the fight`). A new world resets
   the set.

## Risks

- **Moves 10 and 13 land in between.** `shrineWaves` and `dragonTricksOff` are the seams. If move 13 rebuilds
  `BossEntity` first, U3's guarded sites and their `readDragonEffects` counters are re-applied to its attacks, and
  T3's dragon-tagged count is re-pointed to whatever summon 13 keeps.
- **The touch-hold lane** rewrites `TouchControls.jsx`. This plan deliberately does not edit it. The pill relies only
  on `ownsTouch` honouring `data-touch-btn` (`TouchControls.jsx:72`), and T4 proves that after their merge.
- **Phase 1's bloom threshold.** If the beam does not bloom after the threshold moves above 1.0, raise the core
  multiplier, never the threshold. This is checked in U7 Step 3.
- **Cheese.** A player can pillar up inside the ring, because the ring is horizontal distance only. That is
  acceptable for a young player's game and recorded rather than fixed.
- **Fog-free beams and the 500 m far plane** (`GameScene.jsx:241`; the 400 at `:216` is the shadow camera). From the
  Hearth the third shrine's beam is about 345 m away horizontally; even its top (about y 270) is about 390 m from a
  camera at the Hearth, so the whole column renders. A beam more than about 500 m from the camera is clipped until
  the player is closer. This is stated in the lookbook notes.
- **The first lit glow may compile a program.** With nothing lit, no shrine renders the lit `Emissive` material any
  more, so the first lighting in a session can be the first use of that program, and of the unlit
  `meshBasicMaterial` box at load. The bloom spike and fanfare play at that moment and would mask a one-frame hitch,
  so U7's `shrine-lit` run names a hitch if one is seen rather than assuming there is none.
- **The cap reservation retires visible mobs.** The mobs `pickRoomToFree` retires are 40 m or more from the shrine,
  farthest first, and leave by the death dissolve, so most of them are out of easy view, but some can be seen to
  vanish. That is accepted as the price of keeping the event inside today's cap.
- **The autosave is unload-only during active play** (pre-existing, found by this plan's review; see Current state).
  This plan does not fix it and does not rely on the debounce. It matters most on iPad Safari, where unload events
  are unreliable. It needs its own ledger row and owner.
- **A loaded machine.** The e2e and the visual runs wait for `uptime`. A local SETUP failure on load is a precondition
  failure, never a pass or a kill.
- **Gate fragility.** `landmarks-gates.test.js:13` slices 2,600 stripped characters from `function Landmark`, and
  `objective-tracker-gates.test.js:17` slices 2,200 from the tracker. The U1 and U6 edits must keep the anchors inside
  those windows (they are run in the GREEN steps). If one must move, update the gate with a `Mutation-Proof:` trailer;
  never pad the source. `shrine-marker-gates.test.js:15` wants HUD.jsx's shrines import in exactly the form
  `import { nearestLandmark } from './world/shrines.js'`, so `GUIDE_CHUNKS` arrives by its own import statement (U6).

## Out of scope

- Dungeon sites, altar chests and guardians, and the authored 6-beat quest spine with a dialogue Modal (roadmap
  move 14's other halves). These are separate plans; the umbrella's Phase 3 line names only the shrines.
- i18n of existing quest titles and lore, of the compass `SHRINE (Nm)` label (`HUD.jsx:395`), of BossEntity's
  per-attack toasts (the dragon move prunes those), and of ChestIndicator's "Press G" on touch. The two
  `bossSystem` phase-change alerts are **in** scope (U3), because they name tricks the ward removes.
- Fixing the autosave's debounce starvation (a max-wait, or keeping `gameTime` out of the debounce reset). It is
  pre-existing and gets its own row; this plan only stops depending on it.
- Making the light repel hostiles. The sanctuary stops spawns within 48 m; it does not de-aggro or turn back a mob
  that walks in.
- Block light from lit shrines (move 12 reads `litShrineLights`). Point lights of any kind. The ember cache, which is
  rejected (soft death).
- A press-and-hold start gesture: a tap starts the event, and the hold is the defence.
- Lit shrines as fast-travel waystones (the upside's BET).
- A new quest of type `light_shrine`. Pike's NPC line and the objective carry the promise without new English-only
  quest text.

## Open questions (none blocking; routine calls made here, FYI to Kevin)

- The numbers are 10% HP per shrine, a cap of 3, 45 s, a 12 m ring and a 3 s grace. They come from the roadmap where
  it named them; the ring and grace are chosen here. Kevin may want the dragon weaker for a young player.
- The trick order (Skeleton Cohort, then ground-breaking, then knockback) is chosen here so that each phase keeps its
  core attack.
- XP and loot are unchanged by the ward (decided: lighting is rewarded, not taxed).
- Starting an event is refused while the dragon is awake (decided: no mid-fight max-HP change). An alternative is
  proportional rescaling with the phase preserved.

---

## Self-review (done)

- **Spec coverage:**
  - hold-the-light events: U4 and U5;
  - the ember-gold beam and a permanent light source: U6 (beam, crystal, pool, sanctuary, the move-12 seam);
  - `shrinesLit` strips HP and one trick, up to 3: U3;
  - save compatibility: U2 and U3;
  - i18n: U3, U5 and U6;
  - touch: U5 (T4);
  - game-loop isolation: Global Constraints and each implementation step;
  - bytes and GPU: Design and per-commit;
  - a lazy chunk: U5 Step 6;
  - a baseline re-shoot only as its own commit: U1 Step 7 and U6 Step 6.
- **Type consistency:**
  - `litShrines` (array of `"cx_cz"`) is used everywhere; `shrinesLit` exists only as the derived count argument;
  - `nearestLandmark(x, z, maxChunks, skip)` is the U1 signature and is used unchanged in U5 and U6;
  - `SHRINE_EVENT.startRadius` (9) is used by `interactTarget`, and `defendRadius` (12) by the reducer and the ring;
  - `spawnMob`'s `tags` argument is introduced once, in U3, and reused by U5.

---

## Review amendments (2026-10-27)

An adversarial review (verdict: REFUTE IN PART) raised 15 findings. Each one was treated as a hypothesis and checked
again against the code on `main` before the plan was changed. **15 applied, 0 rejected**; finding 12 is applied with
one part of its reasoning corrected. Re-run here: the landmark census (the review's Repro A), against
`frontend/src/world/landmarks.js` and `climate.js`. It gives 28 landmarks and 7 shrines within 24 chunks, the
sky-arch `2_-6` at 97 m, the shrines `2_-7` at 111 m and `6_-5` at 126 m, and `-10_-9` as a drowned type 0
(surfaceY 9), which matches the Current state section. **Not re-run:** Repro B (the live cap census and the autosave
probe in Playwright) and Repro C (knip after U6, which cannot run before U6 exists). So findings 1 and 6 rest on
reading the code, not on a live measurement.

| # | Sev | Finding | Re-verified against | Disposition |
|---|---|---|---|---|
| 1 | HIGH | The hold-the-light waves can starve: `room = cap - living` is 0 in steady state | `ecs/world.js:7` (`mobsQuery` is `with('isMob', ...)`), `npcSpawn.js:24-26` (NPCs are `isMob`, `isStatic`), `SpawnerSystem.jsx:149-158` (top-up every 1 s), `:194` (NPCs never culled), `dayNight.js:90` | **Applied.** Design M4/M5, Current state "The cap is normally full", Review Focus 6. U4 adds the pure `pickRoomToFree` (tests and mutants U4-M7/M8). U5 retires distant non-aggro ambient mobs at event start so `living + need <= cap`, with the runtime test `a full cap is made room for` and mutant U5-M9. T1 step 2b builds the at-cap census on purpose through a new `readMobCap` hook. The wave notice now waits for a placed mob (U4-M9). PLAUSIBLE rather than CONFIRMED, because the live census was not re-run |
| 2 | HIGH | T1 step 6 cannot pass: the debounced autosave never fires during active play | `autosave.js:7`, `App.jsx:236, :281, :288, :291-292`, `useDayNightClock.js:23-29`, `dayNight.js:76-77`, `useGameStore.jsx:1215-1218` | **Applied.** T1 step 6 now flushes through a real `visibilitychange` and asserts input is active again. Acceptance 1 now says the trigger line is carried by the two save gates, not by T1, and U2-M5 says so too. The starvation itself is pre-existing and is **out of scope** here; it is written into Current state, Risks and Out of scope as needing its own row and owner |
| 3 | MED | The hook's HP clamp only goes down and seeds once at mount, so a mid-session load keeps the warded HP | `bossSystem.js:19-33` (lazy initialisers), `:202-204` (mirror), `App.jsx:169` (one mount), `MenuSystem.jsx:199`, `WorldManager.jsx:82`, the precedent `useGameStore.jsx:1163` and `QuestSystem.jsx:173-195` | **Applied.** U3 adds a `bossLoadedAt` tick and a re-seed effect, the test `a mid-session load re-seeds the fight` and mutant U3-M11. Acceptance 7 and Review Focus 2 now name the hook-level test. The bug also exists without the ward; the ward makes it visible |
| 4 | MED | Ground-breaking and the roar's throw have no gate that reaches `BossEntity` | the plan's U3 mutant list; `BossEntity.jsx:329, :337, :341, :364` | **Applied.** Added DEV `readDragonEffects` counters inside the guarded branches. T3 now runs at 2 lit and checks the lava quake through broken `worldBlocks`, and the new T3c at 3 lit checks the roar's impulse and quake counters, each with a same-instrument control. New mutants U3-M8/M9/M10. Acceptance 1 is narrowed: the counters prove the branch ran, not the size of the push, and the "Pushed back!" toast guard is named as having no instrument |
| 5 | MED | The T2 control depends on camera yaw and on Phase 1's 2 m/s retreat cap | relight T2 text; combat-stance plan "retreat cap" (2.0 m/s); `ai.worker.js:198` | **Applied.** T2 leaves the ring by a fixed teleport 20 m out instead of a camera-relative key. Review Focus 7 states the stance arithmetic: about 6 s to walk 12 m when engaged, the grace still fails them, and knockback is not the only way out |
| 6 | MED | `litShrineLights` is an unused export, and `SHRINE_WAVES_VERSION` could be tree-shaken and flagged by knip | `.knip.json` (entries, `ignoreExportsUsedInFile`), the plan's U6 tests, U5 Step 6 | **Applied.** `litShrineLights` gets tests in `frontier.test.js` (its only importer until move 12), plus mutant U6-M7. `SHRINE_WAVES_VERSION` is written into the live event, so it is used in the chunk. `npm run knip` is added to U7 Step 5. PLAUSIBLE: knip itself was not run |
| 7 | MED | A 24 m sanctuary sits inside the 28 m spawn floor, so standing at a lit shrine changes nothing, and the call site is ungated | `spawnPlacement.js:28` (band measured from the player), `capture-guard-timing-gates.test.jsx:113-140` (SpawnerSystem renders in jsdom) | **Applied.** The radius is now 48 m, and the Goal and M6 now say what it does (spawns pushed to 48-85 m) and what it does not (the light does not repel hostiles). The new `SpawnerSystem.light.test.jsx` drives the captured `useFrame` callback and gates both the `blocked:` call site (U6-M3b, U6-M2c) and the ambient-pause call site (U5-M5b). That second gate also closes the BLIND SPOT the old U5-M5 stated |
| 8 | LOW | The phase-change alerts still promise the stripped tricks | `bossSystem.js:120-122` | **Applied.** U3 routes them through `dragonTricksOff` and `t()`, with 4 new keys (en byte-identical when unwarded, plus zh-CN), test `the phase alert names only the tricks left` and mutant U3-M12. The key count rises from 26 to 30 |
| 9 | LOW | "The camera far plane is 400 (`GameScene.jsx:216`)" is false | `GameScene.jsx:207-216` (`shadowConfig.camera.far: 400`), `:238-241` (main camera `far: 500`) | **Applied.** Current state, M6 and Risks now cite `:241` and 500. The beam-visibility risk is recomputed: the third shrine's whole column is within about 390 m of the Hearth camera |
| 10 | LOW | "About 6 bloom sources per shrine" is false, and the unlit crystal on a lit `meshStandardMaterial` may still bloom at noon | `Terrain.jsx:484` (one `Emissive`), `voxelKit.jsx:36`, `GameScene.jsx:121` (threshold 0.65) | **Applied.** The count is corrected to one per shrine. The unlit crystal is now a `meshBasicMaterial` box, with fixed luminance of about 0.35, and U7 Step 3 adds a noon check |
| 11 | LOW | A merged `{ nearestLandmark, GUIDE_CHUNKS }` import turns `shrine-marker-gates` red | `shrine-marker-gates.test.js:15`, `HUD.jsx:4` | **Applied.** U6 Files requires a separate import statement, and Gate fragility names the regex |
| 12 | LOW | The beam geometry is under-specified: base about 8 m above the crystal, and centred geometry would sink the column | `shrineShape.js:27, :46`, `Terrain.jsx:476, :484, :586, :599` | **Applied, with one part corrected.** Centring is real. `litBeamLayout` now returns `base`, `coreY = base + 80` and `haloY = base + 75`, with the test `the column starts above the glow` and mutant U6-M6, and U7 Step 3 checks the `shrine-lit` frame. The "8 m above the crystal" part measures from the stone crystal in `shrineParts` (top about y 100). The light the player actually sees is the glow cube at `top + 1` (top about `top + 2.3`), and the base sits 1.7 m above that, so it was kept and is now described relative to the glow cube |
| 13 | LOW | The guarded `litShrines:` serialisation escapes the derived autosave gate | `save-slot-ownership-gates.test.js:194` (regex `(\w+):\s*state\.(\w+)`), `saveSchema.js:51-63` | **Applied.** U2 serialises `litShrines: state.litShrines` in the plain form, adds that gate to U2 Step 5, and U2-M5 now goes red in both save gates |
| 14 | LOW | "U1 can push alone" leaves out Phase 0e and the e2e receipt | `DECISIONS.md:44-46` (0e lands alone, BEFORE any look change), the `e2e freshness` gate | **Applied.** U1 Step 7 and the Units preamble make U1's push wait for 0e on `main` and for a green e2e receipt |
| 15 | LOW | T3's 9 m count around the boss is fragile: skeletons kite, the dragon moves at 7.0 | `bossConfig.js:19`, `BossEntity.jsx:145, :373-376`, `ai.worker.js:198` | **Applied, by a stronger instrument than the one suggested.** The summon now tags its skeletons `summonedBy: 'dragon'` (U3 introduces `spawnMob`'s `tags` and the `readMobs` field), and T3 counts the tag with no distance filter. That also rules out ambient skeletons, which a 40 m radius would have let in |
