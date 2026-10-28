# Crafty "Sound with body" (Phase 2, roadmap 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recorded CC0 bodies layered over today's synth voices, so that hits, steps and breaks have a material and a weight. The bank loads lazily after the first gesture and is held to a byte ceiling by a gate.

**Architecture:** The bank is 71 mono MP3s in `frontend/public/sfx/`, built from two Kenney CC0 packs. A pure manifest lists them, and a commit-time gate caps their bytes. The loader, decoder and recipe table live in a lazy chunk that is imported on the first gesture. Each sound event resolves through `bank.voice()` into one or more "picks": the existing synth buffer plus recorded layers. A spatial voice keeps ONE `THREE.PositionalAudio`, whose primary is the longest pick, so the occlusion rays per event do not change. When the bank is absent, failed or loading, every call takes today's code path unchanged.

**Tech Stack:** WebAudio (`AudioContext.decodeAudioData`, `AudioBufferSourceNode`), three r172 `PositionalAudio`, Vite 6 `public/` and dynamic `import()`, vitest 4 (fake ctx, jsdom), Playwright e2e (CI), puppeteer prod-smoke (CI), and ffmpeg/LAME for the one-time conversion (local, free).

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` §Phase 2 ("Sound with body"). The design input, kept verbatim, is `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json`, the move named "Sound with body" (rank 8). The upside pass (`upside-2026-10-27.md:55,67,134`) supplies "layer them", "CC0 only (Kenney)" and "MP3 plays on Safari". The refute (`refute-2026-10-27.md:185`) says Kenney licensing had "no live source in this run", and §Current state closes that gap.

## Goal (player-facing)

Today every sound effect in Crafty is a synthesized tone or a noise burst. A block break is a 150 Hz sawtooth and a footstep is 50 ms of filtered noise, so a sword on a skeleton sounds like a sword on a husk, the ground has no voice, and the perfect dodge chimes the same as everything else. After this milestone:
- a light hit on flesh, a heavy on a moss brute's stone hide and a crit each sound different;
- the swing has steel in it, and the heavy release draws a blade;
- a perfect dodge rings a bell;
- the player's feet tell them whether they are on grass, sand, snow, stone or wood;
- stone crumbles, a plank cracks and glass shatters when mined.

The game never goes silent: until the bank is ready, or if it never loads, the current synth plays exactly as it does now. The roughly 300 KB download waits until the player first touches, clicks or presses a key, so the first frame and the iPad's first load do not change.

## Current state (cited; every line verified by reading, 2026-10-27, `main` at f0e84766)

**The voices are all synth, rendered once into AudioBuffers.**
- `frontend/src/audio/synthVoices.js:12-45` (`makeTone`) and `:47-60` (`makeNoise`) are the primitives.
- `:719-724` maps `blockPlace` to a 200 Hz square, `blockBreak` to a 150 Hz sawtooth, `footstep` to `makeNoise(ctx, 0.05)`, and `pickup` to a 400 Hz sine.
- `:356-374` (`makeHitSound`) is 0.15 s of noise plus 120 Hz; `:399-418` (`makeSwingSound`) is a 0.3 s noise whoosh; `:191-208` (`makeParrySound`) is the perfect-dodge TING.
- `:712` `VOICES` is the registry. `frontend/src/SoundManager.jsx:480-486` (`generateSounds`) fills `sounds.current[name]` from it once, at the init effect (`:443-459`).

**There are two play paths, and both run through the master bus.**
- `SoundManager.jsx:498-516` `playSound(name, rate)` builds source → `GainNode(volume)` → `getMasterBus()`. `getMasterBus()` (`:466-478`) wraps `createMasterBus` (`frontend/src/audio/masterBus.js:8-23`: input gain → DynamicsCompressor at −3 dB, ratio 20 → destination).
- `frontend/src/render/SpatialAudioController.jsx:136-186` registers `store.playSpatialSound(soundName, position, playbackRate = 1, distance = 20, jitter = true)`. It does the following:
  - `:138` returns early when `!soundEnabled` or when the named buffer is missing;
  - `:141-142` builds one `THREE.PositionalAudio` per call;
  - `:148` applies ±7% pitch jitter;
  - `:152-155` gives each voice its own low-pass "occlusion" filter through `sound.setFilter`;
  - `:175-181` assigns `sound.onEnded` AFTER `sound.play()` (`:165`), so that handler never runs. three binds `source.onended = this.onEnded.bind(this)` inside `play()` (`Audio.js:113`), which captures the prototype `onEnded` (`Audio.js:328-333`); that only clears `isPlaying`. (Corrected by review, 2026-10-27. The earlier text said this handler disconnects the voice.)
- The `useFrame` at `:205-278` walks every live voice, every frame. Its prune (`:229-238`) is what actually disconnects a voice, one frame after `isPlaying` goes false. The same loop marches up to 5 Rapier rays per voice for occlusion and writes two `setTargetAtTime` per voice (`:241-276`).
- three's `PositionalAudio.updateMatrixWorld` writes six `linearRampToValueAtTime` per playing voice per frame (`PositionalAudio.js:110-133`), and every voice owns an HRTF panner (`:17`). So per-frame audio work scales with the number of LIVE voices, which is events × voice duration. Today's footstep lasts 0.05 s (`synthVoices.js:721`) and a hit 0.15 s.

**What three r172 does with a voice** (`frontend/node_modules/three/src/audio/Audio.js`):
- `play()` (`:90-123`) calls `source.start(this._startedAt, this._progress + this.offset, this.duration)`, so `sound.offset` trims the start of the buffer.
- `connect()` (`:185-203`) chains `source → filters[0..n] → getOutput()` (the panner).
- `disconnect()` (`:211-235`) cuts `filters[last] → panner`. The frame prune calls it one frame after the primary ends, so any extra source fed into that filter chain dies with the primary, at frame granularity.

**The call sites carry no material and no weight.**
- Mob hit: `frontend/src/systems/CombatSystem.jsx:80-85` plays `'hit'` at the mob with default rate and distance. `damage` and `entity.type` are both in scope (`:25`; `entity.type` is used at `:150`).
- Boss hit: `frontend/src/Components.jsx:299-301` plays `playSpatialSound('hit', bp, 1.1, 30)`.
- Swing: `Components.jsx:236` calls `store.playAttackSounds?.()`. The store holds `makeAttackSoundPlayer(playSwing, playAttack)` (`frontend/src/App.jsx:935`), and `frontend/src/game/attackSounds.js:6-11` calls `playSwing()` and then `playAttack()` 100 ms later, both with no arguments. A heavy release goes through the same path (`Components.jsx:546` → `triggerMeleeAttack({ heavy: true })`, with `heavy` known at `:225`).
- Other uses of the swing voice: the dodge plays `'swing'` at 1.4 (`Components.jsx:987-989`) and the ledge vault plays `'swing'` at 1.2 (`:1123-1125`). The perfect dodge plays `'parry'` (`:1006`).
- Footsteps: `Components.jsx:1298-1311` computes `t = footstepTypeAt(px, pz)` and turns it into a playback RATE only (`:1304`). `frontend/src/world/climate.js:25-28` returns `grass|dirt|stone|sand|snow|wood` from the GENERATED surface. Per `:15` it ignores player edits and the Hearth stamp.
- Block break: `frontend/src/world/Terrain.jsx:942-956` `mine()` calls `playBlockBreak(h.hitPoint)` with NO block type, so `SoundManager.jsx:566-569` always uses its default `'grass'` rate. The material is known only one worker round trip later:
  - `frontend/src/world/terrain.worker.js:120-131` posts `block_broken` with `blockType: prevBlock`;
  - `Terrain.jsx:696-706` receives it (and adds to the inventory);
  - the debris burst uses the same message (`frontend/src/world/BlockParticleSystem.jsx:41-44`).
  - `frontend/src/render/BossEntity.jsx:78-81` also breaks blocks through `update_block`.
- Block place: `Terrain.jsx:1021` passes `selectedBlock`.

**The weight rule already exists, once.** `frontend/src/game/hitstop.js:24-27` maps damage ≥40 to `crit`, ≥30 to `heavy`, and anything else to `light`.

**The entry hook.**
- `App.jsx:950-957` calls `resumeAudio()` when the `active` gate opens (`isPointerLocked = useActiveInput()`, `:181`).
- `SoundManager.jsx:523-527` `resumeAudio` is called only from there.
- The e2e entry `forcePlay` (`App.jsx:323-325`) sets the same gate with no gesture.

**Assets today.**
- `frontend/public/` holds only `music/` (`boss.mp3` 639,522 B, `day.mp3` 640,358 B, `night.mp3` 640,358 B), fonts and icons. There is no `sfx/`.
- `vite.config.js:35` builds into `build/`, and `build/music/day.mp3` is byte-identical to `public/music/day.mp3` (`cmp`, 2026-10-27). So `public/` ships verbatim.
- `frontend/src/ui/MusicPlayer.jsx:27-28` constructs all three music `Audio` elements with `preload = 'auto'` at mount.

**The budget.**
- `frontend/scripts/ci/bundle-budget.mjs:32-37` caps the `index` chunk at 760,000 B, and reads `.js` in `build/assets` only (`:47-49`). It sees no audio.
- `build/assets/index-RM8RWfkj.js` measured 696,924 B (a build of 2026-10-27 05:22), leaving 63,076 B of headroom for every Phase 1-3 move.
- The lazy-panel marker check (`:96-130`) is the pattern for proving a lazy split.

**Credits.**
- `frontend/src/ui/CreditsScreen.jsx:45-61` (the icons `Panel`) credits game-icons.net (CC BY 3.0), and `:63-70` credits four fonts. (Line numbers corrected by review, 2026-10-27.)
- The strings are `frontend/src/i18n/strings.js:159-168` (en) and `:305-314` (zh-CN).
- **The repo credits nothing from Kenney today.** `grep -ri kenney` over `.md/.js/.jsx/.json/.mjs` finds it only in the masterpiece design docs. So "what the repo already credits" cannot establish the licence; the source below does.

**Licence: verified CC0 from the packs themselves (tier 0, retrieved 2026-10-27).**

| Pack | Zip | sha256 | `License.txt` reads | Files |
|---|---|---|---|---|
| Impact Sounds 1.0 | `kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip` | `029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8` | "License: (Creative Commons Zero, CC0)" | 130 OGG Vorbis, 44.1 kHz stereo, 52.2 s in all |
| RPG Audio | `kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip` | `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b` | "License (Creative Commons Zero, CC0)" | 51 OGG Vorbis, 48 kHz stereo, 25.2 s in all |

`kenney.nl/support` says: "Attribution is not required ... you can do so by mentioning 'Kenney'. Do not use our logo." Two lanes agreed: the asset pages fetched through Parallel and through WebFetch both list "License: Creative Commons CC0".

**Measured on the draft selection** (scratchpad conversion, ffmpeg + LAME 64 kbps CBR mono 44.1 kHz):
- **71 files, 31.76 s, 294,535 B**; the largest file is 14,462 B (`impactBell_heavy_001`).
- Decoded onsets differ per file: `impactPunch_heavy_000` 23.3 ms, `knifeSlice` 82.3 ms, `footstep_carpet_000` 0.5 ms. ffmpeg honours the LAME gapless header, so MP3 and OGG onsets match. A browser that ignores that header adds about 25 ms more.
- Decoded peaks EXCEED full scale: 1.265 for the punch OGG and 1.206 after MP3.
- **Neither pack holds a creature voice** (roar, growl). Both zip listings were read in full.

## Design (the moves; each with GPU cost and main-chunk bytes)

The four moves land as Units 1-4 below. **GPU cost is 0 for every move: no render work, no shader, no draw.** Main-chunk (`index`) bytes are estimates to be MEASURED and written in each commit body (`npm run build` and the `bundle-budget` line for `index`, before and after). This milestone's cap on its own `index` growth is **3,000 B**. Anything over that goes back into the lazy chunk.

1. **A bank on disk, credited and capped (Unit 1).**
   - 71 MP3s are built by `scripts/audio/build-sfx-bank.mjs` from the two zips: peak −3 dBFS, tail trimmed at −50 dB, no ID3 metadata.
   - `public/sfx/LICENSES.txt` carries both `License.txt` texts verbatim, plus the zip URLs and sha256 values.
   - The manifest `src/audio/sampleBankManifest.js` lists 20 groups.
   - A commit-time gate (`tests/scripts/sfx-bank-budget.test.js`) holds the directory to `SFX_BYTE_CEILING` and each file to `SFX_FILE_CEILING`, with manifest/disk parity and MP3 magic.
   - Credits renders a "Sound effects" panel from `src/audio/sfxPacks.js`, so a pack cannot ship uncredited.
   - Bytes: about 0.6 KB in `index` (packs list, panel, keys). Network: 0 until Unit 2.
2. **The bank loads after the first gesture, in its own chunk (Unit 2).**
   - `primeSampleBank(ctx)` (index, about 0.5 KB) runs from `resumeAudio` and from a one-shot first-gesture listener. It is idempotent, inert in capture, and skipped when `navigator.connection.saveData === true`.
   - It dynamic-imports `src/audio/sampleBank.js`. That lazy chunk (about 4 KB) holds the manifest, the loader (fetch → `decodeAudioData`, concurrency 4, partial failure tolerated), the onset trim, the no-repeat variant picker and the per-group rate gate (40 ms).
   - `bundle-budget.mjs` gains a marker check that the bank is absent from `index`.
   - Network: +294,535 B (draft), deferred. Memory: decoded PCM 31.76 s × 48,000 Hz × 4 B ≈ **6.1 MB** worst case (mono, 48 kHz context). Playback is unchanged in this unit.
3. **Combat bodies (Unit 3).**
   - `bank.voice(soundName, meta, synth, nowMs, rng)` resolves a recipe into picks.
   - Hits layer `synth + body(material) + tail(weight)`. The light swing gets steel (`slice`), the heavy release draws a blade (`draw`), and the perfect dodge rings a bell (`bell`).
   - Spatial voices keep one `PositionalAudio`: the longest pick is primary, and the others feed its occlusion filter. The wiring lives in `src/audio/layeredVoice.js`, which picks every destination itself, so no call site chooses where a layer goes (review finding 1).
   - Rays and automation per LIVE voice are unchanged. But a recorded body outlives today's 0.05-0.15 s synth, so the number of live voices per frame grows. Three things bound it: a per-layer played-length cap (the `max s` column below), footsteps leaving the spatial path (Unit 4), and a measurement of the live-voice count before and after (Unit 3 Step 13).
   - Bytes: about 0.9 KB in `index` (`startLayers`, `layeredVoice.js`, glue, call-site meta) and about 1 KB in the lazy chunk (recipes).
4. **Ground and blocks (Unit 4).**
   - Footsteps by surface, breaks by block family and places by family REPLACE the synth when the bank is ready, because a 150 Hz sawtooth under a stone crumble is the defect, not a layer.
   - The break body plays in the `block_broken` handler, on the same message as the debris burst, because only the worker knows the block.
   - Loot pickup gets leather. XP orbs and trading keep the synth: an orb burst collects several in one frame, and a gated body would silence all but one.
   - Footsteps play at the listener (`listener.getInput()`), not through a new `PositionalAudio`. They already sit at the listener (distance 0, no occlusion). So they keep the underground filter and the cave reverb, and they drop the per-frame panner automation, the HRTF panner and the prune walk.
   - Bytes: about 0.3 KB in `index`.

**Recipe table — the one place these values live** (`src/audio/impactRecipes.js`; gains and rates are starting values, tuned by ear in place):

**A recipe needs explicit meta (amended after review).** A recipe applies only when the caller passes the meta that names it. A call with no meta, or with meta that lacks the key, returns `null`, and today's synth plays. So a caller this plan never lists (the player's own hurt sound, a burn tick, an XP orb, a future caller) keeps today's sound instead of silently getting a body (review findings 2, 3, 4).

| `soundName` | `meta` | keeps synth | layers: group · gain · rate · max s |
|---|---|:-:|---|
| `hit` | `{ mobType, melee: true }` (light: neither flag below) | yes | `body` · 0.70 · 1.00 · 0.40 |
| `hit` | `{ mobType, melee: true, heavy: true }` | yes | `body` · 0.90 · 0.92 · 0.40; `thud` · 0.60 · 1.00 · 0.40 |
| `hit` | `{ mobType, melee: true, isCrit: true }` (wins over `heavy`) | yes | `body` · 1.00 · 0.95 · 0.40; `metal` · 0.50 · 1.00 · 0.60 |
| `hit` | no meta, or no `melee` (the player's hurt sound `useGameStore.jsx:963`, spells, burn ticks, element zones, hurl, allies, the DEV kill) | — | no recipe (`null`, so today's synth runs) |
| `swing` | `{ melee: true, heavy: true }` | yes | `draw` · 0.55 · 0.90 · 0.60 |
| `swing` | `{ melee: true }` | yes | `slice` · 0.40 · 1.00 · 0.40 |
| `swing` | no meta (the dodge `Components.jsx:988`, the vault `:1124`) | — | no recipe, so those call sites are not edited |
| `parry` | — (one caller, the perfect dodge `:1006`) | yes | `bell` · 0.45 · 1.00 · 0.60 |
| `footstep` | `{ surface }` | no | `step_<surface>` · 0.55 · 1.00 · 0.25 |
| `footstep` | `{ surface, landing: true }` | no | `step_<surface>` · 0.85 · 0.90 · 0.25; gated under the key `land`, not under the stride's group key (review finding 6) |
| `footstep` | no `surface` (MISSING, which is not the same as unknown) | — | no recipe |
| `blockBreak` | `{ block }` | no | `blockFamily(block)` · 0.80 · 1.00 · 0.40 |
| `blockPlace` | `{ block }` | no | `wood` → `woodTap`, `glass` → `glass`, all else → `tap` · 0.70 · 1.00 · 0.30 |
| `blockBreak`, `blockPlace` | no `block` | — | no recipe, so `mine()`'s synth fallback stays observable |
| `pickup` | `{ loot: true }` (LootSystem only) | no | `leather` · 0.60 · 1.00 · 0.40 |
| `pickup` | none (XP orbs, trading) | — | no recipe |
| anything else | — | — | no recipe (returns `null`) |

- Material to body group: `flesh` → `punch`, `armour` → `plate`, `stone` → `mining`.
- `hitMaterialFor(mobType)`:
  - `skeleton` → `armour`;
  - `moss_brute` → `stone`;
  - `/boss|dragon/i` → `armour`;
  - everything else, including unknown types, → `flesh`.
- `blockFamily(name)`:
  - `stone|cobblestone|coal|iron|gold|diamond` → `mining`;
  - `wood` → `plank`;
  - `glass` → `glass`;
  - `grass|dirt|sand|snow|leaves|cactus|water` → `soft`;
  - unknown → `soft`.
- Every sample pick gets rate × (0.96 + rng × 0.08), the ±4% in the roadmap. The synth pick keeps its existing rate.
- **A hit's weight is the VERB and the ROLL, not the damage size.** `triggerMeleeAttack` knows `heavy` (`Components.jsx:225`) and the real `isCrit` roll (`solveMeleeDamage`, `utils/combat.js:1-13`). At default stats a tap deals 5 + 10 × 1.5 = 20, and both the heavy release (2 × 20, `HEAVY_MULT = 2`, `heavyAttack.js:17`) and a real crit (2 × 20) deal 40. A Diamond Sword tap (35 + 15) deals 50. Keyed on `hitstop.js`'s ≥40/≥30 rule, the heavy and the crit would share one tail, and a plain Diamond Sword tap would sound like a crit (review finding 5). So `hitWeight` is not exported and `hitstop.js` is not touched.
- **`max s` is the played length.** Each layer plays through `start(when, offset, maxSeconds)`, with a 20 ms linear fade to 0 scheduled at start. That is one-shot automation, not per-frame work. The spatial primary takes the same cap through three's `sound.duration`, and `longestIndex` compares capped lengths. These are starting values; Unit 1's commit body lists each group's measured durations.

**Groups — the bank** (`SFX_GROUPS`; file = Kenney basename with `.mp3`):

| group | pack | files |
|---|---|---|
| `punch` | impact | `impactPunch_heavy_000..003` |
| `plate` | impact | `impactPlate_medium_000..003` |
| `mining` | impact | `impactMining_000..003` |
| `thud` | impact | `impactSoft_heavy_000..002` |
| `metal` | impact | `impactMetal_heavy_000..002` |
| `bell` | impact | `impactBell_heavy_000..002` |
| `slice` | rpg | `knifeSlice`, `knifeSlice2` |
| `draw` | rpg | `drawKnife1..3` |
| `plank` | impact | `impactPlank_medium_000..003` |
| `soft` | impact | `impactSoft_medium_000..003` |
| `glass` | impact | `impactGlass_medium_000..002` |
| `tap` | impact | `impactGeneric_light_000..003` |
| `woodTap` | impact | `impactWood_light_000..003` |
| `step_grass` | impact | `footstep_grass_000..003` |
| `step_dirt` | rpg | `footstep00..03` |
| `step_stone` | impact | `footstep_concrete_000..003` |
| `step_sand` | impact | `footstep_carpet_000..003` |
| `step_snow` | impact | `footstep_snow_000..003` |
| `step_wood` | impact | `footstep_wood_000..003` |
| `leather` | rpg | `handleSmallLeather`, `handleSmallLeather2` |

That is 71 files in all.

## Global Constraints

- **Spend no money.** Use CC0 only, from the two packs whose `License.txt` is quoted above. No paid pack, no paid service, and no Sonniss file. Its licence is unread, and the roadmap says to read it before using anything from it.
- Death stays soft. No WebGPU/TSL, and no three.js bump (DECISIONS.md, 2026-10-27).
- **No added GPU cost.** No per-frame (`useFrame`) work may be added. Occlusion rays per sound event must not grow. Per-frame audio cost still scales with LIVE voices, so the live-voice count is measured before and after (Unit 3 Step 13), not assumed.
- Each unit states its `index` bytes measured against `bundle-budget.mjs` (ceiling 760,000; 696,924 measured). This milestone's own `index` growth stays ≤ 3,000 B. Rare-moment code (loader, decoder, recipes, manifest) lives in the lazy chunk.
- **Game-loop isolation:**
  - the bank is a module singleton read through `getSampleBank()`;
  - no React state, zustand subscription or re-render is driven by bank state;
  - frame-loop call sites read with `getState()`.
- **The game never goes silent.** With the bank idle, loading or failed, or a group missing, every call takes today's code path byte-for-byte. Only a deliberate rate-gate drop is silent.
- Capture mode: the bank never loads (`isCaptureMode()` is checked at call time, not at mount, per `MusicPlayer.jsx:21-25`).
- **i18n:** every player string goes in `strings.js` in en AND zh-CN. Mainland Simplified, plain UI register.
- No emoji in `src/`. Tokens only, and no chrome hex in UI (CreditsScreen header, `:7-10`).
- **Commits:**
  - no AI footer;
  - subagent fix-ups are NEW commits;
  - a commit that adds or rewrites a gate under `tests/gates/` or `scripts/ci/` carries a `Mutation-Proof:` trailer;
  - every NEW check file carries a `Mutation-Proof:` line in its header (`scripts/ci/killability-ledger.mjs`, its `RECEIPT_TOKEN`).
- **Visual baselines:**
  - no baseline is touched: `tests/visual/baseline/` holds no credits frame (`ls | grep -i credit` is empty), and `menu.png` does not change;
  - if any baseline moves anyway, that is a defect to find, not a re-shoot;
  - a re-shoot is its own `Baseline-Review:` commit, never bundled with `src`.
- Browser hygiene: anything launched is killed, then `sh frontend/scripts/dev/kill-test-procs.sh`. On this loaded machine, e2e and prod-smoke run in CI only.
- **The mutation path (amended after review, finding 8).** e2e and prod-smoke mutants run in CI, through a `workflow_dispatch` workflow `.github/workflows/e2e-mutants.yml` that this milestone adds in Unit 2.
  - It reads a committed list (`frontend/tests/e2e/mutants/sound-bank.json`: `{ label, subject, old, new, harness: 'e2e'|'prod-smoke', spec, identity? }`). It runs one matrix job per mutant through `scripts/dev/mutate-e2e.sh` (or the prod-smoke equivalent after `npm run build`), plus the unmutated spec, which must be GREEN.
  - Scoring follows `mutate-e2e.sh`: each mutant must go RED; the identity mutant must SURVIVE; `SETUP:` failures and timeouts count as COULD NOT CHECK, never as a kill.
  - Cost: standard runners on a public repository are free. Re-check `gh repo view --json visibility` before adding the workflow; if the repository is private, use the local rule below instead, because no money is spent.
  - The killability ledger (`killability-ledger.mjs:71`, `:135-141`) needs the receipt in the same commit that adds the spec. So the spec first lands on the branch as `frontend/tests/e2e/_pending/sound-bank.pending.js`. That name is outside Playwright's `testMatch` and outside the ledger's population, so it claims nothing. The dispatch job copies it into place and runs the batch. The commit that renames it to `sound-bank.spec.js` carries `Mutation-Proof: CI run <id>: M2.10 RED, ..., identity SURVIVED`.
  - **Local fallback.** `mutate-e2e.sh` may run locally only while `uptime`'s 1-minute load is at or below half the core count (`sysctl -n hw.ncpu`) for the whole batch. The load is printed into the receipt. A receipt is never written before its run's verdict exists.

## Review Focus (the inputs a player will meet that the happy-path tests would miss)

1. **The bank does not arrive.** Possible causes: offline, an ad-blocker, a 404 on one file, an MP3 a WebKit build cannot decode. Expectation: every sound still plays as synth, and a partial bank uses what decoded. Pinned by `sampleBank.test.js` "partial failure" (Unit 2) and the e2e control test with `**/sfx/**` aborted (Unit 3).
2. **Many events in one frame.** Examples: the melee cone hitting three mobs, the boss breaking five blocks (`BossEntity.jsx:71-81`), a siege. Expectation: one recorded body per group per 40 ms, so no pile-up and no limiter pumping. Pinned by `sampleBank.test.js` "rate gate" (Unit 2) and `impactRecipes.test.js` "gated voice" (Unit 3).
3. **The SFX volume slider at 0, Mute All, or sound disabled.** Expectation: recorded layers obey them exactly as the synth does, and blocks between player and mob muffle them. **Amended after review (finding 1, HIGH):** `startLayers.test.js` proves only that the callee honours the destination it is GIVEN, and the existing route gates are text matches that a `startLayers(...)` call never contains (`master-bus-gates.test.js:35`, `spatial-sfx-bus-gates.test.js:25`). So no call site chooses a destination any more.
   - `src/audio/layeredVoice.js` exports three functions, and each picks its destination itself:
     - `wireLayeredSpatialVoice(ctx, sound, voice)` creates the occlusion filter, chains `[primaryGain, filterNode]`, and sends every other layer into `filterNode`;
     - `playLayered(ctx, getMasterBus, picks, volume)` sends every layer to `getMasterBus() || ctx.destination`;
     - `playAtListener(ctx, listener, picks, volume)` sends every layer to `listener.getInput()`.
   - Pinned by `layeredVoice.test.js` against a fake ctx that records the node graph (mutants M3.11-M3.14). Also pinned by an e2e graph check: a wrapped `AudioNode.prototype.connect` must show every bank source reaching the master-bus input, and none reaching `ctx.destination` without passing through it, with Mute All on and off (Unit 3 Step 13).
   - Both play paths still return on `!soundEnabled` before the bank is consulted.
4. **Capture mode and the first frame.** Expectation: no `/sfx/` request before the first gesture, and none ever in capture. Pinned by `sampleBankHandle.test.js` "capture" (Unit 2) and the prod-smoke "0 before, 71 after" block (Unit 2).
5. **Unknown inputs.** Examples: a new mob type, a new block id, a surface the table lacks. Expectation: fall back to a default group and never throw. Pinned by `impactRecipes.test.js`: denominators over every `MOB_TYPES` key (10) plus `'boss'`, every `BLOCK_ID` name (15), and every `FOOTSTEP_TYPES` value (6); unknown values resolve to defaults (Unit 3/4). **A MISSING key is not an unknown one** (amended after review, findings 2 and 3): a call with no `surface`, no `block`, no `melee` or no `loot` returns `null` and plays today's synth. A dropped meta therefore stays observable as `synth/<name>` in the e2e, and is never disguised as the default group.
6. **A new or unlisted caller** (review finding 4). `hit` is played by every `damageMob` path (`CombatSystem.jsx:29-34`) and by the player's own hurt sound (`useGameStore.jsx:963` → `App.jsx:936` → `SoundManager.jsx:584`). `pickup` is played by XP orbs (`XPOrbSystem.jsx:35`), trading (`TradingInterface.jsx:39`, `:57`, `:70`) and loot (`LootSystem.jsx:56`). Expectation: only the callers this plan names get a body. Pinned by the explicit-meta rule above and by `impactRecipes.test.js` "no meta, no recipe" over every recipe `soundName`.

## File structure

| File | Unit | Responsibility |
|---|---|---|
| `frontend/scripts/audio/build-sfx-bank.mjs` (new) | 1 | One-time OGG→MP3 conversion from the unzipped packs; guarded CLI; exports `ffmpegArgs` |
| `frontend/src/audio/sfxPacks.js` (new) | 1 | `SFX_PACKS`: the pack metadata Credits renders (index chunk) |
| `frontend/src/audio/sampleBankManifest.js` (new) | 1 | `SFX_DIR`, `SFX_GROUPS`, `SFX_BYTE_CEILING`, `SFX_FILE_CEILING`, `sfxFiles()` (lazy chunk; Node-importable) |
| `frontend/public/sfx/*.mp3` (71), `frontend/public/sfx/LICENSES.txt` (new) | 1 | The bank and its provenance |
| `frontend/tests/scripts/sfx-bank-budget.test.js` (new) | 1 | The byte-ceiling gate (subject = files, so `tests/scripts/`) |
| `frontend/tests/scripts/build-sfx-bank.test.js` (new) | 1 | `ffmpegArgs` shape |
| `frontend/src/ui/CreditsScreen.jsx`, `frontend/src/i18n/strings.js` (modify) | 1 | Sound effects panel, en + zh-CN keys |
| `frontend/tests/integration/credits-sfx.test.jsx` (new) | 1 | The panel renders every pack |
| `frontend/src/audio/variantPicker.js`, `onset.js` (new) | 2 | No-repeat picker; onset trim |
| `frontend/src/audio/sampleBank.js` (new, lazy) | 2/3 | Loader, `pick`, `allow`, `voice`, `nameOf` |
| `frontend/src/audio/sampleBankHandle.js` (new, index) | 2 | `primeSampleBank`, `getSampleBank`, `readSampleBankStatus` |
| `frontend/src/SoundManager.jsx` (modify) | 2/3/4 | prime on resume and first gesture; layered `playSound`; meta through `useGameSounds` |
| `frontend/src/App.jsx` (modify) | 2/4 | DEV test hooks |
| `frontend/scripts/ci/bundle-budget.mjs` (modify) | 2 | Lazy-bank marker check; the absolute 500,000 B cap on `build/sfx` |
| `frontend/scripts/ci/prod-smoke.mjs` (modify) | 2 | 0 `/sfx/` before the gesture, all after |
| `frontend/tests/e2e/sound-bank.spec.js` (new; first committed as `tests/e2e/_pending/sound-bank.pending.js`) | 2/3/4 | The lived proof |
| `frontend/tests/e2e/mutants/sound-bank.json` (new), `.github/workflows/e2e-mutants.yml` (new) | 2 | The CI mutation path (Global Constraints) |
| `frontend/src/audio/impactRecipes.js` (new, lazy) | 3/4 | `recipeFor`, `hitMaterialFor`, `blockFamily` |
| `frontend/src/audio/startLayers.js` (new, index) | 3 | `startLayers`, `longestIndex` |
| `frontend/src/audio/layeredVoice.js` (new, index), `layeredVoice.test.js` (new) | 3/4 | `wireLayeredSpatialVoice`, `playLayered`, `playAtListener`: every destination chosen here, none by a call site |
| `frontend/src/render/SpatialAudioController.jsx` (modify `:136-186` only) | 3 | Layered spatial voice; DEV hook `readSpatialVoiceCount` |
| `frontend/src/game/attackSounds.js` (modify), `attackSounds.test.js` (extend) | 3 | Forward `opts` to the swing |
| `frontend/src/systems/CombatSystem.jsx`, `frontend/src/Components.jsx`, `frontend/src/systems/LootSystem.jsx` (modify call sites) | 3/4 | Pass `meta` (`damageMob` gains an optional 6th argument, `sfx`) |
| `frontend/src/world/climate.js` (modify) | 4 | Export `FOOTSTEP_TYPES` |
| `frontend/src/world/Terrain.jsx` (modify `mine`, the `block_broken` handler, `place`) | 4 | Break and place by material |

## Units

Unit order is strict: each unit is shippable alone and leaves the game sounding as it did, or better. **Units 2 and 3 reach `main` in ONE push** (separate commits): Vercel deploys every push, and Unit 2 alone would make live iPads download 300 KB and hold about 6.1 MB of decoded audio that plays nothing (review finding 16). Run unit tests from `<repo>/frontend`. e2e and prod-smoke run in CI, never on this machine while it is loaded; their mutants follow the mutation path in Global Constraints. Before each push, the `e2e freshness` gate needs CI's green e2e verdict on the exact commit (`f0e84766`), so push the unit to a branch, let CI run, then fast-forward `main`.

---

### Unit 1: The bank on disk, credited and capped

**Files:** Create `frontend/scripts/audio/build-sfx-bank.mjs`, `frontend/src/audio/sfxPacks.js`, `frontend/src/audio/sampleBankManifest.js`, `frontend/public/sfx/` (71 `.mp3` + `LICENSES.txt`), `frontend/tests/scripts/sfx-bank-budget.test.js`, `frontend/tests/scripts/build-sfx-bank.test.js`, `frontend/tests/integration/credits-sfx.test.jsx`. Modify `frontend/src/ui/CreditsScreen.jsx` (insert a panel after `:61`, the close of the icons panel), `frontend/src/i18n/strings.js` (after `:167` and after `:313`).

**Interfaces:**
- **Produces:**
  - `SFX_PACKS: ReadonlyArray<{ id: 'kenney-impact'|'kenney-rpg', name: string, version: string|null, author: 'Kenney', url: string, zipUrl: string, zipSha256: string, licence: 'CC0 1.0' }>`
  - `SFX_DIR = '/sfx/'`
  - `SFX_GROUPS: Readonly<Record<string, { pack: string, files: string[] }>>`, the 20 groups above
  - `SFX_BYTE_CEILING: number`, `SFX_FILE_CEILING = 20_000`
  - `sfxFiles(): Array<{ file: string, group: string, pack: string }>`
  - `ffmpegArgs(src: string, out: string, gainDb: number): string[]`
- **GPU:** 0. **index:** about 0.6 KB (estimate; measure). **Network:** 0 (nothing fetches yet).

- [ ] **Step 1: Write the failing gate test** `frontend/tests/scripts/sfx-bank-budget.test.js`.
  - Header comment: why it lives in `tests/scripts/` (its subject is the files on disk) and a `Mutation-Proof:` line, filled in at Step 6.
  - It reads `frontend/public/sfx/` with `readdirSync` and `statSync`.
  - Tests and assertions:
    - `it('the manifest names files at all')`: `expect(sfxFiles().length).toBe(71)` (the denominator, exact);
    - `it('every manifest file is on disk, and every .mp3 on disk is in the manifest')`: two set differences, each `toEqual([])`, with the offending names in the message;
    - `it('the whole directory is under SFX_BYTE_CEILING')`: sum of `statSync(f).size` over EVERY file in the dir (mp3 and txt) `<= SFX_BYTE_CEILING`; print `sfx: N files, B bytes / CEILING`;
    - `it('no single file exceeds SFX_FILE_CEILING')`;
    - `it('every .mp3 is an MP3')`: the first bytes are `ID3`, or `0xFF` followed by a byte with `(b & 0xE0) === 0xE0`; an `OggS` header fails, naming the file;
    - `it('LICENSES.txt credits every pack the manifest uses, each under its own CC0 licence')`: for each distinct `group.pack`, an `SFX_PACKS` entry exists, `SFX_PACKS[i].licence === 'CC0 1.0'`, and that pack's OWN section of `LICENSES.txt` contains its `zipSha256` and `Creative Commons Zero, CC0`. A section runs from the line naming the pack's `id` to the next pack's `id` line. Matching `CC0` anywhere in the file would let a CC-BY pack ride on Kenney's section (review finding 9).
    - `it('the byte ceiling is under the absolute cap')`: `expect(SFX_BYTE_CEILING).toBeLessThanOrEqual(500_000)`, with the literal in the test, not in the manifest. `tests/scripts/` is outside the trailer gate's `GATE_PATHS` (`mutation-proof-trailer.mjs:40`), so the cap that the trailer gate actually sees is the `build/sfx` check in `bundle-budget.mjs` (Unit 2 Step 8). This test is the early, local copy of it.
- [ ] **Step 2: Run it, expect RED.** `npx vitest run tests/scripts/sfx-bank-budget.test.js`. Expected: FAIL resolving `../../src/audio/sampleBankManifest.js`.
- [ ] **Step 3: Write the failing tool test** `frontend/tests/scripts/build-sfx-bank.test.js`.
  - `it('ffmpegArgs encodes mono 44.1 kHz 64 kbps CBR LAME with no metadata, peak gain applied, tail trimmed')`: `ffmpegArgs('a.ogg','b.mp3',-1.5)` contains, in order, `-i a.ogg`, `-ac 1`, `-ar 44100`, `-c:a libmp3lame`, `-b:a 64k`, `-map_metadata -1`, `-id3v2_version 0`, `-write_id3v1 0`, and an `-af` value containing `volume=-1.5dB` and `areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse`. The last element is `b.mp3`.
  - Run it and expect FAIL (module missing).
- [ ] **Step 4: Implement**
  - **`build-sfx-bank.mjs`:**
    - CLI: `node scripts/audio/build-sfx-bank.mjs --impact <unzipped impact dir> --rpg <unzipped rpg dir>`.
    - Guard the CLI with the `import.meta.url` / `process.argv[1]` check (cli-guard) and export `ffmpegArgs`.
    - For each `sfxFiles()` entry: the source is `<packDir>/Audio/<basename>.ogg`. Run `ffmpeg -i src -af volumedetect -f null -` and parse `max_volume`; set `gainDb = -3 - max_volume`; then run `ffmpeg -y ...ffmpegArgs(src, public/sfx/<file>, gainDb)`.
    - Print a per-file and total byte table.
  - **Packs:** download and unzip both zips into the session scratchpad (each in its own empty directory). BEFORE converting, verify both sha256 values against the table in §Current state, and read each pack's `License.txt` (`unzip -p <zip> License.txt`), which must contain `Creative Commons Zero, CC0`. Refuse on any mismatch. The repo credits nothing from Kenney, so this read IS the licence evidence (review finding 17), and its output goes into the commit body. Run the tool.
  - **`LICENSES.txt`:** for each pack, write name, version, page URL, zip URL, sha256 and retrieval date 2026-10-27, then its `License.txt` verbatim, then the line `Attribution is not required (kenney.nl/support); credited in Settings > Credits. Kenney's logo is not used.`
  - **`sampleBankManifest.js` and `sfxPacks.js`:** the values above. Set `SFX_BYTE_CEILING` to the measured total of the committed directory × 1.08, rounded up to the next 10,000. It can never exceed 500,000: the test literal above and the `bundle-budget.mjs` check hold that. With the draft (294,535 B + about 2 KB of LICENSES) that is 330,000. Put the measured total in a comment as `actualAtWrite`, the `bundle-budget.mjs:32-37` convention.
- [ ] **Step 5: Run both tests and expect PASS.** `npx vitest run tests/scripts/sfx-bank-budget.test.js tests/scripts/build-sfx-bank.test.js`.
- [ ] **Step 6: Mutation-prove the gate.** Back up with `cp` and restore from it; never `git checkout`.

  | Mutant | Test that goes red |
  |---|---|
  | M1.1: copy `punch`'s first file to `public/sfx/extra.mp3` | "every .mp3 on disk is in the manifest" |
  | M1.2: delete `public/sfx/knifeSlice2.mp3` | "every manifest file is on disk" |
  | M1.3: set `SFX_BYTE_CEILING = 290_000` (under the measured total; the sufficiency mutant) | "under SFX_BYTE_CEILING" |
  | M1.4: overwrite one `.mp3` with a 25,000 B copy | per-file ceiling |
  | M1.5: copy a source `.ogg` over one `.mp3` | "every .mp3 is an MP3" (OggS) |
  | M1.6: delete the `kenney-rpg` entry from `SFX_PACKS` | "LICENSES.txt credits every pack" |
  | M1.7: empty `SFX_GROUPS` to `{}` | the denominator test (`toBe(71)`), not a silent pass |
  | M1.10: raise `SFX_BYTE_CEILING` and `SFX_FILE_CEILING` to 950,000 / 30,000 in the manifest (the "re-encode at 192k" change) | "under the absolute cap" |
  | M1.11: add a third `SFX_PACKS` row with `licence: 'CC-BY 4.0'`, its sha in a new `LICENSES.txt` section without CC0 text, and one group using it | "each under its own CC0 licence" (both the `licence` assertion and the section scope) |
  | Identity: add a blank line to the manifest | all GREEN |

  Write the result in the test's `Mutation-Proof:` header line.
- [ ] **Step 7: Write the failing Credits test** `frontend/tests/integration/credits-sfx.test.jsx`.
  - `// @vitest-environment jsdom`, render `<CreditsScreen onClose={() => {}} />`, plus a `Mutation-Proof:` header line.
  - `it('renders a Sound effects panel naming every SFX_PACKS pack with CC0')`: the heading text equals `t('credits.sfx_heading')` in en. For each pack, `screen.getByText(pack.name)` exists and a sibling shows `CC0`. There is a link whose `href === 'https://kenney.nl'`. Assert the checked count equals `SFX_PACKS.length` (2).
  - `it('zh-CN resolves the two new keys')`: `strings['zh-CN']['credits.sfx_heading']` and `['credits.sfx_note']` are non-empty and differ from en.
  - Run it and expect FAIL (no heading).
- [ ] **Step 8: Implement the panel.**
  - In `CreditsScreen.jsx` after `:61` (the icons panel's closing tag; `:58` and `:60` are inside it), add a `Panel variant="inset" className="bg-slot flex flex-col gap-2 px-4 py-3"`, mirroring the icons panel. It holds:
    - a heading `t('credits.sfx_heading')`;
    - one `CreditRow label={pack.name} license="CC0"` per `SFX_PACKS` entry;
    - an author line linking "Kenney" to `https://kenney.nl` with the icons panel's link classes (`:48-53`);
    - a note `t('credits.sfx_note')`.
  - Make the body (`:43`) scroll on a short viewport. The modal centres with `place-items-center` (`:25`), which clips the top once the content is taller than the viewport. A `max-h-[85vh]` body alone does not fix that: at 844x390 it is 331 px plus a header of about 70 px, which is taller than 390 (review finding 13). So bound the CARD instead: add `max-h-[95dvh] flex flex-col` to the `Panel` at `:28`, keep the header (`:32`) at its natural height with `shrink-0`, and give the body `min-h-0 overflow-y-auto`.
  - Keys:
    - en: `'credits.sfx_heading': 'Sound Effects'`, `'credits.sfx_note': "Recorded sounds from Kenney's Impact Sounds and RPG Audio packs, released into the public domain (CC0)."`
    - zh-CN: `'credits.sfx_heading': '音效'`, `'credits.sfx_note': '录制音效来自 Kenney 的 Impact Sounds 与 RPG Audio 音效包，以 CC0 协议进入公共领域。'`
- [ ] **Step 9: Run and expect PASS.** `npx vitest run tests/integration/credits-sfx.test.jsx`, then `npm run test:unit` (the i18n adoption and key-resolution ratchets must stay green) and `npm run lint`. Mutation check:

  | Mutant | Test that goes red |
  |---|---|
  | M1.8: drop the `.map` over `SFX_PACKS` | the per-pack assertion |
  | M1.9: delete the zh-CN `credits.sfx_note` | the zh test and the repo's key-resolution gate |

- [ ] **Step 10: Look at it.**
  - Open Settings → Credits in the dev app at 1180x820 and 820x1180, in Chromium and in WebKit. Use the lookbook harness (`scripts/visual/lookbook.mjs`, landing with Phase 0d on `feat/instruments`), and add a `credits` shot to it in this unit once it is on `main`.
  - Also look at 844x390 (phone landscape): the header must be visible and the body must scroll.
  - Static UI, so motion-on frames add nothing here.
- [ ] **Step 11: Commit** (src, tests, public binaries; no baselines).
  - `git add frontend/public/sfx frontend/src/audio/sfxPacks.js frontend/src/audio/sampleBankManifest.js frontend/scripts/audio/build-sfx-bank.mjs frontend/tests/scripts/sfx-bank-budget.test.js frontend/tests/scripts/build-sfx-bank.test.js frontend/tests/integration/credits-sfx.test.jsx frontend/src/ui/CreditsScreen.jsx frontend/src/i18n/strings.js`
  - `git commit -m "feat(audio): a CC0 sample bank on disk (Kenney Impact Sounds + RPG Audio, 71 MP3s), credited in Settings and held to a byte ceiling"`
  - The body states the measured bytes (sfx total and `index` before and after) and the sha256 values.

---

### Unit 2: The bank loads after the first gesture, in its own chunk

**Files:**
- Create `frontend/src/audio/variantPicker.js`, `variantPicker.test.js`, `onset.js`, `onset.test.js`, `sampleBank.js`, `sampleBank.test.js`, `sampleBankHandle.js`, `sampleBankHandle.test.js`, and `frontend/tests/e2e/sound-bank.spec.js` (first committed as `tests/e2e/_pending/sound-bank.pending.js`; see the mutation path in Global Constraints).
- Create the CI mutation path: `.github/workflows/e2e-mutants.yml` and `frontend/tests/e2e/mutants/sound-bank.json`.
- Modify `frontend/src/SoundManager.jsx:443-459` (the first-gesture listener) and `:523-527` (`resumeAudio`).
- Modify `frontend/src/App.jsx` (hooks next to `readMobs`, `:335-338`).
- Modify `frontend/scripts/ci/bundle-budget.mjs` (after `:130`) and `frontend/scripts/ci/prod-smoke.mjs` (a final block after its existing checks).

**Interfaces:**
- **Consumes:** `SFX_DIR`, `SFX_GROUPS`, `sfxFiles()` (Unit 1).
- **Produces:**
  - `makeVariantPicker(count: number, rng = Math.random): () => number` returns −1 when `count === 0`, always 0 when `count === 1`, and otherwise never the previous index.
  - `onsetSeconds(buffer: AudioBuffer, threshold = 0.1): number` returns the time of the first sample on channel 0 with `|x| >= threshold * peak`, or 0 when the peak is 0.
  - `createSampleBank({ ctx, fetchImpl = fetch, baseUrl = SFX_DIR, groups = SFX_GROUPS, concurrency = 4 })` returns:
    - `load(): Promise<{ loaded: number, failed: number }>`;
    - `readonly state: 'idle'|'loading'|'ready'|'failed'`;
    - `pick(group: string): { buffer: AudioBuffer, offset: number, name: string } | null`;
    - `allow(group: string, nowMs: number, minMs = 40): boolean`;
    - `nameOf(buffer: AudioBuffer): string | null`, as `'<group>/<file>'`.
    - `state` is `'ready'` once every file has settled with `loaded > 0`, and `'failed'` when `loaded === 0`.
  - `primeSampleBank(ctx: AudioContext | null): void` is idempotent and returns at once when `!ctx`, `isCaptureMode()`, or `navigator.connection?.saveData === true`. `getSampleBank()` returns the bank only when `state === 'ready'`, else `null`. `readSampleBankStatus()` returns `{ state, loaded, failed, requested }`.
  - DEV hooks: `readSampleBank` returns `readSampleBankStatus()`; `sfxNameOf(buffer)` returns `getSampleBank()?.nameOf(buffer) ?? null`.
- **GPU:** 0.
- **index:** about 0.5 KB. Lazy chunk: about 4 KB.
- **Network:** 294,535 B (draft), after the first gesture.
- **Memory:** about 6.1 MB of decoded PCM.

- [ ] **Step 1: Write failing tests** `src/audio/variantPicker.test.js`. Each carries the `Mutation-Proof:` line at Step 9.
  - `it('never repeats the previous index, over 2,000 draws with an rng that keeps asking for the same slot')`: rng `() => 0.0` for count 4; consecutive equal pairs `=== 0`.
  - `it('reaches every index')`: seeded LCG rng, count 4, 400 draws; the set of results is `{0,1,2,3}`.
  - `it('count 2 alternates')`, `it('count 1 is always 0')`, `it('count 0 is -1')`.
- [ ] **Step 2: Write failing tests** `src/audio/onset.test.js`, using a `{ sampleRate, numberOfChannels: 1, getChannelData: () => Float32Array }` stand-in.
  - `it('finds the onset after 1,029 samples of silence at 44.1 kHz')` (about 23.3 ms; the punch file's measured lead): `toBeCloseTo(1029 / 44100, 5)`.
  - `it('is relative to the peak: a quiet file (peak 0.05) still finds its onset')`.
  - `it('a silent buffer is 0')`.
- [ ] **Step 3: Write failing tests** `src/audio/sampleBank.test.js`. The fake ctx has `decodeAudioData(ab) => Promise<AudioBuffer>` and the fake fetch returns `{ ok, arrayBuffer() }`.
  - `it('loads every manifest file and reports ready')`: `loaded === 71`, `state === 'ready'`, and the fetch was called with `'/sfx/' + file` for every file.
  - `it('tolerates partial failure: one 404 and one decode rejection leave 69 loaded, ready, and those two groups pick from the rest')`.
  - The fake `decodeAudioData` REJECTS any argument that is not an `ArrayBuffer`. A permissive fake would let a loader that passes the `Response` itself pass every unit test (review finding 14).
  - `it('all failures leave state failed and pick null')`.
  - `it('never runs more than 4 decodes at once')`: the fake tracks the maximum in flight.
  - `it('pick trims to the onset')`: `offset === onsetSeconds(buffer)`.
  - `it('pick never repeats within a group')`: through `makeVariantPicker`.
  - `it('allow gates a group for 40 ms and only that group')`: `allow('punch',1000)` is true, `allow('punch',1030)` is false, `allow('punch',1041)` is true, and `allow('bell',1030)` is true.
  - `it('nameOf returns group/file for a bank buffer and null for any other')`.
- [ ] **Step 4: Write failing tests** `src/audio/sampleBankHandle.test.js`. Mock `../devtest/captureMode` and `./sampleBank.js`, and call `_resetSampleBankForTests()` between tests.
  - `it('two primes start one load')`: the `createSampleBank` mock is called once.
  - `it('capture mode never loads')`.
  - `it('saveData never loads')`.
  - `it('a null ctx never loads')`.
  - `it('getSampleBank is null until ready')`.
- [ ] **Step 5: Run them and expect FAIL** (missing modules). `npx vitest run src/audio/variantPicker.test.js src/audio/onset.test.js src/audio/sampleBank.test.js src/audio/sampleBankHandle.test.js`.
- [ ] **Step 6: Implement** the four modules to the interfaces above.
  - `sampleBankHandle.js` loads the bank ONLY by `import('./sampleBank.js')` (dynamic), so Rollup emits it as its own chunk. It holds one module-level promise.
  - In `SoundManager.jsx`:
    - `resumeAudio` (`:523-527`) calls `primeSampleBank(audioContext.current)` after its resume;
    - the init effect (`:443-459`) adds `window.addEventListener(type, prime, { capture: true, once: true, passive: true })` for `pointerdown`, `keydown` and `touchstart`, where `prime = () => primeSampleBank(audioContext.current)`, and removes them in the effect's cleanup.
  - In `App.jsx`, register the hooks `readSampleBank` and `sfxNameOf`.
- [ ] **Step 7: Run and expect PASS,** then `npm run test:unit && npm run lint && npm run build && node scripts/ci/bundle-budget.mjs && node scripts/ci/cli-guard.mjs`.
- [ ] **Step 8: Add the bank-split check** to `bundle-budget.mjs`, after `:130`, following the lazy-panel pattern.
  - `const BANK_MARKER = 'impactPunch_heavy_000.mp3'` (a string only the manifest holds) must be ABSENT from the `index` chunk and present in exactly one other chunk.
  - Print `✓ sample bank: lazy in <file>, not in the boot chunk`.
  - **The absolute bank cap** (review finding 9). Sum the bytes of every file in `build/sfx/` (`public/` ships verbatim to `build/`). Fail when the sum is over `500_000`, with the literal and `process.exit(1)` on the SAME line, so raising the cap rewrites an assertion-bearing line of a `scripts/ci/` gate and the `mutation-proof-trailer` gate demands a receipt (`ASSERTION_RE`, `mutation-proof-trailer.mjs:47-48`). Also fail when `build/sfx/` holds 0 files (no vacuous pass). Print `✓ sfx bank: N files, B bytes / 500,000 absolute`.
- [ ] **Step 9: Mutation-prove Unit 2** (`cp` backup and restore):

  | Mutant | What goes red |
  |---|---|
  | M2.1: picker returns `Math.floor(rng() * count)` (repeats allowed) | "never repeats" |
  | M2.2: picker draws from `count - 1` without the skip | "reaches every index" |
  | M2.3: onset threshold absolute `0.1` (not × peak) | "quiet file" |
  | M2.4: loader uses `Promise.all` (one failure rejects the bank) | "partial failure" |
  | M2.5: no concurrency cap | "never more than 4" |
  | M2.6: `allow` keyed globally, not per group | the `bell` assertion |
  | M2.7: handle drops its memoised promise | "two primes start one load" |
  | M2.8: handle drops the `isCaptureMode()` check | "capture mode never loads" |
  | M2.9: `import { createSampleBank } from './sampleBank.js'` made static in the handle, then `npm run build` | `bundle-budget` "BANK_MARKER in the BOOT chunk" |
  | M2.13: copy one `.mp3` into `build/sfx/` 40 times under new names (pushes the sum over 500,000) | `bundle-budget` "sfx bank over the absolute cap" |
  | M2.14: `build/sfx/` emptied | `bundle-budget` "0 files" (not a pass) |
  | Identity: whitespace in `sampleBank.js` | all green |

  The `bundle-budget.mjs` commit carries the `Mutation-Proof:` trailer for M2.9, M2.13 and M2.14.
- [ ] **Step 10: The lived proof — e2e (CI)** `tests/e2e/sound-bank.spec.js`, test A part 1: "the bank loads after entering play, not before".
  - **Setup:** `page.on('request')` collects URLs. `bootDev(page)`. Before entering play, assert at least one `/src/` or `/@vite/` request was seen (the instrument is live; presence before absence). Then assert `readSampleBank().state === 'idle'` and zero `/sfx/` requests.
  - **Act:** `startPlayActive(page)`, then wait up to 30 s for `state === 'ready'`.
  - **Assert:** `loaded === 71`, `failed === 0`, and the `/sfx/` request count is 71.
  - **Failure messages (amended after review, finding 14):** first, before entering play, decode a tiny known-good MP3 embedded in the spec as a data URI with the page's own `AudioContext`. Only a failure of THAT control is `SETUP: this Chromium cannot decode MP3`. A bank decode failure after the control has passed is a FEATURE failure (`failed > 0`), because blaming the browser for a loader defect turns a killable mutant into COULD NOT CHECK (`mutate-e2e.sh:15-18`).
  - **Named mutant:** M2.10, delete the `primeSampleBank` call in `resumeAudio`, makes "state ready within 30 s" go RED. M2.15, the loader passes the `Response` instead of its `ArrayBuffer` to `decodeAudioData`, goes RED as a feature failure, not SETUP. Run them through the CI mutation path (Global Constraints) with an identity mutant in the same batch.
- [ ] **Step 11: The lived proof — production (CI)** `prod-smoke.mjs` final block, after every existing check.
  - It counts requests matching `/\/sfx\//` from `goto` on. After the existing frame checks, assert `0` such requests, and assert the same listener saw the `assets/index-` request (presence).
  - Then click a point that is known to be inert, a backdrop corner such as `(8, viewport.height - 8)`, not the centre. The centre may land on Start Adventure (`MenuSystem.jsx:66-73` requests pointer lock), and if headless Chromium grants the lock, `resumeAudio` primes the bank on its own, which would hide a missing gesture listener (review finding 15). When the first `/sfx/` request arrives, assert that `document.pointerLockElement === null` and that the active gate is still closed. If either is false, fail with `SETUP: the gesture click was not inert`, not as a pass. Wait up to 20 s for responses: all `sfxFiles().length` must be 200.
  - Print `sfx: 0 before the first gesture, 71/71 after`.
  - Also PRINT (no assert) the count of `/music/` requests before the gesture, which measures `MusicPlayer.jsx:27-28`'s eager construction (see Open questions).
  - **Named mutants:** M2.11 (prime moved into the init effect, so it loads eagerly) reddens "0 before". M2.12 (the gesture listener removed) reddens "71 after", which holds only because the click is inert. They run through the CI mutation path (`harness: 'prod-smoke'`), and the commit carries a `Mutation-Proof:` trailer that names the run id.
- [ ] **Step 12: Commit.** `feat(audio): the sample bank loads after the first gesture in its own chunk, never in capture or on saveData; no sound changes yet`. The body records the `index` bytes before and after and the lazy chunk's bytes. Do NOT push it to `main` alone: Units 2 and 3 reach `main` in one push.

---

### Unit 3: Combat bodies (hit, swing, heavy release, perfect dodge)

**Files:**
- Create `frontend/src/audio/impactRecipes.js`, `impactRecipes.test.js`, `startLayers.js`, `startLayers.test.js`, `layeredVoice.js` and `layeredVoice.test.js`.
- Modify `frontend/src/audio/sampleBank.js` (add `voice`), `frontend/src/render/SpatialAudioController.jsx:136-186`, `frontend/src/SoundManager.jsx:498-516`, `:582-584`, `frontend/src/game/attackSounds.js:6-11`, `attackSounds.test.js`, `frontend/src/systems/CombatSystem.jsx:25`, `:80-85`, `frontend/src/Components.jsx:236`, `:274`, `:299-301`, `frontend/src/App.jsx` (hooks `synthNameOf`, `readMasterBusInput`, `renderHitMatrix`), and `tests/e2e/sound-bank.spec.js`. `hitstop.js` is NOT modified, and the dodge (`:987-989`) and vault (`:1123-1125`) call sites are not edited: a swing without meta has no recipe.

**Interfaces:**
- **Consumes:** the bank (Unit 2).
- **Produces:**
  - `recipeFor(soundName: string, meta?: object): { keepSynth: boolean, layers: Array<{ group: string, gain: number, rate: number }> } | null` and `hitMaterialFor(mobType: string): 'flesh'|'armour'|'stone'`, following the tables in §Design.
  - `type Pick = { buffer: AudioBuffer, offset: number, rate: number, gain: number, name: string }`.
  - `bank.voice(soundName, meta, synth: { buffer: AudioBuffer|null, rate: number }, nowMs: number, rng = Math.random): { picks: Pick[], primary: number } | null`. It returns:
    - `null` when there is no recipe, or when any non-gated layer's group is unavailable (the caller then runs today's path);
    - `{ picks: [], primary: -1 }` when everything is gated and `keepSynth` is false (deliberately silent);
    - otherwise the synth pick (if `keepSynth` and `synth.buffer`; `offset 0`, `gain 1`, `rate synth.rate`, `name 'synth/<soundName>'`) followed by the layer picks, each at rate × (0.96 + rng × 0.08).
  - `Pick` also carries `maxSeconds` from its recipe layer (the synth pick: its buffer's full duration).
  - `startLayers(ctx, destination: AudioNode, picks: Pick[], when: number): AudioBufferSourceNode[]`. Per pick it builds source → `GainNode(pick.gain)` → `destination`, calls `start(when, pick.offset, pick.maxSeconds)`, schedules the 20 ms fade at `when + maxSeconds / rate - 0.02`, and disconnects both on `onended`. It is internal to `layeredVoice.js`; no call site imports it.
  - `longestIndex(picks: Pick[]): number` maximises `min(buffer.duration - offset, maxSeconds) / rate`.
  - `layeredVoice.js` (index chunk; each function chooses its destination itself, so a call site cannot route a layer around the bus, the slider or the occlusion filter):
    - `wireLayeredSpatialVoice(ctx, sound, voice): { filterNode }` sets the primary's buffer, offset, rate and `duration` cap; creates `primaryGain` and the occlusion `filterNode`; calls `sound.setFilters([primaryGain, filterNode])`; and returns `filterNode`. After the caller's `sound.play()`, a second call, `startSpatialLayers(ctx, filterNode, voice)`, sends every non-primary pick to `filterNode`, never to `sound.getOutput()`, `primaryGain` or `ctx.destination`.
    - `playLayered(ctx, getMasterBus, picks, volume)` sends every pick to `getMasterBus() || ctx.destination` at `gain × volume`.
    - `playAtListener(ctx, listener, picks, volume)` sends every pick to `listener.getInput()` (Unit 4, footsteps).
  - Call-site meta:
    - `playSpatialSound(name, position, rate, distance, jitter, meta)` takes a 6th argument;
    - `playSound(name, rate, meta)` takes a 3rd;
    - `useGameSounds().playSwing(meta)`;
    - `makeAttackSoundPlayer(...)()` now takes `(opts)` and forwards it to `playSwing`;
    - `damageMob(id, damage, type, source, spawnRing, sfx)` takes an optional 6th argument. Only `triggerMeleeAttack` passes it, as `{ melee: true, heavy, isCrit }`. `damageMob` plays `hit` with `sfx ? { mobType: entity.type, ...sfx } : undefined`, so every other `damageMob` caller (12 call sites in `src`) keeps today's synth.
- **GPU:** 0.
- **index:** about 0.9 KB. Lazy chunk: about +1 KB.
- **Per-frame (corrected after review, finding 7):** no per-frame code is added, and a layered event is still one voice with one ray march. But each recorded body keeps its voice alive longer than today's synth, so the live-voice count, and with it the per-frame rays, automation and HRTF work, grows. The `max s` caps bound it; Step 13 measures it.

- [ ] **Step 1: Write failing tests for the routing seam** `src/audio/layeredVoice.test.js` (amended after review, finding 1). `hitstop.js` is no longer touched: a hit's weight comes from the verb and the roll (§Design), so there is no `hitWeight` export and no `hitstop.test.js`. The routing tests come first because routing is the highest-severity requirement. They run against a fake ctx that records every node, every `connect(from, to)` edge and every `start` argument, and a fake `sound` that exposes `setBuffer`, `setPlaybackRate`, `setVolume`, `setFilters`, `getOutput()` (a fake panner), `offset` and `duration`.
  - `it('spatial: the primary chain is [primaryGain, filterNode], and every other layer connects to filterNode only')`: for a voice of 3 picks, each non-primary layer's gain node has exactly one outgoing edge, to the returned `filterNode`. None goes to `ctx.destination`, `sound.getOutput()` or `primaryGain`. The checked count equals `picks.length - 1` (2).
  - `it('spatial: the primary takes its offset, rate and duration cap')`.
  - `it('non-spatial: every layer reaches the master-bus input at gain × volume')`: `getMasterBus` returns a fake bus node, every source reaches it, and none reaches `ctx.destination`. When `getMasterBus` returns null, every source reaches `ctx.destination`, which is today's fallback (`SoundManager.jsx:510`).
  - `it('at the listener: every layer reaches listener.getInput()')`.
- [ ] **Step 2: Write failing tests** `src/audio/impactRecipes.test.js`.
  - `it('every MOB_TYPES key and "boss" resolves to a material')`: the checked count is `Object.keys(MOB_TYPES).length + 1` (11); skeleton → armour, moss_brute → stone, boss → armour, zombie → flesh, and `'gloop'` → flesh.
  - `it('hit: light is synth + body; heavy adds thud; crit adds metal; crit wins over heavy')`: assert the exact `layers` arrays from the §Design table for a zombie with `{ melee: true }`, `{ melee: true, heavy: true }`, `{ melee: true, isCrit: true }` and `{ melee: true, heavy: true, isCrit: true }`.
  - `it('no meta, no recipe')` (review findings 2-4): for every `soundName` with a meta-keyed recipe (`hit`, `swing`, `footstep`, `blockBreak`, `blockPlace`, `pickup`), `recipeFor(name)` and `recipeFor(name, {})` are `null`. So is `hit` with `{ mobType: 'zombie', damage: 45 }` (no `melee`). The checked count is printed and asserted: 6 names.
  - `it('swing: heavy draws, melee slices, and a swing without meta (dodge, vault) has no recipe')`.
  - `it('parry rings the bell')`.
  - `it('every group any recipe can name exists in SFX_GROUPS, and every SFX_GROUPS group is named by some recipe')`: enumerate the full input domain; this catches dead bytes in the bank and dangling names.
  - `it('an unknown soundName has no recipe')`.
- [ ] **Step 3: Write failing tests** `src/audio/startLayers.test.js`, against the same fake ctx. This is the callee half; Step 1 is the caller half.
  - `it('connects each layer only to the given destination')`.
  - `it('starts each source at when with its pick offset and its maxSeconds')`.
  - `it('schedules a 20 ms fade that ends at the cap')`.
  - `it('disconnects source and gain on ended')`.
  - `it('longestIndex picks the longest effective, capped duration')`: a 0.15 s synth pick vs a 0.6 s body at rate 0.92 gives the body; the same body at offset 0.55 gives the synth; a 0.6 s body capped at 0.40 vs a 0.45 s synth gives the synth.
- [ ] **Step 4: Extend** `sampleBank.test.js` with `describe('voice')`.
  - `it('hit on a zombie returns [synth, punch] with primary = the longer')`.
  - `it('a second hit within 40 ms returns [synth] only')`: the body is gated and the synth is kept.
  - `it('returns null when the body group failed to load')`: the caller falls back.
  - `it('applies ±4% to samples and leaves the synth rate untouched')`: rng 0 gives 0.96 × rate, rng ≈1 gives about 1.04 × rate, and the synth rate equals the input.
- [ ] **Step 5: Extend** `attackSounds.test.js` with `it('forwards opts to playSwing, not to the delayed playAttack')`.
- [ ] **Step 6: Run all and expect FAIL.** `npx vitest run src/audio/layeredVoice.test.js src/audio/impactRecipes.test.js src/audio/startLayers.test.js src/audio/sampleBank.test.js src/game/attackSounds.test.js`.
- [ ] **Step 7: Implement the pure modules** and `bank.voice`. `sampleBank.js` imports `recipeFor` (lazy chunk).
- [ ] **Step 8: Wire the spatial path** (`SpatialAudioController.jsx:136-186` only; `:205-278` is move 2's region, so leave it).
  - After the `:138` guard, compute `synthRate` exactly as `:148` does today, then `const v = getSampleBank()?.voice(soundName, meta, { buffer: sounds[soundName], rate: synthRate }, performance.now())`.
  - If `v` is `null`, run today's body unchanged. If `v.picks.length === 0`, return.
  - Otherwise build the `PositionalAudio` and its `soundSource` as today, then call `const { filterNode } = wireLayeredSpatialVoice(audioContext, sound, v)`, `sound.setVolume(volume)`, `sound.play()` and `startSpatialLayers(audioContext, filterNode, v)`. The call site names no destination.
  - `activeSoundObj.filterNode` is the returned occlusion filter, so the `useFrame` loop is untouched. The other layers ride the primary's lifetime, which is the longest by construction (capped lengths, Step 3).
  - Do not rely on `:175-181`'s handler, which never runs (§Current state). Layers clean up through `startLayers`' own `onended`, and the primary through the frame prune. Wiring that handler before `play()` is a separate commit, if it is done at all.
  - In the same `setState`, DEV only: `readSpatialVoiceCount: () => activeSpatialSoundsRef.current.length` (review finding 7).
- [ ] **Step 9: Wire the non-spatial path** (`SoundManager.jsx:498-516`).
  - `playSound(soundName, playbackRate = 1, meta)`. After the existing guard, `v = getSampleBank()?.voice(soundName, meta, { buffer: sounds.current[soundName], rate: playbackRate }, performance.now())`.
  - If `v` is null, run today's body. If it has no picks, return.
  - Otherwise `playLayered(ctx, getMasterBus, v.picks, volume)`. The call site names no destination.
  - `playSwing: (meta) => playSound('swing', 0.8 + Math.random() * 0.4, meta)` (`:583`).
- [ ] **Step 10: Pass meta at the call sites.**
  - `attackSounds.js` returns `(opts) => { playSwing(opts); schedule(() => playAttack(), delayMs); }`.
  - `Components.jsx:236`: `store.playAttackSounds?.({ melee: true, heavy })`.
  - `:274`: `GameMethods.damageMob(mob.id, swing, sparkType, 'player', true, { melee: true, heavy, isCrit })`. `isCrit` is already in scope (`:247`); the explicit `'player', true` are today's defaults (`CombatSystem.jsx:25`).
  - `:300`: `playSpatialSound('hit', bp, 1.1, 30, true, { mobType: 'boss', melee: true, heavy, isCrit })`.
  - `CombatSystem.jsx:25`: add the 6th parameter `sfx`. `:82`: `store.playSpatialSound('hit', [x, y, z], 1, 20, true, sfx ? { mobType: entity.type, ...sfx } : undefined)`. Spells, burn ticks, zones, hurl, allies and the DEV kill pass no `sfx` and keep the synth (review finding 4).
  - The dodge (`:988`) and vault (`:1124`) are not edited: a swing without meta has no recipe.
  - `App.jsx` DEV hooks:
    - `synthNameOf(buffer)` returns the `VOICES` key whose `sounds[key] === buffer`, or null. Expose it through a `getSounds()` reader on the SoundProvider value, which already has `sounds` (`:545`).
    - `readMasterBusInput()` returns `getMasterBus()`, for the e2e routing check.
    - `renderHitMatrix()` is the test C instrument (Step 13).
- [ ] **Step 11: Run and expect PASS.** Then `npm run test:unit && npm run lint && npm run build && node scripts/ci/bundle-budget.mjs`.
- [ ] **Step 12: Mutation-prove Unit 3:**

  | Mutant | What goes red |
  |---|---|
  | M3.2: `hitMaterialFor` always returns `'flesh'` (plausible-wrong) | the skeleton and moss_brute assertions, and e2e A part 2 |
  | M3.3: crit tail swapped to `thud` | "hit ... crit adds metal" |
  | M3.4: `startLayers` connects to `ctx.destination` | "connects each layer only to the given destination" |
  | M3.5: `startLayers` drops the offset | "starts ... with its pick offset" |
  | M3.6: `longestIndex` returns 0 | "longestIndex picks the longest" |
  | M3.7: `voice` drops `keepSynth` | "returns [synth, punch]" |
  | M3.8: `attackSounds` stops forwarding opts | the forward test |
  | M3.11: `startSpatialLayers` sends layers to `ctx.destination` (bypasses Mute All, the slider, the limiter, occlusion) | "spatial ... connects to filterNode only", and the e2e routing check |
  | M3.12: ... to `sound.getOutput()` (the panner; skips occlusion) | "spatial ... connects to filterNode only" |
  | M3.13: ... to `primaryGain` | "spatial ... connects to filterNode only" |
  | M3.14: `playLayered` sends to `ctx.destination` | "non-spatial: every layer reaches the master-bus input" |
  | M3.15: `damageMob` plays `hit` with `{ mobType: entity.type, melee: true }` whatever `sfx` is | "no meta, no recipe" cannot see a call site, so: e2e A part 2's DoT control |
  | M3.16: `heavy` wins over `isCrit` | "crit wins over heavy" |
  | M3.17: `wireLayeredSpatialVoice` drops the `duration` cap | "the primary takes its ... duration cap" |
  | Identity | all green |

- [ ] **Step 13: The lived proof — e2e (CI)**, test A part 2, test B and test C.
  - **Instrument:** an `addInitScript`, installed before any node exists, wraps two methods.
    - `AudioBufferSourceNode.prototype.start` pushes `{ node: this, buffer: this.buffer, t: performance.now() }` onto `window.__sfxStarts`.
    - `AudioNode.prototype.connect` records each `from → to` edge between nodes (AudioParam targets are ignored) in a page-side `Map` (review finding 1).
    - Each start is then labelled in the page: `sfxNameOf(buffer)` gives `'<group>/<file>'` for a bank buffer; otherwise `'synth/' + synthNameOf(buffer)`; anything else is `'other'`. The assertions below match on those labels.
  - `test.setTimeout(240000)`, as `heavy-melee.spec.js:34` needed.
  - **Test A part 2, "a real melee hit plays the synth transient AND a recorded body of the mob's material, and the tail follows the verb and the roll"** (amended after review, finding 5):
    - Setup: the heavy-melee setup (`tests/e2e/heavy-melee.spec.js:41-70`): a `moss_brute` 2.5 m along the camera's facing, other hostiles cleared, the world frozen by a hitstop.
    - Act, three hits, each in its own window, spaced past the 300 ms melee cooldown and the 40 ms gate:
      1. a tap with `Math.random` pinned to 0.999 (no crit roll);
      2. a tap with `Math.random` pinned to 0.0 (a crit roll);
      3. a charged release (that spec's full hold) with `Math.random` at 0.999. Only the window after the RELEASE counts; the press's own tap falls before it.
    - Gates alongside the subject (read and asserted first): the brute's health dropped in each window.
    - Subject: each window holds `synth/hit` and a `mining/…` body (stone material). Window 1 holds no tail, window 2 a `metal/…` tail and window 3 a `thud/…` tail. The expected tail comes from the verb and the pinned roll, not from the damage, so the check is not the rule checking itself.
    - DoT control: from the page, `GameMethods.damageMob(id, 1, 'fireball', 'player-dot')`. It starts `synth/hit` and ZERO bank buffers (kills M3.15).
    - **Routing check (finding 1):** for every bank start so far, a BFS over the recorded edges from its source node must reach `readMasterBusInput()`. With that bus-input node removed from the graph, the same BFS must NOT reach `ctx.destination`. Then set `masterMuted: true` in the store and hit again: the bus input's `gain.value` is 0 and the same BFS holds. Print `routing: N bank sources checked, all through the bus`, and assert N ≥ 4 (the denominator).
    - **Live voices (finding 7):** sample `readSpatialVoiceCount()` every 100 ms through the hits and print the max and mean. Test B prints the same, which is the synth-only "before". In CI this is informational (a SwiftShader runner); the real-hardware numbers come from the lookbook run on this Mac and go in the commit body.
  - **Test B, "with /sfx/ blocked the game still sounds":**
    - Setup: `page.route('**/sfx/**', r => r.abort())` before boot, then `startPlayActive`. Wait for `readSampleBank().state === 'failed'`, which shows the failure path happened rather than a slow load. (The decode control from Unit 2 Step 10 runs first, so `failed` here is the abort, not the browser.)
    - Subject: the same hit starts `synth/hit` and zero bank buffers.
  - **Test C, "the tiers and the materials are distinguishable", measured, not listened to** (review finding 10). It runs in the same page as part 1, after the bank is ready, with no gameplay.
    - `renderHitMatrix()` covers light, heavy and crit × flesh, armour and stone (9 cells). For each cell it builds the voice with rng 0.5 and an advancing `nowMs`, so nothing is gated. It renders the voice through an `OfflineAudioContext(1, 0.6 × 44100, 44100)` with the real decoded buffers and the real recipe gains via `startLayers`, and renders the synth pick alone too. Per cell it returns the RMS over 0-300 ms and the spectral centroid of the first 2,048 samples after onset (a direct DFT is fine at that size).
    - Assert: (a) every cell's full RMS is at least 1.25 × its synth-only RMS, so the body is not buried; (b) within each material, light, heavy and crit differ pairwise by at least 15% in RMS or at least 10% in centroid; (c) within each tier, flesh, armour and stone differ pairwise by at least 10% in centroid. Print the 9 × 3 matrix.
    - The floors are starting proxies for "sounds different", not a measurement of hearing. The first CI run's matrix goes in the commit body, along with any floor change and its reason.
  - **Named mutants (CI mutation path, Global Constraints, with an identity mutant):**
    - M3.9 (`triggerMeleeAttack` stops passing `sfx`) reddens "a mining body".
    - M3.10 (`voice` always returns null) reddens test A and leaves test B GREEN, which is the control showing the synth path is intact.
    - M3.11 reddens the routing check.
    - M3.15 reddens the DoT control.
    - M3.18 (every hit layer's gain set to 0.05) reddens test C (a).
- [ ] **Step 14: By ear: optional, and NOT acceptance** (review finding 10). This session cannot hear, and Kevin has said he will not review or confirm (DECISIONS.md, 2026-10-27 "The Crafty command session's mandate"). Test C is the acceptance for "each sounds different". If anyone tunes by ear, only the §Design table moves, test C is re-run, and its matrix goes in the commit body.
- [ ] **Step 15: Commit.** `feat(audio): hits carry a material and a weight, the swing has steel, the heavy draws a blade, the perfect dodge rings — recorded bodies layered over the synth, one spatial voice per event`.

---

### Unit 4: Ground and blocks (footsteps, break, place, pickup)

**Files:**
- Modify `frontend/src/world/climate.js:25`, `frontend/src/audio/impactRecipes.js` and its test, `frontend/src/audio/sampleBank.test.js`, `frontend/src/render/SpatialAudioController.jsx:136-186` (the listener-local branch), `frontend/src/Components.jsx:1305`, `:1310`, `frontend/src/world/Terrain.jsx:956`, `:696-706`, `frontend/src/SoundManager.jsx:561-576`, `frontend/src/systems/LootSystem.jsx:56`, `frontend/src/App.jsx` (hooks `readFootstepType`, `readXPOrbCount`), and `tests/e2e/sound-bank.spec.js`.

**Interfaces:**
- **Consumes:** `voice`, `playAtListener` (Unit 3).
- **Produces:**
  - `FOOTSTEP_TYPES: readonly string[]` (the six values of `FOOTSTEP_TYPE`).
  - `blockFamily(blockName: string): 'mining'|'plank'|'glass'|'soft'`.
  - Recipes `footstep`, `blockBreak`, `blockPlace` and `pickup` per §Design. The `footstep` recipes carry `atListener: true`, and the landing layer carries `gateKey: 'land'`; `allow` is keyed on `layer.gateKey ?? layer.group`.
  - `voice(...)` passes `atListener` through to its result.
  - DEV hook `readFootstepType(x, z)`.
- **GPU:** 0. **index:** about 0.3 KB.

- [ ] **Step 1: Write failing tests** (extend `impactRecipes.test.js` and `sampleBank.test.js`):
  - `it('every FOOTSTEP_TYPES surface has a step group; landing is louder and lower')`: 6 checked.
  - `it('a footstep without a surface has no recipe; an unknown surface falls back to the default group')`: `recipeFor('footstep', {})` is null, and `recipeFor('footstep', { surface: 'lava' })` names `step_grass` (review finding 3).
  - `it('every BLOCK_ID name maps to a family')`: 15 checked; diamond → mining, wood → plank, glass → glass, leaves → soft, and `'unobtainium'` → soft.
  - `it('blockBreak and blockPlace without a block have no recipe')` (review finding 2).
  - `it('blockPlace: wood → woodTap, glass → glass, stone → tap')`.
  - `it('footstep, blockBreak, blockPlace and pickup do not keep the synth')`.
  - `it('pickup: loot gets leather; no meta has no recipe')` (review finding 4).
  - In `sampleBank.test.js`: `it('a stride step and a landing in the same millisecond both play')`. `voice('footstep', { surface: 'grass' }, …, 1000)` and then `voice('footstep', { surface: 'grass', landing: true }, …, 1000)` each return one pick (review finding 6).
- [ ] **Step 2: Run and expect FAIL.** `npx vitest run src/audio/impactRecipes.test.js src/audio/sampleBank.test.js`.
- [ ] **Step 3: Implement.**
  - **Recipes:** `export const FOOTSTEP_TYPES = Object.freeze(Object.values(FOOTSTEP_TYPE))` in `climate.js`, and the recipes.
  - **Footsteps:**
    - `Components.jsx:1305` passes `..., 5, true, { surface: t })` and `:1310` passes `..., 8, true, { surface: t, landing: true })`.
    - In `playSpatialSound` (`SpatialAudioController.jsx:136-186`), when `v.atListener` is set, call `playAtListener(audioContext, listenerRef.current, v.picks, volume)` and return. No `PositionalAudio` is built, so nothing is added to `activeSpatialSoundsRef`, and the underground filter and the cave reverb still apply, because `listener.getInput()` feeds them (`:120-130`). (Review finding 7.)
  - **Place and pickup:** `SoundManager.jsx` `playBlockPlace(pos, type)` passes `{ block: type }`. `playPickup(meta)` passes its meta through, and only `LootSystem.jsx:56` calls it with `{ loot: true }`. XP orbs (`XPOrbSystem.jsx:35`) and trading (`TradingInterface.jsx:39`, `:57`, `:70`) are not edited and keep the synth.
  - **Break:**
    - `Terrain.jsx:956` becomes `if (!getSampleBank()) playBlockBreak(h.hitPoint);`. This is the synth fallback; a ready bank plays the body from the worker message. `playBlockBreak` passes no `block`, so even if this guard is lost, the meta-less call plays `synth/blockBreak`, which the e2e can see, and never a `soft` body (review finding 2).
    - In the `block_broken` handler (`:696-706`), after the inventory add: `const b = getSampleBank(); if (b) store.playSpatialSound?.('blockBreak', [payload.x + 0.5, payload.y + 0.5, payload.z + 0.5], 1, 20, true, { block: blockForId(payload.blockType) })`.
    - Boss-broken blocks (`BossEntity.jsx:78-81`) then crumble too, held by the 40 ms per-group gate.
- [ ] **Step 4: Run and expect PASS.** Then `npm run test:unit && npm run lint && npm run build && node scripts/ci/bundle-budget.mjs`.
- [ ] **Step 5: Mutation-prove Unit 4:**

  | Mutant | What goes red |
  |---|---|
  | M4.1: `blockFamily` returns `'soft'` for everything (plausible-wrong) | the diamond assertion, and e2e A part 3's stone mine |
  | M4.2: footstep recipe keeps the synth | "do not keep the synth" |
  | M4.3: `step_` + a hard-coded `'grass'` in the recipe | the 6-surface test |
  | M4.4: the `Terrain.jsx:956` guard inverted | test B "mining starts synth/blockBreak" (bank failed: nothing plays), and test A "ZERO synth/blockBreak" (bank ready: the meta-less synth plays). Corrected after review, finding 2: before the no-`block` → null rule, test A could not see it |
  | M4.7: the `Terrain.jsx:956` guard deleted | test A "ZERO synth/blockBreak" and "exactly one bank start" |
  | M4.8: `Components.jsx:1305` passes `{ surface: 'grass' }` (hard-coded at the call site) | e2e A part 3's walk on a non-default surface |
  | M4.9: the landing layer loses `gateKey: 'land'` | "a stride step and a landing in the same millisecond both play", and e2e A part 3's jump |
  | M4.10: `playPickup` passes `{ loot: true }` for every caller | "pickup ... no meta has no recipe" cannot see a call site, so: e2e A part 3's XP-orb control |
  | Identity | all green |

- [ ] **Step 6: The lived proof — e2e (CI)**, test A part 3, in the same world as parts 1 and 2.
  - **Reset part 2's world first** (review finding 11). Part 2 froze the world for 120 s (`heavy-melee.spec.js:67`) and pinned `Math.random`, and player motion is scaled by `worldTimeScale(..., hitstopUntil)` (`Components.jsx:1206-1210`). So: restore `Math.random`, set `hitstopUntil: 0`, set `masterMuted: false`, and wait two frames. The `test.setTimeout(240000)` from Unit 3 covers this part.
  - **Mining:** reuse `build-placement.spec.js:31-55`'s synthetic-hit verb drive through `GameMethods.terrainVerbs` (`Terrain.jsx:1068`).
    - Place `stone` at a cell, then `mine()` it. Expect exactly ONE bank start across ALL groups within 1,500 ms, and it is `mining/…`. Expect ZERO `synth/blockBreak`. Print every group seen in the window.
    - Place `wood`, then mine it. Expect `plank/…`.
    - Print the mine-to-body latency for both, so the worker round trip is measured (informational in CI; see Risk 1).
  - **Footsteps** (amended after review, finding 3):
    - Scan `readFootstepType(x, z)` on rings of 4-32 m around the player, inside the already-loaded radius, for a dry column whose surface is NOT the default `grass`. Teleport the player body there (the store's `playerRigidBodyRef`, the ref `SpatialAudioController.jsx:26` reads) to that column's surface height + 2. If no such column exists within the radius, fail with `SETUP: no non-grass column within 32 m`, which is never a pass.
    - Hold `KeyW` for 2,000 ms with real keyboard input.
    - Gate: the player moved ≥ 2 m (read the position before and after).
    - Subject: ≥ 3 starts in `step_<readFootstepType(x, z)>/…`, and that surface is not `grass`. Print the surface.
    - **Landing** (finding 6): hold `KeyW`, press `Space`, and keep holding until grounded again. Within 50 ms of the touchdown, there are TWO `step_…` starts (the stride and the landing).
    - **XP-orb control** (finding 4): BEFORE the world reset, kill part 2's brute from the page with `GameMethods.damageMob(id, 9999, 'physical', 'player')`. A player kill spawns up to 6 XP orbs at the brute (`CombatSystem.jsx:123-141`), 2.5 m away and inside the magnet range. Read the count with a new DEV hook `readXPOrbCount` (`xpOrbsQuery.entities.length`, registered next to `readMobs`). Then do the reset, so the orbs can move, and wait until the count is 0. Every collection starts `synth/pickup`, there are zero `leather/…` starts, and the number of `synth/pickup` starts equals the number of orbs spawned (today's behaviour: every orb chimes).
  - Test B adds: with `/sfx/` aborted, mining starts `synth/blockBreak`.
  - **Named mutants (CI mutation path, with an identity mutant):**
    - M4.5 (drop the `block_broken` play) reddens "one mining start".
    - M4.6 (drop the footstep meta) now gets no recipe, so it plays `synth/footstep` and fails "≥ 3 step_<surface> starts" on any surface.
    - M4.7 reddens "exactly one bank start".
    - M4.8 reddens the non-grass walk.
    - M4.9 reddens the landing check.
    - M4.10 reddens the XP-orb control.
- [ ] **Step 7: By ear: optional, and not acceptance** (see Unit 3 Step 14). If anyone walks the surfaces by ear, record what changed. The dirt-step choice (Open question 1) is decided by measurement instead: in test C's harness, render `step_dirt` against `step_grass` and keep `step_dirt` only if their centroids differ by at least 10%.
- [ ] **Step 8: Commit.** `feat(audio): the ground has a voice — footsteps by surface, breaks and places by block, a leather pickup; a break body sounds on the worker's block_broken, with the debris`.

## Acceptance (lived proof)

**What would still pass if the feature were deleted?**
- Every unit test of the pure core would pass, and so would the bundle-budget gate. So none of them is the acceptance.
- The acceptance is `tests/e2e/sound-bank.spec.js` in CI on the exact commit:
  - test A shows a recorded buffer STARTING in the running game on a real melee click (with the tail the verb and the roll call for), a mined block of a known material, and real `KeyW` steps on a non-default surface, each with the right group. Its routing check shows every bank source passing through the master bus, with Mute All on and off;
  - test B shows the synth still starting when the bank cannot load;
  - test C shows, by measurement, that light, heavy and crit, and flesh, armour and stone, render differently and that the body is not buried under the synth. Nobody's ears are the acceptance (amended after review, finding 10).
- Deleting the feature (M3.10: `voice` returns null) turns A red and leaves B green. Deleting the load (M2.10) turns A red at its first assertion.
- Every named e2e and prod-smoke mutant is scored through the CI mutation path (Global Constraints), so these receipts exist only after a run on a runner (review finding 8).

**Production deferral.** The `prod-smoke.mjs` block on the production bundle shows: 0 `/sfx/` requests before the first gesture and 71/71 after it.

**WebKit decode.** A manual probe, `node scripts/visual/sfx-bank-probe.mjs --engine webkit`, is created in Unit 2 alongside the e2e. It uses Playwright WebKit against the DEV server, clicks once, then reads the `readSampleBank` hook and requires `state 'ready'` and `loaded 71`. It is registered in `PROBE_PORTS` (`scripts/visual/_serve.mjs:107`) with the next free port; its `finally` kills the browser and the vite group, then `kill-test-procs.sh` sweeps. macOS WebKit is not iPadOS, so this proves the engine decodes MP3, not the iPad.

**Eyes.** The Credits modal at 1180x820 and 820x1180, in Chromium (ANGLE-Metal) and WebKit, opened by eye (Unit 1 Step 10). Nothing else in this milestone is visual. The 31 capture frames must stay inside their gate untouched; if one moves, that is a defect.

**Ears: not an acceptance tier** (amended after review, finding 10). The earlier text made Kevin's ears on the M3 Max and the iPad the tier-0 check. Kevin has said he will not review or confirm (DECISIONS.md, 2026-10-27), and this session cannot hear. Test C replaces that tier. Anyone who does listen on the live site (hits on a husk vs a moss brute, a heavy, a perfect dodge, footsteps on grass vs sand vs the stone near the Hearth, mining stone vs wood) gives input to tuning, not a pass or a fail.

**Heat** (amended after review, finding 7). No GPU change, and no code is added per frame. But per-frame audio work scales with LIVE voices: the SpatialAudioController loop (rays and two automation writes per voice) and three's six panner ramps and HRTF per voice. Recorded bodies live longer than today's synth. The `max s` caps and the listener-local footsteps bound that, and Unit 3 Step 13 prints the live-voice max and mean with the bank and without it. The real-hardware pair (this Mac, lookbook run) goes in the Unit 3 commit body. On the move-2 power A/B, if it is run, a standing-still capture and a 10 s fight before and after must not differ beyond noise.

**Process.**
- A fresh `/code-review xhigh` per unit's change range.
- One adversarial reviewer at xhigh (Workflow stage, `agentType: 'adversarial-reviewer-kz'`, `model: 'claude-opus-5-5'`, `effort: 'xhigh'`) on the runtime seam in Unit 3: `SpatialAudioController.jsx:136-186` and `layeredVoice.js` with three's filter chain, the routing of every layer, and the voice lifetime vs layer lifetime.

## i18n, touch, game-loop isolation, no-emoji

- **i18n.** The only player strings are `credits.sfx_heading` and `credits.sfx_note` (en and zh-CN, Unit 1 Step 8).
  - Pack names (`Impact Sounds`, `RPG Audio`), the author name `Kenney` and the tag `CC0` are proper nouns and licence identifiers. They render from `SFX_PACKS` data and are not translated, matching the existing `CreditRow label="Lilita One" license="OFL"` (`CreditsScreen.jsx:66`).
  - The zh-CN copy is plain mainland UI register.
- **Touch and iPad.** No new verb. The first-gesture listener includes `touchstart` and `pointerdown`, so the iPad's first tap primes the bank. `resumeAudio` still runs on the existing entry path (`App.jsx:950-957`; `MenuSystem.jsx:66-74` sets the gate on touch).
- **Game-loop isolation.**
  - The bank is a module singleton.
  - `getSampleBank()` is a plain read inside `playSpatialSound`, which `useFrame` callers already reach through `useGameStore.getState()` (footsteps, `Components.jsx:1300`).
  - Bank readiness never enters React state or zustand.
  - The `useFrame` in `SpatialAudioController.jsx:205-278` is not edited.
- **No emoji** in any new or edited `src/` file. The zero-emoji gate runs in `test:unit`.

## Risks

1. **Worker latency on a break.** The break body waits for `block_broken`, so while chunks stream the worker can queue it behind generation work. Unit 4 Step 6 PRINTS the latency in CI, but the e2e renders on SwiftShader (`playwright.config.js:4-5`), which `prod-smoke.mjs:156-158` measured at 1-3 frames per second, so its number says nothing about a player's device (review finding 16). The decision number is measured on real hardware: the WebKit probe (`sfx-bank-probe.mjs`) and the lookbook run on this Mac each print the mine-to-body latency. If either exceeds about 80 ms, keep a short synth click in `mine()` when the bank is ready, and record the decision in DECISIONS.md. The debris burst has always had the same latency (`BlockParticleSystem.jsx:41-44`), so sound and debris stay in sync either way.
2. **MP3 decode differs per engine.** Open-source Chromium (Playwright) and WebKit are both expected to decode MP3. The e2e reports a decode failure as `SETUP`, and the WebKit probe checks the other engine. The `decodeAudioData` promise form needs Safari 14.1 or later. Encoder delay is handled by `onsetSeconds`, not by trusting the LAME header.
3. **iPad memory.** About 6.1 MB of decoded PCM. If the iPad probe shows memory pressure, trim the groups to 3 variants each, which is about 4.6 MB.
4. **Tonal clash with the music.** The ElevenLabs tracks (`MusicPlayer.jsx`) are separate; check this by ear in Unit 3 Step 14 and Unit 4 Step 7, and adjust gains in the one recipe table.
5. **Lane overlap.**
   - Move 2 ("cool by budget") will edit `SpatialAudioController.jsx:205-278` and the `SoundManager` suspend-on-hidden path. This milestone edits only `:136-186`, `playSound`, `resumeAudio` and the init effect. Whichever lands second rebases.
   - The roadmap lists move 2's audio fixes ("automation written only on change, suspend while hidden") as a dependency of this move. But nothing schedules them: the umbrella plan's Phase 0g row names no audio work, and no plan under `docs/superpowers/plans/` covers them (searched 2026-10-27). So this plan does not wait for them. It bounds its own live-voice cost (the `max s` caps, listener-local footsteps) and measures it (Unit 3 Step 13). If move 2's audio half is planned before Unit 3 starts, Unit 3 goes after it (review finding 7).
   - `feat/steady-cool` and `feat/parked-looks-perf` both add `thunder` to `synthVoices.js:707-774`. This milestone does not touch `synthVoices.js`.
6. **Footsteps follow the GENERATED surface, not the real block** (`climate.js:15`). So the Hearth's stone pad and player-built floors sound like the biome underneath. This is pre-existing (the rate mapping already did the same) and is listed as Open question 3.
7. **Boss block breaks become audible.** That is intended, and the 40 ms per-group gate holds it to about one body per 40 ms.
8. **CI time** (corrected after review, finding 16). It is NOT spread across the three shards. `playwright.config.js:14-15` sets `fullyParallel: false`, and without `fullyParallel` Playwright assigns whole FILES to shards (playwright.dev/docs/test-sharding, "Sharding without fullyParallel", read via Context7 on 2026-10-27). So all of `sound-bank.spec.js` (test A's three parts, B and C, two boots) lands on ONE shard, whose job limit is 25 minutes (`ci.yml:83`) and which has been cancelled at that limit (DECISIONS.md, 2026-10-27). Before adding the spec, read the last green run's per-shard durations (`gh run view <id> --json jobs`). If the shard that receives it would end within 5 minutes of the limit, split test B (and its boot) into its own file, `sound-bank-fallback.spec.js`, so file-level sharding can place it elsewhere.
9. **Cache.** Vercel serves `/sfx/` under fixed names with default revalidation (`frontend/vercel.json` has no headers). A re-encoded file under the same name must therefore change bytes, which it will. The 304 round trips are acceptable.

## Out of scope

- **Recorded bodies under the roar, the aggro growl and mob windups.** Neither CC0 pack holds a creature voice (both zip listings read in full), so the roadmap's "recorded bodies under the dragon roar and the windup voices" has no free source here. See Open question 2.
- Anything from the Sonniss GDC bundle (licence unread).
- The music, and `MusicPlayer.jsx:27-28`'s eager `preload = 'auto'` construction. Unit 2 measures it but does not change it.
- Aspect-verb and spell voices (`grab`, `hurl`, `slam`, `bind`, `ignite`, `freeze`, `zap`, `rune`, `magic*`) and UI foley.
- Move 5's combat-stance string and finisher. When it lands, it adds a `finisher` weight row to the recipe table.
- Moves 11, 12 and 14 (impacts, lantern ignite, shrine beam) reuse this bank by adding groups. Each addition raises `SFX_BYTE_CEILING` in its own commit, stating what grew.
- Voice stealing beyond the per-group rate gate. No global voice cap exists today, and this milestone adds no voices per event. Voices do live longer, which the `max s` caps bound and Unit 3 measures.
- Move 2's audio work (automation only on change, 15 Hz occlusion, suspend while hidden).

## Open questions (none blocking)

1. **Dirt footsteps.** Use the RPG `footstep00..03` (48 kHz, 0.25 s, character unheard), or reuse `footstep_grass`? Decide by measurement in Unit 4 Step 7: keep `step_dirt` only if its spectral centroid differs from `step_grass`'s by at least 10%. Otherwise drop `step_dirt` and its 10,618 B, and point `dirt` at `step_grass`.
2. **For Kevin: a creature voice.** Should a CC0 creature-voice source be sought for the roar and windups (for example a freesound.org search filtered to CC0, read file by file)? Or should those stay synth? Nothing is used without a per-file licence read.
3. **Footsteps on the Hearth.** Should they read the real block under the player (a main-thread voxel lookup does not exist today) rather than the generated surface?
4. **The music download.** Does `MusicPlayer`'s `preload = 'auto'` download about 1.9 MB of music before the first interaction on the live site? Unit 2's prod-smoke block prints the count. If the answer is yes, it is a separate fix in move 2's lane.

## Review amendments (2026-10-27)

**Source.** One adversarial review at xhigh, verdict "REFUTED IN PART": 17 findings (1 HIGH, 9 MED, 7 LOW). I treated each finding as a hypothesis and re-checked it against the code on `main` before changing the plan. The fixes above are marked "amended after review" or "corrected after review" in place.

**Tally:** 17 applied. In 4 of them (findings 3, 4, 7 and 17) one sub-claim or sub-fix was rejected, for the reason given in its row. No finding was rejected outright.

| # | Sev | Finding | Re-verified against | Disposition |
|---|---|---|---|---|
| 1 | HIGH | No gate covers the call sites that choose where recorded layers go; a wrong destination bypasses Mute All, the slider, the limiter and occlusion while every gate stays green | Plan's `startLayers(ctx, destination, …)` takes the destination from the caller. `master-bus-gates.test.js:35` and `spatial-sfx-bus-gates.test.js:25` are text matches a `startLayers(...)` call never contains. `SpatialAudioController.jsx:201-203` records the same bypass shipping once before | **Applied, with a stronger seam than the review proposed.** The review's `buildLayeredSpatialVoice(ctx, sound, filterNode, voice)` still takes the destination as an argument. Instead, `layeredVoice.js`'s three functions create or read their destination themselves (`filterNode`, `getMasterBus() \|\| ctx.destination`, `listener.getInput()`), so no call site names one. Fake-graph unit tests kill M3.11-M3.14. The e2e wraps `AudioNode.prototype.connect` and checks that every bank source reaches `ctx.destination` only through the bus input, with Mute All on and off (Review Focus 3, Unit 3 Steps 1, 8, 9, 12 and 13) |
| 2 | MED | Deleting `mine()`'s `getSampleBank()` guard survives; M4.4's named killer is wrong | `SoundManager.jsx:566-570`: `playBlockBreak` sends no `block`, and the old table mapped unknown → `soft`, so the meta-less call played a `soft` body, not the synth | **Applied.** A missing `block` now returns no recipe, so a lost guard plays `synth/blockBreak`, which test A sees. Test A asserts exactly ONE bank start across all groups. M4.4's killers are corrected (test B, plus test A once the null rule exists); M4.7 (guard deleted) is added |
| 3 | MED | The footstep e2e cannot tell "keyed by surface" from "always the default" if the spawn column is grass | `climate.js:27` (`\|\| 'grass'`); the plan's Review Focus 5 made unknown fall back to the default | **Applied in part.** A MISSING `surface` now returns no recipe, so M4.6 plays `synth/footstep` and goes red on any surface. The e2e teleports to a non-grass column within the loaded radius (SETUP if there is none) and walks there. M4.8 (call site hard-codes grass) is added. **Rejected sub-claim:** that M4.3 survives. The plan names the unit 6-surface test as M4.3's killer, and that test kills it; the e2e was never its killer |
| 4 | MED | soundName-keyed recipes reach callers the plan never lists: every `damageMob` source, the player's own hurt sound, XP orbs, trading | `CombatSystem.jsx:29-34` and `:82`; `useGameStore.jsx:963` → `App.jsx:936` → `SoundManager.jsx:584`; `XPOrbSystem.jsx:35`; `TradingInterface.jsx:39`, `:57`, `:70`; `LootSystem.jsx:56`; 12 `damageMob` call sites in `src` | **Applied in part.** A recipe now needs explicit meta. `hit` gets a body only from melee, through `damageMob`'s new optional 6th argument `sfx`, which only `triggerMeleeAttack` passes. The player's hurt sound, spells, burn ticks, zones, hurl, allies, XP orbs and trading keep the synth. Two e2e controls (a DoT tick, and an XP-orb burst that chimes once per orb) kill M3.15 and M4.10. **Rejected sub-fixes:** (a) "add the caller count to the recipe test" would be a new source-grep check, the class `gate-shape.mjs` check B ratchets down; under the explicit-meta rule a new caller already defaults to today's synth. (b) "null unless `isDirectPlayerHit(source)` and physical" would also strip beast-form melee, whose `type` is the form's element (`beasts.js:119`). A `melee` flag set at the melee call site says what the rule means |
| 5 | MED | The tail is keyed on damage size, so the heavy release and a real crit sound the same, gear picks the tier, and the e2e checks the rule against itself | `utils/combat.js:1-13` (the review wrote `combat.js`), `equipment.js:20-24`, `heavyAttack.js:17`, `Components.jsx:247`, `:253`, `hitstop.js:25`, `CombatSystem.jsx:69-73` | **Applied.** The tail precedence is `isCrit`, then `heavy`, then none. `hitWeight` is dropped and `hitstop.js` is not touched. The e2e pins the roll (`Math.random` 0.0 vs 0.999) and drives a charged release. The review's "damage size as the fallback for spells" is moot, because spells get no body (finding 4) |
| 6 | MED | The per-group 40 ms gate silences the landing footstep when the player lands while moving | `Components.jsx:1299-1311`: the stride step and the landing fire in the same frame, in the same group | **Applied.** The landing layer is gated under its own key `land`. A unit test (stride and landing in the same millisecond) and an e2e jump-while-moving check kill M4.9 |
| 7 | MED | Per-frame work grows with voice lifetime, so "per-frame CPU unchanged" and "nothing runs per frame" are false | `SpatialAudioController.jsx:241-276`; `PositionalAudio.js:17`, `:110-133`; `synthVoices.js:721` (0.05 s footstep) | **Applied in part.** Both claims are corrected (Design, Unit 3 Interfaces, Acceptance Heat, Global Constraints). Every layer has a `max s` cap, and a DEV hook `readSpatialVoiceCount` is measured with and without the bank. Footsteps go listener-local through `listener.getInput()`, not "non-spatially through the bus" as the review proposed: `playSound` routes straight to the bus (`SoundManager.jsx:510`) and would drop the underground filter and the cave reverb that footsteps get today (`SpatialAudioController.jsx:120-130`). **Rejected sub-fix:** "schedule Unit 3 after Phase 0g's automation work". The umbrella's 0g row names no audio work, and no plan covers move 2's audio half, so that ordering cannot be executed. Risk 5 records it as conditional |
| 8 | MED | The e2e and prod-smoke mutation receipts have no path that fits "never on this loaded machine", yet the commit gates demand them | `mutate-e2e.sh:1-25` is a local runner; `killability-ledger.mjs:71` and `:135-141`; `ci.yml` has no mutation job; DECISIONS.md 2026-10-27 records three local e2e runs lost to load | **Applied.** A CI `workflow_dispatch` mutation workflow runs a committed mutant list, with an identity mutant and an unmutated green run. The spec is staged as `_pending/*.pending.js`, outside Playwright's `testMatch` and the ledger's population, so it claims nothing until the rename commit carries the run id. Locally, mutants may run only at a load at or below half the cores, and the load is printed into the receipt (Global Constraints) |
| 9 | MED | The 500,000 B ceiling and "CC0 only" are written down but never asserted | Plan text only | **Applied, with a corrected mechanism.** The test asserts `SFX_BYTE_CEILING <= 500_000`, checks CC0 per pack section, and asserts `licence === 'CC0 1.0'` (M1.10, M1.11). The review said the trailer gate would then see a raised cap; it would not: `tests/scripts/` is outside `GATE_PATHS` (`mutation-proof-trailer.mjs:40`). So `bundle-budget.mjs` gains an absolute `build/sfx` cap whose literal sits on an `ASSERTION_RE` line (`:47-48`), with M2.13 and M2.14 |
| 10 | MED | The only acceptance for "each sounds different" is listening, which neither Kevin nor this session will do | DECISIONS.md, 2026-10-27, the command session's mandate ("I will not review or confirm anything"); the plan's instrument recorded `start` only | **Applied.** Test C renders the 9 tier × material cells through `OfflineAudioContext` in the browser, with the REAL decoded bank and the real recipe gains, and asserts RMS and spectral-centroid separation plus body-over-synth level. The review suggested a unit test with fixture buffers, but jsdom has no WebAudio and fixture buffers say nothing about the shipped samples. Ears are demoted to optional tuning input. Open question 1 is now decided by measurement |
| 11 | LOW | Test A part 3 walks in part 2's frozen world with `Math.random` pinned | `heavy-melee.spec.js:34`, `:67`; `Components.jsx:1206-1210` | **Applied.** Before part 3: restore `Math.random`, set `hitstopUntil: 0`, unmute, wait two frames. `test.setTimeout(240000)` |
| 12 | LOW | `SpatialAudioController.jsx:175-181` is a dead handler, not "disconnects on end" | `Audio.js:113` binds `onEnded` inside `play()`; `:165` calls `play()` before `:175` assigns the handler; `Audio.js:328-333` | **Applied.** §Current state is corrected. Layer cleanup relies on `startLayers`' own `onended` and the frame prune. Wiring the handler is optional and goes in its own commit |
| 13 | LOW | CreditsScreen coordinates are off, and the stated insertion point nests the panel inside the icons panel | `CreditsScreen.jsx:45-61` icons, `:63-70` fonts, `:66` Lilita One | **Applied.** Insert after `:61`; all line references are corrected. The short-viewport fix moves to the card (`max-h-[95dvh] flex flex-col`, header `shrink-0`, body `min-h-0 overflow-y-auto`) |
| 14 | LOW | Every decode failure is reported as SETUP, so a loader-decode mutant can never be scored as killed | `mutate-e2e.sh:15-18`; the plan's permissive fake `decodeAudioData` | **Applied.** An in-page known-good MP3 data-URI decode is the control; only its failure is SETUP. The unit fake rejects non-`ArrayBuffer` input. M2.15 is added |
| 15 | LOW | Prod-smoke M2.12 can survive if the centre click lands on Start and headless Chromium grants pointer lock | `MenuSystem.jsx:66-73` (`enterPlay` → `requestPointerLock`); `App.jsx:950-957` (`resumeAudio` on the active gate); prod-smoke clicks nothing today | **Applied (plausible, not reproduced).** The click goes to a backdrop corner, and the test asserts that `document.pointerLockElement === null` and that the gate is closed when the first `/sfx/` request arrives; if not, the result is SETUP. The repro was not run: it needs a build and a browser on this loaded machine |
| 16 | LOW | CI time is not spread across shards, the latency rule measures SwiftShader, and Unit 2 alone ships bytes that play nothing | `playwright.config.js:14-15`; Playwright docs via Context7 ("Without the fullyParallel setting, Playwright Test defaults to file-level granularity"); `ci.yml:83` (25 min); `prod-smoke.mjs:156-158`; Vercel deploys every push | **Applied.** Risk 8 is corrected: read the per-shard durations first, and split test B into its own file if the receiving shard ends within 5 minutes of the limit. Risk 1's decision number now comes from real hardware. Units 2 and 3 reach `main` in one push |
| 17 | LOW | The brief's premise, "verify CC0 by what the repo credits", is false, and the licence evidence is an unre-measured fetch | Plan `:80` already said the repo credits nothing from Kenney; `CreditsScreen.jsx:44-70` credits only game-icons.net and fonts | **Applied in part.** Unit 1 Step 4 now reads each pack's `License.txt` text (not only the sha256) before converting, refuses on mismatch, and puts the output in the commit body. **Not done here:** the review's network re-fetch. It is an external download, and Unit 1 Step 4 performs exactly that check before any file is converted |

**Not re-measured in this amendment (stated, not hidden):** the bank's byte sizes, durations and onsets; MP3 decode in Playwright Chromium and in WebKit; the spawn column's real surface; whether headless Chromium grants pointer lock on a trusted click; the per-shard CI durations; the repository's visibility (the free-runner premise of the mutation workflow, checked first in Unit 2). Each one is a step in the units above, not an assumption carried forward.
