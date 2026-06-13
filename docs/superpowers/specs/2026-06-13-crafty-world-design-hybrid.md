# Crafty — World-Design: "Anchored Infinite" (the HYBRID) — design of record

> **Status (2026-06-13): DESIGN COMMITTED (charter §4/§5 self-gate, loop iter 106, ultracode).** Produced by a
> 3-phase grounded design-gate workflow (`wf_124f683b-44d`: 4-lens LIVE-engine survey → design → adversarial
> critique; 6 agents / 600k tokens). Direction **RATIFIED by Kevin 2026-06-13 = HYBRID**. This is a DESIGN+CONTENT
> layer ON the real, shipped world engine — **NOT an engine rewrite.** Every piece is generation-time-baked or a
> static R3F group → **NO-RE-MESH and capture-deterministic by construction.** Milestone plans (one per the CLAUDE.md
> rule) build off THIS spec.

> **Read-Before-Architect:** the survey READ the live engine (cited): worldgen is ONE file `frontend/src/world/terrain.worker.js`
> (753 LOC — climate fields continent/moisture/temperature/height-noise at :378-383; height `30+n*40` :385; ocean lerp
> to `targetOceanHeight=12+n*12` :388-394; water fill `y<=28` :415; the HARDCODED 3-branch biome if/else :396-409;
> beach override `surfaceY<30` :406; foliage gate `surfaceY>28` :465; the `stampStructures`/`DUNGEON_BLUEPRINT` stamp
> mechanism :209-236/:155-202/:204-207; `vegRandom` deterministic hash :22-27) · `world/Terrain.jsx` (the two materials
> opaque :25 / water :34, each `onBeforeCompile` :147/:152; the shared `compileShader` :43-145 with the vertex wave :74-82
> + night biolum :136-142; water mesh :231; the `TreasureChestsRender` prop seam :316-359 mounted :779; chunk streamer
> 2/tick :541-563; tier render radius :519-520) · `proceduralTextures.js` (the 10-layer DataArrayTexture, `numLayers=10`
> :5, depth alloc :132) · `render/quality.js` (TIERS toggles :19-23) · `Atmosphere.jsx` (fog full Y56 / 34m falloff :25-26)
> · `GameScene.jsx` (camera far=500 :749, spawn [0,30,0] :750, shadow cam far=200/ortho±100 :724-729) · `Components.jsx`
> (the spawn probe :892-928, void-guard teleport :881) · `render/mascots/voxelKit.jsx` (the flat-toon Cube/Emissive/Ink
> primitives). My proposal EXTENDS these via a NEW data surface (`world/biomeTable.js`, `world/structures.js`) + a NEW
> generation pass (`stampHomeAnchor`) + NEW R3F groups (`HomeAnchorRender`, `LandmarkRender`) — all hooking the cited seams.

## 1. Vision — "An anchored infinite world."

Keep the infinite procedural wilds (no world edge; camera-keyed streaming, seed 12345). Bolt on four content layers so
the world stops feeling like undifferentiated noise: **one crafted HOME ANCHOR + a few signature LANDMARKS + sharp BIOME
DISTINCTNESS + OCEANS that are a place.** Three tiers coexist on the one infinite field: **THE HEARTH** (a crafted region
at origin chunks `cx,cz∈{-1,0}`, where the player spawns, identical every load, zero save data — regenerated from coords
like the dungeon) · **THE NEAR-RING** (placement-bias so the first landmark + a coast + distinct biomes are reachable
early) · **THE INFINITE WILDS** (the existing gen, now distinct, continues unbounded). NOT a bounded island (that would
amputate the streaming engine Kevin said to preserve). Seed stays 12345 in BOTH spots (Terrain.jsx:19 + terrain.worker.js:21) — lockstep or determinism diverges.

## 2. The four pieces (each hooked to a real seam; corrections from the adversarial critique folded in)

**PIECE 1 — CRAFTED HOME ANCHOR ("the Hearth").** A small crafted place at origin: a flattened plinth + a stone-and-wood
lodge + a lit brazier + planters + a short pier toward water. ONE readable returnable landmark ("you start HERE"), not a town.
- Seam (DUAL): (a) voxel FOUNDATION/flatten = a new gen-time pass `stampHomeAnchor(blocks,cx,cz)` modeled on
  `stampStructures` (terrain.worker.js:209-236, the world→local clamp :226-231), gated `cx,cz∈{-1,0}`, **inserted after the
  stamp call ~:445 and BEFORE the player-mod replay :496** (player edits win — load-bearing order). (b) DECORATION = an R3F
  `<HomeAnchorRender/>` group, sibling of `<TreasureChestsRender/>` (Terrain.jsx:779), built from **voxelKit Cube/Emissive/Ink
  (flat-toon), NOT the chest's PBR meshStandardMaterial** (critique LOW — copy the chest's MOUNT + capture-null + tier-outline
  STRUCTURE only). Brazier Emissive **self-nulls under `isCaptureMode()`** (chest-beacon pattern :346).
- **Correction (critique HIGH #2): the Hearth does NOT "fix the y=60 spawn fallback"** — origin is naturally land (~Y30,
  continent≈0), the probe returns >15 in a few frames today. Its real value = **a deterministic, flat, ABOVE-WATER standable
  plinth** every load. Gate: foundation top **surfaceY > 28** (above the water fill :415) **with margin** + the flatten is
  actually flat (probe variance ≈0 across the footprint). Drop the spawn-fix claim.
- Perf: one-time CPU on ≤4 origin chunks at gen (off-thread, NO re-mesh); decoration = a few shared-`mobToonRim`-program
  draws, decorative castShadow off.

**PIECE 2 — SIGNATURE SILHOUETTE LANDMARKS.** 2-3 authored TYPES (Lighthouse on a coast / leaning Monument / Sky-arch or
great-tree), sparse, tall enough to read through fog — wayfinding + "go there" lures, not dungeons.
- Seam: **SEAM-A (default)** = `<LandmarkRender/>` R3F voxelKit groups, placed by a deterministic coordinate hash cloned
  from `vegRandom`/`isDungeonChunk` (terrain.worker.js:22-27, :204-207) — **NEVER Math.random** (visual-gate load-bearing).
  SEAM-B (a `LANDMARK_BLUEPRINT` voxel stamp) only for climbable/mineable monuments — deferred to M7.
- Sizing (grounded): fog full Y56 over 34m, camera far=500 → a landmark must clear **~Y90** to read through valley mist.
- **Correction (critique MEDIUM): the shadow cam is far=200/ortho±100** → tall landmarks would clip-shadow; `castShadow=false`
  on upper parts is **artifact-avoidance, not just perf.** And **only instantiate landmark groups whose hashed cell is within
  a render-radius of the camera** (a distance gate in the camera-keyed effect) — do NOT mount the infinite candidate set; add
  a per-tier landmark-count cap to TIERS (quality.js:19-23).

**PIECE 3 — BIOME DISTINCTNESS (sharp, not recolored).** Convert the inline 3-branch (terrain.worker.js:396-409) into a
data-driven `pickBiome(temperature,moisture,continent)` + `world/biomeTable.js`; make biomes differ in TOPOGRAPHY (biome-aware
height curve replacing the fixed `30+n*40` :385), PALETTE, FOLIAGE (branch the :451-494 pass), and SEABED.
- **Correction (critique HIGH #1 — the strongest risk): there is NO "triple-sync BLOCK_ID_MAP".** The real ID surfaces for a
  NEW block id are THREE DIFFERENT maps: **(1) `proceduralTextures.js` `numLayers` (currently 10, :5) — MUST be bumped AND a
  32×32 RGBA layer authored at that index, or a block id ≥ numLayers samples OUTSIDE the DataArrayTexture (depth alloc :132) →
  garbage/black; (2) `BLOCK_COLORS` terrain.worker.js:520 (else greedy-mesh vertex color falls to white); (3) `BLOCK_ID_MAP`
  Terrain.jsx:441 ONLY if mineable-to-item.** The M4 gate is a **block-registry-coverage test** (every BLOCK_COLORS key <
  numLayers has an authored layer), NOT a "triple-sync" test. The DataArrayTexture depth is the load-bearing one.
- **Correction (critique LOW): M3 `pickBiome` returns ONLY `{surfaceBlock, secondaryBlock}`** (the fields the current branch
  sets) for a byte-identical refactor; heightScale/heightBias/seabedBlock/treeType become table columns in M4. Keep the height
  literal :385 UNTOUCHED in M3.
- Perf: same per-column cost (table lookup ≡ if/else, once/256 cols/chunk, off-thread, NO re-mesh). New tints must survive the
  obsidian-mood desaturation (Terrain.jsx:123-127).

**PIECE 4 — OCEANS-AS-PLACE.** Divable basins (18-22 voxel deep), a layered seabed (sand shallows → gravel mid → stone/clay
deeps), readable beaches, sparse islands carrying landmarks.
- Seam: (a) **promote the literals to consts — and the critique-corrected reality: `SEA_LEVEL=28` (water fill :415 AND the
  foliage no-spawn gate :465 'above the waterline') and `BEACH_BAND_TOP=30` (sand override :406) are TWO DIFFERENT consts;
  the 2-voxel gap (28→30) IS the shoreline — do NOT unify** (critique MEDIUM). `DEEP_FLOOR` lowers the `targetOceanHeight` lerp
  (:390) for depth. (b) seabed = depth-keyed block assignment at :406-409 (new layers per Piece-3 mechanism). (c) islands =
  a sparse high-amplitude term on the continent field (:378) forcing surfaceY above SEA_LEVEL in deep regions.
- **Correction (critique MEDIUM): the depth-tint lives on `waterMaterial` (Terrain.jsx:34/:152), not "the shared
  compileShader" — and needs a NEW `varying float vWorldY`** plumbed vertex→fragment (the fragment uses view-space Y at :136,
  not world Y); set vWorldY where worldPosition is computed (:77), read in the water color block, fed a new `SEA_LEVEL` uniform
  via the existing useFrame pump (:382-387). Optional caustics = same `time` uniform (freezes under capture). Take the cheap
  win: **turn OFF `castShadow` on the water mesh (Terrain.jsx:231)** (cost + a transparent-shadow artifact). Keep the -0.05 wave
  sink + depthWrite:false (shoreline z-fight guard :39/:80).
- Perf: greedy mesher culls water-vs-water interior faces (:590-607) → deeper basins add only sloped side-quads (cap max depth).

## 3. The milestone ladder (lowest-risk-first; each its own plan doc per the CLAUDE.md rule; [GATE]=re-baseline + Kevin HD review)

- **M1 — HOME ANCHOR (foundation + decoration) [GATE] [recommended first].** `stampHomeAnchor` + `<HomeAnchorRender/>`.
  Highest signal (spawn lands on a crafted place), lowest risk (2 proven seams, deterministic, NO-RE-MESH). Gate: foundation
  top >28 w/ margin + flat; no Math.random; voxelKit-not-PBR (static gate); brazier capture-null. Re-baseline explore-day.
- **M2 — OCEAN DEPTH + COASTLINE consts + divable basins [GATE].** Const promotion (SEA_LEVEL=28 / BEACH_BAND_TOP=30 — TWO
  consts) + lower DEEP_FLOOR (column 18-22). Water castShadow OFF. NO new look/blocks. Worker unit test: depth + the
  shoreline invariant (BEACH_BAND_TOP>SEA_LEVEL≥1; no foliage at surfaceY≤SEA_LEVEL). Re-baseline explore-day/night.
- **M3 — BIOME TABLE refactor (look-NEUTRAL) [NO GATE].** Extract :396-409 → `pickBiome()` returning ONLY {surfaceBlock,
  secondaryBlock} + `world/biomeTable.js`. Characterization test: byte-identical block arrays (fixed seed, ~4 chunks across
  the 3 climate zones) pre/post. Height literal :385 untouched. No baseline change.
- **M4 — BIOME DISTINCTNESS [GATE].** Biome-aware height curve + new palette layers (numLayers++ AND authored 32×32 each) +
  biome-branched foliage. Block-registry-coverage gate (every BLOCK_COLORS key < numLayers has a layer). Cross-chunk-seam test
  (global-coord noise → no chunk-local RNG seams). Re-baseline.
- **M5 — OCEAN SEABED + WATER DEPTH-TINT [GATE].** Depth-keyed seabed (M4 mechanism) + the `vWorldY`/SEA_LEVEL depth-tint on
  waterMaterial. Capture-freeze test (shader on `time`); obsidian-mood survival. Re-baseline.
- **M6 — SIGNATURE LANDMARKS (SEAM-A R3F) + island placement [GATE].** `<LandmarkRender/>` deterministic-hash placed,
  in-range-culled + per-tier count cap; sized >Y90; Emissive beam capture-null; castShadow off (artifact + perf). Highest
  creative variance → last. Re-baseline.
- **M7 (optional fast-follow)** — climbable/mineable landmark via SEAM-B blueprint stamp; deferred unless Kevin wants interactable monuments.

## 4. Open questions — loop defaults chosen (charter §4 self-gate; all within the ratified HYBRID; reversible, batched to Kevin)

1. **Home anchor identity → DEFAULT: quiet solo "Hearth"** (lodge+brazier+pier, no NPCs) — lowest risk, ships M1 fastest. (A
   villager hamlet reusing the existing villager mob + trading UI is a fast-follow if Kevin wants life there.)
2. **Landmark interactivity → DEFAULT: SEAM-A visual wayfinding** (M6); climbable/mineable (SEAM-B) deferred to M7.
3. **Biome count → DEFAULT: make the existing 3 SHARP first** (M4); add new flavors (mesa/autumnal) only if the look budget
   allows at the post-M4 review.
4. **Ocean depth hazard → DEFAULT: friendly-explorable, NO drown/oxygen timer** (matches the broad-audience kids→adults
   pillar); a stakes mechanic is a separate gameplay milestone if Kevin wants it.
These are loop decisions (recorded for reversal); the two most player-facing (#1 Hearth-vs-hamlet, #4 ocean-hazard) are flagged
to KEVIN-REVIEW-BATCH — the loop proceeds on the defaults.

## 5. Coherence + the hard frame
One readable art direction (bold-flat/toon, the locked render recipe, ink contour, NEUTRAL tonemap) across every piece — no
PBR, no normal-mapped water, no kitchen-sink. Web/iPad perf envelope (all gen-time or pooled/tier-gated/in-range-culled).
Capture-determinism (every new Emissive/shader term freezes/self-nulls under `isCaptureMode()`). NO-RE-MESH (everything baked
at chunk-gen or static R3F; no per-frame/mid-combat chunk re-mesh). Determinism (coordinate-hash placement, NEVER Math.random).
