# M4 — Living World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the world feel ALIVE — revive the dead wind-grass, give landmarks real presence, add distance, and make biomes read distinctly. (Audit theme-1: "static / dead world".)

**Architecture:** Mostly *reviving + wiring existing-but-dead systems* (the audit's recurring pattern). `OptimizedGrassSystem.jsx` is a complete per-chunk instanced grass renderer with a wind-sway + proximity-bend shader AND capture-determinism — it's just **never mounted**. The blocker is a per-chunk grass-top position source (the terrain worker emits greedy-mesh quads, not per-block positions). Slice 1 adds a sparse grass-top emit to the worker (gen-time, NO-RE-MESH) and mounts the grass renderer per chunk. Later slices: landmark presence, far-LOD, biome distinctness.

**Tech Stack:** R3F instancedMesh, custom onBeforeCompile wind shader, the terrain Web Worker + ChunkMesh, vitest. JS/JSX.

**Locks honored:** bold-flat (stylized blade grass, NearestFilter, no PBR — NOT photoreal), BLOOM>=0.85, NEUTRAL tonemap, Ember+Blight. Stylized voxel grass only.

**Capture-determinism:** `OptimizedGrassSystem` ALREADY freezes the wind clock + seeds particle RNG under `isCaptureMode()`. Grass DOES appear in the explore/hearth capture frames (ground vegetation) → those frames WILL change → **deliberate re-baseline** (pov-probe LOOK-review each). Wind must stay frozen in capture so the re-baselined frames are byte-stable.

**Grounded live facts (Phase-B verified 2026-06-16):**
- `OptimizedGrassSystem` (`src/OptimizedGrassSystem.jsx`, 202 lines): `({ chunkX, chunkZ, blockPositions })` → filters `blockPositions` for `blockType === 'grass'`, caps 50/chunk, renders an instancedMesh (grass blades, `grassMaterial` with the wind+bend shader) + 8 particle motes. Capture-safe (freezes wind, seeds RNG). **Imported at `Components.jsx:59` but NEVER mounted (no `<OptimizedGrassSystem` JSX anywhere) → dead.**
- Chunks render via `<ChunkMesh>` (`Terrain.jsx:931`); the worker (`terrain.worker.js`) generates blocks + greedy-meshes, emitting mesh data — NOT per-block positions. `BLOCK_ID_MAP` (Terrain.jsx:599) maps code 1→'grass'. So a grass-top position list does not exist yet.
- The worker knows each column's surface during gen (the S6 ore work used surfaceY + block codes) → it can collect grass-top `[x, surfaceY+1, z]` cheaply at gen-time.

---

## Slice 1 (multi-commit) — revive the wind-grass (#5)

### 1a — worker emits sparse grass-top positions
**Files:** `frontend/src/world/terrain.worker.js` (collect grass-tops during gen, add to the chunk postMessage), a new pure `frontend/src/world/grassField.js` (`grassTops(surfaceCodes, originX, originZ)` → `[[x,y,z]]` for grass-coded tops, capped/strided) + test.
- [ ] TDD `grassTops`: given a chunk's top-block codes (1=grass), returns world positions for grass tops only, strided/capped for density. (Pure — the worker calls it; main-thread tests cover it.)
- [ ] Worker: during the existing surface pass, record the top block code per column; after gen, call `grassTops(...)` and include `grassTops: [...]` in the chunk `postMessage`. NO extra mesh work (gen-time only).

### 1b — mount the grass renderer per chunk
**Files:** `frontend/src/world/Terrain.jsx` (thread `grassTops` from the worker payload into chunk state; mount `<OptimizedGrassSystem chunkX chunkZ blockPositions={grassTops-as-[x,y,z,'grass']} />` next to each `<ChunkMesh>`), source-gate.
- [ ] Adapt the prop shape: `OptimizedGrassSystem` filters `[x,y,z,blockType]` for `'grass'` — pass `grassTops.map(([x,y,z]) => [x,y,z,'grass'])` (or adjust the component to accept positions directly — prefer the smaller change). Mount only for chunks that have grass tops.
- [ ] Gate-test the mount + the worker emit + the pure `grassTops`.
- [ ] **Verify + deliberate re-baseline:** unit grows · build · eslint · `npm run visual:capture` → the explore/hearth frames gain grass → pov-probe LOOK (real play, ground-level) to confirm the grass reads as stylized bold-flat (not noisy/photoreal) → re-baseline the changed frames (cp current→baseline) after the LOOK → re-gate 20/20. Commit per 1a / 1b.

## Slice 2 — real landmarks (#8)
Shrines + the Blight-Heart lair are navigable (M-S8/S9) but visually flat geometry. Ground `world/shrines.js` + `world/blightHeart.js` + their render. Give them silhouette + an emissive beacon that reads at distance (bold-flat, BLOOM-rides) without crossing the glow lock — surface the glow-amount to Kevin #50 if it approaches it. Deliberate re-baseline (landmark frames). Commit.

## Slice 3 — far-LOD (#18)
Distant terrain falls off / pops. Ground the chunk load radius + any LOD in Terrain.jsx. Add a cheap far-distance silhouette/fog-blend so the horizon reads as depth, not a hard edge. Capture-safe or deliberate re-baseline. Commit.

## Slice 4 — biome distinctness (#12)
`world/biomeTable.js` + `pickBiome` exist; verify biomes read DISTINCTLY (color/tile/foliage variation). A focused per-biome tint/foliage pass. Deliberate re-baseline. Commit. -> mark M4 COMPLETE.

---

## Self-Review
- **Spec coverage:** S1 #5 wind grass (revive the dead system), S2 #8 landmarks, S3 #18 far-LOD, S4 #12 biomes — audit theme-1.
- **Reuse:** S1 revives `OptimizedGrassSystem` (shader + determinism already done) — the work is the position source + the mount, not a new shader.
- **Determinism:** wind frozen in capture (already); grass appears in capture frames → deliberate LOOK-reviewed re-baseline, NOT a leak.
- **NO-RE-MESH:** the grass-top emit is gen-time sparse data; grass is a separate instanced overlay, never a terrain re-mesh.
- **Anti-tunneling:** per-slice commits (1a worker+pure, 1b mount, then 2/3/4).
