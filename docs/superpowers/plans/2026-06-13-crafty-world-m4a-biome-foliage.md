# World M4a — Biome Foliage Distinctness Implementation Plan

> **✅ SHIPPED (loop iter 114, 2026-06-13).** `world/foliage.js` `pineShape` (conical evergreen, unit-tested) + a `surfaceBlock===5` snow-pine branch in the worker foliage pass — snow is no longer barren. Reuses blocks 6/7 (no new ids), deterministic (`vegRandom` salt 4). A `biome-snow` capture fixture (probed snowfield at [0,−40], camera-override) gives the off-frame feature gate coverage. 911 unit (+10) · build · visual 14→**15/15** (the 14 held byte-identical; biome-snow new, HD-eyeballed: evergreens on a snowy highland). NEXT = M4b (biome palette — the DataArrayTexture/numLayers++ work).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Give every biome signature flora so they read as distinct places. Today plains=round trees, desert=cacti, **snow=barren** — M4a closes that gap with **snow PINES** (a tall thin trunk + a tapered conical canopy, a clearly different silhouette from the round plains tree), reusing existing blocks. No new block ids, no topography change.

**Architecture:** A greenfield pure `world/foliage.js` exports `pineShape(height)` → deterministic `{trunk, leaves}` offset-lists (the cone geometry, unit-testable). The worker's foliage pass (terrain.worker.js:460-487) gains a `surfaceBlock === 5` (snow) branch that derives a height from the existing deterministic `vegRandom` and stamps the shape (trunk in-column; leaves chunk-border-clamped, exactly like the existing tree). Plains trees + desert cacti are UNTOUCHED. NO new block ids (trunk=wood 6, needles=leaves 7), NO topography, NO RNG beyond `vegRandom` → no biome-border cliffs, no DataArrayTexture work, deterministic.

**Tech Stack:** terrain.worker.js (foliage pass), a new `world/foliage.js`, vitest (pure-shape unit test + a static gate), the puppeteer visual gate (a NEW `biome-snow` fixture + a deliberate re-baseline).

**Live seam (verified this iteration):** `terrain.worker.js:460-487` — foliage gate `if (surfaceY > SEA_LEVEL && vegRandom(worldX, worldZ, 1) < 0.02)`, then `surfaceBlock === 1` → tree (trunk wood 6, height `4 + floor(vegRandom(.,.,2)*3)`, 3×3×3 leaves 7 with `if (blocks[leafIdx]===0)`), `surfaceBlock === 4` → cactus (8). **No `=== 5` branch** (snow barren). `vegRandom(worldX, worldZ, salt)` is the deterministic per-column hash (salts 1/2/3 used; **4 is free** for the pine). Snow biome = `temperature < 0.3` (biomeTable); snow only survives where `surfaceY >= BEACH_BAND_TOP` (else the beach override makes it sand).

**Coverage note (the M1 lesson):** the diorama capture camera frames origin (≈plains). A snow biome may be off-frame, so the snow pines could have ZERO gate coverage from the 14 existing fixtures. M4a therefore PROBES for the nearest snow biome (a node script, like the M2 ocean probe) and adds a dedicated **`biome-snow` capture fixture** (camera-override pose over that column, default restored after — the `hearth` pattern) so the feature is gate-covered + eyeballed.

---

## File Structure

- **Create** `frontend/src/world/foliage.js` — `pineShape(height)` (pure cone geometry).
- **Modify** `frontend/src/world/terrain.worker.js` — import `pineShape`; add the `surfaceBlock === 5` snow-pine branch in the foliage pass.
- **Create** `frontend/tests/world/foliage.test.js` — pineShape: cone taper, trunk length, spire-above-trunk, determinism.
- **Create** `frontend/tests/gates/biome-foliage-gates.test.js` — static gate: the snow branch exists, uses `vegRandom` (no Math.random), reuses blocks 6/7, no new block id introduced.
- **Modify** `frontend/scripts/visual/capture.mjs` + `frontend/tests/visual/diff.test.js` — add the `biome-snow` fixture (camera-override) + its `STATES` entry; **baseline** `biome-snow.png`.

---

### Task 1: The pure `pineShape` module + worker branch

**Files:** Create `frontend/src/world/foliage.js`; Test `frontend/tests/world/foliage.test.js`; Modify `frontend/src/world/terrain.worker.js`.

- [ ] **Step 1: Write the failing unit test**

Create `frontend/tests/world/foliage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pineShape } from '../../src/world/foliage.js';

describe('pineShape (World-M4a) — deterministic conical evergreen', () => {
  it('the trunk is a single column of `height` blocks rising from the base', () => {
    const { trunk } = pineShape(6);
    expect(trunk).toHaveLength(6);
    for (const [dx, dy, dz] of trunk) { expect(dx).toBe(0); expect(dz).toBe(0); }
    expect(trunk.map(t => t[1])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('the canopy is a tapered cone — radius shrinks with height (fat base, pointed spire)', () => {
    const { leaves } = pineShape(8);
    const byY = new Map();
    for (const [dx, dy, dz] of leaves) {
      const r = Math.max(byY.get(dy) || 0, Math.abs(dx) + Math.abs(dz));
      byY.set(dy, r);
    }
    const ys = [...byY.keys()].sort((a, b) => a - b);
    const radii = ys.map(y => byY.get(y));
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]); // monotonic taper
    expect(radii[0]).toBeGreaterThanOrEqual(2);                  // fat base
    expect(radii[radii.length - 1]).toBe(0);                     // pointed top
  });
  it('the spire pokes one block above the trunk top (a distinct evergreen tip)', () => {
    const h = 7;
    const { leaves } = pineShape(h);
    const maxLeafY = Math.max(...leaves.map(l => l[1]));
    expect(maxLeafY).toBe(h + 1);
  });
  it('is deterministic (same height -> identical offsets)', () => {
    expect(pineShape(6)).toEqual(pineShape(6));
  });
});
```

- [ ] **Step 2: Run → fail** (module missing).

- [ ] **Step 3: Write the module**

Create `frontend/src/world/foliage.js`:

```js
// Deterministic foliage SHAPES (World-Design M4a). Pure offset-lists relative to the surface
// block — the worker stamps them with chunk-border clamping. Snow PINES are the new biome-distinct
// flora (a tapered evergreen, unlike the round plains tree); plains trees + desert cacti stay
// inline in the worker. NO RNG here: the worker passes a height derived from its deterministic
// vegRandom, so the same seed regenerates the identical forest.
export function pineShape(height) {
  // trunk: a single column rising from the surface (dy = 1..height)
  const trunk = [];
  for (let ty = 1; ty <= height; ty++) trunk.push([0, ty, 0]);
  // canopy: a tapered cone (fat bottom -> pointed spire). 5 tiers; the spire pokes 1 above the trunk.
  const leaves = [];
  const radii = [2, 2, 1, 1, 0];
  const coneBase = height - 3; // tiers span dy = height-3 .. height+1
  for (let tier = 0; tier < radii.length; tier++) {
    const r = radii[tier];
    const dy = coneBase + tier;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) <= r) leaves.push([dx, dy, dz]);
      }
    }
  }
  return { trunk, leaves };
}
```

- [ ] **Step 4: Run → pass** (4 tests).

- [ ] **Step 5: Wire the worker snow branch**

Add the import next to the M3 import: `import { pineShape } from './foliage.js';`

In the foliage pass, after the `surfaceBlock === 4` cactus branch (`:481-485`) and before the closing `}` of the `if (surfaceY > SEA_LEVEL …)` block, add:

```js
        } else if (surfaceBlock === 5) { // Snow Pines (M4a — the snow biome's signature flora)
          const pineH = 5 + Math.floor(vegRandom(worldX, worldZ, 4) * 4); // 5-8, deterministic
          const { trunk, leaves } = pineShape(pineH);
          for (const [, dy] of trunk) {
            const ny = surfaceY + dy;
            if (ny < CHUNK_HEIGHT) blocks[getIndex(x, ny, z)] = 6; // trunk (in this column)
          }
          for (const [dx, dy, dz] of leaves) {
            const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
              const leafIdx = getIndex(nx, ny, nz);
              if (blocks[leafIdx] === 0) blocks[leafIdx] = 7; // needles, air-only (like the tree)
            }
          }
        }
```

(The `} else if (surfaceBlock === 4) { … }` becomes `… } else if (surfaceBlock === 5) { … }` chained — insert the new branch as a sibling `else if`.)

- [ ] **Step 6: Verify suite + build** (`npx vitest run && npm run build`) — count +4; build clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/foliage.js frontend/src/world/terrain.worker.js frontend/tests/world/foliage.test.js
git commit -m "feat(world-m4a): snow PINES — the snow biome's signature flora (foliage distinctness)

A greenfield pure world/foliage.js pineShape(height) (tapered conical evergreen) + a snow
(surfaceBlock===5) branch in the worker foliage pass — snow was barren, now it grows pines
(tall thin wood trunk + a pointed leaf cone). Reuses blocks 6/7 (NO new ids), deterministic via
vegRandom salt 4, chunk-border-clamped like the existing tree. Plains/desert untouched."
```

---

### Task 2: The static gate

**Files:** Test `frontend/tests/gates/biome-foliage-gates.test.js`.

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Biome foliage gate (World-M4a)', () => {
  const worker = strip(read('world/terrain.worker.js'));
  // isolate the foliage pass (between the gate and the home-anchor stamp) to scope the assertions
  const start = worker.indexOf('vegRandom(worldX, worldZ, 1) < 0.02');
  const end = worker.indexOf('stampHomeAnchor(blocks');
  const pass = worker.slice(start, end);

  it('the snow biome (surfaceBlock===5) now grows pines (no longer barren)', () => {
    expect(pass).toMatch(/surfaceBlock === 5/);
    expect(worker).toMatch(/from '\.\/foliage\.js'/);
    expect(pass).toMatch(/pineShape\(/);
  });
  it('the pine is deterministic (vegRandom, never Math.random) and reuses wood/leaves (no new block id)', () => {
    // the snow branch slice
    const snow = pass.slice(pass.indexOf('surfaceBlock === 5'));
    expect(snow).toMatch(/vegRandom\(worldX, worldZ, 4\)/);
    expect(snow).not.toMatch(/Math\.random/);
    expect(snow).toMatch(/= 6;/);  // trunk = wood
    expect(snow).toMatch(/= 7;/);  // needles = leaves
    // no block id >= 10 introduced by M4a (palette is M4b)
    expect(snow).not.toMatch(/= 1[0-9];/);
  });
  it('foliage.js uses no Math.random (deterministic shapes)', () => {
    expect(read('world/foliage.js')).not.toMatch(/Math\.random/);
  });
});
```

Run → pass (3 tests). Commit `test(world-m4a): biome-foliage static gate — snow-pine branch + determinism`.

---

### Task 3: The `biome-snow` capture fixture + re-baseline (§4, GATED)

- [ ] **Step 1: Probe for the nearest snow biome to origin** (a node script mirroring the M2 ocean probe): replicate the worker climate (`temperature = noise2D((wx+500)*0.005,(wz+500)*0.005)*0.5+0.5`), scan for `temperature < 0.3` AND a land surfaceY `>= BEACH_BAND_TOP` (so snow, not beach) near origin; print the nearest such [wx, wz]. (If snow is implausibly far, note it + still add the fixture at the nearest snow column — the player CAN walk there.)
- [ ] **Step 2: Add the `biome-snow` fixture to `capture.mjs`** — after the explore-day block, a camera-override pose over the probed snow column (e.g. `enterCapture({camera:{position:[wx+18, surfaceY+30, wz+18], lookAt:[wx, surfaceY, wz]}})`), settle, screenshot `biome-snow.png`, then RESTORE the default diorama pose (the `hearth` pattern). Add `'biome-snow'` to `STATES` in `diff.test.js`.
- [ ] **Step 3:** `npm run visual:capture` (mount guard) → **VIEW `current/biome-snow.png`** at HD: confirm pines render as a recognizable snowy evergreen forest (conical, on snow, not floating/clipped). Iterate `pineShape`/density if the look is wrong (re-capture before baselining).
- [ ] **Step 4:** baseline `biome-snow.png` (`cp current/biome-snow.png baseline/biome-snow.png`). Run the gate → measure the 14 existing + the new one. If explore-day/night also shifted (a snow patch in their frame), re-baseline those too (HD-eyeballed). Expected: 15/15.
- [ ] **Step 5: Commit** `test(world-m4a): biome-snow capture fixture + baseline (pines render in-world)` + a KEVIN-REVIEW-BATCH entry with the before/after.

---

### Task 4: Doc-currency close-out

- [ ] Banner this plan ✅ SHIPPED; flip the spec's M4a row ✅; update ACTIVE_PLAN (shipped M4a + NEXT = **M4b biome palette**) + CHANGELOG; refresh the SOTA banner (15-state gate). Final commit `docs(world-m4a): close-out — resume = M4b biome palette`, push.

---

## Self-Review

**Spec coverage (M4a row):** ✅ branch the foliage pass per biome — snow gets pines (the barren-biome fix); plains/desert untouched. ✅ reuse existing blocks (6/7) — NO new ids (palette is M4b). ✅ NO topography (no cliffs; M4c). ✅ deterministic (`vegRandom`). ✅ a biome capture fixture for coverage (the M1 lesson) + a deliberate re-baseline.

**Risks/notes:** chunk-border leaf-clipping is the EXISTING tree behavior (pines near a chunk edge clip their canopy — not M4a's to fix). The pine trunk is in-column so never clips. The snow-pine only spawns where snow survives (surfaceY ≥ BEACH_BAND_TOP) — naturally the cold highlands.

**Placeholder scan:** none — exact paths/code/commands, except Task 3's probe coords are intentionally computed-at-build (the probe prints them; the fixture uses them) with an explicit fallback.

**Type/name consistency:** `pineShape(height)` returns `{trunk, leaves}` of `[dx,dy,dz]` — identical at definition, worker use, and test; blocks 6=wood/7=leaves match `BLOCK_COLORS`; `vegRandom` salt 4 is unused elsewhere (1/2/3 taken).
