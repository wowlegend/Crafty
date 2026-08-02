> **✅ SHIPPED (loop iter 120, 2026-06-13) — COMPLETES the M1–M6 world-design ladder.** `world/landmarks.js` (deterministic imul-hash placement, ~1.4%, 2 types) + `<LandmarksRender chunks={chunks}/>` (two tall voxelKit types — Spire glowing-tower + Sky-arch; in-range-culled + tier-capped via the streamer's `chunks` set; LAND-only via `climate.surfaceBlockAt`; `top=max(baseY+46,92)` clears the fog; castShadow-off on tall parts; Emissive top capture-null). Added a `landmark` fixture (probed Sky-arch at [40,−88]) — HD-eyeballed: a distinctive monument silhouette clearing the forest. 929 unit (+6) · build · visual 16→**17/17** (16 prior held byte-identical). Commits T1 (placement) · T2 (render+gate) · T3 (fixture). NEXT = PICK (deferred new-blocks batch M4b+M5b · M4c topography · S3-M5 Components · or interleave).

# World M6 — Signature Silhouette Landmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Give the infinite wilds **wayfinding + "go there" lures** — 2 authored, tall, sparse landmark TYPES (a glowing **Spire** + a **Sky-arch**) that read through the fog as distinctive silhouettes. The final world-design spec-ladder milestone (PIECE 2).

**Architecture:** A greenfield pure `world/landmarks.js` decides placement by a **deterministic coordinate hash** (`isLandmarkChunk(cx,cz)` — sparse, NEVER `Math.random`; cloned from the `isDungeonChunk`/`vegRandom` pattern) + `landmarkTypeAt(cx,cz)`. A new `<LandmarksRender chunks={chunks}/>` in `Terrain.jsx` iterates the **already-loaded `chunks` set** (so it's in-range-culled + tier-capped FOR FREE — the streamer bounds it by `TIERS.renderDistance`), and for each landmark chunk that's on LAND mounts a tall voxelKit group at the chunk centre, sitting on the terrain surface (height from `climate.surfaceBlockAt`, the M5a sampler) and rising to clear **Y90** (above the fog Y56). `castShadow=false` on the tall parts (the shadow cam is far=200/ortho±100 → tall geometry clip-shadows — artifact-avoidance). Any glowing top self-nulls under `isCaptureMode()`. Static R3F (no per-frame work beyond mount) → NO-RE-MESH + capture-deterministic.

**Tech Stack:** a new `world/landmarks.js`, `Terrain.jsx` (a `<LandmarksRender/>` + mount), `world/climate.js` (height — reused), `render/mascots/voxelKit` (Cube/Emissive), vitest (placement characterization + a static gate), the puppeteer visual gate (a `landmark` fixture + re-baseline).

**Live seams (verified this iteration):**
- `Terrain.jsx` `MinecraftWorld`: the `chunks` state (`:439`, keyed `cx_cz`), camera-keyed load within `renderDistance` + cull beyond `renderDistance+2` (`:563-609`) — render-radius-bounded + tier-capped. The render return maps `chunks` → `ChunkMesh` + the `<TreasureChestsRender/>` / `<HomeAnchorRender/>` fixtures as siblings (mount `<LandmarksRender chunks={chunks}/>` there). `CHUNK_SIZE = 16`.
- `world/climate.js` `surfaceBlockAt(x,z)` → `{surfaceBlock, surfaceY, isWater}` (reused for the ground height + the land/ocean gate).
- The worker hash patterns to clone (NOT import — main-thread): `isDungeonChunk(dcx,dcz)` = `sin(dcx*12.9898+dcz*78.233)*43758.5453` frac < 0.025; `vegRandom`'s imul hash (deterministic, order-independent).
- `voxelKit`: `Cube({position,size,color,...props})` (accepts `castShadow={false}`), `Emissive` (glow, toneMapped-false). `isCaptureMode()` already imported in Terrain.jsx.

---

## File Structure

- **Create** `frontend/src/world/landmarks.js` — `isLandmarkChunk(cx,cz)` (deterministic, sparse) + `landmarkTypeAt(cx,cz)` (0|1). Pure.
- **Modify** `frontend/src/world/Terrain.jsx` — `import { isLandmarkChunk, landmarkTypeAt }` + `import { surfaceBlockAt }`; add `<LandmarksRender chunks={chunks}/>` (the two voxelKit types) + mount it sibling of `<HomeAnchorRender/>`.
- **Create** `frontend/tests/world/landmarks.test.js` — determinism, sparsity (a rough density band), type distribution, no Math.random.
- **Create** `frontend/tests/gates/landmarks-gates.test.js` — static gate: deterministic (no Math.random), in-range via `chunks`, tall (>Y90 logic), castShadow-off, capture-null, mounted.
- **Modify** `frontend/scripts/visual/capture.mjs` + `frontend/tests/visual/diff.test.js` — a `landmark` fixture (probe a landmark chunk, camera-override) + `STATES` entry + baseline.

---

### Task 1: `world/landmarks.js` (deterministic placement)

**Files:** Create `frontend/src/world/landmarks.js`; Test `frontend/tests/world/landmarks.test.js`.

- [ ] **Step 1: Write the failing characterization test**

Create `frontend/tests/world/landmarks.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isLandmarkChunk, landmarkTypeAt, LANDMARK_TYPES } from '../../src/world/landmarks.js';

describe('landmark placement (World-M6) — deterministic + sparse', () => {
  it('is deterministic (same chunk -> same answer + type)', () => {
    expect(isLandmarkChunk(12, -7)).toBe(isLandmarkChunk(12, -7));
    expect(landmarkTypeAt(12, -7)).toBe(landmarkTypeAt(12, -7));
  });
  it('is sparse — a landmark every few hundred chunks (rough density band 0.2%..3%)', () => {
    let hits = 0, n = 0;
    for (let cx = -120; cx <= 120; cx += 3) for (let cz = -120; cz <= 120; cz += 3) { n++; if (isLandmarkChunk(cx, cz)) hits++; }
    const density = hits / n;
    expect(density, `density ${(density * 100).toFixed(2)}%`).toBeGreaterThan(0.002);
    expect(density, `density ${(density * 100).toFixed(2)}%`).toBeLessThan(0.03);
  });
  it('landmarkTypeAt returns a valid type index for landmark chunks', () => {
    for (let cx = -200; cx <= 200; cx++) {
      if (isLandmarkChunk(cx, 3)) {
        const ty = landmarkTypeAt(cx, 3);
        expect(ty).toBeGreaterThanOrEqual(0);
        expect(ty).toBeLessThan(LANDMARK_TYPES);
      }
    }
  });
});
```

- [ ] **Step 2: Run → fail** (module missing).

- [ ] **Step 3: Write the module**

Create `frontend/src/world/landmarks.js`:

```js
// Signature landmark placement (World-Design M6). Pure deterministic coordinate hashing — the same
// seed regenerates the same landmark layout (NEVER Math.random; visual-gate load-bearing). Sparse
// so landmarks read as occasional wayfinding silhouettes, not clutter. The RENDER (Terrain.jsx
// <LandmarksRender/>) only instantiates landmark chunks that are CURRENTLY LOADED (in-range-culled +
// tier-capped by the chunk streamer) and on LAND.
export const LANDMARK_TYPES = 2; // 0 = Spire (glowing tower), 1 = Sky-arch (monument gateway)

// imul hash (order-independent, well-distributed) -> [0,1). Distinct salt from vegRandom's.
function hash(cx, cz, salt) {
  let h = (0x6d2b79f5 ^ Math.imul(cx | 0, 0x85ebca6b) ^ Math.imul(cz | 0, 0xc2b2ae35) ^ Math.imul(salt | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x3ad8eb39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ~1.4% of chunks carry a landmark candidate (rarer than the 2.5% dungeon; the LAND gate in the
// render thins it further). With renderDistance 4 (~81 loaded chunks) ~1 reads in view at a time.
export function isLandmarkChunk(cx, cz) {
  return hash(cx, cz, 7) < 0.014;
}

export function landmarkTypeAt(cx, cz) {
  return hash(cx, cz, 19) < 0.5 ? 0 : 1;
}
```

- [ ] **Step 4: Run → pass.** (If the density band fails, tune the `0.014` threshold — the test brackets it 0.2%..3%.)

- [ ] **Step 5: Commit** `feat(world-m6): world/landmarks.js — deterministic sparse landmark placement`.

---

### Task 2: `<LandmarksRender/>` (the two voxelKit types) + static gate

**Files:** Modify `frontend/src/world/Terrain.jsx`; Test `frontend/tests/gates/landmarks-gates.test.js`.

- [ ] **Step 1: Write the failing static gate**

Create `frontend/tests/gates/landmarks-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Landmark gate (World-M6)', () => {
  const t = strip(read('world/Terrain.jsx'));
  const block = (() => { const i = t.indexOf('const LandmarksRender'); return i > -1 ? t.slice(i, i + 2600) : ''; })();
  it('LandmarksRender exists, is mounted, and is driven by the in-range chunks set', () => {
    expect(t).toMatch(/const LandmarksRender/);
    expect(t).toMatch(/<LandmarksRender chunks=\{chunks\}/);
    expect(t).toMatch(/from '\.\/landmarks\.js'/);
    expect(block).toMatch(/isLandmarkChunk\(/);
  });
  it('placement is deterministic (no Math.random) + uses the climate height sampler', () => {
    expect(read('world/landmarks.js')).not.toMatch(/Math\.random/);
    expect(block).not.toMatch(/Math\.random/);
    expect(t).toMatch(/surfaceBlockAt/); // terrain height for the base
  });
  it('tall parts do not cast shadow (shadow-cam clip avoidance) and any glow is capture-null', () => {
    expect(block).toMatch(/castShadow=\{false\}/);
    expect(block).toMatch(/!isCaptureMode\(\)/);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add the imports + `LandmarksRender` + mount.** In `Terrain.jsx`:

Imports (next to the M5a/M1 ones): `import { isLandmarkChunk, landmarkTypeAt, LANDMARK_TYPES } from './landmarks.js';` and (if not already) `import { surfaceBlockAt } from './climate.js';`

Add the component before `MinecraftWorld` (sibling style to `HomeAnchorRender`):

```jsx
// --- SIGNATURE LANDMARKS (World-M6): tall wayfinding silhouettes, placed by deterministic hash,
// only on loaded LAND chunks (in-range-culled + tier-capped by the streamer). Two voxelKit types.
const LANDMARK_PAL = { stone: '#8A8A8A', dark: '#5A5A5A', accent: '#6B4A2F' };
function Landmark({ type, baseY }) {
    const top = Math.max(baseY + 46, 92);        // clears the fog (Y56) + reads through valley mist
    const h = top - baseY;
    if (type === 0) { // Spire: a tapered tower + a glowing crystal top (capture-null)
        const tiers = 5;
        return (
            <group>
                {Array.from({ length: tiers }).map((_, i) => {
                    const w = 6 - i * 0.9, y = baseY + (h * (i + 0.5)) / tiers;
                    return <Cube key={i} position={[0, y, 0]} size={[w, h / tiers + 0.5, w]} color={i % 2 ? LANDMARK_PAL.dark : LANDMARK_PAL.stone} castShadow={false} />;
                })}
                {!isCaptureMode() && <Emissive position={[0, top + 1, 0]} size={1.4} color="#46E0FF" intensity={3.2} />}
            </group>
        );
    }
    // Sky-arch: two legs + a span across the top
    const legX = 5;
    return (
        <group>
            <Cube position={[-legX, baseY + h / 2, 0]} size={[2.2, h, 2.2]} color={LANDMARK_PAL.stone} castShadow={false} />
            <Cube position={[legX, baseY + h / 2, 0]} size={[2.2, h, 2.2]} color={LANDMARK_PAL.stone} castShadow={false} />
            <Cube position={[0, top, 0]} size={[legX * 2 + 2.2, 2.4, 2.2]} color={LANDMARK_PAL.dark} castShadow={false} />
            {!isCaptureMode() && <Emissive position={[0, top, 0]} size={1.0} color="#F5D76E" intensity={2.6} />}
        </group>
    );
}
const LandmarksRender = ({ chunks }) => {
    const marks = [];
    for (const key in chunks) {
        const { cx, cz } = chunks[key];
        if (!isLandmarkChunk(cx, cz)) continue;
        const wx = cx * 16 + 8, wz = cz * 16 + 8;
        const { surfaceY, isWater } = surfaceBlockAt(wx, wz);
        if (isWater || surfaceY < 32) continue; // land only (no rising-from-the-seabed)
        marks.push(<group key={key} position={[wx, 0, wz]}><Landmark type={landmarkTypeAt(cx, cz)} baseY={surfaceY} /></group>);
    }
    return <group>{marks}</group>;
};
```

Mount it after `<HomeAnchorRender />`:
```jsx
            <HomeAnchorRender />
            <LandmarksRender chunks={chunks} />
```

- [ ] **Step 4: Gate + build + suite** — gate PASS; `npm run build` clean; `npx vitest run` count grows.

- [ ] **Step 5: Commit** `feat(world-m6): <LandmarksRender/> — tall voxelKit Spire + Sky-arch, in-range-culled, capture-null`.

---

### Task 3: The `landmark` capture fixture + re-baseline (GATED)

- [ ] **Step 1:** node-probe the nearest LAND landmark chunk to origin (scan `isLandmarkChunk(cx,cz)` AND `climate.surfaceBlockAt(cx*16+8,cz*16+8).surfaceY >= 32`), print its world centre + surfaceY.
- [ ] **Step 2:** add a `landmark` fixture to `capture.mjs` (camera-override framing that landmark from ~60 units back + up, so the full silhouette + its top read above the terrain), restore the default pose after; add `'landmark'` to `STATES`.
- [ ] **Step 3:** `npm run visual:capture` (mount guard) → VIEW `current/landmark.png` at HD: the Spire/arch reads as a tall distinctive silhouette clearing the terrain, glow null-in-capture, no shadow-clip artifact, no float. Tune `Landmark`/threshold + re-capture if wrong.
- [ ] **Step 4:** baseline `landmark.png`; run the gate → MEASURE (the explore frames may catch a distant landmark now — re-baseline any that shift, HD-eyeballed). Expected 17/17.
- [ ] **Step 5: Commit** `test(world-m6): landmark capture fixture + baseline` + a KEVIN-REVIEW-BATCH entry (before/after).

---

### Task 4: Doc-currency close-out (the spec ladder COMPLETES)

- [ ] Banner this plan ✅ SHIPPED; flip the spec's M6 row ✅ and note **the M1–M6 ladder is COMPLETE** (deferred: M4b palette + M5b seabed [new-blocks batch] + M4c topography). Update `memory/ACTIVE_PLAN.md` (M6 ✅ → world spec-ladder done; NEXT = the deferred new-blocks batch OR S3-M5 Components OR an interleave — PICK) + `memory/CHANGELOG.md`. Refresh the `SOTA-INITIATIVE.md` banner. KRB: the landmark eyeball + "world-design ladder complete". Final commit `docs(world-m6): close-out — the world-design ladder is COMPLETE`, push.

---

## Self-Review

**Spec coverage (PIECE 2 / M6):** ✅ 2 authored TYPES (Spire + Sky-arch), SEAM-A R3F voxelKit (NOT a voxel stamp — SEAM-B is the deferred M7); ✅ deterministic-hash placement (NEVER Math.random — gated); ✅ sized to clear Y90 (`top = max(baseY+46, 92)`); ✅ in-range-culled + per-tier-capped (driven by the streamer's `chunks` set — free); ✅ `castShadow=false` on the tall parts; ✅ Emissive top capture-null; ✅ a fixture for off-frame coverage (the M1 lesson).

**Reuse:** climate.surfaceBlockAt (M5a) for the ground height + land/ocean gate — no new height infra. The `chunks` set gives in-range-cull + cap for free (no separate distance gate needed).

**Placeholder scan:** none — exact paths/code; Task 3's probe coords computed-at-build (explicit procedure).

**Type/name consistency:** `isLandmarkChunk`/`landmarkTypeAt`/`LANDMARK_TYPES` identical across module/render/test; `<LandmarksRender chunks={chunks}/>` matches the streamer's `chunks` state; `surfaceBlockAt` returns `{surfaceY,isWater}` as used.
