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

### Slice 2 — Shore foam (the signature): mesher per-vertex shore-proximity + shader foam band
**Files:** `frontend/src/world/terrain.worker.js` (bake a per-vertex `shoreT` attribute on water top-surface verts — 1.0 adjacent to a land/beach column, fading over ~1–2 blocks), `frontend/src/world/Terrain.jsx` (read the attribute; in the fragment, `mix` toward a near-white foam color where `shoreT` high, modulated by a cheap animated noise for an organic edge).
- [ ] Pure unit: a `shoreProximity(col, neighbors)` helper (testable without GL) → red-first test.
- [ ] Mesher: attach the attribute on water surface quads only (don't perturb existing geometry/byte-determinism elsewhere).
- [ ] Shader: foam band + subtle crest noise; foam brightest at the edge, fades seaward.
- [ ] Verify: build; ocean-probe (a clear foam line at every shore); capture + re-baseline water frames + `git diff HEAD` + eyeball; full vitest holds-or-grows.

### Slice 3 — Depth-graded TOP surface: mesher per-vertex seabed depth + shader gradient
**Files:** `terrain.worker.js` (bake `seabedDepthT` per water top vertex = (SEA_LEVEL − seabedY)/maxDepth), `Terrain.jsx` (grade the top-surface color shallow-teal → deep-navy by it, HSV-ish lerp; complements the existing side-face depth-tint so surface + walls agree).
- [ ] Pure unit for the depth→T mapping (red-first).
- [ ] Verify: build; ocean-probe (shallows read bright, deeps read dark from above); capture re-baseline + `git diff HEAD` + eyeball; vitest holds.

### Slice 4 — Polish: wave variety + daytime biolum check + horizon blend
**Files:** `Terrain.jsx` (wave amplitude/secondary frequency tune; confirm night-biolum `nightFactor` is ~0 at midday so no daytime glints), `render/Atmosphere.jsx` (confirm distant water fogs toward sky — avoid a hard horizon).
- [ ] Verify each render change via ocean-probe + capture re-baseline + `git diff HEAD` + eyeball; vitest holds.

---

## Verify / done bar (every slice)
- `npm run build` clean · `npx vitest run` count holds-or-grows (never weaken a gate) · visual 19/19 OR a deliberate, eyeballed re-baseline of ONLY the water-bearing frames (confirmed via `git diff HEAD`).
- `node scripts/visual/ocean-probe.mjs` re-run + I LOOK at the result myself.
- Commit per slice (no AI footer, explicit adds, leave `.state/`), push, update CHANGELOG + ACTIVE_PLAN.
- Kevin: taste sign-off async (KEVIN-REVIEW #37 already invited a specific-look preference). swiftshader ≈ GPU; the final color/foam taste is a Kevin confirm.
