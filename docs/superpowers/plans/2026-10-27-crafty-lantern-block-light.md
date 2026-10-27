# The Lantern and a Baked Block-Light Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At night the player can craft a lantern, place it with the same touch or mouse verb as any block, and watch a
warm pool of light spread over the ground around it, stepping down block by block, blocked by walls, crossing chunk
borders without a seam, and going out when the lantern is broken. The Hearth's forge and lookout throw the same light,
so the first night shows the settlement as a lit island in the dark. Hostile mobs do not spawn naturally inside a
lantern's bright core (light 8 or above). Natural spawns land only 28-85 m from the player
(`src/systems/spawnPlacement.js:28`), so the rule keeps fresh spawns out of a lit outpost, or the Hearth, while the
player is away, and it is the rule move 10's siege builds on. **It does not defend a base the player is standing in**:
the core reaches 7 cells, and no spawn lands that close to the player. Light as a defence (light that acts where mobs
are, gated by upside kill criterion 5) belongs to move 10 (Review amendment 1). By day the pools are invisible and
the lantern block itself still shows a lit flame, so warmth is spent only where it means something.

**Architecture:** Block light only (sky light is a later step, refute F13). A pure BFS module computes a per-chunk
light field (levels 0..15, minus 1 per face step, through air and water only) over the chunk plus a one-cell apron,
reading the 3x3 neighbour chunks the terrain worker already caches; a pure per-worker "light world" decides which
chunks to relight on generate, edit, unload and save load, and coalesces neighbour relights. The greedy mesher adds the
face's light level (the level of the air cell the face looks into) to its merge key at bits 26..29 and writes it into
the free `colors.b` channel, so merges stay exact and the vertex costs zero extra bytes. The terrain shader adds
`LUT(level, sunY) x gain x BRDF_Lambert(albedo)` to the indirect diffuse, with the LUT a 16x16 RGBA8 DataTexture keyed
on light level and sun height that is exactly zero while the sun is up. The lantern is block id 16 with its own
texture layer and a flame emissive term.

**Tech Stack:** React 19, three 0.172.0 (verified, `node_modules/three/package.json:3`) through R3F 9.5, a Web Worker
(Vite `?worker`), zustand 5, @react-three/rapier 2.2.0, vitest 4, Playwright 1.64 (CI e2e, SwiftShader), the Phase 0d
lookbook probe (real GPU, Chromium ANGLE-Metal and WebKit).

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 3, "The lantern and a baked block-light
field"; it wins where it differs from the inputs). Design inputs, verbatim:
`docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` move rank 12 ("The lantern: light is the defence");
`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md` F13 and its verdict row 12 ("RESIZE ... block light first,
sky light as a later step"); `docs/superpowers/masterpiece-2026-10/upside-2026-10-27.md` items 2, (a), (b) and kill
criterion 1 (`:142`); `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE-R2.md:124-141` (item 5, the original scoping).
Decisions of record: `docs/superpowers/DECISIONS.md`.

**Depends on (merged to main first):** Phase 0b (`feat/parked-looks-perf`: `world/oreGlow.js` supplies the one night
curve and the `<emissivemap_fragment>` splice this plan extends); Phase 0d (`feat/instruments`: the lookbook probe and
its production seam `src/render/lookbookSeam.js`, used by the e2e pose and the acceptance frames). Phase 1 move 4 (the
light and colour script) is needed for the ACCEPTANCE frames to read (a cool night behind a warm pool). Units 1-4
build and gate without it. **Unit 5 needs it, and Units 6-7 follow Unit 5:** the flame's day and night emissive are bounded against move 4's
`BLOOM_THRESHOLD` (`render/bloomGrammar.js`, 1.05), and on today's 0.65 threshold (`src/GameScene.jsx:121`) the
day flame would bloom (Review amendment 13). Phase 2 move 9 (the material grammar,
`docs/superpowers/plans/2026-10-27-crafty-material-grammar.md`) is also a prerequisite of Unit 5: the lantern tile is
authored in its tone grammar, and its layer arithmetic applies. Block layers stay `0..BLOCK_LAYER_COUNT - 1` and the
variants sit above them, so id 16 shifts the three variants by one and the array goes from 19 to 20 layers, not 16
to 17 (roadmap `:201` names move 9; Review amendment 14). The umbrella's phase order (1, then 2, then 3) already
satisfies both. Unit 5 checks that they have landed before it starts.

---

## Current state (cited, every line verified by reading on 2026-10-27)

**There is no local light in the world.** `grep -rniE "blockLight|skyLight|lightLevel|lightField|lantern" frontend/src`
finds only two comments naming the Hearth's "lookout lantern" prop (`src/render/HubRender.jsx:10,49`) and one in
`src/render/captureGlow.jsx:13`. Caves, interiors and the ground under the Hearth's fires receive the same ambient as
open ground.

**The mesher (`frontend/src/world/mesher.js`).**
- The merge key is built in `faceKey` (`:68-82`) and returned as `face | (aoKey << 10) | (biome << 18)` (`:81`):
  8 bits type, 2 bits direction, 8 bits corner AO, 8 bits biome. The mask is a `Uint32Array(4096)` (`:24`) whose
  header comment says "the key needs 26 bits" (`:22`), so bits 26..31 are free.
- Decode: `blockType = val & 0xFF`, `dirFlag = (val >> 8) & 3`, `biomeId = (val >> 18) & 0xFF` (`:156-158`).
- Per vertex it pushes `blockType, biomeId, 0` into `colors` (`:294-299`); the comment at `:290` says
  "color.b = still unused, still 3-wide". So a per-vertex light level costs zero extra bytes.
- `occluderAt(d, ad, uc, vc)` (`:48-54`) maps the in-plane coordinates of the AIR layer `ad` in front of a face to
  `getBlock(ad, uc, vc)` / `getBlock(vc, ad, uc)` / `getBlock(uc, vc, ad)` for d = 0 / 1 / 2. The light of a face is
  the light of that same air cell, so the mapping is reused.
- `getBlock` returns 0 for any cell outside the chunk (`:40-43`), so a face on the chunk's edge looks into the
  NEIGHBOUR chunk's cell. A light field that stops at the chunk edge would give every border face light 0: the field
  needs a one-cell apron.
- The only importer is the worker (`src/world/terrain.worker.js:15`), so mesher bytes land in the worker chunk, not
  in `index`.
- `tests/gates/mesher-merge-key-gates.test.js:243-251` pins the 10-chunk fixture at 2,356 quads under a 2,600 ceiling.

**The terrain worker (`frontend/src/world/terrain.worker.js`).**
- It caches every generated chunk's blocks in `chunks` (`:26`) and biome ids in `biomeChunks` (`:30`), and replays
  player edits from `chunkModifications` (`:31`, replay at `:605-612`).
- `generate` meshes the requested chunk only (`:57-99`); `update_block` writes one cell and re-meshes only that chunk
  (`:100-164`, re-mesh at `:136`). Nothing ever re-meshes a NEIGHBOUR.
- `unload` evicts `chunks` and `biomeChunks` "in LOCKSTEP ... or the parallel map is a leak" (`:165-169`);
  `load_modifications` clears all three maps (`:170-186`).
- `BLOCK_COLORS` covers ids 1..15 plus 255 (`:630-652`).
- The worker assigns `self.onmessage` at module scope (`:46`) and cannot be imported under vitest, which is why the
  mesher (`mesher.js:3-7`) and the cave CA were extracted. The light logic must be extracted the same way.

**The terrain material (`frontend/src/world/Terrain.jsx`).**
- `MeshStandardMaterial`, `vertexColors: true`, `FrontSide` (`:47-54`). The vertex `main` replacement reads
  `vBlockType = color.r; vBiome = color.g;` (`:86-88`); the fragment replaces `<color_fragment>` entirely (`:126-181`),
  so `vColor` never multiplies the albedo and a non-zero `color.b` changes nothing until a term reads it.
- `<lights_fragment_end>` is already spliced for cloud shadows (`:185-191`); `uSunDir` is a uniform (`:66`) written
  every frame from `sunDirRef` (`:637`), a transient read inside `useFrame` (Game-Loop Isolation holds).
- `TEX_LAYERS = voxelTextures.image.depth` (`:239`): the biome tint mask and (after 0b) the ore-glow table size
  themselves from the texture array, so a 17th layer flows through.
- The worker's `chunk_mesh` is folded into React state with `setChunks` (`:686-695`), and each `ChunkMesh` builds its
  `TrimeshCollider` from `meshData.positions` / `meshData.indices` (`:303-305`). @react-three/rapier 2.2.0 spreads the
  `args` array ELEMENTS into the collider's dependency list (`node_modules/@react-three/rapier/dist/react-three-rapier.esm.js:1369-1384`),
  so a collider is rebuilt exactly when the positions or indices array identity changes.
- `place()` posts one `update_block` per footprint cell (`:1012`), up to 64 cells per action (`:996-1000`); `mine()`
  posts one (`:955`).

**three 0.172.0's physical fragment order** (verified in the installed source): `#include <emissivemap_fragment>`
(`ShaderLib/meshphysical.glsl.js:183`), `#include <lights_fragment_end>` (`:189`), `#include <aomap_fragment>` (`:192`),
`totalDiffuse = directDiffuse + indirectDiffuse` (`:194`). Ambient irradiance enters as
`reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor )`
(`ShaderChunk/lights_physical_pars_fragment.glsl.js:508`). Block light is added the same way, after
`<lights_fragment_end>`.

**The sun.** `sunArcDirection` (`src/render/mood.js:148-169`) gives a sun height `y = sinNoonElev x sin(2 pi f)`, so
`y` is positive by day and negative by night. The sun's height only reaches about +/-0.57: the moods' noon
`sunPos` (`mood.js:24-26`) normalise to a `y` of 0.536 (explore), 0.566 (dusk) and 0.391 (obsidian). Today capture
pins the fraction to noon (`src/render/Atmosphere.jsx:246`), so a LUT that is zero for any sun above the horizon leaves
every capture frame's block-light term exactly 0. **That stops holding when move 4 lands.** Its `captureCycle` sends
every capture state with `isDay: false` to fraction 0.75 (light-colour plan `:543`, `:568`), so `explore-night` and
`explore-night-low` will render with block light on (Review amendment 9; Unit 7 Step 5).

**The ore-glow pattern (parked, `feat/parked-looks-perf`).** `world/oreGlow.js` exports `nightFactor(sunY)`
(`:47-49`: 1 - smoothstep(-0.15, 0.1, sunY)) and generates its GLSL from the same constants (`:56-71`), spliced after
`<emissivemap_fragment>` (parked `Terrain.jsx:197-201`); `tests/gates/ore-glow-gates.test.js` evaluates the JS twin
over the real tile bytes. This plan reuses `nightFactor` and the splice.

**The Hearth.** `HUB_BUILDINGS` (`src/world/hubLayout.js:7-12`) places the forge at `[10, -8]`, rotation 0.4, and the
watchtower at `[-9, 12]`. Their glows are props: the forge fire `CaptureNullGlow` at local `[0, 1.0, 0.8]`
(`src/render/HubRender.jsx:29`) and the lookout lantern at `[0, 6.8, 0]` (`:49`), on a group at `HEARTH_Y + 0.5`
(`HEARTH_Y = 51`, `src/world/homeAnchor.js:16`). In world cells: forge fire (10, 52, -8), lookout (-9, 58, 12). The
lodge's brazier also mounts a real `pointLight` (`src/world/Terrain.jsx:459`, capture-null at `:456`).

**Blocks, placement and saves.** Ids 0..15 are the whole engine space (`src/world/blockIds.js:27-50`); the texture
array has 16 layers (`src/world/proceduralTextures.js:35`), pinned by `tests/world/proceduralTextures.test.js:20-22`.
`HOTBAR_BLOCKS` has 9 entries (`src/world/Blocks.js:22`); the hotbar scales to 0.56 at widths of 640 px or less
(`src/ui/GameHud.jsx:37`). Touch placement is the cast button (`src/ui/TouchControls.jsx:194`, `dispatch(2)`), routed
to `'place'` when terrain is nearer than any mob (`src/input/verbRouter.js:54-58`). The starting loadout already holds
`glass: 8` and `coal: 8` (`src/store/useGameStore.jsx:693-694`). Saves store raw block ids (`src/game/saveSchema.js:18`):
the first pushed build that lets a player save id 16 is a one-way door (upside (a)).

**Spawning.** `spawnMob(x, z, forceType, explicitY)` (`src/systems/SpawnerSystem.jsx:27-84`) picks a hostile type at
`:48-50` and is published to the store at `:88` (`useGameStore.setState({ spawnMob })`), which is how a test can drive
it.

**Bytes.** `scripts/ci/bundle-budget.mjs:35` caps `index` at 760,000 bytes. The `build/` on disk (05:22 today) has
`index-RM8RWfkj.js` at 696,924 bytes (headroom 63,076, shared by every Phase 1-3 move) and
`terrain.worker-DkZuBAlW.js` at 18,005 bytes (not budgeted).

**Measured for this plan (2026-10-27, Node 24.13, machine load average ~37, so times are inflated and noisy; quad
counts are deterministic).** An in-memory variant of today's mesher with the light level OR-ed into the key at bit 26,
fed a Map-based prototype BFS, over chunks produced by the real worker's `generateChunkData` (trees, caves, ores, the
Hearth stamp), seed 12345. No file was written.

| Scenario | Quads before | Quads after | Growth |
|---|---:|---:|---:|
| 81 chunks around the origin, no emitter | 182,869 | 182,869 | 0 (light 0 adds 0 to the key) |
| Hearth, three emitters (forge 15, brazier 14, lookout 13), 4x4 chunks | 31,972 | 32,513 | +1.7%; worst chunk (0,-1) +9.3% |
| One lantern on open ground, 3x3 chunks (three sites) | 20,872-21,220 | +221 to +274 | +1.1% to +1.3%; worst chunk +9.9% |
| Dense base, 9 lanterns 5 blocks apart, 3x3 chunks | 20,872 | 21,522 | +3.1%; worst chunk (3,2) +11.6% |
| Flat 16x16 slab, one emitter (the degenerate fixture) | 6 | 260 | a perfectly merged slab splits into rings |

Worker time on that run: chunk generation median 1.90 ms, p95 8.53 ms; today's mesher median 4.54 ms, p95 36.51 ms
(JIT warm-up in the tail); the variant with the light hook median 5.56 ms, p95 19.66 ms; the Map-based BFS 1.4-2.8 ms
per lantern and 10.5 ms cold for the three Hearth emitters. The two mesher figures were run back to back, not paired,
on a loaded machine, so they say nothing about the +10% remesh criterion either way; Unit 3's interleaved bench
(`scripts/bench/block-light-bench.mjs`) decides it, and the typed-array BFS in Unit 1 replaces the prototype.

**Re-measured for the review amendments (2026-10-27, Node, load average about 259, quad counts only; deterministic).**
The method is the same: a copy of today's mesher with the level OR-ed into the key at bit 26, and a Map-based BFS
through air and water. The worker chunks came from importing the REAL `src/world/terrain.worker.js` in Node under a
`globalThis.self` stub. That works today: 81 `generate` messages around the origin return 182,869 quads, the first
row of the table above. The scripts were scratch files, so Unit 3's bench re-creates them and commits them (amendments
3, 8 and 10).

| Scenario | Fixture | Quads before | Added | 3x3 / scene | Worst chunk |
|---|---|---:|---:|---:|---|
| Hearth as designed (forge 15, lookout 13) | worker, 7x7 | 107,471 | +368 (+736 tris) | +0.34%; 6 chunks change | (0,-1) 2,140 -> 2,368, +10.7% |
| Hearth with the brazier (14) the design drops | worker, 7x7 | 107,471 | +580 | +0.54% | (0,-1) +10.5% |
| One lantern, open ground: (56,8) centre of chunk (3,0), (63,8) its border, (4,59) | worker, 3x3 | 13,686-15,210 | +190 / +134 / +168 | +1.25% / +0.88% / +1.23% | +5.7% / +3.6% / +5.6% (the border site's outer neighbour (4,0) lay outside the measured ring, so its +134 is a floor) |
| One lantern, centre / border / (4,11) | `realChunk`, 3x3 | 2,146-2,152 | +212 / +252 / +217 | +9.9% / +11.7% / +10.1% | +57.9% / **+111.7%** / +44.0% |
| Dense base, 9 lanterns 5 apart | `realChunk`, 3x3 | 2,206 | +549 | +24.9% | +101.6% |

`realChunk` averages 238 quads per chunk (no caves, trees, ores or Hearth: `tests/gates/_terrainFixture.js:6-7`), and
the worker averages 2,258. The ABSOLUTE number of quads a lantern adds is similar on the two (+134 to +252). The
RELATIVE growth differs by about 10x, so a relative bound measured on one fixture cannot gate the other (amendment 3).

**Boot relights (amendment 8).** In `Terrain.jsx`'s streaming order (`:797-807`: x outer, z inner, from the corner
of the box), with "an ungenerated neighbour is opaque", the Hearth's two emitters cause **10 light-only re-meshes on 6
chunks** while the box streams in. That holds at both R = 2 (low tier, 25 chunks: +40% chunk messages) and R = 4 (high,
81 chunks: +12%). Chunks (0,-1), (-1,-1), (-1,0) and (-2,1) are each relit twice. Every player pays these, and the
coalescing rule in Decision 5 removes them.

---

## Design (the moves, with GPU and main-chunk byte cost)

| Move | What | GPU cost | Main-chunk bytes (raw, estimated; each unit measures) |
|---|---|---|---|
| D1 Light field | Pure BFS over the chunk plus a one-cell apron (18x18x256), reading the 3x3 cached neighbours; an ungenerated neighbour is opaque | none (worker CPU) | 0 (worker chunk +~1.8 KB) |
| D2 Light in the key | Bits 26..29 of the merge key; level into `colors.b` | about +134 to +252 quads per lantern (worker chunks: +0.9% to +1.3% per lit 3x3), +0.34% scene-wide with the Hearth; 0 elsewhere | 0 (worker +~0.2 KB) |
| D3 Light world | Emitter index (it survives eviction), cached fields, relight on generate / edit / unload / load, coalesced neighbour relights flagged `lightOnly` (boot relights held until the chunk's 3x3 is loaded); the main thread keeps the old collider on `lightOnly` and drops a `lightOnly` with no previous entry | +368 quads (+736 tris) at the Hearth (two emitters as designed); boot relights 10 -> at most 6 | ~0.5 KB (reducer + collider memo + glow data); worker +~2.5 KB |
| D4 LUT shading | 16x16 RGBA8 LUT (1 KB) on (level, sunY), exactly 0 while the sun is up; one `texture()` and ~6 ALU per terrain fragment, every tier; no new program, no new light, no new pass | estimate <= 0.05 ms at high on the M3 Max, less on the iPad's 1.8 Mpx low tier; measured by the Phase 0 GPU timer if present, else stated as an estimate | ~1.8 KB |
| D5 Lantern block | Id 16, layer 16 (block layers 16 -> 17; the texture array goes 19 -> 20 after move 9, +4 KB VRAM), flame emissive (one coherent compare per fragment, keyed on the block type), hotbar slot, recipe, i18n, icon | the flame term; about +134 to +190 quads around a lantern on worker chunks | ~2.5 KB (1-1.5 KB of it the icon path, if baked) |
| D6 Spawn rule | Natural hostile spawns refused where the open-air light bound is >= 8. This is NOT a defence of the player's position: spawns land 28-85 m away (amendment 1) | none | ~0.5 KB |
| D7 Instruments | Lookbook places; a hitch read against the pre-feature build; a worker bench that drives the real worker against the frozen pre-Unit-1 tree | none in the shipped game | 0 (the lookbook places through `window.useGameStore`, Unit 7 Step 1) |

Total main chunk: ~5.3 KB of the 63,076 bytes of headroom. D7 was ~0.3 KB for a seam method, but Unit 7 Step 1
already places through the exposed store instead, so it is 0.

**Decisions inside the design (each a routine call made here; the one taste call is Default 4, decided and recorded
in DECISIONS.md by Unit 5 Step 8a).**
1. **Flat per-face light, not smooth per-vertex light.** A face takes the level of the one air cell it looks into,
   so the 4-bit level fits the existing 32-bit key and every merged quad is exact (all its cells share the level).
   Smooth lighting averages four cells per corner: 16 more key bits (42 in all, past the `Uint32Array`) and almost no
   merging inside a lit area. The stepped rings suit the bold-flat look; the lookbook judges it.
2. **The light of a face is read from the air layer `ad`** (the same cell `occluderAt` reads for AO), never from the
   solid block.
3. **Transparent to light: air (0) and water (9) only.** Glass renders opaque today (`blockIds.js:44-47`) and blocks
   light; leaves block light. A lantern is a solid cube that seeds its own cell at 15 and propagates into transparent
   neighbours. Hearth emitters are virtual: they seed an air cell.
4. **Region exactness.** A cell's level is `max(0, L_e - d)` over emitters e and shortest transparent paths d. A path
   of length <= 14 stays within 14 of its target, so the BFS over the apron box grown by 14 (46x46 in x/z, all inside
   the 3x3 chunks) is exact for every apron cell. The four corner columns of the apron (both lx and lz outside 0..15)
   are left 0: a face's air cell leaves the chunk along one axis only, so the mesher never reads them, and leaving
   them out stops a diagonal neighbour from "changing" over a cell nobody draws. The READ box is therefore the chunk
   plus its four one-cell edge strips. A chunk with no emitter within 14 of its read box returns `null` and the mesher
   takes today's path.
5. **Relight fan-out.** An edit at P can change light only within 14 of P, and only if some emitter (before or after
   the edit) lies within 14 of P. So an edit with no emitter in reach costs one emitter-list check, and an edit with
   one marks dirty at most the 3x3 chunks whose read box meets P's 14-ball. A coalescing flush (`setTimeout(0)` in the
   worker) recomputes each dirty field once and re-meshes only the chunks whose field bytes changed, sent as
   `chunk_mesh` with `lightOnly: true`. A centre-placed lantern re-meshes its own chunk plus at most four edge
   neighbours (a diagonal's nearest read cell is 15 from a centre lantern, so it reads level 0).
   **Boot coalescing (amendment 8).** Dirt from an EDIT flushes on `setTimeout(0)`, as above. Dirt from
   `noteGenerated` waits: `flushDirty()` skips a generate-dirty chunk until all 9 chunks of its 3x3 are loaded. A
   separate `flushIdle()`, which the worker calls 300 ms after the last `generate`, takes the rest (the rim of the
   box, whose 3x3 never completes). Each Hearth chunk is then relit at most once at boot (measured today: 10
   re-meshes on 6 chunks, each up to twice).
6. **No collider rebuild for light.** Blocks are unchanged in a `lightOnly` payload, so the main thread keeps the
   previous collider arrays by identity and rapier does not rebuild. Every block change sends a full payload
   synchronously before any later `lightOnly` one, so the kept collider always matches the current blocks. **A
   `lightOnly` payload with no previous entry is dropped (amendment 15).** It can only be a flush that the worker
   posted before it processed an `unload` (or a `load_modifications`) for a chunk the main thread has already
   deleted (`Terrain.jsx:852-854` posts the unload and deletes in the same updater). Inserting it would bring back a
   culled chunk with a new collider.
7. **The LUT is exactly zero while the sun is up, and its rows cover the sun's REACHABLE range (amendment 11).**
   v maps `[LUT_SUN_LO, LUT_SUN_HI] = [-0.675, 0.125]` onto 16 rows, 0.05 apart. The top row's centre is exactly
   0.1, the ore glow's `SUN_UP`, where `nightFactor` is 0. With clamp-to-edge and bilinear filtering, any sunY >= 0.1
   (noon, the capture pin, and every day sun up to the 0.57 maximum) reads exactly that zero row. The dusk ramp
   (-0.15 to 0.1) is sampled at 6 row centres (rows 10-15), where v spanning -1..1 gave it 2. Interpolating between row centres
   misses the smoothstep by at most h^2/8 x max|f''| = 0.0025/8 x 96 = 0.03 of full brightness. Pools kindle through
   dusk on the same `nightFactor` curve as the ore glow. The lantern's own flame stays visibly lit by day and
   blooms at night. Both values are bounded against move 4's `BLOOM_THRESHOLD` (1.05): the night peak is at least
   1.2 x the threshold, which is move 4's rule for a meant source, and the day peak is at most 0.5 x the threshold,
   leaving room for the sunlit albedo (amendment 13). The starting values are day 0.45 and night 1.8.
8. **Curve and colour (starting values, tuned on the lookbook):** ember `#FFB066` (sRGB), `curve(L) = L === 0 ? 0 :
   0.8^(15 - L)` (level 15 = 1.0, 8 = 0.21, 1 = 0.044), `uBlockLightGain = 3.0`. Level 0 is exactly 0, so an unlit
   face adds exactly 0.0 to its irradiance.
9. **Hearth sources:** forge fire level 15, lookout lantern level 13, as data on `HUB_BUILDINGS` (`glow: { at, level }`)
   read by both `HubRender` and the emitter list, so the prop and the light cannot drift. The brazier keeps its point
   light (Phase 0g's pool owns point lights; Default 3).
10. **Spawn rule uses the open-air bound** `max(L_e - manhattan)` over lanterns and the Hearth emitters, computed on the
    main thread from `worldBlocks`. It is an upper bound on true light, so it can refuse a spawn behind a wall that true
    light would allow, never the reverse. Only natural spawns (no `forceType`) are filtered, so authored spawns (the
    prologue, the dragon) are unaffected. **What it does in play (amendment 1).** Natural spawns land 28-85 m from
    the camera (`spawnPlacement.js:28`), and the boot ring lands 30-50 m from the origin (`SpawnerSystem.jsx:96-103`).
    A level-15 core reaches Manhattan 7, so the rule refuses a spawn only at a lit place the player is 28-85 m from.
    That covers a lantern-ringed outpost while the player explores, and move 10's siege anchors. Mobs that spawn
    outside the core still walk in. This milestone claims no defence. The defence (light that acts where mobs are:
    refused entry or aggro inside light >= 8, or siege waves that break against a lit ring) is move 10's, under
    upside criterion 5. The siege plan already takes this rule over: it keys the rule on `opts.source` and makes
    lantern clusters siege anchors (`2026-10-27-crafty-encounters-siege.md:544-547`).

---

## Global Constraints

- Death stays soft; nothing here touches death or respawn (`DECISIONS.md`, 2026-10-27).
- No WebGPU/TSL and no three.js bump: three stays 0.172.0. New shader terms are pure GLSL string modules with JS
  mirrors, the `world/oreGlow.js` / `world/leafFeel.js` pattern, and a node test evaluates the JS twin.
- Every unit states its main-chunk bytes against `scripts/ci/bundle-budget.mjs` (`index` max 760,000) by running
  `npm run build && node scripts/ci/bundle-budget.mjs` before and after, and puts the delta in the commit body. Never
  raise a budget.
- No move adds GPU cost without stating it (the Design table). The iPad (low tier, WebKit) must stay correct: no
  half-float or float textures (RGBA8 only), no extension the WebGL2 core lacks.
- Block light only. Levels 0..15, minus 1 per face step, through air (0) and water (9) only, continuous across chunk
  borders. Bake it: no three.js light per lantern (a light-count change re-links every program,
  `src/world/PhantomBlockSystem.jsx:18-20`).
- Kill criteria (upside `:142`): quads per chunk at most +25% and remesh time at most +10% on fixed seeds; relighting
  after a placement must not hitch the main thread by more than one frame on the iPad viewport. **Each is checked
  against what it names (amendments 2, 3 and 7).** Quads: the relative bounds are checked on WORKER chunks in Unit 3's
  bench; the `realChunk` gate in Unit 2 bounds ABSOLUTE quads added. Remesh time: compared with the FROZEN pre-Unit-1
  tree, never with the post-change code's own null path. Hitch: an absolute 16 ms over the pre-feature build at the
  same cell. The upside asks for the hitch "on the iPad probe", and macOS WebKit is not iPadOS
  (`scripts/visual/ipad-probe.mjs:20`), so that part is stated as a blind spot until a real iPad run exists.
- Game-Loop Isolation: no React state or zustand subscription read in a per-frame system. Uniforms are written from
  refs in the existing `useFrame`; the spawn rule reads `getState()`; the worker talks only through messages.
- i18n: every new player string has an `en` and a `zh-CN` entry in `src/i18n/strings.js`, used through `t()`.
- No emoji anywhere in `src/` (zero-emoji gate).
- Never a backtick inside the Terrain GLSL template literal; every generated GLSL string is asserted backtick-free.
- AST-safe edits only (Edit tool) on `.js`/`.jsx`; never `sed`.
- Any visual-baseline re-shoot is its own `Baseline-Review:` commit with no `frontend/src/` change in it.
- A new or rewritten gate under `tests/gates/` carries a `Mutation-Proof:` trailer naming each mutant and its red
  test, plus the identity mutant that survived; each gate file's header states what makes it fail (killability).
- Probes use `scripts/visual/_serve.mjs` with a port registered in its table; run
  `sh frontend/scripts/dev/kill-test-procs.sh` after every browser batch.
- No new module reachable from `Components.jsx` may contain a voxel-seam token (`tests/gates/_seamClosure.js` SEAM:
  `setWorldBlocks|terrain.worker|createChunk|setBlock|postMessage|update_block`); the store stays the one owner.
- Several gates read the worker's TEXT (`grass-revival-gates` counts exactly two `columnTops(...)` and two
  `const gTops = grassTops(` calls; `home-anchor`, `biome-*`, `heightat-single-source`, `m1-bugfix` read it too): the
  worker changes are glue lines only, and the light-only path adds no grass scan.
- Line numbers cited here are main at `f0e84766`; Phases 0b and 0d move them. Re-locate each splice by its anchor
  string before editing.
- Commits: no "Co-Authored-By" or "Generated with" footer; fix-ups are new commits.
- Run unit tests from `<repo>/frontend`: `npx vitest run <file>`.

## Review Focus

The five inputs most likely to bite a player that the spec does not name, each pinned by a test in the owning unit:

1. **A lantern on a chunk border** (local x or z of 0 or 15): both chunks must agree on every shared cell, with no
   dark seam. Pinned in Unit 1 (`continuity across a chunk border`) and Unit 3 (`a border lantern relights the
   neighbour`), and shot in the lookbook (Unit 7).
2. **Breaking a lantern** must clear its light everywhere, including neighbour chunks (stale light is the classic
   voxel-lighting bug). Pinned in Unit 3 (`breaking the lantern restores the dark field in every chunk`) and the Unit 5
   e2e.
3. **A lantern beside a chunk that has not streamed in yet**: the neighbour must come in lit. Pinned in Unit 3
   (`a chunk generated after the lantern comes in lit, and its neighbour is relit`).
4. **Reloading a save with lanterns**: `load_modifications` must rebuild the emitter index so the world comes back lit.
   Pinned in Unit 3 (`setModifications rebuilds the emitters`).
5. **A 64-cell build of lanterns in one click** (`buildFootprint` cube mode): each neighbour must be relit once, not
   64 times. Pinned in Unit 3 (`a burst of edits relights each chunk once`).
6. **Walking away from your lanterns and back** (amendment 6): `unload` evicts the chunk and `generate` rebuilds it
   from `chunkModifications`. The emitter index must survive the eviction, or the lanterns come back dark. Pinned
   in Unit 3 (`an evicted emitter chunk comes back lit`).
7. **Boot** (amendment 8): the Hearth's chunks stream in before their neighbours. Each must be relit at most once,
   not once per arriving neighbour. Pinned in Unit 3 (`the boot stream relights each Hearth chunk at most once`).

## File structure

| File | Responsibility | Unit |
|---|---|---|
| Create `frontend/src/world/blockLight.js` | Pure light field: constants, transparency, emitter level, `computeChunkLight`, `fieldIndex` | 1 |
| Create `frontend/tests/gates/block-light-field-gates.test.js` | Field exactness against an independent brute-force BFS; continuity; null path | 1 |
| Modify `frontend/src/world/mesher.js` | Optional `light` field argument; level in the key (bits 26..29) and in `colors.b` | 2 |
| Create `frontend/tests/gates/mesher-light-key-gates.test.js` | Light footprint exactness, border faces, null-is-identical, quad budget | 2 |
| Create `frontend/src/world/lightWorld.js` | Per-worker light state: emitter index, field cache, dirty set, flush, eviction, save reset | 3 |
| Create `frontend/src/world/blockLightSources.js` | `HEARTH_EMITTERS`, derived from `HUB_BUILDINGS` glow data | 3 |
| Create `frontend/src/world/chunkMeshMerge.js` | `mergeChunkMesh(prev, payload)`: keeps the collider arrays on `lightOnly` | 3 |
| Modify `frontend/src/world/terrain.worker.js` | Thin glue: create the light world, pass fields to the mesher, flush and send `lightOnly` meshes | 3 |
| Modify `frontend/src/world/hubLayout.js`, `frontend/src/render/HubRender.jsx` | `glow: { at, level }` on forge and watchtower, read by the prop | 3 |
| Modify `frontend/src/world/Terrain.jsx` | Reducer in the message handler; memoised collider args; (Unit 4) uniforms and splices; (Unit 5) flame splice | 3, 4, 5 |
| Create `frontend/tests/gates/relight-gates.test.js` | Light world and reducer behaviour, including the Review Focus cases | 3 |
| Create `frontend/tests/world/blockLightSources.test.js` | Hearth emitter cells | 3 |
| Create `frontend/scripts/bench/block-light-bench.mjs` | Worker-time and worker-quad instrument. It drives the REAL `terrain.worker.js` under a `self` stub against the frozen pre-Unit-1 tree (Q51's remesh number, the boot relight count, the relative quad bounds) | 3 |
| Create `frontend/src/world/blockLightLut.js` | LUT builder, DataTexture, JS twins, GLSL (`decl`, `vertex`, `light`, `flame`) | 4, 5 |
| Create `frontend/tests/gates/block-light-lut-gates.test.js` | LUT zero by day, monotone by level, twin equals GLSL constants, flame mask over real tile bytes | 4, 5 |
| Create `frontend/tests/e2e/block-light.spec.js` | Lived proofs: Hearth bake reaches the GPU buffer; the forge pool at night; real-touch lantern; spawn refusal | 3, 4, 5, 6 |
| Modify `frontend/src/world/blockIds.js`, `Blocks.js`, `proceduralTextures.js`, `frontend/src/data/recipes.js`, `frontend/src/data/items.js`, `frontend/src/i18n/strings.js`, `frontend/src/ui/GameHud.jsx`, `frontend/src/ui/GamePanels.jsx`, `frontend/src/ui/panels/CraftingTable.jsx`, `frontend/src/ui/primitives/gameIcons.js` | The lantern block, its slot, recipe, name and icon | 5 |
| Modify `frontend/tests/world/proceduralTextures.test.js` | Block layers 16 -> 17 (texture array 19 -> 20 after move 9), a widened gate; header wording updated to cite the DECISIONS.md entry | 5 |
| Modify `frontend/tests/e2e/touch-controls.spec.js` | The phone-fit test counts `HOTBAR_BLOCKS.length` slots (10), not a literal 9 | 5 |
| Modify `docs/superpowers/DECISIONS.md` | One dated entry for the lantern's non-routine choices (amendment 14) | 5 |
| Create `frontend/src/game/lightSpawn.js`, `frontend/tests/gates/light-spawn-gates.test.js`; modify `frontend/src/systems/SpawnerSystem.jsx` | The spawn rule | 6 |
| Modify `frontend/src/render/lookbookSeam.js`, `frontend/scripts/visual/_lookbook.mjs`, `frontend/scripts/visual/lookbook.mjs` | A `placeBlocks` seam method, the `lantern-ring` place, the hitch read | 7 |

---

## Units

Seven units, in order. Each ends green on its own gates and is committed alone (the session-length rule: commit per
unit, checkpoint after Unit 3). Units 1-2 change nothing a player can see (no emitter exists, so every mesh is
byte-identical). Unit 3 bakes the Hearth's light into the GPU buffer, Unit 4 makes it visible, Unit 5 is the verb,
Unit 6 the defence rule, Unit 7 the acceptance instruments. **Push grouping:** Units 1-4 may push together; Unit 5
carries the one-way door (block id 16 enters saves), so push it only with its e2e green and Units 6-7 ready behind it.

Every gate commit carries a `Mutation-Proof:` trailer in this shape (run the mutants with `scripts/dev/mutate.sh`,
restoring from a `cp` backup, never `git checkout`):

```
Mutation-Proof: <file> — B1 <what was broken> -> <test name> RED; B2 ... ; B0 identity (comment edit) SURVIVED
```

### Unit 1: The light field (pure)

**Files:**
- Create: `frontend/src/world/blockLight.js`
- Test: `frontend/tests/gates/block-light-field-gates.test.js`

**Interfaces:**
- Consumes: `CHUNK_SIZE`, `CHUNK_HEIGHT`, `CHUNK_VOLUME`, `voxelIndex` from `src/world/chunkLayout.js`.
- Produces:
  - `LIGHT_MAX = 15`; `FIELD_SIDE = 18`; `FIELD_VOLUME = 82944` (18 x 18 x 256)
  - `fieldIndex(lx, y, lz): number` = `(lx + 1) + (lz + 1) * 18 + y * 324`, for `lx`, `lz` in -1..16 (the apron)
  - `isLightTransparent(id: number): boolean`, true for 0 and 9 only
  - `computeChunkLight(cx, cz, getBlocks, emitters): Uint8Array | null`, where `getBlocks(cx, cz)` returns the chunk's
    `Uint8Array(CHUNK_VOLUME)` or `undefined` (not generated: treated as opaque), and `emitters` is
    `Array<[wx, wy, wz, level]>` in world cells. The four corner columns (lx and lz both outside 0..15) are always 0
    (never read by the mesher). Returns `null` when no emitter is within `LIGHT_MAX - 1` (Manhattan) of the READ box:
    the chunk plus its four one-cell edge strips inside `[cx*16 - 1, cx*16 + 16] x [0, 255] x [cz*16 - 1, cz*16 + 16]`.

- [ ] **Step 1: Write the failing gate.** The file header states what makes each test fail (killability) and names
  the blind spot (the field is computed against fixtures, not the worker's own `generateChunkData`). Fixtures: a
  hand-built world (a 5x5-chunk map of `Uint8Array`s: stone at y <= 10, air above, plus per-test walls and water) and
  `realChunk` from `tests/gates/_terrainFixture.js`. The reference is an INDEPENDENT brute-force BFS written in the
  test: a per-emitter breadth-first walk over a `Map` keyed by world cell, taking the max over emitters. Tests:

```js
it('a lone emitter: 15 at its cell, 14 one face away, 15 - d through open air, 0 at d = 15', () => {
  const f = computeChunkLight(0, 0, slabWorld.get, [[8, 11, 8, 15]]);
  expect(f[fieldIndex(8, 11, 8)]).toBe(15);
  expect(f[fieldIndex(9, 11, 8)]).toBe(14);
  expect(f[fieldIndex(9, 12, 8)]).toBe(13);   // a diagonal is two face steps, never one
  expect(f[fieldIndex(8, 16, 8)]).toBe(10);
  expect(f[fieldIndex(8, 11, -1)]).toBe(6);   // the apron cell in chunk (0,-1)
});
it('stone blocks the straight line and the level follows the detour', () => {
  // wall: stone at x = 10, y 11..13, every z in the region; emitter (8,11,8,15); target (12,11,8).
  // shortest path: up 3, across 4, down 3 = 10 steps -> level 5 (the straight line, 4 steps, would give 11)
  expect(computeChunkLight(0, 0, wallWorld.get, [[8, 11, 8, 15]])[fieldIndex(12, 11, 8)]).toBe(5);
});
it('water carries light one level per step, and a sealed stone cell stays 0', () => { /* water pocket fixture */ });
it('continuity across a chunk border: two chunks agree on every shared cell', () => {
  // emitter at world (15, 11, 8): chunk 0's strip x = 16 equals chunk 1's interior x = 0, and chunk 1's strip
  // x = -1 equals chunk 0's interior x = 15; z in 0..15, every y: compared === 2 * 16 * 256
});
it('exact against an independent BFS on real terrain, and the corners stay 0', () => {
  // the 10 SEEDS of mesher-merge-key-gates.test.js; per seed 6 emitters from a seeded LCG within 20 cells of the
  // chunk, plus one at Manhattan 14 from the read box (contributes exactly 1) and one at 15 (contributes 0)
  // every read cell: expect(compared).toBe(10 * 320 * 256)  (18 x 18 columns minus the 4 corners)
  // every corner column is 0: expect(cornersChecked).toBe(10 * 4 * 256)
});
it('an ungenerated neighbour is opaque, even when the only path runs through it', () => { /* getBlocks -> undefined */ });
it('no emitter in reach returns null; one at Manhattan 14 from the read box returns a field with exactly one lit cell', () => {});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `cd <repo>/frontend && npx vitest run tests/gates/block-light-field-gates.test.js`
  Expected: FAIL, "Failed to resolve import ../../src/world/blockLight.js".

- [ ] **Step 3: Implement `blockLight.js`.** Algorithm (not determined by the signature): filter emitters to those
  within 14 of the read box; if none, return `null`. BFS region = apron box grown by 14 in x and z (46 x 46; lies
  inside the 3x3 chunks) and in y clamped to `[minEmitY - 14, maxEmitY + 14]`. Use a module-scope scratch
  `Uint8Array(46 * 46 * 256)` (the mesher's reusable-`mask` pattern) cleared over the touched y-span only, and a
  bucket queue by level (seed every emitter cell at its level into bucket[level], drain 15 down to 2, push each
  transparent face neighbour at level - 1 when it raises that cell), so each cell is written at its final level once.
  A seed cell that is itself opaque (a lantern) still seeds; propagation enters transparent cells only. Read a block
  as `getBlocks(chunkOf(wx), chunkOf(wz))?.[voxelIndex(...)]`, with `undefined` chunks opaque. Copy the read box
  out into a fresh `Uint8Array(FIELD_VOLUME)` (corners left 0). No `self`, no `postMessage`, no THREE.

- [ ] **Step 4: Run it and see it pass.** Same command. Expected: PASS, 7 tests.

- [ ] **Step 5: Kill the mutants.** Each must turn the named test RED; the identity mutant must survive:
  - B1 read only the centre chunk (neighbours opaque) -> continuity, exact
  - B2 water opaque (`id === 0` only) -> water
  - B3 region margin 13 instead of 14 -> the Manhattan-14 case, exact
  - B4 apron dropped (16x16 field, index without +1) -> continuity
  - B5 plausible-wrong: 26-neighbour steps -> lone emitter (the diagonal reads 14, not 13)
  - B6 plausible-wrong: decrement 2 per step through water -> water, exact
  - B7 the corner columns copied out -> "the corners stay 0" RED (and Unit 3's diagonal case later)
  - B0 a comment edit -> all green

- [ ] **Step 6: Commit** (no `src/` consumer yet besides tests; knip counts tests as entries, `.knip.json`).
  Body: worker-chunk bytes (0 main bytes), `Mutation-Proof:` trailer.
  `git add frontend/src/world/blockLight.js frontend/tests/gates/block-light-field-gates.test.js`
  `git commit -m "feat(world): the block-light field — a pure BFS over the chunk and a one-cell apron, exact against a brute-force reference"`

**Cost:** GPU none; main chunk 0 bytes.

### Unit 2: Light in the greedy-merge key and the vertex

**Files:**
- Modify: `frontend/src/world/mesher.js:30` (signature), `:68-82` (`faceKey`), `:156-158` (decode), `:284-299` (colors)
- Test: `frontend/tests/gates/mesher-light-key-gates.test.js`

**Interfaces:**
- Consumes: `fieldIndex`, `FIELD_VOLUME`, `computeChunkLight` (tests only) from Unit 1.
- Produces: `generateMesh(cx, cz, blocks, biomeIds, light = null)`; the key gains `faceLight << 26` (4 bits, 26..29);
  `colors` per vertex is `[blockType, biomeId, blockLight]`. Every existing caller passes four arguments and is
  unchanged.

- [ ] **Step 1: Write the failing gate.** Header: what each test measures, what makes it fail, the blind spot (it
  proves the vertex carries the level; nothing here proves the shader reads it, which is Unit 4's e2e).

```js
it('a null field and an all-zero field are byte-identical to today on the 10-seed fixture', () => {
  // generateMesh(cx, cz, b, bio) vs (..., null) vs (..., new Uint8Array(FIELD_VOLUME)): every typed array equal
});
it('light footprint: every unit cell under every quad carries the quad\'s level, on all six directions', () => {
  // field from computeChunkLight with 6 seeded emitters per seed; for each quad, enumerate its w x h unit cells (the
  // biome-footprint walk in mesher-merge-key-gates.test.js), find each cell's AIR cell, and assert
  // field[fieldIndex(air)] === the quad's colors.b; assert per-direction counts of lit cells checked are all > 0
});
it('a floor beside a lantern makes at least 2 top quads (R2\'s fixture)', () => {
  // 16x16 stone slab at y = 10, emitter (8, 11, 8, 15): top-face quads >= 2 (measured 260 in all on 2026-10-27)
});
it('a border face reads the neighbour\'s apron cell, not 0', () => {
  // slab ending at x = 15 with its +X face looking into x = 16; field lit at (16, y, z): colors.b === that value
});
it('light leaves AO and biome exact', () => {
  // with a non-null field: every quad's colors.r and colors.g match the unlit truth per cell, and the AO-exactness
  // check of mesher-merge-key-gates (interpolated top AO equals cornerAO) still holds
});
it('quad budget, ABSOLUTE quads added, on the fixture it was measured on (amendment 3)', () => {
  // realChunk averages 238 quads per chunk, against 2,258 for a worker chunk, so a relative bound measured on one
  // cannot gate the other. Bound the quads ADDED, measured on this same fixture (2026-10-27, prototype):
  //   one lantern on a 3x3 of realChunk around (0,0): centre (8,8) +212, border (15,8) +252, (4,11) +217
  //     -> each site <= 300
  //   dense base, 9 lanterns 5 apart: +549 -> <= 650
  //   flat 16x16 slab at y = 10, one lantern at (8,11,8): 6 -> 260 (plan table) -> added <= 300
  //   the Hearth pad: stampHomeAnchor + stampHub on realChunk(0,-1), (0,0), (-1,0), (-1,-1), with HEARTH_EMITTERS
  //     -> record the added count in the header at first green and bound it at that count + 15%
  // Lanterns are placed as block 16 in BOTH arms, so the delta is the light term only. The relative kill criterion
  // (+25% per chunk) is checked on worker chunks by Unit 3's bench, not here.
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run tests/gates/mesher-light-key-gates.test.js`
  Expected: FAIL; the footprint, border and floor tests report `colors.b` = 0 (the param is ignored today).

- [ ] **Step 3: Implement.** In `faceKey` add `(faceLight(d, ad, cu, cv) << 26)`, where `faceLight` returns 0 when
  `light` is null or the air cell's y is outside 0..255, and otherwise maps (d, ad, uc, vc) to (x, y, z) exactly as
  `occluderAt` does (`mesher.js:48-54`) and reads `light[fieldIndex(x, y, z)]` (x or z may be -1 or 16: the apron).
  Decode `const blockLight = (val >>> 26) & 15;` beside `:156-158` and push it as the third colour channel at
  `:294-299`. Update the header comment at `:14-15` and `:22` (the key is now 30 bits) and the `color.b` comment at
  `:290`. Do not touch winding, UVs, the mask clear or the water rule (`.claude/rules/voxel-mesher.md` §1-3b).

- [ ] **Step 4: Run it and see it pass**, then the neighbours:
  `npx vitest run tests/gates/mesher-light-key-gates.test.js tests/gates/mesher-merge-key-gates.test.js tests/gates/mesher-geometry-gates.test.js tests/gates/ocean-mesher-no-water-faces.test.js`
  Expected: all PASS; `mesher-merge-key-gates` still totals 2,356 quads (its 2,600 ceiling untouched).

- [ ] **Step 5: Kill the mutants:**
  - M8 drop the light term from the key -> footprint RED
  - M9 plausible-wrong: read light from the solid side (`q` in place of `ad`) -> footprint RED on the + faces
  - M10 write the level to `colors.g` -> "light leaves AO and biome exact" RED
  - M11 ignore the apron (x or z outside 0..15 reads 0) -> border face RED
  - M12 plausible-wrong: decode `(val >> 24) & 15` -> footprint RED
  - M13 per-cell light (add `cu & 1` into the light bits) -> quad budget RED (the absolute bound is the one that can
    see a key gone per-cell)
  - M0 identity -> green

- [ ] **Step 6: Commit.** Body: worker bytes, main 0, quad numbers, trailer.
  `git commit -m "feat(mesher): the face's light level rides in the merge key (bits 26-29) and the free colors.b channel"`

**Cost:** GPU none until a field is passed (the worker still passes none); main chunk 0 bytes.

### Unit 3: The light world in the worker, and the Hearth's sources

**Files:**
- Create: `frontend/src/world/lightWorld.js`, `frontend/src/world/blockLightSources.js`, `frontend/src/world/chunkMeshMerge.js`,
  `frontend/scripts/bench/block-light-bench.mjs`
- Modify: `frontend/src/world/blockLight.js` (emitter table), `frontend/src/world/terrain.worker.js` (glue only),
  `frontend/src/world/hubLayout.js:7-12`, `frontend/src/render/HubRender.jsx:29,49`, `frontend/src/world/Terrain.jsx:686-695,303-305`
- Test: `frontend/tests/gates/relight-gates.test.js`, `frontend/tests/world/blockLightSources.test.js`,
  `frontend/tests/e2e/block-light.spec.js` (test 1)

**Interfaces:**
- Consumes: `computeChunkLight`, `LIGHT_MAX` (Unit 1); `generateMesh(..., light)` (Unit 2).
- Produces:
  - `blockLight.js`: `EMITTER_LEVEL = Object.freeze({})` (block id -> level; Unit 5 adds the lantern) and
    `emitterLevel(id): number` (0 when absent).
  - `hubLayout.js`: forge `glow: { at: [0, 1.0, 0.8], level: 15 }`, watchtower `glow: { at: [0, 6.8, 0], level: 13 }`.
  - `blockLightSources.js`: `glowWorldCell(building): [wx, wy, wz]` = floor of `pos + rotY(rot) * glow.at` with
    y offset `HEARTH_Y + 0.5`; `HEARTH_EMITTERS`: frozen `[[10, 52, -8, 15], [-9, 58, 12, 13]]`, derived, never typed.
  - `lightWorld.js`: `createLightWorld({ getBlocks, extraEmitters = HEARTH_EMITTERS, levelOf = emitterLevel, compute = computeChunkLight })`
    returning `{ setModifications(mods), fieldFor(cx, cz), noteGenerated(cx, cz), noteEdit(cx, cz, index, prevType, nextType), flushDirty(): string[], flushIdle(): string[], evict(cx, cz), emittersNear(cx, cz), stats(): { cached, dirty, deferred } }`.
    `noteEdit` keeps a per-chunk emitter index (from `levelOf`), drops the own chunk's cached field, and marks dirty
    every OTHER loaded chunk whose read box meets the edit's 14-ball when an emitter, before or after the edit, lies
    within 14 of the edited cell. **The emitter index is a projection of the player's edits, so it mirrors
    `chunkModifications` and outlives eviction (amendment 6).** World generation never places an emitter block. Only
    `setModifications` rebuilds the index, and only `noteEdit` changes it. `evict(cx, cz)` drops the chunk's cached
    field, its loaded flag and any dirty mark, and NEVER its emitter-index entry. `noteGenerated` marks dirty every
    other loaded chunk in the 3x3 that has an emitter within reach of its read box, as GENERATE-dirty. `flushDirty`
    recomputes each EDIT-dirty field, and each generate-dirty field whose 3x3 is fully loaded, once. `flushIdle`
    recomputes every dirty field (amendment 8). Both return the keys whose bytes changed (null vs null is unchanged).
  - Worker protocol: `chunk_mesh` payloads gain `lightOnly: boolean`. A `lightOnly` payload omits `grassTops`.
  - `chunkMeshMerge.js`: `mergeChunkMesh(prev, payload): { cx, cz, meshData, colliderData: { positions, indices } }`.
    Full payload: `colliderData` is the payload's arrays. `lightOnly` with a `prev`: `colliderData` is `prev.colliderData`
    (same identity) and `meshData.grassTops` is `prev.meshData.grassTops`. `lightOnly` with no `prev`: return
    `null`, and the reducer leaves `chunks` unchanged (the payload is dropped; Decision 6, amendment 15).

- [ ] **Step 1: Write the failing gates.** `relight-gates.test.js` uses a fake world (a `Map` of chunk arrays,
  slab-shaped) and a test emitter id 99 injected through `levelOf: (id) => (id === 99 ? 15 : 0)`, so it does not
  depend on Unit 5, and a counting `compute` wrapper. Tests:
  - `placing an emitter at a chunk centre relights exactly the four edge neighbours` (`flushDirty()` returns
    `['-1_0', '0_-1', '0_1', '1_0']` sorted; the diagonals are not touched; the own chunk is not in the list)
  - `breaking the lantern restores the dark field in every chunk` (place, flush, break, flush: the same four keys come
    back and `fieldFor` of all five is `null`)
  - `a border lantern relights the neighbour` (emitter at local x 15: `fieldFor(1, 0)[fieldIndex(0, y, z)] === 14`)
  - `a chunk generated after the lantern comes in lit, and its neighbour is relit` (chunk (1,0) absent at the
    edit, added, `noteGenerated(1, 0)`: (1,0) is lit, and with a fixture whose only path runs through (1,0),
    `flushDirty()` contains `'0_0'`)
  - `setModifications rebuilds the emitters` (mods `[[0, 0, idx, 99]]` lights (0,0); `setModifications([])` makes it
    `null`; `stats().cached` is 0 after each call)
  - `a burst of edits relights each chunk once` (64 `noteEdit` calls placing a 4x4x4 cube near a corner, one
    `flushDirty()`: `compute` was called at most once per dirty key and every returned key is unique)
  - `an edit with no emitter in reach marks nothing and computes nothing` (`compute` calls 0, `flushDirty()` empty)
  - `evict drops the cached field` (`stats().cached` falls by one)
  - `an evicted emitter chunk comes back lit` (amendment 6): place an emitter in (0,0) and flush; `evict(0, 0)`
    while (1,0) stays loaded; the fake world regenerates (0,0) with the emitter replayed, as the worker does from
    `chunkModifications` (`terrain.worker.js:605-612`); `noteGenerated(0, 0)`. Then `fieldFor(0, 0)` is lit (15 at
    the emitter's cell), and the next flush relights the edge neighbours that changed. `emittersNear(0, 0)` holds
    the emitter at every step.
  - `the boot stream relights each Hearth chunk at most once` (amendment 8): `extraEmitters` set to the Hearth pair
    over a fake world. Load a 9x9 box in `Terrain.jsx`'s order (`:797-807`: x outer, z inner, from the corner),
    calling `noteGenerated` and then `flushDirty()` after each pair, and `flushIdle()` at the end. Every key appears
    in the union of the returned lists at most once, and the union is not empty (the presence: the Hearth chunks do
    get relit).
  - `mergeChunkMesh keeps the collider by identity on lightOnly, and the grass; a lightOnly with no prev is dropped`
    (full payload: the payload's arrays; `lightOnly` with `prev`: `toBe` on `prev.colliderData` and on the grass;
    `lightOnly` with no `prev`: `null`)

  `tests/world/blockLightSources.test.js`: `HEARTH_EMITTERS` equals `[[10, 52, -8, 15], [-9, 58, 12, 13]]`; each cell
  is air after `stampHomeAnchor` and `stampHub` run on a `realChunk` of its chunk (the light seeds an air cell above
  the pad); and **the derivation is live (amendment 12)**. `HEARTH_EMITTERS` is frozen at module load, so editing
  `glow.at` afterwards can never move it. The test therefore calls `vi.resetModules()`, then
  `vi.doMock('../../src/world/hubLayout.js', ...)` with the forge's `glow.at` moved by one cell in x, and
  re-imports `blockLightSources.js`. The re-imported `HEARTH_EMITTERS[0][0]` must be 11.

- [ ] **Step 2: Run and see them fail.**
  `npx vitest run tests/gates/relight-gates.test.js tests/world/blockLightSources.test.js`
  Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the three pure modules** to the interfaces above, then the glue:
  - `terrain.worker.js`: one module-scope light world whose `getBlocks(cx, cz)` reads `chunks` by the worker's
    existing `"cx_cz"` key;
    `generate` calls `noteGenerated` then passes `light.fieldFor(cx, cz)` as `generateMesh`'s fifth argument (`:70`);
    `update_block` calls `noteEdit(cx, cz, index, prevBlock, blockType)` before the re-mesh and passes the field
    (`:136`); `unload` calls `evict` beside the two deletes (`:167-168`, the lockstep rule); `load_modifications`
    calls `setModifications(modifications)` (`:176-184`). After `generate` and `update_block`, schedule one flush
    with `setTimeout(0)` (a module-scope pending flag) that posts a `lightOnly: true` `chunk_mesh` for each returned
    key still in `chunks`. Each `generate` also (re)arms a 300 ms idle timer that calls `flushIdle()` and posts the
    same way (amendment 8). **The `lightOnly` path must not call `columnTops` or `grassTops`:**
    `tests/gates/grass-revival-gates.test.js` counts exactly two of each in the worker's text.
  - `hubLayout.js` gains the two `glow` entries; `HubRender.jsx:29,49` reads `glow.at` for the `CaptureNullGlow`
    position, so the prop and the light cannot drift.
  - `Terrain.jsx:686-695`: `const next = mergeChunkMesh(prev[key], payload); return next ? { ...prev, [key]: next } : prev;`
    (a dropped `lightOnly` leaves state, and so the `debugChunks` write at `:661-666`, untouched); `ChunkMesh`
    memoises `[colliderData.positions, colliderData.indices]` and passes it as `TrimeshCollider` `args` (`:303-305`).
  - `scripts/bench/block-light-bench.mjs` (amendments 2, 3, 8 and 10). An instrument, not a gate; it exports nothing
    (`cli-guard`). **The baseline is FROZEN.** The bench takes `--base <dir>`: a checkout of the commit before Unit 1
    (`git worktree add --detach <scratchpad>/lantern-base <BASE>`, with `frontend/node_modules` symlinked; BASE's sha
    is written in the bench header). It imports each side's `src/world/terrain.worker.js` in turn under one
    `globalThis.self = { postMessage }` stub, keeps each side's `self.onmessage`, and calls the two handlers
    ALTERNATELY (A, B, A, B) on the same messages, timing each call. Before the other side runs, it drains the
    current side's timers, with `postMessage` routed to that side, so a flush is never billed to the wrong worker.
    This was verified feasible on 2026-10-27: the
    real worker imports in Node and returns 182,869 quads for the 81-chunk box. A lit-chunk quad count needs block
    access, which the worker does not export; for that the bench loads an in-memory copy of each side's worker text
    with `export { chunks, biomeChunks }` appended and its relative imports rewritten to absolute paths. The scenes,
    all on seed 12345:
    - **B1 boot:** the 81-chunk box (R = 4) and the 25-chunk box (R = 2) around the origin, in `Terrain.jsx`'s order,
      then drain both timers. Prints total worker ms per side and the count of `lightOnly` payloads (expected at most
      6; the uncoalesced count was 10).
    - **B2 unlit remesh:** 40 `update_block` edits (stone placed, then broken) at cells more than 14 from every
      emitter. Prints the median and p95 of the handler time per side.
    - **B3 lit remesh:** the same 40 edits at cells within 6 of a lantern (placed once beforehand) and of the forge.
      Prints the own-chunk handler time per side and, separately, the flush's `lightOnly` re-mesh time and count.
    - **B4 quads on worker chunks:** for the designed Hearth, one lantern at three open sites (centre, border,
      corner) and the dense 9-lantern base, the quads before and after, per chunk, per 3x3 and per scene.
    - Every run prints the load average.

- [ ] **Step 4: Run and see them pass**, then the worker's other source gates:
  `npx vitest run tests/gates/relight-gates.test.js tests/world/blockLightSources.test.js tests/gates/grass-revival-gates.test.js tests/gates/home-anchor-gates.test.js tests/gates/voidhand-noremesh-gates.test.js tests/gates/elemancer-noremesh-gates.test.js`
  Expected: all PASS (the last two prove no new module reachable from `Components.jsx` carries a seam token,
  `tests/gates/_seamClosure.js` SEAM regex).

- [ ] **Step 5: Kill the mutants:**
  - R1 `noteEdit` ignores `prevType` (a break marks nothing) -> "breaking the lantern" RED
  - R2 dirty marks limited to the own chunk -> "four edge neighbours", "border lantern" RED
  - R3 `noteGenerated` a no-op -> "generated after the lantern" RED
  - R4 `setModifications` keeps cached fields -> "setModifications" RED
  - R5 the dirty set an array (duplicates) -> "burst of edits" RED
  - R6 `mergeChunkMesh` always takes the payload's arrays -> "keeps the collider" RED
  - R7 plausible-wrong: `lightOnly` drops `grassTops` -> "keeps ... the grass" RED
  - R8 (amendment 12) the CORRECT typed literal `Object.freeze([[10, 52, -8, 15], [-9, 58, 12, 13]])` in place of
    the derivation -> "the derivation is live" RED (the equality test stays green, which is the point: only the
    re-import test can tell a copy from a derivation). R8b a wrong typed cell (`[10, 52, -7, 15]`) -> the equality
    test RED.
  - R9 (amendment 6) plausible-wrong: `evict` also deletes the chunk's emitter-index entry -> "an evicted emitter
    chunk comes back lit" RED
  - R10 (amendment 15) `mergeChunkMesh` inserts a `lightOnly` with no `prev` (the old rule) -> "a lightOnly with no
    prev is dropped" RED
  - R11 (amendment 8) `flushDirty` takes generate-dirty chunks before their 3x3 is loaded -> "the boot stream relights
    each Hearth chunk at most once" RED
  - R0 identity -> green

- [ ] **Step 6: Lived proof, e2e test 1** (`frontend/tests/e2e/block-light.spec.js`, CI): *the Hearth's forge light
  reaches the GPU vertex buffer.* Dev boot and `startPlay`; wait for the chunk mesh whose group sits at
  `(0, 0, -16)` (chunk (0,-1), the forge's) and whose material carries `userData.shader.uniforms.voxelTextures`
  (walk `window.__threeScene`). Read `geometry.attributes.color.array`: the max of the blue channel is exactly 15
  (the pad face under the forge fire looks into the emitter cell) and some value lies in 1..14 (the gradient). A
  PRESENCE before the absence: a loaded chunk with no emitter in reach has a max of 0. Deleting the bake (no field
  passed) turns the first assertion red. Not run locally (machine load; e2e is CI-only); the push's
  `e2e freshness` gate demands its green receipt.

- [ ] **Step 7: Bench and commit.** Run `node scripts/bench/block-light-bench.mjs --base <scratchpad>/lantern-base`
  three times, and preferably at a load average below the core count. Criteria, each against the FROZEN baseline
  (amendment 2; the old "null within +10% of the 4-argument call" compared the new code with itself and could not
  fail):
  - B1 boot, total worker time at R = 4 and R = 2: at most +10% (every player pays it). `lightOnly` payloads at most 6.
  - B2 unlit remesh median: at most +10% (the light hook's cost on the common path).
  - B3 lit remesh, own-chunk median: at most +10%. If it is over, that is KILL EVIDENCE under upside `:142`, and it is
    not tuned away. Before any push: write the number and the lever into a dated DECISIONS.md entry. The levers are
    to reuse the cached field when the edit cannot change it, an incremental relight in place of a full one, and
    bounding the BFS y-span. Then either take a lever and re-run, or record why the light ships over the bound. The
    prototype's 1.4-2.8 ms BFS against a 4.54 ms mesh makes "over" the likely first reading. The `lightOnly`
    neighbour re-meshes are stated separately (count and ms); they are new work that the baseline does not do.
  - B4 per worker chunk at most +25% and per 3x3 at most +10% for the dense base; the Hearth's numbers recorded.
  - `computeChunkLight` p95 <= 5 ms per lantern.
  Body: the bench numbers with the load average, main bytes (measured), worker bytes, `Mutation-Proof:` trailer.
  Then CHECKPOINT (commit, and a fresh session or `/clear` before Unit 4).
  `git commit -m "feat(world): relight on generate, edit, unload and load; the forge and the lookout seed block light; light-only re-meshes keep their collider"`

**Cost:** GPU +368 quads (+736 tris) for the Hearth's two designed emitters. Six chunks change, the worst being the
forge's (0,-1) at +10.7%, and the scene grows +0.34% over the 7x7 around the origin (re-measured 2026-10-27 with the
forge and lookout only; the old +541 included the brazier the design drops, amendment 10). Invisible until Unit 4.
No collider rebuild for a light-only re-mesh. Boot: at most 6 extra `lightOnly` chunk messages, on the Hearth's chunks
(10 without the coalescing). Each is a worker re-mesh plus a main-thread geometry rebuild and upload. Main chunk
~0.5 KB (estimate; measured in Step 7).

### Unit 4: Shading through the time-of-day LUT

**Files:**
- Create: `frontend/src/world/blockLightLut.js`
- Modify: `frontend/src/world/Terrain.jsx:56-67` (uniforms), `:70-92` (vertex decl and main), `:107-124` (fragment
  decl), `:185-191` (after the cloud shadow)
- Test: `frontend/tests/gates/block-light-lut-gates.test.js`, `frontend/tests/e2e/block-light.spec.js` (test 2)

**Interfaces:**
- Consumes: `nightFactor(sunY)` from `src/world/oreGlow.js` (Phase 0b); the vertex `colors.b` level (Unit 2-3).
- Produces (`blockLightLut.js`):
  - `LUT_LEVELS = 16`, `LUT_ROWS = 16`, `EMBER_SRGB = '#FFB066'`, `LEVEL_FALLOFF = 0.8`, `BLOCK_LIGHT_GAIN = 3.0`
  - `LUT_SUN_LO = -0.675`, `LUT_SUN_HI = 0.125` (amendment 11: the reachable sun range, with the top row's centre at
    exactly 0.1, the ore glow's `SUN_UP`)
  - `levelCurve(L): number` (0 for L = 0, else `LEVEL_FALLOFF ** (15 - L)`); `rowSunY(r): number` =
    `LUT_SUN_LO + ((r + 0.5) / 16) * (LUT_SUN_HI - LUT_SUN_LO)` (r = 15 -> 0.1)
  - `buildBlockLightLut(): Uint8Array(1024)`: texel (L, r) = `round(255 * linear(EMBER) * levelCurve(L) * nightFactor(rowSunY(r)))`, alpha 255
  - `blockLightTexture(): THREE.DataTexture` (RGBA, UnsignedByte, LinearFilter both ways, ClampToEdge, colour space
    left as NoColorSpace because the bytes are already linear, `needsUpdate = true`)
  - `blockLightAt(level, sunY, lut?): [r, g, b]`, the JS twin of the shader read: u at the texel centre, v =
    `clamp((sunY - LUT_SUN_LO) / (LUT_SUN_HI - LUT_SUN_LO), 0, 1)` read bilinearly between row centres with edge
    clamp, times `BLOCK_LIGHT_GAIN / 255`
  - `blockLightGlsl(): { vertexDecl, vertex, fragmentDecl, light }` generated from the constants:
    `vertexDecl` = `flat varying float vBlockLight;` · `vertex` = `vBlockLight = color.b;` ·
    `fragmentDecl` = `uniform sampler2D uBlockLightLut; uniform float uBlockLightGain; flat varying float vBlockLight;` ·
    `light` = `reflectedLight.indirectDiffuse += texture(uBlockLightLut, vec2((vBlockLight + 0.5) / 16.0, clamp((uSunDir.y - LO) / (HI - LO), 0.0, 1.0))).rgb * uBlockLightGain * BRDF_Lambert(material.diffuseColor);`
    with `LO` and `HI` written from `LUT_SUN_LO` / `LUT_SUN_HI` by `toFixed(3)`
    (the same form three uses for ambient irradiance, `lights_physical_pars_fragment.glsl.js:508`).

- [ ] **Step 1: Write the failing gate:**

```js
it('exactly zero while the sun is up, at every level (the capture pin included)', () => {
  // 0.1 = SUN_UP (the top row's centre); 0.391 / 0.536 / 0.566 = the three moods' noon heights (mood.js:24-26)
  for (let L = 0; L <= 15; L++) for (const y of [0.1, 0.125, 0.25, 0.391, 0.536, 0.566, 1]) expect(blockLightAt(L, y)).toEqual([0, 0, 0]);
});
it('level 0 is exactly zero at every hour (an unlit face adds 0.0)', () => {});
it('at midnight it rises strictly with level, and it is warm (r > g > b from level 4)', () => {});
it('the dusk ramp is the ore glow\'s curve (one night for every light), BETWEEN row centres too (amendment 11)', () => {
  // every sunY from -0.6 to 0.12 in steps of 0.005 (row centres AND the midpoints between them):
  // blockLightAt(15, y)[0] / blockLightAt(15, -0.6)[0] within 0.035 of nightFactor(y) (interpolation bound 0.03 +
  // quantisation); rowSunY(10..15) are -0.15, -0.10, -0.05, 0, 0.05 and 0.10, so the ramp is sampled at 6 row
  // centres; and the count of samples checked is printed and asserted
});
it('the GLSL is generated from the constants, reads color.b, and carries no backtick', () => {});
it('the texture is RGBA8, linear, clamped, and holds exactly the built bytes (WebGL2 core, iPad-safe)', () => {});
```

- [ ] **Step 2: Run and see it fail.** `npx vitest run tests/gates/block-light-lut-gates.test.js` -> unresolved import.

- [ ] **Step 3: Implement `blockLightLut.js`, then splice it into `Terrain.jsx`.** Module scope:
  `const BLOCK_LIGHT_LUT = blockLightTexture(); const BLOCK_LIGHT_GLSL = blockLightGlsl();`. In `compileShader`:
  `uBlockLightLut` and `uBlockLightGain` uniforms; `vertexDecl` in the vertex header; `vertex` next to
  `vBiome = color.g;` (`:88`); `fragmentDecl` beside `vBlockType` (`:113`); `light` after `CLOUD_SHADOW_GLSL.apply` in
  the `<lights_fragment_end>` splice (`:189`). No per-frame write: `uSunDir` is already written each frame (`:637`).
  No backtick enters the template literal (`.claude/rules/voxel-mesher.md` §3b).

- [ ] **Step 4: Run and see it pass.** Same command, then `npx vitest run tests/gates` (the whole gate folder).

- [ ] **Step 5: Kill the mutants:**
  - L1 a day floor (`max(nightFactor, 0.1)`) -> "zero while the sun is up" RED
  - L2 `levelCurve(0)` = `0.8 ** 15` -> "level 0" RED
  - L3 plausible-wrong: v without the `(sunY - LO) / (HI - LO)` remap (twin and GLSL) -> "zero while the sun is up" RED
  - L4 rows inverted -> "zero while the sun is up" RED
  - L6 (amendment 11) the old full-range rows (`LO = -1`, `HI = 1`) -> "the dusk ramp ... between row centres" RED
    (at sunY 0.1 it returns about 4% of full, where `nightFactor` is 0)
  - L5 plausible-wrong: the GLSL u divisor 15.0 -> "generated from the constants" RED
  - L0 identity -> green

- [ ] **Step 6: Compile it in a real browser** (a shader edit is not covered by the unit suite): `npm run build`, then
  `node scripts/visual/pov-probe.mjs`, OPEN the frames, confirm no `THREE.WebGLProgram` error in its log; then
  `sh frontend/scripts/dev/kill-test-procs.sh`. Say "a local run bound port 4226; I cannot see whether a tab was left".

- [ ] **Step 7: Lived proof, e2e test 2** (CI): *the forge throws a pool at night and nothing by day.* Boot
  `/?lookbook=1`, enter play, pose at the lookbook's `hearth` place (`[13, 81, 13]` looking at `[0, 51, 0]`), set the
  cycle to 0.75 through the seam's `time()`, wait for two frames, screenshot the canvas (A); set the terrain
  material's `uBlockLightGain` to 0, two frames, screenshot (B); restore. This A/B is the mutation run on every pass
  (the height-fog spec's pattern). **The measured cell must show TERRAIN, not the forge prop (amendment 5).**
  `(10.5, 52, -7.5)` lies inside the forge's stone base: `HubRender.jsx:26`, a 3.4 x 0.8 x 3.0 cube on a group at
  `HEARTH_Y + 0.5` (`:66`), puts that cell at about (0.27, 0.66) in the building's frame, inside its half-extents
  (1.7, 1.5), with the cube's top at y 52.3 over the terrain's 52. The forge-fire glow (`:29`) sits in the same box,
  and block light lights terrain only. Pick the cell in the test: from the posed camera, raycast
  (`THREE.Raycaster` against `window.__threeScene`) toward each terrace cell at least 3 cells off the forge's
  footprint and within Manhattan 6 of the emitter, and take the first whose nearest hit is a chunk mesh (its parent
  group at `(cx * 16, 0, cz * 16)`) and whose `colors.b` there is at least 9. Put the hit object's name and the
  cell in every failure message. The control is a cell at least 16 cells from both emitters, chosen the same way.
  Mean luma in a 24 px box around each: lit cell `A - B >= T_night`, control `|A - B| <= 2`. Then cycle 0.30: lit
  cell `|A - B| <= 2` (zero by day). Calibrate `T_night` on the first CI run at half the measured delta, floor 6, and
  write the measured delta in the spec header. Preconditions in every failure message: the uniform exists on
  `userData.shader`, the clock's actual cycle, no console error naming `WebGLProgram`. Deleting the term (uniform
  absent) or the bake (A = B) turns it red.

- [ ] **Step 8: Commit.** Body: main bytes measured, GPU cost as stated below, trailer.
  `git commit -m "feat(render): block light shaded through a level x sun-height LUT — zero while the sun is up, kindling through dusk"`

**Cost:** one `texture()` of a 1 KB texture plus ~6 ALU per terrain fragment, every tier; no new program (the
material is patched in place), no new light, no new pass; `gpu-cost-probe` must show programs unchanged and textures
+1. Estimate <= 0.05 ms at high on the M3 Max (unmeasured until Unit 7). Main chunk ~1.8 KB.

### Unit 5: The lantern

**Files:**
- Modify: `frontend/src/world/blockIds.js:27-50` (`lantern: 16`), `frontend/src/world/terrain.worker.js:630-652`
  (`16: toLinear('#E8A050')`), `frontend/src/world/blockLight.js` (`EMITTER_LEVEL`), `frontend/src/world/Blocks.js:1-22`
  (type and hotbar), `frontend/src/world/proceduralTextures.js:35` (17 layers) and its layer drawing,
  `frontend/src/world/blockLightLut.js` (flame), `frontend/src/world/Terrain.jsx` (flame splice),
  `frontend/src/data/recipes.js` (after Glass, `:115-119`), `frontend/src/data/items.js`, `frontend/src/i18n/strings.js`,
  `frontend/src/ui/GameHud.jsx:37,50`, `frontend/src/ui/GamePanels.jsx:588`, `frontend/src/ui/panels/CraftingTable.jsx:168,180`,
  `frontend/src/ui/primitives/gameIcons.js` (if the glyph exists), `docs/superpowers/DECISIONS.md` (one dated entry,
  Step 8a)
- Test: `frontend/tests/world/proceduralTextures.test.js:6-29` (widened, header reworded), `frontend/tests/gates/block-light-lut-gates.test.js`
  (flame and emitter cases), `frontend/tests/e2e/block-light.spec.js` (test 3), `frontend/tests/e2e/touch-controls.spec.js:117,133`
  (amendment 4: the literal 9 becomes the rendered `HOTBAR_BLOCKS.length`)
- **Preconditions (amendments 13 and 14):** move 4 has landed (`render/bloomGrammar.js` exports `BLOOM_THRESHOLD`,
  and `GameScene.jsx` reads it), and move 9 has landed (`world/materialGrammar.js` exports `BLOCK_LAYER_COUNT`,
  `TEXTURE_LAYER_COUNT` and the tone table). If either is missing, stop and re-plan this unit. Do not build the
  flame against the 0.65 threshold or the tile outside the grammar.

**Interfaces:**
- Produces: `BLOCK_ID.lantern = 16`; `EMITTER_LEVEL = { [BLOCK_ID.lantern]: 15 }`;
  `BLOCK_TYPES.lantern = { color: '#E8A050', name: 'Lantern', nameKey: 'item.lantern', texture: 'lantern' }`;
  `HOTBAR_BLOCKS` ends with `'lantern'`; recipe `{ name: 'Lantern', nameKey: 'item.lantern', pattern: [['glass'], ['coal']], output: { lantern: 1 } }`
  (reachable on turn 1: the loadout holds glass 8 and coal 8); i18n `'item.lantern'`: en `'Lantern'`, zh-CN `'灯笼'`;
  `blockLightLut.js`: `LANTERN_FLAME = { day: 0.45, night: 1.8 }` (amendment 13: bounded against move 4's
  `BLOOM_THRESHOLD`, Decision 7), `flameMask(r, g, b): number` (JS twin, sRGB bytes:
  `smoothstep(0.30, 0.45, (r - b) / 255) * smoothstep(0.55, 0.75, r / 255)`), `lanternFlameGlsl(): string` spliced
  after `<emissivemap_fragment>` (after the ore glow). For the lantern's BLOCK type (`vBlockType` within 0.5 of
  `16.0`) it adds `linear(tex) * flameMask * mix(day, night, nightFactor(uSunDir.y))` to `totalEmissiveRadiance`.
  It keys on the block type, not the sampled layer: after move 9 the fragment samples `vTexLayer`, and block id and
  layer are equal only for ids below `BLOCK_LAYER_COUNT`.
- The tile (layer 16; the three move-9 variants shift to 17-19), at most four tones plus the frame, authored as a
  `MATERIAL_TONES` entry in move 9's tone grammar (amendment 14): a 2 px iron frame in two greys, a dark cap band
  top and bottom, two 1 px pane bars, an amber flame field with a pale core.

- [ ] **Step 1: Write the failing tests:** `proceduralTextures.test.js`: depth `TEXTURE_LAYER_COUNT`, which is 20
  after move 9 (17 block layers plus 3 variants), recorded in its header as a deliberate widening like R4a's
  14 -> 16; layer 16 drawn and different from stone. The header's "layer-count change is a Kevin-taste fork, NOT an
  autonomous change" (`:6-10`) is reworded to cite the DECISIONS.md entry of Step 8a, which records this change under
  Kevin's 2026-10-27 mandate. `block-light-lut-gates.test.js`:
  `emitterLevel(BLOCK_ID.lantern) === 15` and 0 for every other id; over the REAL layer-16 bytes, every frame texel
  (the outer 2 px ring) masks to 0 and at least 25% of the tile masks to >= 0.9; the flame GLSL embeds
  `LANTERN_FLAME` and `BLOCK_ID.lantern` and carries no backtick; and the bloom bounds (amendment 13): with `peak` =
  the max linear luminance of `linear(tex) * flameMask` over the real layer-16 bytes,
  `LANTERN_FLAME.night * peak >= 1.2 * BLOOM_THRESHOLD` and `LANTERN_FLAME.day * peak <= 0.5 * BLOOM_THRESHOLD`
  (both imported, never typed).

- [ ] **Step 2: Run and see them fail.**
  `npx vitest run tests/world/proceduralTextures.test.js tests/gates/block-light-lut-gates.test.js`
  Expected: FAIL (depth 16; `BLOCK_ID.lantern` undefined).

- [ ] **Step 3: Implement** to the interfaces. Name sites: `GameHud.jsx:50` and `GamePanels.jsx:588` use
  `t(nameKey)` when `nameKey` is set, else `name`; `CraftingTable.jsx:168,180` the same on the recipe. Hotbar: 10
  slots are 10 x 62 + 9 x 8 + 2 x 10 = 712 px wide, so the phone scale at `GameHud.jsx:37` moves 0.56 -> 0.5
  (356 px fits a 375 px phone; 399 px does not); the iPad widths (820, 1180) need no scale.
  `tests/e2e/touch-controls.spec.js:133` asserts exactly 9 slots (`toBe(9)`) at 390 px and would go red on the 10th
  (amendment 4). Change it to compare against the `HOTBAR_BLOCKS.length` that the page renders: read it in page
  context, or import `HOTBAR_BLOCKS` into the spec. Rename the test from "all 9" to "every hotbar slot fits". Keep
  the off-screen assertion, which is what proves the 0.5 scale. Icon: bake the
  game-icons.net lantern glyph through the Iconify API into `GAME_ICONS.lantern` and add
  `lantern: { name: 'Lantern', icon: 'lantern', rarity: 'common' }` to `ITEMS` (candidate `game-icons:lantern-flame`;
  confirm it exists at bake time; if it does not, skip both and the block swatch stands). CC BY 3.0 attribution is
  already discharged by `src/ui/CreditsScreen.jsx`.

- [ ] **Step 4: Run and see them pass**, then the block, recipe and i18n gates:
  `npx vitest run tests/world/proceduralTextures.test.js tests/gates/block-light-lut-gates.test.js tests/gates/block-id-gates.test.js tests/gates/recipe-output-usable.test.js tests/i18n tests/store/startingLoadout.test.js`
  Expected: all PASS (`block-id-gates` covers the round trip and "every HOTBAR block must actually place itself").

- [ ] **Step 5: Kill the mutants:**
  - K1 `EMITTER_LEVEL` lantern -> 0 -> emitter case RED (and the e2e ring)
  - K2 `numLayers` left at 16 -> "the layer count covers the ENTIRE block-id space" RED
  - K3 the flame mask inverted -> flame-mask case RED
  - K4 the zh-CN entry dropped -> `tests/i18n/i18n.test.js` coverage RED
  - K5 plausible-wrong: flame on layer 15 (glass) -> generated-constants case RED
  - K6 (amendment 13) `LANTERN_FLAME.day` back to 0.7 -> the day bloom bound RED if `0.7 * peak > 0.525`; the
    mutation run states the peak, and if K6 survives the bound is shown too loose and is tightened
  - K7 (amendment 4) `touch-controls.spec.js` back to `toBe(9)` -> that spec RED on CI (stated in the trailer as a
    CI-observed red)
  - K0 identity -> green

- [ ] **Step 6: Compile in a real browser** as Unit 4 Step 6, and open a frame with a placed lantern.

- [ ] **Step 7: Lived proof, e2e test 3** (CI, touch): *a lantern placed by real touch lights the ground at night and
  breaking it puts the light out.* `test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })`.
  Boot `/?lookbook=1`, tap Start Adventure with `page.touchscreen.tap`. Setup (not under test):
  `addToInventory('lantern', 2)`, cycle 0.75, pose the camera 3.5 m above an open ground cell G, looking straight
  down. **G is at least 64 cells (Manhattan) from both Hearth emitters (amendment 4).** The old "about 20 cells"
  put G near (11, 12) or (-10, -8), inside Hearth chunks (0,0) and (-1,-1), which the forge and lookout light
  permanently: (10, 52, -1) is 7 cells from the forge and reads 8. So pick the first cell along +x from (64, 0)
  whose ground probe returns a number above sea level, and wait for the chunks around G to stream in. Then
  **snapshot the blue-channel maximum of every chunk mesh within 2 chunks of G (B0)**, and assert that every
  snapshot is 0 (the presence of a dark control before the absence). Screenshot S0. REAL INPUT: tap
  `[data-hotbar-block="lantern"]` (assert `selectedBlock === 'lantern'`), tap `[data-testid="touch-cast"]`. Assert
  `worldBlocks` holds 16 one cell above G (failure message: `getInput().active`, `isAlive`, the build ray's `toi`,
  `aimedMobDist`). Within 5 s the chunk mesh at G carries `colors.b === 14` on the ground face beside the lantern.
  Screenshot S1: the luma box two cells east of the lantern rises by `>= T_lantern` (calibrated as in Unit 4); a box
  20 cells away moves by `<= 3`. Then tap `[data-testid="touch-action"]` (routes to mine): the cell reads 0, every
  chunk mesh within 2 chunks of G returns to its B0 blue maximum within 5 s (a snapshot compare, so the test stays
  correct wherever G lands), the near box returns within 3 of S0, and the
  lantern count goes 2 -> 1 -> 2. **Substitution, said:** the aim comes from the seam's pose, not a look-drag; the
  three verbs (select, place, break) are real taps through the real touch handlers and router
  (`TouchControls.jsx:190,194`, `verbRouter.js:36-60`).

- [ ] **Step 8a: Record the decisions (amendment 14).** Kevin's mandate (`DECISIONS.md:87-88`) is "Decide, act,
  and record each non-routine decision in docs/superpowers/DECISIONS.md", and he reviews nothing. A commit message
  and an "Open questions" list addressed to him are therefore not a record. Before this unit's push, add ONE dated
  DECISIONS.md entry, "2026-10-27 (later) — The lantern: block id 16 and light that is stepped and zero by day". It
  covers:
  - (a) block id 16 enters saves, the one-way door, and its removal path through `SAVE_VERSION`;
  - (b) a 10th hotbar slot, with the phone scale 0.56 -> 0.5;
  - (c) stepped, flat per-face light rather than smooth;
  - (d) exactly zero block light by day;
  - (e) the 17th block texture layer (20 in the array after move 9), the change `proceduralTextures.test.js` called
    a Kevin-taste fork;
  - (f) the recipe, 1 glass + 1 coal;
  - (g) the brazier keeps its point light (Phase 0g decides);
  - (h) the ember colour stays in `blockLightLut.js`;
  - (i) the spawn rule is not a defence, and the defence is handed to move 10 (amendment 1).
  Each line follows the file's form: the choice, the reason, and the reversal path. The plan's "Open questions"
  section becomes "Defaults decided", pointing at this entry.
- [ ] **Step 8: Commit.** Body: main bytes measured (icon included or not), VRAM +4 KB, trailer. This is the
  one-way door: the commit message says so, and names the DECISIONS.md entry of Step 8a.
  `git commit -m "feat(lantern): a craftable lantern block (id 16) — the first emitter, with a flame that reads by day and blooms at night"`

**Cost:** one coherent per-fragment compare plus the flame term on lantern texels. The texture array goes 19 -> 20
layers after move 9 (+4 KB of VRAM, mipmaps off). A lantern adds about +134 to +190 quads to the 3x3 of worker chunks
around it, +3.6% to +5.7% in the worst chunk at the three re-measured sites; the first run's sites reached +9.9%,
and Unit 3's B4 states the committed numbers. Main chunk ~2.5 KB.

### Unit 6: No natural hostile spawns in a lit core

**Scope (amendment 1).** This rule keeps fresh natural spawns out of a lit core that the player is 28-85 m from. It
does not defend the player's position, because no natural spawn lands within 28 m of the player
(`spawnPlacement.js:28`). The gates below measure exactly that and claim nothing more. The defence is move 10's
(Decision 10).

**Files:**
- Create: `frontend/src/game/lightSpawn.js`
- Modify: `frontend/src/systems/SpawnerSystem.jsx:55-58` (after `mobConfig` resolves at `:55-56`, before `ecs.add` at `:58`)
- Test: `frontend/tests/gates/light-spawn-gates.test.js`, `frontend/tests/e2e/block-light.spec.js` (test 4)

**Interfaces:**
- Consumes: `BLOCK_ID.lantern`, `EMITTER_LEVEL` (Unit 5), `HEARTH_EMITTERS` (Unit 3).
- Produces: `SPAWN_LIGHT_FLOOR = 8`; `lightBound(x, y, z, emitters): number` = max over emitters of
  `level - (|fx - ex| + |fy - ey| + |fz - ez|)`, floored at 0, with `f` the cell of the point;
  `hostileSpawnRefused(x, y, z, emitters): boolean` = `lightBound >= SPAWN_LIGHT_FLOOR`;
  `emittersFromWorld(worldBlocks, extra = HEARTH_EMITTERS): Array`, cached per `worldBlocks` identity in a `WeakMap`
  (every edit replaces the Map, `Terrain.jsx:961,1002`).
- `spawnMob`: `if (!forceType && !mobConfig.passive && hostileSpawnRefused(x, y + 1, z, emittersFromWorld(store.worldBlocks))) return false;`
  (the mob stands in the cell above the ground y). Authored spawns (`forceType`) are never filtered.

- [ ] **Step 1: Write the failing gate:**
  - `a lantern refuses every hostile spawn within its bright core and none beyond`: emitter `[0, 60, 0, 15]`, every
    integer cell with Manhattan distance <= 12: refused exactly when the distance is <= 7; assert both counts (the
    refused count is the number of lattice points within Manhattan 7 in 3D, 575, and the allowed count is > 0)
  - `the dark control: no emitters, nothing refused` (1,000 seeded points)
  - `the Hearth's own light counts` (a cell beside the forge emitter is refused)
  - `emittersFromWorld takes lanterns only, and is cached per worldBlocks identity` (`toBe` on the same Map; a new
    Map recomputes; stone entries ignored)
  - `a seeded spawner never places a hostile inside a lantern's core, with the player in the band`:
    `runSpawnPlacement` (the real distance band) with `playerX/Z` 40 m from a lantern ring, over candidate chunks that
    cover the ring, and a `trySpawn` that applies the rule to a forced-hostile pick. The output is 0 placed inside the
    core, more than 0 placed outside it, and more than 0 refused (the rule actually fired, so the band reaches the
    ring). Run it again with no emitters as the dark control: more than 0 placed where the core was.
  - `the rule's reach, stated: a player standing in the ring sees no refusal` (amendment 1). The same seeded run
    with the player AT the ring's centre gives 0 refused, because every candidate is at least 28 m away and the core
    reaches 7 cells. This pins the claim boundary, so a later edit that calls this rule a defence has to change
    this test.

- [ ] **Step 2: Run and see it fail.** `npx vitest run tests/gates/light-spawn-gates.test.js` -> unresolved import.

- [ ] **Step 3: Implement** `lightSpawn.js` (no seam token in it: it reads `worldBlocks`, never sets it) and the one
  line in `spawnMob`.

- [ ] **Step 4: Run and see it pass**, plus `npx vitest run tests/gates/voidhand-noremesh-gates.test.js tests/gates/elemancer-noremesh-gates.test.js`.

- [ ] **Step 5: Kill the mutants:**
  - S1 `>` for `>=` -> "bright core" RED (the distance-7 shell spawns)
  - S2 Euclidean distance -> "bright core" RED
  - S3 every non-air block counts as an emitter -> "lanterns only" RED
  - S4 the cache keyed by size instead of identity -> "cached per identity" RED
  - S5 plausible-wrong: the light bound read at the PLAYER's position instead of the spawn point -> "the rule's
    reach, stated" RED (with the player in the ring, every spawn is refused) and "with the player in the band" RED
    (nothing is refused)
  - S0 identity -> green

- [ ] **Step 6: Lived proof, e2e test 4** (CI): *the running game's `spawnMob` refuses a natural hostile at a lit
  point.* What this measures, said (amendment 1): it shows the rule is wired at the live call site. It does not show
  that any spawn the spawner would actually attempt is refused, because it calls `store.spawnMob` directly and so
  skips the 28-85 m band. The band is covered by the `runSpawnPlacement` cases in Step 1. Dev boot; place a
  lantern through `GameMethods.terrainVerbs.place` with a synthetic hit at a ground cell P (test 3 owns the real
  input); set night and `nightCount: 6` (a high hostile chance); call `store.spawnMob(x, z)` 40 times at points within
  Manhattan 5 of P and 40 times at a point 30 cells away, counting new hostiles through
  `window.__craftyTest.call('readMobs')`. Inside: 0. Outside: > 0 (the control; without it a broken spawner would
  pass). Precondition in the message: the ground probe returned a number at both points. Deleting the rule turns
  "inside" red.

- [ ] **Step 7: Commit.** `git commit -m "feat(spawn): no natural hostile spawn where lantern or Hearth light is 8 or more"`

**Cost:** GPU none; main thread at most 12 checks per spawner tick against a cached list; main chunk ~0.5 KB.

### Unit 7: Acceptance instruments, frames and the re-shoot

**Files:**
- Modify: `frontend/scripts/visual/_lookbook.mjs:18-23` (a `lantern-ring` place), `frontend/scripts/visual/lookbook.mjs`
  (lantern placement and the hitch read)
- Test: none new (instruments; every number they print goes into the commit body and `memory/CHANGELOG.md`)

- [ ] **Step 1: Targets and a `lantern-ring` place.** Add `chromium-1180x820` and `chromium-820x1180` (touch, as the
  WebKit pair) to `TARGETS` (`_lookbook.mjs:26-30`) so both engines are shot at both iPad viewports. Five lanterns on open ground east of the Hearth, one of them on a chunk
  border (local x 15 beside x 16, Review Focus 1), and the camera 20 m up and 12 m out, looking at the ring's centre.
  The probe places them in page context through `window.useGameStore.getState().terrainWorker.postMessage(...)` with
  `update_block` and `setWorldBlocks` (`window.useGameStore` is exposed in production, `src/index.jsx:62`), so no
  `src/` seam is added (a placement method in `lookbookSeam.js` would add a seam token to `Components.jsx`'s import
  closure and turn the no-remesh gates red).
- [ ] **Step 2: The hitch read (amendment 7).** The upside's criterion is absolute ("a hitch over 16 ms when placing
  a lantern"). The old `lanternMs <= stoneMs + 16` let a full extra frame through. Its stone control also sat in the
  lit ring, so it paid the same relight and cancelled it out. On each target, with a page-side
  `requestAnimationFrame` logger recording the longest frame gap in the 2 s after each placement, through the same
  `update_block` + `setWorldBlocks` path, read three numbers:
  - `lanternMs`: a lantern at cell C in the lantern-ring place (on this milestone's build);
  - `farStoneMs`: a stone block at a cell more than 14 from every emitter, on this build (the edit's cost with no
    relight);
  - `baseMs`: a stone block at the same cell C with the same pose, on the PRE-FEATURE production build (main before
    Unit 1, the same build Step 4's `gpu-cost-probe` "before" uses).
  Write `hitch: { lanternMs, farStoneMs, baseMs }` per target into `lookbook.json`. Criterion: `lanternMs - baseMs <=
  16` on `webkit-1180x820` and `webkit-820x1180`. `farStoneMs - baseMs` is stated beside it, as the light hook's
  cost on an ordinary edit. **Blind spot, stated in the acceptance:** macOS WebKit is not iPadOS WebKit
  (`scripts/visual/ipad-probe.mjs:20`: not the same GPU, memory ceiling or thermals). A pass here does not clear the
  iPad. Run `ipad-probe` on a real iPad whenever one is reachable, and until then the iPad half of the criterion is
  reported as NOT MEASURED, never as passed.
- [ ] **Step 3: Shoot.** `npm run build`, then `node scripts/visual/lookbook.mjs` (all three targets; it refuses a
  SwiftShader Chromium unless told otherwise), then `sh frontend/scripts/dev/kill-test-procs.sh`. Open every
  `hearth-*` and `lantern-ring-*` frame at 0.48, 0.55 and 0.75 by eye (see Acceptance).
- [ ] **Step 4: Cost.** `node scripts/visual/gpu-cost-probe.mjs` on the production build before (main before Unit 1)
  and after; record draw calls, tris, textures and programs. Run `node scripts/bench/block-light-bench.mjs --base
  <scratchpad>/lantern-base`. Run `npm run perf:m2` (`scripts/perf/run-scenarios.mjs`, the instrument the upside's
  kill criterion names) on the before and after builds, and record the five scenarios' frame medians and p95
  beside the bench (amendment 2). It measures frame time rather than remesh time, so it is the player-side check,
  and B1-B3 are the worker-side check.
- [ ] **Step 5: The capture oracle (amendment 9).** First re-derive the capture fractions on the main this lands
  on. Move 4's `captureCycle` sends each `isDay: false` capture state to 0.75 and lets a state declare its own
  fraction (light-colour plan `:543`). List every capture state whose fraction gives a terrain `uSunDir.y` below 0.1,
  where block light is non-zero; by that rule `explore-night` and `explore-night-low` are on the list. Those frames
  now show the Hearth's pools wherever the Hearth is in view, so they are EXPECTED to change: name them in the
  `Baseline-Review:` trailer as "block light, by design". Then run `npm run test:visual` once (manual; nothing else
  may hold port 4178). Expected: every day-fraction state has exactly 0 block light, so its Hearth frames differ only
  by re-triangulation noise inside the 6% gate; the HUD frames that show the hotbar change (a 10th slot); the listed
  night states change. If any frame is over the gate,
  re-shoot with `npm run visual:baseline` and commit the baselines ALONE with a `Baseline-Review:` trailer naming
  each frame and why, after Phase 0e's re-baseline, never with `frontend/src/` changes.
- [ ] **Step 6: Commit** the probe changes, then (separately, if needed) the baselines.
  `git commit -m "test(lookbook): a lantern ring on a chunk border and the place-hitch read, for the block-light acceptance"`

## Acceptance (lived proof)

The milestone is done when all of A-F hold. Gates green alone are not done.

**A. Lived proofs in the running game** (`frontend/tests/e2e/block-light.spec.js`, CI, SwiftShader, dev server):

| Test | What it shows in the running game | What deleting the feature turns red |
|---|---|---|
| 1 Hearth bake | the forge's level reaches the GPU vertex buffer (blue max exactly 15; a chunk out of reach reads 0) | the bake (no field passed): max 0 |
| 2 Forge pool | at cycle 0.75 a raycast-chosen TERRAIN cell by the forge (never the prop) is brighter with the term than without, at 0.30 it is not, and a far control never moves | the shader term (uniform absent, a named failure), the bake (A = B), a day floor (the 0.30 check) |
| 3 Real-touch lantern | select, place and break by real taps on a 1180x820 touch viewport, at a G at least 64 cells from the Hearth; the ground brightens at night, then every nearby chunk returns to its pre-placement snapshot, and the inventory round-trips | the emitter level, relight on break (stale light), the hotbar slot, the shader term |
| 4 Spawn refusal at the call site | 0 hostiles from 40 direct `spawnMob` calls inside the core; more than 0 from 40 at a dark control. It shows the rule is wired, NOT that it defends the player's position (the 28-85 m band is covered by the unit gate) | the rule |

Asked of each: *what would still pass if the feature were deleted?* None of the four: each measures a presence
against a control in the same run. What none of them can see is how it looks on a real GPU, on the iPad, with motion
on, which is B.

**B. Real-GPU, motion-on lookbook frames, opened by eye** (Unit 7; production build; Chromium on ANGLE-Metal, its
renderer string read from `lookbook.json`, at 1280x800, 1180x820 and 820x1180, and WebKit at 1180x820 and 820x1180;
the two Chromium iPad-sized targets are added to `TARGETS` in Unit 7 Step 1). Places `hearth` and `lantern-ring` at
cycles 0.30, 0.48, 0.55 and 0.75, set side by side with Phase 0d's `docs/superpowers/masterpiece-2026-10/evidence/before-*.jpg`
and saved beside them as `after-lantern-*.jpg`. The checklist, each answered in the commit body and
`memory/CHANGELOG.md`:
1. At 0.75 a warm pool reads around each lantern and under the forge and the lookout, from the hero distance.
2. The chunk-border lantern's pool continues across the border: no seam, no dark column.
3. The stepped rings read as designed (bold-flat), not as banding. If they read as banding, that is this session's
   call under the mandate: record the finding and the chosen response (keep, or drop levels 1-2 from the key) in
   DECISIONS.md (amendment 14).
4. At 0.30 no pool is visible, and the lantern's flame is still lit with no bloom halo around it (amendment 13).
5. Through 0.48 and 0.55 the pools kindle; the flame blooms at night only (move 4's threshold is a precondition of
   Unit 5).
6. iPad portrait (WebKit 820x1180, low tier) shows the same pools and no new colour cast (the navy pad in the before
   frames is move 4's to fix; this milestone must not add another).
7. The forge-fire prop and its pool coincide (shared `glow` data).

**C. Numbers held** (from Unit 3's bench, Unit 7's probes and every unit's build):
- Quads: the 10-seed fixture total unchanged at 2,356 (no emitter). On `realChunk` (Unit 2's gate), absolute quads
  added are at most 300 per lantern, 650 for the dense base and 300 on the flat slab, with the Hearth pad's bound
  recorded. On WORKER chunks (Unit 3's B4), at most +25% per chunk and at most +10% per 3x3 for the dense base. The
  Hearth's growth is recorded: +368 quads, +0.34% of the 7x7, worst chunk +10.7% (re-measured 2026-10-27 with the
  designed two emitters).
- Worker time, each against the FROZEN pre-Unit-1 tree (Unit 3 B1-B3): boot stream and unlit remesh at most +10%;
  lit remesh at most +10%, or else recorded as kill evidence with a decision in DECISIONS.md; `lightOnly`
  payloads at boot at most 6; `computeChunkLight` p95 at most 5 ms per lantern. `perf:m2` before and after recorded.
- Hitch: `lanternMs - baseMs <= 16` on both WebKit targets, with `farStoneMs - baseMs` stated. On iPadOS it is NOT
  MEASURED until a real iPad run exists.
- GPU: `gpu-cost-probe` at the hearth pose: programs unchanged, textures +1, tris within +2%.
- Bytes: `index` at most 760,000 after every unit; the per-unit deltas (estimated ~5.3 KB in all) and the worker
  chunk's growth recorded in each commit body.

**D. i18n:** `item.lantern` has en `Lantern` and zh-CN `灯笼`, shown through `t()` in the hotbar title, the build
panel's selected-block name and the crafting label; `tests/i18n` (coverage, key resolution, adoption) green.

**E. Touch and iPad performability:** the lantern's three verbs (select by tapping the hotbar, place with the cast
button, break with the action button) are proven by e2e test 3 on a touch viewport; the 10-slot hotbar fits a 375 px
phone at scale 0.5 (712 x 0.5 = 356 px) and `hud-layout.spec.js` stays green in CI.

**F. Game-Loop Isolation:** no new `useFrame` and no zustand subscription in per-frame code. The LUT is a static
texture; `uSunDir` is already written from a ref; the worker reaches React only through the existing `chunk_mesh` ->
`setChunks` message path; the spawn rule reads `getState()`. No emoji in `src/`.

## Verification gates

At the end of the milestone, from `<repo>/frontend`, each re-run fresh (never a remembered result):

```bash
npx vitest run tests/gates/block-light-field-gates.test.js tests/gates/mesher-light-key-gates.test.js \
  tests/gates/relight-gates.test.js tests/gates/block-light-lut-gates.test.js tests/gates/light-spawn-gates.test.js \
  tests/world/blockLightSources.test.js tests/world/proceduralTextures.test.js
# Expected: all PASS
npx vitest run tests/gates/mesher-merge-key-gates.test.js tests/gates/mesher-geometry-gates.test.js \
  tests/gates/ocean-mesher-no-water-faces.test.js tests/gates/block-id-gates.test.js tests/gates/grass-revival-gates.test.js \
  tests/gates/voidhand-noremesh-gates.test.js tests/gates/elemancer-noremesh-gates.test.js \
  tests/gates/recipe-output-usable.test.js tests/store/startingLoadout.test.js tests/i18n
# Expected: all PASS, unchanged (2,356 quads; exactly two columnTops calls in the worker; one seam owner)
npm run test:unit                      # Expected: the suite total printed, 0 failed
npm run lint                           # Expected: 0 errors (no-unused-vars is an error)
node scripts/ci/gate-shape.mjs         # Expected: PASS; the source-grep population does not rise
node scripts/ci/killability-ledger.mjs # Expected: PASS; every new gate file states what makes it fail
node scripts/ci/cli-guard.mjs          # Expected: PASS; the bench exports nothing
node scripts/ci/opsec-scan.mjs --all   # Expected: PASS
npm run build && node scripts/ci/bundle-budget.mjs   # Expected: index <= 760,000; record the delta
```

Then CI on the pushed range: e2e green, including `block-light.spec.js` (4 tests) and the specs this touches
(`build-placement`, `touch-controls`, `hud-layout`, `save-load`, `world-rebuild-after-load`, `soft-death-protections`),
plus `knip`, `prod-smoke` and `npm audit`. Review: a fresh headless `/code-review xhigh` per change range, and one
adversarial reviewer (`adversarial-reviewer-kz`, Opus 5.5, effort xhigh, per Crafty's standing rule) pointed at the
worker/main relight seam (Unit 3), the one place gates cannot see a cross-thread ordering bug. Finally the Verify
Gate (`/plan-verify-kz`) against `memory/ACTIVE_PLAN.md`.

## Risks

1. **Stale or missing light across chunks** (the classic voxel-lighting bug). Guarded by Unit 3's break, border,
   late-generation and reload cases and e2e test 3's break. Residual: an ordering bug between a full payload and a
   later `lightOnly` one; the reviewer on the relight seam is pointed at it.
2. **Main-thread hitch on the iPad.** The own chunk's re-mesh rebuilds its collider, as every block edit does today;
   neighbours keep theirs (`lightOnly`). If the hitch criterion fails, the next lever is posting light-only re-meshes
   one chunk per tick. The instrument is macOS WebKit, so an iPadOS hitch stays unmeasured until a real iPad run
   (amendment 7).
3. **Quad growth past budget** for a player who carpets a chunk with lanterns 2 cells apart, or who builds a flat
   floor: a flat floor adds about +254 quads per lantern (the slab, 6 -> 260), the worst case per lantern.
   `realChunk` gates bound the absolute count, and the worker-chunk bench checks the relative kill criterion
   (amendment 3). The unbuilt lever: drop levels 1-2 from the key (they contribute under 7% brightness).
4. **Stepped light may read as banding** on the iPad (Default 4; acceptance B3 decides and records).
5. **Before move 4 lands the night is maroon** (Phase 0d's frames), so pools read weakly; acceptance B waits for
   move 4.
6. **`uSunDir` must stay the SUN.** Move 4 hands the directional light to the moon at night but keeps `sunDirRef` the
   sun's (refute F5). If a later change points the terrain's `uSunDir` at the moon, the night row inverts and the
   pools vanish; e2e test 2's night check is the tripwire.
7. **Light passes through the Hearth's props** (they are not voxels), so the forge lights ground behind its own
   walls. Accepted.
8. **Block light lights terrain only**: a mob or the player standing in a pool is not warmed. A visible
   inconsistency at night; follow-up below.
9. **The one-way door:** a save holding id 16 cannot render on a rolled-back build; removing the lantern later needs a
   migration through `SAVE_VERSION` (`src/game/saveSchema.js:10`).
10. **The spawn rule over-refuses** behind walls near a lantern (it uses the open-air bound). Accepted and stated in
    the rule's header. **It also does not defend a base the player stands in** (amendment 1). A player who rings a
    base with lanterns and stays in it at night sees mobs walk in exactly as before. This milestone does not claim
    otherwise, and the umbrella's "a base the player lit holding back the siege" (roadmap `:202`) is move 10's to
    deliver.
11. **Capture re-shoot collision:** the 10th hotbar slot changes every HUD capture frame; sequence the re-shoot after
    Phase 0e's re-baseline so the two do not collide, and keep it a commit of its own.
12. **Line numbers drift** when Phase 0b and 0d merge (both touch `Terrain.jsx` and `Components.jsx`): the cites
    here are main at `f0e84766`; re-locate each splice by its anchor string (`'#include <lights_fragment_end>'`,
    `'#include <emissivemap_fragment>'`, `vBiome = color.g;`) before editing.
13. **Lit remesh over +10%** (amendment 2). The prototype BFS (1.4-2.8 ms) against a 4.54 ms mesh makes it likely.
    It is kill evidence under upside `:142` and is recorded, never tuned away. The levers are listed in Unit 3
    Step 7.
14. **Boot relights** (amendment 8). Without coalescing, 10 `lightOnly` re-meshes happen at boot (+40% of chunk
    messages at the low tier). The 3x3-complete rule and `flushIdle` hold it to at most 6; Unit 3's boot test and the
    bench's B1 pin it.
15. **Phase order** (amendments 9, 13 and 14). Unit 5 needs moves 4 and 9 on main, and Unit 7's capture list needs
    move 4. If Phase 3 starts before them, Units 1-4 proceed and Units 5-7 wait (Unit 6 consumes Unit 5's id).

## Out of scope

- **Sky light** (refute F13: a later step with its own quad budget). This milestone does NOT make caves, overhangs or
  interiors darker than open ground; that is what sky light does.
- Smooth per-vertex light; coloured emitters (every source is ember); torches, wall-mounted or non-cube lanterns; a
  held or thrown lantern (dynamic light).
- Lighting mobs, the player or props from the field.
- The siege director targeting lit bases (move 10); shrine beams as emitters (move 14 passes them through
  `extraEmitters`); the dragon's arena (move 13).
- **Light as a defence (amendment 1), handed to move 10.** That means light acting where mobs are: hostiles refuse
  entry to, or drop aggro inside, light >= 8 at night, or siege waves break against a lit ring. Its gate is upside
  kill criterion 5: a seeded night simulation with the player AT a lantern-ringed base, plus a dark-base control,
  that is neither degenerate (zero contact all night) nor pointless (waves always break through). This plan exports
  `lightBound` and `emittersFromWorld` for it. The siege plan already takes over the spawn rule and the lantern
  anchors (`2026-10-27-crafty-encounters-siege.md:544-547`, Unit 2b); the hand-off note goes to its owner when this
  plan lands.
- Retiring the brazier's point light (Phase 0g's pool; Default 3); a mood driver for `uBlockLightGain` (the
  boss sky; the uniform is the hook).
- The starting loadout, the bloom threshold and the night palette (move 4).

## Defaults decided (amendment 14: recorded in DECISIONS.md by Unit 5 Step 8a, not left as questions)

Under Kevin's 2026-10-27 mandate (`DECISIONS.md:87-88`), each item below is a decision this session takes and records,
with its reversal path. Nobody is waiting on an answer. The text keeps the question form only to show what was
weighed.

1. **The hotbar:** a 10th slot with the phone scale at 0.5 (default), or the lantern replaces an existing slot?
2. **The recipe:** 1 glass + 1 coal makes 1 lantern (default; reachable on turn 1, up to 8 from the loadout). Dearer,
   or named in the first night's onboarding (the first-minute plan)?
3. **The brazier's point light:** retire it for a block-light emitter at (2, 52, 2)? It removes a dynamic light from
   every lit material but stops lighting the lodge prop. Phase 0g decides.
4. **Stepped or smooth light:** stepped is the default. If the lookbook rings read as banding (acceptance B3, judged
   by this session and recorded), smooth light needs a 64-bit key (a `Float64Array` mask or a second `Uint32Array`)
   and far more quads.
5. **Exactly zero by day:** the default keeps warmth for the night and the DAY capture frames' block-light term at 0
   (after move 4 the night capture states show it, by design: Unit 7 Step 5). A faint day floor would let a lantern
   read in a cave at noon; revisit with sky light, which is what darkens a cave.
6. **The ember colour** `#FFB066` lives in `blockLightLut.js`; should it join `theme/tokens.js` `MAGIC`, the declared
   list of bloom sources?

## Review amendments (2026-10-27)

**Source:** one adversarial review of this plan, 15 findings. I treated each verdict as a hypothesis and re-derived
it against the code on main (`c03e9f2f`) and the sibling plans before changing anything. Where the review asked for a
repro, I ran it with quad counts only, which are deterministic; the load average was about 259, so no times were
taken. Two scratch prototypes were used:
- A copy of `mesher.js` with the level at bit 26, plus a Map-based BFS, over `realChunk`.
- The REAL `terrain.worker.js`, imported in Node under a `self` stub. This reproduces the 182,869-quad box exactly.
Their numbers are in "Re-measured for the review amendments" above. Unit 3's bench rebuilds and commits the method.

**Result: 15 applied, 0 rejected.** The review was right on all 15. On five of them the re-derivation changed the
detail:
- Finding 1: I took the "drop the claim" branch, and kept the rule unflagged.
- Finding 3: the repro is now done.
- Finding 8: the count is now measured.
- Finding 9: upgraded from PLAUSIBLE to CONFIRMED.
- Finding 10: the cost is re-measured.

| # | Sev | Finding (short) | Re-derived | Disposition and where |
|---|---|---|---|---|
| 1 | HIGH | The spawn rule cannot defend a base the player stands in; e2e 4 skips the 28-85 m band | CONFIRMED (`spawnPlacement.js:28`; boot ring 30-50 m, `SpawnerSystem.jsx:96-103`; core = Manhattan 7). The siege plan, the only consumer, also places its waves inside the same [28, 85] m player band and [minD, maxD] from the objective (`encounters-siege.md:266-275`), keeps this rule as a spawn filter (`:544-547`), and adds no light that acts on mobs | **Applied.** The defence claim is removed from the Goal, D6, Decision 10 and Unit 6's title and scope. Unit 6 Step 1 adds a `runSpawnPlacement` case with the player in the band (placed inside 0, outside > 0, refused > 0, plus a dark control) and a scope pin (the player in the ring: 0 refused), with mutant S5. e2e 4 now says it shows wiring, not defence. The defence is handed to move 10 under upside criterion 5, run with the player AT the lit base plus a dark-base control (Out of scope; Risk 10). The rule is kept unflagged rather than flagged off: it is correct, cheap, and does something real (lit outposts the player is away from, and the siege anchors), and a flag would be dead code. |
| 2 | HIGH | The +10% remesh check compares the new code's null path with itself and cannot fail | CONFIRMED (`light = null` default; Unit 2 edits `mesher.js` in place; `realChunk` lacks caves and trees) | **Applied.** The baseline is the FROZEN pre-Unit-1 tree, from a detached worktree at BASE. The bench drives each side's REAL worker under a `self` stub, alternating calls, on worker-shaped chunks: B1 boot, B2 unlit remesh, B3 lit remesh with the neighbour re-meshes stated separately, B4 quads. A lit remesh over +10% is kill evidence, recorded in DECISIONS.md with a lever, never tuned away. `perf:m2` runs before and after (Unit 7 Step 4). Global Constraints, Unit 3 Step 7, Acceptance C and Risk 13. |
| 3 | MED | The quad bounds are gated on `realChunk` (238 per chunk) but were measured on worker chunks (2,258 per chunk); one lantern likely breaks the 3x3 bound | CONFIRMED, **repro run**. One lantern on a `realChunk` 3x3 adds +212 / +252 / +217 quads, which is +9.9% / +11.7% / +10.1%; the border lantern breaks +10%. The worst chunk is +44% to +112%, against a +25% bound. The dense base is +24.9%, worst chunk +101.6%. The same lanterns on worker chunks give +0.9% to +1.3% per 3x3 and +3.6% to +5.7% worst chunk | **Applied.** Unit 2's gate bounds ABSOLUTE quads added on the fixture they were measured on (each lantern <= 300, dense base <= 650, flat slab <= 300, Hearth pad recorded + 15%), with mutant M13. The relative kill criterion moves to worker chunks (bench B4). The flat floor is budgeted (Risk 3). The measuring script is committed (bench). |
| 4 | MED | Unit 5's e2e cannot go green: `touch-controls.spec.js:133` needs exactly 9 slots, and G about 20 cells from the Hearth sits in permanently lit chunks | CONFIRMED (`toBe(9)` at 390 px; G near (11,12) or (-10,-8), and 5x5 chunks around it include the forge's (0,-1), whose max is 15) | **Applied.** The spec joins Unit 5's Files and Step 3: it counts `HOTBAR_BLOCKS.length` and keeps the off-screen check (mutant K7). In e2e 3, G is at least 64 cells from both emitters, every chunk within 2 of G is snapshotted before placement (asserted 0), and the break returns each to its snapshot. |
| 5 | MED | e2e 2 samples a cell under the forge prop | CONFIRMED geometry: (10.5, -7.5) maps to about (0.27, 0.66) in the forge frame, inside half-extents (1.7, 1.5); the base cube spans y 51.5-52.3 over the terrain top at 52, and the fire glow is in the same box. The red CI outcome follows from Risk 8 (light reaches terrain only) | **Applied.** The cell is chosen by a raycast from the posed camera that must hit a chunk mesh, at least 3 cells off the footprint, with `colors.b >= 9`. The hit name goes into every failure message. Unit 4 Step 7, Acceptance A2. |
| 6 | MED | No test evicts and regenerates an emitter chunk; `evict` dropping the emitter index passes every listed test | CONFIRMED gap (unload deletes only `chunks` and `biomeChunks`, `terrain.worker.js:165-169`; mods replay at `:605-612`; `cullDist` evicts in ordinary travel) | **Applied.** Rule pinned: the emitter index mirrors `chunkModifications` and survives `evict`, and only `setModifications` and `noteEdit` change it. New test "an evicted emitter chunk comes back lit", mutant R9, Review Focus 6. |
| 7 | MED | The hitch criterion is weakened: relative (+16 over stone), the stone control in the ring cancels the relight, measured on macOS WebKit | CONFIRMED against upside `:142` and `ipad-probe.mjs:20` | **Applied.** The criterion is `lanternMs - baseMs <= 16`, with `baseMs` taken at the same cell and pose on the pre-feature build. `farStoneMs` (more than 14 from every emitter) is stated as the hook's cost. The iPadOS half is reported as NOT MEASURED until a real iPad run. Unit 7 Step 2, Global Constraints, Acceptance C, Risk 2. |
| 8 | MED | An unstated boot relight cascade that every player pays | CONFIRMED mechanism (`Terrain.jsx:797-807` order, `:688-691` and `:661-666` per message). **Count measured** with the prototype in that order: 10 `lightOnly` re-meshes on 6 chunks at R = 2 (+40% messages) and R = 4 (+12%) | **Applied.** Decision 5 adds boot coalescing: generate-dirty chunks flush once their 3x3 is loaded, and `flushIdle` runs 300 ms after the last generate, so there are at most 6. New test "the boot stream relights each Hearth chunk at most once" (R11), bench B1, cost stated in D3 and Unit 3, Review Focus 7, Risk 14. |
| 9 | LOW | "Block light exactly 0 in every capture frame" rests on the noon pin, which move 4 changes | CONFIRMED, and stronger than PLAUSIBLE: the light-colour plan's `captureCycle` sends every `isDay: false` capture to 0.75 (`:543`, `:568`), so `explore-night` and `explore-night-low` will show the pools | **Applied.** "The sun" in Current state is corrected. Unit 7 Step 5 re-derives the fractions after move 4, lists the states below sunY 0.1, and names them in `Baseline-Review:` as changed by design. Default 5 is reworded. |
| 10 | LOW | The Hearth cost was measured with the brazier the design drops | CONFIRMED. **Re-measured** on real worker chunks with forge 15 and lookout 13 only: +368 quads (+736 tris), 6 chunks, worst (0,-1) +10.7%, +0.34% of the 7x7 (with the brazier: +580) | **Applied.** Unit 3's cost, D3 and Acceptance C restated. Bench B4 records the committed number. |
| 11 | LOW | The 16 LUT rows span -1..1, but the sun only reaches about +/-0.57, so dusk gets about 2 rows and the twin returns up to about 6% where `nightFactor` is 0 | CONFIRMED arithmetic: row centres 0.0625 -> 0.061 and 0.1875 -> 0, so sunY 0.1 reads about 0.043 | **Applied.** v maps [-0.675, 0.125]; the top row's centre is exactly `SUN_UP` (0.1); dusk gets 6 row centres; the interpolation error is at most 0.03. The twin is tested every 0.005 between row centres within 0.035; the zero test includes 0.1 and the three moods' noon heights; mutant L6. Decision 7, Unit 4 interfaces and tests. |
| 12 | LOW | R8 is attributed to the wrong test; a frozen `HEARTH_EMITTERS` cannot see a correct typed copy | CONFIRMED (frozen at load; the typed wrong cell reddens the equality test) | **Applied.** The live-derivation test uses `vi.resetModules` + `vi.doMock(hubLayout)` with a moved glow and re-imports. R8 is redefined as the CORRECT typed literal (red only on that test); the wrong cell is now R8b (the equality test). |
| 13 | LOW | On today's 0.65 bloom threshold the day flame (0.7) blooms, and Unit 5 may land before move 4 | CONFIRMED threshold (`GameScene.jsx:121`); the bloom itself is PLAUSIBLE, since sunlit albedo adds to the luminance | **Applied.** Move 4 is a hard precondition of Unit 5. The flame is bounded against the imported `BLOOM_THRESHOLD`: night peak >= 1.2x (move 4's meant-source rule), day peak <= 0.5x; day is set to 0.45 (mutant K6). Acceptance B4 checks no halo at 0.30. |
| 14 | LOW | Non-routine choices are recorded only in commit messages and in questions to Kevin; move 9 is missing from Depends on | CONFIRMED (`DECISIONS.md:87-88`; `proceduralTextures.test.js:6-10`; roadmap `:201`) | **Applied.** Unit 5 Step 8a writes one dated DECISIONS.md entry covering ids, hotbar, stepped and zero-by-day light, layer count, recipe, brazier, ember colour and the spawn-rule scope. "Open questions" becomes "Defaults decided". The test header is reworded to cite the entry. Move 9 is a precondition: the tile is authored in its tone grammar, the layer arithmetic is 19 -> 20, and the flame keys on the block type, not the sampled layer. |
| 15 | LOW | `mergeChunkMesh` inserts a `lightOnly` with no prev, which brings back a culled chunk in the unload race | CONFIRMED by code (`Terrain.jsx:852-854` posts the unload and deletes together; messages are in order). The plan's save-load rationale was wrong, as the review says | **Applied.** A `lightOnly` with no prev is dropped (returns `null`; the reducer keeps state). Decision 6, Unit 3 interface and glue, test case, mutant R10. |

**What I could not check, stated:** the e2e outcomes, real-GPU frames and on-disk bundle bytes. I wrote no code
beyond scratch prototypes, so findings 4, 5 and 13 rest on the code reading above, not on a run. The lit-remesh time
(finding 2, B3) is unmeasured because the machine was at load about 259. The plan now treats an over-bound reading
as kill evidence to record. The quad and relight counts are from a Map-based prototype BFS, which is exact for the
open-air rule but is not Unit 1's typed-array BFS. Unit 2's gate and Unit 3's bench re-measure them on the real
implementation. Whether further defects exist in this plan is not mine to assert. These 15 are the ones the review
reached, and all 15 hold.
