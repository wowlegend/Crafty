# Biome-Flora Render-Wiring — Implementation Plan (Phase B milestone 1)

> Wire the biomeTable `flora` contract into the terrain.worker foliage pass so the 10 biomes render
> distinct vegetation. Today the foliage decorator branches on `surfaceBlock` only, so all 6 grass
> biomes share one oak, taiga (grass-surfaced, flora 'pine') grows oaks not pines, and mesa
> (sand-surfaced, flora 'none') wrongly grows cacti. The `flora` field per biome already exists
> (biomeTable.js:36-50) — this is a wiring task, not a design task.

**Goal:** biome-distinct flora, gen-time + NO-RE-MESH-safe + capture-deterministic, reusing existing
shapes first (oak/pine/cactus), new shapes (acacia/flowers/jungle-tall/swamp) as later slices.

**Constraints / gates that pin the rewrite:**
- `biome-foliage-gates`: the foliage pass MUST keep `surfaceBlock === 5` + `pineShape(` + the snow
  slice's `vegRandom(worldX, worldZ, 4)` / `= 6;` / `= 7;` / no `Math.random` / no block-id ≥ 10.
  → AUGMENT the surfaceBlock branches with flora sub-logic; do NOT replace the surfaceBlock switch.
- `grass-revival-gates` + the no-re-mesh gates + the tree-through-rock air-guard (already shipped).
- `foliage.js` must stay Math.random-free (deterministic vegRandom only).
- capture-determinism: pickBiome + computeHeight are PURE → safe to recompute per column at gen-time.

**How the worker gets `flora` at foliage-stamp time:** the foliage pass (terrain.worker ~484) already
re-derives surfaceY by scanning the column; add `const { continent, moisture, temperature } =
computeHeight(noise2D, worldX, worldZ); const { flora } = pickBiome(temperature, moisture, continent);`
(both already imported + pure) and branch on `flora` WITHIN the existing surfaceBlock cases.

## Slices

### Slice 1 (this commit) — fix the 2 documented mismatches, gate-safe
- Compute `flora` per column in the foliage pass.
- `surfaceBlock === 1` (grass): if `flora === 'pine'` (taiga) → `pineShape` (same as snow); else keep
  the broadleaf oak (forest/plains/jungle/savanna/meadow/swamp unchanged for now).
- `surfaceBlock === 4` (sand): if `flora === 'none'` (mesa) → NO foliage; else (desert 'cactus') → cactus.
- Add a `biome-flora-gates` static gate asserting the foliage pass reads `flora` + the taiga-pine /
  mesa-skip branches exist.
- Gate: vitest (incl. biome-foliage + grass-revival + no-re-mesh) + build + eslint.

### Slice 2+ (later) — per-biome density + shape variety
- forest = denser oaks (higher vegRandom chance), plains/savanna/meadow = sparser.
- jungle = taller oaks (bigger treeHeight); savanna = acacia shape (new, foliage.js); meadow = flower
  shrubs (new); swamp = sparse droopy tree (new). Each new shape: deterministic, Math.random-free.
- LIVE-LOOK: a biome-teleport probe (set player to each biome's climate coords, screenshot) OR Kevin's eye.

## LIVE-LOOK note
Per-biome flora is hard to verify headless (must stand in each biome). Slice 1's correctness (taiga
pines / mesa bare) is unit/static-gate-locked; the visual per-biome variety is surfaced for Kevin's eye
(or a biome-teleport probe in a later slice).
