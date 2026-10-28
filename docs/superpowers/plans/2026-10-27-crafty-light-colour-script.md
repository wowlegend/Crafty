# Ember against the dark — the light and colour script: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status, 2026-10-28: BUILT through Task 3b, plus Task 7; landing in Wave 1** under the SOTA reset
(`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, section 8). The reset amends this plan, and "As built for
the Wave 1 landing (2026-10-28)" at the end says how: Task 4 and Task 9 Step 4 (the capture-state work) are dropped,
umbrella 0e is no longer a precondition, Task 8 is decided (480 s, superseding decision 8), the OKLab blend is checked,
and Tasks 5 and 6 wait for W2-I. Where the body below disagrees with that section, that section wins.

**Original status:** PLAN, 2026-10-27. Phase 1 lead lane of the masterpiece programme. Not built. Amended the same day after an
adversarial review: the body below is edited in place, and "Review amendments (2026-10-27)" at the end lists every
finding with its disposition. The largest change: every colour gate is now stated on the DISPLAYED colour (after the
grade and the NEUTRAL tone map), not on the linear radiance before them.

**Goal:** The world's light and colour follow the sun's elevation through six authored keys, so night is a cool,
readable, moonlit blue-violet, golden hour is warm, the iPad's stone is grey rather than navy, and only HDR emissive
blooms.

**Architecture:** One pure module (`render/colourScript.js`) turns the cycle fraction into a resolved frame of colours
and intensities; one pure module (`render/keyLight.js`) gives the one directional light a sun vector by day and a moon
vector by night, while `sunDirRef` keeps the sun's. `render/mood.js` composes that frame with the danger overlays
(storm, boss) and publishes it once per frame as `skyFrameRef`; every reader (the light rig, the dome, the sun
billboard, the grade, the terrain and far-field uniforms, the motes) reads that one frame instead of re-sampling. New
shader terms are GLSL string modules with JS mirrors (the `oreGlow.js` / `leafFeel.js` pattern).

**Tech Stack:** three 0.172 (physically-correct lights), @react-three/fiber 9.5, @react-three/postprocessing 3.0.4
over postprocessing 6.39.5, vitest, Playwright (e2e, CI-only), the lookbook probe (`scripts/visual/lookbook.mjs`).

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (section "Seen on a real GPU, 2026-10-27" and
Phase 1, bullet 1). Design inputs: roadmap move 4 in `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json`;
refute findings F4, F5, F6 in `docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md`. Where those differ, the
umbrella plan and the refute win.

## Global Constraints

- Repo is TWO-LEVEL: ROOT `<repo>` (docs, memory, plans); APP `<repo>/frontend`
  (source in `frontend/src`, npm and tests run from `frontend/`). Absolute paths in every delegation prompt.
- No WebGPU/TSL and no three bump. New shader terms are pure GLSL string modules with JS mirrors.
- Game-Loop Isolation: per-frame values travel by refs and `.getState()`, never by React state or subscriptions.
- A capture guard RESETS to a declared value, never early-returns (`.agent/AGENTS.md`, "HOW determinism is actually
  achieved").
- Every new or rewritten gate under `frontend/tests/gates/` or `frontend/scripts/ci/` carries a `Mutation-Proof:`
  trailer naming each mutant and its RED, plus an identity mutant that SURVIVED (`scripts/dev/mutate.sh`).
- ~~The visual baseline re-shoot is its own commit with a `Baseline-Review:` trailer and no `frontend/src/` change in it.
  The 147->current-Chromium re-baseline (umbrella 0e) lands alone BEFORE this lane, never bundled with it (F4).~~
  Dropped 2026-10-28: no baseline re-shoot; 0e is cancelled (SOTA reset, W2-B).
- No move adds GPU cost without stating it (the M3 Max heat complaint); each task states its main-chunk bytes against
  `scripts/ci/bundle-budget.mjs` (`index` ceiling 760,000 B, `bundle-budget.mjs:35`).
- Never `sed`/`cat`-rewrite `.js`/`.jsx`; Edit only. Never a backtick inside a GLSL template literal.
- No "Generated with" / "Co-Authored-By" footer. Fix-ups are new commits.
- Reviews: `/code-review xhigh` per change range, plus one adversarial reviewer at xhigh on the runtime seams
  (Tasks 3b, 5, 6), as Workflow stages on Opus 5.5 (`.agent/AGENTS.md` Method; DECISIONS.md 2026-10-27).

## Preconditions (Task 0 checks each one)

1. `feat/steady-cool` is merged to `main`. It carries the parked looks commit `717d5fef` (ore glow, leaf feel, storm
   lightning) and rewrites the seams this plan edits: Bloom built once in `render/postFx.jsx`, the shadow map on
   demand in `render/shadowSchedule.js`, the point-light pool. Line numbers below marked `steady-cool:` are on that
   branch at `0d1474b3`; re-read them on `main` after the merge.
2. `feat/instruments` is merged: the lookbook probe and its production seam (`src/render/lookbookSeam.js`).
3. ~~Umbrella 0e (the 147->current-Chromium re-baseline) has landed as its own Baseline-Review commit.~~ Dropped
   2026-10-28: 0e is cancelled and the capture oracle retires (SOTA reset, W1-H and W2-B).

If 1 is not merged, this lane does not start: three of its tasks edit code that branch rewrites.

## The defect, as measured

Frames: `docs/superpowers/masterpiece-2026-10/evidence/before-*.jpg` (lookbook, production build, real GPU, motion on;
fractions are dawn-origin `cycleFraction`: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight). Opened 2026-10-27:

- `before-chromium-1280x800-hearth-0.75.jpg`: midnight is maroon and magenta under an orange sky; the Hearth is black.
- `before-webkit-1180x820-coast-0.75.jpg`: an orange sky over a black-maroon land; the sea's foam glows white-teal.
- `before-chromium-1280x800-coast-0.48.jpg`: golden hour is cold blue-teal; the land has no warm light at all.
- `before-webkit-820x1180-hearth-0.48.jpg`: the Hearth's stone pad renders saturated navy (WebKit, iPad portrait).
- `before-chromium-1280x800-hearth-0.30.jpg`: afternoon reads, but the stone is slate-blue and motes float on the lens.

A Lambert model of the rig (three r172: `BRDF_Lambert` is `RECIPROCAL_PI * diffuseColor`,
`node_modules/three/src/renderers/shaders/ShaderChunk/common.glsl.js:106-108`; hemisphere irradiance is
`mix(ground, sky, 0.5 * dot(n, up) + 0.5)`, `lights_pars_begin.glsl.js:202-207`) reproduces the direction of both
defects on a neutral grey stone (`#8C8C8C`), measured in OKLCH (scratch script, 2026-10-27):

| Case | Today's indirect light on an up face | Stone up face, lit |
|---|---|---|
| f 0.48 (golden) | ambient `#2E8AE0` x0.90 + hemi sky `#2E8AE0` x0.55: C 0.175, hue 251 (saturated blue) | L 0.346, C 0.063, hue 255: blue, the navy |
| f 0.75 (midnight) | dusk `skyMid` `#2E4A6E` x(0.62 + 0.30) | L 0.172: near black |

The maroon itself is not in the rig: it is the dusk fog `#3A2E40` (hue 314) and the dusk horizon `#C25A3A` (hue 38),
which the land takes through the fog and the aerial haze (`aerialPerspective.js` hazes 55% toward `skyHorizon` at
165 m).

**These are numbers before tone mapping, and the screen shows something else (review amendment 1).** The Lambert
model stops at the linear radiance. The pixel then goes through HueSaturation (in linear space, then clamped at 1:
`node_modules/postprocessing/build/index.js:7387`), BrightnessContrast in sRGB space with its pivot at 0.5 (`:4435`,
`inputColorSpace = SRGBColorSpace` at `:4455`; the EffectPass converts to sRGB for it and back, `:15476-15477`), and
three's NEUTRAL tone mapping (`GameScene.jsx:117-126`). The NEUTRAL toe maps a grey `x` below 0.08 linear to `6.25x²`
and, because it subtracts one offset from all three channels, raises the chroma of a dark tint
(`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:177-181`). Re-measured
2026-10-27 with a scratch model of that exact chain:

- The plan's own night key (stone up face lit L 0.292 before tone mapping) displays at about 12/255 as a grey and at
  about (5, 22, 57)/255 in its blue colours (displayed L 0.21, C 0.071). That is still black, and navy.
- Today's f 0.48 stone, run through today's grade (+0.30 saturation, +0.09 brightness), displays as a saturated navy
  of about (15, 56, 102)/255, or (0, 62, 114)/255 when the saturation step's negative red channel is clamped at 0
  (displayed C about 0.09). So the +0.30 saturation and the toe make the navy, as much as the blue ambient does.

So every colour gate in this plan is stated on the DISPLAYED colour, through `displayed()` in `_lightModel.js`
(Task 1), and one lived readback compares the model with the screen (Task 3b, the grey card).

## Current code, cited (read 2026-10-27 on `main` at `f0e84766` unless marked; the eight rows after the `capture.mjs` row were added by the review amendment, read at `dfae38b6`)

| Claim | Where |
|---|---|
| Night IS the dusk palette: `moodTarget` maps `isDay false` to mood 1 for the whole night | `frontend/src/render/mood.js:99-102` |
| Colours come from the mood only; the cycle only rotates `sunPos` | `mood.js:171-198` (arc applied at `:198`) |
| Ambient is `skyMid` (`#2E8AE0` by day) at 0.90; hemisphere sky `skyMid`, ground = the fog colour | `mood.js:25,61,78-79`; `theme/tokens.js:16` |
| Dusk palette: `skyHorizon #C25A3A`, `sun #FF8A4C`, `fog #3A2E40` | `theme/tokens.js:23` |
| Explore grade saturation +0.30 (amplifies the blue ambient) | `mood.js:55`; `GameScene.jsx:117` |
| The sun light is written with no horizon gate: below the horizon it still shines at the mood's intensity, from under the ground | `render/Atmosphere.jsx:294-300` |
| `sunDirRef` is written from the resolved sun direction, once per frame | `Atmosphere.jsx:279-280` |
| Capture pins the sun at noon for every state | `Atmosphere.jsx:127-130,246` |
| Stars and moon gated by `starIntensity(mood)`, peaking at mood 1 | `Atmosphere.jsx:281`; `render/nightSky.js:12-16` |
| The moon is a fixed painted disc, not a light | `render/skyDome.js:65-73` (`moonDir` constant at `:67`) |
| The sun disc and glow in the dome | `skyDome.js:48-50` |
| **The sun billboard (the GodRays source) never arcs**: `Sun.jsx` calls `sampleMood` with no cycle, so it stays at the noon bearing all day and all night, contradicting `mood.js:118-119` | `render/Sun.jsx:16-19` |
| Other readers re-sample the mood with no cycle | `MoodGradeDriver.jsx:27`; `world/Terrain.jsx:624` (steady-cool `:659`); `world/FarField.jsx:115` |
| Bloom threshold 0.65 on a composer whose buffer is HalfFloat (HDR) | `GameScene.jsx:119-124`; `@react-three/postprocessing` 3.0.4 `dist/index.js` (`frameBufferType:S=xe`, `HalfFloatType as xe`) |
| BloomEffect's live threshold is `luminanceMaterial.threshold` (default 1) | `node_modules/postprocessing/build/index.js:4151,4210,3551` |
| Tokens name MAGIC as "the ONLY intended bloom sources" | `theme/tokens.js:37` |
| A source gate pins the threshold >= 0.60 and the citation in EnhancedMagicSystem | `tests/gates/static-gates.test.js:149-163`; `src/EnhancedMagicSystem.jsx:519` |
| Ore glow tuned to the 0.65 threshold: `{ iron: 0.35, gold: 0.8, diamond: 1.25 }`, night from `uSunDir.y` | steady-cool `src/world/oreGlow.js:15,66-67` |
| Leaf translucency's day factor reads `uSunDir.y` | steady-cool `src/world/leafFeel.js:81` |
| Cloud shadows fade with `normalize(uSunDir).y` | `render/cloudField.js:75` |
| Cloud tint keyed on `m.sunIntensity / MOOD_SCALARS.explore.sunIntensity` | `cloudField.js:40,53-56` |
| Shadow map renders on demand on a 0.5 deg sun step, fed `m.sunPos`; the light's POSITION (`:325`) and the schedule's direction (`:334-340`) are two separate reads of `m.sunPos` | steady-cool `render/shadowSchedule.js:20-21,44-57`; steady-cool `render/Atmosphere.jsx:325,330-344` |
| Hemisphere carries the lightning flash additively | steady-cool `Atmosphere.jsx:355` |
| Motes: always on, warm, centred on the CAMERA (so they sit on the lens), per-tier counts 36 / 80 / 140 | `render/LightMotes.jsx:31,106-116,184-187`; `render/quality.js:20-32` |
| Tone mapping NEUTRAL, last in the chain | `GameScene.jsx:126` |
| A 300 s cycle: 4 game units/s over 1200 units | `game/dayNight.js:13,16,26` |
| `setTimeOfDay` is midnight-origin and sets `gameTime`; the clock does not advance under capture | `store/useGameStore.jsx:841-844`; `game/dayNight.js:76-78,214-222` |
| Capture sets night with `setTimeOfDay(0.0)` for `explore-night-low`, `explore-night`; boss via `setDangerLevel(2)` | `scripts/visual/capture.mjs:584,603,611` |
| The terrain's AO floor is tinted by `skyMid` (blue by day and navy at night) and multiplies the albedo of every occluded corner; on the low tier (no N8AO) it is the only AO | `world/Terrain.jsx:171,633-634`; `world/biomeTable.js:106-111,221-226` |
| `landGrade` desaturates and cools the land by `mood`, so it now follows danger and storm, not night | `render/landGrade.js:17-23`; `Terrain.jsx:628`; `FarField.jsx:116` |
| `cycleFraction` maps a non-finite `gameTime` to 0 (dawn, where the key is 0), and two tests pin that for the dial | `game/dayPhase.js:28-31`; `src/game/dayPhase.test.js:35`; `tests/store/dayPhase.test.js:25-27` |
| Inside the composer `toneMapped={false}` does nothing: three applies a material's tone mapping only when the render target is null | `node_modules/three/src/renderers/webgl/WebGLPrograms.js:165-173` |
| three r172 computes a program's cache key BEFORE `onBeforeCompile` runs, so a define added inside the hook is missing from the key | `node_modules/three/src/renderers/WebGLRenderer.js:1653,1693,1695` |
| The weather flips clear and storm every 90 s outside capture and drives `weatherMoodBoost` (about 0.85 in a storm) | `render/WeatherSystem.jsx:83-94`; `Atmosphere.jsx:231` |
| The visual states list lives under `src/` and a unit gate demands it equal the baselines on disk, in both directions | `src/devtest/visualStates.js:15`; `tests/gates/visual-denominator-gates.test.js:34-52` |
| Lookbook times: `LOOKBOOK_CYCLES = [0.30, 0.48, 0.55, 0.75]`; targets chromium 1280x800, webkit 1180x820 and 820x1180 | feat/instruments `scripts/visual/_lookbook.mjs:9,26-30` |
| `index` chunk 696,924 B in the 05:22 build of `main` (ceiling 760,000) | `frontend/build/assets/index-RM8RWfkj.js`; `bundle-budget.mjs:35` |

## Design decisions (each one a choice the implementer must not re-open)

1. **Keyed on the solar phase, not on `isDay` and not on the mood's elevation.** The script's input is `f`
   (`cycleFraction`). It derives `s = sin(2*pi*f)` (normalised elevation, -1..1, independent of each mood's noon
   vector) and `rising = cos(2*pi*f) >= 0`. Two branches share their end keys: rising `night -> preDawn -> sunrise ->
   day`, setting `day -> sunset -> dusk -> night`. Because `day` and `night` are shared, the frame is continuous at
   noon and midnight by construction; piecewise interpolation in `s` makes it continuous everywhere else.
2. **Danger is an overlay, not the base night.** `moodTarget` stops reading `isDay`. Mood 0..1 is the storm/danger
   overlay (fog thickens, sky desaturates, key dims, stars hide); mood 1..2 blends to the existing obsidian palette,
   which at mood 2 replaces the colours at any hour (the boss look does not depend on the clock). A siege-night
   overlay (red horizon) needs a siege signal the mood does not have today (`world/survivalSystem.js:61`); it belongs
   to roadmap move 10.
3. **One resolved frame per frame.** `Atmosphere` computes it, `publishSkyFrame` COPIES it into `skyFrameRef.current`,
   and every other reader reads that ref. This deletes the four no-cycle re-samples above, including the sun-billboard
   defect. A reader that runs before `Atmosphere` in a frame reads the previous frame's values; the script is
   continuous, and capture flushes frames before every shot.
4. **The moon is the same directional light on its own vector.** `moonArcDirection(f)` is the sun's arc function
   applied to a declared `MOON_NOON` half a cycle later, so the moon is up exactly when the sun is down. The key light's
   intensity fades to 0 within `|s| < HORIZON_FADE` on each side, so the direction swap happens only under a key of
   intensity 0. The light count never changes (no relink), shadows stay on, and the shadow schedule is fed the KEY
   direction (the swap is a step larger than 0.5 deg, so it renders at once). `sunDirRef` keeps the SUN's direction:
   ore glow (`oreGlow.js:66`), leaf translucency (`leafFeel.js:81`), cloud shadows (`cloudField.js:75`) and the
   GodRays horizon gate (`Atmosphere.jsx:253`) all mean the sun (F5).
5. **The authored shadow tint is the indirect term, not a new shader uniform.** With one key light, a shadowed face is
   lit by the ambient and hemisphere only, so their colours ARE the shadow colour. The script authors them per key
   (`ambient` is the shadow tint; the hemisphere ground is the warm bounce). The roadmap's extra `shadowTint` uniform in
   the terrain's `lights_fragment_end` would duplicate the rig at ALU cost and is not built. The gates hold the
   targets it was for (shadow/lit lightness ratio, shadow chroma below lit chroma).
6. **Exposure is a per-key scalar on the rig's intensities and the dome's colours**, applied in `sampleMood`. No
   renderer `toneMappingExposure` change: the composer's NEUTRAL tone mapping stays as is.
7. **Bloom threshold `BLOOM_THRESHOLD = 1.05`, smoothing 0.20.** The composer's buffer is HDR, so a threshold above 1
   blooms only emissive pushed past 1 and the sun disc; the bright day sky (horizon linear luminance about 0.77) stops
   blooming, which removes the milky horizon wall the roadmap measured. Every intended glow source is audited in the
   same unit, and the ore glow is re-tuned there (F6).
8. **Superseded 2026-10-28: the day is 480 s** (DECISIONS 2026-10-28 item 21a; Task 8). The original text: "Day
   length stays 300 s in this lane (Task 8 records the review). The lever with no balance cost is where the keys sit in
   `s`; the cycle length moves the siege length and belongs with roadmap move 10."

## Review Focus

The five inputs most likely to bite a player that no happy-path test exercises, each pinned by a test in its task:

1. **A non-finite or junk cycle** (a corrupt save, `NaN` from a division): the frame must be the day key, never a black
   sky or a NaN colour. Pinned: Task 1 Step 1 `junk-cycle` case on `sampleScript`, and Task 3a `liveCycle` case on the
   path the game actually takes. `cycleFraction(NaN)` returns 0 (dawn, where the key is 0), so the script's own guard
   is never reached from a corrupt `gameTime`. `liveCycle` maps that to noon before the script sees it.
2. **A storm at midnight** (overlay on the darkest key): the world must stay readable, not go black. Pinned: Task 3a
   `storm-at-midnight` case (stone up face, DISPLAYED L >= 0.25).
3. **A boss fight at noon versus at midnight**: the obsidian colours must be the same at any hour. Pinned: Task 3a
   `boss-any-hour` case.
4. **A capture state that never calls `setTimeOfDay`** (menu, studio cards): it must render at a declared fraction,
   never wherever the boot clock stopped. Pinned: Task 3a `captureCycle` cases (falls back by `isDay`, day = 0.25).
5. **A load or time jump across the horizon**: no frame may light the world from under the ground, and the shadow map
   must re-render on the swap. Pinned: Task 2 `never-from-below` and `swap-under-zero` cases; the shadow re-render by
   the existing `shadowDue` step test, fed the key direction (Task 3b Step 4).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/render/colourScript.js` | Create | The six keys (data) and `sampleScript(f, out)`. Pure. |
| `frontend/src/render/keyLight.js` | Create | `MOON_NOON`, `moonArcDirection`, `resolveKeyLight`. Pure. |
| `frontend/src/render/bloomGrammar.js` | Create | `BLOOM_THRESHOLD`, `BLOOM_SMOOTHING`, `SUN_DISC_HDR`, the dome's sun-disc constants. Pure. |
| `frontend/src/render/sunGlowFog.js` | Create | The sun-glow fog GLSL, its JS mirror, `sunFogUniforms`, `attachSunFog`. |
| `frontend/src/render/motePresence.js` | Create | Firefly presence, colour and the near-camera fade (GLSL generated from the JS). Pure. |
| `frontend/src/render/mood.js` | Modify | `moodTarget` without night; `sampleMood` on the script + overlays; `skyFrameRef`, `publishSkyFrame`, `captureCycle`. |
| `frontend/src/render/Atmosphere.jsx` | Modify | Writes the key light, `sunDirRef` (sun), the dome, the fog glow, the shadow schedule (key dir); publishes the frame. |
| `frontend/src/render/skyDome.js` | Modify | `uMoonDir` uniform; disc constants from `bloomGrammar.js`. |
| `frontend/src/render/Sun.jsx` | Modify | Reads `skyFrameRef`: arcs, HDR colour, hidden below the horizon. |
| `frontend/src/render/MoodGradeDriver.jsx` | Modify | Grade from `skyFrameRef`. |
| `frontend/src/render/LightMotes.jsx` | Modify | Presence and colour from `skyFrameRef`; near-camera fade; not drawn at presence 0. |
| `frontend/src/render/cloudField.js` | Modify | `cloudTint` keyed on the frame's `daylight`. |
| `frontend/src/render/nightSky.js` (+ its test) | Delete (Task 3b, the commit that drops Atmosphere's import) | Stars come from the frame. |
| `frontend/src/world/Terrain.jsx` | Modify | Uniforms from `skyFrameRef`, `uAoFloor` from `frame.aoFloor`; the sun-fog define at construction plus `attachSunFog`. |
| `frontend/src/world/FarField.jsx` | Modify (seam: coast lane, row 3) | Uniforms from `skyFrameRef`; the sun-fog define at construction plus `attachSunFog`. If the coast lane landed first, Task 3b also deletes its far-Fresnel `uFresnelDay`. |
| `frontend/src/render/Ocean.jsx` | Modify (seam: coast lane, rows 1, 2, 4) | The sun-fog define at construction plus `attachSunFog` (Task 6). If the coast lane landed first, Task 3b also converts its fallback: `skyHorizon`, `sunDir` and `glowColor` from `skyFrameRef.current`, and `uFresnelDay` deleted. |
| `frontend/src/devtest/visualStates.js` | Move (Task 4 Step 0) to `frontend/tests/visual/visualStates.js` | Its only importers are two tests; under `src/` it cannot take a new state in a baseline-only commit. |
| `frontend/tests/gates/atmosphere-isolation-gates.test.js` | Modify (Task 3b) | The sky-readers gate: only `render/Atmosphere.jsx` calls `sampleMood(`; no `uFresnelDay` under `src/`; `Ocean.jsx` names neither `moodRef` nor `sunDirRef`, and pairs `uSunColor` with `glowColor` (seam rows 1-3). It is already a source-grep ledger member, so the frozen population does not rise. |
| `frontend/src/world/oreGlow.js` | Modify | `ORE_GLOW` re-tuned to `BLOOM_THRESHOLD`. |
| `frontend/src/GameScene.jsx` | Modify | `<Bloom luminanceThreshold={BLOOM_THRESHOLD} luminanceSmoothing={BLOOM_SMOOTHING}>`. |
| `frontend/src/EnhancedMagicSystem.jsx` | Modify | The comment at `:519` cites the new threshold. |
| `frontend/src/store/useGameStore.jsx`, `frontend/src/App.jsx` | Modify | `captureSolarFraction` field; `setCaptureSolar` and `readSkyLight` DEV hooks. |
| `frontend/scripts/visual/capture.mjs` | Modify | New `explore-golden` state at a declared 0.48. |
| `frontend/tests/gates/_lightModel.js` | Create | Test helper: sRGB->linear, OKLab/OKLCH, the Lambert rig model, the AO-occluded face, `hazed()`, and `displayed()` (the post chain through NEUTRAL). Not a check file. |
| `frontend/tests/gates/colour-script-gates.test.js` | Create | Task 1. |
| `frontend/tests/gates/key-light-gates.test.js` | Create | Task 2. |
| `frontend/tests/gates/sky-frame-gates.test.js` | Create | Task 3a. |
| `frontend/tests/gates/bloom-grammar-gates.test.js` | Create | Task 5. |
| `frontend/tests/gates/sun-glow-fog-gates.test.js` | Create | Task 6. |
| `frontend/tests/gates/mote-presence-gates.test.js` | Create | Task 7. |
| `frontend/tests/e2e/light-script.spec.js` | Create | Tasks 3b, 5, 6: the lived proof in the running game. |
| `frontend/tests/render/mood.test.js`, `tests/scripts/sun-arc.test.js`, `tests/gates/static-gates.test.js`, `tests/gates/ore-glow-gates.test.js`, `tests/gates/cloud-field-gates.test.js` | Modify | Assertions whose premise this lane changes (named per task). |

## The keys (initial values; the lookbook may tune them, the gates bound them)

`s` anchors: `night` -0.45 (both branches), `preDawn` -0.12 (rising), `sunrise` +0.10 (rising), `day` +0.45 (both),
`sunset` +0.10 (setting), `dusk` -0.12 (setting). Colours are sRGB hex, converted to linear once at module load
(`new THREE.Color(hex)` under three's ColorManagement). Intensities are before `exposure`.

| Field | night | preDawn | sunrise | day | sunset | dusk |
|---|---|---|---|---|---|---|
| sun colour / intensity | - / 0 | - / 0 | `#FFB870` / 2.4 | `#FFE6C4` / 2.8 | `#FFAA55` / 2.6 | - / 0 |
| moon colour / intensity | `#B4C2E8` / 0.85 | `#B4BEE6` / 0.55 | - / 0 | - / 0 | - / 0 | `#B4BEE6` / 0.55 |
| ambient (= shadow tint) / int | `#7E8496` / 0.42 | `#868AA0` / 0.38 | `#B8A89C` / 0.26 | `#C4C6CC` / 0.26 | `#B8AA9C` / 0.26 | `#868AA0` / 0.38 |
| hemi sky / ground / int | `#7A84A2` / `#4A4A56` / 0.68 | `#7E88AA` / `#5A5262` / 0.68 | `#B0B2C2` / `#C8906A` / 0.60 | `#9DB8D6` / `#B49670` / 0.80 | `#B0B2C2` / `#C88E5C` / 0.60 | `#7E88AA` / `#5A5262` / 0.68 |
| fog colour / density | `#333B58` / 0.0060 | `#5A6690` / 0.0045 | `#E8C2A8` / 0.0035 | `#CFE3EC` / 0.0025 | `#E8C6A0` / 0.0035 | `#5A6690` / 0.0045 |
| sky top / mid / horizon | `#0A1028` / `#18234A` / `#34406E` | `#141C46` / `#34447E` / `#8A90C0` | `#3A5CA8` / `#9AA8D0` / `#FFB8A0` | `#2A64C8` / `#5A9AE0` / `#CFE6F2` | `#3A5CA8` / `#8FA8D0` / `#FFC27A` | `#1A2350` / `#3A4C88` / `#9A90C0` |
| glow colour / strength (fog + dome) | `#000000` / 0 | `#8A90C0` / 0.15 | `#FFC08A` / 0.55 | `#FFF0D8` / 0.20 | `#FFB060` / 0.60 | `#9A90C0` / 0.20 |
| grade sat / bright / contrast | -0.10 / 0.03 / 0.02 | -0.02 / 0.03 / 0.04 | 0.16 / 0.03 / 0.07 | 0.12 / 0.04 / 0.06 | 0.18 / 0.03 / 0.08 | 0.00 / 0.03 / 0.04 |
| stars / motes (fireflies) | 1 / 1 | 0.5 / 0.3 | 0 / 0 | 0 / 0 | 0 / 0 | 0.5 / 0.6 |
| exposure | 1.7 | 1.4 | 1.0 | 1.0 | 1.0 | 1.4 |

**The table above holds the DERIVED values (Task 1 Step 3, built 2026-10-27).** The night, preDawn and dusk columns
were re-derived on the displayed model until `colour-script-gates.test.js` passed, and the sunrise and sunset
hemisphere sky moved `#A8B2C8` -> `#B0B2C2` (the draft turned the sunrise up face a hair blue, OKLab b -0.001, which B3
forbids). The draft it replaced: night moon `#9DB4FF` / 0.70, ambient `#465074` / 0.32, hemi `#52629A` / `#2C2E3C` /
0.60, fog `#1E2440`, sky `#070B1E` / `#121B3C` / `#26305A`, grade -0.05 / 0.03 / 0.10, exposure 1.15; preDawn and dusk
moon `#A8B8F0` / 0.30, ambient `#707AA0` / 0.30, hemi `#5E6EA4` / `#463E54` / 0.65, grade 0.02 / 0.02 / 0.08 (dusk
0.04), exposure 1.05; dusk horizon and glow `#C88A90`. Displayed on the model: the moonlit stone at midnight (47, 55,
74)/255, L 0.337 C 0.036 hue 268 (the draft: (5, 22, 57), L 0.211 C 0.071); in shadow (22, 30, 47), L 0.236; the dusk
horizon hue 294.

Checked against the bounds in the Lambert model before this plan was written (grey stone `#8C8C8C`): day indirect
C 0.042 (today 0.175); day up-face shadow/lit L ratio 0.66; golden sun-facing side lit hue 60, C 0.075; night stone
up-face lit L 0.292 (today 0.172); every night colour at hue 270-278.

**That check was made before tone mapping and is SUPERSEDED (review amendment 1).** Displayed, the night stone up face
is about (5, 22, 57)/255 (displayed L 0.21, C 0.071): black and navy. The day key holds up (displayed shadow/lit L
ratio 0.54, shadow C 0.036). So these values are **PROVISIONAL**: the `night`, `preDawn` and `dusk` columns'
intensities, `exposure` and chroma, the night grade's contrast, and the `dusk` horizon. Task 1 Step 3 re-derives them
until the displayed gates pass. On the scratch model, the night colours as written need an exposure near 3 (not 1.15)
to reach displayed L 0.30, and even then they display at C 0.087. The evidence navy is C 0.092, so the night key must
lose chroma as well as gain light. The night grade's contrast 0.10, pivoting at sRGB 0.5, also darkens every value
below mid-grey. Exposure scales the dome too (decision 6), so the night sky colours are re-checked on the displayed
gates in the same pass.

At the 480 s day (300 s when this was written), `s = 0.10` is 7.7 s after the horizon, `0.30` is 23.3 s, `0.45` is
35.6 s. The lookbook's fractions
land at `s` 0.951 (0.30), 0.125 (0.48, just past the sunset key), -0.309 (0.55, blue hour), -1 (0.75).

---

## Tasks

### Task 0: Base, bytes and the same-build "before"

**Files:** none changed.

- [ ] **Step 1: Check the preconditions.** Run from ROOT: `git branch --merged main --list feat/steady-cool feat/instruments`
  and `git ls-tree --name-only main frontend/src/render/postFx.jsx frontend/src/render/shadowSchedule.js
  frontend/src/world/oreGlow.js frontend/scripts/visual/lookbook.mjs`. Expected: both branches and all four paths
  listed, and `git log --oneline main -- frontend/tests/visual/baseline` shows the 0e re-baseline as its own commit.
  If not, stop: this lane does not start.
- [ ] **Step 2: Branch.** `git switch -c feat/light-colour-script main` in an Orca worktree (shared checkout rule).
- [ ] **Step 3: Measure the base bytes.** `cd frontend && npm run build && node scripts/ci/bundle-budget.mjs`.
  Record the `index` bytes in `memory/ACTIVE_PLAN.md`; every task compares against it.
- [ ] **Step 4: Re-shoot the "before" on this exact base.** `node scripts/visual/lookbook.mjs --out
  <scratchpad>/lookbook-before`. The evidence frames were shot before the pixel budget (0g) changed the dpr, so a
  same-build "before" is the only fair A/B for sharpness; colour can still be compared with the evidence frames.
  Expected: exit 0, every target `hardware`. Then `sh scripts/dev/kill-test-procs.sh`.

### Task 1: The colour script

**Files:**
- Create: `frontend/src/render/colourScript.js`
- Create: `frontend/tests/gates/_lightModel.js`
- Test: `frontend/tests/gates/colour-script-gates.test.js`

**Interfaces:**
- Produces: `KEY_S` (frozen `{ night: -0.45, twilight: -0.12, golden: 0.10, day: 0.45 }`); `SCRIPT_KEYS` (frozen, six
  keys named `night, preDawn, sunrise, day, sunset, dusk`, fields as in the keys table); `solarPhase(f) -> { s, rising, f }`
  (non-finite `f` -> noon, 0.25); `scriptKeysAt(f) -> { from: keyName, to: keyName, t }`;
  `sampleScript(f, out?) -> ScriptFrame` where `ScriptFrame = { s, rising, sun:{color,intensity}, moon:{color,intensity},
  ambient:{color,intensity}, hemi:{sky,ground,intensity}, fog:{color,density}, sky:{top,mid,horizon},
  glow:{color,strength}, grade:{saturation,brightness,contrast}, stars, motes, exposure, daylight, aoFloor }`, colours as
  linear `THREE.Color`, `daylight = smoothstep(KEY_S.twilight, KEY_S.day, s)`. `aoFloor` is
  `aoFloorColor(ambient.color)` (`world/biomeTable.js:223`), so the terrain's occlusion tint follows the authored shadow
  tint and no longer follows `skyMid`. `out` is reused when given (no per-frame allocation).
- Test helper produces: `linearFromHex(hex) -> [r,g,b]`, `oklch([r,g,b]) -> { L, C, h, a, b }`, `stoneFaceUnder(frame,
  { normal, keyDir }) -> [r,g,b]` (the Lambert model, albedo `#8C8C8C` x 0.9 for metalness 0.1, linear radiance before
  the post chain), `indirectOnUpFace(frame) -> [r,g,b]`, `aoOccludedStone(frame) -> [r,g,b]` (the shadowed up face with
  its albedo multiplied by `frame.aoFloor`: a fully occluded corner, `Terrain.jsx:171` at `vAO = 0`), `hazed(rgb,
  horizon) -> [r,g,b]` (`aerialGlsl()` at full distance, `AERIAL_DESAT` then `AERIAL_HAZE`, both imported from
  `render/aerialPerspective.js`), and `displayed(rgb, grade) -> [r,g,b]`. `displayed` is what reaches the screen, in
  linear: HueSaturation as postprocessing 6.39.5 computes it (hue 0; `c += (avg - c) * (1 - 1 / (1.001 - sat))` for
  sat > 0, else `c += (avg - c) * -sat`; then `min(c, 1)`), then BrightnessContrast in sRGB (three's sRGB OETF, negatives
  clamped to 0; `c = (c + brightness - 0.5) / (1 - contrast) + 0.5` for contrast > 0, else `(c + brightness - 0.5) *
  (1 + contrast) + 0.5`; back to linear), then three r172's `NeutralToneMapping` transcribed line for line
  (`tonemapping_pars_fragment.glsl.js:170-196`, exposure 1). Bloom, SMAA, noise and vignette are left out: bloom adds
  light only above the threshold, and the others are below the gates' resolution at the centre of the frame. In
  `stoneFaceUnder`, `keyDir: null` means shadowed (indirect only); otherwise the key is `frame.sun` when `frame.s >= 0`,
  else `frame.moon` (on a SkyFrame from Task 3a, `keyColor` and `keyIntensity`), at `max(0, dot(normal, keyDir))`.
  The model is checked against the screen by Task 3b's grey card. A model that only agrees with itself is not a
  measurement.

- [ ] **Step 1: Write the failing gate.** The file header states the denominator and the mutants (Step 5). Test-local
  helpers: `snap(frame)` flattens a frame to `{ name: number }`; `close` is an approximate-equality matcher (1e-6);
  `keyFrame(name)` is `sampleScript` at that key's anchor; `rgb(color)` reads a `Color`'s linear channels; `UP` is
  `[0, 1, 0]`; `NOON` and `sunDirAt(f)` are `sunArcDirection(MOOD_SCALARS.explore.sunPos, f)`; `MOON_REF` is
  `[0.284, 0.530, -0.799]` (the moon at 32 deg, Task 2's `MOON_NOON`); `towardSunHorizontal(f)` is the unit horizontal
  normal facing the sun's azimuth; `skyAndFog(frame)` lists the fog and the three sky colours. Cases:

```js
it('six keys, every field', () => {
  expect(Object.keys(SCRIPT_KEYS)).toEqual(['night', 'preDawn', 'sunrise', 'day', 'sunset', 'dusk']);
  for (const k of Object.values(SCRIPT_KEYS)) for (const f of FIELDS) expect(k[f], f).toBeDefined();
});
it('continuous: 3600 steps around the clock, wrap included', () => {
  let checked = 0;
  for (let i = 0; i <= 3600; i++) { const a = snap(sampleScript(i / 3600)), b = snap(sampleScript((i + 1) / 3600));
    for (const [k, v] of Object.entries(a)) { expect(Math.abs(v - b[k]), `${k} at ${i}`).toBeLessThanOrEqual(STEP[k]); checked++; } }
  expect(checked).toBe(3601 * FIELD_COUNT);
}); // STEP: colour channels 0.02 (linear), intensities 0.03, densities 0.0002
it('the branches meet: noon and midnight read the same from both sides', () => {
  expect(snap(sampleScript(0.25 - 1e-9))).toEqual(close(snap(sampleScript(0.25 + 1e-9))));
  expect(snap(sampleScript(0.75 - 1e-9))).toEqual(close(snap(sampleScript(0.75 + 1e-9))));
});
it('keys land where they are declared', () => {
  expect(scriptKeysAt(0.02)).toMatchObject({ from: 'sunrise', to: 'day' });   // morning is the RISING branch
  expect(scriptKeysAt(0.48)).toMatchObject({ from: 'sunset', to: 'day' });    // the lookbook's golden frame
  expect(snap(sampleScript(Math.asin(0.45) / (2 * Math.PI)))).toEqual(close(snap(keyFrame('day'))));
});
it('junk-cycle: NaN, Infinity, undefined -> the day key, every value finite', () => {
  for (const f of [NaN, Infinity, -Infinity, undefined, null, 'x'])
    expect(snap(sampleScript(f))).toEqual(close(snap(keyFrame('day'))));
});
// Every B-gate reads the DISPLAYED colour: the grade, then NEUTRAL (review amendment 1). The bounds are set by this
// amendment from the scratch model: the evidence navy is displayed C 0.092; a grey at displayed L 0.30 is about 46/255.
const D = (fr, c) => oklch(displayed(c, fr.grade));
it('B1 flat ambient, as displayed: a shadowed and a fully occluded stone up face are near-neutral at every hour', () => {
  // On the low tier (no N8AO, no god rays) these two terms are the whole shade of every face the key does not reach.
  let n = 0; for (let i = 0; i < 360; i++) { const fr = sampleScript(i / 360), cap = fr.s >= KEY_S.day ? 0.05 : 0.07;
    expect(D(fr, stoneFaceUnder(fr, { normal: UP, keyDir: null })).C, `shadow f ${i / 360}`).toBeLessThanOrEqual(cap);
    expect(D(fr, aoOccludedStone(fr)).C, `AO floor f ${i / 360}`).toBeLessThanOrEqual(cap); n++; }
  expect(n).toBe(360);
});
it('B2 night is cool and readable, as displayed', () => {
  const night = sampleScript(0.75);
  for (const c of [night.ambient.color, night.hemi.sky, night.fog.color, night.sky.top, night.sky.mid, night.sky.horizon]) {
    const { C, h } = D(night, rgb(c)); if (C >= 0.02) { expect(h).toBeGreaterThanOrEqual(240); expect(h).toBeLessThanOrEqual(300); } }
  const fog = D(night, rgb(night.fog.color)); expect(fog.L).toBeGreaterThanOrEqual(0.18); expect(fog.L).toBeLessThanOrEqual(0.40);
  const lit = D(night, stoneFaceUnder(night, { normal: UP, keyDir: MOON_REF }));
  expect(lit.L).toBeGreaterThanOrEqual(0.30); expect(lit.C).toBeLessThanOrEqual(0.07); // the Hearth is not black, and not navy
  expect(D(night, stoneFaceUnder(night, { normal: UP, keyDir: null })).L).toBeGreaterThanOrEqual(0.20); // nor its shadow
});
it('B2b no maroon after sunset: sky, fog AND the hazed land, as displayed, f 0.53..0.97', () => {
  // The land takes the horizon colour through the aerial haze (55% at full distance), so a pink horizon that passes on
  // its own (L >= 0.5) still turns dark land maroon. The shadowed face is the worst case: the haze dominates it.
  let n = 0; for (let i = 0; i <= 88; i++) { const f = 0.53 + i * 0.005, fr = sampleScript(f);
    const land = hazed(stoneFaceUnder(fr, { normal: UP, keyDir: null }), rgb(fr.sky.horizon));
    for (const c of [...skyAndFog(fr).map(rgb), land]) { const { L, C, h } = D(fr, c);
      expect(!(C >= 0.04 && L < 0.5 && (h >= 330 || h < 30)), `f ${f.toFixed(3)} L ${L} C ${C} h ${h}`).toBe(true); n++; } }
  expect(n).toBe(89 * 5);
});
it('B3 golden hour is warm, as displayed (sunrise, sunset, and the lookbook frame 0.48)', () => {
  for (const f of [0.02, 0.48]) { const fr = sampleScript(f);
    const side = D(fr, stoneFaceUnder(fr, { normal: towardSunHorizontal(f), keyDir: sunDirAt(f) }));
    expect(side.h).toBeGreaterThanOrEqual(40); expect(side.h).toBeLessThanOrEqual(90); expect(side.C).toBeGreaterThanOrEqual(0.05);
    expect(D(fr, stoneFaceUnder(fr, { normal: UP, keyDir: sunDirAt(f) })).b).toBeGreaterThanOrEqual(0); } // up face not blue
});
it('B4 day: designed shadows, as displayed', () => {
  const day = sampleScript(0.25), lit = D(day, stoneFaceUnder(day, { normal: UP, keyDir: NOON })), sh = D(day, stoneFaceUnder(day, { normal: UP, keyDir: null }));
  expect(sh.L / lit.L).toBeGreaterThanOrEqual(0.50); expect(sh.L / lit.L).toBeLessThanOrEqual(0.72);
  const sideLit = D(day, stoneFaceUnder(day, { normal: towardSunHorizontal(0.25), keyDir: NOON })), sideSh = D(day, stoneFaceUnder(day, { normal: towardSunHorizontal(0.25), keyDir: null }));
  expect(sideSh.C).toBeLessThan(sideLit.C);
});
```

  The B-gates measure the displayed colour; what the claim needs is what the player sees. The one gap between the two
  is the model itself (`displayed()`), and Task 3b's grey card closes it by reading the real screen.

- [ ] **Step 2: Run it to see it fail.** `cd frontend && npx vitest run tests/gates/colour-script-gates.test.js`.
  Expected: FAIL, `Cannot find module '../../src/render/colourScript.js'`.
- [ ] **Step 3: Implement `colourScript.js`.** The keys table above, verbatim. `sampleScript`: `solarPhase` picks the
  branch, finds the bracketing anchors in `s` (`night <= twilight <= golden <= day`, clamped at both ends), and lerps
  every field linearly in `s` (colours with `Color.lerpColors`, in linear space). Pre-parse every key's colours once at
  module load; `out` is a persistent scratch. No three import beyond `Color` and `MathUtils`; `aoFloorColor` comes from
  `world/biomeTable.js`. Then re-derive the PROVISIONAL values (the note under the keys table) until the displayed gates
  pass, and record the final values in the keys table: night exposure and moon, ambient and hemi intensities up, night
  chroma down, the night grade's contrast reconsidered, and the `dusk` horizon re-authored toward violet (displayed
  hue 320 or less at the dusk key). The original `#C88A90` fails B2b near f 0.560 (L 0.478, C 0.052, hue 331, measured
  on the scratch model 2026-10-27).
- [ ] **Step 4: Run it to see it pass.** Same command. Expected: PASS, and the printed denominator matches.
- [ ] **Step 5: Mutation-prove it** with `scripts/dev/mutate.sh`, restoring from a `cp` backup. Each must go RED:
  C1 today's day ambient (`#2E8AE0` x0.90) -> B1; C2 night fog `#3A2E40` -> B2; C3 night horizon `#C25A3A` -> B2b;
  C4 sunset sun `#FFFBF2` (today's white sun) -> B3; C5 `rising` inverted -> keys-land; C6 interpolate in `f` instead of
  `s` -> keys-land; C7 non-finite `f` -> 0.75 -> junk-cycle; C8 the twilight anchors deleted (golden jumps to night)
  -> continuous; C9 night `exposure` back to 1.15 -> B2 (displayed L); C10 dusk horizon back to `#C88A90` -> B2b;
  C11 `aoFloor` derived from `sky.mid` (today's source) -> B1 AO case; C12 a dusk AND night horizon that pass the sky
  sample on their own but haze dark land maroon (both set to the f 0.55 horizon as first written, about L 0.55, C
  0.057, hue 351) -> B2b RED only through the hazed-land sample. Record which sample failed: if the sky sample fails
  too, C12 has not proved the land sample is needed, so pick a lighter pink until only the land sample fails. C0
  identity (a comment edit in `colourScript.js`) must SURVIVE.
- [ ] **Step 6: Bytes.** `npm run build && node scripts/ci/bundle-budget.mjs`. Nothing imports the module yet, so the
  `index` delta must be 0 (tree-shaken); the bytes land in Task 3a.
- [ ] **Step 7: Commit.**

```bash
git add frontend/src/render/colourScript.js frontend/tests/gates/_lightModel.js frontend/tests/gates/colour-script-gates.test.js
git commit -m "feat(looks): the six-key colour script by solar phase — night cool and readable, golden hour warm, a near-neutral indirect light (pure; not wired yet)" -m "Mutation-Proof: C1..C12 each RED (named in the file header); C0 identity SURVIVED"
```

### Task 2: The moon takes the key light

**Files:**
- Create: `frontend/src/render/keyLight.js`
- Test: `frontend/tests/gates/key-light-gates.test.js`

**Interfaces:**
- Consumes: `sunArcDirection(noon, fraction, out)` (`mood.js:148`); `sampleScript`, `solarPhase` (Task 1).
- Produces: `MOON_NOON = [0.284, 0.530, -0.799]` (the painted moon's azimuth, `skyDome.js:67`, raised to 32 deg to match
  the sun's noon); `HORIZON_FADE = 0.06`; `moonArcDirection(f, out?) -> number[3]` (= `sunArcDirection(MOON_NOON, f - 0.5)`);
  `resolveKeyLight(noonSunPos, f, frame, out?) -> { sunDir:number[3], moonDir:number[3], keyDir:number[3],
  keyIsMoon:boolean, keyColor:THREE.Color, keyIntensity:number }`. Sun branch: `keyIntensity = frame.sun.intensity *
  smoothstep(0, HORIZON_FADE, s)`; moon branch (`s < 0`): `frame.moon.intensity * smoothstep(0, HORIZON_FADE, -s)`.

- [ ] **Step 1: Write the failing gate.** Cases, each over 3600 samples with the denominator asserted:

```js
it('never-from-below: a lit key always comes from above the horizon', () => {
  for (const f of ring(3600)) { const k = resolveKeyLight(NOON, f, sampleScript(f));
    if (k.keyIntensity > 1e-3) expect(k.keyDir[1], `f ${f}`).toBeGreaterThan(0); }
});
it('the world always has a key away from the horizon', () => {
  for (const f of ring(3600)) { const s = Math.sin(2 * Math.PI * f); if (Math.abs(s) >= 0.1)
    expect(resolveKeyLight(NOON, f, sampleScript(f)).keyIntensity, `f ${f}`).toBeGreaterThanOrEqual(0.05); }
});
it('sunDir is the SUN at every hour — ore glow, leaves, cloud shadows and GodRays read it (F5)', () => {
  for (const f of ring(3600)) expect(resolveKeyLight(NOON, f, sampleScript(f)).sunDir).toEqual(close(sunArcDirection(NOON, f)));
  expect(resolveKeyLight(NOON, 0.75, sampleScript(0.75)).sunDir[1]).toBeLessThan(0);
});
it('midnight is moonlit', () => {
  const k = resolveKeyLight(NOON, 0.75, sampleScript(0.75));
  expect(k.keyIsMoon).toBe(true); expect(k.keyDir).toEqual(close(unit(MOON_NOON)));
  expect(k.keyColor.getHexString()).toBe(SCRIPT_KEYS.night.moon.color.getHexString());
});
it('swap-under-zero: sun and moon trade places only where the key is dark', () => {
  let swaps = 0; for (const [a, b] of pairs(ring(3600))) { const ka = resolveKeyLight(NOON, a, sampleScript(a)), kb = resolveKeyLight(NOON, b, sampleScript(b));
    if (ka.keyIsMoon !== kb.keyIsMoon) { swaps++; expect(ka.keyIntensity).toBeLessThanOrEqual(1e-3); expect(kb.keyIntensity).toBeLessThanOrEqual(1e-3); } }
  expect(swaps).toBe(2); // one at dawn, one at dusk
});
it('the moon rises as the sun sets', () => {
  expect(moonArcDirection(0.6)[1]).toBeGreaterThan(0); expect(moonArcDirection(0.4)[1]).toBeLessThan(0);
});
it('key radiance is continuous: 0.03 per step outside the horizon fade, 0.10 inside it (a ramp, not a pop)', () => {
  let inside = 0, outside = 0;
  for (let i = 0; i < 3600; i++) { const a = i / 3600, b = (i + 1) / 3600;
    const ka = resolveKeyLight(NOON, a, sampleScript(a)), kb = resolveKeyLight(NOON, b, sampleScript(b));
    const d = Math.max(...[0, 1, 2].map((c) => Math.abs(rgb(ka.keyColor)[c] * ka.keyIntensity - rgb(kb.keyColor)[c] * kb.keyIntensity)));
    const inFade = Math.min(Math.abs(Math.sin(2 * Math.PI * a)), Math.abs(Math.sin(2 * Math.PI * b))) < HORIZON_FADE;
    expect(d, `f ${a} (${inFade ? 'in' : 'out of'} the fade)`).toBeLessThanOrEqual(inFade ? 0.10 : 0.03); inFade ? inside++ : outside++; }
  expect(inside).toBeGreaterThan(0); expect(inside + outside).toBe(3600);
});
```

  Why two bounds (review amendment 8). The fade multiplies a key of about 2.4-2.6 by `smoothstep(0, HORIZON_FADE, s)`,
  so inside the fade the key ramps from 0 to full in a few seconds. On the scratch model at `HORIZON_FADE = 0.06`, the
  worst step inside the fade is 0.091 per 1/3600 cycle (setting branch, f about 0.494). That is a ramp of about 2.9 s
  at 300 s per cycle, not a pop. The worst step outside the fade is 0.020. Widening the fade does not bring the inside
  under 0.03: 0.15 still gives 0.055, and 0.20 gives 0.044 while dimming the 0.48 golden key from 2.6 to 1.8. So
  `HORIZON_FADE` stays 0.06, and the fade window gets its own declared bound.

- [ ] **Step 2: Run it to see it fail.** `npx vitest run tests/gates/key-light-gates.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `keyLight.js`.** `resolveKeyLight` writes into `out` (persistent arrays and one `Color`).
- [ ] **Step 4: Run it to see it pass.** Expected: PASS.
- [ ] **Step 5: Mutation-prove it.** K1 `keyDir = sunDir` always (today's behaviour) -> never-from-below; K2 the moon's
  vector written into `sunDir` (the F5 seam) -> sunDir case; K3 no horizon fade -> swap-under-zero; K4 moon colour =
  sun colour -> midnight case; K5 `MOON_NOON` at `f` instead of `f - 0.5` -> moon-rises case; K6 `HORIZON_FADE = 0.001`
  -> continuity case (one step jumps by about 1.3); K7 the fade written as a step at `s = 0.03` -> continuity case.
  K0 identity SURVIVES.
- [ ] **Step 6: Commit** (`feat(looks): the moon takes the key light below the horizon on its own vector; sunDir stays
  the sun's (refute F5)`, with the `Mutation-Proof:` trailer).

### Task 3a: One sky frame — the script, the danger overlays, and capture's declared fractions

**Files:**
- Modify: `frontend/src/render/mood.js:96-102` (`moodTarget`), `:170-205` (`sampleMood`), new exports
- Modify: `frontend/src/render/cloudField.js:40,53-56`
- NOT deleted here: `nightSky.js` stays until Task 3b. `Atmosphere.jsx:13` imports it until then, and three unit
  tests import `Atmosphere.jsx` (`tests/scripts/sun-arc.test.js:6`, `tests/scripts/shadow-frustum-follows-player.test.js:5`,
  `tests/gates/height-fog-instancing-gates.test.js:3`). Deleting it here would fail Step 4 and the pre-commit build
  (`ci/pipeline.sh:126`).
- Test: `frontend/tests/gates/sky-frame-gates.test.js`; modify `frontend/tests/render/mood.test.js`,
  `frontend/tests/scripts/sun-arc.test.js:97-111`, `frontend/tests/gates/cloud-field-gates.test.js` (cloud tint cases)

**Interfaces:**
- Consumes: `sampleScript` (Task 1), `resolveKeyLight` (Task 2).
- Produces:
  - `moodTarget({ dangerLevel, weatherBoost }) -> number` in [0, 2]; an `isDay` argument is ignored.
  - `sampleMood(mood, cycle) -> SkyFrame`: the fields it returns today EXCEPT `sun` and `sunIntensity` (`ambient, fog,
    fill, skyTop, skyMid, skyHorizon, hemiSky, hemiGround, ambientIntensity, fogDensity, fillIntensity, hemiIntensity,
    sunPos, grade`), plus `keyDir, keyColor, keyIntensity, keyIsMoon, moonDir, sunDir, sunColor, stars, glowColor,
    glowStrength, motes, daylight, exposure, aoFloor`. `cycle` omitted -> 0.25. `sunPos` stays the mood's noon vector
    arced by the cycle (the sun), exactly as today. **`sun` and `sunIntensity` are removed, not redefined** (review
    amendment 12). The directional light's colour is `keyColor` (the moon at night), and `sunColor` is the sun's own
    script colour, which the billboard reads. Redefining `.sun` to mean the key is the semantic trap the coast plan
    already warns about, so a stale `.sun` reader now gets `undefined` and fails loudly (`Color.copy(undefined)`
    throws). Today's `.sun` readers: `Sun.jsx:20`, `Atmosphere.jsx:278,295-296`, `cloudField.js:54`, and the test
    `tests/render/mood.test.js:22`; each is rewritten in this task or in Task 3b. `aoFloor` is recomputed from the
    COMPOSED ambient, so the storm and boss overlays carry it.
  - `liveCycle(gameTime) -> number`: `CAPTURE_SOLAR.day` (0.25) when `gameTime` is not finite, else
    `cycleFraction(gameTime)`. `cycleFraction(NaN)` returns 0, which is dawn, where the key is 0 (`dayPhase.js:28-31`).
    Two tests pin that value for the day-phase dial, so the guard goes here and `cycleFraction` is not changed.
  - Overlays: `t1 = clamp(mood, 0, 1)`: fog density x(1 + 2*t1), sky colours lerp 0.4*t1 toward their own luminance
    grey, key intensity x(1 - 0.4*t1), stars x(1 - t1), grade saturation -0.15*t1. `t2 = clamp(mood - 1, 0, 1)`: every
    colour and scalar lerps by `t2` to the existing obsidian state (`PALETTE.obsidian`, `MOOD_SCALARS.obsidian`,
    `MOOD_GRADE.obsidian`, fill `#FF3B5C` x0.85); key direction stays the clock's. Base fill intensity is 0.
  - `skyFrameRef = { current: SkyFrame }` and `publishSkyFrame(frame)`, which COPIES every field into the persistent
    `skyFrameRef.current` (never aliases `sampleMood`'s scratch).
  - `CAPTURE_SOLAR = Object.freeze({ day: 0.25, night: 0.75 })` and `captureCycle({ isDay, captureSolarFraction })`:
    a finite declared fraction wins; otherwise `isDay ? 0.25 : 0.75`.
  - `cloudTint(m, out)` keys on `m.daylight` (0..1) instead of `m.sunIntensity / DAY_SUN`.

- [ ] **Step 1: Write the failing gate** (`sky-frame-gates.test.js`):

```js
it('night is no longer danger', () => { expect(moodTarget({ isDay: false })).toBe(0); expect(moodTarget({ dangerLevel: 2 })).toBe(2);
  expect(moodTarget({ weatherBoost: 0.6 })).toBeCloseTo(0.6); });
it('mood 0 is the script', () => { for (const f of [0.02, 0.25, 0.48, 0.55, 0.75]) expect(colours(sampleMood(0, f))).toEqual(close(scriptColours(f))); });
it('boss-any-hour: mood 2 colours are obsidian at noon and at midnight', () => {
  expect(colours(sampleMood(2, 0.25))).toEqual(close(OBSIDIAN)); expect(colours(sampleMood(2, 0.75))).toEqual(close(OBSIDIAN)); });
it('storm-at-midnight stays readable, as displayed', () => { const m = sampleMood(1, 0.75);
  expect(oklch(displayed(stoneFaceUnder(m, { normal: UP, keyDir: m.keyDir }), m.grade)).L).toBeGreaterThanOrEqual(0.25);
  expect(m.fogDensity).toBeLessThanOrEqual(0.02); });
it('liveCycle: a corrupt gameTime is noon with a lit key, never the key-less dawn', () => {
  for (const t of [NaN, Infinity, -Infinity, undefined, 'x']) { expect(liveCycle(t)).toBe(CAPTURE_SOLAR.day);
    expect(sampleMood(0, liveCycle(t)).keyIntensity).toBeGreaterThan(1); }
  expect(liveCycle(0)).toBe(0); expect(liveCycle(300)).toBeCloseTo(0.25); }); // finite time passes through
it('the key and the sun are different fields: at 0.52 (s about -0.13, moon up) sunColor is still the sun', () => {
  const m = sampleMood(0, 0.52); expect(m.keyIsMoon).toBe(true); expect('sun' in m).toBe(false);
  expect(m.sunColor.getHex()).not.toBe(m.keyColor.getHex()); });
it('publishSkyFrame copies, never aliases', () => { publishSkyFrame(sampleMood(0, 0.75)); const held = skyFrameRef.current.fog.getHex();
  sampleMood(0, 0.25); expect(skyFrameRef.current.fog.getHex()).toBe(held); });
it('captureCycle: declared, then by isDay', () => {
  expect(captureCycle({ isDay: true })).toBe(0.25); expect(captureCycle({ isDay: false })).toBe(0.75);
  expect(captureCycle({ isDay: true, captureSolarFraction: 0.48 })).toBe(0.48);
  expect(captureCycle({ isDay: false, captureSolarFraction: NaN })).toBe(0.75); });
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run tests/gates/sky-frame-gates.test.js`. Expected: FAIL on the
  missing exports and on `moodTarget({ isDay: false })` returning 1.
- [ ] **Step 3: Implement** the interfaces above in `mood.js` and `cloudField.js`. `nightSky.js` stays until Task 3b.
  Rewrite the premises the old tests pinned, saying why in each file: `mood.test.js` "night + no danger = 1" becomes
  "night + no danger = 0"; "mood 1 = dusk palette exactly" becomes the storm overlay at noon; `mood.test.js:22`'s
  `m.sun` becomes `m.sunColor`; `sun-arc.test.js:104-111` asserts `CAPTURE_SOLAR.day === 0.25` (noon keeps the
  bearing) and `captureCycle`'s night fallback. Between this commit and Task 3b the old readers (Sun, MoodGradeDriver,
  Terrain, FarField) still call `sampleMood` with no cycle and so see the noon frame. That is a known intermediate
  state of the branch, and Task 3b ends it.
- [ ] **Step 4: Run the whole suite.** `npm run test:unit`. Expected: PASS. Any other red is a reader of the old
  semantics: fix the reader, not the gate.
- [ ] **Step 5: Mutation-prove it.** S1 `moodTarget` floors night at 1 again -> night case; S2 the obsidian blend
  keyed by `f` -> boss-any-hour; S3 `publishSkyFrame` assigns the scratch by reference -> copies case; S4 `captureCycle`
  night -> 0.25 (today's pin, F5) -> captureCycle case; S5 overlay fog x(1 + 8*t1) -> storm case; S6 `liveCycle` =
  `cycleFraction` -> liveCycle case; S7 `sunColor` written from `keyColor` -> key-and-sun case. S0 identity SURVIVES.
- [ ] **Step 6: Bytes.** Build and budget; record the `index` delta (the script and key-light modules now ship).
- [ ] **Step 7: Commit** (`feat(looks): one sky frame — the colour script under the danger overlays, published once;
  night is no longer danger; capture declares its solar fraction (refute F5)`, trailer).

### Task 3b: Wire the frame into the running game

**Files:**
- Modify: `frontend/src/render/Atmosphere.jsx` (steady-cool `:266` cycle, `:273` horizon flag, `:300-310` dome, `:318-325`
  ambient, sun and the light's position, `:330-344` shadow schedule, `:350-356` fill and hemi)
- Modify: `frontend/src/render/skyDome.js:20-21,53-73`
- Modify: `frontend/src/render/Sun.jsx:14-21`; `frontend/src/render/MoodGradeDriver.jsx:27`
- Modify: `frontend/src/world/Terrain.jsx` (steady-cool `:657-673`); `frontend/src/world/FarField.jsx:113-118`
- Modify (only if the coast lane is on `main`): `frontend/src/render/Ocean.jsx` and `frontend/src/world/FarField.jsx`,
  every site the coast tagged `SEAM light-3b` (seam table rows 2 and 3, under "Seams with other lanes"). The coast
  fallback reads `sampleMood(moodRef.current).skyHorizon` and `sunDirRef`, holds `uSunColor` at a constant, and gates
  both Fresnels with `uFresnelDay`. A no-cycle `sampleMood` returns the noon frame after Task 3a, so unconverted, the
  sea at midnight would haze toward the pale day horizon. The sky-readers gate below goes red until the conversion is
  made, so the case cannot be missed. If this task was already committed when the coast lane merged, the conversion
  is a new commit on the rebase.
- Delete: `frontend/src/render/nightSky.js`, `frontend/src/render/nightSky.test.js` (moved here from Task 3a: this
  commit removes `Atmosphere.jsx:13`'s import). `tests/gates/.killability-ledger.json:143` lists the test; deleting it
  lowers the un-receipted count, which `killability-ledger.mjs` reports as TIGHTENED, so re-freeze with `--write` in
  this commit.
- Modify: `frontend/tests/gates/atmosphere-isolation-gates.test.js` (the sky-readers gate: the single caller plus the
  coast seam's (b) and (c))
- Modify: `frontend/src/store/useGameStore.jsx` (one field `captureSolarFraction: null`); `frontend/src/App.jsx:364` (hooks)
- Test: `frontend/tests/e2e/light-script.spec.js`

**Interfaces:**
- Consumes: `sampleMood`, `publishSkyFrame`, `skyFrameRef`, `captureCycle`, `liveCycle` (Task 3a); `displayed`,
  `stoneFaceUnder` (`tests/gates/_lightModel.js`, imported by the e2e).
- Produces: DEV hooks `setCaptureSolar(f | null)`; `setWeatherMoodBoost(n)` (no such hook is registered today: only
  `setTimeOfDay` is, `App.jsx:364`); `readSkyLight() -> { sunDirY, keyDirY, keyIsMoon, keyIntensity,
  stars, terrainSunDirY, bloomThreshold, mood, weatherBoost, tier }` (`bloomThreshold` read from the live BloomEffect's
  `luminanceMaterial.threshold`); `readSunShadow()` (steady-cool `Atmosphere.jsx:202-206`) gains `schedSun:
  shadowSched.sun` (the direction the shadow map last rendered from, `shadowSchedule.js:52`); and `readGreyCard()`.
  `readGreyCard` mounts a DEV-only 1 m quad, albedo `#8C8C8C`, `MeshStandardMaterial` with metalness 0.1 and the
  stone's roughness, facing up, `receiveShadow = false`, about 2.5 m ahead of and below the camera, near the centre of
  the frame. It waits three frames, then returns the quad's projected screen rect, the live frame's `keyDir` and
  `grade`, and the tier, and removes the quad in a `finally`. It is inside the `import.meta.env.DEV` block, so it is
  absent from production. The skydome gains the uniform `uMoonDir`.

- [ ] **Step 1: Write the failing e2e** (`light-script.spec.js`, real input to enter play, the DEV server):
  - **Weather is pinned before every read** (review amendment 6). The live weather flips clear and storm every 90 s
    (`WeatherSystem.jsx:83-94`), and a storm's boost (about 0.85) scales stars by `(1 - t1)`. So each read first calls
    `setWeatherMoodBoost(0)` and polls `readSkyLight().mood` until it is below 0.02 (10 s cap), then reads within 1 s.
    Each failure message carries `mood`, `weatherBoost`, `tier`, `isAlive` and `active` (gates-and-probes 4e).
  - Presence first, at noon (`setTimeOfDay(0.5)`): `keyIsMoon === false`, `keyDirY` equals `sunDirY` within 1e-6,
    and `keyIntensity > 1`. Then midnight (`setTimeOfDay(0.0)`): `sunDirY < 0`, `keyDirY > 0`, `keyIsMoon === true`,
    `keyIntensity > 0.2`, `stars > 0.9`, `terrainSunDirY < 0` (the terrain's `uSunDir`, so the ore glow and the leaves
    see the sun, not the moon), and `readSunShadow().schedSun[1] > 0` (the shadow map was rendered from the moon's
    key, not from the sun under the ground).
  - The overlay itself, once: `setWeatherMoodBoost(0.85)`, poll until `mood > 0.8`, then `stars < 0.3`. Then reset it
    to 0.
  - **The grey card: the model against the screen** (review amendment 1). At noon (presence) and then at midnight,
    `readGreyCard()`, then `page.screenshot({ clip })` on its rect, decoded with `pngjs` (already a devDependency).
    The median pixel of the card is compared with `displayed(stoneFaceUnder(frame, { normal: UP, keyDir }), grade)`.
    They must agree within displayed OKLab L 0.03 and C 0.02. At noon the card must also read grey (displayed C 0.03 or
    less), which proves the clip is the card. At midnight it must also hold the absolute B2 bounds (displayed L 0.30 or
    more, C 0.07 or less), so a change that moves the model and the screen together still fails.
- [ ] **The sky-readers gate** (review amendment 2; (b) and (c) from the seam reconciliation), in
  `atmosphere-isolation-gates.test.js`. That file is already a
  source-grep ledger member (`tests/gates/.source-grep-ledger.json`), so the frozen population does not rise. It walks
  every `.js`/`.jsx` under `src/` except `*.test.*` (333 on `main`, 2026-10-27), prints the count and asserts it is at
  least 250. It blanks comments the way `gate-shape.mjs` does, then asserts that, apart from the definition in
  `render/mood.js`, exactly one file contains `sampleMood(`, and that the file is `render/Atmosphere.jsx`. The presence
  half (Atmosphere matches) is asserted on the comment-blanked text, so a comment cannot satisfy it
  (`GameScene.jsx:66` is a comment naming `sampleMood(moodRef)`, and must not count). On the same comment-blanked text
  it also asserts the coast seam (table rows 1-3, "Seams with other lanes"): (b) no file contains `uFresnelDay`; (c)
  `render/Ocean.jsx` contains neither `moodRef` nor `sunDirRef`, and if it contains `uSunColor` it also contains
  `glowColor`. Each assertion holds on `main` in both landing orders, so it binds whichever lane commits after it
  exists. It prints whether `Ocean.jsx` contains `uSunColor` (yes only once the coast lane is on `main`).
- [ ] **Step 2: Run it to see it fail.** `npx playwright test tests/e2e/light-script.spec.js` (local, once; the suite
  is CI-only). Expected: FAIL, `readSkyLight` is not a registered hook. Then `sh scripts/dev/kill-test-procs.sh`.
- [ ] **Step 3: Implement.**
  - `Atmosphere`: `const cycle = cap ? captureCycle(st) : liveCycle(st.gameTime)`; `moodTarget` without `isDay`;
    `m = sampleMood(moodRef.current, cycle)`; `publishSkyFrame(m)`. The directional light takes `m.keyColor`,
    `m.keyIntensity`, and its position from `sunWorldPosition(centre, m.keyDir)` (the one writer, `Atmosphere.jsx:156`).
    `sunDirRef` is written from `m.sunDir`. The GodRays horizon flag stays on the SUN (`m.sunPos[1]`). Ambient, hemi
    (plus the lightning flash, unchanged), fill and fog from `m`. The dome: colours from `m` (x exposure, already
    applied), `sunColor = m.glowColor x m.daylight`, `uStar = m.stars`, `uMoonDir = m.moonDir`.
  - `skyDome.js`: replace the `moonDir` constant (`:67`) with `uniform vec3 uMoonDir`.
  - `Sun.jsx`: direction from `skyFrameRef.current.sunDir`; `visible = sunDir.y > -0.05`; colour from
    `skyFrameRef.current.sunColor`, never `keyColor` (Task 5 makes it HDR). The billboard is visible while
    `s > -0.093` (the sun's y is `0.5355 s`), but the key is the moon for every `s < 0`. A billboard reading the key
    would take the moon's colour in that window.
  - `MoodGradeDriver`, `Terrain`, `FarField` (and `Ocean`, if the coast lane landed first): read `skyFrameRef.current`
    instead of calling `sampleMood`.
  - If the coast lane is on `main`, convert its fallback in this commit (seam rows 2 and 3): Ocean's `skyHorizon` from
    `skyFrameRef.current.skyHorizon`; `uSunDir.value.fromArray(skyFrameRef.current.sunDir)` (a `number[3]`, so not
    `.copy`); a per-frame `uSunColor.value.copy(skyFrameRef.current.glowColor)`; and `uFresnelDay` deleted from both
    `Ocean.jsx` and `FarField.jsx` (uniform, declaration, factor, write). `grep -rn "SEAM light-3b" frontend/src` then
    prints nothing.
  - `Terrain`: `uAoFloor` from `frame.aoFloor` (Task 1), replacing `aoFloorColor(skyMid)` at `Terrain.jsx:633-634`.
  - Delete `nightSky.js` and its test; `uStar = m.stars`.
  - The shadow schedule is fed the KEY direction (`m.keyDir`) instead of `m.sunPos`, so the moon's shadows step and
    the dawn and dusk swaps render at once. The light's position and the schedule's direction are two separate reads
    (steady-cool `Atmosphere.jsx:325` and `:334-340`), and BOTH change.
  - The store field and the DEV hooks (inside the existing `import.meta.env.DEV` block, tree-shaken in production).
- [ ] **Step 4: Run the gates.** `npm run test:unit` (PASS), then the e2e once (PASS), then sweep. The existing
  `shadow-schedule-gates.test.js` already proves that a direction step far larger than `SUN_STEP_DEG` renders. What it
  cannot see is which direction Atmosphere feeds the schedule. That is the e2e's `schedSun[1] > 0` at midnight (mutant
  E4). The light's position is a separate input (mutant E2).
- [ ] **Step 5: Mutation-prove** with `scripts/dev/mutate-e2e.sh`: E1 `sunDirRef` written from `m.keyDir` ->
  `terrainSunDirY` RED; E2 the light positioned from `m.sunPos` (today's behaviour) -> `keyDirY` RED; E3 `uStar` left
  at 0 -> stars RED; E4 the schedule fed `m.sunPos` while the light uses `m.keyDir` -> `schedSun` RED; E5 night
  exposure back to 1.15 -> the grey card's absolute bound RED; E6 the spec's weather pin replaced by a forced storm
  (`setWeatherMoodBoost(0.85)` before the midnight read) -> `stars > 0.9` RED, which proves the pin is what keeps the
  read off the 90 s weather cycle. For the unit gate: G1 FarField calls
  `sampleMood(moodRef.current)` again -> single-caller RED; G3 a `uFresnelDay` uniform written into `FarField.jsx` ->
  (b) RED; G4 `Ocean.jsx` reads `sunDirRef.current` -> (c) RED; G5 `Ocean.jsx` declares a `uSunColor` uniform with no
  `glowColor` read -> (c) RED; G2 the call, `uFresnelDay` and `sunDirRef` written only in comments -> stays GREEN.
  E0 identity SURVIVES.
- [ ] **Step 6: See it.** Build, then one lookbook run on Chromium only, and OPEN the 0.48 and 0.75 frames. A green
  e2e is not a look.
- [ ] **Step 7: Commit** (`feat(looks): the light rig, the dome, the sun billboard, the grade and the land read one sky
  frame — a moonlit night, a sun billboard that finally arcs`, trailer). This commit changes how every capture frame
  looks; the baselines are NOT touched here (Task 9).

### Task 4: Capture renders night as night, and guards golden hour

**DROPPED 2026-10-28, never built** (SOTA reset, section 8; DECISIONS 2026-10-28 item 21b). The capture oracle
retires; looks are accepted on the eye-level lookbook. The code built only for this task (`captureSolarFraction`,
`setCaptureSolar`, `captureCycle`'s declared fraction) was removed in `a0cac94a`. The text below is kept as the record.

**Files:**
- Move (Step 0, its own commit): `frontend/src/devtest/visualStates.js` -> `frontend/tests/visual/visualStates.js`;
  modify its two importers `frontend/tests/gates/visual-denominator-gates.test.js:12` (and the message at `:49`) and
  `frontend/tests/visual/diff.test.js:7`
- Modify: `frontend/scripts/visual/capture.mjs` (after `explore-day`, `:476-479`)

**Interfaces:**
- Consumes: the `setCaptureSolar` hook (Task 3b); `captureCycle`'s fallback (Task 3a) already sends every `isDay false`
  state (`explore-night-low`, `explore-night`, `boss-obsidian`, the beast cards set at night by `App.jsx:471`) to 0.75.
- Produces: one new state, `explore-golden`, at a declared 0.48 (the lookbook's golden fraction).

**Why Step 0 (review amendment 4, with a defect the review's own fix would have hit).** A frame asserts only when
`VISUAL_STATES` names it (`diff.test.js:39`) and the density ledger holds it (`diff.test.js:302`). A unit gate,
`visual-denominator-gates.test.js:34-52`, run by every pre-commit, demands that `VISUAL_STATES` equal the baselines on
disk in BOTH directions. A state without a baseline is MISSING, and a baseline without a state is an ORPHAN. So the
entry and the first `explore-golden.png` must land in ONE commit. The baseline commit may not touch `frontend/src/`
(`baseline-trailer.mjs:41`, rule 2), and `VISUAL_STATES` lives in `src/devtest/`. Under that layout, no ordering
passes both gates. Nothing in `src/` imports the module: its only importers are the two tests above. So Step 0 moves
it to `tests/visual/`, where the entry, the baseline and the density-ledger freeze can share Task 9's baseline-only
commit.

- [ ] **Step 0: Move `VISUAL_STATES` out of `src/`** (`git mv`, repoint the two imports and the gate's message, which
  names the path). `npm run test:unit` must stay green with 31 states and 31 baselines. If `mutation-proof-trailer`
  reads the message edit as an assertion rewrite, the commit carries `Mutation-Proof:` with the reconcile mutant (an
  orphan png -> RED). Commit (`test(visual): the gated-states list moves to tests/visual — nothing in src imports it,
  and under src a new state could never land with its first baseline`).
- [ ] **Step 1: Add the state.** After the `explore-day` shot: `setCaptureSolar(0.48)`, `delay(1500)`,
  `flushFrames(page, 8)`, `shot(page, 'explore-golden.png')`, then `setCaptureSolar(null)` before `hearth`. The reset is
  a declared value (null -> the `isDay` fallback), never a skipped write.
- [ ] **Step 2: Prove the producer emits it.** The declared fraction is drivable and pure (`captureCycle`, Task 3a);
  the wiring is proved when Task 9's capture produces `explore-golden.png` and the frame, opened, shows a low warm sun.
  State that in the commit body (gates-and-probes 4c).
- [ ] **Step 3: Commit** (`test(visual): capture shoots explore-golden at a declared 0.48; night states render at
  0.75 through captureCycle`). No baseline and no `VISUAL_STATES` entry in this commit: both land in Task 9 Step 4.
  Until then, do not run a full capture. It would write 32 frames against 31 states into `tests/visual/current/`. The
  second case of `visual-denominator-gates` would then report `explore-golden` as captured but unasserted, and that red
  would block every pre-commit until Task 9 Step 4 lands the entry. Nothing between Task 4 and Task 9 needs a capture,
  because Tasks 3b and 5 use the lookbook and Task 6 uses `pov-probe`.

### Task 5: Bloom only for HDR — threshold above 1, the sources audited, the ores re-tuned

**Files:**
- Create: `frontend/src/render/bloomGrammar.js`
- Modify: `frontend/src/GameScene.jsx` (steady-cool `:137-141`), `frontend/src/render/Sun.jsx`, `frontend/src/render/skyDome.js:49-50`,
  `frontend/src/world/oreGlow.js:14-15`, `frontend/src/EnhancedMagicSystem.jsx:519`, each MEANT source the audit raises
  (it exports its peak), `frontend/src/render/oceanLook.js` (`GLINT_STRENGTH`, only if the coast lane is on `main`:
  seam row 5), and `frontend/src/App.jsx` (the DEV block: `readSkyLight` fields, `probeHdrTarget`)
- Test: `frontend/tests/gates/bloom-grammar-gates.test.js`; modify `frontend/tests/gates/ore-glow-gates.test.js`,
  `frontend/tests/gates/static-gates.test.js:149-163`; extend `frontend/tests/e2e/light-script.spec.js`

**Interfaces:**
- Produces: `BLOOM_THRESHOLD = 1.05`, `BLOOM_SMOOTHING = 0.20`, `SUN_DISC_HDR = 2.4` (the billboard's colour multiplier),
  `SKY_SUN_GLOW = 0.45` and `SKY_SUN_DISC = 1.3` (the dome's two terms, today literals at `skyDome.js:49-50`; the GLSL is
  generated from them), and `SKY_MOON_DISC` / `SKY_MOON_HALO` (the dome's moon, today literals at `skyDome.js:72-73`).
  Every MEANT source the audit raises exports its peak radiance as a named constant that the gate imports.
- DEV read: `readSkyLight()` gains `sunBillboardLum` (the luminance of the live billboard material's colour) and
  `skyUniformSunLum` (the dome's live `sunColor` uniform). A DEV hook `probeHdrTarget()` renders one texel of radiance
  3.0 into a 1x1 target of the composer's own `inputBuffer.texture.type`, reads it back with
  `readRenderTargetPixels`, and returns `{ type, value, colorBufferFloat }`. That value is the lived proof that the
  device keeps radiance above 1 (review amendment 15). Reading `texture.type` alone reads back the type that was
  requested, not what the GPU stores.

- [ ] **Step 1: Audit the glow sources BY RADIANCE, not by flag** (review amendment 7). Inside the composer,
  `toneMapped={false}` does nothing: three tone-maps a material only when the render target is null
  (`WebGLPrograms.js:165-173`), and the package sets the renderer's tone mapping to none. So the 17 files carrying the
  flag are an arbitrary sample. The population to audit is every file that can emit light:
  `grep -rlnE "emissiveIntensity|AdditiveBlending|toneMapped" frontend/src | grep -v "\.test\."` (24 files on `main`,
  2026-10-27; print the count). Add the dome, and the ore glow inside the terrain's standard material
  (steady-cool `oreGlow.js:67`). For each source, record its peak linear radiance (colour x intensity x additive
  overlap) in the commit body, and classify it: MEANT (sun disc, moon disc, spell cores, mob eyes, ore, chest beacon,
  shrine beam, Hearth fire, beast ember) or NOT. Example NOT sources: the enemy projectile (`systems/EnemyProjectileSystem.jsx:62`,
  emissive 0.5) and the mascot gems (`render/mascots/MascotCraftyHero.jsx:87-88`).
  - Every MEANT source below 1.2 x `BLOOM_THRESHOLD` is raised past it in this task, and its peak becomes an exported
    constant. An LDR additive glow cannot reach 1.05 without a raise (the Terrain beam, `Terrain.jsx:596-608`, opacity
    0.62 or less, colour #FFFFFF or less).
  - A NOT source above the threshold is lowered.
  - Spells are already HDR (`spellVisualProfiles.js:27`, glowIntensity 7.0).
  - **The moon disc is MEANT.** The dome's comment says the bloom blows it out. Its peak today is the disc
    `(0.88, 0.92, 1.0)` (luminance about 0.92) plus the halo `0.40 x (0.60, 0.66, 0.90)` (about 0.27), so about 1.18.
    That is above 1.05 but under 1.2 x 1.05. Its two constants move to `bloomGrammar.js` and are raised to the bar.
  - **The ocean's sun glint is MEANT** (seam row 5), when the coast lane is on `main`. It is the sun's mirror image,
    `GLINT_STRENGTH x glowColor` added after `<opaque_fragment>` (coast plan Task 3), so it follows the sun disc's
    grammar. The grep above cannot find it: after the coast lane, `Ocean.jsx` has no emissive, no additive blending
    and no `toneMapped`. So it is listed by name, as the dome and the ore are. Its peak is `GLINT_STRENGTH x
    linLum(sampleMood(0, 0.25).glowColor)`, the lit water under it ignored: at the day key's `#FFF0D8` (linear
    luminance 0.885) the coast's 0.9 gives 0.80, under the threshold. Raise `GLINT_STRENGTH` in `oceanLook.js` to at
    least 1.43, and add `oceanGlint` to `MEANT_GLOW_PEAKS`, its peak computed in the gate from the two imports. If the
    coast lane lands after this one, it makes the same raise and adds the same entry itself.
- [ ] **Step 2: Write the failing gate** (`bloom-grammar-gates.test.js`) and rewrite the two existing ones:

```js
it('only HDR blooms', () => expect(BLOOM_THRESHOLD).toBeGreaterThan(1.0));
it('the sky never blooms, at any hour, under any overlay', () => {
  let n = 0; for (const mood of [0, 1, 2]) for (let i = 0; i < 120; i++) { const m = sampleMood(mood, i / 120);
    for (const c of [m.skyTop, m.skyMid, m.skyHorizon]) { expect(linLum(c), `mood ${mood} f ${i / 120}`).toBeLessThanOrEqual(0.9 * BLOOM_THRESHOLD); n++; } }
  expect(n).toBe(1080);
});
it('the dome\'s sun and moon discs bloom (constants the GLSL is generated from)', () => {
  expect(linLum(sampleMood(0, 0.25).glowColor) * (SKY_SUN_DISC + SKY_SUN_GLOW)).toBeGreaterThanOrEqual(BLOOM_THRESHOLD); // sky base ignored
  expect(linLum(SKY_MOON_DISC) + linLum(SKY_MOON_HALO)).toBeGreaterThanOrEqual(1.2 * BLOOM_THRESHOLD);
  expect(makeSkyDomeMaterial().fragmentShader).toContain(SKY_SUN_DISC.toFixed(3)); // generated, not retyped (skyDome.js:12)
});
it('every MEANT source reaches 1.2 x threshold (imported constants, one per source the audit named)', () => {
  const meant = Object.entries(MEANT_GLOW_PEAKS); // assembled from the sources' own exports; the audit fixes the list
  expect(meant.length).toBe(MEANT_COUNT_FROM_AUDIT);
  for (const [name, peak] of meant) expect(peak, name).toBeGreaterThanOrEqual(1.2 * BLOOM_THRESHOLD);
});
```
  The billboard's HDR multiply is not provable by arithmetic in the test. `SUN_DISC_HDR * linLum(...)` computed inside
  the test passes even when `Sun.jsx` never multiplies. So it is proved where it happens: the e2e reads
  `sunBillboardLum` at noon (`>= 1.2 x BLOOM_THRESHOLD`) and `skyUniformSunLum` (the dome's live uniform, `> 0`), and
  `probeHdrTarget().value > 1` (the buffer keeps HDR on this device).
  `ore-glow-gates.test.js` gains, over the REAL tile texels it already samples: peak nugget linear luminance x
  `ORE_GLOW[ore]` is >= 1.2 x threshold for diamond, >= 1.03 x threshold for gold, and < 0.9 x threshold for iron (it
  glints, it does not halo); the test prints each peak. `static-gates.test.js:149-163` becomes: GameScene binds
  `luminanceThreshold={BLOOM_THRESHOLD}`, and EnhancedMagicSystem's citation equals `BLOOM_THRESHOLD`. The e2e adds
  `bloomThreshold === BLOOM_THRESHOLD` on the live effect (the prop reaches the effect `postFx.jsx` builds once).
- [ ] **Step 3: Run them to see them fail.** `npx vitest run tests/gates/bloom-grammar-gates.test.js
  tests/gates/ore-glow-gates.test.js tests/gates/static-gates.test.js`. Expected: FAIL (module missing; the ores' peaks
  under 1.2 x 1.05 at today's table).
- [ ] **Step 4: Implement.** `bloomGrammar.js`; GameScene's Bloom props; `Sun.jsx` multiplies its colour by
  `SUN_DISC_HDR x daylight`; `skyDome.js` generates its two sun terms from the constants; `ORE_GLOW` re-derived from
  the printed peaks to the middle of each band; the audit's raises and lowers; the EnhancedMagicSystem comment.
- [ ] **Step 5: Run them to see them pass,** then `npm run test:unit`. Expected: PASS.
- [ ] **Step 6: Mutation-prove it.** B1 threshold back to 0.65 -> HDR case and the sky case (day horizon about 0.77 >
  0.9 x 0.65); B2 (e2e) `Sun.jsx` drops the `SUN_DISC_HDR` multiply -> `sunBillboardLum` RED (the old arithmetic case
  stayed GREEN under this mutant, which is why it was replaced); B3 the old `ORE_GLOW` table -> the diamond case; B4
  iron raised to bloom -> the iron case; B5 (e2e) the GameScene prop reverted to the literal 0.65 -> `bloomThreshold`
  RED; B6 the shrine beam's raise reverted -> the MEANT case RED; B7 the moon constants back to today's literals -> the
  dome case RED; B8 (e2e) `probeHdrTarget` given an `UnsignedByteType` target -> `value > 1` RED, which proves the
  probe can see an 8-bit buffer. B0 identity SURVIVES.
- [ ] **Step 7: See it.** One lookbook run on Chromium at 0.75 and a cave or night ore if the pose reaches one: the
  ores halo, the horizon does not. Then run the e2e's `probeHdrTarget` read once locally on Playwright WebKit (the
  lookbook's WebKit engine) and record `{ type, value, colorBufferFloat }` in the commit body. A real iPad is not
  reachable from here: list "composer HDR on iPadOS: unmeasured" in `KEVIN-REVIEW-BATCH.md` as Kevin-gated.
- [ ] **Step 8: Commit** (`feat(looks): only HDR blooms — threshold 1.05, the sun disc and every meant glow pushed
  past it, the ores re-tuned in the same unit (refute F6)`, trailer).

### Task 6: Sun-glow fog

**Files:**
- Create: `frontend/src/render/sunGlowFog.js`
- Modify: `frontend/src/render/Atmosphere.jsx:66-89` (`fog_pars_fragment` takes the `decl`, `fog_fragment` the
  `apply`, both in `installHeightFog`; steady-cool `:73-96`) and its per-frame writes
- Modify: `frontend/src/world/Terrain.jsx` (the material's construction and `compileShader`), `frontend/src/world/FarField.jsx`
  (construction `:42` and `:43`), `frontend/src/render/Ocean.jsx` (construction `:42-48` and `:73` today; if the coast
  lane is on `main`, the `useMemo` that constructs its material and its `onBeforeCompile`: seam row 4)
- Test: `frontend/tests/gates/sun-glow-fog-gates.test.js`; extend `frontend/tests/e2e/light-script.spec.js`

**Interfaces:**
- Produces: `SUN_FOG_POWER = 8`; `sunGlowWeight(viewDir:number[3], sunDir:number[3], strength) -> number`
  (`strength * max(dot, 0)^SUN_FOG_POWER`, NaN-safe -> 0); `sunGlowFogGlsl() -> { decl, apply }` (inside
  `#ifdef USE_SUN_FOG`: `vec3 sunV = normalize((viewMatrix * vec4(uFogSunDir, 0.0)).xyz);` weight from
  `normalize(-vViewPosition)`; `fogColor` mixed toward `uFogSunColor` by the weight); `sunFogUniforms` (one shared
  `{ uFogSunDir, uFogSunColor, uFogSunStrength }`); `SUN_FOG_DEFINES = Object.freeze({ USE_SUN_FOG: '' })`, spread into
  each of the three materials' `defines` WHERE THE MATERIAL IS CONSTRUCTED, as `mat.defines = { ...mat.defines,
  ...SUN_FOG_DEFINES }`. Never pass it as the constructor's `defines` parameter: `Material.setValues` assigns that by
  reference (`Material.js:149`), so the frozen object would replace `{ STANDARD: '' }`
  (`MeshStandardMaterial.js:17`) and any later write to `shader.defines` would throw. And `attachSunFog(shader)`, one
  argument, called from `onBeforeCompile`, which only assigns the SAME uniform objects (identity, so one per-frame
  write reaches all three materials). It adds no GLSL: the declarations and the term ride the global chunks.
- **Why not set the define in `onBeforeCompile`** (review amendment 5). three r172 computes the program cache key at
  `WebGLRenderer.js:1653`, before `onBeforeCompile` runs at `:1693`. A define added inside the hook is compiled into the
  program, but it is missing from the key the program is stored under (`WebGLProgram.js:1074`). Then one of two things
  happens. The key never shows it, so the e2e below would read 0 against a correct implementation. Or a later
  `needsUpdate` re-keys the material, which compiles the same program a second time: a hitch.
- Atmosphere writes `sunFogUniforms` each frame from `m.sunDir`, `m.glowColor`, `m.glowStrength x m.daylight`.

- [ ] **Step 1: Write the failing gate.** Cases: the mirror (into the sun -> `strength`; 90 deg away -> 0; behind -> 0;
  NaN -> 0); the GLSL is generated from the JS constants (change `SUN_FOG_POWER` in a fresh import and the string
  changes; the generated-curve lesson of `ore-glow-gates.test.js` O5); the installed `THREE.ShaderChunk.fog_fragment`
  carries the `USE_SUN_FOG` block after `installHeightFog()` (the existing seam asserts on what three compiles);
  `attachSunFog` shares uniform identity and `SUN_FOG_DEFINES` names `USE_SUN_FOG`; the night key's glow strength is 0
  and sunset's exceeds day's. The e2e adds, at the coast place (the lookbook seam's `coast` pose, `?lookbook=1`), a DEV
  hook over `renderer.info.programs`. For each linked program it reads the fragment source the GPU actually compiled
  (`gl.getAttachedShaders(program.program)`, then `gl.getShaderSource`). Exactly 3 programs (terrain, far field,
  ocean) must contain `uFogSunStrength`, and a presence read must show the count of programs is above 3. Those same
  three programs' `cacheKey` must contain `USE_SUN_FOG`. That proves the key matches the source, so no material
  without the define can be handed a sun-fog program from the cache, and no `needsUpdate` re-keys it into a second
  compile.
- [ ] **Step 2: Run it to see it fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Only these three materials glow: a fogged material without the define compiles the
  height fog exactly as today. `vViewPosition` exists in every MeshStandardMaterial fragment; all three are standard.
- [ ] **Step 4: Run it to see it pass**, then compile it in a real browser (unit tests cannot see GLSL compile):
  `node scripts/visual/pov-probe.mjs` and OPEN the frames, then sweep. Expected: no shader error in the console.
- [ ] **Step 5: Mutation-prove it.** F1 the ocean's `SUN_FOG_DEFINES` removed from its constructor -> e2e count RED;
  F2 the GLSL power typed as 1.0 instead of generated -> generated case; F3 the night glow strength 0.5 -> script case;
  F4 `attachSunFog` clones the uniforms -> identity case; F5 the define moved back into `onBeforeCompile` -> the e2e's
  `cacheKey` agreement RED, while its source count stays green. That split is the point of asserting both. F0 identity
  SURVIVES.
- [ ] **Step 6: Commit** (`feat(looks): fog glows toward the sun — terrain, far field and ocean share one uniform set`,
  trailer). Seam (row 4): if the coast lane's Ocean.jsx unit has already landed, its splice must keep both the
  constructor define and the `attachSunFog` line; tell `plan-coast` before merging. The coast plan's former "ONE line
  in `onBeforeCompile`" was corrected on that side by the seam reconciliation: both plans now say constructor define
  plus `attachSunFog(shader)`.

### Task 7: Motes only where something explains them

**Files:**
- Create: `frontend/src/render/motePresence.js`
- Modify: `frontend/src/render/LightMotes.jsx` (`:106-116` colours and opacity, `:184-187` per-frame writes, the fragment shader)
- Test: `frontend/tests/gates/mote-presence-gates.test.js`; extend `frontend/tests/e2e/light-script.spec.js`;
  `readSkyLight` (App.jsx DEV block) gains two fields

**Interfaces:**
- Consumes: `skyFrameRef.current.motes` (Task 3a's frame) and `moodRef.current`.
- DEV read: `readSkyLight()` gains `motesVisible` (the live mote mesh's `visible`) and `moteNearFade` (true when the
  live mote material's `fragmentShader` contains `moteNearFadeGlsl()`). The pure gates import the module, so they stay
  green if `LightMotes.jsx` never calls it (review amendment 14). Only the live mesh can show it.
- Produces (pure, `render/motePresence.js`): `FIREFLY_COLOR = '#C8F07A'`; `MOTE_NEAR = [2.5, 6.0]`;
  `motePresence(frame, mood) -> 0..1` (`frame.motes x (1 - clamp(mood - 1, 0, 1))`, so the boss hides them);
  `moteNearFade(distance) -> smoothstep(MOTE_NEAR[0], MOTE_NEAR[1], distance)`; `moteNearFadeGlsl()` generated from
  `MOTE_NEAR`. The shader multiplies alpha by the near fade per mote; the mesh is `visible = false` when presence < 0.01.

- [ ] **Step 1: Write the failing gate:** presence 0 at noon and at golden hour, 1 at midnight; near fade 0 at 2 m, 1
  at 6 m; the GLSL near-fade constants are generated from the JS ones. The e2e adds, with the weather pinned as in
  Task 3b: midnight `motesVisible === true` (presence first), then noon `motesVisible === false`, and
  `moteNearFade === true`.
- [ ] **Step 2: Run it to see it fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Keep the tier counts (`quality.js`); capture keeps `CAPTURE_TIME`.
- [ ] **Step 4: Run it to see it pass.**
- [ ] **Step 5: Mutation-prove it.** T1 presence 1 by day -> noon case; T2 near fade removed -> fade case; T3 (e2e)
  `LightMotes.jsx` ignores `motePresence` (today's always-on) -> `motesVisible` at noon RED; T4 (e2e) the near-fade
  splice left out of the mote shader -> `moteNearFade` RED. T0 identity SURVIVES.
- [ ] **Step 6: Commit** (`feat(looks): motes are fireflies at night and never on the lens; by day there are none`,
  trailer).

### Task 8: Day length, reviewed

**DECIDED 2026-10-28: 480 s, not 300 s** (`14c9707b`; DECISIONS 2026-10-28 item 21a). The SOTA reset gave this lane
the decision, and the First Night (one dusk, one siege, one golden dawn in ten minutes) settled it. The text below is
the original review, kept as the record.

**Files:**
- Modify: `docs/superpowers/DECISIONS.md` (one new dated entry)

- [ ] **Step 1: Write the entry.** Facts: 300 s cycle (`dayNight.js:26`); the sun's noon elevation is 32.4 deg (the
  explore `sunPos`, `mood.js:25`); in the script the golden window (`s` 0..0.30) lasts 14.5 s each side, 23.3 s at
  480 s, 29.1 s at 600 s. Decision: keep 300 s in this lane; the script's key placement is the lever with no balance
  cost. Win: a 480 s cycle (`GAME_UNITS_PER_SECOND` 2.5) gives golden hour 23 s. Compose: it pairs with roadmap move 10
  (encounters), which re-balances the siege anyway. Door: one constant, reversible, but every timed system (siege
  length, hunger, the DuskWarning lead of about 27 s, `dayPhase.js:20-23`) moves with it. Rails: none. Threat: a
  4-minute siege night for a young player. Revisit with move 10, after the lookbook re-shoot.
- [ ] **Step 2: Commit** (`docs(decisions): day length reviewed — 300 s kept for the light lane; 480 s goes with the
  encounters move`).

### Task 9: Acceptance — the lookbook re-shot, side by side, then the baselines alone

**Files:**
- Modify (separate commit): `frontend/tests/visual/baseline/*.png`, `frontend/tests/visual/baseline/.capture-meta.json`
- Modify: `memory/ACTIVE_PLAN.md`, `memory/CHANGELOG.md`, `docs/superpowers/KEVIN-REVIEW-BATCH.md`

- [ ] **Step 1: Re-shoot the lookbook** on the built branch: `npm run build && node scripts/visual/lookbook.mjs --out
  <scratchpad>/lookbook-after`, all three targets, four places, four times. Expected: exit 0, every target `hardware`,
  every shot valid (or each invalid one re-shot). Sweep.
- [ ] **Step 2: Open them side by side** with Task 0's same-build "before" and the evidence frames: at least
  hearth and coast at 0.48 and 0.75 on all three targets. ACCEPTANCE, judged by eye and written into the plan's
  as-built note: night reads cool blue-violet with a visible moonlit key and the Hearth not black; no orange or maroon
  sky after dusk; golden hour warm on sun-facing faces; WebKit 820x1180 stone grey, not navy; the horizon not milky at
  0.30; ores and the sun halo, the sky does not; no motes on the lens by day. Any miss goes back to the keys table
  (tune within the gates) and Step 1 repeats. Also measure, not only judge: read the Hearth's stone pad from the
  hearth frames at 0.48 and 0.75 on all three targets (a fixed patch per target, chosen on Task 0's "before" frames).
  Print the patch's median displayed sRGB and OKLCH beside what `displayed()` predicts, and write both into the
  as-built note. This is the only real-GPU, WebKit, iPad-viewport reading of the model. The grey card (Task 3b) runs
  on CI's software renderer.
- [ ] **Step 3: Build a side-by-side sheet** (before | after, per target and time) and publish it for Kevin's async
  review; link it in `KEVIN-REVIEW-BATCH.md`.
- [ ] **Step 4 (DROPPED 2026-10-28 with the capture oracle; DECISIONS 2026-10-28 item 21b): The capture re-baseline,
  alone.** First add `'explore-golden'` to `VISUAL_STATES` (now
  `tests/visual/visualStates.js`, Task 4 Step 0). Then capture twice (`npm run visual:capture`, one run at a time,
  port 4178), copying `tests/visual/current/` to `<scratchpad>/runA` and `<scratchpad>/runB` after each run. Review
  run A, promote its frames to `tests/visual/baseline/`, and freeze the density ledger against the pair:
  `node scripts/visual/freeze-density.mjs <scratchpad>/runA <scratchpad>/runB`. It reads the baseline against each
  run, which is what `tests/scripts/density-ledger-measured.test.js` requires. Every frame's entry is re-frozen,
  because every baseline moved. Then `npm run test:visual`. Open every changed
  frame, including the new `explore-golden.png`. Commit ONLY the baseline files, the new `.capture-meta.json`, the
  states entry and the `.density-ledger.json` entry, with a `Baseline-Review:` trailer naming what changed and why (the
  colour script, the moon key, bloom > 1, motes, the new frame). No `frontend/src/` path goes in the commit. With the
  move in Task 4, none is needed. At this commit the states list, the baselines and a full `current/` all hold 32 frames,
  so `visual-denominator-gates` is green in pre-commit.
- [ ] **Step 5: e2e in CI.** e2e is certified by CI's `ci ok` on the exact sha (push to a `land/` branch), since W2-C deleted e2e-freshness; no local receipt exists.
- [ ] **Step 6: Reviews.** `/code-review xhigh` over the range; one adversarial reviewer at xhigh on the seams
  (`sunDirRef` versus the key; the shadow schedule's input; the fog chunk's reach; the one-frame read order).
- [ ] **Step 7: Docs.** ACTIVE_PLAN pointer, CHANGELOG entry (state the e2e and lookbook as run in this turn, never
  carried), DECISIONS entries for decisions 2 and 5 (the overlay model; no shadow-tint uniform). The decision-2 entry
  also records two consequences (review amendment 10):
  - `landGrade` now follows danger and storm, not night. Night land is no longer desaturated, because night is mood 0.
    A daytime storm (boost about 0.85) now cools and desaturates the land by up to 0.15, where before only night did.
  - The terrain's AO floor takes its hue from the authored ambient (`frame.aoFloor`), not from `skyMid`.

## Verification gates

| Gate | Where | Kills (named mutant -> RED) | Identity |
|---|---|---|---|
| Colour script, ALL colour bounds on the displayed colour: keys, continuity, junk cycle, B1 flat ambient and AO floor, B2/B2b night (B2b on the hazed land too), B3 golden, B4 day | `tests/gates/colour-script-gates.test.js` | C1-C12 (Task 1 Step 5) | C0 survives |
| Key light: never from below, always a key, sunDir is the sun, moonlit midnight, swap under zero, key radiance continuous (two declared bounds) | `tests/gates/key-light-gates.test.js` | K1-K7 | K0 survives |
| Sky frame: night not danger, script at mood 0, boss any hour, storm at midnight (displayed), copy not alias, captureCycle, liveCycle, key and sun separate | `tests/gates/sky-frame-gates.test.js` | S1-S7 | S0 survives |
| Sky readers: only Atmosphere calls `sampleMood(`; no `uFresnelDay`; `Ocean.jsx` reads the frame, not `moodRef` or `sunDirRef` (seam rows 1-3) | `tests/gates/atmosphere-isolation-gates.test.js` (an existing ledger member) | G1, G3-G5 | G2 (comments) survives |
| Lived: the moon key at midnight, the sun at noon, the terrain reads the sun, the shadow schedule reads the key, weather pinned plus one storm read, the grey card (model = screen, absolute night bounds), live bloom threshold, billboard HDR, HDR target, fog programs (source and key), motes | `tests/e2e/light-script.spec.js` (CI) | E1-E6, B2, B5, B8, F1, F5, T3, T4 | E0 survives |
| Bloom grammar: threshold > 1, sky never blooms, the dome's sun and moon discs, every MEANT source imported, ores re-tuned | `tests/gates/bloom-grammar-gates.test.js`, `ore-glow-gates.test.js`, `static-gates.test.js` | B1, B3, B4, B6, B7 | B0 survives |
| Sun-glow fog: mirror, generated GLSL, installed chunk, shared uniforms, define at construction | `tests/gates/sun-glow-fog-gates.test.js` | F2-F4 | F0 survives |
| Motes: presence, near fade | `tests/gates/mote-presence-gates.test.js` | T1-T2 | T0 survives |
| The whole suite, lint, build, bundle budget | `npm run test:unit`, `npm run lint`, `npm run build`, `node scripts/ci/bundle-budget.mjs` | — | — |
| **ACCEPTANCE:** the real-GPU lookbook, Chromium ANGLE-Metal and WebKit at 1180x820 and 820x1180, four times of day, opened side by side with the before | `scripts/visual/lookbook.mjs` (Task 9) | by eye, the list in Task 9 Step 2 | — |
| ~~Regression oracle: 32 asserted capture frames, re-baselined alone~~ DROPPED 2026-10-28 with the capture oracle (DECISIONS 2026-10-28 item 21b) | — | — | — |
| Blend against OKLab: no key-to-key blend darker than the OKLab line or greyer by 0.02; the displayed dusk and dawn horizon above C 0.04 | `tests/gates/colour-script-gates.test.js` | OB1-OB3 | OB0 survives |
| Day length: the First Night budget from a fresh profile; a full cycle of the real ticker | `tests/gates/day-length-gates.test.js`, `daynight-clock-gates.test.jsx` | DL1-DL5 | DL0 survives |

What would still pass if the feature were deleted:
- The pure gates import the modules, so they go red if a module is deleted. They do NOT go red if a module stops
  being CALLED: the sun's HDR multiply, the motes' presence, the AO floor's source and the fog define each sit in
  wiring.
- That wiring is what the e2e reads. It reads the rig, the schedule, the billboard's live colour, the mote mesh, the
  compiled fog source, and the grey card on screen.
- The grey card also catches the model and the screen drifting apart.
- The lookbook is still the only gate on the look itself on a real GPU, and on WebKit.

## GPU and byte cost

**GPU (the M3 Max heat complaint):**

| Move | Cost | Basis |
|---|---|---|
| Colour script, overlays, rig values, exposure, grade | 0 | uniform and property values only; no pass, light, texture or program added |
| Moon key | about 0 | the same directional light; the shadow map renders at the same 0.5 deg step rate (the moon uses the sun's arc function) plus one forced render at each of the two swaps. Today's night renders that map from a sun under the ground, so the night renders become useful rather than new |
| Bloom threshold 1.05 | 0 | the bloom's luminance and blur passes run over every pixel whatever their content |
| Sun-glow fog | about 15 ALU per fogged fragment on three materials (one view-space transform, a normalise, a dot, a pow, a mix); no fetch | estimate, unmeasured; held to the roadmap's 0.1 ms at high by timer query, or by `scripts/dev/power-ab.sh` if no query is available |
| Motes | negative by day | presence 0 by day sets `visible = false`: 36 / 80 / 140 additive quads not drawn |
| Sun billboard | negative at night | hidden below the horizon |
| Sun HDR (x2.4) | 0 | a colour value; GodRays already clamps at `clampMax={1}` |
| AO floor from the ambient, `sunColor`, `liveCycle`, the night exposure re-derived | 0 | uniform values and a few scalar operations per frame on the CPU |
| Sun-fog define at construction | 0 extra | the same three programs compile once each; setting the define in `onBeforeCompile` risked a second compile on any re-key |
| DEV hooks (`readGreyCard`, `probeHdrTarget`, the program and mote reads) | 0 in production | inside the `import.meta.env.DEV` block, tree-shaken; the grey card exists only for the duration of a read |

**Main chunk:** `colourScript.js` (six keys of about 20 hex colours each plus the sampler), `keyLight.js`,
`bloomGrammar.js`, `sunGlowFog.js`, `motePresence.js`, less `nightSky.js` and the no-cycle re-sample code. Estimate
+5 to +8 KB raw on `index`. Lane ceiling: +10,000 B over Task 0's measurement; above it, pack the key colours as
numbers before anything else. Each task records its delta.

## Seams with other lanes

- **plan-coast (`Ocean.jsx` and `FarField.jsx`; `docs/superpowers/plans/2026-10-27-crafty-coast-water.md`):** seven
  rows, in the table under "plan-coast: the seam table" below. The rows this plan acts on: Task 3b converts the
  coast-first fallback (rows 1-3) and adds the sky-readers gate; Task 5 lists the glint as MEANT (row 5); Task 6 adds
  the constructor define and `attachSunFog(shader)` to the ocean and the far field (rows 3-4). The coast's removal of
  the ocean emissive (the teal glow in `before-webkit-1180x820-coast-0.75.jpg`) is what this lane's moon key needs
  (row 6).
- **steady-cool (merged before this):** the shadow schedule's input changes from `m.sunPos` to `m.keyDir`, both at
  the light's position and at the schedule's direction (two reads); `readSunShadow` gains `schedSun`; Bloom's
  threshold prop changes on the effect `postFx.jsx` builds once.
- **instruments:** the lookbook is this lane's acceptance; no change to it.
- **Later moves:** move 11's moon-white rim reads `skyFrameRef.current.keyColor`; move 12's time-of-day lookup texture
  bakes from `sampleScript`; move 6's title diorama should take the sunset key.

### plan-coast: the seam table

**The light-coast seam table. It is word for word the same in both plans** (`2026-10-27-crafty-light-colour-script.md`,
"Seams with other lanes"; `2026-10-27-crafty-coast-water.md`, "Seam with the light lane"): edit both or neither.
*Light* is the light-and-colour lane (`feat/light-colour-script`), *coast* the coast-water lane (`feat/coast-water`),
and `T<n>` a task in that lane's plan. Each lane merges to `main` as a whole. The first lander is the lane whose
branch reaches `main` first. The second lander rebases on it and does the second-lander column; if its own task was
written before the rebase, it does so on the rebase, and the gates on `main` go red until it does. Preferred order:
light first, since it leads Phase 1; the table makes either order correct. Line numbers are `main` at `c03e9f2f`;
`feat/steady-cool` changes neither `Ocean.jsx` nor `FarField.jsx`. Every site coast writes only for the coast-first
order carries the comment tag `SEAM light-3b` on its line, and the coast commit body lists each one as file:line.

| # | Field or site | Owner | First lander does | Second lander does | Gate that enforces it |
|---|---|---|---|---|---|
| 1 | The ocean's sky inputs, copied from `skyFrameRef.current` each frame before the visibility early-out: `skyHorizon` (a `Color`, into the `skyHorizon` uniform: the Fresnel target and the aerial haze), `sunDir` (a `number[3]`, the SUN at every hour: `uSunDir.value.fromArray(...)`, never `.copy`), and `glowColor` (a `Color`, into `uSunColor`, the glint colour, not multiplied by `daylight`). Never `keyDir` or `keyColor`. `.sun` and `.sunIntensity` no longer exist after light T3a. | light produces (`mood.js`, T3a; Atmosphere publishes it, T3b); coast consumes (`Ocean.jsx`, T3) | Light: publishes the frame; nothing in `Ocean.jsx`. Coast: writes row 2's fallback. | Coast: T3 Step 3 copies the three fields from the frame and reads nothing else: no `sampleMood(`, `moodRef`, `sunDirRef` or `uFresnelDay` in `Ocean.jsx`. Light: T3b converts row 2's sites in the same commit as its Atmosphere wiring. | The sky-readers gate (light T3b, `atmosphere-isolation-gates.test.js`, on comment-blanked code): (a) only `render/Atmosphere.jsx` calls `sampleMood(`; (b) no file under `src/` contains `uFresnelDay`; (c) `render/Ocean.jsx` contains neither `moodRef` nor `sunDirRef`, and if it contains `uSunColor` it also contains `glowColor`. Each holds on `main` in both orders, so it binds whichever lane commits after it exists. |
| 2 | The coast-first fallback in `Ocean.jsx`, which exists only if coast lands first: (i) per frame, `skyHorizon` from `sampleMood(moodRef.current).skyHorizon`; (ii) per frame, `uSunDir` from `sunDirRef.current`; (iii) `uSunColor` set once at creation to the light day key's glow colour `#FFF0D8` (linear) and never written per frame, so the fallback never reads `.sun`, which light T3a removes and whose `Color.copy(undefined)` would throw; (iv) `uFresnelDay = 1 - smoothstep(0.5, 1.0, moodRef.current)`: the uniform, its fragment declaration, its per-frame write and the `* uFresnelDay` factor on the Fresnel weight. Without (iv) the night sea mixes toward the dusk horizon `#C25A3A`, because night is mood 1 today (`mood.js:99-101`, `tokens.js:23`). | coast writes it; light removes it | Coast: writes (i)-(iv), each tagged. Light: nothing; the fallback never exists. | Light: T3b sets (i) from `skyFrameRef.current.skyHorizon` and (ii) with `fromArray(skyFrameRef.current.sunDir)`, gives (iii) a per-frame `copy(skyFrameRef.current.glowColor)`, deletes (iv) and the tags; `grep -rn "SEAM light-3b" frontend/src` prints nothing. Coast, if it wrote the fallback and light merged first: the same conversion on its rebase. | Sky-readers (a) for (i), (c) for (ii) and (iii), (b) for (iv). |
| 3 | `FarField.jsx`, the shared far ring. Light edits `:115` (`skyHorizon` from the frame, T3b; the rest of the block `:112-119` stays, and `uSunDir` keeps `sunDirRef`, the sun, for the cloud shadows) and `:42-43` (the sun-fog define after construction and `attachSunFog(shader)`, T6). Coast edits `:56-83` (`oceanLookGlsl().fns` prepended and the far Fresnel after `<opaque_fragment>`, T6) and `farField.js:46-47,101-102`. The far Fresnel reads the existing `skyHorizon` uniform, so coast adds no sky read of its own. | shared: light owns the sky values in the uniform block, coast the far-water shading | Light: `:115` reads the frame (T3b); the fog lines (T6). Coast: the far Fresnel times `uFresnelDay` (the uniform, its declaration, the factor, and its write in `:112-119`), each tagged. | Coast: the far Fresnel without `uFresnelDay`, rebased on light's block. Light: T3b switches `:115` and deletes FarField's `uFresnelDay` in the same commit; T6 adds the fog lines. | Sky-readers (a) and (b). Coast's `ocean-edge.spec.js` pose B (mutant F5) keeps the far Fresnel present across the switch. |
| 4 | The sun-glow fog on the ocean material: `mat.defines = { ...mat.defines, ...SUN_FOG_DEFINES }` inside the `useMemo` that constructs the material (`Ocean.jsx:42-48` today), and `attachSunFog(shader)` (one argument; it only assigns the shared uniform objects) in `onBeforeCompile` (`:73` today). Never in `onBeforeCompile`: three r172 keys the program at `WebGLRenderer.js:1652-1653`, before the hook runs at `:1693`, and `shader.defines` is the material's own `defines` object (`WebGLPrograms.js:185`). A define written there is compiled but missing from the key, so the next re-key compiles the program a second time, and `acquireProgram` (`WebGLPrograms.js:596-607`) can hand the stored program to another material whose key matches. Never as the constructor's `defines` parameter: `setValues` assigns it by reference (`Material.js:149`), so the frozen object would replace `{ STANDARD: '' }`. The GLSL rides the global chunks that `installHeightFog()` patches (`Atmosphere.jsx:66-89`), so the ocean adds none; one define on every tier keeps one ocean program. | light (`render/sunGlowFog.js`, T6); coast keeps the two lines in `Ocean.jsx` | Light: T6 adds both lines to today's `Ocean.jsx`. Coast: nothing; the module does not exist yet. | Coast: T3 Step 3 adds both lines, or keeps them through its rewrite of the material (T3-T6). Light: T6 adds both to coast's `Ocean.jsx`. | `light-script.spec.js`, the fog-programs case (light T6; a CI e2e, and a push needs its receipt): exactly 3 linked programs contain `uFogSunStrength`, and the same 3 `cacheKey`s contain `USE_SUN_FOG` (mutants F1, F5). |
| 5 | The glint as a bloom source. `GLINT_STRENGTH` (coast `oceanLook.js`) times `glowColor` is MEANT under light's grammar: it is the sun's mirror image, like the sun disc. The bar is `GLINT_STRENGTH x linLum(sampleMood(0, 0.25).glowColor) >= 1.2 x BLOOM_THRESHOLD`, the lit water under it ignored. At the day key's `#FFF0D8` (linear luminance 0.885) that needs `GLINT_STRENGTH >= 1.43`; 0.9 gives 0.80, under 1.05. Light's audit grep cannot find the glint: after coast T3, `Ocean.jsx` has no emissive, no additive blending and no `toneMapped`. | light (the threshold, the audit, `MEANT_GLOW_PEAKS`); coast (`GLINT_STRENGTH`) | Light: T5's audit has no glint to list. Coast: `GLINT_STRENGTH = 0.9`, against today's threshold 0.65. | Coast: T3 Step 3 sets `GLINT_STRENGTH` to the bar and adds `oceanGlint` to `MEANT_GLOW_PEAKS`, its peak computed in the gate from the imported `GLINT_STRENGTH` and `glowColor` (count +1; the `Mutation-Proof:` trailer names 0.9 as RED). Light: T5 Step 1 lists the glint by name, raises `GLINT_STRENGTH` in `oceanLook.js` to the bar and adds the same entry. | `bloom-grammar-gates.test.js`, the MEANT case. By eye, coast T9 rejects a milky sheet on the glint path at 0.48. |
| 6 | Night on the sea. Coast T3 removes the ocean emissive (`Ocean.jsx:46`); night light is light's (the moon key, T2 and T3b). A moonlit glint (`keyDir`, `keyColor`, `keyIsMoon`) is a coast follow-up, in neither plan. | coast (the emissive); light (the night light) | Either lane: nothing at the seam. | Nothing at the seam. If the night sea reads black, the fix is light's night key, never an emissive. | Coast T4's midnight assertion (foam at most 0.6 x its noon Y) reads the sea under whichever rig is on `main`; light T9's lookbook at 0.75. |
| 7 | Main-chunk bytes. The `index` ceiling is 760,000 B (`bundle-budget.mjs:35`) and the build on disk is 696,924 B (`frontend/build/assets/index-RM8RWfkj.js`, 2026-10-27), so the headroom is 63,076 B. It is shared with every Phase 1 lane, and with `feat/steady-cool` and `feat/instruments`, which merge before light. Light's ceiling is +10,000 B and coast's +8,000 B: 18,000 B together, 29% of it. The seam code (rows 2-4) counts to whichever lane writes it. | each lane, its own delta | Records its delta against its own Task 0 base. | Its Task 0 re-measures on the rebased `main`, first lander included, and prints the remaining headroom beside its own ceiling. Its ceiling does not grow to absorb the first lander. | `bundle-budget.mjs` on every commit (the 760,000 B ceiling only). The lane ceilings are checked by each lane's bytes steps (light T1 Step 6 and T3a Step 6; coast T7 Step 1), not by a gate. |

## Out of scope

The split-tone grade effect (the per-key grade uses the existing HueSaturation and BrightnessContrast); the analytic
height-fog integral, aerial value planes and cloud ray-distance fade (roadmap move 4's longer list); a siege overlay
(needs a siege signal, move 10); the title diorama's look (move 6); ocean shading (the coast lane); the all-tier rim
(move 11); a change to the cycle length (Task 8).

## Review amendments (2026-10-27)

An adversarial review returned 16 findings: 2 HIGH, 8 MED, 6 LOW. Each was treated as a hypothesis and re-checked
against the code on `main` (`dfae38b6`), the `feat/steady-cool` worktree (`0d1474b3`), three 0.172.0 and
postprocessing 6.39.5. The colour arithmetic was re-run in scratch models: the reviewer's probe, a displayed-chain
model of the night key, and two horizon-fade models. They live in this session's scratchpad, which does not outlive
the session, so the numbers that matter are copied into the body above. Task 1's `_lightModel.js` is the durable
model.

**Tally: 16 applied, 0 rejected.** In four of them the review's proposed FIX was wrong in part and was corrected: #4,
#8, #14 and #15. When this pass began, parts of #2 were already in the text: Task 3b's conditional Ocean switch, and
the seam section naming `skyHorizon`, `sunDir` and `glowColor`. The review had read an earlier draft.

1. **HIGH: the gates measured colour before tone mapping. APPLIED.**
   - *Re-verified:* BrightnessContrast runs in sRGB with its pivot at 0.5 (`postprocessing/build/index.js:4435,4455`),
     and the EffectPass converts the colour to sRGB for it and back (`:15476-15477`). NEUTRAL's toe outputs `6.25x²` for
     `x` below 0.08 and subtracts one offset from all three channels (`tonemapping_pars_fragment.glsl.js:177-181`).
     The chain order is at `GameScene.jsx:117-126`. One more fact found: HueSaturation clamps the colour at 1
     (`:7387`), and that is now in `displayed()`.
   - *Reproduced:* a grey at L 0.20, 0.25 and 0.292 displays as byte 1, 4 and 12. The plan's night key, in its own
     colours, displays as (5, 22, 57). An exposure near 3 is needed to reach displayed L 0.30, and even then C is
     0.087, against 0.092 for the evidence navy.
   - *Changed:* a `displayed()` helper; B1-B4 and storm-at-midnight restated on the displayed colour with new bounds;
     the night, preDawn and dusk values marked PROVISIONAL and re-derived in Task 1; the grey-card readback in Task 3b
     (the model against the screen, plus absolute night bounds); a real-GPU patch reading in Task 9; mutants C9 and E5.
2. **HIGH: the coast seam had no owner. APPLIED.**
   - *Re-verified:* `sampleMood(` callers on `main` are `MoodGradeDriver.jsx:27`, `Sun.jsx:17`, `Terrain.jsx:624` and
     `FarField.jsx:115`; `Ocean.jsx` has none today. The coast plan's fallback (its Prerequisites) still reads
     `sampleMood(moodRef.current).skyHorizon` and `.sun`.
   - *Changed:* Task 3b switches Ocean.jsx when the coast lane landed first; the File structure row; a single-caller
     gate. That gate sits in Task 3b, not Task 3a as proposed, because the old readers still call `sampleMood` until
     Task 3b. It is placed in `atmosphere-isolation-gates.test.js`, an existing source-grep ledger member, because a new
     source-reading file would raise the frozen population, which `gate-shape.mjs` forbids. `.sun` is removed (see #12).
   - *Not edited here:* what the coast plan owes is listed under "Seams with other lanes".
3. **MED: Task 3a could not commit. APPLIED.**
   - *Re-verified:* `Atmosphere.jsx:13` imports `nightSky.js`. Three unit tests import `Atmosphere.jsx`. Pre-commit
     builds (`ci/pipeline.sh:126`).
   - *Changed:* the deletion moves to Task 3b, with the killability-ledger re-freeze.
4. **MED: `explore-golden` would assert nothing. APPLIED, with the fix corrected.**
   - *Re-verified:* `VISUAL_STATES` and the density ledger gate assertion.
   - *The review's fix:* add the state to `src/devtest/visualStates.js` in its own src commit. That would red
     pre-commit, because `visual-denominator-gates.test.js:34-52` requires states and baselines to match in both
     directions (MISSING). Putting the entry in the baseline commit instead breaks `baseline-trailer` rule 2 (no
     `frontend/src/` path).
   - *Changed:* Task 4 Step 0 moves the list to `tests/visual/`, since only two tests import it. Then the entry, the
     png and the density freeze land in Task 9's one baseline-only commit. 32 frames, all asserted.
5. **MED: the sun-fog define was set where three cannot key it. APPLIED.**
   - *Re-verified:* the cache key is computed at `WebGLRenderer.js:1653` and `onBeforeCompile` runs at `:1693`.
   - *Changed:* `SUN_FOG_DEFINES` at construction; `attachSunFog(shader)` assigns uniforms only; the e2e asserts both
     the compiled fragment source and the `cacheKey`; mutant F5.
6. **MED: `stars > 0.9` flaked on the weather. APPLIED.**
   - *Re-verified:* the 90 s interval and the boost at `WeatherSystem.jsx:83-94`, and the live boost at
     `Atmosphere.jsx:231`.
   - *Changed:* the weather is pinned and the mood polled before every read; one storm read; `mood`, `weatherBoost`
     and `tier` in every message; mutant E6.
7. **MED: the bloom audit selected by an inert flag, and the sun-disc case was circular. APPLIED.**
   - *Re-verified:* `WebGLPrograms.js:165-173`. There are 17 flag files and 24 emitter files. The sun-disc case
     multiplied inside the test.
   - *Changed:* the audit is by radiance; each MEANT source's exported peak is imported by the gate; the billboard's
     HDR is a lived read (B2 now in the e2e).
   - *The moon disc is decided MEANT:* it peaks at about 1.18 today, under the 1.26 bar, so it is raised (B7).
8. **MED: the continuity case was an empty stub. APPLIED, with the fix corrected.**
   - *Changed:* the body is written; mutants K6 and K7.
   - *The review's fix:* widen `HORIZON_FADE` to about 0.15 to stay under 0.03 per step. That is REFUTED by repro: 0.15
     still steps 0.055 on the setting branch, which the review's probe did not sample (it stopped at f 0.25). 0.20
     gives 0.044 and dims the 0.48 golden key to 1.8.
   - *Taken instead:* the review's alternative. Two declared bounds, 0.03 per step outside the fade and 0.10 inside;
     measured 0.020 and 0.091 at `HORIZON_FADE = 0.06`, which stays.
9. **MED: B2b failed on the plan's own keys, and tested sky swatches instead of the hazed land. APPLIED.**
   - *Reproduced:* f 0.560 gives L 0.478, C 0.052, hue 331.2, which is RED. The hazed land at f 0.55 gives L 0.456,
     C 0.045, hue 350.
   - *Changed:* B2b also tests `hazed(land, horizon)` on the displayed colour, with an integer loop and an asserted
     denominator; the dusk horizon goes to violet; mutants C10 and C12.
10. **MED: the AO floor was not modelled. APPLIED.**
    - *Re-verified:* `Terrain.jsx:171,633-634` and `biomeTable.js:106-111,221-226`. The day `skyMid` gives a floor of
      about (0.33, 0.57, 1.02).
    - *Changed:* `aoFloor` is derived from the ambient in the script frame; a B1 AO case; C11; a DECISIONS note on
      the `landGrade` change.
11. **LOW: E2 did not prove what the schedule is fed. APPLIED.**
    - *Re-verified:* steady-cool `Atmosphere.jsx:325` and `:334-340` are separate reads.
    - *Changed:* `readSunShadow` gains `schedSun`; mutant E4; Step 4's claim corrected.
12. **LOW: the sun billboard took the moon's colour. APPLIED.**
    - *Re-verified:* the sun's y is `0.5355 s`, so the billboard is visible for `s > -0.093`.
    - *Changed:* `sun` and `sunIntensity` are removed (not redefined); the billboard reads `sunColor`; a sky-frame case;
      S7.
13. **LOW: a NaN `gameTime` gave a key-less dawn. APPLIED.**
    - *Re-verified:* `dayPhase.js:28-31`.
    - *Changed:* `liveCycle` in `mood.js`, plus S6. `cycleFraction` is left alone, because two tests pin 0 for the
      day-phase dial.
14. **LOW: the motes had no lived proof. APPLIED, with the fix corrected.**
    - *Changed:* `motesVisible` and `moteNearFade` reads, plus T3 and T4.
    - *Correction:* the near fade is generated into the GLSL, not passed as a uniform, so the read checks the live
      fragment source rather than a uniform.
15. **LOW: the HDR composer buffer was never measured. APPLIED, with the fix corrected.**
    - *The review's fix:* read `inputBuffer.texture.type`. That reads back the type that was REQUESTED, the same
      variable as the request, and says nothing about what the GPU stores.
    - *Changed:* `probeHdrTarget` renders radiance 3.0 into a target of that type and reads it back (> 1), with B8
      proving it can see an 8-bit target. It runs on CI Chromium and once locally on WebKit; the iPad stays Kevin-gated.
16. **LOW: two citations were wrong. APPLIED.** `capture.mjs:611` (was `:610`). The shadow-schedule row now carries
    the `steady-cool` tag at `:325,330-344`.

**Not done in this pass:**
- The coast plan was not edited.
- Nothing was rendered, and no lookbook was run.
- The new bounds (displayed L 0.30 / C 0.07 at night, C 0.05 / 0.07 for B1, L 0.25 for the storm) come from the
  scratch model, not from a measured screen. Task 3b's grey card and Task 9's patch reading are where they meet one.

## Seam reconciliation (2026-10-27)

The seam with the coast lane was reconciled in both plans in one pass. Its single statement is now the seven-row
table under "plan-coast: the seam table", which is word for word the table in the coast plan's "Seam with the light
lane" (checked by extracting both blocks and comparing them). Facts re-read for it: `Ocean.jsx`, `FarField.jsx`,
`mood.js`, `Sun.jsx` and `Atmosphere.jsx` on `main` at `c03e9f2f`; `feat/steady-cool` changes neither `Ocean.jsx`
nor `FarField.jsx`; three 0.172.0 (`WebGLRenderer.js:1652-1653,1693,1695`, `WebGLPrograms.js:185,591-607`,
`Material.js:109-111,149`, `MeshStandardMaterial.js:17`); the `index` chunk on disk, 696,924 B. Changed in this file:

1. **Seams with other lanes:** the plan-coast bullet and its "owed by the coast plan" list are replaced by a pointer
   and the table. The owed items are discharged in the coast plan: landing second it reads only `skyFrameRef`; landing
   first it tags every fallback site `SEAM light-3b` and lists them in its commit body; its define moved to the
   constructor; its "matches" claim now points at the identical table.
2. **FarField.jsx row (owed to the coast review, item a):** row 3 names both lanes' lines (`:42-43`, `:115`,
   `:56-83`, `:112-119`); the File structure row and Task 3b's Files name the coast's `uFresnelDay` there.
3. **`uFresnelDay` removal (item b):** Task 3b Step 3 converts the coast-first fallback in `Ocean.jsx` and
   `FarField.jsx`, `uFresnelDay` included, in the same commit as the Atmosphere wiring.
4. **The glint as a MEANT source (item c):** Task 5 Step 1 lists it by name, because the audit's grep cannot find it
   after the coast lane, and gives its bar: `GLINT_STRENGTH` at least 1.43 at the day `glowColor` (linear luminance
   0.885; the coast's 0.9 gives 0.80). Task 5's Files gain `oceanLook.js`.
5. **The single-caller gate became the sky-readers gate:** it adds (b) no `uFresnelDay` under `src/` and (c)
   `Ocean.jsx` reads no `moodRef` or `sunDirRef` and pairs `uSunColor` with `glowColor`, with mutants G3-G5. Before,
   only the `sampleMood(` read had a gate; the `sunDirRef`, constant-colour and `uFresnelDay` sites had none.
6. **Task 6:** the define's exact form (`mat.defines = { ...mat.defines, ...SUN_FOG_DEFINES }`), and why not the
   constructor's `defines` parameter (`setValues` assigns it by reference, replacing `{ STANDARD: '' }` with a frozen
   object); `attachSunFog(shader)` takes one argument and adds no GLSL; the Atmosphere lines widen to `:66-89`, since
   the `decl` must sit in `fog_pars_fragment` for that to hold; the "owed a correction" note now says it is made.
7. **Two cases neither plan covered:** the coast's fallback read `.sun`, which this plan's Task 3a removes, so it
   would have thrown (`Color.copy(undefined)`); the fallback now holds `uSunColor` at a constant. And a lane whose
   task was written before the other merged now converts on its rebase; the gates on `main` go red until it does.
8. **Bytes:** row 7 states both lanes' ceilings (+10,000 B here, +8,000 B coast) against the shared 63,076 B of
   headroom, and the second lander re-measures it on its rebased base.

## As built for the Wave 1 landing (2026-10-28)

The SOTA reset (`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, section 8) keeps this lane and lands it in
Wave 1. It drops the capture-state work, accepts the look on W1-D's eye-level frames and dusk clip, asks for an OKLab
check of the blend, settles the day length here, and leaves the motes reshape with Task 7. Where the tasks above
disagree with this section, this section wins.

| Task | State | Where |
|---|---|---|
| 0-3b (script, moon key, one sky frame, wiring, the 1 Hz follow, the storm clouds, the readers' gates, the dawn read) | Built before the reset | `01fb8a88`, `452d19cc`, `5631bfde`, `1ab2e4d0`, `43cc3112`, `212d294d`, `864e615d`, `4af495ae`, `822589a7`, `9f5b3c7e`, `39891c83`, `69e1c46d` |
| Merge of main at `030ada1f` | Done; this lane never edited `.agent/AGENTS.md`, so nothing was ported to `CLAUDE.md` | `b98127e4` |
| 4 (explore-golden) and 9 Step 4 (the capture re-baseline) | **Dropped**: the declared-fraction code built only for them is removed | `a0cac94a`; DECISIONS 2026-10-28 item 21b |
| 5 (bloom only for HDR) and 6 (sun-glow fog) | **Not in this landing.** W2-I measures, and may delete, GodRays, the sun billboard and N8AO first (reset #16). Task 5 raises the billboard and audits glow sources that W2-I may remove, and Task 6 adds fragment cost before W2-I has its numbers | owed, after W2-I |
| 7 (motes become fireflies) | **Built**: present by the script's hour, never by day or under the boss, faded between 6 m and 2.5 m from the camera | `037ce81a`; `tests/gates/mote-presence-gates.test.jsx`; e2e lines in `light-script.spec.js` (CI) |
| 8 (day length) | **Decided: 480 s**, one constant (`DAY_LENGTH_SECONDS`) | `14c9707b`; DECISIONS 2026-10-28 item 21a |
| OKLab blend check (the reset's ask) | **Measured; the blend stays in linear RGB**: never darker than OKLab, at most 0.0147 chroma short | `428cb4d5`; DECISIONS 2026-10-28 item 21c |
| 9 (acceptance) | On the eye-level lookbook with `--cycles` for dawn and noon (`340b47fa`). See the evidence index | `docs/superpowers/masterpiece-2026-10/evidence/light-colour/index.md` |
