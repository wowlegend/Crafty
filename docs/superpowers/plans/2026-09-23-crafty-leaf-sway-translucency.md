# Leaf Sway + Translucency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canopies move in the wind and glow when the sun is behind them — every forest, and every back-lit dawn
and dusk, reads alive instead of lit like stone (EXTERNAL-BASELINE-R2 #2, score 2.5: Minecraft Vibrant Visuals
ships leaf subsurface scattering; only Crafty's grass blades sway today).

**Architecture:** Two terms in the terrain program, both gated on the leaves layer (block 7), both built in one
pure module `world/leafFeel.js` (constants + GLSL generators + JS twins a node test drives):
1. **Sway (vertex):** `transformed.xz += leafSway(worldPos, uTime)` for leaf vertices only. The phase is a slow
   function of WORLD position, not of the quad: greedy-merged leaf quads keep their corners on world positions, so
   neighbouring blocks share a displacement and a large canopy moves as one soft mass instead of shearing.
   Amplitude <= 0.05 m, so the seam where a leaf face meets a trunk face opens by at most that.
2. **Translucency (fragment):** `totalEmissiveRadiance += linear(leafTex) × sunColour × T × back × day`, where
   `back = pow(max(dot(-viewDir, sunDir), 0), p)` (looking TOWARD the sun through the canopy), and `day` fades the
   term out below the horizon. One term, no MERS maps, no second pass.
Both run on `uTime` / `uSunDir`, which the terrain already drives from the CAPTURE-aware clock (`frameElapsed`), so
the capture frames stay deterministic.

**Tech Stack:** three 0.172 `onBeforeCompile`, vitest, a puppeteer probe via `_serve.mjs`.

**Spec:** this document. Source: `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE-R2.md` item 2 and its *verify*.

## Global Constraints

- Only block 7 moves or glows: every other block's vertices and pixels are unchanged (asserted by a probe diff).
- Capture determinism holds: the sway reads `uTime`, which is the capture clock under capture.
- Bold-flat lock: no normal maps, no new textures.
- No backtick inside the shader template literals; AST-safe edits; zero emoji in `src/`.
- The visual oracle is NOT rewritten; frames with trees will diff, recorded as an intended look change.

## Review Focus

1. A leaf face meeting a trunk face: the seam must not flash sky at full sway (amplitude bound + a frame looked at).
2. A 10-block merged leaf quad: it must bend as a mass, not tear or fold (world-position phase).
3. Noon from above: translucency must be ~0 (the sun is not behind the canopy), not a green wash.
4. Night: no translucency at all (the day factor), and sway continues (wind does not stop at night).
5. The far field averages the leaf layer: it must neither sway nor glow (no patch there; asserted).

---

### Task 1: `world/leafFeel.js`, pure

**Produces:** `LEAF_LAYER = BLOCK_ID.leaves`, `SWAY_AMP` (<= 0.05), `leafSway(x, z, t)` -> `[dx, dz]` (JS twin),
`backLight(dotVS)` (0 below 0, rising with the power), `leafFeelGlsl()` -> `{ vertex, fragmentDecl, fragment }`.

- [ ] Step 1: failing tests — |leafSway| <= SWAY_AMP everywhere on a grid of (x, z, t); two points 1 block apart
  move by nearly the same vector (|diff| < SWAY_AMP / 4: a merged quad cannot shear); the sway changes with t (it
  moves); backLight(1) = max, backLight(0) = 0, backLight(-1) = 0; the GLSL gates on the leaves layer, carries
  the JS constants, and adds into `transformed` and `totalEmissiveRadiance`.
- [ ] Step 2: implement; mutation (mutate.sh): the layer gate dropped (every block sways); plausible-wrong: a
  per-quad phase (neighbours diverge); the back-light sign flipped (glows when the sun is BEHIND the viewer).

### Task 2: the terrain program

- [ ] Wire the vertex term after `<begin_vertex>` (vBlockType is set in main, above) and the fragment term after
  `<emissivemap_fragment>`, next to the ore glow. Build; bundle budget.

### Task 3: prove it in frames

- [ ] A probe: two frames 0.5 s apart in real play at a forest edge — leaf pixels changed, trunk and ground pixels
  identical (a control region each). A dusk frame facing the sun through a canopy vs the same frame with the term
  off: leaf pixels brighter, non-leaf pixels 0.000%. OPEN both and look.

### Task 4: review with the ore glow.
