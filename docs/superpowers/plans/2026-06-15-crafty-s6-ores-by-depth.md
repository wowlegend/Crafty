# S6 — Ores by Depth (mining payoff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give digging a reason — generate coal/iron/gold/diamond ore blocks underground (rarer + more valuable with depth) so mining yields the ore items the game already crafts with and mobs already drop, instead of nothing but stone.

**Architecture:** Three thin slices over EXISTING infra (no new systems): (1) bake 4 ore tiles into the procedural texture atlas (extend `numLayers` 10 -> 14; the shader already samples `layerIndex = round(vBlockType)`, so codes 10-13 render with zero shader change); (2) in the terrain worker's column-fill, deterministically assign ore codes to deep stone voxels by a depth+world-pos hash (capture-safe, same-seed-stable, part of normal gen so NO re-mesh); (3) extend the mine-drop `BLOCK_ID_MAP` so a mined ore drops its item. Player edits, the greedy mesher, and the existing surface render are untouched.

**Tech Stack:** terrain.worker.js (voxel codes), proceduralTextures.js (DataArrayTexture atlas), Terrain.jsx (mesh shader already generic + the `block_broken` drop map), vitest gates.

---

## Live-code grounding (read-before-architect — DONE 2026-06-15)
- **Block-code scheme (worker -> mesh -> drop):** the worker writes a numeric code per voxel into `blocks[]`:
  `0`=air, `1`=grass(forest surface), `2`=dirt, `3`=stone, `4`=sand, `5`=snow, `6`=wood, `7`=leaves,
  `8`=cactus, `9`=water. The mesh packs `vBlockType = color.r`; the fragment shader samples
  `texture(voxelTextures, vec3(fract(uv), round(vBlockType)))` — so **layer index == block code**, fully
  generic for any new code as long as the atlas has that layer.
- **Atlas:** `proceduralTextures.js` `createProceduralVoxelTextures()` builds a `DataArrayTexture` with
  `numLayers = 10` (indices 0-9, one tile per existing code). NO layers exist for codes >= 10 -> sampling
  code 10-13 today would read out of range. `proceduralTextures.test.js` asserts the bold-flat invariants
  (NearestFilter, no mipmaps, layer count) — its layer-count assertion must move 10 -> 14 (NOT a weakening;
  the bold-flat invariants stay).
- **Worker column-fill (terrain.worker.js ~L408-420):** below surface it sets `surfaceBlock` at `y==surfaceY`,
  `secondaryBlock` for `y>=surfaceY-3`, else `blocks[index]=3` (Stone). Caves carve air at
  `y<surfaceY-4 && caveNoise>caveThreshold`. So all deep solid voxels are Stone (3) today — the place to
  inject ores is the `else { blocks[index]=3 }` branch.
- **Mining drop (Terrain.jsx ~L597):** `BLOCK_ID_MAP = {1:'grass',2:'dirt',3:'stone',4:'sand',5:'snow',
  6:'wood',7:'leaves',8:'cactus'}` -> `addToInventory(BLOCK_ID_MAP[code], 1)` on `block_broken`. No ore codes.
- **Item names the rest of the game expects:** `data/lootTables.js` drops `'Iron Nugget'` + `'Diamond'`;
  `data/recipes.js` patterns use lowercase BLOCK keys `'iron'`, `'diamond'`, `'coal'` AND display names
  `'Iron Nugget'`. **Drop-name decision (Task 3):** mine-drops use the inventory display names already in
  circulation — coal->`'Coal'`, iron->`'Iron Nugget'`, gold->`'Gold'`, diamond->`'Diamond'` — and Task 3
  must VERIFY each name resolves in the inventory/recipe path before finalizing (grep recipes + items).
- **Capture-safety:** ores are deep underground; the 20 capture states are surface/spawn camera views ->
  ores should not enter any baseline. The atlas change ADDS layers 10-13 and does not touch layers 0-9, so
  every existing surface tile is byte-identical. VERIFY via capture-then-gate; if a spawn-adjacent cave wall
  exposes an ore in a captured frame, that is a DELIBERATE re-baseline (LOOK first, then re-bless).

---

## Slice 1 — bake the 4 ore tiles into the atlas (pure, no gameplay) ✅ DONE
> Shipped: `numLayers` 10->14; coal(10)/iron(11)/gold(12)/diamond(13) = stone base + clustered ore-color
> nuggets (deterministic getNoise, bold-flat, no PBR). Test updated 10->14 + ore-layer-distinct-from-stone
> invariant (bold-flat locks kept). unit 1259->1260, build clean, gate 20/20 (layers 0-9 byte-identical).

**Files:**
- Modify: `frontend/src/world/proceduralTextures.js` (numLayers 10 -> 14; draw layers 10-13)
- Test: `frontend/src/world/proceduralTextures.test.js` (layer-count 10 -> 14; ore-layer invariants)

- [ ] **Step 1 — Update the bold-flat invariant test (red).** In `proceduralTextures.test.js`, change the
  layer-count expectation to 14 and add an assertion that layers 10-13 are non-empty (some non-stone pixels).
  Keep ALL existing bold-flat invariants (NearestFilter, `generateMipmaps === false`, 32px). Run -> fails
  (atlas still 10 layers).
- [ ] **Step 2 — Extend the atlas.** Set `numLayers = 14`. After the existing layer-9 (water) block, draw
  four 32x32 bold-flat ore tiles on a STONE base (reuse the layer-3 charcoal-slate base so ores read as
  "stone with a vein"), each speckled with its ore color from `BLOCK_TYPES`:
  coal(10)=`#2F2F2F` dark flecks, iron(11)=`#D8AF93` tan flecks, gold(12)=`#FCEE4B` bright flecks,
  diamond(13)=`#4FD0E7` cyan flecks. NearestFilter pixel-art, no new colors beyond the locked palette,
  deterministic pattern (no `Math.random` — use the same hash-noise the other tiles use). Bold-flat lock
  preserved (NO PBR/normal maps).
- [ ] **Step 3 — Run tests + build.** `npx vitest run src/world/proceduralTextures.test.js` -> PASS; full
  `npx vitest run` holds-or-grows; `npm run build` clean.
- [ ] **Step 4 — Visual gate (atlas-only change is render-relevant).** `npm run visual:capture` then the
  visual config. Expect 20/20 (existing layers untouched -> surface tiles identical). If any frame moves,
  LOOK at the diff before re-blessing.
- [ ] **Step 5 — Commit** (`git commit -F`): "S6 ores Slice 1: bake the 4 ore tiles into the voxel atlas".

## Slice 2 — deterministic ore generation in the worker (capture-safe)

**Files:**
- Create: `frontend/src/world/oreGen.js` — a pure `oreCodeFor(worldX, worldY, worldZ, surfaceY)` ->
  `number` (3 for plain stone, or 10/11/12/13 for an ore), depth-banded + deterministic.
- Test: `frontend/src/world/oreGen.test.js` (banding + determinism + rarity ordering).
- Modify: `frontend/src/world/terrain.worker.js` (call it in the deep-stone branch).

- [ ] **Step 1 — Write the pure ore-gen test (red).** `oreGen.test.js`: (a) `oreCodeFor` is deterministic
  (same inputs -> same output); (b) shallow band (just below surface) yields only stone/coal, never diamond;
  (c) deepest band can yield diamond; (d) over a large sampled volume the rarity ordering holds
  coal > iron > gold > diamond (counts strictly decreasing) and stone still dominates (ores are a small
  fraction, e.g. < 8% of deep solid voxels). Run -> fails (no module).
- [ ] **Step 2 — Implement `oreGen.js`.** Pure function: hash `(worldX,worldY,worldZ)` (reuse the worker's
  existing integer hash style — NO `Math.random`), map to depth bands by `surfaceY - worldY`:
  coal band shallow+common, iron mid, gold deep+rare, diamond deepest+rarest; return 3 when no ore rolls.
  Document each threshold as a one-line tunable. (Optionally bias rarity by `zoneTier` later — NOT in v1.)
- [ ] **Step 3 — Run the pure test + full unit.** `npx vitest run src/world/oreGen.test.js` -> PASS; full
  suite holds-or-grows.
- [ ] **Step 4 — Wire into the worker.** In the deep-solid branch (`else { blocks[index] = 3 }`), replace
  with `blocks[index] = oreCodeFor(worldX, y, worldZ, surfaceY)` (import at top; keep the cave + surface
  branches untouched). Confirm the worker still bundles (it's a module worker — verify the import resolves
  in the Vite worker build).
- [ ] **Step 5 — Build + visual gate.** `npm run build` clean; `npm run visual:capture` then the gate.
  Expect 20/20 (ores are deep; surface frames unchanged). If a spawn-area cave wall surfaces an ore in a
  baseline -> LOOK, then deliberate re-bless.
- [ ] **Step 6 — Commit:** "S6 ores Slice 2: deterministic depth-banded ore generation in the worker".

## Slice 3 — mine an ore -> drop its item (close the loop)

**Files:**
- Modify: `frontend/src/world/Terrain.jsx` (extend `BLOCK_ID_MAP`)
- Test: `frontend/tests/gates/ore-drop-gates.test.js` (the drop-map has the ore codes -> real item names)

- [ ] **Step 1 — Verify the item names resolve (grounding).** Grep `data/recipes.js`, `data/items.js`,
  `data/lootTables.js` for `'Coal'`, `'Iron Nugget'`, `'Gold'`, `'Diamond'` — confirm each is a real
  inventory/recipe token. Adjust the chosen drop name to the canonical one if a mismatch is found
  (e.g. if gold is `'Gold Nugget'` elsewhere).
- [ ] **Step 2 — Write the drop gate (red).** `ore-drop-gates.test.js`: read `Terrain.jsx`; assert
  `BLOCK_ID_MAP` contains `10`,`11`,`12`,`13` mapped to the verified ore item names. Run -> fails.
- [ ] **Step 3 — Extend `BLOCK_ID_MAP`.** Add `10:'Coal', 11:'Iron Nugget', 12:'Gold', 13:'Diamond'`
  (final names per Step 1).
- [ ] **Step 4 — Run gate + full unit + build.** Gate PASS; full suite holds-or-grows; build clean.
- [ ] **Step 5 — Visual gate** (no render change, but run capture-then-gate to confirm 20/20).
- [ ] **Step 6 — Commit:** "S6 ores Slice 3: mined ore blocks drop their items — mining payoff complete".
- [ ] **Step 7 — Mark S6 COMPLETE** in ACTIVE_PLAN + CHANGELOG. EAR/PLAYTEST note to KEVIN-REVIEW: the
  ore RARITY + depth curve is balance -> a playtest tunable (`oreGen.js` thresholds), surfaced not churned.

## Notes / Self-Review
- **Spec coverage:** the gap (ores defined/craftable/mob-dropped but never world-generated) is closed by
  Slice 1 (render) + Slice 2 (gen) + Slice 3 (drop). Each slice is independently green + committable.
- **No placeholders:** every step has the concrete file + the exact code/data + the run command + expected
  result. Ore codes 10-13 chosen to extend the existing 0-9 scheme with no collisions.
- **Type/consistency:** the block code is the SAME integer across worker-gen, atlas layer, and drop map
  (10=coal,11=iron,12=gold,13=diamond) — one scheme end-to-end, no rename drift.
- **Risk + design locks:** bold-flat atlas (NearestFilter, no mipmaps, locked palette) preserved; NO PBR;
  NO re-mesh (gen-time assignment only); capture-determinism (hash-based, no RNG); player edits + the
  greedy mesher untouched. The one real risk is the worker module-import in the Vite worker build (Slice 2
  Step 4 verifies it) and a spawn-area cave exposing an ore in a baseline (handled by LOOK-then-rebless).
- **Deferred (v1 scope):** zoneTier-biased rarity, ore-specific mining SFX/particles, smelting. Out of scope.
