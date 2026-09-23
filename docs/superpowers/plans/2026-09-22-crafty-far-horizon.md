# Far Horizon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land and sea continue to the horizon — a sunk, flat-shaded heightfield ring beyond the loaded chunks, sampled from the same surface formula as the real terrain.

**Architecture:** A pure geometry builder (`world/farField.js`) takes an injected column sampler and returns positions + colours for a polar ring; a small component (`world/FarField.jsx`) feeds it `climate.surfaceBlockAt`, re-centres it on a snapped grid, and draws one lit, fogged mesh.

**Tech Stack:** three r172, R3F 9.5, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-crafty-far-horizon-design.md`

## Global Constraints

- ROOT = the repo root (holds `.git`); APP = `frontend/`. npm and vitest from APP; git from ROOT.
- No new dependency. Zero emoji in `src/`. AST-safe edits only. No backtick inside a JS template literal.
- Game-Loop-Isolation: the component reads the player position with `useGameStore.getState()` inside `useFrame`, never a subscription.
- Every gate mutation-proven with `scripts/dev/mutate.sh`, including a plausible-WRONG mutation.
- Do not edit `frontend/src/` while a capture runs in THIS checkout.

## Review Focus

1. **The ring above real terrain.** If any vertex sits at or above the real surface it z-fights or floats over loaded chunks. Expected: every vertex is `FAR_SINK` below its column's surface (or sea level). Task 1 asserts it for every vertex.
2. **Swimming.** Re-centring every frame makes distant hills slide. Expected: the centre snaps to a 32 m grid and moving inside a cell never rebuilds. Task 2 tests the snap.
3. **The hole in the middle.** The ring must start where the loaded square starts at every tier, or land vanishes (gap) or doubles (too far in). Expected: `r0` derives from `renderDistance`. Task 1 asserts inner radius = the derived value.
4. **Colour disagreement near/far.** A far hill of a different green than the same hill loaded reads as a seam. Expected: far colour = the tile's own mean × the biome tint, the same two inputs the terrain shader multiplies. Task 1 pins it.
5. **Water.** Far water must sit at sea level (sunk) and be water-coloured, not the seabed's sand. Task 1 asserts it.

---

### Task 1: The pure far-field builder

**Files:**
- Create: `frontend/src/world/farField.js`
- Create: `frontend/tests/gates/far-field-gates.test.js`

**Interfaces:**
- Produces: `FAR_SINK = 2`, `FAR_OUTER = 420`, `FAR_RECENTRE = 32`, `farInnerRadius(renderDistance) -> number` (`(renderDistance + 0.5) * 16`), `snapCentre(x, z, step = FAR_RECENTRE) -> { x, z }`, `layerMeanLinear(texture) -> Array<[r,g,b]>`, `farColumn(s, means) -> { y, r, g, b }` where `s` is `{ surfaceBlock, surfaceY, isWater, biome }`, `farFieldGeometry({ cx, cz, r0, r1, rings, sectors, sample, means }) -> { positions: Float32Array, colors: Float32Array, index: Uint32Array }`.

- [ ] **Step 1: Failing tests** — drive `farFieldGeometry` with a synthetic `sample` (a tilted plane, a column of water, a forested biome): every vertex `y <= surface - FAR_SINK + 1e-6`; the innermost ring's radius equals `r0` and the outermost `r1`; water columns sit at `SEA_LEVEL - FAR_SINK` and take the water colour; a tinted block's colour = its mean × `BIOME_TINT[biome]`, an untinted (stone) block's = its mean; a forested biome is lifted and greener than the same ground unforested; `farInnerRadius(4) === 72`; `snapCentre(40, -40)` = `{ x: 32, z: -32 }` and `snapCentre(63, 5)` = `{ x: 32, z: 0 }`; vertex count `(rings) * (sectors)` ≤ 12k at the shipped settings.
- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement.** Radii `r_i = r0 + (r1 - r0) * (i / (rings-1))^1.7`; angle `2π j / sectors`; quads stitched with a wrap in `j`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Mutation-prove** — M1 no sink; M2 plausible-wrong: sink applied to water only; M3 r0 hard-coded 72; M4 plausible-wrong: tint applied to stone; M5 water takes the seabed colour; M6 snap rounds instead of floors; M7 canopy lift ignored.
- [ ] **Step 6: Commit** with call-site counts.

### Task 2: The component, wired and seen

**Files:**
- Create: `frontend/src/world/FarField.jsx`
- Modify: `frontend/src/GameScene.jsx` (mount `<FarField />` beside `<Ocean />`)
- Test: extend `far-field-gates` (structural, weak: GameScene mounts it; the component re-centres through `snapCentre` and builds through `farFieldGeometry` with `surfaceBlockAt`)

- [ ] **Step 1: Failing structural test**, **Step 2: FAIL**.
- [ ] **Step 3: Implement** — `useMemo` material (`MeshStandardMaterial`, `vertexColors`, `flatShading`, roughness 1); geometry rebuilt in `useFrame` only when `snapCentre(player)` changes; `computeVertexNormals()`; `frustumCulled={false}`; `receiveShadow={false}`; dispose on unmount. Measure one rebuild with `performance.now()` in a DEV-only log line, read it once, then delete the log.
- [ ] **Step 4: PASS**, lint, build.
- [ ] **Step 5: Mutation-prove** the structural checks (M8 unmounted; M9 re-centred on the raw position).
- [ ] **Step 6: SEE it** — same-renderer capture vs the previous capture; localise the diff to the horizon band; open `explore-day`, `landmark`, `ocean-coast`, `biome-snow`; presence control = UI frames 0.000%.
- [ ] **Step 7: Commit** with the band numbers and the opened-frame verdict.

### Task 3: Hole-punch the ring by the loaded-chunk set (QUEUE R3.9 — fixes R3.4, R3.5, R3.6)

Review #2 showed no FIXED sink can be right: the sink must be deep exactly where a chunk IS loaded, and that set
changes continuously (Terrain keeps chunks to `renderDistance + 2`, and streams the square in over seconds). So
the ring stops guessing: it is drawn at the true surface everywhere and DISCARDS every fragment over a loaded chunk.

**Files:**
- Create: `frontend/src/world/loadedChunks.js` — the loaded-chunk registry (Terrain's mounted set, now the ONE set
  `getGeneratedChunks` also returns) + `buildLoadedMask` + the generated `loadedMaskGlsl`.
- Create: `frontend/tests/gates/loaded-chunk-mask-gates.test.js`.
- Modify: `frontend/src/world/Terrain.jsx` (mount/unmount/clear go through the registry), `farField.js` (land at the
  true top, water sunk only below the deepest wave trough, canopy everywhere, `canopyFrom` deleted),
  `FarField.jsx` (R8 mask texture + `vFarXZ` varying + the spliced discard), `far-field-gates.test.js`.

**Interfaces:**
- Produces: `markChunkLoaded(key)`, `markChunkUnloaded(key)`, `clearLoadedChunks()`, `loadedChunkSet() -> Set<string>`,
  `loadedChunksVersion() -> number`, `LOADED_MASK_SIZE = 32`,
  `buildLoadedMask(keys, centreCx, centreCz, size, out) -> { data: Uint8Array, originX, originZ, size }`
  (texel `(i, j)` = chunk `(originX + i, originZ + j)` at `data[j * size + i]`), `loadedMaskGlsl(size) -> string`
  reading `vFarXZ`, `uMaskOrigin`, `uLoadedMask`. `FAR_WATER_SINK` (derived from the wave table).

- [ ] **Step 1: Failing tests** — the mask indexes a known key set (negative coords, out-of-range keys dropped); the
  generated GLSL, INTERPRETED against a nearest-sampling model of the DataTexture (`flipY = false`: row `j` is
  `v = (j + 0.5) / size`), discards exactly where `floor(x/16)_floor(z/16)` is loaded, swept across chunk edges on an
  ASYMMETRIC key set; the registry bumps its version only on a real change; land vertices at `top + canopy`;
  `FAR_WATER_SINK` exceeds the sum of the wave amplitudes by at most 0.5 m.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run → PASS**, lint, build.
- [ ] **Step 5: Mutation-prove** — mask origin off by one chunk; u/v swapped; `floor` → `round`; the discard deleted
  (structural); Terrain's mount stops registering; the version bumped on a no-op; water sink below the trough depth.
- [ ] **Step 6: SEE it** — same-renderer capture A/B in the worktree; open the horizon frames and an ocean frame.
- [ ] **Step 7: Commit** with call-site counts.
