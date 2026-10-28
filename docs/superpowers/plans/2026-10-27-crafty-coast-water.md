# A coast that reads as voxel water — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sea reads as part of the voxel world: block-stepped depth bands (turquoise shallows, teal, deep blue),
a crisp foam line one or two blocks wide at the shore, calm water in the shallows and the swell only offshore, a sun
glint and sky Fresnel that fog like everything else and fade out before the plane's edge, so no square corner shows
against the sky.

**Architecture:** Two new pure modules hold every number. `render/oceanLook.js` holds the shading terms as JS
functions and GENERATES the matching GLSL, the `oreGlow.js` / `leafFeel.js` pattern (decision of record in the
masterpiece plan: "pure GLSL string modules with JS mirrors"). `world/oceanDepthBake.js` keeps a 256 x 256 byte
texture of water depth per world column. It is addressed toroidally by world column, so when the camera moves one
block only the line of columns entering the window is sampled. `render/Ocean.jsx` binds the two: band colour and foam
go into `diffuseColor` before lighting, so the light rig lights them. Fresnel, glint and aerial haze go in after
`<opaque_fragment>`, before three's fog. The vertex shader scales wave HEIGHT by depth, through a generated function
the gate interprets, and never scales the horizontal displacement. The bake runs only while sea is within a wake
radius, so travel inland costs no bake samples. (Amended after the 2026-10-27 review; see the last section.)

**Tech Stack:** three 0.172 (`MeshStandardMaterial.onBeforeCompile`, WebGL2 / GLSL ES 3.00: `texelFetch`,
`textureLod` in the vertex stage), R3F 9.5, vitest (node), Playwright e2e, the lookbook probe.

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md`, Phase 1 bullet 3 ("A coast that reads as voxel
water") and "Seen on a real GPU" ("the ocean is one flat plastic sheet"); roadmap move 7 in
`docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` (rank 7); refute verdict 7 KEEP
(`refute-2026-10-27.md:98`); survey findings at `survey-2026-10-27.json:200-204` and `:471-475`.

## Global Constraints

- Bold-flat, not photoreal: flat colour bands stepped on the block grid, a crisp foam edge, one toon glint lobe. No
  normal maps, no screen-space reflection, no refraction, no new render pass. (The current S1-C design language, `CLAUDE.md` "Design Language"; it stands while it
  earns its place, DECISIONS 2026-10-28 item 16.)
- Band colours come from the S1-C palette where it has them: `PALETTE.explore.waterShallow` `#8FD3D8` and
  `.waterDeep` `#3E86A6` (`frontend/src/theme/tokens.js:17`, which nothing reads today). The middle band is
  `#10BCC6`, today's ocean and far-water colour (`Ocean.jsx:43`, `farField.js:47`).
- No WebGPU/TSL and no three bump (masterpiece plan, "Decisions taken with this plan").
- One program, as today: no `#define` variants per tier. Every tier runs the same terms (roadmap move 7 `rails`).
- Heat: GPU cost stated before and after, held to at most +0.15 ms at high (roadmap move 7 `heat_budget`); no new
  draw call, render target or pass; no `surfaceBlockAt` call on a frame where the camera has not moved; no bake
  sample while no sea is within the wake radius (Task 4). Travel near the coast DOES cost bake samples (256 per metre
  crossed per axis); that cost is stated and budgeted in the Acceptance table, never folded into "idle".
- Main chunk: at most +8,000 bytes on `index`, against the 760,000-byte ceiling (`scripts/ci/bundle-budget.mjs:35`).
  `Ocean` is in `index`: `GameScene` imports it statically (`GameScene.jsx:13`) and `App.jsx:24` imports
  `GameScene` statically.
- Capture determinism: under `isCaptureMode()` the depth bake completes in the same frame, with no budget, and the
  foam lap reads the frozen `uTime` (`Ocean.jsx:66`). A capture guard RESETS to a declared value; it never returns
  early (`.agent/AGENTS.md`, visual gate bullets).
- Keep these strings verbatim in `Ocean.jsx`; existing gates pin them: `const GERSTNER_GLSL = gerstnerGlsl();`,
  `gerstnerWave(gWp, uTime, gDisp, gNrm)` and the capture-time line
  (`ocean-gpu-waves-gates.test.js:74-86`, `ocean-depth-tint-gates.test.js:42-44`).
- Never put a backtick inside the shader template literals (`.claude/rules/voxel-mesher.md` §3b).
- Gate rules: each new `tests/gates/*` file carries a `Mutation-Proof:` trailer naming its mutants and an identity
  mutant run in the same `scripts/dev/mutate.sh` batch. Gate files must not call `readFileSync`, because the
  source-grep ratchet only falls (`tests/gates/.source-grep-ledger.json`).
- Commits: no AI footer; never amend. The visual re-baseline is its own `Baseline-Review:` commit with no
  `frontend/src/` change in it (`scripts/ci/baseline-trailer.mjs`).
- Work in a worktree on `feat/coast-water`, never in the main checkout (estate rule: isolate before editing a shared
  repo).

## Prerequisites

- **The lookbook must be on main** (`feat/instruments`: `scripts/visual/lookbook.mjs`, `_lookbook.mjs`,
  `src/render/lookbookSeam.js`). Task 0 and the acceptance need it. As of 2026-10-27 it lives only on that branch
  (`git ls-tree` checked). If it has not merged, run both from that branch's build, and record which build was used.
- **No dependency on the parked branch.** `oreGlow.js` / `leafFeel.js` are on `feat/parked-looks-perf` only; this
  plan copies their pattern, not their code.
- **The light-and-colour lane runs in parallel** and owns `mood.js`, the light rig, bloom and fog. Every point where
  the two plans touch is a row of the table in "Seam with the light lane" below, which is word for word the table in
  that plan's "Seams with other lanes". In short:
  - **Sky and sun colour come from `skyFrameRef.current`** (exported from `render/mood.js`). Atmosphere writes it
    once per frame, as a copy the ocean can safely hold for the frame. The ocean reads `skyHorizon` (the Fresnel
    target), `sunDir` (the glint direction) and `glowColor` (the glint colour, so golden hour glints gold). It does
    NOT call `sampleMood`: after the light lane's Task 3a, a call without `cycle` returns NOON, every call overwrites
    the shared `_out` scratch, and `.sun` and `.sunIntensity` no longer exist (removed, not redefined: that plan's
    review amendment 12). Seam row 1.
  - If this lane lands FIRST, `skyFrameRef` does not exist yet, and Task 3 writes the fallback of seam row 2, with
    `uFresnelDay` on the Fresnel. Reason for `uFresnelDay`: today night is the dusk mood (mood 1,
    `mood.js:99-101`), whose `skyHorizon` is `#C25A3A` (`tokens.js:23`), so an ungated Fresnel would mix the night
    sea toward orange and deepen the "maroon under an orange sky" defect the programme leads with. Each fallback
    site is tagged `SEAM light-3b` and listed file:line in the commit body. The light lane's Task 3b converts them,
    or this lane does on its rebase if the light lane merges first after this lane's Task 3 was written.
  - **Preferred order: the light lane merges to `main` before this lane's Task 3 is written**, as the umbrella says
    the light lane leads Phase 1. The table makes either order correct.
  - `FarField.jsx` is shared (seam row 3); the sun-glow fog's define goes where the material is constructed, never
    in `onBeforeCompile` (row 4); the glint is a MEANT bloom source held to the light lane's bar (row 5). This lane's
    terms sit before `fog_fragment`, so they take that fog without any other change here.
  - Unchanged surfaces: `sunDirRef` stays the sun's direction at every hour (the light lane gates it: K2, E1), and
    `aerialGlsl()` keeps its code while `skyHorizon` takes the script's values.
  - Removing the ocean emissive (Task 3) is what lets the light lane's moon key light the night sea (row 6). Night
    glint by the moon (`keyDir` / `keyColor` / `keyIsMoon`) is a follow-up, not this plan.
- **Instrument commits land on `feat/instruments`, before Task 0, with that lane's agreement.** `--hold-place <id>`
  for `lookbook.mjs` (Task 7 Step 3) and `--place <id>` for `gpu-cost-probe.mjs` (Task 0 Step 3, Task 7 Step 2) pose
  through `lookbookSeam.js`, which exists only on that branch (`lookbook.mjs` is absent from main: `git ls-tree`,
  2026-10-27). The BEFORE baseline needs them as much as the AFTER does. One commit:
  `feat(instruments): hold and measure at a lookbook place`.

## Seam with the light lane

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

## Current code, cited (read 2026-10-27, main `f0e84766`)

- `render/Ocean.jsx`: a 220 m plane (`:24`), 96 segments (`:25`), re-centred on the camera's integer column every
  frame (`:58`, `:68-69`). Material: `#10BCC6`, roughness 0.22, emissive `#0E7E93` at 0.22, opacity 0.93
  (`:42-48`). Waves run on the GPU (`:79-98`). Foam is crest height plus SLOPE (`:95-97`); the slope term draws the
  white blotches and the "stepped white terraces" (survey `:201`). The Fresnel, the glossy band and the foam are
  spliced after `<dithering_fragment>` (`:99-108`), and three r172 runs opaque → tonemapping → colorspace → fog →
  premultiplied → dithering (`node_modules/three/src/renderers/shaders/ShaderLib/meshphysical.glsl.js:221-226`), so
  those terms are never fogged. Three things follow. The Fresnel mixes toward a fixed teal (`:104`). The highlight
  band reads a fixed vector `(0.4, 1.0, 0.3)`, not the sun (`:105-106`). The foam is mixed in unlit, so it glows
  white at night (`before-webkit-1180x820-coast-0.75.jpg`).
- Shader anchors: `diffuseColor` is initialised at `meshphysical.glsl.js:165`, `<color_fragment>` at `:173`,
  lighting at `:187`. `geometryNormal` is declared in `lights_fragment_begin.glsl.js:17`. `<opaque_fragment>` writes
  `gl_FragColor = vec4(outgoingLight, diffuseColor.a)`.
- Visibility: `oceanVisibleNear` samples up to 9 columns per call, returning at the first wet one
  (`world/oceanVisibility.js:20-24`, `:37-42`, early exit `:39`), and `Ocean.jsx:63` calls it EVERY frame, even
  standing still.
- Travel and spawn: `BASE_MOVE_SPEED = 14` m/s (`game/locomotion.js:3`). The spawn is the origin column
  (`App.jsx:547`), and `oceanVisibleNear(0, 0, surfaceBlockAt…)` returns `false` there (run 2026-10-27): at spawn
  the ocean is hidden, so three never links its program or uploads its textures. A cost probe that measures at spawn
  cannot see the ocean.
- Sea geometry: `SEA_LEVEL = 28`, `DEEP_FLOOR = 6` (`world/oceanProfile.js:8`, `:10`). The six wave amplitudes sum
  to 1.96 m at `STEEPNESS = 1.0` (`:70`, `:75-82`). A block at `y` spans `[y, y+1]`: the +Y face is emitted at
  `y + 1` (`world/mesher.js:218-224`). So **water depth below the drawn plane = `SEA_LEVEL - (surfaceY + 1)`**,
  which is `27 - surfaceY`. `climate.isWater` counts `surfaceY <= 28` (`world/climate.js:22`), and its top face sits
  at 29, one block above the plane. The bake must not copy that.
- Nothing reads the wave table for physics or swimming. `rg "gerstner|WAVES\b|from '.*oceanProfile" src` hits only
  `Ocean.jsx`, `farField.js:18,24`, `climate.js`, `terrain.worker.js` and `oceanVisibility.js`. The roadmap's
  door ("the physics surface must follow the visual amplitude") has nothing to follow today. `FAR_WATER_SINK`
  (`farField.js:24`) bounds the deepest trough. Height scaled by at most 1 keeps that bound true.
- Far field: each water column is drawn `FAR_WATER_LINEAR = #10BCC6` at `SEA_LEVEL - FAR_WATER_SINK`
  (`farField.js:47`, `:101-102`), with aerial haze after `<opaque_fragment>` (`FarField.jsx:81-83`). It draws only
  where chunks are NOT loaded. The loaded radius is 2/3/4 chunks by tier (`render/quality.js:20-32`), so the far
  field is what shows beyond about 32-64 m, under the plane's outer ring.
- Patterns to copy. An R8 `DataTexture` with a world-origin uniform: `FarField.jsx:102-104`. Per-frame mood and sun
  uniforms: `FarField.jsx:112-119`. Aerial after `<opaque_fragment>`: `Terrain.jsx:194-196`, `aerialPerspective.js`.
  GLSL generated from a table and INTERPRETED by the test: `oceanProfile.js:146-180` and
  `ocean-gpu-waves-gates.test.js:27-40`. GLSL-vs-JS-twin curves: `ore-glow-gates.test.js` on the parked branch.
- Tiers: `selectTier` returns `low` for any coarse pointer (`quality.js:41-42`), so every iPad starts on `low`
  (dprCap 1.5, renderDistance 2).
- Measured this session (node 25 / V8, M3 Max, under load): `surfaceBlockAt` costs **0.64-0.77 µs per call** (4,096,
  16,384 and 65,536 calls took 3.1, 12.6 and 41.6 ms). A full 256 x 256 bake would hitch a frame; one line of 256
  columns costs about 0.18 ms. The coast profile at z = 0 runs x = -104 → surfaceY 25 (2 m deep), x = -100 → 29
  (dry). Safari / iPad JS cost is NOT measured.
- Measured this session, a fold check on a vertical-cliff seabed (depth 0 → 21 in one column, t in 0..40,
  5 z-lines): scaling the HORIZONTAL Gerstner displacement by a depth factor folds the surface (minimum
  dx'/dx = **-4.92** unsmoothed, **-1.07** even with a 5-tap 4 m smoothing). The unscaled horizontal displacement
  keeps **+0.553**. So only height is scaled (Task 5).

## Review Focus

1. **A teleport or first sight of the sea.** The bake is mid-fill and unknown columns must render as deep water,
   never as dry land and never as foam. Task 2 pins it (`UNKNOWN` decodes deep); Task 4's e2e waits for
   `pending() === 0` before measuring. Deep here means the deep band `#3E86A6` with full swell, which is darker than
   today's `#10BCC6`: after a teleport beside a beach the shore shows deep blue and a full swell until its columns
   bake, then pops to turquoise, calm water and foam. Nearest-first, the columns within about 16 m bake in the
   first frame and the plane's 110 m half-width in about 47 frames. That pop is accepted and recorded here.
2. **Negative world coordinates.** The main coast is at x ≈ -100. A `%` without the `+ size` wrap, or a GLSL `int`
   cast of a negative float, puts every column on the wrong texel there. Task 2 pins the JS; Task 4's e2e at x ≈ -100
   pins the GLSL.
3. **The plane edge against the far field.** No foam, glint or alpha may survive to the edge (Task 1 knob
   relations), and far water must take the same band and the same sky Fresnel (Task 6), or a ring shows at 96-108 m.
   Task 6's `ocean-edge.spec.js` measures it (the roadmap's "no luminance step across the 110 m plane boundary",
   `roadmap-2026-10-27.json` move 7 `lived_proof`), and the lookbook pose confirms it by eye.
4. **Night.** With the emissive removed and the foam lit, the sea at 0.75 must not read as a black hole or as
   glowing white. That is judged on the acceptance frames. Night light belongs to the light lane; if the sea is too
   dark, the fix is the moon, not an emissive.
5. **The swash row.** Where depth is 0, the sand top sits at the plane's level (28) and calm waves cross it, so sand
   and foam alternate there. That lapping is intended. A visible z-fight shimmer on flat calm water is a defect.
   There is no automated test, deliberately: capture freezes `uTime`, so a frozen frame cannot show shimmer. It is
   judged in motion in Task 9 at the coast pose and in `ocean-probe`'s `surface-skim`. If it shimmers, set
   `polygonOffset` on the ocean material in Task 4 (factor -1, units -1) and re-shoot.
6. **The glint is a bloom source, by decision.** The glint is the sun's own mirror image, so it belongs to the light
   lane's "the sun disc blooms" grammar; it is not clamped. `GLINT_STRENGTH` x `glowColor` added to lit water
   crosses today's bloom threshold (0.65, `DECISIONS.md:427`). Under the light lane's threshold 1.05, a MEANT source
   must reach 1.2 x the threshold, and 0.9 x the day `glowColor` `#FFF0D8` reaches only 0.80 in linear luminance
   (the water under it ignored). So whichever lane lands second raises `GLINT_STRENGTH` to at least 1.43 and lists
   the glint in the light lane's MEANT gate (its Task 5 Step 1; seam row 5). Task 9 rejects a frame where the glint
   path blooms into a milky sheet at golden hour.
7. **Low tier, the shallows at the loaded-chunk edge.** On `low` (every iPad, `renderDistance: 2`, `quality.js:20`)
   the far field draws from about 32 m out (`FarField.jsx:11-13`). Band 0 at alpha 0.8 then shows 20% of the far
   field's flat water about 2 m below, instead of the sand seabed, so a chunk-aligned hue step can show in the
   lagoon along the coast, nearest the player on the iPad. Today's 0.93 opacity has the same mechanism at 7%. Task 9
   looks for it in the WebKit 820 x 1180 frames with an along-coast pose. If it shows, raise `BAND_ALPHA[0]` toward
   0.9 and re-shoot; if not, record it as accepted.

Item 4 is pinned by Task 4's midnight assertion; items 1-3 by Tasks 1, 2, 4 and 6 as cited; items 6-7 by Task 9,
and item 6 also by the light lane's MEANT gate once both lanes are on `main` (seam row 5).

---

## File structure

| File | Responsibility |
|---|---|
| Create `frontend/src/render/oceanLook.js` | Every shading constant; a JS twin of each term; `oceanLookGlsl()`, scalar GLSL functions generated from the same constants; `OCEAN_PLANE`; band colours. No THREE import except `Color` for linear band values. |
| Create `frontend/src/world/oceanDepthBake.js` | The depth encoding, toroidal indexing, and an incremental, budgeted, nearest-first bake over an injected `sampleSurfaceY`. Pure: no THREE, no store. |
| Modify `frontend/src/render/Ocean.jsx` | Owns the `DataTexture`, the uniforms, the per-frame retarget/step/upload, and the GLSL splices. |
| Modify `frontend/src/world/oceanVisibility.js` | Adds `createVisibilityCache(sampleSurfaceY, { radius, cell })` (Task 4: the bake's wake and the plane's visibility). |
| Modify `frontend/src/world/farField.js`, `frontend/src/world/FarField.jsx` | Far water takes the depth band and the sky Fresnel. |
| Create `frontend/tests/gates/_glslScalar.js` | Test helper that turns one generated scalar GLSL function into a JS function. |
| Create `frontend/tests/gates/ocean-look-gates.test.js`, `frontend/tests/gates/ocean-depth-bake-gates.test.js` | Pure gates. |
| Modify `frontend/src/world/oceanVisibility.test.js`, `frontend/tests/gates/far-field-gates.test.js` | Follow their subjects. |
| Create `frontend/tests/e2e/ocean-shore.spec.js` | The rendered seam: foam by what only foam has (low chroma), every sampled column in its expected class, bands in order, Fresnel present without washing, glint present, night foam lit, idle cost 0. |
| Create `frontend/tests/e2e/ocean-edge.spec.js` | The plane boundary against the far field: no luminance step across the 90-120 m annuli, top-down and at a low pose (Task 6). |
| Modify `frontend/tests/gates/ocean-gpu-waves-gates.test.js` | Its `needsUpdate` proxy re-anchored (Task 4); its `runGlsl` interpreter moved into `_glslScalar.js` and imported (Task 5). |

---

### Task 0: The BEFORE set and the cost baseline (no code)

**Files:** `docs/superpowers/DECISIONS.md` only (Step 6). Outputs go to
`docs/superpowers/masterpiece-2026-10/evidence/coast-before/` (JPEG, as the existing `before-*.jpg`). The numbers go
into this plan's Acceptance table, filled in under Task 7's commit.

- [ ] **Step 1:** From `frontend/` on the base commit: `npm run build && node scripts/visual/lookbook.mjs --out /tmp/coast-before`.
  Expected: exit 0, `lookbook.json` with `coast-0.30/0.48/0.55/0.75` valid on all three targets, and the Chromium
  renderer `ANGLE (Apple, ANGLE Metal Renderer ...)`, not SwiftShader.
- [ ] **Step 2:** Convert the 12 coast PNGs to JPEG under `evidence/coast-before/` and OPEN each one. Two already
  exist (`before-chromium-1280x800-coast-0.48.jpg`, `before-webkit-1180x820-coast-0.75.jpg`). Re-shooting keeps all
  12 from one build.
- [ ] **Step 3:** `node scripts/visual/gpu-cost-probe.mjs --place coast --json /tmp/coast-before/gpu-cost.json`
  (the `--place` seam from Prerequisites). Record drawCalls, programs and textures. At spawn the ocean is hidden
  (see "Current code"), so an unposed run measures a scene without it. The run must also show that the ocean was
  drawn: some linked program's `cacheKey` contains `gerstnerWave(gWp`. Three folds `onBeforeCompile.toString()` into
  the key (`Material.js:109-111`, `WebGLPrograms.js:361`, `:411`), and that string is pinned in `Ocean.jsx` before
  and after this lane. Without it the probe reports COULD NOT MEASURE, never a delta.
- [ ] **Step 4:** Record the `index` chunk bytes printed by `node scripts/ci/bundle-budget.mjs`.
- [ ] **Step 5:** `sh scripts/dev/kill-test-procs.sh`. A local run bound a port; whether a browser tab was left
  cannot be seen. Say that; do not say "clean".
- [ ] **Step 6: Record the decision that lets this lane change the look.** `DECISIONS.md:452-453` reserves the ocean
  water aesthetic to Kevin ("stays in the inbox until Kevin has an opinion"), and `:478` names it the one item
  that is genuinely his. His 2026-10-27 grant (`:86-92`: "Wherever the plan says I check, confirm or decide, that is
  now yours", and "make Crafty a masterpiece ... you're free to enhance / prune / revise anything") supersedes both.
  Per the repo's rule, a reversal is a NEW dated entry naming what it supersedes, never an edit. Append one dated
  2026-10-27 that names `:452-453` and `:478` as superseded under that grant and states the look chosen (three
  block-stepped bands from the S1-C palette, a 1-2 block lit foam line, calm shallows, sky Fresnel, a toon sun
  glint, no square edge). Commit it alone: `docs(decisions): the ocean look is decided under the 10-27 grant`.

### Task 1: `oceanLook.js` — the terms, their JS twins, and the generated GLSL

**Files:**
- Create: `frontend/src/render/oceanLook.js`
- Create: `frontend/tests/gates/_glslScalar.js`
- Test: `frontend/tests/gates/ocean-look-gates.test.js`

**Interfaces — Produces** (every number below is decided here):
- Constants: `OCEAN_PLANE = 220`; `FADE_NEAR = 70`, `FADE_FAR = 95`; `EDGE_NEAR = 96`, `EDGE_FAR = 108` (horizontal
  metres from the plane centre); `FRESNEL_F0 = 0.02`, `FRESNEL_MAX = 0.30` (was 0.55: see the Fresnel bound test),
  `FRESNEL_POWER = 5`,
  `FRESNEL_FLATTEN = 0.65` (the up vector's weight in the Fresnel normal, so the reflection stays a smooth gradient,
  not blotches); `GLINT_LOBE = [0.965, 0.985]` (smoothstep on `dot(reflect, sun)`), `GLINT_SUN = [-0.02, 0.12]`,
  `GLINT_STRENGTH = 0.9` (against today's bloom threshold 0.65; whichever of this lane and the light lane lands
  second raises it to the light lane's bloom bar, at least 1.43: seam row 5); `BAND_LIMITS = [3, 8]` (metres); `BAND_HEX = [PALETTE.explore.waterShallow, '#10BCC6',
  PALETTE.explore.waterDeep]`; `BAND_ALPHA = [0.8, 0.9, 0.95]`; `FOAM_HEX = '#F2FAFB'`; `SHORE_FOAM_ROWS = 2` (depths
  0 and 1 are always foam); `LAP_ON = 0.5` (depth 2 is foam while the lap is at or above it); `LAP_W = 0.9` rad/s;
  `LAP_K = [0.37, 0.61]` (per-column phase); `CREST_FOAM_H = 1.2` (metres above sea level, a hard step);
  `SWELL_CALM = 0.15`, `SWELL_DEPTHS = [1, 6]`; `UNKNOWN_DEPTH = 99`.
- JS twins, each a pure `number → number`: `fresnel(cosV)`, `distanceFade(dist)`, `edgeAlpha(dist)`,
  `glint(rDotL, sunY)`, `depthBand(depthM)` returning 0 | 1 | 2, `shoreFoam(depthM, lap)` returning 0 | 1,
  `lapAt(cx, cz, t)` in [0, 1], `crestFoam(h)` returning 0 | 1, `swellScale(depthM)`,
  `depthFromByte(b)` (`b - 1` for `b < 254.5`, so 0 → -1 dry, 1..254 → b - 1, and a bilinear value between two bytes
  decodes continuously for the vertex stage; `UNKNOWN_DEPTH` for `b >= 254.5`, a half-integer threshold),
  `texelDepth(unorm)` = `depthFromByte(Math.floor(unorm * 255 + 0.5))` (the fragment's `texelFetch` path: GLSL ES
  3.00 does not promise that a UNORM byte times 255.0 is an exact integer, so the decode rounds by a stated rule).
- Composition twins, so the terms that must vanish are gated in node, not only by eye: `alphaAt(bandAlpha, dist)` =
  `bandAlpha * edgeAlpha(dist)`; `foamAmount(shore, crest, dist)` = `max(shore, crest) * distanceFade(dist)`;
  `glintAmount(rDotL, sunY, dist, foam)` = `glint(rDotL, sunY) * distanceFade(dist) * (1 - foam)`;
  `fresnelAmount(cosV, foam)` = `fresnel(cosV) * (1 - foam)`. The fragment patch (Task 3) uses only these.
- `BAND_LINEAR`: three linear `[r, g, b]` triples from `BAND_HEX` (`new THREE.Color(hex).toArray()`, as
  `farField.js:47`). `FOAM_LINEAR` likewise.
- `oceanLookGlsl()` returns `{ fns }`, one GLSL string declaring `float oceanFresnel(float cosV)`,
  `float oceanFade(float dist)`, `float oceanEdge(float dist)`, `float oceanGlint(float rDotL, float sunY)`,
  `float oceanBand(float depthM)`, `float oceanShoreFoam(float depthM, float lap)`, `float oceanCrestFoam(float h)`,
  `float oceanSwell(float depthM)`, `float oceanDepthFromByte(float b)`, `float oceanTexelDepth(float unorm)`,
  `float oceanAlpha(float bandAlpha, float dist)`, `float oceanFoamAmount(float shore, float crest, float dist)`,
  `float oceanGlintAmount(float rDotL, float sunY, float dist, float foam)`,
  `float oceanFresnelAmount(float cosV, float foam)`. Rules for the generator: constants
  substituted by value with `toFixed(4)`; only scalar `float` locals and a single `return`; branches written with
  `step` / `mix`, never `if`; every `smoothstep` with `edge0 < edge1` (GLSL leaves the reverse undefined, as
  `oreGlow.js` notes); `pow` only on `max(x, 0.0)`; a function may call one declared EARLIER in the same string;
  every threshold applied to a decoded byte is a half-integer (`step(254.5, b)`), and the texel decode rounds with
  `floor(x * 255.0 + 0.5)`. The interpreter depends on these rules.
- `_glslScalar.js` exports `glslFn(src, name)`, which returns a JS function. It extracts that function's body,
  rewrites `float ` → `let `, and evaluates it with a prelude of `smoothstep` (throws if `edge0 >= edge1`), `step`
  (`x < e ? 0 : 1`), `clamp`, `mix`, `pow`, `max`, `min`, `abs`, `floor`, `sin`, plus every generated function
  declared before `name` in `src`, interpreted the same way and bound by name. It throws if the function is absent.

- [ ] **Step 1: Write the failing tests** (`ocean-look-gates.test.js`). Assertions, with these exact values:

```js
it('Fresnel rises toward grazing: non-increasing in cos(view), MAX at grazing, MAX*F0 looking straight down', () => {
  let prev = Infinity, n = 0;
  for (let c = 0; c <= 1.0001; c += 0.01) { const f = fresnel(c); expect(f).toBeLessThanOrEqual(prev + 1e-12); prev = f; n++; }
  expect(n).toBe(101);
  expect(fresnel(0)).toBeCloseTo(FRESNEL_MAX, 9);
  expect(fresnel(1)).toBeCloseTo(FRESNEL_MAX * FRESNEL_F0, 9);
  expect(fresnel(0.5)).toBeGreaterThan(fresnel(0.9)); // strictly, somewhere in the middle
});
it('the distance fade is 1 near, reaches exactly 0 at FADE_FAR and stays 0 to the plane edge', () => {
  expect(distanceFade(0)).toBe(1); expect(distanceFade(FADE_NEAR)).toBe(1);
  expect(distanceFade(FADE_FAR)).toBe(0); expect(distanceFade(OCEAN_PLANE / 2)).toBe(0);
  expect(distanceFade(OCEAN_PLANE / Math.SQRT2)).toBe(0); // the corner
  expect(distanceFade(82)).toBeGreaterThan(0); expect(distanceFade(82)).toBeLessThan(1);
});
it('knob relations: foam and glint are gone before the edge fades, and the edge is gone before the DISPLACED border', () => {
  expect(FADE_FAR).toBeLessThanOrEqual(EDGE_NEAR);
  // oDist is measured on DISPLACED positions, and the horizontal Gerstner shift (never scaled) can pull a border
  // vertex inward by up to STEEPNESS x sum(A) = 1.96 m (oceanProfile.js:70, :75-82, :114)
  expect(EDGE_FAR).toBeLessThanOrEqual(OCEAN_PLANE / 2 - STEEPNESS * WAVES.reduce((s, w) => s + w[3], 0));
  expect(edgeAlpha(EDGE_NEAR)).toBe(1); expect(edgeAlpha(EDGE_FAR)).toBe(0); expect(edgeAlpha(OCEAN_PLANE / 2)).toBe(0);
});
it('the sky Fresnel stays under 0.8 x the curve the code history rejected as "pale ice" (Ocean.jsx:104, 0.38 x (1-c)^3), over the grazing range', () => {
  let n = 0;
  for (let c = 0; c <= 0.3001; c += 0.01) { expect(fresnel(c), `cos ${c}`).toBeLessThanOrEqual(0.8 * 0.38 * Math.pow(1 - c, 3)); n++; }
  expect(n).toBe(31);
});
it('the texel decode rounds: a UNORM byte a hair either side of its integer decodes to the same depth, band and foam', () => {
  let n = 0;
  for (let b = 0; b <= 255; b++) for (const e of [-1e-4, 0, 1e-4]) {
    const d = texelDepth((b + e) / 255);
    expect(d, `byte ${b}${e}`).toBe(depthFromByte(b));
    expect(depthBand(d)).toBe(depthBand(depthFromByte(b))); n++;
  }
  expect(n).toBe(256 * 3);
});
it('the compositions zero what must vanish: alpha at the edge, foam and glint past FADE_FAR, Fresnel and glint under foam', () => {
  expect(alphaAt(0.95, 0)).toBeCloseTo(0.95, 12); expect(alphaAt(0.95, EDGE_FAR)).toBe(0);
  expect(foamAmount(1, 0, 0)).toBe(1); expect(foamAmount(0, 1, 0)).toBe(1); expect(foamAmount(1, 1, FADE_FAR)).toBe(0);
  expect(glintAmount(0.99, 0.6, 0, 0)).toBeCloseTo(GLINT_STRENGTH, 9);
  expect(glintAmount(0.99, 0.6, FADE_FAR, 0)).toBe(0); expect(glintAmount(0.99, 0.6, 0, 1)).toBe(0);
  expect(fresnelAmount(0, 0)).toBeCloseTo(FRESNEL_MAX, 9); expect(fresnelAmount(0, 1)).toBe(0);
});
it('the glint is 0 with the sun down at every lobe position, 0 outside the lobe, positive inside by day', () => {
  for (let r = -1; r <= 1; r += 0.05) expect(glint(r, -0.05)).toBe(0);
  for (let s = -0.2; s <= 1; s += 0.05) expect(glint(0.9, s)).toBe(0);
  expect(glint(0.99, 0.6)).toBeCloseTo(GLINT_STRENGTH, 9);
});
it('bands step on whole metres, shallow -> mid -> deep, alpha non-decreasing with depth', () => {
  expect([0, 2, 2.99, 3, 7.99, 8, 21].map(depthBand)).toEqual([0, 0, 0, 1, 1, 2, 2]);
  expect(BAND_ALPHA[0]).toBeLessThanOrEqual(BAND_ALPHA[1]); expect(BAND_ALPHA[1]).toBeLessThanOrEqual(BAND_ALPHA[2]);
  // luminance falls shallow -> deep (each channel weighted differently, so a channel swap cannot pass)
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  expect(lum(BAND_LINEAR[0])).toBeGreaterThan(lum(BAND_LINEAR[1])); expect(lum(BAND_LINEAR[1])).toBeGreaterThan(lum(BAND_LINEAR[2]));
});
it('shore foam lives only in the depth band [0, 2] — never on dry columns, never at depth >= 3', () => {
  let checked = 0;
  for (let d = -3; d <= 22; d++) for (let lap = 0; lap <= 1.0001; lap += 0.125) {
    const f = shoreFoam(d, lap); checked++;
    if (d < 0 || d >= 3) expect(f, `d ${d} lap ${lap}`).toBe(0);
    if (d === 0 || d === 1) expect(f, `d ${d} lap ${lap}`).toBe(1);
    if (d === 2) expect(f, `d 2 lap ${lap}`).toBe(lap >= LAP_ON ? 1 : 0);
  }
  expect(checked).toBe(26 * 9);
  expect(shoreFoam(UNKNOWN_DEPTH, 1)).toBe(0);
});
it('crest foam is a hard step at CREST_FOAM_H, and calm water (height x SWELL_CALM) can never reach it', () => {
  expect(crestFoam(CREST_FOAM_H - 1e-6)).toBe(0); expect(crestFoam(CREST_FOAM_H)).toBe(1);
  const maxCalm = WAVES.reduce((s, w) => s + w[3], 0) * SWELL_CALM;
  expect(crestFoam(maxCalm)).toBe(0);
});
it('the swell is calm in the shallows, full offshore, monotonic, and full on UNKNOWN (todays look while baking)', () => {
  expect(swellScale(-1)).toBe(SWELL_CALM); expect(swellScale(1)).toBe(SWELL_CALM);
  expect(swellScale(6)).toBeCloseTo(1, 12); expect(swellScale(UNKNOWN_DEPTH)).toBeCloseTo(1, 12);
  let prev = 0; for (let d = -1; d <= 22; d += 0.25) { const s = swellScale(d); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
});
it('the byte decode: 0 dry, 1 -> depth 0, 22 -> depth 21, 255 unknown', () => {
  expect([0, 1, 22, 254, 255].map(depthFromByte)).toEqual([-1, 0, 21, 253, UNKNOWN_DEPTH]);
});
it('the GENERATED GLSL computes what the JS twins compute, on a grid over each input', () => {
  const { fns } = oceanLookGlsl();
  const pairs = [
    ['oceanFresnel', fresnel, [[0, 1, 0.01]]], ['oceanFade', distanceFade, [[0, 120, 0.5]]],
    ['oceanEdge', edgeAlpha, [[0, 120, 0.5]]], ['oceanGlint', glint, [[-1, 1, 0.01], [-0.3, 1, 0.05]]],
    ['oceanBand', depthBand, [[-1, 25, 0.25]]], ['oceanShoreFoam', shoreFoam, [[-3, 22, 1], [0, 1, 0.125]]],
    ['oceanCrestFoam', crestFoam, [[0, 2, 0.01]]], ['oceanSwell', swellScale, [[-1, 25, 0.25]]],
    ['oceanDepthFromByte', depthFromByte, [[0, 255, 0.25]]],
    ['oceanTexelDepth', texelDepth, [[-0.0001 / 255, 255.0001 / 255, 0.1 / 255]]],
    ['oceanAlpha', alphaAt, [[0.8, 0.95, 0.05], [0, 120, 1]]],
    ['oceanFoamAmount', foamAmount, [[0, 1, 1], [0, 1, 1], [0, 120, 1]]],
    ['oceanGlintAmount', glintAmount, [[0.9, 1, 0.01], [-0.1, 1, 0.1], [0, 120, 5], [0, 1, 1]]],
    ['oceanFresnelAmount', fresnelAmount, [[0, 1, 0.05], [0, 1, 1]]],
  ];
  let compared = 0;
  for (const [name, twin, axes] of pairs) { /* walk the grid of `axes`, expect(glslFn(fns, name)(...a)).toBeCloseTo(twin(...a), 4); compared++ */ }
  expect(compared).toBeGreaterThan(2000); // denominator: a generator that emits nothing cannot pass
});
```

  Implementation note for the last test: walk the cartesian product of the axes, as written in the comment. Its
  printed line names what it does NOT check: the GLSL is never compiled here. A browser compiles it (Task 3, Step 4).

- [ ] **Step 2:** `cd frontend && npx vitest run tests/gates/ocean-look-gates.test.js`. Expected: FAIL, because
  `oceanLook.js` does not exist.
- [ ] **Step 3: Implement** `oceanLook.js` and `_glslScalar.js` to the Interfaces above. Twins as written there. The
  shore foam is `d >= 0 && d < SHORE_FOAM_ROWS + (lap >= LAP_ON ? 1 : 0)`. `lapAt` is
  `0.5 + 0.5 * Math.sin(t * LAP_W + cx * LAP_K[0] + cz * LAP_K[1])`. The swell is
  `SWELL_CALM + (1 - SWELL_CALM) * smoothstep(SWELL_DEPTHS[0], SWELL_DEPTHS[1], d)`. Header comment: what each term
  is for, and that colours are linear because the terms run before `<tonemapping_fragment>`.
- [ ] **Step 4:** Re-run. Expected: PASS, with the `compared` count printed.
- [ ] **Step 5: Mutation-prove.** Use `sh scripts/dev/mutate.sh src/render/oceanLook.js tests/gates/ocean-look-gates.test.js <n> <label> <old> <new>`.
  Each must print RED: **L1** Fresnel base `1 - c` → `c`; **L2** the fade un-inverted
  (`1 - smoothstep(...)` → `smoothstep(...)`); **L3** `FADE_FAR = 105` (the roadmap's figure, which overlaps the
  edge fade; this is why 95 is used); **L4** `EDGE_FAR = 112`; **L5** the shore foam's `d >= 0` dropped; **L6** the
  glint's sun factor dropped; **L7** the generator only writes `FRESNEL_POWER` as 3 (the JS twin keeps 5); **L8**
  `SWELL_CALM = 1`; **L9** the band ladder's two hexes swapped; **L10** `EDGE_FAR = 109` (inside the plane, outside
  the displaced border); **L11** `FRESNEL_MAX = 0.55` (the pre-review value); **L12** the generator's
  `oceanTexelDepth` without the `+ 0.5` rounding (the twin keeps it); **L13** the generator's `oceanFoamAmount`
  without `* oceanFade(dist)`; **L14** the generator's `oceanAlpha` without `* oceanEdge(dist)`; **L15** the
  generator's `oceanGlintAmount` without the fade (each twin unchanged, so only the GLSL-vs-twin grid can see L12-L15).
  **L0**, a comment edit, must SURVIVE. Record the verdicts in the gate's header comment.
- [ ] **Step 6: Commit** the three files with
  `feat(ocean): oceanLook — shading terms as JS twins and generated GLSL` and a `Mutation-Proof:` trailer listing
  L0-L15 with their verdicts.

### Task 2: `oceanDepthBake.js` — per-column depth, toroidal, incremental, budgeted

**Files:**
- Create: `frontend/src/world/oceanDepthBake.js`
- Test: `frontend/tests/gates/ocean-depth-bake-gates.test.js`

**Interfaces:**
- Consumes: `SEA_LEVEL` (`oceanProfile.js:8`); `OCEAN_PLANE` (Task 1).
- Produces: `OCEAN_BAKE_SIZE = 256`; `BYTE_DRY = 0`; `BYTE_UNKNOWN = 255`;
  `depthByte(surfaceY, seaLevel = SEA_LEVEL)` = `min(254, max(0, seaLevel - surfaceY))`, so the decoded depth is
  `27 - surfaceY` (see "Current code"); `bakeIndex(wx, wz, size = OCEAN_BAKE_SIZE)` returns
  `mod(wx) + mod(wz) * size`, with `mod(a) = ((a % size) + size) % size`;
  `createDepthBake(sampleSurfaceY, { size } = {})` returns
  `{ data: Uint8Array, size, retarget(cx: int, cz: int): void, step(budget: number): number, pending(): number, version: number, calls: number }`.
  - The window is the columns `[cx - size/2, cx + size/2)` on each axis. The first `retarget`, or a move of
    `size / 2` or more on either axis, marks the whole window `BYTE_UNKNOWN` and queues it. A smaller move marks
    UNKNOWN only the columns that entered and queues those. An unmoved `retarget` does nothing.
  - `step(budget)` samples at most `budget` queued columns, nearest to `(cx, cz)` first (Chebyshev ring order),
    writes `depthByte`, increments `version` if it wrote any, and returns the count. `calls` counts sampler calls.
    `step(Infinity)` drains the queue.

- [ ] **Step 1: Write the failing tests.** All drive a synthetic `sampleSurfaceY`; none touch `climate.js`.

```js
const flat = (y) => () => y;                       // a seabed at one height
const coast = (x) => (x < 0 ? 20 : 40);            // a step coast: wet west of x = 0, dry from x = 0
it('encoding: seabed 17 -> depth 10; surfaceY 27 -> depth 0; 28 (top face at 29, above the plane) -> dry', () => {
  expect(depthFromByte(depthByte(17))).toBe(10);
  expect(depthFromByte(depthByte(27))).toBe(0);
  expect(depthByte(28)).toBe(BYTE_DRY); expect(depthByte(80)).toBe(BYTE_DRY);
  expect(depthByte(-500)).toBe(254);
});
it('bakeIndex wraps negative columns: -1 -> size-1, -size -> 0, and is a bijection over one window', () => {
  expect(bakeIndex(-1, 0, 256)).toBe(255); expect(bakeIndex(-256, 0, 256)).toBe(0); expect(bakeIndex(0, -1, 256)).toBe(255 * 256);
  const seen = new Set(); for (let z = -140; z < 116; z++) for (let x = -140; x < 116; x++) seen.add(bakeIndex(x, z, 256));
  expect(seen.size).toBe(256 * 256);
});
it('a full bake of a flat seabed writes every texel, and the window covers the plane with margin', () => {
  const b = createDepthBake(flat(17), { size: 64 }); b.retarget(-100, 7);
  expect(b.pending()).toBe(64 * 64); expect(b.step(Infinity)).toBe(64 * 64); expect(b.calls).toBe(64 * 64);
  expect(new Set(b.data)).toEqual(new Set([depthByte(17)]));
  expect(OCEAN_BAKE_SIZE / 2).toBeGreaterThanOrEqual(OCEAN_PLANE / 2 + 2); // +1 bilinear, +1 rounding
});
it('the step coast lands on the right columns at negative x (no half-texel or sign slip)', () => {
  const b = createDepthBake((x) => coast(x), { size: 64 }); b.retarget(0, 0); b.step(Infinity);
  expect(b.data[bakeIndex(-1, 5, 64)]).toBe(depthByte(20)); expect(b.data[bakeIndex(0, 5, 64)]).toBe(BYTE_DRY);
  expect(b.data[bakeIndex(-32, 5, 64)]).toBe(depthByte(20)); expect(b.data[bakeIndex(31, 5, 64)]).toBe(BYTE_DRY);
});
it('moving one column samples exactly one line, standing still samples nothing', () => {
  const b = createDepthBake(flat(17), { size: 64 }); b.retarget(0, 0); b.step(Infinity);
  const c0 = b.calls; b.retarget(0, 0); b.step(Infinity); expect(b.calls - c0).toBe(0);
  b.retarget(1, 0); expect(b.pending()).toBe(64); b.step(Infinity); expect(b.calls - c0).toBe(64);
  b.retarget(2, 1); expect(b.pending()).toBe(64 + 64 - 1); // a diagonal step: one column and one row, sharing a corner
});
it('entering columns read UNKNOWN until baked; the toroidal alias never shows stale data', () => {
  const b = createDepthBake((x) => coast(x), { size: 64 }); b.retarget(0, 0); b.step(Infinity);
  expect(b.data[bakeIndex(-29, 0, 64)]).toBe(depthByte(20));   // texel 35 holds wet column -29 ...
  b.retarget(8, 0);                         // ... a strip move (8 < 32): columns 32..39 enter, aliasing -32..-25
  expect(b.pending()).toBe(8 * 64);
  expect(b.data[bakeIndex(35, 0, 64)]).toBe(BYTE_UNKNOWN);      // not the stale wet byte
  b.step(Infinity); expect(b.data[bakeIndex(35, 0, 64)]).toBe(BYTE_DRY);
});
it('the budget is honoured and the nearest columns come first', () => {
  const b = createDepthBake(flat(17), { size: 64 }); b.retarget(10, -10);
  expect(b.step(9)).toBe(9); expect(b.pending()).toBe(64 * 64 - 9);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) expect(b.data[bakeIndex(10 + dx, -10 + dz, 64)]).toBe(depthByte(17));
  expect(b.version).toBe(1); b.step(0); expect(b.version).toBe(1);
});
```

- [ ] **Step 2:** `npx vitest run tests/gates/ocean-depth-bake-gates.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** to the Interfaces. A full-window queue is built ring by ring from the centre. Strips are
  queued in the same nearest-first order. Header comment: the depth convention (`27 - surfaceY`) with its two
  citations, and why the window is toroidal (one line per metre moved, measured 0.64-0.77 µs per sample).
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Mutation-prove** (each RED): **B1** `depthByte` off by one (`seaLevel - surfaceY - 1`); **B2**
  `bakeIndex` without `+ size`; **B3** any move re-queues the whole window; **B4** entering columns are not marked
  UNKNOWN; **B5** `step` ignores `budget`; **B6** far-first order. **B0** identity SURVIVES.
- [ ] **Step 6: Commit**: `feat(ocean): oceanDepthBake — per-column water depth, toroidal and incremental`, with a
  `Mutation-Proof:` trailer.

### Task 3: Ocean shading before fog — sky Fresnel, sun glint, distance fade, edge fade, lit foam

No depth texture yet: every fragment decodes `UNKNOWN_DEPTH` (deep band, no shore foam, full swell). A reviewer can
accept this unit on its own: it removes the after-fog splice, the unlit foam and the square edge. Accepting it is a
review of the unit, not a merge. Until Task 6 the sea is one darker band with no shoreline foam, and a ring shows
where it meets the far field's `#10BCC6`. So the branch merges to main only as a whole, after Task 9 (Execution).

**Files:**
- Modify: `frontend/src/render/Ocean.jsx:24, :42-48, :51, :56-70, :73-110`
- Modify: `frontend/src/render/oceanLook.js` (adds the fragment patch)
- Test: `frontend/tests/gates/ocean-look-gates.test.js`

**Interfaces:**
- Consumes: `oceanLookGlsl`, `OCEAN_PLANE`, `BAND_LINEAR`, `FOAM_LINEAR` (Task 1); `aerialGlsl`
  (`render/aerialPerspective.js`); `skyFrameRef` (`render/mood.js`, from the light lane), or the coast-first
  fallback (seam row 2).
- Produces: `patchOceanFragment(fragmentShader: string) → string` in `oceanLook.js`. It is pure, so a node test can
  run it on three's real `ShaderLib.standard.fragmentShader` (r172, the chunk order cited above). `Ocean.jsx`'s
  `onBeforeCompile` calls it. The VERTEX patch stays inline in `Ocean.jsx`, because existing gates pin its strings
  there.

- [ ] **Step 1: Write the failing tests.** Append them to `ocean-look-gates.test.js`. They import
  `{ ShaderLib } from 'three'`, an import rather than a file read, so the source-grep ratchet is untouched. Let
  `src = ShaderLib.standard.fragmentShader` and `out = patchOceanFragment(src)`. `at(s)` is
  `out.indexOf(s, out.indexOf('void main'))`, and it must be `>= 0`. The search starts at `void main` because the
  prepended declarations contain `oceanFresnelAmount(` and `oceanGlintAmount(` ahead of every include, so a
  first-occurrence search would find the declaration and be RED on a correct implementation. `body` is
  `out.slice(out.indexOf('void main'))`.
  - `it('the sky Fresnel, the glint and the aerial haze sit after <opaque_fragment> and before <fog_fragment>; nothing ocean follows <dithering_fragment>')`:
    `at('#include <opaque_fragment>') < at('oceanFresnelAmount(') < at('#include <fog_fragment>')`, the same for
    `oceanGlintAmount(` and `skyHorizon, aerial`, and `out.slice(at('#include <dithering_fragment>'))` contains no `ocean`.
  - `it('band colour and foam are written to diffuseColor between <color_fragment> and <lights_fragment_begin>, so the light rig lights them')`:
    the `diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor` line lies between those two includes.
  - `it('every term that must vanish is applied through its composition, once')`: in `body`, each of
    `diffuseColor.a = oceanAlpha(`, `= oceanFoamAmount(`, `oceanFresnelAmount(` and `* oceanGlintAmount(` occurs
    exactly once, and the bare terms `oceanFade(`, `oceanEdge(`, `oceanFresnel(` and `oceanGlint(` do not occur in
    `body` at all: the body reaches them only through the compositions. With the Task 1 property tests and the
    GLSL-vs-twin grid, deleting the edge, the fade or a Fresnel or glint weight is RED in
    node. What node cannot see (a flipped `reflect`, a wrong view-space sun) is left to Task 4's rendered poses.
  - `it('every include of the input survives exactly once')`: the count of `#include <` in `out` equals the count in
    `src`, and the count is greater than 30. A replace that eats an anchor fails here.
- [ ] **Step 2:** Run them. Expected: FAIL (`patchOceanFragment` is not exported).
- [ ] **Step 3: Implement.**
  - `PLANE` becomes `OCEAN_PLANE`, imported from `oceanLook.js`.
  - Material: roughness 0.22 → 0.55, because the PBR sheen is the "plastic" and the toon glint now carries the sun.
    Remove `emissive`: it lit the sea at night, and night light belongs to the light lane. Opacity 1 with
    `transparent: true`, since alpha now comes per band. `color` = `BAND_HEX[1]`.
  - Uniforms added: `skyHorizon` (the name `aerialGlsl()` reads), `uSunDir`, `uSunColor`, `uFoamColor`,
    `uBand0..2`. Each frame, before the visibility early-out, copy them from `skyFrameRef.current`: `skyHorizon`,
    `uSunDir.value.fromArray(sunDir)` (the frame's `sunDir` is a `number[3]`, not a `Vector3`), and `glowColor` →
    `uSunColor`. Do not multiply by `daylight`: `oceanGlint` already fades on the sun's height, and a second fade
    would dim the golden-hour glint. `glowColor` is `#000000` at the night key (light lane, 2026-10-27; a
    provisional key there), so the glint goes dark at night through both paths. The sun-height factor stays,
    because it is the one this lane gates (L6). The glint is not clamped below the bloom threshold (Review Focus 6).
  - **The seam, by landing order** (the table in "Seam with the light lane"). If the light lane is on `main`: add
    `mat.defines = { ...mat.defines, ...SUN_FOG_DEFINES }` inside the `useMemo` that constructs the material, and
    `attachSunFog(shader)` in `onBeforeCompile`, or keep both if the light lane already added them (row 4); set
    `GLINT_STRENGTH` to the bloom bar and add `oceanGlint` to `MEANT_GLOW_PEAKS` (row 5). If it is not: write the
    fallback of row 2 in place of the three frame reads, tag each site `SEAM light-3b`, and list each as file:line
    in the commit body.
  - Vertex, inline in `Ocean.jsx`. Prepend `oceanLookGlsl().fns` and keep `gerstnerWave(gWp, uTime, gDisp, gNrm)`
    verbatim. Add `varying vec3 vOceanWorld`, set to `(modelMatrix * vec4(transformed, 1.0)).xyz` after
    `begin_vertex`. Replace `vFoam` with `varying float vCrestFoam = oceanCrestFoam(gDisp.y)`, and delete the slope
    foam (`Ocean.jsx:96`).
  - `patchOceanFragment`, after `#include <color_fragment>`:
    - `float oDist = length(vOceanWorld.xz - uCenter);`
    - `float oDepth = 99.0;` (Task 4 replaces it)
    - `float oLap = 0.5 + 0.5 * sin(uTime * LAP_W + dot(floor(vOceanWorld.xz), LAP_K));`
    - the band colour into `diffuseColor.rgb`, chosen with `step`/`mix` on `oceanBand(oDepth)`
    - `diffuseColor.a = oceanAlpha(<band alpha>, oDist);`
    - `float oFoam = oceanFoamAmount(oceanShoreFoam(oDepth, oLap), vCrestFoam, oDist);`
    - `diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, oFoam);`, so the foam is lit from here on.
  - `patchOceanFragment`, after `#include <opaque_fragment>`, in this order:
    - the Fresnel on `normalize(mix(geometryNormal, upView, FRESNEL_FLATTEN))`, mixing toward `skyHorizon` with the
      weight `oceanFresnelAmount(cosV, oFoam)` (times `uFresnelDay` in the coast-first fallback only, seam row 2);
    - then add the glint,
      `uSunColor * oceanGlintAmount(dot(reflect(-V, geometryNormal), sunView), uSunDir.y, oDist, oFoam)`;
    - then `aerialGlsl()`.

    `upView` and `sunView` are `normalize((viewMatrix * vec4(dir, 0.0)).xyz)`. The declarations
    (`oceanLookGlsl().fns`, the uniforms, the two varyings) are prepended.
  - The `<dithering_fragment>` splice is deleted. Three's own chunks follow unchanged.
- [ ] **Step 4: Compile it in a browser.** The unit suite does not compile GLSL. Run
  `node scripts/visual/ocean-probe.mjs 2>&1 | tee /tmp/ocean-probe.log`. Expected: exit 0, and
  `grep -c -E "Shader Error|WebGLProgram|PAGEERROR" /tmp/ocean-probe.log` prints `0`. OPEN all four frames in
  `/tmp/crafty-ocean/`: no square corner in `topdown-coast`, foam dark-adapted (not glowing), the sea one deep band,
  and `surface-skim` NOT washed toward pale sky, the defect `Ocean.jsx:104` records at a 0.38 weight.
  Then `sh scripts/dev/kill-test-procs.sh`.
- [ ] **Step 5:** `npm run test:unit` and `npm run lint`. Expected: PASS. `ocean-gpu-waves-gates` and
  `ocean-depth-tint-gates` are unchanged and green.
- [ ] **Step 6: Mutation-prove** the patch tests (each RED): **P1** the after-opaque block re-anchored on
  `#include <dithering_fragment>` (the roadmap's "moving the splice back must turn it red"); **P2** the foam mix
  moved after `<opaque_fragment>`, which leaves it unlit; **P3** a replace that drops `#include <opaque_fragment>`
  from its own output; **P4** the alpha line written `diffuseColor.a = <band alpha>;` (the square corner back);
  **P5** the Fresnel weight replaced by `oceanFresnel(1.0)`; **P6** the glint line deleted. **P0** identity SURVIVES.
  (P1 is also caught by the dithering-tail clause, so it is not the only discriminator of re-anchoring.)
- [ ] **Step 7: Commit**: `feat(ocean): shading before fog — sky Fresnel, sun glint, distance and edge fades, lit foam`,
  with a `Mutation-Proof:` trailer for P0-P6.

### Task 4: Wire the bake — block-stepped bands, shore foam, the lap; the rendered seam gate

**Files:**
- Modify: `frontend/src/render/Ocean.jsx`, `frontend/src/world/oceanVisibility.js`
- Modify: `frontend/tests/gates/ocean-gpu-waves-gates.test.js` (the `needsUpdate` proxy, Step 4)
- Create: `frontend/tests/e2e/ocean-shore.spec.js`
- Test: `frontend/src/world/oceanVisibility.test.js`

**Interfaces — Consumes:** `createDepthBake`, `OCEAN_BAKE_SIZE` (Task 2); the twins and the generated GLSL
(Task 1). **Produces:** `createVisibilityCache(sampleSurfaceY, { radius = OCEAN_SAMPLE_RADIUS, cell = 1 } = {})`
returning `(x, z) => boolean`, memoised on the last `cell`-snapped cell (moved here from Task 6, because the wake
needs it); `OCEAN_WAKE_RADIUS = 150`; and, in dev and lookbook builds only, `window.__craftyOceanBake` (the bake,
plus `visible: () => mesh.visible`) and `window.__craftyOceanUniforms` (the uniforms object).

- [ ] **Step 1: Write the failing e2e** (`ocean-shore.spec.js`; boot through `tests/e2e/_boot.js` `bootDev` +
  `startPlayActive`). It throws an error tagged `SETUP:` when `window.__craftyOceanBake` or
  `window.__craftyOceanUniforms` is missing, or when a column precondition below fails, so a missing handle can never
  read as the feature failing (`mutate-e2e.sh:23-27` scores neither a SETUP error nor a timeout as a kill).
  - **Columns, chosen in node.** Import `surfaceBlockAt` from `src/world/climate.js`, `SEA_LEVEL`, and the Task 1-2
    twins (`depthByte`, `depthFromByte`, `depthBand`, `shoreFoam`, `lapAt`, `LAP_ON`). Scan `x` from -140 to -70
    on the lines `z ∈ {-12, -4, 4, 12}` (and `z` from -16 to 16 for band-0 controls). Each column's EXPECTED class
    comes from the twins at the page's frozen `uTime`, read from `__craftyOceanUniforms.uTime.value` after
    `enterCapture`: `foam` (depth 0-1, or depth 2 with the lap on), `band0` (depth 2 with the lap off), `band1`
    (depth 3-7), `band2` (depth 8 or more). Per line take one depth-1 column (`foam`), one depth 4-7 column
    (`band1`), three adjacent depth-12+ columns (`band2`, read as their minimum), and every pair of x-adjacent
    columns that straddles a class boundary. Across the lines take at least 2 `band0` controls. Denominator: 4 foam,
    4 band1, 4 band2, 2 or more band0 and 4 or more straddling pairs, else SETUP.
  - **The selection must be able to see the slips the mutants make.** In node, for E1's slip `(+1, +1)` and for a
    plain `(+1, 0)` and `(-1, 0)`, recompute every asserted column's class as read from its slipped neighbour. At
    least one must change for each slip, else SETUP: those columns cannot detect that slip.
  - **Pose 1, top-down at noon.**
    `window.__craftyTest.call('enterCapture', { timeOfDay: 0.5, camera: { position: [<mean shore x>, 70, 0], lookAt: [<same x>, 27, 0.01] } })`,
    then `setHudHidden(true)` and `useGameStore.setState({ captureStudio: true })`. The second suppresses the warm
    motes (`GameScene.jsx:150-153`); one mote on a sample square would fake a reading. Wait until
    `getGeneratedChunks().size` holds for 6 polls 300 ms apart (as `capture.mjs:276-288`) and
    `window.__craftyOceanBake.pending() === 0`, then flush 10 frames. Project each column centre
    `(x + 0.5, SEA_LEVEL, z + 0.5)` with `window.__threeCamera`, and read the MEDIAN linear RGB of a 5 x 5 px square
    (the `ore-glow.spec.js` method, median instead of mean). From it take linear luminance `Y` and chroma
    `C = (max - min) / max`.
  - **Assert at noon.** Each threshold is set between the measured value and the value of the mutant it must kill,
    and every reading is printed.
    - **Foam, by what only foam has.** `FOAM_HEX #F2FAFB` has chroma 0.036 and band 0 `#8FD3D8` has 0.338 (sRGB
      channels, run 2026-10-27). Every `foam` column's `C <= K_FOAM x` the lowest `band0` control's `C`, with
      `K_FOAM = 0.5` to start. A luminance ratio cannot do this. Band 0 alone is about 2.76x the deep band in linear
      luminance (run 2026-10-27), so a "shore at least 1.25 x deep" test passes with no foam at all.
    - **The presence control.** Every `band0` control's `C >= 2 x` the highest `foam` `C`: shallow water is not
      foam.
    - **Bands in order, on every line.** `Y(band0 control) > Y(band1) > Y(band2)` wherever the line has a control,
      and `Y(band1) > Y(band2)` on every line, each step at least the threshold set against E7.
    - **Every straddling column reads its own class.** Classify each one as the nearest, in `(Y, C)`, of its line's
      reference readings (its foam, band1 and band2 columns and the nearest band0 control); it must equal its
      expected class.
  - **Pose 2, the sky Fresnel at grazing (noon).** Camera at `(x_d, SEA_LEVEL + 3, 0)` over a deep column `x_d`,
    looking out to sea (-x). Read the 5 x 5 median at the projection of `P = (x_d - 40, SEA_LEVEL, 0)` (depth 12 or
    more, else SETUP; aerial haze there is `smoothstep(38, 165, 40)`, about 0), and the sky just above the horizon
    in the same frame. Let `w` be the distance of P's reading from the band-2 reading of pose 1, over the distance of
    the sky reading from it, in linear RGB. Assert `w >= W_MIN` (the Fresnel is there) and `w <= W_MAX` (no
    pale-ice wash).
  - **Pose 3, the sun glint (noon).** Read `uSunDir` from `__craftyOceanUniforms`; SETUP if its `y < 0.3`. Pick a deep
    point `P` and put the camera at `P + 30 * normalize(-sx, sy, -sz)`, the sun's mirror direction, looking at `P`.
    Read the 95th-percentile luminance of a 21 x 21 px window around P's projection. Control: the same camera
    rotated 90° in azimuth about `P`, at the same distance and height. Assert glint `>= G_MIN x` control.
  - **Night.** `timeOfDay: 0.75` (midnight), pose 1. Every `foam` column reads `<= 0.6 x` its noon `Y`: the foam is
    LIT, not glowing (Review Focus 4; the before frame at 0.75 shows the glow).
  - **Idle cost.** Read `__craftyOceanBake.calls`, wait 2 s with the camera still, and read it again. They must be
    equal.
  - Write the screenshots to `test.info().outputPath('ocean-shore-{noon,grazing,glint,night}.png')`. The failure
    message prints every reading with its column, its expected class and the preconditions (pending, chunk count,
    `uTime`, sun direction).
- [ ] **Step 2: Wire the bake, NOT yet bound to the shader**, so that the red run reaches the assertions.
  - `createVisibilityCache` in `oceanVisibility.js`, with its test:
    `it('createVisibilityCache samples up to 9 columns per new cell and none while the cell is unchanged')`. Use a
    counting sampler that is never wet: two calls at `(5, 5)` → 9 calls, then `(6, 5)` → 18; with `cell: 16`,
    `(5, 5)` then `(15, 5)` → 9, then `(16, 5)` → 18.
  - `const bake = useMemo(() => createDepthBake(sampleSurfaceY), [])`. Two caches: `near =
    createVisibilityCache(sampleSurfaceY)` (90 m, per column) and `wakeFar = createVisibilityCache(sampleSurfaceY,
    { radius: OCEAN_WAKE_RADIUS, cell: 16 })`.
  - Each frame, BEFORE the visibility early-out: `awake = isCaptureMode() || near(cx, cz) || wakeFar(cx, cz)`.
    While not awake the bake does nothing: no retarget, no step, no sample. Awake: `bake.retarget(cx, cz)`, then
    step in slices of 128 columns until `BAKE_BUDGET = 1024` columns or `BAKE_SLICE_MS = 0.5` of `performance.now()`
    is spent, whichever comes first; under `isCaptureMode()`, `step(Infinity)`. The time slice, not the count, is
    what bounds a slower device such as the iPad, whose JS cost is unmeasured. Asleep, the bake keeps its last
    centre; on waking, `retarget` queues what entered since then, or the whole window after a move of 128 m or more.
    `awake` covers `near`, so the bake always runs while the plane shows. The 60 m between the wake radius and the
    plane's 90 m is about 4 s at 14 m/s, and a full re-bake is about 64 frames.
  - Expose the two handles (Interfaces) in dev and lookbook builds only, the same gate as `lookbookSeam.js`.
  - `oDepth` stays `99.0`.
- [ ] **Step 3: Run it red.** `npx playwright test tests/e2e/ocean-shore.spec.js`. Expected: FAIL on the foam-chroma
  or class assertions, with every reading printed, because after Task 3 every fragment is the deep band with no
  shore foam. A `SETUP:` failure or a timeout is NOT this step's red: fix the setup and re-run. If it PASSES, it
  discriminates nothing: stop and tighten it before going on. Open the screenshots either way.
- [ ] **Step 4: Bind the bake.**
  - A `DataTexture(bake.data, 256, 256, RedFormat, UnsignedByteType)` named `depthTex`, with `RepeatWrapping` on
    both axes, `LinearFilter` for min and mag, and `generateMipmaps = false`. Dispose it with the geometry and
    material. `depthTex.needsUpdate = true` when `bake.version` changed.
  - Fragment: `oDepth = oceanTexelDepth(texelFetch(uDepthTex, ivec2(mod(floor(vOceanWorld.xz), 256.0)), 0).r)`.
    This is `texelFetch`, not `texture`, so the band is exact per column (the voxel step) whatever the filter is,
    and `oceanTexelDepth` rounds the UNORM value to its byte (Task 1), so a GPU whose byte times 255.0 lands a hair
    under the integer cannot shift a band or drop the swash row's foam.
    `oLap = 0.5 + 0.5 * sin(uTime * LAP_W + dot(floor(vOceanWorld.xz), LAP_K))`.
  - `patchOceanFragment` gains one assertion in its Task 3 tests: the depth read is
    `oceanTexelDepth(texelFetch(uDepthTex`, not `texture(`.
  - **An existing gate's proxy breaks here, and it is rewritten, not exempted.**
    `ocean-gpu-waves-gates.test.js:80` asserts that no `needsUpdate = true` appears in `Ocean.jsx`, standing in for
    "no per-frame GEOMETRY re-upload". The texture upload would turn it red. Re-anchor it on the one carrier the
    invariant allows: in `Ocean.jsx`'s code (comments stripped, `_srcWalk.js` `sourceTexts`), the count of
    `/\.needsUpdate\s*=\s*true/g` is exactly 1, and that one is `depthTex.needsUpdate = true`. Two attribute-name
    regexes would miss this repo's own alias idiom (`const position = geo.getAttribute('position')`, then
    `position.needsUpdate = true`: `FarField.jsx:138`, `:143`). Prove it RED by re-introducing
    `geo.attributes.position.needsUpdate = true`, and separately by the alias form; then GREEN with the texture
    upload. Its own `Mutation-Proof:` line goes in this commit's trailer.
- [ ] **Step 5:** Re-run the e2e. Expected: PASS. OPEN all four screenshots: a stepped foam rim on the shore, three
  bands outward, a sky sheen at grazing that is not pale ice, a glint at the mirror pose, and the night foam not
  glowing.
- [ ] **Step 6: Mutation-prove** with `sh scripts/dev/mutate-e2e.sh`, each RED against the assertions above (E1 and
  E3 re-proved against the chroma and class assertions, which the original luminance-ratio assertions could not
  kill):
  - **E1** the texel index becomes `floor(vOceanWorld.xz) + 1.0`, one column off;
  - **E2** `mod(..., 256.0)` dropped, so `ivec2` takes a negative float at x ≈ -100;
  - **E3** `SHORE_FOAM_ROWS = 0`;
  - **E5** the foam mix moved after `<opaque_fragment>` (unlit);
  - **E6** `retarget` called with a per-frame jitter (`cx + (frame & 1)`), so the idle cost is not 0;
  - **E7** `uBand0` and `uBand2` swapped; **E8** the band chosen from `oceanBand(oLap)` instead of `oceanBand(oDepth)`;
  - **E9** the Fresnel weight replaced by `0.0` (pose 2, `W_MIN`); **E10** `FRESNEL_MAX = 0.55` (pose 2, `W_MAX`);
  - **E11** the glint line deleted, and **E12** `reflect(V, geometryNormal)` in place of `reflect(-V, ...)` (pose 3).

  **E4**, the identity mutant, must SURVIVE. A mutant that reports COULD NOT CHECK is not a kill: re-run it.
- [ ] **Step 7:** `npm run test:unit`; e2e is certified by CI's `ci ok` on the exact sha (push to a `land/` branch), since W2-C deleted e2e-freshness. Commit:
  `feat(ocean): the seabed depth bake drives block-stepped bands and a shore foam line`, with a `Mutation-Proof:`
  trailer for the spec and the re-anchored gate.

### Task 5: Calm shallows — wave height by depth, horizontal displacement never scaled

**Files:** Modify `frontend/src/render/Ocean.jsx` (the `beginnormal_vertex` splice) and
`frontend/src/render/oceanLook.js` (the generator and the twin); move `runGlsl` from
`frontend/tests/gates/ocean-gpu-waves-gates.test.js` into `frontend/tests/gates/_glslScalar.js` and import it there
(a helper move, no assertion changed). Test: `frontend/tests/gates/ocean-look-gates.test.js`.

**Interfaces — Produces:**
- `oceanSwellGlsl()` returns one GLSL string declaring
  `void oceanSwellApply(float s, inout vec3 disp, inout vec3 nrm)`: the height `disp.y * s`, the tilt `nrm.x * s`
  and `nrm.z * s` renormalised with `inversesqrt`, and `disp.x` / `disp.z` left whole. This is the composition that
  RUNS. The vertex splice calls `gerstnerWave(gWp, uTime, gDisp, gNrm);` (verbatim, pinned) and then
  `oceanSwellApply(gSwell, gDisp, gNrm);`, and the `begin_vertex` line
  `vec3 transformed = vec3(position.x + gDisp.x, position.y - gDisp.z, gDisp.y);` (`Ocean.jsx:92`) stays verbatim.
  So the scaling lives only in generated text that the gate interprets.
- `oceanDisplace(x, z, t, depthM)` returns `{ x, y, z }`: the JS twin, `gerstnerDisplace` with the height above
  `SEA_LEVEL` multiplied by `swellScale(depthM)` and the horizontal shift left whole. It is the function a future
  physics reader calls; no gate below rests on it alone.

- [ ] **Step 1: Write the failing tests.** Both drive the GENERATED text, not the twin. `runGlsl` (extended to
  `inout` parameters and to the `_glslScalar` prelude) interprets `gerstnerGlsl()` at `(x, z, t)`, then
  `oceanSwellApply` with `s = glslFn(fns, 'oceanSwell')(glslFn(fns, 'oceanDepthFromByte')(byte))`, where `byte` is
  the JS bilinear sample of a cliff bake at the same `uv = p / size` the vertex shader uses.
  - `it('no fold at a vertical cliff (depth 0 -> 21 in one column)')`. Over `t` from 0 to 40 in steps of 0.23,
    `z ∈ {0, 3.3, 7.1, 12.9, 21.4}` and `x` from -12 to 14 in steps of 0.05, the interpreted displaced x is
    strictly increasing. Assert the sample count and `min dx'/dx > 0.4`; the measured value for the unscaled shift
    is 0.553.
  - `it('calm at the shore: |height| <= SWELL_CALM x 1.96 where depth <= 1, full swell where depth >= 6')`, over the
    same grid.
  - `it('the twin agrees with the generated composition')`: `oceanDisplace` equals the interpreted result on the
    same grid, to 4 places.
  - `it('Ocean.jsx scales nothing inline')`, from `Ocean.jsx`'s code (comments stripped, `_srcWalk.js`
    `sourceTexts`): the `begin_vertex` line above occurs verbatim, and `gSwell` occurs exactly twice (its
    declaration and the `oceanSwellApply(gSwell, gDisp, gNrm)` call).
- [ ] **Step 2:** Run them. Expected: FAIL (`oceanSwellGlsl` and `oceanDisplace` missing).
- [ ] **Step 3: Implement** the generator and the twin. In the vertex splice, after the `gerstnerWave` call and
  before `vec3 objectNormal` (three includes `beginnormal_vertex` before `begin_vertex`):
  `float gSwell = oceanSwell(oceanDepthFromByte(textureLod(uDepthTex, gWp / 256.0, 0.0).r * 255.0));` then
  `oceanSwellApply(gSwell, gDisp, gNrm);`. This decode is the continuous one: the bilinear value between two bytes
  is meant to land between them, so it does not round (Task 1). Scaling the tilt matches scaling only the height
  when the gradient of `s` is ignored, and Review Focus covers that lighting approximation. `vCrestFoam` reads the
  scaled height.
- [ ] **Step 4:** Re-run. Expected: PASS. Re-run Task 3 Step 4's browser compile and open the frames. Calm water
  near the beach; the swell offshore.
- [ ] **Step 5: Mutation-prove** (RED): **S1** the GENERATOR scales `disp.x` by `s` (the fold case must go red; the
  sim this session measured min -4.92); **S2** `SWELL_DEPTHS = [0, 0.5]`; **S3** an inline
  `position.x + gDisp.x * gSwell` written into `Ocean.jsx`'s `begin_vertex` line; **S4** the twin alone scales the
  shift (the agreement test goes red). **S0** identity SURVIVES. Commit with the trailer: `feat(ocean): calm
  shallows — wave height scales with depth, horizontal shift does not (no fold)`.

### Task 6: The far ring agrees — band colour and sky Fresnel on far water; idle visibility costs nothing

**Files:**
- Modify `frontend/src/world/farField.js:46-47, :101-102`, `frontend/src/world/FarField.jsx:56-83, :112-119`
  (rebased on the light lane's FarField change when it is on `main`: seam row 3), `frontend/src/render/Ocean.jsx:63`
- Create `frontend/tests/e2e/ocean-edge.spec.js`
- Test: `frontend/tests/gates/far-field-gates.test.js:117-120`

- [ ] **Step 1: Write the failing tests.**
  - far-field:
    `it('far water takes the band of its own depth: a shallow and a deep column differ, and each equals BAND_LINEAR[depthBand(27 - surfaceY)]')`,
    with `surfaceY` 25 (depth 2, shallow) and 10 (depth 17, deep). This replaces the `FAR_WATER_LINEAR` equality at
    `:120`, and `FAR_WATER_LINEAR` leaves the import at `:3`.
  - far-field: `it('surfaceY 28 is land in the far field, as in the bake: its top sits at 29, above the plane')`.
    `farColumn` of a `surfaceY: 28` sample returns `y = 29` and its surface block's colour, not water.
    `climate.isWater` counts `surfaceY <= 28` (`climate.js:22`), but the bake calls 28 dry (`depthByte(28) ===
    BYTE_DRY`, Task 2), so a far coastline drawn from `isWater` would sit one column landward of the near one
    (water drawn where the near terrain shows sand).
  - far-water mask, in `ocean-look-gates`: `oceanLook.js` gains the twin `farWaterMask(y)` and the generated
    `float oceanFarWater(float y)` (`1 - step(SEA_LEVEL - 1, y)`). Assert that it is 1 at the far-water height
    `SEA_LEVEL - FAR_WATER_SINK` and 0 at the lowest dry top `SEA_LEVEL + 1`. Add it to the GLSL-vs-twin grid.
  - visibility: the cache and its test already exist (Task 4).
  - `ocean-edge.spec.js`, the roadmap's metric ("no luminance step across the 110 m plane boundary"). Boot, capture
    and settle as Task 4's spec, with its `SETUP:` rule. In node, find an open-sea centre whose every column within
    130 m is depth 8 or more (SETUP if none in the scanned box).
    - **Pose A, top-down.** Camera above that centre at a height that puts the 110 m boundary in frame, computed
      from `__threeCamera.fov` (SETUP if the boundary is out of frame). Read 5 x 5 medians at the mid-radius of the
      annuli 90-96, 96-108 and 108-120 m on 8 bearings, at noon and at 0.48. Assert that the median over bearings of
      each step between adjacent annuli is below `STEP_MAX`.
    - **Pose B, low.** Camera 20 m above sea level at the same centre, looking out to sea on 5 bearings; the screen
      rows that the 90-96, 96-108 and 108-120 m distances project to are about 12 px apart there. Same assertion.
      This pose sees the far Fresnel, which the top-down pose cannot (its view is near normal, so the Fresnel is
      about `FRESNEL_MAX x FRESNEL_F0`).
- [ ] **Step 2:** Run them. Expected: FAIL. The spec fails at the ring today: the plane's deep band against the far
  field's `#10BCC6`.
- [ ] **Step 3: Implement.**
  - `farColumn`: a column is water when `s.surfaceY < SEA_LEVEL` (the bake's convention), not `s.isWater`. A water
    column's colour is `BAND_LINEAR[depthBand(SEA_LEVEL - 1 - s.surfaceY)]`. Delete `FAR_WATER_LINEAR`, or knip
    flags it.
  - `FarField.jsx`: the `<opaque_fragment>` replacement (`:81-83`) becomes `#include <opaque_fragment>`, then the far
    Fresnel, then `${AERIAL_GLSL}`. The far Fresnel is
    `gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHorizon, oceanFresnel(max(dot(normalize(vViewPosition), upView), 0.0)) * oceanFarWater(vWorldPos.y));`,
    with `oceanLookGlsl().fns` prepended. It uses the flat up normal, because far water has no waves. No foam and no
    glint: the plane has none past `FADE_FAR` either. It reads FarField's existing `skyHorizon` uniform, which the
    light lane's Task 3b feeds from `skyFrameRef`; this task adds no sky read of its own. If the light lane is not on
    `main`, the far Fresnel is also multiplied by `uFresnelDay` (the uniform, its declaration, the factor and its
    write in the uniform block), each tagged `SEAM light-3b` (seam row 3).
  - `Ocean.jsx:63` uses Task 4's `near` cache instead of calling `oceanVisibleNear` every frame.
- [ ] **Step 4:** Re-run. Expected: PASS. Browser compile check as Task 3 Step 4. `topdown-coast` shows no ring at
  the plane edge.
- [ ] **Step 5: Mutation-prove**, each RED: **F1** far water back to one colour (node, and `ocean-edge` pose A);
  **F2** the far-water mask inverted (`step(SEA_LEVEL - 1, y)`, which puts the Fresnel on land); **F3** `farColumn`
  back on `s.isWater`; **F4** the plane's alpha line without `oceanAlpha` (the square edge; `ocean-edge` pose A);
  **F5** the far Fresnel line deleted (`ocean-edge` pose B); **V1** the cache's memo removed (Task 4's visibility
  test). The identity mutant SURVIVES. Commit:
  `feat(ocean): the far ring takes the same bands and sky Fresnel; ocean visibility cached per cell`.

### Task 7: Cost — measured, stated, held

**Files:** none in `src/`. The figures go into this plan's Acceptance table.

- [ ] **Step 1:** `npm run build && node scripts/ci/bundle-budget.mjs`. Expected: PASS. The `index` delta against
  Task 0's figure must be at most +8,000 bytes. If over, move `oceanDepthBake.js` and the GLSL behind the existing
  `Ocean` boundary into a lazy chunk; never raise the ceiling in this lane.
- [ ] **Step 2:** `node scripts/visual/gpu-cost-probe.mjs --place coast --json /tmp/coast-after/gpu-cost.json`, with
  the same ocean-drawn check as Task 0 Step 3 (a linked program whose `cacheKey` contains `gerstnerWave(gWp`; else
  COULD NOT MEASURE). Expected structural deltas against Task 0: drawCalls +0, programs +0, textures +1. Any other
  delta is a finding. A delta read from an unposed run is not a finding either way: at spawn the ocean is hidden.
- [ ] **Step 3: GPU time, A/B.** The lookbook's `--hold` holds at SPAWN (`lookbook.mjs` header), and the nearest deep
  water is about 98 m from there (`oceanProfile.js:16-17`). So hold with `--hold-place coast`, the instruments
  commit named in Prerequisites (on `feat/instruments`, not on this branch: `lookbook.mjs` is not on main). Hold at
  `coast` (Chromium, ANGLE-Metal) and run 3 before and 3 after, alternating, frame cap Unlimited. Record median ms/frame and the load average beside
  each. The probe measures frame time, not GPU time, so a delta under the run-to-run spread is reported as "not
  resolved", never as 0. The budget is +0.15 ms at high (roadmap). Arithmetic estimate, unmeasured: about 1.8 M ocean
  fragments at 1280 x 800 @ dpr 2 x (1 R8 `texelFetch` + about 35 ALU, net of the deleted after-dither block), plus
  9,409 vertices x (1 `textureLod` + about 8 ALU), is about +0.02-0.05 ms on an M3 Max.
- [ ] **Step 4: iPad rail.** In the WebKit 1180 x 820 and 820 x 1180 lookbook runs, read the Diagnostics fps at
  `coast` before and after. Expected: no fall below the 60 fps cap where before held it. macOS WebKit on an M3 Max
  is not an iPad (the lookbook's stated blind spot). Kevin's iPad is the tier-0 sensor, and that ask stays open in
  the masterpiece plan.
- [ ] **Step 5: CPU while idle and while travelling.** In a dev session standing still on the coast for 10 s, read
  `__craftyOceanBake.calls` at both ends. Expected: equal, so 0 samples while idle (today: up to 9 per frame, early
  exit on the first wet sample). Then travel 10 s at `BASE_MOVE_SPEED` along the coast, straight and then
  diagonal, and 10 s deep inland, timing `step()` with `performance.now()`. Expected: about 256 samples per metre
  crossed per axis near the coast (14 x 256 = 3,584 samples/s straight, about 5,070 diagonal; about 2.5 and 3.6 ms
  per second of main-thread time at the node rate); 0 bake samples inland, where only the wake cache samples (up to
  9 per 16 m cell crossed). Record samples/s and ms/s, in Chromium and in macOS WebKit, in the Acceptance table. The
  iPad's cost stays unmeasured, and the table says so.
- [ ] **Step 6:** `sh scripts/dev/kill-test-procs.sh`. Commit the filled Acceptance table (this plan file only):
  `docs(plan): coast-water cost, measured`.

### Task 8: The capture oracle moves — its own Baseline-Review commit

**Files:** `frontend/tests/visual/baseline/*.png` only.

- [ ] **Step 1:** `npm run visual:capture`, then `npx vitest run tests/visual/diff.test.js`. Expected: RED on the
  frames that show water (`ocean-coast`, `ocean-depth`, and any explore/hearth frame with sea in view). Every other
  frame stays green. A red frame without water in it is a finding: stop.
- [ ] **Step 2:** OPEN every red frame next to its baseline. Each change must be one this plan intends: bands, foam
  line, edge, calm shallows, Fresnel.
- [ ] **Step 3:** Copy only those frames into `tests/visual/baseline/`. Commit them ALONE, with no `frontend/src/`
  change: `test(visual): re-baseline the water frames for the coast-water milestone`, with a `Baseline-Review:`
  trailer that names each frame and what changed in it. If the Chromium 147 → current re-baseline (masterpiece 0e)
  has not landed, it lands FIRST in its own commit, and this one rebases on it.

### Task 9: Acceptance — the real-GPU coast, side by side

- [ ] **Step 1:** `npm run build && node scripts/visual/lookbook.mjs --out /tmp/coast-after`. Expected: exit 0, and
  all 12 coast shots valid (`lookbook.json` verdicts) on ANGLE-Metal Chromium and both WebKit iPad viewports.
- [ ] **Step 2:** Save them as `evidence/coast-after/*.jpg`. Build one contact sheet with before and after per
  `(target, cycle)` side by side, and OPEN all 12 pairs. Accept only if every pair shows: no square corner or ring
  at the plane edge; a stepped foam line on the shore that is not glowing at 0.75; three bands, shallowest at the
  shore; calm water at the beach; whitecaps only offshore and gone by mid-distance; the bands still distinct at
  mid-distance from a low camera, not washed to pale sky; no milky bloom sheet on the glint path at 0.48 (Review
  Focus 6); on WebKit 820 x 1180 no chunk-aligned hue step in the shallows (Review Focus 7; if no frame looks
  along the shore, that item is recorded as unchecked, never as passed); and on WebKit 820 x 1180 the same read as
  on Chromium.
- [ ] **Step 3:** Record the verdict per pair in the table below. Any reject goes back to the task that owns it.
  This lane closes with zero open rejects, or with each one ledgered to a named owner.

## Acceptance table (filled by Tasks 0, 7 and 9)

| Measure | Before | After | Budget |
|---|---|---|---|
| `index` bytes | | | at most +8,000 |
| drawCalls / programs / textures (gpu-cost-probe) | | | +0 / +0 / +1 |
| median ms/frame, coast hold, Chromium ANGLE-Metal (3 runs each, load avg) | | | +0.15 ms, or "not resolved" |
| fps at coast, WebKit 1180 x 820 / 820 x 1180 | | | no fall below the 60 cap |
| `surfaceBlockAt` samples, 10 s idle | up to 9 per frame (early exit) | | 0 |
| bake samples/s and main-thread ms/s, travel at 14 m/s along the coast, straight / diagonal (Chromium; macOS WebKit) | up to 9 per frame | | at most 4 ms/s on the M3 Max; iPad unmeasured, stated |
| bake samples, 10 s travel deep inland | up to 9 per frame | | 0 (wake cache only) |
| ocean drawn during the gpu-cost window (`cacheKey` check) | | | yes, before and after |
| 12 coast pairs accepted | — | | 12 / 12 |

## Per-tier cost, stated

The same program runs at every tier. Every tier gets: one R8 texture of 256 x 256 (64 KiB GPU, 64 KiB CPU); per
ocean fragment, one `texelFetch` and about 35 ALU (the after-dither block of about 15 ALU is deleted, so the net is
about +20); per vertex, one `textureLod` (9,409 vertices). There is no new draw, pass or render target, and the
corners at alpha 0 cover area the plane already covered. CPU: 0 samples idle; 0 bake samples inland (asleep; the
wake cache samples up to 9 columns per 16 m cell crossed); near the coast about 0.18 ms per metre crossed per axis at
the node-measured rate, which at 14 m/s is about 3,584 samples and 2.5 ms per second straight, and about 5,070 and
3.6 ms diagonally. That is roughly 6.6 times today's worst case of 9 x 60 = 540 samples per second, and it is the
honest price of a per-column depth. Each frame's share is bounded by the 0.5 ms slice. A full re-bake after a
teleport is 65,536 samples at up to 1,024 per frame, about 64 frames, more on a device whose slice fills first.
During that re-bake, unbaked columns show the deep band (`#3E86A6`, darker than today's `#10BCC6`) and full swell;
the pop when they bake is accepted (Review Focus 1).

- **low (every iPad, dprCap 1.5):** about 1.0 M ocean fragments at the coast pose, 1180 x 820. The terms are
  arithmetic; the one memory read is a single byte per fragment from a 64 KiB texture that stays cache-resident.
  Held in reserve, not built: a `low` path that drops the glint and aerial (about 12 ALU), used only if Task 7
  Step 4 shows a regression. The loaded radius is 32 m here, so band 0 at alpha 0.8 shows the far field's flat
  water through it beyond that, instead of sand: a possible chunk-aligned hue step in the lagoon (Review Focus 7).
  The bake's JS cost on an iPad is unmeasured; the 0.5 ms time slice, not the column count, bounds it per frame.
- **med / high (dpr 2):** about 1.8 M ocean fragments at 1280 x 800. Estimate +0.02-0.05 ms on an M3 Max; the
  budget is +0.15 ms.
- **Heat (Kevin's M3 Max complaint), idle AND travel:** standing still, the sea adds no CPU and removes the up-to-9
  `surfaceBlockAt` calls the visibility check made every frame (at most about 6 µs per frame). Travelling inland
  it costs only the wake cache. Travelling along a coast it ADDS main-thread work, about 2.5-3.6 ms per second at
  14 m/s, which is more than today's visibility check; Task 7 Step 5 measures it against the 4 ms/s budget. Play is
  mostly travel, so the idle figure is never quoted alone. The GPU estimate above is arithmetic until Task 7
  measures it.
- **Bloom:** the glint is a bloom source by decision (Review Focus 6); it adds no bloom pass and no cost, since the
  bloom pass runs whatever crosses its threshold.

## Not in this plan (and why)

- **Underwater** (teal fog, screen tint, seabed caustic; roadmap move 7's second half). The Phase 1 bullet scopes
  this lane to the surface and the shallows. Underwater touches the fog the light lane owns and the `ocean-depth`
  capture pose. It is a follow-up unit with its own plan.
- **A storm swell** (`weatherGate` scaling the swell back up; roadmap threat). Recorded as a follow-up.
- **Physics following the waves.** Nothing reads the wave table for physics today (grep above). If swimming ever
  reads it, `oceanDisplace` (Task 5) is the function it must call.
- **Player edits.** The bake reads generated terrain (`climate.surfaceBlockAt` ignores edits and the Hearth stamp,
  `climate.js:15`). A hole dug at the shore keeps its generated band. Accepted: water does not flow into dug holes
  either.

## Execution

Subagent-driven, sequential: Tasks 1-2 can run in parallel, and 3-6 share `Ocean.jsx`. **The branch merges to main
only as a whole, after Task 9's acceptance** (Task 8's re-baseline commit included). Each task is reviewed as a
unit, but the intermediates are worse than today (after Task 3: one darker band, no shoreline foam, a ring at the
far field until Task 6), and main auto-deploys to Vercel on push. Per the Crafty method
(`.agent/AGENTS.md` "Models and effort for Crafty"), each code task gets a fresh headless `/code-review xhigh`. Tasks
3-5, the shader-and-upload seam the gates cannot see, also get one `adversarial-reviewer-kz` stage at
`effort: 'xhigh'` on `claude-opus-5-5` and one `repro-verifier-kz` stage that re-runs the mutants. Tasks 0, 7 and 9
are measurement, not code: Sonnet 5.5 can drive them, but a person-equivalent eye opens every frame.

## Review amendments (2026-10-27)

Source: the adversarial review of this plan (verdict "REFUTED IN PART"), 18 findings. Each was re-checked against
the code before it changed the plan, because a review verdict is a hypothesis. **Applied: 18. Rejected: 0.** Two are
applied with a narrowed claim (4 and 9). The checks read the working tree on 2026-10-27 (HEAD `c03e9f2f`) and ran
node arithmetic only. Nothing was built, rendered or mutated, so every rendered threshold above (`K_FOAM`, `W_MIN`,
`W_MAX`, `G_MIN`, `STEP_MAX`) is set by the implementer between a measured value and its mutant's value.

1. **[HIGH] The e2e could not tell foam from the shallow band. Applied.** Re-checked: in node, the linear luminance
   of `#8FD3D8` is 2.76 times that of `#3E86A6`, so "shore at least 1.25 x deep" passes with `SHORE_FOAM_ROWS = 0`.
   Chroma `(max - min) / max` is 0.036 for foam and 0.338 for band 0. Task 4 Step 1 now asserts:
   - foam by chroma, against band-0 controls;
   - a presence control;
   - band order on every line;
   - the class of every column that straddles a band boundary, with a node precondition that the chosen columns
     can see each slip.

   E1 and E3 are re-proved, and E7 and E8 are added. The reviewer's alternative, foam R against a band-1 column's R,
   is not adopted: band 0's R (143) is also about 9x band 1's (16), so that test would pass without foam too.
2. **[MED] The fold guard tested a twin that no runtime code calls. Applied.** Re-checked: Task 5 spliced the height
   scale inline, and S1 mutated only `oceanDisplace`. The roadmap's `lived_proof` asks for the interpreted gate to
   be extended to the amplitude-by-depth term. Task 5 now generates `oceanSwellApply`, and the fold and calm tests
   interpret that text through `runGlsl`, which moves into `_glslScalar.js`. The `begin_vertex` line stays verbatim,
   and a structural check pins `gSwell` to two occurrences. S1 mutates the generator; S3 mutates the inline line.
3. **[MED] Fresnel, glint, edge alpha and the distance fade could be deleted with every gate green. Applied.**
   Re-checked: Task 3 asserted positions only. At the e2e's top-down pose, `fresnel(1)` is 0.011, and
   `dot(reflect, sun)` is about the sun's elevation sine, 0.54, below the lobe's 0.965 (`mood.js:25`). A camera 42 m
   above the water at fov 75 (`GameScene.jsx:239`) spans about ±51 m, so the 96 m edge is out of frame. The fix:
   - Task 1 adds composition functions with property tests and GLSL-vs-twin coverage (L13-L15).
   - Task 3 asserts that the body reaches the terms only through those functions (P4-P6).
   - Task 4 adds a grazing Fresnel pose and a sun-mirror glint pose (E9-E12).
   - Task 6 adds the edge spec (F4, F5).
4. **[MED] Task 3's ordering test was red on a correct implementation. Applied, with one sub-claim narrowed.**
   Re-checked: the declarations are prepended (Task 3 Step 3), so the first `oceanFresnel(` comes before every
   include. `at(s)` now searches from `void main`. The sub-claim that the test could not tell P1 apart does not
   hold: the clause "nothing ocean follows `<dithering_fragment>`" already catches P1. This is noted at P1.
5. **[MED] Task 4's red run failed on a missing handle. Applied.** Re-checked: the spec waited on
   `window.__craftyOceanBake`, which was exposed only in the implementation step. `mutate-e2e.sh:23-27` scores a
   timeout as COULD NOT CHECK. Task 4 now wires and exposes the bake, unbound, before the red run, and the spec
   throws `SETUP:` when a handle is missing.
6. **[MED] The heat statement counted idle time only. Applied.** Re-checked: `BASE_MOVE_SPEED = 14`
   (`game/locomotion.js:3`). The bake stepped before the visibility early-out everywhere, inland included.
   `oceanVisibleNear` returns at the first wet sample (`oceanVisibility.js:39`). Task 4 adds:
   - a wake check, `near` (90 m) or `wakeFar` (150 m, per 16 m cell), so inland travel costs no bake samples;
   - a 0.5 ms time slice per frame, which bounds slower devices.

   The Heat bullet, Per-tier cost, Task 7 Step 5 and the Acceptance table now state travel next to idle: about 2.5
   ms/s straight and 3.6 ms/s diagonal at the node rate, against a 4 ms/s budget. "9 per frame" now reads "up to 9,
   early exit".
7. **[MED] `FRESNEL_MAX` 0.55 was above the weight the code's history rejected. Applied.** Re-checked:
   `Ocean.jsx:104` halved `0.38 x (1-c)^3` to 0.20 because it "washed the sea to pale ice". In node, the plan's 0.55
   Schlick gives 0.329 at cos 0.1, against the rejected curve's 0.277, and 0.474 against 0.347 at cos 0.03. It also
   mixes toward a paler target (`#CDEAF5`).
   - `FRESNEL_MAX` is now 0.30, held at or under 0.8 x the rejected curve over cos 0-0.3. It holds with 1.3%
     headroom at cos 0, and 0.55 fails.
   - Mutants L11 and E10 cover it, and Task 3 Step 4 opens the `surface-skim` frame.
   - The Fresnel is not faded with distance, so the plane and the far field (Task 6) keep one curve across the seam.
8. **[MED] The roadmap's plane-edge metric had been replaced by one pose judged by eye. Applied.** Re-checked: the
   roadmap's `lived_proof` reads "Luminance across the 110 m plane boundary shows no step above threshold". Far
   water is coloured per vertex on a 40 x 160 polar grid at roughness 1 (`farField.js:30-31`, `FarField.jsx:42`).
   Task 6 adds `ocean-edge.spec.js`: annuli at 90-96, 96-108 and 108-120 m, a top-down pose and a 20 m pose, at two
   times of day. Mutants F1, F4 and F5 cover it.
9. **[MED] The depth decode had no rounding rule. Applied, with the failure scenario narrowed.** Re-checked in node:
   under the reciprocal recipe, 126 of the 256 bytes come out off-integer, all ABOVE the integer and none below. So
   on both IEEE recipes the bands hold. The GPU's UNORM conversion is not measured, and GLSL ES 3.00 does not promise
   an exact integer, so the cheap rule is adopted:
   - the fragment decodes through `oceanTexelDepth` (`floor(x * 255.0 + 0.5)`);
   - the UNKNOWN threshold is a half-integer;
   - the vertex keeps the continuous decode for its bilinear read;
   - the grid tests bytes ±1e-4 (L12).
10. **[LOW] `FarField.jsx` is shared, and the coast-first fallback would mix the night sea toward orange. Applied.**
    Re-checked: the light plan modifies `FarField.jsx` (its file table and Tasks 3b and 6), but its seam section
    names only `Ocean.jsx`. Night maps to mood 1 (`mood.js:99-101`), whose `skyHorizon` is `#C25A3A`
    (`tokens.js:23`). Prerequisites now name `FarField.jsx` with an order (the light lane first), and the fallback
    gates the Fresnel with `uFresnelDay`. Owed outside this file: the light plan's seam section adds the
    `FarField.jsx` row and the removal of `uFresnelDay` (owner `plan-light-colour`).
11. **[LOW] On the low tier, band 0 at alpha 0.8 shows the far field beyond 32 m. Applied: stated and checked.**
    Re-checked: low has `renderDistance: 2` (`quality.js:20`), a chunk is 16 m (`chunkLayout.js:10`), and the far
    field discards only over loaded chunks (`FarField.jsx:11-13`). Review Focus 7, Per-tier cost and Task 9 Step 2
    now carry it, with the remedy (raise `BAND_ALPHA[0]` toward 0.9) if the WebKit portrait frame shows it.
12. **[LOW] The intermediate states look worse than today. Applied.** Re-checked: Task 3 decodes UNKNOWN everywhere
    and deletes the slope foam, and far water stays `#10BCC6` until Task 6. Execution and Task 3's preamble now say
    the branch merges only as a whole, after Task 9.
13. **[LOW] The re-anchored `needsUpdate` gate missed the alias idiom. Applied.** Re-checked: `FarField.jsx:138`
    aliases the attribute and `:143` sets `position.needsUpdate = true`. Task 4 now asserts exactly one
    `.needsUpdate = true` in Ocean.jsx's stripped code, on `depthTex`, with the alias form as a mutant.
14. **[LOW] `EDGE_FAR` ignored the horizontal displacement. Applied.** Re-checked: `oDist` is measured on displaced
    positions. The amplitudes sum to 1.96 at `STEEPNESS` 1.0, and `dx += STEEPNESS * w.amp * w.nx * c`
    (`oceanProfile.js:70`, `:75-82`, `:114`). The knob test now asserts
    `EDGE_FAR <= OCEAN_PLANE / 2 - STEEPNESS x ΣA`, which is 108.04. 108 passes, and L10 (109) goes red.
15. **[LOW] gpu-cost-probe measured at spawn, where the ocean is hidden. Applied.** Re-checked: the spawn is the
    origin column (`App.jsx:547`), and `oceanVisibleNear(0, 0, surfaceBlockAt…)` returned `false` (node,
    2026-10-27). The probe sets no pose (`gpu-cost-probe.mjs:94-120`). Task 0 Step 3 and Task 7 Step 2 now pose at
    `coast` and require a linked program whose `cacheKey` contains `gerstnerWave(gWp`; three keys each program by
    `onBeforeCompile.toString()` (`Material.js:109-111`).
16. **[LOW] "Unbaked columns ... close to today's look" was false. Applied.** Re-checked: today's ocean is `#10BCC6`
    (`Ocean.jsx:43`), and the deep band is `#3E86A6` (`tokens.js:17`). The sentence is corrected, and the pop is
    recorded as accepted (Review Focus 1, Per-tier cost). The deep decode is kept: Review Focus 1's rule is "never
    dry land and never foam", and band 1 would not serve it better.
17. **[LOW] The glint is a bloom source that no audit lists. Applied: a decision.** Re-checked: the glint is 0.9 x
    `glowColor` (`#FFF0D8` by day in the light plan's table), and it is not multiplied by daylight. Today's bloom
    threshold is 0.65 (`DECISIONS.md:427`); the light lane's is 1.05. Decision: the glint is the sun's mirror image,
    so it blooms under the "sun disc" grammar. It joins the light lane's Task 5 Step 1 audit as MEANT, and Task 9
    rejects a milky sheet. Owed outside this file: that audit row (owner `plan-light-colour`).
18. **[LOW] Process and citation gaps. Applied, all four.**
    - (a) `DECISIONS.md:452-453` and `:478` reserve the ocean aesthetic to Kevin. His grant at `:86-92` covers it,
      so Task 0 Step 6 appends a dated superseding entry before the look changes.
    - (b) `lookbook.mjs` is not on main (`git ls-tree` on HEAD, 2026-10-27). The `--hold-place` and `--place`
      commits land on `feat/instruments` before Task 0 (Prerequisites).
    - (c) The `needsUpdate` assertion is at `ocean-gpu-waves-gates.test.js:80`, not `:78`. Fixed.
    - (d) Task 6's `farColumn` now treats surfaceY 28 as land, as the bake does, with a test and mutant F3.

Incidental fix, not from the review: Task 0's file line said the Acceptance numbers are "filled in under Task 8's
commit". Task 8 commits baselines alone, so the line now names Task 7's commit, where Task 7 Step 6 already commits
them.

## Seam reconciliation (2026-10-27)

The seam with the light lane was reconciled in both plans in one pass. Its single statement is now the seven-row
table in "Seam with the light lane", which is word for word the table in the light plan's "Seams with other lanes"
(checked by extracting both blocks and comparing them). Facts re-read for it: `Ocean.jsx`, `FarField.jsx`, `mood.js`,
`Sun.jsx` and `Atmosphere.jsx` on `main` at `c03e9f2f`; `feat/steady-cool` changes neither `Ocean.jsx` nor
`FarField.jsx`; three 0.172.0 (`WebGLRenderer.js:1652-1653,1693,1695`, `WebGLPrograms.js:185,591-607`,
`Material.js:109-111,149`); the `index` chunk on disk, 696,924 B. Changed in this file:

1. **Prerequisites:** the light-lane bullets are condensed and point at the table. The claim that the two seam
   sections matched is removed; it is true now only because the table is shared.
2. **Landing second, the ocean reads only `skyFrameRef` (owed item d):** row 1, and Task 3 Step 3. `sunDir` is a
   `number[3]` there, so `uSunDir.value.fromArray(...)`, never `.copy`.
3. **`.sun` was described wrongly:** this file said that after the light lane's Task 3a `.sun` means the key light.
   That plan removes `.sun` and `.sunIntensity` instead (its review amendment 12). The coast-first fallback read
   `.sun`, so after that task it would throw. It now holds `uSunColor` at the light day key's glow `#FFF0D8`.
4. **Landing first, the sites the light lane's Task 3b replaces are named (owed item e):** row 2 lists them, (i)-(iv),
   and each is tagged `SEAM light-3b` on its line and listed file:line in the commit body. Row 3 does the same for
   the far Fresnel's `uFresnelDay` in `FarField.jsx` (Task 6 Step 3).
5. **The sun-glow fog define (owed item f):** "ONE line in `onBeforeCompile`, `attachSunFog(shader, material)`" is
   replaced by a define at construction (`mat.defines = { ...mat.defines, ...SUN_FOG_DEFINES }`) plus
   `attachSunFog(shader)`, one argument. Verified on three r172: the program key is computed before
   `onBeforeCompile` runs, `shader.defines` is the material's own object, so a define written in the hook is compiled
   but unkeyed, and the next re-key compiles a second program. The light plan's Task 6 says the same.
6. **The glint's bloom bar:** Review Focus 6 and `GLINT_STRENGTH` in Task 1. Under the light lane's threshold 1.05 a
   MEANT source must reach 1.2 x the threshold, which 0.9 does not (0.80 at the day `glowColor`). Whichever lane lands
   second raises it to at least 1.43 and adds the glint to the light lane's MEANT gate (row 5).
7. **A case neither plan covered:** this lane writes the fallback, then the light lane merges first. This lane
   converts on its rebase; the light lane's sky-readers gate on `main` goes red until it does.
8. **Bytes:** row 7 states both lanes' ceilings (+8,000 B here, +10,000 B light) against the shared 63,076 B of
   headroom, and the second lander re-measures it on its rebased base.
