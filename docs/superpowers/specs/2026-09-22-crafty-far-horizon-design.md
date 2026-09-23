# Far horizon — a heightfield impostor beyond the loaded chunks (design)

**Status:** self-gated per LOOP-CHARTER §4 · 2026-09-22 overnight · EXTERNAL-BASELINE runner-up #1 ("far-horizon
heightfield impostor — highest LOOKS ceiling").

## Read-before-architect

Read: `world/heightAt.js` (the one surface formula), `world/climate.js` (`surfaceBlockAt`, the main-thread sampler
that already shares it), `world/biomeTable.js` (`pickBiome`, `BIOME_TINT`), `world/oceanProfile.js`,
`render/Ocean.jsx` (a 220 m wave plane re-centred under the camera), `GameScene.jsx` (shadow extent derived from
`renderDistance`; camera far 500), `render/quality.js` (`renderDistance` 2/3/4 chunks of 16), `world/Terrain.jsx`
(the chunk streamer, aerial haze). They cover: the formula for any column's surface, the biome at it, near water,
and the near terrain out to `(renderDistance + 0.5) × 16` = 72 m at high. My proposal extends them by a far ring
that samples the SAME `surfaceBlockAt` — no new terrain formula.

## Goal

At the high tier the world ends at ~72 m (terrain) / ~110 m (ocean plane) and the camera sees 500 m. Past the
loaded square there is fog over sky colour: **the world reads small**, which EXTERNAL-BASELINE rates a Major LOOKS
and PLAY gap. Goal: land and sea continue to the horizon with the silhouette, colour and biome of the real world.

## Metric (what "done" means, and what it must not break)

1. In the gated outdoor frames (`explore-day*`, `landmark`, `ocean-coast`, `biome-snow`, `hearth`) the band between
   the loaded terrain and the horizon shows terrain — measured as a localised diff in that band, with the UI frames
   at 0.000% as the presence control — and the opened frames show land, not a seam or a floating sheet.
2. The near terrain is unchanged: the impostor is sunk below the real surface, so where a chunk is loaded the real
   chunk wins the depth test. Asserted per vertex in a pure test; checked in the frames.
3. Cost: ONE draw call; ≤ 12k vertices; a rebuild ≤ 15 ms on this machine, and only when the player has moved a
   whole re-centre step. Measured, not assumed.
4. Capture stays deterministic: the ring is a pure function of the (pinned) player position.

## Strategy (derived from the metric)

- **Pure core** `world/farField.js`: `farFieldGeometry({ cx, cz, r0, r1, rings, sectors, sample })` returns
  positions + colours for a polar ring from `r0` (the loaded half-extent) to `r1` (420 m), radial spacing growing
  geometrically (fine near, coarse far). `sample(x, z)` is injected, so the test drives synthetic worlds and the
  component passes the real `surfaceBlockAt`.
- **Height:** the generated surface, water at `SEA_LEVEL`, then `FAR_SINK` (2 m) below it. Forested biomes get a
  canopy lift (their trees are what the silhouette is made of) and blend toward the leaves colour by an explicit
  per-biome coverage table.
- **Colour:** each block's colour is the MEAN of its own texture tile (the same average the tile converges to at
  distance), times the biome tint for tinted blocks (`terrainTint.BIOME_TINTED_BLOCKS`) — so near and far agree by
  construction. Water uses the ocean's deep colour.
- **Component** `world/FarField.jsx`: one mesh, `MeshStandardMaterial` with vertex colours and flat shading, so the
  sun, ambient, fog and height fog light it like the terrain. Re-centred on a snapped grid (32 m) — never per frame —
  so the ring does not swim, and rebuilt only when the snapped centre changes.

## Anti-attack (if this succeeds perfectly, what breaks?)

- **It shows the world is mild.** Relief is 6–58 m, so a perfect far field reveals gentle plains. Still far better
  than a void; the answer to "boring horizon" is terrain generation, not hiding it.
- **Seams.** Where the ocean plane ends (110 m) its waves meet the far field's flat water. Mitigation: far water sits
  below the plane inside its radius, and its colour matches the ocean's deep colour. Checked in `ocean-coast`.
- **Show-through.** A dug hole or a cave mouth inside `r0` could reveal the sunk surface. The ring starts at `r0`,
  outside where the player digs; inside the loaded square corners (72–102 m) it sits 2 m under real terrain.
- **Proxy mismatch.** "Pixels changed in the band" is satisfied by a broken ring too, so the frames are OPENED, and
  the per-vertex sink property is asserted directly rather than inferred from pixels.

## Out of scope

Structures, individual trees, player edits and shadows on the far field; LOD stitching with a mesher (the sink
avoids needing it); a WebGPU impostor. Cloud shadows on the far field are a one-line follow-up once both land.
