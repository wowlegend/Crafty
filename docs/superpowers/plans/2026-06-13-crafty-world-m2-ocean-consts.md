# World M2 — Ocean Depth + Coastline Consts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make oceans a *divable place* — promote the worldgen shoreline literals to named consts (`SEA_LEVEL` / `BEACH_BAND_TOP` — two distinct values; the 28→30 gap IS the shoreline) and lower the seabed so deep basins are 18–22 voxels deep (was 4–16), plus turn off the water mesh's shadow casting.

**Architecture:** A small **greenfield pure module** `world/oceanProfile.js` holds the coastline consts + the seabed-depth curve (`oceanSurfaceY`), authored testable-from-birth (the M1 pattern). The worker imports the consts + the one function and uses them at the 4 inline sites (ocean branch, beach override, water fill, foliage gate) — a *targeted* extraction of only the ocean-height formula + the consts, NOT the biome branch (that's M3's byte-identical refactor). This deliberately CHANGES the look (deeper basins, no water shadows) → a measured re-baseline. NO new block ids, NO new shaders (the depth-tint + layered seabed are M5). NO-RE-MESH (all gen-time).

**Tech Stack:** terrain.worker.js (worldgen), a new `world/oceanProfile.js`, Terrain.jsx (the water mesh), vitest (behavioral invariants + a static gate), the puppeteer visual gate.

**Live seams (verified this iteration — current line #s, +1 vs the spec because the M1 import shifted them):**
- `terrain.worker.js`: continent `:379`; `baseHeight = 30 + n*40` `:386`; the **ocean branch** `if (continent < -0.15) { oceanT…; targetOceanHeight = 12 + n*12; surfaceY = floor(lerp) }` `:389–393`, else `surfaceY = floor(baseHeight)` `:394`; the **beach override** `if (surfaceY < 30) surfaceBlock=secondaryBlock=4` `:407`; the **water fill** `if (y <= 28) blocks=9` `:416`; the **foliage gate** `if (surfaceY > 28 && vegRandom…<0.02)` `:466`. Block ids: 4=sand, 9=water. The CA `applyCellularAutomata` carves y∈[1,19] (`caRangeHeight=20`).
- `Terrain.jsx`: the water mesh `<mesh geometry={waterGeometry} material={waterMaterial} castShadow receiveShadow />` at **`:232`** (turn `castShadow` OFF).

**Design grounding (the real ocean behavior, computed/read — not assumed):**
- Current full-ocean seabed = `targetOceanHeight = 12 + n*12` ∈ [12,24] → depth `28 − seabed` ∈ [4,16] (too shallow to dive). New: `seabed = DEEP_FLOOR + n*4` with `DEEP_FLOOR=6` ∈ [6,10] → depth ∈ **[18,22]**. Max depth `SEA_LEVEL − DEEP_FLOOR = 22` caps the water side-quads (the greedy mesher culls water-vs-water interior faces).
- **CA interaction (known, accepted for M2):** the seabed at y6–10 sits in the CA zone (y<20). But a FLAT seabed block keeps ~18 solid neighbors (>11 → survives); only ocean-floor SLOPES may get lightly nibbled. The *current* shallow seabed (12–24) ALREADY overlaps the CA zone, so deepening adds no new bug class — it's more-of-existing, underwater, minor. **Measure it in the re-baseline + a one-off dive eyeball; if slopes look holey, a CA-skip-under-water guard is an M5 (seabed milestone) item, not M2.**
- **Visibility:** the water SURFACE stays at y28 (SEA_LEVEL unchanged), so deepening is mostly sub-surface (a dive/gameplay change, not a skyline change). The gate-visible M2 delta is the **water `castShadow` removal**. So the unit tests (the depth invariant) are M2's primary verification; the gate confirms no surface regression. No new permanent fixture (the visible ocean look — seabed materials + depth-tint — is M5; its fixture earns its place there).

---

## File Structure

- **Create** `frontend/src/world/oceanProfile.js` — coastline consts (`SEA_LEVEL`, `BEACH_BAND_TOP`, `DEEP_FLOOR`, `OCEAN_CONTINENT_THRESHOLD`, `OCEAN_FULL_SPAN`) + `oceanBlend(continent)` + `oceanSurfaceY(baseHeight, n, continent)`. One responsibility: the ocean/coastline profile.
- **Modify** `frontend/src/world/terrain.worker.js` — import the consts + `oceanSurfaceY`; use them at the 4 inline sites.
- **Modify** `frontend/src/world/Terrain.jsx` — water mesh `castShadow` → off.
- **Create** `frontend/tests/world/oceanProfile.test.js` — behavioral invariants (depth 18–22, two-const shoreline ordering, blend clamping, land-unaffected).
- **Create** `frontend/tests/gates/ocean-coastline-gates.test.js` — static gate: the worker imports + uses the consts at all 4 sites (no leftover magic 28/30 there); water `castShadow` off; `BEACH_BAND_TOP > SEA_LEVEL`.
- **Re-baseline** the measured-affected `frontend/tests/visual/baseline/*.png` (deliberate, §4 — likely explore-day/night from the shadow change).

---

### Task 1: The pure `oceanProfile` module + worker wiring

**Files:**
- Create: `frontend/src/world/oceanProfile.js`
- Test: `frontend/tests/world/oceanProfile.test.js`
- Modify: `frontend/src/world/terrain.worker.js`

- [ ] **Step 1: Write the failing behavioral test**

Create `frontend/tests/world/oceanProfile.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  SEA_LEVEL, BEACH_BAND_TOP, DEEP_FLOOR,
  OCEAN_CONTINENT_THRESHOLD, oceanBlend, oceanSurfaceY,
} from '../../src/world/oceanProfile.js';

describe('Ocean + coastline profile (World-M2)', () => {
  it('SEA_LEVEL and BEACH_BAND_TOP are TWO distinct consts forming the shoreline (BEACH_BAND_TOP > SEA_LEVEL >= 1)', () => {
    expect(BEACH_BAND_TOP).toBeGreaterThan(SEA_LEVEL);
    expect(SEA_LEVEL).toBeGreaterThanOrEqual(1);
  });

  it('deep ocean is divable 18-22 voxels (SEA_LEVEL - seabed) across the noise range', () => {
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      const seabed = oceanSurfaceY(30 + n * 40, n, -0.30); // continent <= -0.30 => full ocean
      const depth = SEA_LEVEL - seabed;
      expect(depth, `depth at n=${n}`).toBeGreaterThanOrEqual(18);
      expect(depth, `depth at n=${n}`).toBeLessThanOrEqual(22);
    }
  });

  it('max divable depth is bounded by SEA_LEVEL - DEEP_FLOOR (caps water side-quads)', () => {
    expect(SEA_LEVEL - DEEP_FLOOR).toBeLessThanOrEqual(22);
    expect(SEA_LEVEL - DEEP_FLOOR).toBeGreaterThanOrEqual(18);
  });

  it('oceanBlend: 0 at the threshold, 1 at full ocean, 0 on land, clamped both ends', () => {
    expect(oceanBlend(OCEAN_CONTINENT_THRESHOLD)).toBe(0); // exactly at threshold
    expect(oceanBlend(-0.30)).toBe(1);                     // full ocean
    expect(oceanBlend(0)).toBe(0);                         // land
    expect(oceanBlend(-0.9)).toBe(1);                      // clamped
  });

  it('land/at-threshold (blend 0) returns the pure land baseHeight (continuous with the else branch)', () => {
    expect(oceanSurfaceY(50, 0.5, OCEAN_CONTINENT_THRESHOLD)).toBe(50);
    expect(oceanSurfaceY(37, 0.25, OCEAN_CONTINENT_THRESHOLD)).toBe(37);
  });

  it('the shore transition is monotonic: surfaceY only drops as continent falls (land -> deep)', () => {
    const base = 50, n = 0.5;
    const shallow = oceanSurfaceY(base, n, -0.18);
    const mid = oceanSurfaceY(base, n, -0.24);
    const deep = oceanSurfaceY(base, n, -0.30);
    expect(shallow).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
  });

  it('shoreline ordering: a column just below BEACH_BAND_TOP is sand-banded AND above the waterline', () => {
    const justBelowBeachTop = BEACH_BAND_TOP - 1; // 29
    expect(justBelowBeachTop < BEACH_BAND_TOP).toBe(true); // sand override fires
    expect(justBelowBeachTop > SEA_LEVEL).toBe(true);      // foliage allowed; no water column above
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/world/oceanProfile.test.js`
Expected: FAIL — `Failed to resolve import "../../src/world/oceanProfile.js"`.

- [ ] **Step 3: Write the module**

Create `frontend/src/world/oceanProfile.js`:

```js
// Ocean + coastline profile (World-Design M2). The worldgen shoreline used three magic literals
// (28 the water line, 30 the beach band, 12+n*12 the seabed). This names them + deepens the
// seabed so oceans become a DIVABLE place. Pure math (no state) -> the worker imports + uses it.
//
// SEA_LEVEL (28) and BEACH_BAND_TOP (30) are TWO SEPARATE consts on purpose: water fills up to
// SEA_LEVEL, and sand renders up to BEACH_BAND_TOP, so the 28->30 gap IS the visible shoreline
// (a thin sand beach above the waterline). Do NOT unify them.
export const SEA_LEVEL = 28;        // water fills y <= SEA_LEVEL; foliage only at surfaceY > SEA_LEVEL
export const BEACH_BAND_TOP = 30;   // surfaceY < BEACH_BAND_TOP renders as sand (the beach band)
export const DEEP_FLOOR = 6;        // deepest seabed -> max divable depth = SEA_LEVEL - DEEP_FLOOR = 22

// The ocean blend: as `continent` falls below the threshold, the surface lerps from the land
// baseHeight down toward the deep seabed over a transition band (the shore -> deep ramp).
export const OCEAN_CONTINENT_THRESHOLD = -0.15;
export const OCEAN_FULL_SPAN = 0.15; // continent in [-0.30, -0.15] = shore -> full-ocean

export function oceanBlend(continent) {
  return Math.min(1, Math.max(0, (OCEAN_CONTINENT_THRESHOLD - continent) / OCEAN_FULL_SPAN));
}

// Surface height in the OCEAN branch only (the worker keeps `floor(baseHeight)` for land). At
// full ocean the seabed = DEEP_FLOOR + n*4 (∈ [6,10]) -> depth = SEA_LEVEL - seabed ∈ [18,22].
// At the threshold (blend 0) it returns floor(baseHeight), continuous with the land branch.
export function oceanSurfaceY(baseHeight, n, continent) {
  const t = oceanBlend(continent);
  const seabed = DEEP_FLOOR + n * 4;
  return Math.floor(baseHeight * (1 - t) + seabed * t);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/world/oceanProfile.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire the consts + function into the worker**

In `frontend/src/world/terrain.worker.js`, add the import next to the M1 import (after `import { stampHomeAnchor } from './homeAnchor.js';`):

```js
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';
```

Replace the ocean branch (current `:389–394`) — the whole `if (continent < -0.15) { … } else { … }`:

```js
      let surfaceY;
      if (continent < OCEAN_CONTINENT_THRESHOLD) {
        surfaceY = oceanSurfaceY(baseHeight, n, continent);
      } else {
        surfaceY = Math.floor(baseHeight);
      }
```

Replace the beach override (`:407`): `if (surfaceY < 30) {` → `if (surfaceY < BEACH_BAND_TOP) {`

Replace the water fill (`:416`): `if (y <= 28) {` → `if (y <= SEA_LEVEL) {`

Replace the foliage gate (`:466`): `if (surfaceY > 28 && vegRandom(worldX, worldZ, 1) < 0.02) {` → `if (surfaceY > SEA_LEVEL && vegRandom(worldX, worldZ, 1) < 0.02) {`

(Use Edit on each unique line. The ocean-branch block is replaced as one Edit anchored on `let surfaceY;` through the `else { surfaceY = Math.floor(baseHeight); }`.)

- [ ] **Step 6: Verify build + suite**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run && npm run build`
Expected: suite PASS (count +7); build clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/oceanProfile.js frontend/src/world/terrain.worker.js frontend/tests/world/oceanProfile.test.js
git commit -m "feat(world-m2): ocean depth + coastline consts — divable 18-22 basins

world/oceanProfile.js names the shoreline literals (SEA_LEVEL=28 water line, BEACH_BAND_TOP=30
sand band — two distinct consts, the 28->30 gap IS the shoreline) + deepens the seabed
(DEEP_FLOOR=6 -> depth 18-22, was 4-16) via oceanSurfaceY. Worker uses them at the 4 sites
(ocean branch / beach override / water fill / foliage gate). Land branch untouched; NO new
blocks/shaders (seabed materials + depth-tint are M5); NO-RE-MESH. 7 behavioral tests."
```

---

### Task 2: Water castShadow off + the static gate

**Files:**
- Modify: `frontend/src/world/Terrain.jsx` (water mesh)
- Test: `frontend/tests/gates/ocean-coastline-gates.test.js`

- [ ] **Step 1: Write the failing static gate**

Create `frontend/tests/gates/ocean-coastline-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEA_LEVEL, BEACH_BAND_TOP } from '../../src/world/oceanProfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Ocean + coastline gates (World-M2)', () => {
  const worker = strip(read('world/terrain.worker.js'));

  it('the two shoreline consts stay distinct (the 28->30 gap is load-bearing)', () => {
    expect(BEACH_BAND_TOP).toBeGreaterThan(SEA_LEVEL);
  });
  it('the worker imports the ocean profile (consts + the seabed curve)', () => {
    expect(worker).toMatch(/from '\.\/oceanProfile\.js'/);
    expect(worker).toMatch(/oceanSurfaceY\(/);
  });
  it('the 4 worldgen sites use the named consts, not magic 28/30', () => {
    expect(worker, 'water fill').toMatch(/y <= SEA_LEVEL/);
    expect(worker, 'foliage gate').toMatch(/surfaceY > SEA_LEVEL/);
    expect(worker, 'beach override').toMatch(/surfaceY < BEACH_BAND_TOP/);
    // the ocean branch routes through the module, not an inline 12 + n*12
    expect(worker).not.toMatch(/targetOceanHeight\s*=\s*12 \+ n \* 12/);
  });
  it('the water mesh does NOT cast shadow (perf + transparent-shadow artifact)', () => {
    const terrain = strip(read('world/Terrain.jsx'));
    const m = terrain.match(/material=\{waterMaterial\}[^/]*\/>/);
    expect(m, 'water mesh found').not.toBe(null);
    expect(m[0], 'water mesh must not castShadow').not.toMatch(/castShadow/);
  });
});
```

- [ ] **Step 2: Run the gate to verify it fails**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/gates/ocean-coastline-gates.test.js`
Expected: FAIL — the water mesh still has `castShadow` (the worker-import/const tests already pass from Task 1).

- [ ] **Step 3: Turn off water castShadow**

In `frontend/src/world/Terrain.jsx` (`:232`):

```jsx
            {waterGeometry && (
                <mesh geometry={waterGeometry} material={waterMaterial} receiveShadow />
            )}
```

(Remove `castShadow`, keep `receiveShadow`.)

- [ ] **Step 4: Run the gate + build**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/gates/ocean-coastline-gates.test.js && npm run build`
Expected: gate PASS (4 tests) · build clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/Terrain.jsx frontend/tests/gates/ocean-coastline-gates.test.js
git commit -m "feat(world-m2): water mesh stops casting shadow + the coastline static gate

Water castShadow off (cheap perf win + removes a transparent-shadow artifact; receiveShadow
kept). 4 static gates lock the two-const shoreline + the worker's use of the named consts at
all 4 sites + the no-water-shadow invariant."
```

---

### Task 3: Verify + the deliberate re-baseline (§4)

**Files:** `frontend/tests/visual/baseline/*.png` (only the measured-affected set)

- [ ] **Step 1: Full suite + build (the ratchet)**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run && npm run build`
Expected: unit count = prior + 11 (7 ocean + 4 gate); build clean.

- [ ] **Step 2: Capture fresh frames (mount guard)**

Run: `cd /Users/kz/Code/Crafty/frontend && npm run visual:capture`
Expected: completes (a timeout = a mount crash, never "flaky"). The water surface is unchanged (SEA_LEVEL=28); the deepened seabed is sub-surface; the only surface delta is no water-cast shadows.

- [ ] **Step 3: MEASURE which baselines diff**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run --config vitest.visual.config.js`
Expected: `hearth` unchanged (origin is land). `explore-day`/`explore-night` (+ tier variants) MAY shift from the removed water shadows; record the exact failing set — that, and only that, gets re-baselined.

- [ ] **Step 4: One-off DIVE eyeball (confirm the deeper seabed renders OK — the M1 "see it" discipline)**

Temporarily point the capture camera underwater at a deep basin to confirm the seabed renders without ugly CA holes: set `frontend/src/devtest/captureMode.js` default camera to a low pose over a known ocean column, `npm run visual:capture`, view `current/explore-day.png`, then `git checkout frontend/src/devtest/captureMode.js`. (Finding a deep-ocean column near origin may need a coordinate probe like the M1 `node` height probe — sample `continent < -0.30` columns. If no ocean is near the spawn vista, note that the dive-check is deferred to M5's seabed fixture and rely on the unit-test depth invariant.) If the seabed slopes show bad CA nibbling → log an M5 item (a CA-skip-under-water guard); do NOT fix in M2.

- [ ] **Step 5: HD eyeball + re-baseline the measured set**

For each diffing frame: open at HD, confirm the only change is softer/again-correct shadows on/near water (no z-fighting, no holes). Re-baseline exactly those (`npm run test:visual -- -u` or the config's update flag), commit with rationale + a KEVIN-REVIEW-BATCH entry. No threshold/gate change.

```bash
cd /Users/kz/Code/Crafty
git add frontend/tests/visual/baseline/<each-affected>.png docs/superpowers/KEVIN-REVIEW-BATCH.md
git commit -m "test(world-m2): re-baseline the water-shadow-affected states (deliberate, HD-eyeballed)

<list the measured set>. Only change: water no longer casts shadows. No threshold/gate change."
```

---

### Task 4: Doc-currency close-out

- [ ] **Step 1:** Banner this plan `✅ SHIPPED`.
- [ ] **Step 2:** Flip the spec's M2 row (`…world-design-hybrid.md` §3) to `✅ SHIPPED`; correct any seam claim reality falsified.
- [ ] **Step 3:** Update `memory/ACTIVE_PLAN.md` (shipped M2 + NEXT = **M3 biome-table refactor, look-neutral, byte-identical characterization**) + a `memory/CHANGELOG.md` entry.
- [ ] **Step 4:** Refresh the `SOTA-INITIATIVE.md` status banner (world pass M2 done).
- [ ] **Step 5:** Final commit `docs(world-m2): close-out — resume = M3 biome table`, push `main`.

---

## Self-Review

**Spec coverage (PIECE 4 / M2 row):** ✅ const promotion — `SEA_LEVEL=28` (water fill + foliage gate) AND `BEACH_BAND_TOP=30` (sand override), kept as TWO distinct consts (the gate enforces `BEACH_BAND_TOP > SEA_LEVEL`). ✅ lower `DEEP_FLOOR` → divable 18–22 basins (`oceanSurfaceY`, unit-tested). ✅ water `castShadow` OFF. ✅ worker unit test: depth + the shoreline invariant. ✅ NO new look/blocks (sand seabed stays; layered seabed + depth-tint deferred to M5, recorded).

**Risks recorded (not floated):** the CA-seabed-slope nibble (pre-existing class; measure + flag for M5, don't fix in M2); the ocean depth not being surface-visible (so unit tests are primary verification, no new fixture until M5's visible seabed work) — both stated in Design grounding above.

**Placeholder scan:** none — exact paths, full code, exact commands + expected output. (Task 3 Step 4's dive-probe is conditional with an explicit fallback, not a placeholder.)

**Type/name consistency:** `oceanSurfaceY(baseHeight, n, continent)` identical at definition / worker call / test import; `SEA_LEVEL`/`BEACH_BAND_TOP`/`DEEP_FLOOR` names identical across module, worker, gate, and test; block ids 4=sand / 9=water match `BLOCK_COLORS`.
