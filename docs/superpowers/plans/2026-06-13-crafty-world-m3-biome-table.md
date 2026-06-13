# World M3 — Biome Table Refactor (look-neutral) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract the inline 3-branch biome if/else into a data-driven `pickBiome(temperature, moisture, continent)` + `world/biomeTable.js`, returning ONLY `{surfaceBlock, secondaryBlock}` — **byte-identical / look-neutral** (the prep seam for M4's biome distinctness; M3 changes nothing the player sees).

**Architecture:** A greenfield pure `world/biomeTable.js` holds the named biome→block map + `pickBiome` (the selector, identical logic to the old branch). The worker imports it and replaces the inline declare+branch (terrain.worker.js:396-404) with one `let {surfaceBlock, secondaryBlock} = pickBiome(...)`. The beach override (`:406-409`, sets sand when `surfaceY < BEACH_BAND_TOP`) stays UNTOUCHED *after* the call — so order is preserved and the result is identical. The height literal `30+n*40` and everything else are untouched. This is THE milestone where the test proves *nothing* changed.

**Tech Stack:** terrain.worker.js, a new `world/biomeTable.js`, vitest (a characterization oracle + a static gate). The puppeteer visual gate must stay **14/14 with NO re-baseline** — that green IS the render-level byte-identical proof.

**Live seam (verified this iteration — current line #s):** `terrain.worker.js:396-404`:
```js
      let surfaceBlock = 1; // Grass
      let secondaryBlock = 2; // Dirt
      if (temperature > 0.7 && moisture < 0.3) {
          surfaceBlock = 4; // Desert (Sand)
          secondaryBlock = 4;
      } else if (temperature < 0.3) {
          surfaceBlock = 5; // Snow
          secondaryBlock = 3; // Stone
      }
```
…immediately followed (`:406-409`) by the M2 beach override `if (surfaceY < BEACH_BAND_TOP) { surfaceBlock = 4; secondaryBlock = 4; }`. `temperature`/`moisture`/`continent` are computed at `:379-381` and in scope.

**Byte-identical guarantee (the design's whole point):** genChunk is unchanged except lines 396-404. So the chunk arrays are identical iff `pickBiome` reproduces the old branch for EVERY (temperature, moisture) AND the call leaves `surfaceBlock`/`secondaryBlock` reassignable (`let`) so the beach override still fires. The characterization test asserts the first over a fine grid; the static gate asserts the second; the unchanged visual gate confirms it at the render level.

---

## File Structure

- **Create** `frontend/src/world/biomeTable.js` — `BIOMES` (named biome→{surfaceBlock,secondaryBlock}) + `pickBiome(temperature, moisture, continent)`.
- **Modify** `frontend/src/world/terrain.worker.js` — import `pickBiome`; replace `:396-404` with the destructure.
- **Create** `frontend/tests/world/biomeTable.test.js` — characterization: oracle-grid equality + continent-neutral + the legacy block ids.
- **Create** `frontend/tests/gates/biome-table-gates.test.js` — static gate: worker uses `pickBiome`, the inline temp/moisture branch is gone, the beach override still runs (so order holds), `let` binding.

---

### Task 1: `pickBiome` module + worker wiring (byte-identical)

**Files:** Create `frontend/src/world/biomeTable.js`; Test `frontend/tests/world/biomeTable.test.js`; Modify `frontend/src/world/terrain.worker.js`.

- [ ] **Step 1: Write the failing characterization test**

Create `frontend/tests/world/biomeTable.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pickBiome, BIOMES } from '../../src/world/biomeTable.js';

// The OLD inline 3-branch (terrain.worker.js:396-404), reproduced verbatim as the oracle.
function oldBranch(temperature, moisture) {
  let surfaceBlock = 1, secondaryBlock = 2; // grass / dirt
  if (temperature > 0.7 && moisture < 0.3) { surfaceBlock = 4; secondaryBlock = 4; } // desert
  else if (temperature < 0.3) { surfaceBlock = 5; secondaryBlock = 3; }              // snow
  return { surfaceBlock, secondaryBlock };
}

describe('biome table (World-M3) — byte-identical to the old inline branch', () => {
  it('pickBiome reproduces the old branch for a fine (temperature, moisture) grid', () => {
    for (let t = 0; t <= 1.0001; t += 0.025) {
      for (let m = 0; m <= 1.0001; m += 0.025) {
        expect(pickBiome(t, m, 0), `t=${t.toFixed(3)} m=${m.toFixed(3)}`).toEqual(oldBranch(t, m));
      }
    }
  });
  it('continent is accepted but does NOT change the M3 result (look-neutral; M4 may use it)', () => {
    for (const c of [-0.5, -0.15, 0, 0.5]) {
      expect(pickBiome(0.8, 0.2, c)).toEqual(pickBiome(0.8, 0.2, 0)); // desert case
      expect(pickBiome(0.1, 0.9, c)).toEqual(pickBiome(0.1, 0.9, 0)); // snow case
      expect(pickBiome(0.5, 0.5, c)).toEqual(pickBiome(0.5, 0.5, 0)); // plains case
    }
  });
  it('the three biomes carry the exact legacy block ids', () => {
    expect(BIOMES.desert).toEqual({ surfaceBlock: 4, secondaryBlock: 4 });
    expect(BIOMES.snow).toEqual({ surfaceBlock: 5, secondaryBlock: 3 });
    expect(BIOMES.plains).toEqual({ surfaceBlock: 1, secondaryBlock: 2 });
  });
  it('returns a fresh object each call (the worker reassigns surfaceBlock for beaches — no shared mutation)', () => {
    const a = pickBiome(0.5, 0.5, 0);
    a.surfaceBlock = 99;
    expect(pickBiome(0.5, 0.5, 0).surfaceBlock).toBe(1); // not corrupted by the mutation above
  });
});
```

- [ ] **Step 2: Run → fail** (`cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/world/biomeTable.test.js` → import resolve error).

- [ ] **Step 3: Write the module**

Create `frontend/src/world/biomeTable.js`:

```js
// Biome table (World-Design M3). The worldgen surface/secondary block choice was an inline
// 3-branch if/else; this names the biomes + moves the SELECTION into one pure function, so M4
// can add columns (height curve, foliage, seabed) per biome without touching the worker's hot
// loop again. M3 is BYTE-IDENTICAL: pickBiome reproduces the old branch exactly (continent is
// accepted for M4's use but ignored here). Each call returns a FRESH object — the worker
// reassigns surfaceBlock for the beach band, so it must not share a frozen/singleton instance.
export const BIOMES = {
  desert: { surfaceBlock: 4, secondaryBlock: 4 }, // sand / sand
  snow:   { surfaceBlock: 5, secondaryBlock: 3 }, // snow / stone
  plains: { surfaceBlock: 1, secondaryBlock: 2 }, // grass / dirt
};

export function pickBiome(temperature, moisture, continent) {
  if (temperature > 0.7 && moisture < 0.3) return { ...BIOMES.desert };
  if (temperature < 0.3) return { ...BIOMES.snow };
  return { ...BIOMES.plains };
}
```

- [ ] **Step 4: Run → pass** (4 tests).

- [ ] **Step 5: Wire the worker**

Add the import next to the M2 import:
```js
import { pickBiome } from './biomeTable.js';
```
Replace `terrain.worker.js:396-404` (the declare + the 3-branch) with:
```js
      let { surfaceBlock, secondaryBlock } = pickBiome(temperature, moisture, continent);
```
(Leave `:406-409`, the beach override, exactly as is — it reassigns `surfaceBlock`/`secondaryBlock`, which is why the binding stays `let`.)

- [ ] **Step 6: Verify suite + build** (`npx vitest run && npm run build`) — count +4; build clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/biomeTable.js frontend/src/world/terrain.worker.js frontend/tests/world/biomeTable.test.js
git commit -m "feat(world-m3): biome-table refactor — pickBiome + world/biomeTable.js (byte-identical)

Extract the inline 3-branch biome if/else (terrain.worker.js:396-404) into a data-driven
pickBiome(temperature, moisture, continent) + a named BIOMES map. Byte-identical / look-neutral:
pickBiome reproduces the old branch exactly (continent accepted for M4, ignored here); the beach
override still reassigns surfaceBlock after the call (let binding preserved). Height literal
untouched. Characterization oracle test over a fine (t,m) grid. The M4 distinctness seam."
```

---

### Task 2: The static gate

**Files:** Test `frontend/tests/gates/biome-table-gates.test.js`.

- [ ] **Step 1: Write the gate**

Create `frontend/tests/gates/biome-table-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Biome table gate (World-M3)', () => {
  const worker = strip(read('world/terrain.worker.js'));
  it('the worker selects the biome via pickBiome (data-driven), with a let binding for the beach override', () => {
    expect(worker).toMatch(/from '\.\/biomeTable\.js'/);
    expect(worker).toMatch(/let \{ surfaceBlock, secondaryBlock \} = pickBiome\(temperature, moisture, continent\)/);
  });
  it('the inline temperature/moisture biome branch is GONE (moved into pickBiome)', () => {
    expect(worker).not.toMatch(/if \(temperature > 0\.7 && moisture < 0\.3\)/);
    expect(worker).not.toMatch(/else if \(temperature < 0\.3\)/);
  });
  it('the beach override still runs (sand band preserved, AFTER the biome pick)', () => {
    const pick = worker.indexOf('pickBiome(temperature');
    const beach = worker.indexOf('surfaceY < BEACH_BAND_TOP');
    expect(pick).toBeGreaterThan(-1);
    expect(beach).toBeGreaterThan(pick); // beach override comes after the biome pick
  });
});
```

- [ ] **Step 2: Run → pass** (3 tests; they already pass from Task 1's wiring — this LOCKS the seam against regression). Build clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/tests/gates/biome-table-gates.test.js
git commit -m "test(world-m3): biome-table static gate — pickBiome wiring + order + no inline branch"
```

---

### Task 3: Verify look-neutral (the 14/14 IS the proof)

- [ ] **Step 1:** `cd /Users/kz/Code/Crafty/frontend && npx vitest run && npm run build` — count = prior +7 (4 characterization + 3 gate); build clean.
- [ ] **Step 2:** `npm run visual:capture` (mount guard — must complete).
- [ ] **Step 3:** `npx vitest run --config vitest.visual.config.js` — MUST be **14/14 with NO diff**. A non-zero diff here means the refactor was NOT byte-identical → STOP and reconcile `pickBiome` against the oracle before committing/declaring (do NOT re-baseline — there is nothing intentional to re-baseline in a look-neutral milestone).

---

### Task 4: Doc-currency close-out

- [ ] **Step 1:** Banner this plan `✅ SHIPPED`.
- [ ] **Step 2:** Flip the spec's M3 row to `✅ SHIPPED`.
- [ ] **Step 3:** Update `memory/ACTIVE_PLAN.md` (shipped M3 + NEXT = **M4 biome-distinctness** — the first GATED, look-CHANGING world milestone: numLayers++ + authored 32×32 palette layers + biome-aware height curve + branched foliage) + a `memory/CHANGELOG.md` entry.
- [ ] **Step 4:** Refresh the `SOTA-INITIATIVE.md` status banner.
- [ ] **Step 5:** Final commit `docs(world-m3): close-out — resume = M4 biome distinctness`, push `main`.

---

## Self-Review

**Spec coverage (M3 row):** ✅ extract `:396-409`'s branch → `pickBiome` + `world/biomeTable.js` returning ONLY `{surfaceBlock, secondaryBlock}`. ✅ height literal untouched (M3 touches only 396-404). ✅ heightScale/seabed/treeType deferred to M4 (not added here). ✅ characterization test = byte-identical (the oracle grid; the unchanged visual gate is the render-level proof). ✅ NO baseline change (NO GATE).

**Order correctness (the M2 lesson carried):** `pickBiome` runs where the old branch ran (before the beach override); the `let` binding lets the beach override reassign — verified by the gate's `beach > pick` index check.

**Placeholder scan:** none — exact paths, full code, exact commands + expected output.

**Type/name consistency:** `pickBiome(temperature, moisture, continent)` identical at definition / worker call / test import / gate regex; `BIOMES.desert/snow/plains` block ids match the legacy 4/4, 5/3, 1/2; `let` binding consistent across the worker edit + the gate assertion.
