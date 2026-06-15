# Vertex AO (S1) — Implementation Plan

> **For agentic workers:** the world-purpose milestone's #1 flat-read fix. STRUCTURAL lever (the 4 gentle
> global postproc/lighting knobs — aerial/fill/bloom/exposure — were all marginal-or-locked in the bold-flat
> NEUTRAL pipeline; AO adds geometry-grounded occlusion that WILL visibly read). Built TDD red-first; the
> AO MATH is pinned by a unit test BEFORE the fiddly mesher wiring. Capture-deterministic (pure geometry).

**Goal:** Bake per-vertex ambient occlusion into the voxel mesh so concave corners / crevices / under-overhangs
read with soft shadow = visible FORM, instead of the current flat-shaded-per-face look.

**Architecture:** the greedy mesher (`frontend/src/world/terrain.worker.js` `generateMesh`) emits each face as a
greedy-merged quad (4 corners c0-c3, w×h span, 12 axis/dir cases at lines ~685-748). AO is computed per emitted
corner from the 3 voxels diagonally adjacent to that corner on the face's OUTWARD (+normal) side, baked into a
NEW geometry attribute `aAO`, transferred to the main thread, set on the BufferGeometry, and multiplied into
`diffuseColor` in the `Terrain.jsx` terrain shader BEFORE lighting.

**Tech stack:** simplex greedy-mesher worker, Three BufferGeometry custom attribute, MeshStandardMaterial onBeforeCompile.

---

## Merge-interaction decision (the crux)

The classic problem (0fps "Ambient occlusion for Minecraft-like worlds"): a GREEDY-merged quad spans many voxels,
but per-corner AO varies across that span. Two approaches:

- **Option A (correct, higher-risk):** AO-AWARE MERGE — compute the 4-corner AO per cell during the mask build,
  and only merge cells whose AO corners match (extend the `mask[...] === val` equality at lines 656/665 to also
  compare AO). Pixel-correct voxel AO, but rewrites the core merge condition.
- **Option B (approximate, low-risk — CHOSEN FIRST):** compute AO only at the 4 EMITTED corners of each greedy
  quad (after merge), interpolated across the quad by the GPU. Approximate on big merged flat faces (top plains —
  but those are open/low-occlusion anyway, so the error is benign), and ACCURATE-enough on the small step/side
  faces (cliffs, the "dark slope", crevices) where AO matters most + quads are small. NO merge-condition change
  = low risk. Ship B first; A is a follow-up only if B's big-flat-face interpolation reads wrong on the LOOK.

## Slices / steps

### Step 1 — Pure AO kernel + red-first test
- [ ] Create `frontend/src/world/vertexAO.js`: `export function cornerAO(side1, side2, corner)` (booleans = is-that-occluder-solid)
  returning 0..3 (the 0fps formula): `if (side1 && side2) return 0; return 3 - (side1 + side2 + corner);` (3 = open/bright, 0 = most occluded).
- [ ] Red-first `frontend/tests/world/vertexAO.test.js`: both sides solid -> 0; one side + corner -> 1; one side only -> 2; fully open -> 3; corner-only (no sides) -> 2.
- [ ] Run -> RED (file missing) -> implement -> GREEN.

### Step 2 — Wire AO into the mesher (Option B)
- [ ] In `generateMesh`: add `const ao = []`. For each emitted quad, for each of c0-c3, determine the corner's outward
  neighborhood and call `cornerAO`. The outward side = `+normalVector` (the face's outside). For a corner at grid
  position P on the face plane, the 3 occluders are the two edge-adjacent voxels + the diagonal voxel, all offset
  by +normal into the air side. Work the offsets out PER the 12 cases (d 0/1/2 x dirFlag +/-) using the existing
  c0-c3 grid coords + `getBlock` (which already samples neighbors, returns 0 across chunk edges). Push 4 AO values
  (one per corner, mapped c0->c3) into `ao` each quad. SKIP the water-top special-case faces (keep their AO = 3,
  flat — water has its own treatment). Cross-chunk edges: getBlock=0 (treated as air/open) -> seam AO may be
  slightly bright at chunk borders (minor, note it).
- [ ] Transfer: add `ao: new Float32Array(ao)` to the `meshData` postMessage payload (both the `generate` and the
  re-mesh `update` postMessage sites ~lines 61-76 and 115-130) + add its `.buffer` to the transfer list.

### Step 3 — Geometry attribute + shader (Terrain.jsx)
- [ ] Where the worker `onmessage` builds the BufferGeometry from meshData (the main-thread mesh-apply): add
  `geometry.setAttribute('aAO', new THREE.BufferAttribute(meshData.ao, 1))` alongside position/normal/color/uv.
- [ ] `compileShader` vertex preamble: `attribute float aAO;` + `varying float vAO;`; in the begin_vertex inject set `vAO = aAO;`.
- [ ] Fragment preamble: `varying float vAO;`. In the `<color_fragment>` injection (after diffuseColor is set, BEFORE
  the opaque_fragment lighting): `diffuseColor.rgb *= mix(AO_MIN, 1.0, clamp(vAO / 3.0, 0.0, 1.0));` with
  `AO_MIN ~ 0.55` (tunable: lower = deeper occlusion). Capture-deterministic (pure geometry attribute; no time/camera).

### Step 4 — Verify
- [ ] `npx vitest run` GROWS (+ vertexAO test). `npm run build` clean.
- [ ] `npm run visual:capture` then the gate -> this WILL change MANY frames (intended — every voxel corner gets
  occlusion). Deliberate re-baseline of the changed frames; `git diff HEAD --stat`; HD-LOOK EACH changed frame —
  corners/crevices/the step-faces should read with soft shadow (FORM), NOT muddy/over-dark or seam-striped.
- [ ] `node scripts/visual/pov-probe.mjs` + LOOK (player-eye world should read with depth now).
- [ ] Commit (vertexAO.js + test + terrain.worker.js + Terrain.jsx + baselines) + push + CHANGELOG + ACTIVE_PLAN +
  add the before/after to the KEVIN-REVIEW batch-taste set.
- [ ] If the AO geometry reads wrong (over-dark / seam stripes / inverted) after 2 tuning attempts -> STUCK: stop,
  2 hypotheses (e.g. corner->occluder offset mis-mapped per axis; or the merge-interpolation artifact on big faces
  -> switch to Option A AO-aware-merge, OR a simpler per-quad single-AO darkening).

## Notes
- AO is baked AT MESH TIME in the worker (not a per-frame re-mesh from combat) -> the NO-RE-MESH invariant is fine.
- This is the first of the two STRUCTURAL levers; the second is surface-texture fidelity (proceduralTextures
  32->128px + normal/AO/emissive maps — the audit's "biggest single lever for stunning land").
- Re-baselines batch into ONE KEVIN-REVIEW taste review (Kevin 2026-06-15 cadence).
