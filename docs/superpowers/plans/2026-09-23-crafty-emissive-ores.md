# Emissive Ores Implementation Plan (glowing ore nuggets at night)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At night an exposed iron, gold or diamond ore face GLOWS: only the nuggets, in their own colour, haloed
by the existing bloom, so ores become the wayfinding reward the external baseline found missing (R2 item #3,
score 2.5). By day nothing changes.

**Architecture:** One per-layer emissive table built on the CPU (`world/oreGlow.js`, the same shape as the
biome-tint mask: a pure function a node test drives) and one term in the terrain shader, patched in after
three's `<emissivemap_fragment>`: `totalEmissiveRadiance += linear(texColor) × layerGlow[layer] × nugget(texColor)
× night(uSunDir.y)`. `nugget` is a CHROMA mask — the ore tiles' stone matrix is grey (`c, c, c+3`), the nuggets
are saturated — so the stone between nuggets never glows. The constants are interpolated into the GLSL from the
JS module, and the node test evaluates the SAME formula over the real texture bytes.

**Tech Stack:** three 0.172 `onBeforeCompile` (MeshStandardMaterial), the existing `sharedVoxelTextures()`
DataArrayTexture, the existing postprocessing Bloom (threshold 0.65), vitest, a puppeteer probe via `_serve.mjs`.

**Spec:** this document (a single-term look change). Source: `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE-R2.md`
item 3 and its *verify* line.

## Global Constraints

- Bold-flat LOCK: no PBR maps, no normal maps, no new texture — the glow reads the existing tile bytes.
- Day frames unchanged: the term is multiplied by a night factor that is exactly 0 while the sun is up.
- Non-ore pixels unchanged: the term is multiplied by a per-layer table that is exactly 0 off the ore layers.
- Coal does NOT glow (it is not luminous, and its nuggets are achromatic — the chroma mask gives 0 anyway).
- No new dependency; zero emoji in `src/`; AST-safe edits; no backtick inside the shader template literals.
- The 31-image visual oracle is NOT rewritten (the 147->151 re-baseline is Kevin's); night capture frames that show
  an ore face will diff, and that is recorded, not "fixed".

## Review Focus

1. The stone matrix of an ore tile glowing (the mask must be per TEXEL, not per layer).
2. A night frame with NO ore in view changing at all (the term must be exactly zero off the ore layers).
3. Dusk: the glow must fade in with the sun going down, not snap on at one frame.
4. Bloom halo size: a diamond face must not bloom into a white blob that hides the block edges.
5. The far field (`world/FarField.jsx`) averages the same texture — it must not start glowing (it has no
   `<emissivemap_fragment>` patch; asserted, not assumed).

---

### Task 1: the glow table and the nugget mask, pure

**Files:** Create `frontend/src/world/oreGlow.js`, `frontend/tests/gates/ore-glow-gates.test.js`.

**Produces:** `ORE_GLOW` (layer -> strength: iron 11 low, gold 12 mid, diamond 13 high; coal 10 = 0),
`oreGlowTable(layers)` -> `Float32Array(layers)`, `NUGGET_CHROMA` `[lo, hi]` for a smoothstep on
`max(rgb) - min(rgb)` of the sRGB texel, `nuggetMask(r, g, b)` (JS twin of the GLSL), `nightFactor(sunY)`
(1 at night, 0 by day, smooth through dusk), `oreGlowGlsl(layers)` -> `{ decl, apply }`.

- [ ] Step 1: failing tests —
  (a) the table: layers 0-9 and 14-15 are 0; coal 0; 0 < iron < gold < diamond; length = the texture array's depth;
  (b) the mask over the REAL tile bytes (`sharedVoxelTextures().image.data`): on each of layers 11-13, every stone
      matrix texel (the `c, c, c+3` pattern) masks to 0 and at least 5% of texels mask to >= 0.9 (the nuggets);
      on layer 3 (stone) and 10 (coal) every texel masks to 0;
  (c) `nightFactor`: 0 for sunY >= 0.1, 1 for sunY <= -0.15, monotonic between;
  (d) `oreGlowGlsl`: the decl declares a float array sized `layers`, the apply adds into `totalEmissiveRadiance`
      and names both thresholds from `NUGGET_CHROMA` (the GLSL cannot drift from the JS).
- [ ] Step 2: implement; PASS.
- [ ] Step 3: mutation (mutate.sh): the chroma mask dropped (stone matrix glows) -> (b) RED; coal given a glow ->
  (a) RED; plausible-wrong: the night factor inverted -> (c) RED; the table off by one layer -> (a) RED.

### Task 2: the shader term

**Files:** `frontend/src/world/Terrain.jsx` (uniform `uOreGlow`, decl in the fragment header, apply after
`#include <emissivemap_fragment>`).

- [ ] Step 1: a compiled-program gate (the clouds' pattern — `tests/gates` already compiles the terrain program
  through a headless GL context if one exists; if not, a structural slice gate bounded by the two landmarks
  `<emissivemap_fragment>` and `<lights_fragment_begin>`, named weak).
- [ ] Step 2: implement; build; `bundle-budget` green.

### Task 3: prove it in a frame

**Files:** `frontend/scripts/visual/ore-glow-probe.mjs` (registered in `_serve.mjs`'s port table).

- [ ] The probe boots the dev build, sets night (`setTimeOfDay`), places a diamond block through the real place
  verb in front of the camera next to a placed stone block, shoots, and measures the mean luminance of the diamond
  face's NUGGET pixels against the stone face (a control region, never the whole frame). Then the same at noon.
  Asserts: night ratio >= 1.5x the noon ratio; the stone face's luminance unchanged between the build with and
  without the term (presence control: zero the table and the night ratio falls to the noon ratio).
- [ ] OPEN the night frame and look at it: halo size, block edges readable, no glow on the stone matrix.
- [ ] Kill everything launched; sweep.

### Task 4: review

- [ ] `/code-review high` over the milestone with the next baseline item.
