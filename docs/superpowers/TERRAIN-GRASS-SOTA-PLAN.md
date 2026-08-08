# Terrain + Grass SOTA plan (2026-08-05) — the ranked queue

> **COMMITTED because the loop depends on it across sessions.** It was produced into a session-scoped
> tmp scratchpad, which is precisely where `scratchpad/findings.json` lived before it was lost — the
> lesson recorded in ACTIVE_PLAN's Phase-1 block. The kernel prompt cited the tmp path, so a cold start
> would have found nothing.
>
> Produced by a 12-agent review (4 code readers + 3 SOTA research lanes -> design -> 3 adversarial
> lenses -> synthesis). **Every line is a T3 hypothesis** — open the cited file before building. Four
> cites have already proved wrong: `cornerAO:31` (actually :7), "-Y matches" (it is transposed too),
> S5's framing implied the mask fill was load-bearing (it is fully redundant), and S4's flip condition
> (see the STATUS note).
>
> **STATUS:** S1 `71c24ca` DONE - S3 `d676069` DONE - S5 `03c4297` DONE - S6 `869f71e` DONE -
> S7 `34f11b0` DONE - S8 `947748f` DONE - S4 DEFERRED - **S9 next**.
> This line read "S6 next" while S6 and S7 had both already shipped, which is the failure the whole
> repo keeps paying for: a status sentence nobody recomputes. Read the shas, not the adjective.
>
> **S9 carries two things S8 deliberately did not spend.** (a) The grass COLOUR — S8's tint is a
> multiplier centred on 1.0 (asserted), so the palette decision is still open and S9 owes Kevin a
> 3-swatch ladder at `explore-day` + `explore-night`. (b) S8's ground-probe control measured
> **8,109 pixels brighter to 1,542 darker**, i.e. per-instance variation made MORE tufts visible, not
> fewer — the opposite of what spreading yaw predicts. If the leading explanation (self-occlusion at a
> shared yaw on an exact lattice) holds, effective density rose and the `cap = 50` in
> `world/grassField.js` may want re-tuning DOWN once S9's lighting lands. Hypothesis, not a finding.

---

# Crafty Ground + Grass — FINAL EXECUTION PLAN

**Provenance.** Every line/file cited below I opened this session under `/Users/kz/Code/Crafty/`. Where I am relaying a reviewer's measurement I did not reproduce, it is tagged `[lens]`. **Nothing was executed** — no `npm run lint`, `test:unit`, `build`, `test:visual`, `perf:m2`, no rendered PNG. All frame-cost figures are structural.

**Standing gate for every commit** (mirrors `.githooks/pre-push:99-110`, which runs doc-currency → queue-ledger → lint → gate-shape → cli-guard → test:unit → build → bundle-budget):
```
cd /Users/kz/Code/Crafty/frontend && npm run lint && npm run test:unit && npm run build && node scripts/ci/bundle-budget.mjs && npm run knip
```
`npm run test:visual` is in **neither** pre-push nor CI (`.githooks/pre-push:30-34` names it an explicit exclusion) — run it deliberately on every item marked *moves baselines*. Re-baselining stays owner-gated (invariant 7).

**Bundle headroom, measured today:** `build/assets/index-DaDGBBQq.js` = **718,455 B** vs the 760,000 ceiling (`scripts/ci/bundle-budget.mjs:36`) → **41,545 B (5.5%)**. Separately: `build/assets/terrain.worker-rQngRfy4.js` = **16,263 B and has no BUDGETS entry at all** — worker growth (S1/S12/S15) is ungated and does *not* consume index headroom. Only shader text in `Terrain.jsx` (S11/S12/S13) does.

**Ledger obligation:** `memory/STATUS.md:702` (F2, perf-harness) and `:705` (F3, biome tint) are `▢`. `scripts/ci/queue-ledger.mjs` runs pre-push; flip `▢`→`▣✓ <sha>` in the same commit that closes each, or the registry lies.

---

## 1. SHIP NOW (autonomous, ordered — each is one atomic commit)

### S1 — Extract `generateMesh` into a testable module + land the behavioural mesher gate
**Intent:** four downstream items claim mesher numbers; today nothing can measure them. `grep -c export src/world/terrain.worker.js` = **0**, and `self.onmessage` is assigned at module scope (`terrain.worker.js:38`) under `environment: 'node'` (`vitest.config.js:9`) — the mesher is unreachable from a test.
**Files:** new `frontend/src/world/mesher.js` exporting `generateMesh(cx, cz, blocks)` — verified pure: I grepped its whole body (`terrain.worker.js:694-935`) for `BLOCK_COLORS|getIndex|noise|CHUNK_|vegRandom|pickBiome|computeHeight` → **zero hits**; its only non-local deps are the module `mask` (`:693`) and `cornerAO` (imported `:31`). `terrain.worker.js` imports it and calls at `:62` and `:137`. **Must edit `frontend/tests/gates/ocean-mesher-no-water-faces.test.js:4,13`** — it greps `terrain.worker.js` for `blockA > 0 && blockA !== 9 && blockB === 0`, which moves out of that file.
**RED-first gate:** new `frontend/tests/gates/mesher-geometry-gates.test.js` — **behavioural, zero `readFileSync`**. `gate-shape.mjs:268` diffs added gate *paths* against `.source-grep-ledger.json` (`_count: 116`); a new source-grep gate reds the push, a behavioural one does not. Because it lands under `tests/gates/`, `mutation-proof-trailer.mjs:33` demands a `Mutation-Proof:` trailer — supply one. **Do not site it at `tests/world/` to dodge that.** Initial assertions (all true today, so this commit is green): quad-count snapshot for three fixed chunks, every triangle pair CCW, bytes/vertex snapshot.
**Verify:** standing gate. **Baselines: no.**

### S2 — Perf-harness honesty (F2), *without* changing the probe DPR
**Intent:** `memory/perf/m2-KZ-M3-Max-MacBook-1781105278853.json` reports `medianMs: 16.69999999999709` for scenarios **A through E** — every median pinned to the 60 Hz vblank, all recorded deltas 0, dated 2026-06-10. `frameStats.js:46-48` checks only the C−B *difference*, so all always-on cost cancels.
**Files:** `frontend/scripts/perf/run-scenarios.mjs` — report **absolute scenario-A** median/p95 alongside the C−B delta. `frontend/src/devtest/frameStats.js` — sample a non-vblank-quantized quantity (CPU frame time around the render call, and/or `gl.info` draw/triangle counts) in addition to the rAF delta.
**Rejected amendment:** the input plan's DPR 1.5 → 3. `M2_BUDGET` (`frameStats.js:43`) is an **absolute millisecond** delta; quadrupling pixels makes the same relative regression produce ~4× the ms delta, so "don't relax the budget" silently makes it ~4× stricter and voids every historical `m2-*.json`. `PROBE_DPR` stays 1.5 (`perfScenarios.js:8`).
**RED-first:** unit test asserting the report object contains an absolute-A field (fails before the change).
**Verify:** `npm run perf:m2`; success = an A median that is not `16.7`. Flip `memory/STATUS.md:702` to `▣✓`. **Baselines: no.**

### S3 — Fix the transposed side-face UVs (answers `KEVIN-REVIEW-BATCH.md:774`)
**Intent:** `terrain.worker.js:908-914` emits one UV rectangle for all six directions: `uvs.push(0,0, 0,h, w,h, w,0)`. I re-traced the six corner constructions (`:809-872`): only `d===1 && dirFlag===1` (+Y) has its `c0→c1` edge spanning `h`; the other five span `w`, so `u` gets `h` — transposed whenever `w ≠ h`.
**Files:** `src/world/mesher.js` (post-S1), the single `uvs.push`:
```js
if (d === 1 && dirFlag === 1) uvs.push(0,0,  0,h,  w,h,  w,0);   // +Y unchanged → byte-identical top UVs
else                          uvs.push(0,0,  w,0,  w,h,  0,h);
```
**RED-first:** add to the S1 gate — for every emitted quad, `|uv edge| === |world edge|` on both edges. Fails today: `[lens, two lenses independently, matching digit-for-digit]` **540/1101 bad on chunk (0,0)** (`-X 116/216 · +X 120/198 · -Y 74/130 · +Y 0/136 · -Z 114/196 · +Z 116/225`), worst stretch 30×; (1,0) 646/1557; (16,16) 697/1709.
**Verify:** standing gate + `npm run test:visual`; inspect `landmark.png`, `biome-snow.png`. **Baselines: YES.** Note when answering the batch item: its own text ("matches the +Y/**-Y** faces") is wrong — −Y is transposed on 74/130 quads.
**Expected magnitude, honestly:** *moderate*. Layer 1 of the tile is per-pixel uncorrelated hash noise (`proceduralTextures.js:42-50` `[lens]`), so a 30× stretch reads as streaking, not as a rotated pattern. The fix removes streaking.

### S4 — Flip the greedy quad diagonal toward the darkest corner
**Intent:** the index emit (`terrain.worker.js:~916-919`) is a fixed `(0,1,2),(0,2,3)`; `src/world/vertexAO.js` contains `cornerAO` and nothing else `[lens, full-file read]`. AO gradients therefore bend along one fixed diagonal, creasing every contact shadow.
**Files:** `src/world/mesher.js` index emit only. Compare `a0+a2` vs `a1+a3` (the four values already computed ~20 lines above at `:887-892`) and emit `(1,2,3),(1,3,0)` when the current diagonal is the brighter one. **Both variants must stay CCW** — `Terrain.jsx:37-43` is `FrontSide`.
**RED-first:** S1 gate — construct a fixture with asymmetric corner AO, assert the emitted pair is the flipped one; plus the existing CCW assertion holds for both branches.
**Verify:** standing gate + `npm run test:visual`. **Baselines: YES** (small).

### S5 — Scope the mesher mask clear
**Intent:** `terrain.worker.js:723` `mask.fill(0)` is unconditional against `new Uint16Array(4096)` (`:693`). For `d===1`, `u=2/v=0 → sizeU=sizeV=16` (`:713-719`) = 256 entries used, and `sizeD=256` means 257 of 291 slices clear all 4096 → ~**987k redundant writes per chunk** `[lens arithmetic, I verified the sizes]`.
**Files:** `src/world/mesher.js` → `mask.fill(0, 0, sizeU * sizeV)`. Max index used is `sizeU*sizeV-1` on all three axes.
**RED-first:** none possible — pure optimisation. The S1 quad/byte snapshot must stay **byte-identical**; that is the whole proof.
**Verify:** standing gate. **Baselines: no.**

### S6 — Delete the origin-stacked grass motes
**Intent:** `OptimizedGrassSystem.jsx:88-103` seeds 8 particles at `(r()-0.5)*30` with **no chunk offset**, and the wrapping `<group>` at `:187` carries no `position`. `<OptimizedGrassSystem>` mounts at `Terrain.jsx:977-979` as a **sibling** of the `<group position={[cx*16,0,cz*16]}>` (`Terrain.jsx:213`), so every chunk's motes stack in one 30×30 m column at the world origin, with `instanceMatrix.needsUpdate = true` every frame (`:181`).
**Files:** `src/OptimizedGrassSystem.jsx` — remove the particle `useMemo`, the particle branch of the `useFrame`, the `<instancedMesh>` at `:196-198`, **and `particleMaterial` (`:71-76`)** or `no-unused-vars` (an error) and `knip` red.
**RED-first:** extend the existing `frontend/tests/gates/grass-revival-gates.test.js` (already in `.source-grep-ledger.json`, so no ratchet hit) with `expect(grass).not.toMatch(/particleMaterial/)`.
**Verify:** standing gate + `npm run test:visual`. **Baselines: maybe** — `explore-day`/`hearth` are near spawn; any change is the removal of invisible clutter.

### S7 — One wind driver instead of 81, and fix the dead mob-bend
**Intent (perf):** every mounted grass chunk runs its own `useFrame` (`:120`), resets the same 8 shared uniform slots (`:135-137`) and walks **all** of `ecs.entities` (`:149-156`) into one module-level material (`:11`). At high tier that is 81 identical full-ECS walks/frame, 80 discarded by last-write-wins.
**Intent (bug, found by the code-truth lens, verified by me):** `:152` does `entity.position[0]`, but both `isMob:true` creation sites store a **`THREE.Vector3`** — `src/systems/SpawnerSystem.jsx:58` and `src/world/npcSpawn.js:32`. Array-indexing a Vector3 yields `undefined` → NaN uniform → in the shader `if (pos.y > 9990.0) continue;` (`:51`) is **false for NaN** so the slot is not skipped, and `if (dist < 2.2)` (`:53`) is also false → mob grass-bending has never worked and burns up to 7 of 8 slots. **Fix `.x/.y/.z` in this commit or the refactor ships the bug forward.**
**Files:** new `<GrassWindDriver />` mounted once in `src/world/Terrain.jsx` beside the chunk map (not inside `ChunkMesh`), owning `time` + `entityPositions`; use `mobsQuery` (`src/ecs/world.js:7`), not `ecs.entities`. `src/OptimizedGrassSystem.jsx` keeps only its instance-matrix `useEffect`. Player position stays a transient `useGameStore.getState()` read (`:142`) — invariant 2.
**RED-first:** extract `collectBendSources(playerPos, mobs)` returning 8 slots and unit-test it: a mob with `position: new THREE.Vector3(1,2,3)` must yield finite `(1,2,3)`. **Red today.**
**Verify:** standing gate; `npm run perf:m2` (meaningful post-S2); `npm run test:visual` must be **within tolerance and visually unchanged** — this is a refactor, so a visible diff means the uniform stopped reaching the material. **Baselines: no** (the mob-bend fix can move a frame if a mob is within 2.2 m of grass at capture time; check, don't assume).

### S8 — Per-instance grass variation (yaw, scale, sub-cell jitter, hue) — *prerequisite for S9*
**Intent:** `:112-116` sets **position only** (`dummy.position.set(x, y+0.35, z); dummy.updateMatrix()`). Every blade in the world is the same rectangle at the same yaw, on the exact 2 m voxel lattice (`grassField.js:14` pushes bare min-corners). The wind phase (`:34`) is `instanceMatrix[3][0]*0.5 + instanceMatrix[3][2]*0.5`, which correlates every blade along the world diagonal.
**Files:** `src/OptimizedGrassSystem.jsx` only. In the `useEffect`: add `dummy.rotation.y`, `dummy.scale`, and a sub-cell offset, **all from an integer-hash of the world (x,z)** — no `Math.random()`, no clock (invariant 3; the existing guarded `Math.random()` at `:170-172` stays inside `if (!capture)` at `:166`). Add `setColorAt()` hue/value jitter — verified this needs **no** `vertexColors` flag: `node_modules/three/src/renderers/webgl/WebGLPrograms.js:198` keys `instancingColor` off `object.instanceColor !== null`. In the shader, replace the `x*0.5+z*0.5` phase with a two-term hash of the two translation components so it no longer correlates diagonally.
**Explicitly NOT doing** (see KILLED): no module-scope shared `BufferGeometry`, no `aVariation` `InstancedBufferAttribute`, no density change, no wind-pin change. Everything above rides `instanceMatrix` + `instanceColor`, which are already per-chunk.
**RED-first:** unit-test the hash helper — determinism (same input → same output across calls), spread (distinct yaw for adjacent x and for adjacent z), and bounded range.
**Verify:** standing gate + `npm run test:visual`, then **run the capture twice and diff `current/` against itself** to prove the jitter is bit-deterministic. **Baselines: YES.**

### S9 — Put the grass in the lighting equation
**Intent:** `OptimizedGrassSystem.jsx:11-16` is `MeshBasicMaterial({color:'#4a7c59', transparent:true, opacity:0.7, side:DoubleSide})` — unlit by definition, so it ignores every light in `Atmosphere.jsx:205-224`, the per-mood grade, and the aerial haze the ground gets (`Terrain.jsx:154-160`). Its hue also fights its substrate: `#4a7c59` (blue-green) over a tile whose base is `(86,124,53)` yellow-green `[lens]`.
**Files:** `src/OptimizedGrassSystem.jsx`, material declaration + the `<instancedMesh>`:
- `MeshBasicMaterial` → `MeshLambertMaterial`. The `onBeforeCompile` patch (`:18-68`) replaces `#include <begin_vertex>`, which Lambert has.
- Drop `transparent` and `opacity`. This also kills a **double draw**: `node_modules/three/src/renderers/WebGLRenderer.js:1619` (and `:922`) renders `transparent && DoubleSide && !forceSinglePass` twice, BackSide then FrontSide, dirtying the shared material each time. Every grass draw-call count in every prior estimate was 2× low.
- Recolour toward the substrate (yellow-green, between `(86,124,53)` and the `(65,105,40)` fleck) — **exact swatch is an owner call, see §2**.
- `receiveShadow` **yes**; `castShadow` **no** (see KILLED).
- `grassMaterial.customProgramCacheKey = () => 'grassWind'` — only `src/render/characterStyle.js:66` does this today; the default stringifies the closure on every program lookup.
**Why this must follow S8, not lead:** with `DoubleSide`, three flips the normal per face (`ShaderChunk/normal_fragment_begin.glsl.js:2`), so a Lambert blade is lit by the side facing the rasterizer. Every blade currently shares one yaw and one ±Z normal, and the explore sun is `[-55,48,-52]` — the capture camera (`captureMode.js:25-26`, `[0,70,24]` → `[0,64,-66]`) sees the +Z faces, giving `N·L ≤ 0`. **Shipping S9 before S8 makes the grass darker and flatter, not warmer.** The input plan had them four commits apart; that ordering is wrong.
**Deleted justification:** the input plan's "grass never writes depth / contributes nothing to N8AO" is **false** — `node_modules/three/src/materials/Material.js:42` defaults `depthWrite = true` and nothing overrides it. Whether N8AO samples depth before or after the transparent pass is **not checked** by anyone; going opaque makes the question moot, which is the honest framing.
**RED-first:** extend `grass-revival-gates.test.js` — `expect(grass).not.toMatch(/MeshBasicMaterial/)` and `expect(grass).toMatch(/customProgramCacheKey/)`.
**Verify:** standing gate + `npm run test:visual`; success = tuft pixels and ground pixels sit in the same hue family and move together between `explore-day.png` and `explore-night.png`. **Baselines: YES** (`explore-*`, `hearth`, `biome-snow`, `ocean-coast`, `landmark` at minimum, of the 31 in `tests/visual/diff.test.js:33`).

### S10 — Shadow frustum follows the player
**Intent:** `GameScene.jsx:106-116` builds a fixed ortho box (`±100`, `near 0.1`, `far 200`) memoized on `q.shadowMapSize`; `Atmosphere.jsx:209-222` binds it to the one `castShadow` light and `:192` rewrites only its **position**. A grep for `.target` across both files returns **zero hits**, so the light target is the default origin and the box is permanently centred on spawn. Landmarks (~256) and Blight-Heart (~1025) `[lens]` are structurally shadowless.
**Files:** `src/render/Atmosphere.jsx` — add an `Object3D` target, `scene.add(target)` **with unmount cleanup**, `sunRef.current.target = target`; in the existing `useFrame` set the target and the light position from `useGameStore.getState().playerPosition` (transient — invariant 2, precedent `OptimizedGrassSystem.jsx:142`). Snap the target to a texel grid (`2*extent / shadowMapSize` world units) or edges swim as the player walks. **Mutate `sunRef.current.shadow.camera` and call `updateProjectionMatrix()`** — the `shadow-camera-*` JSX props come from a `useMemo` and will overwrite naive writes on the next React render. **Keep ±100 this commit** (shrinking is §2).
**RED-first:** none available. `castShadow={!isCaptureMode()}` (`Atmosphere.jsx:211`) means **every automated gate in this repo is blind to shadows.** Say so rather than implying coverage.
**Verify:** manual `npm run dev`, walk to a landmark, confirm shadows; then `npm run test:visual` must show **no change** on all 31 states — a diff here means capture mode is not actually suppressing `castShadow`, which is itself a finding. **Baselines: no** (expected).

### S11 — Sky-coloured AO instead of a grey multiply
**Intent:** `Terrain.jsx:139` is `diffuseColor.rgb *= mix(0.55, 1.0, clamp(vAO/3.0, 0.0, 1.0));` — a luminance scalar, so crevices go soot.
**Files:** `src/world/Terrain.jsx` fragment injection. `uniform vec3 skyHorizon` is already created (`:49`), declared (`:91`) and **uploaded per frame** (`:529`, from `sampleMood`); it is consumed for aerial haze at `:160`. Replace with `mix(skyHorizon * 0.55, vec3(1.0), clamp(vAO/3.0,0.0,1.0))`, saturation held to ~25-35% toward sky.
**Cost:** 3 ALU. Free.
**RED-first:** none meaningful (shader-only). **Honest caveat the input plan missed:** `tests/visual/diff.test.js:34` is a 6%-of-pixels threshold with `pixelmatch({threshold: 0.1})` (`:76`) — a 30% tint on a `mix(0.55,1.0,…)` term may land **under** the gate. Green does not mean unchanged. Look at the frames and batch them regardless.
**Verify:** standing gate + `npm run test:visual`; open `explore-day.png`/`explore-night.png`. **Baselines: YES, probably below threshold.**

### S12 — Macro-octave + hue in the de-tile jitter, and make `detile.js` load-bearing
**Intent:** `Terrain.jsx:130-133` is the only per-block variation — one `sin`-hash octave at 1-block frequency, ±8% **value only**, no hue. *(I read `:127` and `:139` directly; the `:130-133` body is quoted identically by the input plan and all three lenses — not independently re-read by me.)* Separately, `src/world/detile.js` `tileValueOffset` is imported by **nothing in `src/`** — sole importer is `tests/world/detile.test.js:2`, and `Terrain.jsx:127` only *mentions* it in a comment. Its "single source" claim is false.
**Files:** `src/world/detile.js` exports the constants; `src/world/Terrain.jsx` **imports them into the GLSL template string** so the existing test becomes load-bearing. Add (a) a second octave on `floor(vWorldPos.xz / 12.0)` at ±10% value, (b) a ≤4°-of-hue opposed R/B bias from a third hash, (c) `mod(worldPos, 512.0)` before hashing to bound the `sin` argument.
**Honest caveat:** `mod(p,512)` yields a *different* pattern past |512|, not merely a bounded one `[lens]` — distant frames change, and the Blight-Heart at ~1025 is in no baseline.
**RED-first:** `tests/world/detile.test.js` extended for the new octave/hue terms — meaningful for the first time once the shader imports the constants.
**Verify:** standing gate + `npm run test:visual`. Watch the 41,545 B index headroom. **Baselines: YES** (subtle, global).

### S13 — Biome ground tint (F3), top-faces-only and beach-correct
**Intent:** `src/world/biomeTable.js:38-49` declares a `tint` on all ten biomes; a repo-wide grep of `frontend/src` returns **zero reads of it**. The worker destructures only `let { surfaceBlock, secondaryBlock } = pickBiome(...)` (`terrain.worker.js:437`) and the mesher writes `blockType, 0, 0` under a "color.g/color.b are now unused" comment (`:895-906`). **Six** biomes share `surfaceBlock: 1` (taiga/plains/forest/meadow/jungle/savanna — `biomeTable.js:39-47`; the input plan's "8" correction to "6" is right, snow=5, swamp=2, desert=4, mesa=4), so six render pixel-identical. This is `memory/STATUS.md:705`.

**Three amendments — the original spec was killed by two lenses and each defect is real:**
1. **Scope to surface tops, not every fragment.** The input plan multiplied the tint into `diffuseColor.rgb` right after the decode, which runs for the **single opaque land material** — cave stone, ore, cobble, wood, sand. Emit the tint only on **+Y faces at/near the column surface**; everything else gets `(1,1,1)`.
2. **Read the tint AFTER the beach override.** `terrain.worker.js:439-442` reassigns `surfaceBlock = 4` for `surfaceY < BEACH_BAND_TOP` **after** `pickBiome`, and `climate.js:20` deliberately mirrors that. Reading tint off `pickBiome` paints jungle-green over sand beaches. Compute the tint inside the existing column loop at `:425-442`, after the override; beach columns get neutral.
3. **Reuse the climate samples you already have; cache for `update_block`.** `computeHeight` already runs per column at `:425`. Cache the 16×16 grid; sample only the **33 edge columns** (17×17 minus the cached 16×16) via the shared pure path so adjacent chunks agree at the seam — clamping to 15 instead produces a visible tint seam every 16 blocks, the one failure mode that makes this read as broken. That is **+33** climate samples, not +289. Store the grid alongside the chunk in the existing `chunks` Map so `update_block` (`terrain.worker.js:137`, a **full chunk re-mesh** on every mined block) recomputes nothing.

**Files:** `src/world/biomeTable.js` (export a tint accessor; data unchanged) · `src/world/terrain.worker.js:437` destructure `tint` — **this breaks `frontend/tests/gates/biome-table-gates.test.js:18`**, which asserts that exact literal; update it in the same commit · `src/world/mesher.js` takes a `tints` grid and emits a **new `Uint8Array` `aTint` (3-wide)** — not the dead `color.g/.b`, which cannot carry RGB · `terrain.worker.js:79-99` add `tint` to the payload and its `.buffer` to the transfer list, **and mirror it in the `update_block` branch at `:152`** · `src/world/Terrain.jsx:199` bind `aTint` beside `aAO` · `Terrain.jsx` vertex/fragment: `varying vec3 vTint`, applied after the texture decode at `:105` and before the mood grade.
**RED-first:** S1 gate gains (a) the **seam test** — tint at a chunk's `x=15` column equals what the pure climate path returns for `x=16` of the neighbour; (b) a jungle column and a savanna column produce different tints; (c) a beach column (`surfaceY < BEACH_BAND_TOP`) produces neutral; (d) a below-surface stone vertex produces neutral.
**Verify:** standing gate + `npm run test:visual`; check `biome-snow.png`, `explore-day.png` for colour change with **no vertical seam every 16 blocks**. Flip `memory/STATUS.md:705` to `▣✓`. **Baselines: YES**, every ground-bearing frame. Tint **strength** is an owner call (§2).

### S14 — Quantize the terrain vertex attributes (unnormalized `Uint8`)
**Intent:** `Terrain.jsx:189-203` binds five non-interleaved `Float32` attributes; `colors` is 3×Float32 = 12 bytes carrying one 0-15 integer (`mesher.js` `colors.push(blockType,0,0)`) and `ao` is Float32 carrying 0-3. `[lens, measured]` 54.0 bytes/vertex, 237,816 B on chunk (0,0).
**Files:** `src/world/mesher.js` emits one `Uint8Array` `aVoxel` (4-wide: blockType, ao, +2 spare that S13's tint can later occupy); `src/world/Terrain.jsx:189-203` binds it with **`normalized = false`** and drops the 3-wide `color`; `Terrain.jsx:40` `vertexColors: false`.
**The correctness trap both lenses caught, and the fix:** `Terrain.jsx:68` is `vBlockType = color.r` and `:69` `vAO = aAO` — the *vertex* side. Dropping `vertexColors` removes three's `#include <color_pars_vertex>`, the **only** declaration of `attribute vec3 color`, so the injected vertex shader must declare `attribute vec4 aVoxel;` itself **in the same edit** or the shader fails to compile (black screen; nothing in the suite compiles GLSL). Using **unnormalized** `Uint8` is what keeps `floor(vBlockType + 0.5)` (`:105`) and `clamp(vAO/3.0,…)` (`:139`) working **unchanged** — a *normalized* attribute would deliver `15/255 = 0.0588`, floor to 0, and send the entire world to atlas layer 0. The input plan specified normalized. It was right to be killed.
**RED-first:** S1 gate asserts bytes/vertex drops below an explicit ceiling (~32) and that block ids round-trip exactly.
**Verify:** standing gate; `npm run dev` **before** anything else (a black screen is the failure mode); `npm run test:visual` must be visually unchanged. **Baselines: no** (pure representation change).

### S15 — AO in the greedy merge key — **ship only after the measurement in §5-Q2 clears**
**Intent:** `terrain.worker.js:754/757/760` write `mask[...] = blockA | (1 << 8)` — block id + face direction only. Corner AO is computed **after** the merge (`:887-892`) with `nu`/`nv` clamped to the merged extents, so one AO quad is stretched across the whole run. `[lens, measured]` chunk (0,0): 651 of 1101 quads span >1 block, **268 carry non-uniform corner AO**, max span **30 blocks**.
**Mandatory amendment:** `const mask = new Uint16Array(4096)` (`:693`). The proposed key `blockType | (dirFlag<<8) | (aoQuad<<10)` needs **18 bits** — Uint16 truncates bits 16-17 and distinct AO configurations silently alias and merge anyway, with no error and no failing test. **Widen to `Uint32Array`.** (This partially offsets S5; keep the scoped fill.)
**Also:** compute the per-cell AO lazily, only for non-zero mask cells, or the mask-fill loop pays 4×`cornerAO` on all ~205k cell-slots per chunk.
**Cost, honestly:** `[lens, replica measurement — quad counts matched the real mesher exactly on three chunks, but it was a replica]` **1101→1662 (1.51×), 1557→2249 (1.44×), 1709→2443 (1.43×)**. That clears the input plan's own "abort if it doubles" trigger. The unmeasured risk is downstream: `Terrain.jsx:219` feeds the render buffers **verbatim** to `<TrimeshCollider>`, and Rapier builds that BVH on the **main thread** on the chunk-arrival path (throttled to 2 requests / 150 ms — `Terrain.jsx:698-704`, `:753-757`) **and on every mined block** via the full `update_block` re-mesh. Nobody has measured Rapier trimesh build time. **P6, the mitigation the input plan paired with this, is killed** (see §4).
**RED-first:** S1 gate — no merged quad wider than 1 block may carry non-uniform corner AO; quad-count snapshot updated with the measured number in the commit message (**not** a ceiling that gets raised later — that is the exact reward-hack `scripts/ci/bundle-budget.mjs:29-31` forbids).
**Verify:** standing gate + `npm run test:visual`; inspect the base of any wall in `hearth.png`/`landmark.png`. **Baselines: YES.**

---

## 2. OWNER TASTE CALL

1. **Grass colour.** The blades are `#4a7c59` (blue-green) on a `(86,124,53)` yellow-green tile. S9 has to pick a value. *Ship a 3-swatch ladder rendered at `explore-day` + `explore-night`; recommendation: the middle yellow-green, `#5E8A3E`-family, so the tufts read as the same plant as the ground.* Note `OptimizedGrassSystem.jsx:190-191` says "Bold-flat (flat blade, **locked palette**)" — this is a design-language edit that survives only because art was de-gated `[lens]`, not because it is a correctness fix. Call it what it is.
2. **Grass density.** Both worker call sites pass `{stride: 2, cap: 50}` (`terrain.worker.js:77` and `:152`) and chunk (1,0) emits exactly **50** `[lens]` — the cap is actively truncating, and it `return`s in scan order (`grassField.js:15`), so the far +Z strip of every dense chunk is bald. Raising it costs three coordinated edits: both call sites, `OptimizedGrassSystem.jsx:84` `blockPositions.slice(0, 50)`, and the gate literal at `grass-revival-gates.test.js:44`. Note `grassTops` is **structured-cloned, not transferred** (`terrain.worker.js:64-66`), so 5× entries is 5× main-thread deserialize per chunk, and `update_block` re-emits it on every mined block. *Recommendation: stride 2→1 with cap 150 and hash-based thinning instead of scan-order truncation (kills the bald strip); hold the 5× jump until S2's harness can price it.* **Correction to the input plan:** changing `grassField.js` **defaults is inert** — I read `src/world/grassField.test.js`; every density case passes explicit `{stride, cap}` and the one `{}` case is all-stone. Change the call sites.
3. **Blade silhouette.** A 3-segment tapered curved blade with a baked base→tip gradient is a fork of the locked bold-flat language, not a "taste checkpoint" inside an autonomous commit. *Recommendation: ship S8's variation on the existing flat quad first, look at it, then decide. If you do want the tapered blade, it needs `vertexColors: true` for the baked gradient (`setColorAt` covers per-instance colour but not per-vertex).*
4. **Biome tint strength.** Tints span `#3fae46` (jungle) to `#c2b466` (savanna). Full strength over-saturates. *Recommendation: 35%, luminance-preserving; batch a 25/35/50% ladder on `explore-day` + `biome-snow`.*
5. **Composer AA (was P3).** Verified first-hand: `frontend/node_modules/@react-three/postprocessing` EffectComposer defaults `multisampling = 8` on a HalfFloatType target `[both lenses opened the dist bundle]`, and `GameScene.jsx:254` is propless while `:283` adds `<SMAA />` on top of `gl: { antialias: false }` (`:125`). So the scene pays 8× MSAA **and** a full SMAA pass. *Recommendation: `<EffectComposer multisampling={4}>` and drop SMAA — but read the value **once at mount**, never from `q.msaa` reactively: `multisampling` is in the composer's `useMemo` dep array, so wiring it to `qualityTier` makes every `PerformanceMonitor` tier flip destroy and rebuild the whole composer — every render target reallocated, every pass recompiled — precisely when FPS has already dipped.* Low tier at `multisampling: 0` with SMAA removed = zero AA on the weakest devices, and moves `explore-day-low`/`explore-night-low`. Owner call because edge quality is taste.
6. **Shadow box size.** After S10 the ±100 box follows the player, so ±60 would quadruple texel density for free — but introduces shadow **pop at the frustum edge** as you walk, which no gate can see. *Recommendation: ship S10 at ±100, try ±80 in a follow-up, judge by eye.*
7. **`castShadow` on grass blades.** S9 leaves it **off**. At `shadowMapSize` 512/1024 (`quality.js:20-21`) over a ±100 box that is 0.39/0.20 world-units per texel — a 0.4×0.7 blade is sub-texel, so you buy acne and flicker, not contact shadow; and three renders the shadow pass with a shared depth material (no `customDepthMaterial` exists here), so the shadow would be **unswayed** under a swaying blade. *Recommendation: keep it off until the blade is larger and a `customDepthMaterial` carries the same wind patch.*
8. **Per-face grass texture (grass top / dirt side).** Wants extra atlas layers. Two locks, not one: `tests/world/proceduralTextures.test.js:22` (`depth === 16`) **and** `:29` (`depth > max(BLOCK_ID)` — "layer index == block code" is a *structural* identity, and folding face direction into the emitted id breaks it even at constant layer count). Header at `:6-10` calls a layer-count change "a Kevin-taste fork, NOT an autonomous change". *Recommendation: propose with a rendered A/B; do not ship autonomously.*
9. **Re-baselining.** Every *moves baselines* item above needs it (invariant 7). *Recommendation: two review batches — one after S4 (mesher-only: UV + diagonal), one after S13 (grass + shader + tint) — rather than one per commit.*

---

## 3. OWNER-GATED DEPENDENCY

**Nothing in §1 or §2 needs a new package.** For completeness, the things that would:

| Package | Buys | No-dependency alternative (what we're doing instead) |
|---|---|---|
| A `BatchedMesh` per-instance-LOD addon (third-party) | Per-instance LOD/frustum culling for grass | Not needed — grass is tens of thousands of *identical* blades in one `InstancedMesh` per chunk; `BatchedMesh` is the tool for hundreds of *varied* props and needs `WEBGL_multi_draw` or three falls back to one draw call per object `[lens]`. |
| `three-mesh-bvh` | A cheap, correct decimated/queryable collider | None — and P6 is killed anyway (§4), so the need doesn't exist. |
| A GPU-timer-query helper (`EXT_disjoint_timer_query_webgl2` wrapper) | Un-quantized GPU frame cost for S2 | S2 measures CPU frame time + `gl.info` counters, which is enough to break the 16.7 ms vblank pin without a dependency. |

---

## 4. KILLED — do not re-propose

| Proposal | Killed by | Reason (verified) |
|---|---|---|
| **P6 — decimate the physics collider** | perf lens | The collider is not just for walking. `world.castRay` against it drives block targeting and mining (`Terrain.jsx:262-274`, `:791-802`), the y=255 spawn probe (`:639`) and per-entity ground probes (`:657`). The mesher only emits faces adjacent to air, so **every emitted face is reachable** — including cave interiors (`terrain.worker.js:452-458`). There is no safe "invisible face" set to remove. Any decimated face makes the block behind it un-mineable. |
| **L5(a) as specified — AO packed into a `Uint16Array` mask** | invariants + perf | `mask` is `Uint16Array(4096)` (`:693`); the proposed key needs 18 bits and truncates **silently**. Survives only as S15 with `Uint32Array`. |
| **P7 as specified — normalized `Uint8` + `vertexColors:false`** | invariants + perf | Normalized delivers `15/255 = 0.0588` → `floor(x+0.5)` = 0 → the whole world samples atlas layer 0; and dropping `vertexColors` removes the only declaration of `attribute vec3 color`, which `Terrain.jsx:68` reads. The plan justified the drop via the *fragment*-side `#include <color_fragment>` — the wrong half. Survives only as S14 (unnormalized + self-declared attribute). |
| **L3 as specified — tint on every fragment, read pre-beach-override, +289 samples, recomputed in `update_block`** | invariants + perf | Would tint cave stone and ore; would paint jungle green on sand (`terrain.worker.js:439-442`); the "+13%" arithmetic was ~9× low because `generateChunkData` discards the climate values after its y-loop. Survives only as S13. |
| **L2's module-scope shared blade `BufferGeometry` + `aVariation` `InstancedBufferAttribute`** | invariants + perf | Instanced attributes live on the geometry. One module-scope geometry shared by 81 chunk meshes means one shared `aVariation` buffer — per-chunk variation is impossible. Per-chunk geometry clones would 81× the GPU buffers, costed nowhere. S8 uses `instanceMatrix` + `instanceColor`, which are already per-chunk. |
| **L2's non-zero capture wind pin (`time = 12.7`)** | perf lens | The premise "the wind shader is never exercised by any baseline" is false: at `time = 0` the sway is `sin(0*2.2 + offset)*0.12 + …` (`OptimizedGrassSystem.jsx:38`) — non-zero for every instance. Baselines already capture a statically-deformed field. 31 baselines of churn for zero new coverage. |
| **L2's `grassField.js` default change** | code-truth lens | Inert. Both callers pass explicit `{stride:2, cap:50}` (`terrain.worker.js:77`, `:152`) and every density case in `grassField.test.js` passes explicit options. Change the call sites (§2 item 2). |
| **L1's `castShadow` on grass blades** | perf lens | Sub-texel blade at 512/1024 shadow maps over a ±100 box → acne, not contact shadow; and no `customDepthMaterial` exists, so the cast shadow would be unswayed under a swaying blade. |
| **L1's "grass never writes depth / contributes nothing to N8AO" rationale** | code-truth lens | `node_modules/three/src/materials/Material.js:42` defaults `depthWrite = true`; nothing overrides it. The material change survives; this justification is deleted. |
| **P0's DPR 1.5 → 3** | perf lens | `M2_BUDGET` is an absolute-ms delta, so 4× the pixels makes the gate ~4× stricter than ship conditions and voids every historical `m2-*.json`. Also 5 × 60 s at 4× fill is the machine-load pattern this repo already blames for flaky-gate timeouts. Replaced by S2. |
| **Siting the mesher harness at `tests/world/`** | perf lens | `mutation-proof-trailer.mjs:33` only demands a `Mutation-Proof:` trailer for `tests/gates/**` and `scripts/ci/**`. Putting it at `tests/world/` evades the only enforcer of "mutation-prove every new gate". S1 sites it at `tests/gates/` and behavioural (no `readFileSync`, so `gate-shape.mjs:268`'s frozen 116-path ratchet stays clean). |
| **A quad-count *ceiling* that gets raised when S15 blows it** | perf lens | Same reward-hack shape `scripts/ci/bundle-budget.mjs:29-31` forbids. The gate holds a *snapshot* changed only with a measured number in the commit message. |
| **P3 as an autonomous commit** | invariants + perf | AA is taste, and `low` tier at `multisampling:0` with SMAA gone is a visible downgrade on two baselines. Moved to §2 with the composer-rebuild caveat. |
| **L9 per-face texture variants** | invariants + code-truth | Two design locks (`proceduralTextures.test.js:22` and `:29`), not one. §2 item 8. |
| **Mipmaps / `LinearFilter` / anisotropy on the voxel atlas** | design lock | `proceduralTextures.test.js:74-76` under a header calling it "a Kevin-taste fork, NOT an autonomous change". Also anisotropy with `magFilter = NearestFilter` is a silent no-op in r172 `[lens, unverified by me]`. |
| **Adding a hemisphere light** | already shipped | `Atmosphere.jsx:224`, fed per-frame from `mood.js:70-71`. |
| **ACES tone mapping / "fixing" the grade / lowering bloom** | recorded decision | `GameScene.jsx:284` is `ToneMappingMode.NEUTRAL` deliberately; `:279` `luminanceThreshold={0.65}` is the intended glowier grade. |
| **WebGPU / TSL migration; upgrading three off 0.172** | technically wrong here | `onBeforeCompile` is WebGLRenderer-only and there are four live sites (`OptimizedGrassSystem.jsx:18`, `Ocean.jsx:87`, `characterStyle.js:48`, `Terrain.jsx:166` — the input plan's "five" counted a comment `[lens]`), plus a WebGL postprocessing chain. Pipeline rewrite for a non-bottleneck. |
| **`Material.alphaHash` for instanced grass** | technically wrong | Its chunk thresholds on object-space `vPosition`, set before the `instanceMatrix` multiply — every instance of a shared geometry dithers identically `[lens]`. |
| **`BatchedMesh` for grass; shell texturing; octahedral impostors; parallax occlusion; normal maps on block faces; geometry-shader grass ports** | technically wrong | WebGL2 has no geometry shaders; the rest are fill-rate or authoring costs with no payoff on flat axis-aligned voxel faces. |
| **Per-block UV rotation/mirror to break tiling** | technically wrong | Layer 1 is per-pixel uncorrelated hash noise `[lens]` — rotating a rotation-invariant field is a no-op. S12 is the correct anti-tiling lever. |
| **UE-style "Dither Temporal AA" fade** | technically wrong | The chain is SMAA (`GameScene.jsx:283`), not TAA; per-frame noise never resolves and makes every capture pixel-different. The repo already learned this — `<Noise>` is disabled in capture at `GameScene.jsx:287`. |
| **Removing N8AO "because vertex AO exists"** | insufficient evidence | It runs only at `q.ao` tiers (`GameScene.jsx:255`). Re-evaluate after S9 + S15 with S2 in place; do not delete on a reading. |
| **Raising any bundle budget to green a red build** | forbidden | `scripts/ci/bundle-budget.mjs:29-31`. |
| **Mid-combat re-mesh; `Math.random()`/wall-clock in capture-rendering code; reactive state in `useFrame`; emoji in `frontend/src`; any new npm dependency** | hard invariants 1/3/2/5/4 | Unchanged. Note S13 and S15 both run only at chunk-generate and `update_block` time — and be honest that `update_block` **is** mid-combat when the player mines, which is why S13 caches its tint grid. |

---

## 5. STILL UNKNOWN — nobody measured it

**Q1. Every frame-cost number in this document, and in all four input documents.** No agent ran anything; all figures are structural, and the only recorded measurement (`memory/perf/m2-*.json`, 2026-06-10) reports all five scenarios pinned at `16.6999…` ms.
→ `cd /Users/kz/Code/Crafty/frontend && npm run perf:m2` — but only meaningful **after S2**.

**Q2. Rapier trimesh BVH build time, per streamed chunk and per mined block. This is S15's gate.** `Terrain.jsx:218-220` sits in the React tree; S3, S13 and S15 all change `positions`/`indices` identity, so the `useMemo` at `:189` rebuilds the geometry *and* `<TrimeshCollider>` re-creates the collider — on the main thread. Chunk (0,0) is ~2202 triangles `[lens]`; S15 raises it ~1.5×. No frame-cost section in any document costs this.
→ Instrument `performance.now()` around the `TrimeshCollider` remount in `src/world/Terrain.jsx`, `npm run dev`, then (a) walk to stream 81 chunks and (b) mine 20 blocks; log median and max. **Ship S15 only if the per-mined-block figure stays under one frame at 60 Hz after the 1.5× rise.**

**Q3. How many grass instances actually exist in a live session.** `[lens]` measured 32/50/0 emitted grassTops on chunks (0,0)/(1,0)/(16,16) — so "81 chunks × 50" is a ceiling, not a count, and every draw-call estimate built on 81 is wrong in the safe direction. Nobody counted a real session.
→ `npm run dev` with `<Stats />` (`GameScene.jsx:~296`) plus a one-line `renderer.info.render.calls` log.

**Q4. Whether S11 and S12 actually move a baseline.** `diff.test.js:34` is 6% of pixels with `pixelmatch({threshold: 0.1})` (`:76`). Both changes may be visible to the eye and invisible to the gate — art drifting green, and the owner-gated re-baseline that invariant 7 exists to force never fires.
→ `npm run test:visual` and read the printed per-state ratio for every state, including the passing ones. Do not accept "green" as "unchanged".

**Q5. Whether MSAA is actually active in this composer configuration, and whether `alphaToCoverage` would work.** The 8× default is now confirmed in the shipped package by two lenses reading `node_modules/@react-three/postprocessing/dist/index.js`, but *effective* MSAA depends on the composer's target and interacts with N8AO's depth resolve, which nobody opened.
→ A/B screenshot at `explore-day` with `<EffectComposer multisampling={0}>` vs default, zoomed on a cliff edge. Settle by pixels, never by docs — three agents found the published docs contradict the code.

**Q6. Anything about shadows.** `Atmosphere.jsx:211` is `castShadow={!isCaptureMode()}`, so **every automated gate in this repo is blind to the entire shadow system.** S10's win, S9's `receiveShadow`, and the acne argument against blade `castShadow` are all unverifiable by any command.
→ `npm run dev`, walk to a landmark and to spawn, screenshot both. Also note the `castShadow` flip depends on an undocumented ordering: `App.jsx:291-292` sets the module flag then `setCaptureMode(true)`, and `GameScene.jsx:84` subscribes, forcing a re-render of the non-memoized `Atmosphere` `[lens]`. **Memoizing `Atmosphere` would silently start moving 9+ baselines.**

**Q7. Whether the worker chunk has any byte ceiling.** It does not: `build/assets/terrain.worker-rQngRfy4.js` is 16,263 B and `scripts/ci/bundle-budget.mjs:33-38` lists only `rapier`/`r3f`/`index`/`three`. S1, S13 and S15 all grow it, ungated.
→ `npm run build && ls -l build/assets/terrain.worker-*.js` before and after each; consider adding a BUDGETS entry (a `scripts/ci/**` edit — carries a `Mutation-Proof:` trailer requirement).

**Q8. Whether the code-truth lens's mesher measurements are faithful.** They were produced by a *replica* of `generateMesh`, not the shipped function (the shipped one has no exports). The replica reproduced 1101/1557/1709 quads on three chunks exactly, which is strong but not proof. S1 makes this moot — re-run every measurement against the extracted module and record the real numbers in the commit.