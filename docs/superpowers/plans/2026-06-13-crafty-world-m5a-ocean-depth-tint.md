> **✅ SHIPPED (loop iter 118, 2026-06-13).** A `vWorldY` varying in the shared `compileShader` + a water-gated fragment mix toward deep-navy by `clamp((SEA_LEVEL−vWorldY)/22,0,1)*0.82` (SEA_LEVEL compile-time-injected from oceanProfile). Static → capture-stable. Verified: the tint is invisible top-down (surface = depth 0) so it had zero coverage → added an `ocean-depth` underwater fixture (probed deep basin [−40,0]) showing the navy-deepening column (HD-eyeballed); explore-day deliberately re-baselined (6.07% — water side-faces darken at the diorama angle). 923 unit (+3) · build · visual 15→**16/16**. M5b layered seabed (new blocks) deferred → folds with M4b. Commits T1 (shader) · T2 (fixture+re-baseline). NEXT = M6 landmarks.

# World M5a — Ocean Water Depth-Tint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Make the M2 divable oceans READ as deep. Water is currently a flat turquoise everywhere; M5a tints it so it **darkens + shifts toward deep-navy the further below the surface** a fragment is — visible at coastline water faces and dramatic when diving. The visible payoff for the M2 18–22-voxel basins.

**Architecture:** A surgical edit to the shared `compileShader` in `Terrain.jsx`. Add a **`varying float vWorldY`** (vertex→fragment; the fragment currently only has *view-space* `vViewPosition`, which is camera-relative — depth needs WORLD y), set it unconditionally in the vertex, and in the fragment's existing water-pixel path mix the diffuse toward a deep color by `depth = clamp((SEA_LEVEL − vWorldY)/DEPTH_RANGE, 0, 1)`. `SEA_LEVEL` is injected as a compile-time constant from the `oceanProfile` import (no uniform / no useFrame-pump needed — it's a constant). Water-GATED (the shared shader also compiles the opaque material; the tint is inside the `isWaterPixel` branch, exactly like the existing bioluminescence). Static (vWorldY is geometry, not `time`) → **capture-stable by construction**. NO new blocks (the layered seabed is M5b, folds with M4b). NO-RE-MESH (a material/shader change only).

**Tech Stack:** `Terrain.jsx` (`compileShader`), `world/oceanProfile.js` (the `SEA_LEVEL` const, imported), vitest (a static shader-structure gate — shaders aren't unit-testable; the visual gate is the look truth), the puppeteer visual gate (a deliberate re-baseline + likely an `ocean-depth` fixture).

**Live seams (verified this iteration — current lines):**
- `Terrain.jsx:35` `waterMaterial`; `:44` `compileShader(shader)` — **shared by BOTH** `opaqueMaterial.onBeforeCompile` (:148) AND `waterMaterial.onBeforeCompile` (:153).
- Vertex: `:51-59` header (add the varying here); `:70-84` the `#include <begin_vertex>` replace — `worldPosition` is computed at `:78` but only inside `if (isWater)`. Add `vWorldY = (modelMatrix * vec4(position,1.0)).y;` unconditionally right after `#include <begin_vertex>` (:73).
- Fragment: `:87-98` header (add the varying); `:100-130` the `<color_fragment>` replace — `diffuseColor` is set at `:119`, `isWaterPixel` bool at `:110`, then the mood desat at `:124-128`. **Add the depth-tint right after `:119` (inside an `if (isWaterPixel)`), BEFORE the mood desat** so deep water still cools correctly at obsidian. (Do NOT touch the `:137` bioluminescence block — that's night glow, view-space, separate.)
- `world/oceanProfile.js` exports `SEA_LEVEL = 28`. `Terrain.jsx` does NOT yet import it → add the import.

---

## File Structure

- **Modify** `frontend/src/world/Terrain.jsx` — `import { SEA_LEVEL } from './oceanProfile.js'`; add `vWorldY` varying (vertex+fragment headers + a vertex write) + the water depth-tint in the fragment.
- **Create** `frontend/tests/gates/ocean-depth-tint-gates.test.js` — static gate: the shader declares `vWorldY` (vertex+fragment), writes it in the vertex, and the fragment depth-tint references `vWorldY` + is water-gated; capture-stability (no NEW `time`-driven term in the tint).
- **Modify** `frontend/scripts/visual/capture.mjs` + `frontend/tests/visual/diff.test.js` — IF the existing frames don't show the gradient, add an `ocean-depth` fixture (camera at a probed coastline/shallow basin) + its `STATES` entry + baseline.
- **Re-baseline** the measured water-bearing frames (deliberate).

---

### Task 1: The depth-tint shader edit + static gate

**Files:** Modify `frontend/src/world/Terrain.jsx`; Test `frontend/tests/gates/ocean-depth-tint-gates.test.js`.

- [ ] **Step 1: Write the failing static gate**

Create `frontend/tests/gates/ocean-depth-tint-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('Ocean depth-tint gate (World-M5a)', () => {
  const t = read('world/Terrain.jsx');
  it('a world-Y varying is declared (vertex + fragment) and written in the vertex', () => {
    expect((t.match(/varying float vWorldY;/g) || []).length).toBeGreaterThanOrEqual(2); // both shaders
    expect(t).toMatch(/vWorldY\s*=\s*\(modelMatrix \* vec4\(position, 1\.0\)\)\.y;/);
  });
  it('the depth-tint reads vWorldY + SEA_LEVEL and is water-gated (not applied to land)', () => {
    // the tint lives in an isWaterPixel branch and uses vWorldY
    expect(t).toMatch(/isWaterPixel\)/);
    expect(t).toMatch(/SEA_LEVEL/);          // injected compile-time const from oceanProfile
    expect(t).toMatch(/from '\.\/oceanProfile\.js'/);
    // a depth factor from (SEA_LEVEL - vWorldY)
    expect(t).toMatch(/vWorldY/);
  });
  it('the depth-tint is capture-stable (static geometry, no NEW time term in the tint mix)', () => {
    // crude: the water depth block must not introduce `time` (the wave/biolum already use time, separately)
    const m = t.match(/\/\/ M5a depth-tint[\s\S]{0,400}/);
    expect(m, 'a labeled M5a depth-tint block exists').not.toBe(null);
    expect(m[0]).not.toMatch(/\btime\b/);
  });
});
```

- [ ] **Step 2: Run → fail** (`cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/gates/ocean-depth-tint-gates.test.js`) — no vWorldY yet.

- [ ] **Step 3: Implement the shader edit.** In `Terrain.jsx`:

(a) Add the import (next to the other top imports, e.g. after `import { TIERS }`):
```js
import { SEA_LEVEL } from './oceanProfile.js';
```

(b) Vertex header (`:51-59`) — add `varying float vWorldY;`:
```js
    shader.vertexShader = `
        uniform float time;
        uniform float timeOfDay;
        flat varying float vBlockType;
        varying float vWorldY;
        #ifndef USE_UV
        varying vec2 vUv;
        #endif
        ${shader.vertexShader}
    `;
```

(c) Vertex write — after `#include <begin_vertex>` (:73), BEFORE the `bool isWater` line, add:
```js
        #include <begin_vertex>
        vWorldY = (modelMatrix * vec4(position, 1.0)).y; // M5a: world height for the water depth-tint
```

(d) Fragment header (`:87-98`) — add `varying float vWorldY;` alongside the others.

(e) Fragment tint — right after the `diffuseColor = vec4(...)` line (:119), insert:
```js
        // M5a depth-tint: water darkens + shifts to deep-navy with depth below SEA_LEVEL (the M2
        // divable basins now READ deep). Static (vWorldY geometry) -> capture-stable. Water-gated.
        if (isWaterPixel) {
            float wdepth = clamp((${SEA_LEVEL}.0 - vWorldY) / 22.0, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015, 0.09, 0.20), wdepth * 0.82);
        }
```
(`${SEA_LEVEL}.0` templates to `28.0` at compile — DRY with oceanProfile. The mood desat below still runs, so deep water cools correctly at obsidian.)

- [ ] **Step 4: Run the gate + build** — gate PASS (3 tests); `npm run build` clean (the shader compiles; an esbuild pass won't catch GLSL errors, but a malformed string literal would fail).

- [ ] **Step 5: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/Terrain.jsx frontend/tests/gates/ocean-depth-tint-gates.test.js
git commit -m "feat(world-m5a): ocean water depth-tint — divable basins now READ deep

A new vWorldY varying (vertex->fragment) in the shared compileShader; the fragment water path
mixes the diffuse toward deep-navy by depth = clamp((SEA_LEVEL - vWorldY)/22, 0, 1). SEA_LEVEL
injected compile-time from oceanProfile (DRY). Water-gated (the shared shader also compiles the
opaque material -> the tint is inside isWaterPixel, like the bioluminescence). Static (no time) ->
capture-stable. NO new blocks (layered seabed is M5b). Static shader-structure gate (3)."
```

---

### Task 2: Verify + deliberate re-baseline (GATED) — and an `ocean-depth` fixture if needed

- [ ] **Step 1:** `npx vitest run && npm run build` — count +3 (gate); build clean.
- [ ] **Step 2:** `npm run visual:capture` (mount guard — must complete; a GLSL compile error would blank/crash the water render → caught here).
- [ ] **Step 3: MEASURE** `npx vitest run --config vitest.visual.config.js`. The depth-tint shows on water SIDE faces (coastlines) + when diving; the flat top surface (depth 0) barely changes. So explore-day/night (water at the horizon/edges) + biome-snow (water beyond) MAY shift modestly. Record the exact shifted set.
- [ ] **Step 4: SEE the gradient (the M1 coverage lesson).** The diorama frames are top-down-ish (mostly water surface). If none shows the depth gradient clearly, add an **`ocean-depth` fixture**: node-probe the nearest coastline/shallow-to-deep basin (continent ramp), aim a camera LOW at the water from the side (so the depth gradient on the water column reads), screenshot `ocean-depth.png` (camera-override → restore default, the `hearth`/`biome-snow` pattern), add to `STATES`, baseline it. VIEW it at HD: shallow turquoise → deep navy gradient, no z-fight at the shoreline.
- [ ] **Step 5: HD-eyeball + re-baseline** the measured water-bearing frames (+ the new fixture). Confirm: water reads deeper/richer, shallows still bright turquoise, no banding/artifact, obsidian-mood still cools the water. Re-baseline exactly the shifted set; commit with rationale + a KEVIN-REVIEW-BATCH entry (before/after). No threshold/gate change.

---

### Task 3: Doc-currency close-out

- [ ] Banner this plan ✅ SHIPPED; flip the spec's M5 row (the depth-tint half) ✅ (note M5b seabed-layering still pending, folds with M4b). Update `memory/ACTIVE_PLAN.md` (shipped M5a + NEXT = **M6 landmarks** — the wayfinding payoff; or M5b/M4b palette if a new-blocks batch is preferred) + `memory/CHANGELOG.md`. Refresh the `SOTA-INITIATIVE.md` banner. KRB: the depth-tint eyeball. Final commit `docs(world-m5a): close-out — resume = M6 landmarks`, push.

---

## Self-Review

**Spec coverage (PIECE 4 / M5 depth-tint half):** ✅ a `vWorldY` varying plumbed vertex→fragment on the water path; ✅ depth-tint by `(SEA_LEVEL − vWorldY)`; ✅ `SEA_LEVEL` from oceanProfile (DRY — simpler than the spec's uniform/useFrame-pump, since it's a constant); ✅ capture-stable (static, no time); ✅ obsidian-mood survival (tint is before the mood desat); ✅ water castShadow stays off (M2, untouched). M5b layered seabed deferred (needs new blocks → M4b) — recorded.

**Risk (shader edits touch all water-bearing baselines):** the tint is water-gated (opaque unaffected); a GLSL error would blank water → caught by the mount-guard capture + the re-baseline eyeball. The re-baseline is MEASURED (not assumed) per the iter-98 lesson.

**Placeholder scan:** none — exact lines/code/commands. Task 2 Step 4's fixture is conditional-with-procedure (probe coords computed at build), not a placeholder.

**Type/name consistency:** `vWorldY` identical across vertex decl/write + fragment decl/read; `${SEA_LEVEL}` templates the JS const (28) into GLSL `28.0`; the tint sits in the existing `isWaterPixel` branch (:110/:119) — same gate the alpha + (separately) the biolum use.
