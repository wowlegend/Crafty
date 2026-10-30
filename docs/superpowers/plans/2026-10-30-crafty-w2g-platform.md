# W2-G platform first steps: one event bus, a world seed, the DEV bridge out of App, autosave from PERSISTED_KEYS, production knip (2026-10-30)

Lane W2-G of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, rows 26 (event bus), 27 (world seed) and 41
(the DEV bridge, autosave keys, production knip). Row 25 (the dragon on the one damage path) is the dragon lane's; the
rest of row 9 landed with W2-D. Branch `feat/w2g-platform`, cut from main `80238889`. DECISIONS items from 110.

**Files the dragon lane holds, not edited here:** `render/BossEntity.jsx`, `world/bossSystem.js`, `game/bossConfig.js`,
`game/bossTier.js`, `game/bossEntrance.js`, `game/bossPersistence.js`, `systems/CombatSystem.jsx`, `game/hurl.js`,
`game/elementZones.js`, `systems/HurlSystem*`, the squad AI, `ui/BossHealthBar.jsx`, `game/worldClock.js`, and the dodge,
heavy and riposte code of `Components.jsx`; in `EnhancedMagicSystem.jsx` only the `window.play*` call site.

## Goal frame

**Goal.** Fewer silent dead features: a sound a system means to play reaches the sound layer through one bus whose
event names cannot be mistyped; every field a save records schedules an autosave by construction; a world records its
seed; the shipped bundle carries no test bridge; dead code that only tests keep alive is visible in CI.

**Metric.**
1. `grep -rn "window\.play" frontend/src frontend/tests` prints nothing.
2. A level-up (the store's `level` rising under the real `useSimpleExperience` hook) starts the `levelUp` voice's
   buffer on the real `SoundProvider` (a faked AudioContext); RED with the provider's subscription removed. The same for
   an achievement, a completed quest (`fanfare`) and the win screen (`victory`).
3. Height, continent, moisture, temperature and `n` at seven fixed columns, the cave noise at three points and the
   vegetation hash at three, for seed 12345, equal the values today's worker computes (captured at `80238889` before
   the change); a save with no seed loads at 12345; the terrain worker, driven in node through its message handler,
   holds main's block ids at 30 fixed voxels in four chunks unseeded, at init 12345 and on a world load at 12345, and
   builds a different world at another seed; New World writes `worldSeed: 12345`.
4. Every key `buildSaveData` reads (traced, not listed) is in `PERSISTED_KEYS`, and a change to each one, through the
   real store, makes the installed autosave save; RED with one key dropped from the derivation.
5. No name `src` registers as a test hook is a registration in the production build (the quoted first argument of a
   call), and no chunk sets `window.__craftyTest` (`bundle-budget.mjs`, every CI build); `App.jsx` registers no test
   hook.
6. `knip --production` runs in CI's fast tier beside `knip`, green; the tier test sees it.

**Anti-attack (GF-L2).**
- A gate that emits on the bus and watches a subscriber proves the bus, not the level-up path: drive the real hook.
- Simplex noise is 0 at the origin under every seed, so a pinned origin passes under any seed. The columns vary the
  continent, the highland swell and the ocean, and a second seed must change every pinned value (the PASS-but-wrong
  control).
- A hand-kept `PERSISTED_KEYS` drifts from the serializer as the trigger list did: the gate traces what `buildSaveData`
  reads through a recording Proxy, so a new persisted field and a stale list entry both go red.
- `knip --production` with no `!` entries reports every dependency unused and checks no source: the entries are marked,
  and the run's own findings are resolved one by one (deleted when dead, `@internal` when a test seam or oracle).
- A bridge loaded by dynamic import is still emitted as a chunk unless the import sits in a branch the build drops:
  read the built files for a hook name.

## Decisions (each recorded in DECISIONS from item 110)

1. `game/eventBus.js`: a closed set of event names (an unknown one throws at subscribe and at emit), positional
   payloads, copy-on-write subscriber arrays, so an emit allocates nothing. `game/mobKillBus.js` keeps the kill event's
   two helpers on it, because `systems/CombatSystem.jsx` (the dragon lane's) imports them.
2. The sound layer (`SoundProvider`) subscribes through `audio/soundEvents.js` (event to voice). `window.playSpellCastSound`
   was never assigned anywhere, so it never sounded; the cast already plays `magicCast` at the muzzle, so the call is
   deleted and no cast event is added (it would play twice).
3. The seed is `game_state.worldSeed`: the tombstone carries `game_state` keys a build does not write, so a rolled-back
   build keeps it. It reaches the worker on `load_modifications`, the message a world load already re-streams on, and
   the main-thread climate sampler through the same `world/worldNoise.js`. New World writes 12345: a new seed moves the
   Hearth, the shrines and the Blight Heart off the terrain they were placed for, so real seeds wait for procedural
   anchors (a registry row).
4. The DEV bridge is `devtest/devBridge.js`, imported inside `if (import.meta.env.DEV)`.
5. `game/autosave.js` `installAutosave` owns the store subscription and the tab-hide and unload flush; the trigger is
   `PERSISTED_KEYS`, declared beside `buildSaveData`.

## Tasks

| # | Task | Done when |
|---|---|---|
| 1 | This task script | committed |
| 2 | Bus gate red first (`event-sound-gates`, `eventBus.test.js`); the bus, the sound subscription, the emitters; the `window.play*` globals and the dead `useGameSounds` verbs deleted; `reward-audio-gates` and `victory-audio-gate` driven through the bus | gates red, then green; grep zero |
| 3 | Seed gate red first (`world-seed-gates`); `world/worldNoise.js`; the worker, climate, store, save and load plumbed | red, then green |
| 4 | Autosave gate red first (`autosave-trigger-gates`); `PERSISTED_KEYS`; `installAutosave`; App's trigger list gone; the source-grep trigger cases deleted | red, then green |
| 5 | The DEV bridge to `devtest/devBridge.js`; the gates that read it re-pointed | build green; no hook name in `build/` |
| 6 | Production knip: entries marked, findings resolved, the CI step, the tier test, the gate table | `knip --production` green; tier test red without the step |
| 7 | DECISIONS 110 on; registry rows; ARCHITECTURE | doc-currency green |
| 8 | VERIFY list; merge origin/main; push; PR; CI on the exact head | `ci ok` on the head |

## Mutations owed (the `Mutation-Proof:` trailer)

- Bus: the provider's subscription removed; the level-up emit removed; `levelUp` dropped from the voice table; an
  unknown-name emit allowed; identity (a comment).
- Seed: the worker seeded with the payload ignored; `resolveWorldSeed` returning 0 for an absent seed; the load reading
  no seed; identity.
- Autosave: one key dropped from the derivation; one key dropped from `PERSISTED_KEYS`; identity.
- Tiers: the production knip step removed; identity.

## Not proven by this lane

- The level-up sound heard in the browser: the gate fakes the AudioContext, and no e2e listens to audio.
- That a seed other than 12345 yields a playable world: New World does not write one.
- That a save with a seed other than 12345 re-seeds terrain already streamed in the same page: the load re-streams,
  but the landmarks, the Hearth and the Blight Heart are placed for 12345.
