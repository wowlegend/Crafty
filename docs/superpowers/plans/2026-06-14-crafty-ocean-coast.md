# Ocean / Coast SOTA Pass — Implementation Plan

> **For agentic workers:** built slice-by-slice in the autonomous loop. Each slice: red-first where there's
> pure logic, render-affecting → re-capture + `git diff HEAD` + HD self-eyeball EACH changed frame +
> `node scripts/visual/ocean-probe.mjs` (clean HUD-hidden coast/surface/underwater views) before "done".

**Goal:** Make the ocean read as a SOTA stylized sea from the surface — Kevin's #1 ask ("why is the ocean still looking unchanged"). Keep the voxel identity; add the signatures that make stylized water "read as ocean".

**Architecture:** Voxel water (a mesh of water blocks topped at SEA_LEVEL=28), one shared `waterMaterial` (MeshStandardMaterial + `onBeforeCompile`) in `frontend/src/world/Terrain.jsx`. The mesher runs in `frontend/src/world/terrain.worker.js`; ocean profile in `frontend/src/world/oceanProfile.js`. Because the water TOP face is uniformly at SEA_LEVEL, anything that varies by *seabed depth* or *shore proximity* on the top surface needs a per-vertex attribute baked at mesh time (the shader alone can't know it).

**Tech stack:** Three.js MeshStandardMaterial onBeforeCompile (GLSL injection), greedy-mesher worker, R3F.

---

## Reference-lock (SOTA stylized water — verified via web search 2026-06-14)

Consistent signature across Roystan toon-water, gameidea, 80.lv "Nimue", engineered.at, Moonjump:
1. **Depth-based color gradient** — bright teal shallows → navy deep (Beer-Lambert approx; HSV lerp for vibrancy).
2. **Shoreline foam line** — a bright/white foam band where water meets land/objects. THE "reads-as-ocean" element.
3. **Waves** — Gerstner/noise displacement, more visible near shore.
4. **Specular sun glint + Fresnel** reflection.
5. **Atmospheric perspective** — distant water blends to sky color (no hard horizon line).

## Current state (assessed via ocean-probe 2026-06-14)

- EXISTS: vertex wave (amp 0.12), a depth-tint to deep-navy `vec3(0.015,0.09,0.20)` driven by `vWorldY` (so it shades the **side/underwater faces** only), night bioluminescence.
- MISSING / weak: the **top surface is a flat `#3F76E4`** (the depth-tint can't reach it — top face Y is ~SEA_LEVEL everywhere), **no shore foam** (grass meets water abruptly), no specular glint, base color reads a touch dark/un-tropical. The teal *is* there from a good angle, but it's uniform + edgeless.

---

## Slices

### Slice 1 — Surface lift (shader-only, lowest risk): brighter tropical base + sun specular glint
**Files:** Modify `frontend/src/world/Terrain.jsx` (the `compileShader` fragment, water-gated branch).
- [ ] Reference-lock the target shallow color (a brighter teal-cyan than `#3F76E4`, e.g. ~`#2E8FB8`/tunable) — pick on the probe.
- [ ] In the water-gated fragment branch, add a sun specular term (normal·view Fresnel-ish rim or a sun-dir glint) so the surface catches light instead of reading matte. Keep it gentle (stylized, not mirror).
- [ ] Capture-determinism: the glint must be deterministic in capture (use the frozen sun dir / static view; no time-driven sparkle unless `!isCaptureMode`-gated).
- [ ] Verify: `npm run build`; `node scripts/visual/ocean-probe.mjs` → eyeball surface-skim + topdown (livelier, not flat); `npm run visual:capture` + `npx vitest run --config vitest.visual.config.js` → re-baseline `ocean-depth` (+ any water-bearing frame) deliberately, `git diff HEAD` to confirm which frames changed + HD-eyeball each.

### Slice 2 — Shore foam (the signature)
**DESIGN FINDING (2026-06-14, verified in `generateMesh`):** the mesher is GREEDY — all water-top faces share `val = 9|(1<<8)` and merge into ONE quad at SEA_LEVEL, and a merged quad's 4 corners all get the same vertex color. So the original "per-vertex `shoreT` attribute on a merged quad" can't vary per-column (it'd be uniform). **CHOSEN APPROACH = Hyp A — unmerge water-top faces + bake per-block data into the spare color channels** (`color.r` already = blockType; `color.g`/`color.b` are 0/unused). This ALSO enables Slice 3's per-column depth-grade with the same one-time mesher change. (Alternatives rejected: Hyp B sparse foam-geometry stream = perf-safe but a whole new mesh pipeline for foam-only; Hyp E wet-sand block = changes terrain gen/block-types.)
- [x] **S2a (DONE):** pure `shoreFoamFactor(self, above, neighbors)` + `isWaterTop` in `world/oceanProfile.js` (foam=1 iff water-top cell with a solid-land neighbor) + red-first `tests/gates/ocean-foam-kernel.test.js` (4 tests). The kernel the mesher will call.
- [x] **S2b (DONE):** in `terrain.worker.js` `generateMesh`, special-cased the water-top face (`d===1 && dirFlag===1 && blockType===9`): forced `w=1,h=1` (the w & h greedy loops guarded by `!isWaterTopFace`) and wrote `color.g = shoreFoamFactor(getBlock self/above + 4 horizontal neighbors at y=q)`. All other faces stay greedy. (Cross-chunk-edge shoreline foam can miss — `getBlock`=0 across edges — minor, noted.)
- [x] **S2c (DONE):** `Terrain.jsx` — added `varying float vFoam` (= `color.g`) and a POST-lighting foam mix in the water opaque_fragment branch (`mix(gl_FragColor.rgb, vec3(0.95,0.98,1.0), vFoam*0.85)`). Post-lighting because an albedo mix got lit + lost contrast against the bright teal (debugged with a magenta probe: detection was fine, it was visibility). Static → capture-deterministic.
- [x] **Verified:** build clean; ocean-probe shows a crisp white foam line at every shore (topdown + surface-skim); full vitest 1181 (+ `ocean-foam-wiring.test.js` locks the pipeline). Visual 19/19, NO re-baseline — the foam isn't in any of the 19 capture cameras' views (ocean-depth is underwater; others shift <6%). COVERAGE GAP for S4: add a coast capture state so the foam is pixel-gated.

### Slice 3 — Depth-graded TOP surface: mesher per-vertex seabed depth + shader gradient
- [x] **DONE:** pure `seabedDepthT(waterTopY, seabedY)` in `world/oceanProfile.js` (red-first, +1 test in `tests/world/oceanProfile.test.js`). In `terrain.worker.js` water-top branch, scan DOWN the chunk column for the seabed (first solid) and write `color.b = seabedDepthT(q, seabedY)` alongside the S2 foam. In `Terrain.jsx`, `varying vDepthB` (= color.b) grades the top surface shallow-teal -> deep-navy in the water color_fragment (complements the side-face vWorldY tint so surface + walls agree). Within-chunk down-scan -> no cross-chunk seam.
- [x] **Verified:** build clean; ocean-probe shows the surface grading bright-teal shallows -> darker offshore (topdown + surface-skim), foam intact. vitest 1182.

### Slice 4 — Polish + pixel-gate
- [x] **COAST CAPTURE STATE (DONE — the key item):** added an `ocean-coast` capture state in `capture.mjs` (a high 3/4 over the x~-40 shoreline framing the foam line + the depth grade) + `'ocean-coast'` in the diff `STATES` (gate 19->20), baselined. This FINALLY pixel-gates the S2 foam + S3 depth (ocean-depth is underwater; nothing else framed the surface). NOTE: md5 isn't byte-stable run-to-run (sub-perceptual bloom/dither) but it PASSES the 6% pixelmatch gate reliably (20/20 against a fresh capture) — the same contract every other state meets; md5 was the wrong bar.
- [x] **Daytime biolum:** already correct — `nightFactor = 1.0 - timeOfDay` = 0 at midday, so no daytime glints (the glints in early probes were the S1 sun sheen, not biolum). No change needed.
- [x] **Wave + horizon:** judged good-enough — the vertex wave reads (finer now post-S2 unmerge) and the existing height-fog (`render/Atmosphere.jsx` FOG_SEA_LEVEL) already blends distant water toward the sky. Deferred further tuning as low-ROI; the ocean reads SOTA (teal + sheen + foam + depth). **OCEAN MILESTONE COMPLETE.**

---

## Verify / done bar (every slice)
- `npm run build` clean · `npx vitest run` count holds-or-grows (never weaken a gate) · visual 19/19 OR a deliberate, eyeballed re-baseline of ONLY the water-bearing frames (confirmed via `git diff HEAD`).
- `node scripts/visual/ocean-probe.mjs` re-run + I LOOK at the result myself.
- Commit per slice (no AI footer, explicit adds, leave `.state/`), push, update CHANGELOG + ACTIVE_PLAN.
- Kevin: taste sign-off async (KEVIN-REVIEW #37 already invited a specific-look preference). swiftshader ≈ GPU; the final color/foam taste is a Kevin confirm.
