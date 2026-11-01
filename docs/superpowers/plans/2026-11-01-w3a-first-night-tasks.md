# W3-A task script: the First Night (2026-11-01)

Brief: `2026-11-01-w3a-first-night-brief.md` (beside this file). ROOT = the repo root; APP = `frontend/`. Worktree `.claude/worktrees/w3a-first-night` (`feat/w3a-first-night`, from `eff58e9a`). Run npm and tests from APP. Every file:line below was read at `eff58e9a`; re-read it before editing.

**Every unit.**
- Write the gate, see it red, then build. Each new or changed assertion is killed by a mutant (restore from a `cp` backup) and recorded in a `Mutation-Proof:` trailer.
- Run `npm run build` and `node scripts/ci/bundle-budget.mjs`; put index bytes before and after in the commit body.
- No AI footer, no amend, no `--no-verify`. Edit `.js` and `.jsx` with Edit, never `sed`.
- A look unit attaches lookbook frames from before and after (`node scripts/visual/lookbook.mjs`, real GPU, `uptime` first, one run at a time). CI runs the e2e on the exact sha; run it locally only for a look question.

**Shared files: one builder at a time, in this order.**
- In flight: `fix/l13-stuck-in-solid` (`Components.jsx` spawn branch, `spawnPlacement.js`) and `fix/start-before-built-stall` (`App.jsx`, `tests/e2e/_fixtures.js`). Merge main after each lands, before touching those files.
- `useGameStore.jsx`, `eventBus.js`, `i18n.js`: U1, then later units only through U1's seams.
- `SoundManager.jsx`: U1, then W2-M Unit 2, then W2-M Unit 4.
- `App.jsx`: start-stall, D2, then W2-M Unit 2.
- `Components.jsx`: F6, B1, N6b, N8 (after L13), then W2-M Unit 4.
- `Terrain.jsx`: D2, H1, N7, then W2-M Unit 4.
- `SpawnerSystem.jsx`: B1 (two lines), N2, N3. `AIWorkerSystem.jsx`: U1, then N5. `talk.js`: D2.

**Budget.** Index is 647,757 B (`build/assets/index-e98mbsFM.js`, worktree build of `eff58e9a`, 2026-10-31) against 652,500 B (`bundle-budget.mjs:46`). The unit shares below sum to about 5.1 KB; W3-A nets at most 3,000 B, so C0 frees 2,500 B or more before PR C's index units land. Everything else goes in the lazy `night` chunk (`src/night/`). The ceiling is never raised (`:30-31`). A unit over its share moves code into the night chunk.

## Order, and three PRs

PR A and PR B touch no siege code and land first, each on its own `ci ok`. PR C builds a playable night before the encounter table, so the first lived night (J1) is judged before the bulk is built.

```
PR A (render only):  F0 -> F1 -> F2 -> F3 -> F4 -> F5
PR B (small fixes):  D1   V1   I1   U2   F6   B2        (each independent)
PR C (the night):    U0 (+ C0 beside, + U0b after start-stall)
                     -> U1 -> L1, N4 -> N5 -> N6a -> V2 -> U3 -> B1 -> R1 -> J1
                     -> N1 -> N2 -> N3 -> D2 -> H1 -> D3 -> L2 -> L3 -> N6b -> N7 -> N8 -> S1 -> E1 -> N9 -> Z
W2-M (own PR):       after PR C's U1 and S1, in the shared-file order above
```

U0b gates only beat (a) and D2; nothing else waits for it. L2, L3 and N2's ward ship in one release (block 16).

## U0. The play-through instrument, red (first)

**Gate.** A new `tests/e2e/first-night.spec.js` with eight tests, each 120 s or less, real input, a presence control. Beat (a) runs on a fresh profile; (b)-(h) run on the returning profile, where a save without `hearthLit` reads lit, so D2 does not move them. Run on HEAD and record each red, with its reason, in the commit body.

| Beat | Asserts | Red on HEAD because |
|---|---|---|
| (a) kindle | no brazier light at Start; real G (Chromium) or the Talk tap (WebKit) lights it | `Terrain.jsx:271-276` always lights it |
| (b) horn | from 10 units before dusk: one horn, the wedge within 2 degrees, wave 1 closing 10 m on the Hearth in 20 s | no siege; `compassLayout.js:39` drops a marker that is behind |
| (c) beast | real R on a full bar: camera 3 m or more behind from 1.2 s to `roarSec`, back at the eye within 1 s; `playerPosition` stays within 1 m of the body | the view returns at 1.2 s (`transformCam.js:16`); `PositionTracker.jsx:16-18` copies the camera |
| (d) regen | flat to 4.0 s of calm, then 5 HP/s or more; a hit at 3 s restarts the clock | nothing regenerates health (the `healPlayer` callers are the spell, items, the healer and the perf probe); only mana does (`GameSystems.jsx:76-85`) |
| (e) captain | his kill brings `isDay` within 6 s, the reward once, the payoff in order, and no sky cut during the rush | no captain; `skyClock.js:42-43` cuts a gap over 5 units, and the rush steps 60 a tick (the scratch probe measured 4 cuts in 4 ticks) |
| (f) respawn | a death 40 m from a lantern rises within 3 m of it; with none, at the Hearth | no block 16 (`blockIds.js` ends at 15); the spawn stands at x 0, z 0 (`Components.jsx:1079-1091`) |
| (g) ward | lantern placed, player 40 m away: 200 natural attempts give 0 hostiles within 16 m; mined, some appear | no lantern |
| (h) lend | night 1, roar unlocked, bar at 40 when wave 3 is placed: the bar reads 100 and the line shows; on night 2, no lend | no wave 3 |

**Also.** `scripts/visual/first-night.mjs` plays a local `npm run build` preview, or `--url`, from a fresh profile in real time on real input, aiming by pointer deltas from the seam's read-only mob list. It writes a beat log, the pressure numbers (lowest health, hits taken, seconds engaged, the flame's low), an eye-level clip with the captain-kill frame as the hero shot (W3-G's README hero), and a contact sheet beside `docs/superpowers/masterpiece-2026-10/evidence/eye-level/`. It exits non-zero when a beat misses or pressure leaves its band (brief, acceptance 2). `render/lookbookSeam.js` gains a read-only `night()`; a `lookbook-seam.spec.js` case goes red first. **Files:** the spec, the script, `lookbookSeam.js`, its spec. **Index:** 0 (the seam is lazy, `bundle-budget.mjs:42-43`).

## C0. Room in index (beside U0)

**Gate.** A one-off `npx rollup-plugin-visualizer@7.1.1` treemap ranks index modules. Move 2,500 B or more of code that nothing needs before the world is built into its own lazy imports, the way lane L6 cut rather than raised (DECISIONS 2026-10-31 item 279). It never uses the night chunk, which U1 creates, and never moves anything on the iOS `enterPlay` cold-start path. Red first: one bundle-budget marker per moved module, held absent from index; moving one back turns it red. **Files:** the import sites; markers in `bundle-budget.mjs`, never its ceilings. **Index:** -2,500 B or better.

## U0b. Harness profiles (after start-stall lands)

First-minute D11, pulled forward. `tests/e2e/_fixtures.js` seeds a returning profile by default (`crafty_onboarded`, as `_lookbookPage.mjs:54` does); a `fresh` fixture opts out; scripts take a profile through `scripts/visual/_profile.mjs`. Red first: a unit test of the seeding table; a no-seed mutant turns `day-night-cycle.spec.js` red once D2 lands. **Index:** 0.

## U1. Seams on the shared files (one commit per file group)

**Store** (`useGameStore.jsx`, `saveSchema.js`): `hearthLit`, persisted (a save without it reads true; only an eligible fresh profile starts false). Not persisted: `lastNightfall {night, gameTime}` (written only by `setGameTime`'s crossing, `:901-925`; nulled by `loadWorldData`), `siege`, `dawnRush` and `startDawnRush()`, `hearthFlame` (quarter steps), `lastHurtAt` on the world clock (stamped in `damagePlayer` beside `lastHitDir`, `:1027-1034`), and a `lanterns` index kept by place, mine and load. **Bus:** `nightfall` and `dawn` at the crossing, `windupStart`, `siegeWave`, `siegeBroken`; `emitMobKill` (`mobKillBus.js:15`) gains the entity as its fourth argument; the `windupStart` emit sits beside the growl (`AIWorkerSystem.jsx:110-117`). `SoundManager.jsx` gains `registerVoices`; `i18n.js` gains `mergeStrings`, which merges en and zh-CN. The `src/night/index.js` loader is imported once the world is built, and a marker keeps it out of index.

**Red first.** `lastNightfall` stays null through a night-save load, `setTimeOfDay(0.75)` and a direct `nightCount` write, and a 1-unit tick across the boundary sets it. A frozen world holds `lastHurtAt`. The lantern index survives place, mine and load (a mutant that skips the rebuild on load goes red). `siege`, `dawnRush` and `hearthFlame` are absent from the saved keys. The marker check is red until the stub exists. **Check:** unit, plus `the-cut.spec.js` and `save-load.spec.js` in CI. **Index:** at most 900 B.

**As built (phase 2a, DECISIONS 2026-11-01 (W3-A PR C) items 496-498).** The chunk's root is `src/night/night.js`, not `index.js`: a lazy `index.js` names its chunk `index-<hash>.js`, which the bundle budget cannot tell from the boot chunk. `installNight()` there merges the night's strings and registers its voices, from two tables that are empty until D2, R1, D3 and S1 fill them. `mergeStrings` lives in `night/nightStrings.js`, in the night chunk (its only caller). There is no `hearthFlame` setter until H1 calls one, because `store-setters-called` bars a setter nothing uses. U1 measured +1,803 B against this share; recomputed on measured numbers after round 2 (item 535), the boot chunk still has room for every later index unit's share, so no room is taken now. **The night's lines** live in `night/nightStrings.js` `NIGHT_STRINGS` (item 533), and `tests/i18n/key-resolution.test.js` merges that table before it resolves any `t()` call, so a key there resolves and is checked like any other. **For R1:** its landing probe (`tests/e2e/_firstNightAwaits.js` `LANDED.R1`) reads `STRINGS.en` from `i18n/strings.js`, but R1's line goes in `NIGHT_STRINGS`, which only the running game merges, so R1 points the probe at `src/night/nightStrings.js`'s `NIGHT_STRINGS.en['notice.hearthLends']` in its landing commit.

## L1. Lights, pure

`game/lights.js`: `litLights(state)` (the Hearth when lit with its flame above 0, the lanterns, and a `shrines` input W3-B fills from `litShrines`), `isWarded(x, z, lights, R = 16)`, `nearestLit(x, z, lights)`, `objectiveFor(player, lights, 32)`. Red first: 15.9 m is warded and 16.1 m is not; two lights ward their union; an unlit or doused Hearth wards nothing; with no lights, the objective is the player. Mutant: compare against `R`, not `R*R`. **Index:** 0.3 KB.

**As built (item 499).** No game code imports it yet, so `.knip.json` leaves it out of production knip's project. The first of D2, N2 and N8 to import it deletes that line, and `tests/scripts/knip-production-exclusions.test.js` fails until it does. The Hearth's position is `world/homeAnchor.js` `HEARTH_BRAZIER`; D2 points Terrain's brazier group at it and drops its `@internal`.

## N4. The siege director, pure

`night/siegeDirector.js` (Move C): waves at 0, 180 and 380 of the night's 600 units; size `min(10, base[k] + floor(n*growth[k]))`, night 1 fixed at [2, 2, 3] with its captain at 1.6x; eight land-scored bearings, none within 90 degrees of another, seeded by `nightCount` so a reload picks the same one (score the generator's height if the main thread can reach it; otherwise score streamed chunks and record that a reload may move the bearing); horn clearance by dissolve; the captain first in wave 3's queue; a mob stuck under 1.5 m in 6 s sidesteps, then hunts. Red first: a cumulative test seeded with a carried population at the 480 s day (`dayNight.js:24`) places every member within the cap for n = 1..12, z = 0..4 (a no-clearance mutant starves n = 1); a level-2 beast's swings over 14 s kill the night-1 captain with 4 s or more to spare (pure, from `solveMeleeDamage`, `resolveFormMelee` and the swing cadence), or night 1's captain scale comes down. **Index:** 0.

**As built (item 520).** `src/night/siegeDirector.js`. The main thread can reach the generator's height (`world/climate.js` `surfaceBlockAt`), so `landScoreFrom` scores the generated world and a reload keeps the bearing. Wave members are drawn by `MOB_TYPES` weight until N1's table replaces that pick. N5 imports the module and deletes its `.knip.json` production exclusion in the same commit (item 499's check fails until it does). **Round 2 (items 529-532):** `chooseBearings` judges every set of bearings at least 90 degrees apart whole (the most land bearings, then the most land) and returns sectors, `{ bearing, halfAngle, fallback }`: PI/6 on land, PI/3 with `fallback` set for a bearing with no land of its own, which happens only when no land pair exists; `planNight` carries them as `sectors`. A marcher within `ARRIVED_M` (3 m) of its objective holds there. The ember elites split between waves 2 and 3, wave 2 taking the odd one.

## N5. The siege runs, marches and is heard

`SiegeDirectorSystem` (night chunk) ticks at 1 Hz on the world clock and places waves through today's published `store.spawnMob(x, z, type)` with its own drain (3 per second at most, never above `siegeParams` `maxMobs`), so it runs before N2. The worker's non-aggro branch asks `idleGoal` (march, hunt, rout, camp); `routUntil > now` overrides aggro. The horn and the numbered notice fire on `nightfall`, never on the `isDay` edge (`DayNightAudio.jsx:21`, `survivalSystem.js:18-26`). Ambient spawning is off from the horn until the last wave is placed. Red first: a march gate through the `self` shim of `tests/gates/mob-charge-loop-gates.test.js`, then e2e (b). **Files:** `src/night/SiegeDirectorSystem.jsx`, `workers/ai.worker.js`, `game/mobStateSync.js`, `systems/AIWorkerSystem.jsx`, `ui/DayNightAudio.jsx`, `world/survivalSystem.js`. **Look:** a night clip of wave 1 cresting at its bearing; the torchline (one instanced emissive draw) is judged there, or cut. **Index:** 0.1 KB.

**Owed with N5: beat (b) counts only the wave the director placed** (W3-A PR C round 2, static review finding 1, PLAUSIBLE). The sector check (`tests/e2e/first-night.spec.js:436-438`) takes every hostile new since its baseline, anywhere in the world, and asks that 75 % of them sit within 30 degrees of the bearing. The ambient spawner refills up to 3 a second until the horn (`SpawnerSystem.jsx:119`, `:136-139`), and 70 % of day picks are hostile, so one ambient hostile beside night 1's wave of 2 reads 2 of 3, and a correct N5 fails. N5 makes the beat count wave members only, by wave identity (the ids the director placed, carried in `siege`) or within the siege's radius of the Hearth, and rewrites (b)'s recorded red to match; it never changes the game to fit the check (no ambient stop before the horn). The reviewer's repro, unrun (`zz-sector-noise.spec.js`, the new hostiles at the crossing over three runs: 4 or more in any run confirms it, 0 in all three refutes it), is copied whole below from the static review (the session scratchpad's `w3a-pr-c/round2-results.json`, which will be cleared); N5 runs it before the change.

**Beat (b)'s repro, copied whole** (the static review's "Repro for repro-verifier-kz (finding 1)"):

Use a `cp -c -R` copy of the worktree with `frontend/node_modules` symlinked, under the local-browser rules (1-minute load under 28, UTC hour not 18-20). Write `frontend/tests/e2e/zz-sector-noise.spec.js` through `<<'PROBE_END'` with this content:
```js
import { test } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';

test('sector noise before the horn', async ({ page }) => {
  test.setTimeout(150000);
  await bootDev(page);
  await startPlayActive(page);
  await page.waitForFunction(() => window.__craftyTest && window.__craftyTest.call('readMobs') && window.__threeCamera
    && window.GameMethods && window.GameMethods.damageMob, null, { timeout: 60000 });
  const before = await page.evaluate(() => window.__craftyTest.call('readMobs').filter((m) => m.health > 0).length);
  const cleared = await page.evaluate(() => {
    const cam = window.__threeCamera;
    let n = 0;
    for (const m of window.__craftyTest.call('readMobs')) {
      if (m.passive || !(m.health > 0) || Math.hypot(m.x - cam.position.x, m.z - cam.position.z) > 60) continue;
      window.GameMethods.damageMob(m.id, 99999, 'physical', 'ally');
      n += 1;
    }
    return n;
  });
  const seen = await page.evaluate(() => window.__craftyTest.call('readMobs').map((m) => m.id));
  await startPlayActive(page);
  await page.evaluate((t) => window.useGameStore.getState().setGameTime(t), HALF_CYCLE_UNITS - 10);
  await page.waitForFunction(() => window.useGameStore.getState().isDay === false, null, { timeout: 20000 });
  const fresh = await page.evaluate((s) => window.__craftyTest.call('readMobs')
    .filter((m) => !m.passive && m.health > 0 && !s.includes(m.id))
    .map((m) => ({ id: m.id, type: m.type, r: Math.round(Math.hypot(m.x, m.z)), deg: Math.round((Math.atan2(m.x, -m.z) * 180) / Math.PI) })), seen);
  console.log('SECTOR_NOISE ' + JSON.stringify({ liveBefore: before, cleared, newHostilesAtCrossing: fresh.length, fresh }));
});
```
From `frontend/` in the copy, run: `npx playwright test tests/e2e/zz-sector-noise.spec.js --workers=1 --repeat-each=3 --reporter=line`. It binds 4179; report the port and clean up afterwards.

**How to read it:**
- `newHostilesAtCrossing` of 4 or more in any run: finding 1 is CONFIRMED, even after the horn clearance's 3 retirements.
- 1 to 3: it depends on which mobs the clearance retires; still likely.
- 0 in all 3 runs: finding 1 is refuted.

**Also owed with N5** (phase 2a round 2, items 530, 531 and 533):
- **The widened sector, logged.** A sector whose `fallback` is set is searched at its `halfAngle` (PI/3) from the first try, and every member placed from it carries `fallback: true` in the placement record N5 keeps in `siege`. N2's spawn log (`logSpawn`, `source: 'siege'`) writes that flag when N2 lands, and U6's e2e reads the fallback ratio from it. This is the plan's "waves come from land, or from a widened sector, logged" (encounters-siege plan, Review Focus 2); the pure director only marks the sector.
- **The bearings the store shows.** `siege.bearings`, which U3's compass and beat (b) read as angles (`first-night.spec.js` reads `siege.bearings[0]`), is `plan.sectors.map((s) => s.bearing)`.
- **The march.** N5 feeds `marchStep` the objective from `lights.js` `objectiveFor`; an arrived marcher (within `ARRIVED_M`) holds on it, so H1 can count the marchers at the brazier.
- **Two arrival mutants survive** (phase 2a round 2, dynamic C5, LOW gate holes; the head behaves right in each). `arrive_lt` (`<` for `<=` at `ARRIVED_M`, `siegeDirector.js:187`) survives because the hold case tries 2.9 m and 3.1 m, never exactly 3.0 m, where the head holds. `arrive_first` (the arrival check moved above the hunt check) survives because no case brings a hunting marcher to its objective, where the head keeps hunting. N5 adds both cases to `siegeDirector.test.js` and sees each mutant red.
- **Its lines.** The horn's numbered notice goes in `NIGHT_STRINGS` (`night/nightStrings.js`), which `key-resolution` reads merged; it fires on `nightfall`, after the chunk has installed.
- **A flagged sector that finds no land** (phase 2a round 2, static F2, LOW). With land under one bearing only (say 180 degrees), every legal partner is 90 degrees or more away, so the widened sector (plus or minus 60 degrees) reaches no land and its search finds none. Nothing above says what N5 does then, and a Hearth on a spit could leave wave 2 unplaced until dawn. N5 states the rule (for example: the wave comes from the land bearing's own sector, logged as a fallback) with a red-first case on a lone-land `landScore` (3 at 180 degrees, 0 elsewhere; the reviewer's unrun probe calls `chooseBearings({ night: 5, seed, landScore })` for seeds 1 to 20 and expects every fallback bearing 90 degrees or more from the land). The fixer's sentence "the sea bearing chosen then is one whose widened sector reaches land" is true only as a preference, as item 530 and the `chooseBearings` docblock say.
- **The widened sector can share the land wave's side** (static F6, LOW). With land at 180 and 225 degrees only, the chooser takes 180 (plus or minus 30) and 270 widened (plus or minus 60), so both waves come from about 150 to 250 degrees, against the docblock's "two waves never come from one side". N5 writes that trade (a wave from the sea against two from one side) into its DECISIONS item, or keeps the widened sector off the land wave's side.

## N6a. The captain, the dawn rush, and the sky that follows it

On the kill bus the director matches `entity.id === siege.captainId` and breaks the siege synchronously, because a kill usually lands in a hitstop, which holds the world clock (`worldClock.js:59-64`), and starts the rush with U1's `store.startDawnRush()`. That call is the action's first caller: nothing calls it until N6a, and `store-setters-called` matches only `set*` names (`tests/_support/storeSetters.js:58`), so N6a's red-first hitstop break is the check that it is called (item 534). `useDayNightClock.js` steps 60 units a tick until the crossing. `render/skyClock.js` `followSkyClock(clock, t, dt, rate)` snaps only past two ticks of the current rate, and `render/Atmosphere.jsx:407` passes the rush rate while `dawnRush` is set (a `getState()` read). Red first: a hitstop break; the scratch probe as a unit test (60-unit ticks give 0 cuts at the rush rate, and 4 under the mutant that drops the rate); `setTimeOfDay` still cuts; then e2e (e). **Index:** 0.15 KB.

## V2. Regeneration on calm

`game/vitality.js` `isCalm(stance, lastHurtAt, now)`: the stance is not engaged (`combatStance.js:166`, `:275`) and 4 s or more of world time have passed since the last hit. `regenStep` adds 3 HP per 0.5 s, up to max, on a 2 Hz interval in `GameSystems.jsx` (the pattern of `:76-85`) that holds on `isWorldFrozenNow()`. The HUD health bar eases between steps, so the refill reads. Red first: no gain at 3.9 s and a gain at 4.1 s; a ranged hit at 3 s restarts the clock; a frozen world holds; a dead player gains nothing; then e2e (d). **Index:** 0.3 KB.

## U3. The siege and the Hearth on the compass

`markersNow` (`compassMarkers.js:28`) adds `siege:<n>` from `store.siege.bearings`, and a `hearth` marker while the Hearth is cold (D2's objective). `layoutCompass` pins a pinnable kind to the edge with a chevron instead of dropping it (`compassLayout.js:39`); `COMPASS_PRIORITY` ranks siege first. Red first: a bearing behind the player sits at the edge (unit), then e2e (b). **Files:** `ui/compassMarkers.js`, `ui/compassLayout.js`, `ui/Compass.jsx`. **Index:** 0.3 KB.

## B1. The beast held in third person, and the eye point

**The boom.** After the reveal's pull-back (envelope 0 to 0.30), a boom pose holds until `exitBeastForm`, then returns in 0.3 s. It follows the camera's own yaw and pitch, about 4.5 m back and 2.2 m up (`transformCam.js:20-22`), with no `lookAt`, and aims at `playerVisualAnchorRef`'s world point (`Components.jsx:1606-1611`): Rapier interpolates the body's Object3D (`@react-three/rapier` 2.2.0, `interpolate` defaults true, `Physics.d.ts:256`; `GameScene.jsx:454` sets none), while the first-person follow chases the stepped `translation()` with a 0.85 lerp a frame (`Components.jsx:1537`, `:1551-1566`). Damp by elapsed time. One ray a frame pulls the boom in at a wall; the hands hide; the avatar draws in full.

**The eye point.** `game/playerPoint.js` holds `steadyEye(body)` (`combat/swingOrigin.js:29`: the body's translation plus `EYE_HEIGHT_M`), written once a frame by the Player loop before the capture and pose returns. `PositionTracker.jsx:16-18`, `XPOrbSystem.jsx:22`, `LootSystem.jsx:41` and `SpawnerSystem.jsx:121-122` read it instead of `camera.position`. In first person it is the camera's point; the rest of A21 stays W3-D's. Re-shoot the lookbook hero set, since a posed hero shot now reports the body (`lookbookSeam.js:27-30`).

Red first: pure pose tests (yaw carried; pulled in at a wall; f = 0 is the identity); the eye point equals the camera in first person and stays at the body while held; then e2e (c) with real R on Chromium and the touch-hold sector in WebKit; one 120 Hz clip on the M3 Max shows the avatar steady in frame. The form timer reads the R3F clock (`Components.jsx:729`): if the hold reads it, move it to `worldNow`, and close W3-D's `ACTIVE_PLAN:owed:w3-d-row/a` only if those are the same lines. **Files:** `game/transformCam.js`, `game/playerPoint.js`, `Components.jsx` (`:723-781`, `:1536-1566`), the four readers. **Index:** 0.65 KB.

## R1. The Hearth lends the roar (night 1)

The director, on wave 3's placement, on night 1 only: when `unlockedTalents.wildheart_roar > 0`, the Hearth is lit with its flame above 0, and ember is under 100, it sets ember to 100 and shows "The Hearth lends you its fire. Hold R." (en and zh-CN). The existing roar path (`Components.jsx:732-733`, the touch sector by rank, `aspectWheel.js:46-53`) then works unchanged, and dawn empties the bar. The line goes in `NIGHT_STRINGS` (`night/nightStrings.js`), and the landing commit moves `LANDED.R1`'s probe there (U1's as-built note). This amends first-minute D7's lent roar, moving it from the prologue to the siege. Red first: the predicate's truth table (night, talent, flame, bar: 16 rows, counted); then e2e (h). **Index:** 0 (night chunk).

## J1. The first lived night (a judgement point, not a gate)

On a local prod build: one `first-night.mjs` night and one by hand, with the pressure numbers. A reviewer who did not build it judges the clip. The verdict and any retune (wave times and sizes, the captain's scale) go in DECISIONS before N1 builds the table.

## N1-N3. The encounter table, the spawn contract, the day groups

- **N1** `night/encounters.js` carries Move A's rows on the post-Cut roster (a Settler banks 0, `mobTypes.js:13`), tier scaling, elites (`ELITE_ALIVE_CAP` 4) and `pickEncounter({context, zoneTier, rng, passiveOnly})`. Red first: the tier-0 day hostile share sits in [0.55, 0.75]; no brute, pack or elite at tier 0 by day; the night 1-3 shares sit within 0.005 of `siegeParams`. **Index:** 0.
- **N2** `spawnMob(x, z, type, y, opts)` returns an id or null; `opts.source` is ambient, boot, siege, kindle, dungeon or shrine; one 3-per-second bucket covers them all; the ward refuses ambient and boot and admits siege and kindle; the kindle window spawns passives only; `runSpawnPlacement` counts `!= null`; N5's call moves onto the contract. `placeGroup`, `fitToCap`, `sectorAnchor` and a 64-entry `spawnLog` live in the night chunk. Red first, driven through the published `spawnMob`: the budget holds across two sources; a ward refuses ambient and admits siege; the cap is never exceeded. The source grep at `siege-gates.test.js:105-117` becomes a driven test. **Index:** at most 400 B.
- **N3** The boot ring (`SpawnerSystem.jsx:77-84`) and the ambient loop (`:119-167`) draw groups from the table. e2e on the spawn log: groups, and no tier-0 brute within 60 m of the Hearth; presence twin: a hostile group within 30 s; mutant: delete the table call. One eye-level session judges the stance walk clamp against groups (reset plan :475) and is recorded. **Index:** 0.1 KB.

## D2. The prologue: the cold Hearth and the kindle

**Eligibility:** cold only when first-minute D5's `prologueEligible` holds (no flag, no legacy `crafty_onboarded`, no perf probe); the write at `App.jsx:96-97` waits for the kindle. **Pike:** at Start, Old Pike's line (`npcSpawn.js:13`) says to light the Hearth, and U3's marker points at it. That line is needed before the night chunk can arrive (it is fetched once the world is built, and a failed fetch is retried only by the next `loadNight()`), and `t()` of a key not yet merged shows the key, so it goes in `i18n/strings.js`; the kindle's own lines, spoken after the awaited chunk, go in `NIGHT_STRINGS` (item 533). **The kindle:** G or Talk within 3 m of the brazier wins over a villager in `talkToNearest` (`talk.js:27-52`). That branch is in index and awaits the night chunk's promise, so a G pressed before the chunk loads kindles once it arrives and never opens a chest. `night/kindle.js` `kindleBeat` is an ordered `[name, fn]` list (the `bossEntrance.js` pattern): the notice, `hearthLit`, the brazier up, a 650 ms bloom swell, the voice, the Primal Roar gift (`talentPoints` + 1, spent on `wildheart_roar`, so a respec refunds a real point), the kindle group of 2 ember husks through the contract. **The brazier:** its `WorldPointLight` and `Emissive` stay mounted, and cold is intensity 0: mounting a light re-links every lit program (`lightPool.jsx:5-6`). **The healer:** heals only when `isCalm` (`talk.js:39-44`); otherwise a walk to it (about 12.8 m from the Hearth) refills a siege fight. Red first: the eligibility truth table (16 rows, counted); the beat's order and membership; a save without the field reads lit; an early G kindles once; a respec refunds the point; the healer refuses mid-fight; then e2e (a). **Files:** `src/night/kindle.js`, `input/talk.js`, `world/Terrain.jsx:257-285`, `App.jsx`, the night i18n table. **Closes:** `AUDIT:verbs:healer-unlimited-instant-heal`, unless T23's lanes close it first (check at start). **Look:** cold and lit frames at 0.30 and at midnight. **Index:** 0.2 KB.

## H1. The Hearth's flame (a BET)

`night/hearthFlame.js` `flameStep(flame, marchersNear, dt)`: the flame drains `FLAME_DRAIN` per marcher-second within 3 m of the brazier, at a night-1 rate where two marchers left on it douse it in about 30 s. The director ticks it at 1 Hz and writes the store in quarter steps and at 0 (6 writes a night at most). At 0 the Hearth leaves `litLights`, so there is no ward, lend or respawn there, and the dawn line reads "survived". G or Talk when calm relights it (D2's verb). The brazier's light and emissive scale with the quarter step, through one rare subscription. It is not saved, so a reload restores it. Red first: the pure step; an e2e where a scripted defence at the Hearth keeps the flame above 0 through night 1, and a 10x-drain mutant douses it. **Kept or cut** on two lived nights, one at `FLAME_DRAIN = 0`, judged by a reviewer who did not build it, in DECISIONS. **Index:** 0.1 KB.

## D3. Dawn's payoff

`night/dawnPayoff.js` `dawnPayoffBeat`, in order: the notice ("held" or "survived" from H1), a bloom swell through `BloomSpikeDriver`, the Hearth's flare, the outward rout, and a last line pointing at Mara's lantern. It fires on the bus's `dawn` at the crossing, never on the `isDay` edge. Red first: order and membership (unit); a load at dawn fires nothing; e2e (e) sees the swell. **Closes:** `OPEN_ITEMS:OI-35`. **Look:** a dawn clip. **Index:** 0.1 KB.

## L2, L3. The lantern

- **L2** Block id 16. `LAYER_TILING` derives from `BLOCK_NAME` plus a material field, `NUGGET_SHARES` from `ORE_TILES` (`proceduralTextures.js:52`, `:161`); its colour joins `BLOCK_COLORS` in `world/terrain.worker.js:677` (`blockIds.js:23-25`: three tables locked by `block-id-gates.test.js`; follow `voxel-mesher.md`). A flame emissive, a hotbar slot, i18n and an icon; a pool light is a bonus, since low tier has 2 (`lightPool.jsx:26`). Red first: the texture array's depth equals `TEXTURE_LAYER_COUNT`, and the diff shows no hand-table edit. **Closes:** `REVIEW:w2k:hand-kept-layer-tables`. **Look:** a night frame of a lantern-ringed outpost on low and high tier. **Index:** 0.3 KB.
- **L3** `forgeOffers` (`forge.js:82`) adds the lantern at 2 coal, 1 iron and 20 coins; short of that, the purchase is refused and nothing changes. Red first: unit, then e2e (g). If L2's frame shows the 16 m radius unreadable, a placement ring shows while a lantern is held. **Closes:** `MASTERPIECE:the-lantern-and-a-baked/a` (`/b` stays open). **Index:** 0.1 KB.

## N6b, N7, N8. Elites, walls, respawn at a light

- **N6b** Elites cannot be bound: `allegiance.js:13` `isBindable`, the snare filter in `Components.jsx` (re-locate at HEAD), `squadRoster.js:15` and `nametagData.js`. Red first: unit. **Index:** 0.05 KB.
- **N7** `night/buildMemory.js` `buildAnchor` (Move F) joins the objective candidates; `Terrain.jsx` placement deletes a key before setting it, so a re-placed cell moves to the Map's end. Red first: mine and re-place, and the anchor follows; the mutant drops the delete. **Index:** 0.
- **N8** After L13 lands (it adds `spawnSpot` to this branch: `l13-stuck/frontend/src/Components.jsx:22`, `:1087-1088`). The anchor (`nearestLit` of the death point, else the Hearth) reaches the spawn branch, not only `returnToSpawn` (`spawnPlacement.js:55-64`): the freeze, `placeBody` and the camera set (`Components.jsx:1079-1091`) stand at x 0, z 0, and `SPAWN_COLUMNS` and `CORNER_REACH` (`spawnPlacement.js:101`, `:111`) are origin-relative. A lantern stands on one block, not a four-column corner: probe its column and its neighbours. Siege mobs within 16 m get `routUntil = now + 8 s`. Red first: the nearest-light pick and its fallback; the corner case at a non-origin anchor; L13's dug-corner case still green; then e2e (f). **Index:** 0.2 KB.

## S1. Windup voices and the night's synth voices

`night/voices.js`: six archetype voices (skitterling, duskhound, husk for both husks, spider, moss brute, and the Bonepicker's bow draw, `mobTypes.js:10`), plus the kindle, the wave call and the dawn swell, through `registerVoices`. Each plays at the mob on `windupStart`: 3 at once at most, nearest first, a cooldown per type. `WINDUP_MS` stays 380 (`attackTelegraph.js:9`; per-archetype length is a balance change, `2026-10-27-crafty-combat-stance.md:125`). Red first: the picker through the bus (cap, nearest first, cooldown), then a sound-log e2e that finds a voice within 100 ms of a windup's start. The mix by ear is Kevin's (STATUS #44). **Index:** 0.

## E1. The first-hour economy, measured

`first-night.mjs --until level5` reports ember at the horn and at wave 3 (so how often R1 fires), time to levels 2 and 5, coins at dawn and at level 5, the first Forge purchase it can afford, and, if the run reaches a top-tier Lodestone, its five throws against a group (the row's note). A DECISIONS item keeps or retunes the day-1 weights, prices and pickup XP so that a route that fights and builds reaches 100 by dusk without the lend. Red first: the runner fails when a field is missing. **Files:** numbers in `src/night/encounters.js` and `game/forge.js`; DECISIONS. **Closes:** `TRIAGE:first-hour-economy-unmeasured`. **Index:** 0.

## N9. Dungeon guardians and the shrine hand-off (last)

Moves G and H: `world/dungeonStamp.js` `isDungeonChunk`; `DungeonGuardianSystem` (night chunk) spawns through the contract; `holdWaves.js` gives W3-B `shrineWaves(tier)` with relight's signature. Red first: a node test of one table across all four consumers, plus a guardian-group probe. **Files:** also `world/terrain.worker.js` (import only). **Closes:** `MASTERPIECE:encounters-and-a-siege-that`, once U0 (b) and (e) are green on the same sha. **Index:** 0.

## PR A. The feedback grammar (F0-F5)

The feedback-grammar plan's U0-U3 and U5-U7, re-cut at HEAD; M3 belongs to row 49. Each gate goes red first as its plan step says. F0: a GL draw counter and the lookbook combat stage. F1: the windup heats the outline and rim; the rim on every tier (today `rimStrength` is 0 unless `charRim`, `MobModel.jsx:54`). F2: a lit-band flash of about 70 ms with a white outline and a 50 ms squash, replacing the 300 ms flood (`MobModel.jsx:182`). F3: HDR eyes and part tones (the dragon rig waits on it). F4: the spell core with an ink hull, then rings and debris. F5: the elite crest and the captain's banner (Move E), `castShadow={false}`. **Files:** `render/MobModel.jsx`, `render/MobToonMaterial.jsx`, `render/characterStyle.js`, `render/mobFlash.js`, the spell VFX files, `src/night/eliteLook.js`. **Closes:** `MASTERPIECE:one-feedback-grammar/a` at F4. **Look:** every unit (combat frames, Chromium and iPad low tier). **Index:** at most 400 B.

## PR B. Small fixes, independent of the siege

- **D1** G2 samples terrain stone at 0.5, 1 and 2 m through the night keys (f 0.574, 0.926), C at most 0.025 in a widened maroon band; red on today's `HEARTH_FIRE` (`homeAnchor.js:25`); warm the fire or cool the ambient until green. **Closes:** `REVIEW:light:g2-pad-coverage`, `REVIEW:light:midnight-brazier-maroon`. **Look:** midnight at the brazier.
- **V1** `stanceFrame` stops counting world time a capped frame did not step. Red first: one 3.5 s frame keeps an engaged stance whose husk is still closing (`combatStance.js:259`, `:275`, `:371`). **Closes:** `REVIEW:w2b:stance-clocks-long-frame`.
- **I1** Alt with a right click places where `routeMouseVerb` (`verbRouter.js:36`, `:55-60`) would cast or interact, routed as a place intent (P4). Red first: a real-input e2e case. Touch: read `TouchControls`, then give it a long-press equivalent or record the row desktop-only. Whether Alt is safe under pointer lock on Windows Chromium is unchecked: test it, or pick another modifier. **Closes:** `QUEUE:Q26/b`. **Index:** 0.1 KB.
- **U2** `EmberBar.jsx` (`:10-18`) marks each unlocked verb's price (`ember.js:13-17`) and lights the ones the bar pays for; the dusk warning (`DuskWarning.jsx:31`, `notice.dusk`) says a full bar wakes the beast when the roar is unlocked (en and zh-CN). Red first: `hud-at-rest` reads the marks at phone and desktop; a unit on the chosen line. **Closes:** `REVIEW:w2f:ember-bar-no-readiness`. **Index:** 0.3 KB.
- **F6** The hurt kick reads `lastHitDir.angle` (today along the facing, `Components.jsx:1422`; `cameraKick.js:23-28`). Red first: left and right hits kick to opposite sides. **Closes:** `OPEN_ITEMS:OI-37`. **Look:** a real hit clip.
- **B2** `FEET_OFFSET` (`beastAvatarParts.js:129`) becomes per form from each capsule (`beasts.js:24-32`), shot on the lookbook self set at each form's capsule. Red first: each form's feet within 0.05 m of the floor. **Closes:** `REVIEW:w2e-follow:beast-feet-per-form`.

## Z. Land the First Night

1. `ci ok` on PR C's exact sha with U0's eight beats green and each beat's identity mutant recorded red.
2. `uptime`, then `first-night.mjs` on a local prod build, pressure in band; its clip and contact sheet judged beside today's eye-level frames by a reviewer who did not build the lane. After the deploy, again with `--url https://crafty-game.vercel.app`.
3. By hand on Chromium and WebKit at 1180x820 and 820x1180: touch-hold roar and heavy through a siege.
4. `sh frontend/scripts/dev/kill-test-procs.sh`; name any port a local run bound.
5. DECISIONS entries, each naming what it supersedes: the cold Hearth and the Primal Roar gift; the lend (amends first-minute D7); the flame, kept or cut; regeneration replacing hunger; respawn at a light; the healer when calm; the held view and the eye point (amends `transformCam.js:16`, pulls part of A21 forward); C0's moves; E1's numbers; the J1 verdict.
6. Close the rows by sha, then `LANE:W3-A` once no open row names it. Regenerate the Command Record and the CHANGELOG.

## W2-M beside (LANE:W2-M, its own PR)

`docs/superpowers/plans/2026-10-27-crafty-sound-with-body.md`, re-cut on post-Cut code. It is not on disjoint files: Unit 2 edits `SoundManager.jsx:443-459`, `App.jsx` and `bundle-budget.mjs` (`:369-371`), and Unit 4 edits `Components.jsx`, `Terrain.jsx`, `SoundManager.jsx` and `LootSystem.jsx` (`:603`; pre-Cut lines). So it queues behind W3-A's units on those files (Shared files, above), and its lane row needs a windup voice from the bank, so M5 waits on S1. Units 1-4: the bank in `public/sfx/` under a gate cap, loaded after the first gesture in its own chunk; combat bodies; ground and blocks. M5: the night's layers over S1's synth through `bank.voice()`. M6: the dragon's entrance roar (`bossEntrance.js:9`). A loader e2e proves the synth plays when the bank never loads. **Closes:** `MASTERPIECE:sound-with-body`, `OPEN_ITEMS:OI-36`. **Index:** 0 (the bank is lazy).

## Rows and the units that close them (13 W3-A, 2 W2-M)

| Row | Unit |
|---|---|
| `MASTERPIECE:encounters-and-a-siege-that` | N9, with U0 (b) and (e) |
| `MASTERPIECE:the-lantern-and-a-baked/a` | L3 |
| `MASTERPIECE:one-feedback-grammar/a` | F4 |
| `OPEN_ITEMS:OI-35` | D3 |
| `OPEN_ITEMS:OI-37` | F6 |
| `QUEUE:Q26/b` | I1 |
| `REVIEW:light:g2-pad-coverage`, `REVIEW:light:midnight-brazier-maroon` | D1 |
| `REVIEW:w2b:stance-clocks-long-frame` | V1 |
| `REVIEW:w2f:ember-bar-no-readiness` | U2 |
| `REVIEW:w2k:hand-kept-layer-tables` | L2 |
| `REVIEW:w2e-follow:beast-feet-per-form` | B2 |
| `TRIAGE:first-hour-economy-unmeasured` | E1 |
| `MASTERPIECE:sound-with-body`, `OPEN_ITEMS:OI-36` | W2-M |

## Calls made (2026-11-01 revision, after an upside pass and a refuter)

Each was checked against the code at `eff58e9a` before it was taken or rejected.

| Call | Why |
|---|---|
| **Taken:** N6a owns `skyClock.js` | measured: `followSkyClock` cut 4 times in a 4-tick 60-unit rush, 0 at the normal rate (scratch probe) |
| **Taken:** B1's eye point | `PositionTracker.jsx:16-18`, `XPOrbSystem.jsx:22`, `LootSystem.jsx:41`, `SpawnerSystem.jsx:121-122` read the camera, which the held view moves 4.5 m back |
| **Taken:** N8 names the spawn branch and waits for L13 | `Components.jsx:1079-1091` and `spawnPlacement.js:101`, `:111` are origin-bound; L13 rewrites that branch |
| **Taken:** W2-M queues behind W3-A | it edits four of W3-A's files (`sound-with-body.md:369-371`, `:603`), and its lane row needs S1's windup voice |
| **Taken:** units for Pike, the dusk line and the lantern goal (D2, U2, D3) | the draft's beats had no unit |
| **Taken:** the brazier light stays mounted at intensity 0 | a mount re-links every lit program (`lightPool.jsx:5-6`) |
| **Taken:** the boom aims at the rendered anchor | Rapier 2.2.0 interpolates the body (`interpolate` defaults true); the camera chases the stepped `translation()` |
| **Taken:** E1 reports level 5 and the Lodestone; L2 edits `BLOCK_COLORS` | their rows and `blockIds.js:23-25` ask for them |
| **Taken (BET):** the Hearth's flame (H1), with an off switch | "Night 1 held" could not be false: the objective had no health and no fail state |
| **Taken:** the pressure band and a judge who did not build the lane | every acceptance beat measured presence or timing, not play |
| **Taken:** the night-1 lend (R1) | night kills pay 0, dawn empties the bar, building caps at 40: a builder reaches 72 by dusk, a fighter needs 7 day kills |
| **Taken:** the playable night first (J1), N9 last, N6 split, three PRs | the first lived night is judged before the bulk is built; PR A and B need no siege |
| **Taken:** beats (b)-(h) on the returning profile; C0 off the night chunk; the U0b arrow dropped; the kindle awaits the chunk; six voices; P4's check named as the M3 Max; the `hearthLit` door citation corrected | refuter findings that held at HEAD |
| **Rejected:** a saved set of lit light ids | W3-B already designs `litShrines` (`2026-10-27-crafty-relight-frontier.md:228`) and a lantern's state is its block, so `lights.js` derives the union |
| **Rejected:** a refund path for the gift | it is one real point in `talentPoints`; stopping the gift later leaves old saves a harmless extra point |
| **Rejected:** the dawn postcard and seed URL | W3-G's work, behind door 4 |
| **Rejected:** cutting the healer's heal; a HUD flame meter | calm-only closes the pressure hole and keeps the role; the brazier is the meter (P3) |
| **Not checked** | Alt under pointer lock on Windows Chromium (I1 tests it); the captain's time to kill (N4 gates it); main-thread terrain height (N4) |
