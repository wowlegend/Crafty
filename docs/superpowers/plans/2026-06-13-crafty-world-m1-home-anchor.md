# World M1 — Home Anchor ("the Hearth") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the player spawn on a deterministic, flat, above-water **crafted plinth at the world origin** — a small toon lodge + a lit brazier — so the first thing seen is a *place*, not undifferentiated noise.

**Architecture:** Two seams, both already surveyed live (spec `docs/superpowers/specs/2026-06-13-crafty-world-design-hybrid.md` PIECE 1). (a) A **greenfield pure module** `world/homeAnchor.js` whose `stampHomeAnchor(blocks,cx,cz)` flattens the origin footprint at chunk-gen time — authored as an importable module from birth (no extraction risk on the 753-LOC worker; the worker just `import`s + calls it once, after foliage, before the player-mod replay so player edits win). (b) A static R3F `<HomeAnchorRender/>` group (voxelKit flat-toon, NOT PBR) mounted as a sibling of `<TreasureChestsRender/>`. Both are gen-time-baked / static → **NO-RE-MESH + capture-deterministic by construction.** No new block ids (existing 1–9 only; new palette is M4). The spawn probe (`Components.jsx:892–930`) is height-agnostic — it raycasts ground at (0,0) and drops the player `groundY + 1.2` — so the flattened plinth top simply becomes the spawn floor; **spawn code is NOT touched** (spec correction HIGH #2: drop the spawn-fix claim — the value is a flat above-water standable place, not a probe fix).

**Tech Stack:** terrain.worker.js (worldgen), React/R3F + `render/mascots/voxelKit` (`Cube`/`Emissive`), vitest (characterization + static gates), the puppeteer visual gate (deliberate re-baseline).

**Live seams (verified this iteration — line numbers current):**
- `terrain.worker.js`: block ids 1=grass 2=dirt 3=stone 4=sand 5=snow 6=wood 7=leaves 8=cactus 9=water (`BLOCK_COLORS` :520); water fill `y<=28` (:415); the gen order — main grid → CA (:442) → `stampStructures` (:445) → support beams (:448) → **foliage pass closes :494** → **player-mod replay :496–503** → `return` :505. The `stampStructures` world→local clamp idiom is :226–231.
- `Terrain.jsx`: `TreasureChestsRender` :316–359 (group + tier `Outlines` :336 + `{!isCaptureMode() && (...)}` capture-null beacon :346); mount `<TreasureChestsRender />` :779 inside `MinecraftWorld`'s `<group>`; already imports `isCaptureMode` (:11), `OUTLINE` (:15), `TIERS` (:16), `Outlines` (:14).
- `render/mascots/voxelKit.jsx`: `Cube({position,rotation,size,color,rim,outline,...props})` (toon body + rim + drei outline; accepts `castShadow={false}` via `...props`); `Emissive` (toneMapped-false glow cube); `Ink` (flat silhouette).

---

## File Structure

- **Create** `frontend/src/world/homeAnchor.js` — the pure plinth module: consts (`HEARTH_Y`, `HEARTH_RADIUS`), `isHearthChunk(cx,cz)`, `stampHomeAnchor(blocks,cx,cz)`. One responsibility: the gen-time foundation.
- **Modify** `frontend/src/world/terrain.worker.js` — `import { stampHomeAnchor }` + one call after the foliage pass (~:495), before the player-mod replay.
- **Modify** `frontend/src/world/Terrain.jsx` — add `HomeAnchorRender` (voxelKit) + `import { Cube, Emissive }` + mount sibling of `<TreasureChestsRender/>`.
- **Create** `frontend/tests/world/homeAnchor.test.js` — characterization: flatten invariant, above-water margin, no-op off-origin, deterministic/idempotent.
- **Create** `frontend/tests/gates/home-anchor-gates.test.js` — static gates: voxelKit-not-PBR, brazier capture-null, mounted, worker order (stamp before mods), no `Math.random`.
- **Re-baseline** the measured-affected `frontend/tests/visual/baseline/*.png` (deliberate, §4).

---

### Task 1: The pure `stampHomeAnchor` module + worker wiring

**Files:**
- Create: `frontend/src/world/homeAnchor.js`
- Test: `frontend/tests/world/homeAnchor.test.js`
- Modify: `frontend/src/world/terrain.worker.js` (import + call near :495)

- [ ] **Step 1: Write the failing characterization test**

Create `frontend/tests/world/homeAnchor.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { stampHomeAnchor, isHearthChunk, HEARTH_Y, HEARTH_RADIUS } from '../../src/world/homeAnchor.js';

const CHUNK_SIZE = 16, CHUNK_HEIGHT = 256;
const VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
const idx = (x, y, z) => x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;

// A synthetic "natural" chunk: solid stone up to a per-column surface, water to y<=28 in dips, air above.
function makeChunk(surfaceFn) {
  const b = new Uint8Array(VOLUME);
  for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) {
    const s = surfaceFn(x, z);
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      if (y <= s) b[idx(x, y, z)] = 3;        // stone
      else if (y <= 28) b[idx(x, y, z)] = 9;  // water
      else b[idx(x, y, z)] = 0;               // air
    }
  }
  return b;
}
const highestSolid = (b, x, z) => {
  for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) { const t = b[idx(x, y, z)]; if (t > 0 && t !== 9) return y; }
  return -1;
};
const inFootprint = (cx, cz, lx, lz) =>
  Math.abs(cx * CHUNK_SIZE + lx) <= HEARTH_RADIUS && Math.abs(cz * CHUNK_SIZE + lz) <= HEARTH_RADIUS;

describe('Home Anchor — the Hearth plinth', () => {
  it('the plinth top is above the waterline (>28) with margin', () => {
    expect(HEARTH_Y).toBeGreaterThan(28 + 2);
  });

  it('flattens every footprint column to a flat HEARTH_Y top (origin chunk 0,0)', () => {
    const b = makeChunk((x, z) => ((x + z) % 5 === 0 ? 22 : 36)); // dips (under water) AND hills
    stampHomeAnchor(b, 0, 0);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      if (inFootprint(0, 0, lx, lz)) {
        expect(highestSolid(b, lx, lz), `column ${lx},${lz} flat top`).toBe(HEARTH_Y);
      }
    }
  });

  it('clears all air above the plinth + leaves no gap below (solid contiguous to the top)', () => {
    const b = makeChunk(() => 20); // natural surface well below the plinth -> must fill the gap
    stampHomeAnchor(b, 0, 0);
    for (let y = 0; y <= HEARTH_Y; y++) expect(b[idx(0, y, 0)], `no hole at y=${y}`).not.toBe(0);
    for (let y = HEARTH_Y + 1; y < CHUNK_HEIGHT; y++) expect(b[idx(0, y, 0)], `cleared at y=${y}`).toBe(0);
  });

  it('is a NO-OP on non-origin chunks', () => {
    const a = makeChunk(() => 36), b = makeChunk(() => 36);
    stampHomeAnchor(b, 5, 5);
    expect(Buffer.from(b)).toEqual(Buffer.from(a));
    expect(isHearthChunk(5, 5)).toBe(false);
  });

  it('touches all four origin chunks but nothing else', () => {
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) expect(isHearthChunk(cx, cz)).toBe(true);
    for (const [cx, cz] of [[1, 0], [0, 1], [-2, 0], [0, -2]]) expect(isHearthChunk(cx, cz)).toBe(false);
  });

  it('is deterministic / idempotent (no RNG — stamping twice equals once)', () => {
    const once = makeChunk(() => 30); stampHomeAnchor(once, -1, 0);
    const twice = makeChunk(() => 30); stampHomeAnchor(twice, -1, 0); stampHomeAnchor(twice, -1, 0);
    expect(Buffer.from(twice)).toEqual(Buffer.from(once));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/world/homeAnchor.test.js`
Expected: FAIL — `Failed to resolve import "../../src/world/homeAnchor.js"` (module not yet created).

- [ ] **Step 3: Write the minimal module**

Create `frontend/src/world/homeAnchor.js`:

```js
// THE HEARTH — the crafted home-anchor plinth at the world origin (World-Design M1).
// A flat, above-water, fully deterministic platform stamped at chunk-gen time. The spawn probe
// (Components.jsx:892-930) raycasts ground at (0,0) and drops the player groundY+1.2, so this
// flat top simply BECOMES the spawn floor — no spawn code changes. Pure coordinate math (NO RNG):
// the same seed regenerates the identical Hearth every load, zero save data (like the dungeon).
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;

export const HEARTH_Y = 32;       // plinth cap; > the water fill (y<=28) with a 4-voxel margin
export const HEARTH_RADIUS = 7;   // world [-7,7] in x/z -> a 15x15 standable platform
const STONE = 3;                  // existing block id (no new blocks in M1 — palette is M4)

// The 4 origin chunks the plinth touches: cx,cz in {-1,0} (world [-16,16) spans the corner quad).
export function isHearthChunk(cx, cz) {
  return (cx === -1 || cx === 0) && (cz === -1 || cz === 0);
}

function idx(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

// Flatten the Hearth footprint in THIS chunk to a solid plinth capped at HEARTH_Y, clearing
// everything above (natural hills / trees / overhang). Must run AFTER the main gen + foliage
// (so it removes any tree that spawned in its footprint) and BEFORE the player-mod replay
// (so player edits still win). No-op on every chunk but the four origin chunks.
export function stampHomeAnchor(blocks, cx, cz) {
  if (!isHearthChunk(cx, cz)) return;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      if (Math.abs(wx) > HEARTH_RADIUS || Math.abs(wz) > HEARTH_RADIUS) continue; // square footprint
      // Fill any gap (air/water) up to the cap so the platform never floats; keep natural rock.
      for (let y = 0; y <= HEARTH_Y; y++) {
        const i = idx(lx, y, lz);
        const b = blocks[i];
        if (b === 0 || b === 9) blocks[i] = STONE; // 0=air, 9=water
      }
      blocks[idx(lx, HEARTH_Y, lz)] = STONE;       // a clean stone cap
      for (let y = HEARTH_Y + 1; y < CHUNK_HEIGHT; y++) blocks[idx(lx, y, lz)] = 0; // clear above
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/world/homeAnchor.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the call into the worker**

In `frontend/src/world/terrain.worker.js`, add the import next to the existing top import (line 1):

```js
import { createNoise3D, createNoise2D } from 'simplex-noise';
import { stampHomeAnchor } from './homeAnchor.js';
```

Then insert the call between the foliage pass (closes at the current line 494) and the player-mod replay comment (`// 6. Apply late player in-game block modifications…`, current line 496). The exact anchor to insert AFTER is the foliage pass's closing `  }\n` and BEFORE `  // 6. Apply late player`:

```js
  // 5b. Stamp the crafted HOME ANCHOR plinth (origin chunks only). AFTER foliage so it clears any
  //     tree in its footprint; BEFORE the player-mod replay so player edits still win. NO-RE-MESH
  //     (baked into the chunk array here, meshed once like all gen output).
  stampHomeAnchor(blocks, cx, cz);

  // 6. Apply late player in-game block modifications over the chunk data
```

(Use Edit on the unique `  // 6. Apply late player in-game block modifications over the chunk data` line — prepend the comment + call so the insertion is anchored to a unique string.)

- [ ] **Step 6: Verify build + suite**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run && npm run build`
Expected: full suite PASS (count grows by the 6 new tests) · build clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/homeAnchor.js frontend/src/world/terrain.worker.js frontend/tests/world/homeAnchor.test.js
git commit -m "feat(world-m1): the Hearth plinth — deterministic flat above-water origin foundation

stampHomeAnchor (pure world/homeAnchor.js) flattens the 4 origin chunks to a 15x15 stone
plinth capped at HEARTH_Y=32 (>water-fill 28, +4 margin), filling gaps + clearing hills/trees
above so the top is truly flat. Wired into the worker AFTER foliage, BEFORE the player-mod
replay (player edits win). No RNG -> identical every load; no spawn change (the probe lands
on it via groundY+1.2). 6 characterization tests."
```

---

### Task 2: `<HomeAnchorRender/>` — the toon lodge + brazier (voxelKit) + static gates

**Files:**
- Modify: `frontend/src/world/Terrain.jsx` (add `HomeAnchorRender` + import + mount)
- Test: `frontend/tests/gates/home-anchor-gates.test.js`

- [ ] **Step 1: Write the failing static gate**

Create `frontend/tests/gates/home-anchor-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Home Anchor (the Hearth) gates', () => {
  const terrain = strip(read('world/Terrain.jsx'));
  const start = terrain.indexOf('const HomeAnchorRender');
  const block = start > -1 ? terrain.slice(start, start + 2500) : '';

  it('HomeAnchorRender exists in Terrain.jsx', () => {
    expect(start, 'const HomeAnchorRender = ...').toBeGreaterThan(-1);
  });
  it('renders via voxelKit (Cube), not PBR (no metalness/roughness in its own JSX)', () => {
    expect(block).toMatch(/<Cube\b/);
    expect(block).not.toMatch(/metalness|roughness/);
  });
  it('the brazier glow self-nulls under capture (Emissive downstream of !isCaptureMode())', () => {
    const guard = block.indexOf('!isCaptureMode()');
    const emissive = block.indexOf('<Emissive');
    expect(emissive, 'an Emissive brazier exists').toBeGreaterThan(-1);
    expect(guard, 'a capture guard exists').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(emissive);
  });
  it('is mounted in MinecraftWorld (sibling of the chest renderer)', () => {
    expect(terrain).toMatch(/<HomeAnchorRender\s*\/>/);
  });

  it('homeAnchor.js uses no Math.random (deterministic plinth)', () => {
    expect(read('world/homeAnchor.js')).not.toMatch(/Math\.random/);
  });
  it('the worker stamps the Hearth BEFORE the player-mod replay (player edits win)', () => {
    const w = strip(read('world/terrain.worker.js'));
    const stamp = w.indexOf('stampHomeAnchor(blocks');
    const mods = w.indexOf('chunkModifications.get(modKey)');
    expect(stamp, 'stampHomeAnchor is called').toBeGreaterThan(-1);
    expect(mods, 'player-mod replay exists').toBeGreaterThan(-1);
    expect(stamp).toBeLessThan(mods);
  });
});
```

- [ ] **Step 2: Run the gate to verify it fails**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/gates/home-anchor-gates.test.js`
Expected: FAIL — `HomeAnchorRender` not found / not mounted (the worker-order tests already pass from Task 1).

- [ ] **Step 3: Add the voxelKit import + `HomeAnchorRender` + mount**

In `frontend/src/world/Terrain.jsx`, add to the import block (after line 16, `import { TIERS } from '../render/quality';`):

```js
import { Cube, Emissive } from '../render/mascots/voxelKit';
```

Add the component immediately AFTER the `TreasureChestsRender` definition closes (after its `};` at current line 359), before `export const MinecraftWorld`:

```jsx
// --- THE HEARTH: the crafted home-anchor decoration (World-Design M1) ---
// The voxel PLINTH is baked at gen (world/homeAnchor.js, top at HEARTH_Y=32); THIS group is the
// building read on top of it. Built from voxelKit Cube/Emissive (the shared toon+rim+ink character
// look) — NOT PBR. Sibling of TreasureChestsRender. Static (one fixed place at origin, no store
// read). The brazier glow + its light self-null under isCaptureMode (the chest-beacon pattern) so
// the studio cards stay clean; the toon cubes freeze naturally (no animation).
const HEARTH_TOP = 32; // mirrors HEARTH_Y in world/homeAnchor.js (the plinth cap)
const HomeAnchorRender = () => {
    const WOOD = '#6B4A2F', STONE = '#8A8A8A', ROOF = '#7A3B2E', LEAF = '#3E7D32';
    return (
        <group position={[0, HEARTH_TOP + 0.5, 0]}>
            {/* the lodge — set back so it frames the spawn vista without blocking it */}
            <group position={[-2.5, 0, -2.5]}>
                <Cube position={[0, 0.15, 0]} size={[3.4, 0.6, 3.4]} color={STONE} castShadow={false} />
                <Cube position={[0, 1.0, 0]} size={[3.0, 2.4, 3.0]} color={WOOD} castShadow={false} />
                <Cube position={[0, 2.55, 0]} size={[3.6, 0.5, 3.6]} color={ROOF} castShadow={false} />
                <Cube position={[0, 3.05, 0]} size={[2.4, 0.5, 2.4]} color={ROOF} castShadow={false} />
                <Cube position={[0, 0.9, 1.55]} size={[0.9, 1.6, 0.12]} color="#2A1C12" outline={0} castShadow={false} />
            </group>
            {/* the brazier — a stone bowl on a post + a glowing ember (capture-null) */}
            <group position={[2.4, 0, 2.4]}>
                <Cube position={[0, 0.5, 0]} size={[0.4, 1.0, 0.4]} color={STONE} castShadow={false} />
                <Cube position={[0, 1.1, 0]} size={[0.7, 0.3, 0.7]} color="#5A5A5A" castShadow={false} />
                {!isCaptureMode() && (
                    <>
                        <Emissive position={[0, 1.35, 0]} size={0.34} color="#FF7A1A" intensity={2.8} />
                        <pointLight position={[0, 1.6, 0]} intensity={1.6} distance={9} color="#FF8A2A" />
                    </>
                )}
            </group>
            {/* two leaf planters flanking the lodge */}
            <Cube position={[-2.5, 0.3, 1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
            <Cube position={[2.7, 0.3, -1.4]} size={[0.6, 0.6, 0.6]} color={LEAF} castShadow={false} />
        </group>
    );
};
```

Mount it after `<TreasureChestsRender />` (current line 779):

```jsx
            <TreasureChestsRender />
            <HomeAnchorRender />
        </group>
```

- [ ] **Step 4: Run the gate + build**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/gates/home-anchor-gates.test.js && npm run build`
Expected: gate PASS (6 tests) · build clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/Terrain.jsx frontend/tests/gates/home-anchor-gates.test.js
git commit -m "feat(world-m1): the Hearth decoration — toon lodge + lit brazier (voxelKit, capture-null)

<HomeAnchorRender/> on the plinth (HEARTH_TOP=32): a set-back stone-and-wood lodge, a stone
brazier whose ember Emissive + pointLight self-null under isCaptureMode, two leaf planters —
all voxelKit Cube/Emissive (shared toon+rim+ink look, no PBR), castShadow off on decoration.
Static sibling of TreasureChestsRender. 6 static gates (voxelKit-not-PBR, brazier capture-null,
mounted, worker stamp-before-mods, no Math.random)."
```

---

### Task 3: Verify + the deliberate re-baseline (§4)

**Files:** `frontend/tests/visual/baseline/*.png` (only the measured-affected set)

- [ ] **Step 1: Full suite + build (the ratchet)**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run && npm run build`
Expected: unit count = prior + 12 (6 characterization + 6 gate); build clean. If red → fix before proceeding (never re-baseline over a broken app).

- [ ] **Step 2: Capture fresh frames (this proves the app MOUNTS — the iter-101 vacuous-gate guard)**

Run: `cd /Users/kz/Code/Crafty/frontend && npm run visual:capture`
Expected: completes without timeout (a timeout = a mount crash, NEVER "flaky" — debug before continuing). The Hearth appears at origin in any spawn-vista frame; the brazier Emissive is null in capture (only the toon cubes render).

- [ ] **Step 3: MEASURE which baselines diff (do NOT assume only explore-day — iter-98 lesson)**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run --config vitest.visual.config.js`
Expected: the gate reports which states exceed 6%. The Hearth sits at origin, so every state whose backdrop shows the spawn vista (explore-day, explore-night, and likely the unconditional-HUD states: boss/inventory/achievements/etc.) will diff. Record the exact failing set — that, and only that, is what gets re-baselined.

- [ ] **Step 4: HD self-eyeball each diffing frame (IB-grade, the look gate)**

Open each affected `current/` PNG at HD zoom. Confirm: the Hearth reads as a *crafted place* (flat plinth, lodge grounded on it, brazier present), the toon/ink look is coherent with the world, nothing floats or z-fights, the plinth top is at the player's feet. If the look is wrong (floating lodge, plinth too tall/blunt, framing blocks the vista) → adjust the `HomeAnchorRender` positions / `HEARTH_RADIUS` and re-capture before baselining. (No code change to the gate or the 6% threshold — ever.)

- [ ] **Step 5: Re-baseline the measured set + commit with rationale + KRB**

```bash
cd /Users/kz/Code/Crafty/frontend && npx vitest run --config vitest.visual.config.js --update   # or `npm run test:visual -- -u` per the config
cd /Users/kz/Code/Crafty
git add frontend/tests/visual/baseline/<each-affected>.png docs/superpowers/KEVIN-REVIEW-BATCH.md
git commit -m "test(world-m1): re-baseline the Hearth-affected visual states (deliberate, HD-eyeballed)

The origin crafted plinth + lodge shifts every spawn-vista frame (<list the measured set>).
HD-reviewed each in-context: the Hearth reads as a place, lodge grounded, brazier capture-null.
No threshold/gate change. KRB carries the before/after paths for Kevin's async review."
```

Add a KEVIN-REVIEW-BATCH entry with the before/after frame paths + a one-line "the Hearth landed; eyeball the spawn vista" note.

---

### Task 4: Doc-currency close-out (part of "done")

- [ ] **Step 1:** Banner this plan `✅ SHIPPED` at the top.
- [ ] **Step 2:** Flip the spec's M1 row (`docs/superpowers/specs/2026-06-13-crafty-world-design-hybrid.md` §3) to `✅ SHIPPED` and correct any seam claim reality falsified (none expected — line numbers verified).
- [ ] **Step 3:** Update `memory/ACTIVE_PLAN.md` (shipped M1 + NEXT unit = **M2 ocean-depth + coastline consts**) and add a `memory/CHANGELOG.md` entry (milestone-grade).
- [ ] **Step 4:** Refresh the `SOTA-INITIATIVE.md` status banner (world-design pass underway, M1 done).
- [ ] **Step 5:** Final commit `docs(world-m1): close-out — banners + ACTIVE_PLAN + CHANGELOG; resume = M2 ocean consts`, push `main`.

---

## Self-Review

**Spec coverage (PIECE 1):** ✅ voxel foundation = `stampHomeAnchor` modeled on `stampStructures`, gated `cx,cz∈{-1,0}`, inserted after stamp/foliage before player-mod replay. ✅ decoration = `<HomeAnchorRender/>` voxelKit sibling of `TreasureChestsRender`, brazier capture-null. ✅ correction folded: NO spawn-fix claim (probe is height-agnostic; value = flat above-water standable); gate = foundation top >28 + flat (the characterization test asserts `highestSolid === HEARTH_Y` across the footprint AND `HEARTH_Y > 30`). ✅ voxelKit-not-PBR (gate). ✅ perf: gen-time CPU on ≤4 chunks, decoration = a few shared `mobToonRim` draws, decorative castShadow off.

**Deferred to later milestones (recorded, not punted):** the "short pier toward water" is deferred to post-M2 (no water near origin until the ocean consts land — a pier implying absent water would read wrong); a villager hamlet is a fast-follow if Kevin reverses the quiet-Hearth default (KRB #13). Both noted here, not floating TODOs.

**Placeholder scan:** none — every step has exact paths, full code, exact commands + expected output.

**Type/name consistency:** `HEARTH_Y` (module) ↔ `HEARTH_TOP=32` (render mirror, commented as such); `stampHomeAnchor(blocks,cx,cz)` signature identical at definition, worker call, and test import; block id `3`=stone matches `BLOCK_COLORS`. The gate's `chunkModifications.get(modKey)` anchor string matches the worker's real player-mod replay line (:498).
