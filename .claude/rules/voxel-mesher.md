---
paths:
  - "frontend/src/world/mesher.js"
  - "frontend/src/world/terrain.worker.js"
  - "frontend/src/world/Terrain.jsx"
  - "frontend/src/world/vertexAO.js"
---
# Greedy voxel meshing — the winding and UV invariants

Fires when you edit the mesher. Split out of the old `r3f-pointer-lock-voxel-meshing.md`, which had **no
`paths:` frontmatter at all** (so it never scoped to anything), named `terrain.worker.js` as the mesher's
home after it moved, and listed four of the six face directions — missing exactly the two that were later
found broken.

## Where the mesher lives

`frontend/src/world/mesher.js`. It was extracted from `terrain.worker.js` (`71c24ca`) because the worker
has zero exports and assigns `self.onmessage` at module scope, so under vitest's `environment: 'node'`
importing it throws — the mesher was unreachable from any test and every claim about its geometry rested
on *reading* it. `frontend/tests/gates/mesher-geometry-gates.test.js` is the behavioural gate.

## 1. Winding — CCW from outside, on ALL SIX directions

`Terrain.jsx` renders `FrontSide`. A clockwise face is culled, i.e. invisible — that is the bug that once
made terrain see-through. Falling back to `DoubleSide` is not a fix: it costs overdraw and invites
z-fighting and chunk-boundary cracks.

**All six permutations must wind CCW-from-outside, and the +Y and −Y orders are NOT the same** — the XZ
order is reversed between them; they cannot share one order and both stay correct. The gate asserts every
triangle's winding against its own declared normal, which is what catches this; do not re-derive the
coordinates from memory.

## 2. UVs must match the WORLD edges of the merged quad

A greedy quad covers `w × h` blocks, so its UV rect must be `w × h` **in the same orientation**, or the
texture stretches by `w/h`.

Only **+Y** builds its corners so that `c0→c1` spans `h`; the other **five** span `w`. A single shared UV
rect therefore fed `u` the h-edge and `v` the w-edge on five of six faces (`d676069`). It is invisible
whenever a merge is square — which is why reading the constant never settled it, and why the review item
that prompted the fix wrongly called −Y correct.

**The fixture matters more than the assertion here.** A single 16×16 slab catches only 4 of the 5 broken
directions and looks complete, because on a square merge a transposed rect is identical to a correct one.
Use an asymmetric footprint too.

## 3. The mask self-clears — so nothing you do to the clear changes output

The greedy pass zeroes every cell it consumes before emitting, so the per-slice `mask.fill(0, 0, sizeU *
sizeV)` is redundant *today*. It is kept as the guard that makes the redundancy safe: if a future edit
leaves a cell populated, its absence corrupts geometry silently and across chunks.

**Consequence for testing:** any experiment that pokes at the clear CANNOT FAIL, so a green result there
proves nothing. Test the property the clear PROTECTS instead — meshing chunk B after A and C must equal
meshing B alone.

## 3b. The mesher emits NO water faces — and three places depend on it

W2 moved the water surface to Ocean.jsx's Gerstner plane. Every branch that writes `mask` guards on
`!== 9`, and `blockType` is decoded straight from `mask`, so block type 9 cannot reach the emit path.

**This is now an ASSERTED invariant, not a comment** (`mesher-geometry-gates.test.js` drives water above
stone, beside stone, under stone, pocketed in stone, and a chunk of pure water, checking no emitted vertex
carries type 9 while the seabed still draws). It had to be, because three things silently rested on it and
a finding proposed deleting all three as "dead":

- the mesher's own `if (blockType === 9) { ao.push(3); continue; }` in the AO corner loop — deleted;
- Terrain.jsx's TWO `abs(vBlockType - 9.0) >= 0.1` fragment guards, always true — deleted;
- the shader comment "Water faces carry AO 3", describing a case that cannot occur — deleted.

**If you ever re-introduce water faces, that gate goes red first** — which is the point. Deleting code
because you traced today's callers is a bet on nobody changing the premise; asserting the premise is what
makes the deletion safe. `colors.r` carries the blockType per vertex, so the claim is directly measurable.

**AND: a shader edit is not covered by the unit suite.** `Terrain.jsx` builds GLSL inside a JS template
literal — a green `npm run test:unit` says nothing about whether it compiles. Compile it in a real
browser (`node scripts/visual/pov-probe.mjs`, then OPEN the frames) before believing a shader change.
**Never put a backtick inside that template literal**; it terminates the string and the parse error lands
far from the edit.

## 3c. Structure stamping: derive the chunk radius, never hardcode it

`stampStructures` swept a fixed ±1 chunk neighbourhood and discarded out-of-range blocks. Measured: of the
1,352 candidate blocks the eight neighbour iterations examine, **ZERO** could ever land — the dungeon is
centred at local 8 with half-extent 6, so its footprint (local 2..14) always fits its own chunk.

Deleting the loop fixes today and breaks tomorrow: a larger blueprint would clip silently at the seam,
exactly as the cave automaton did. The radius is **derived from the footprint** instead
(`world/dungeonStamp.js` — `stampChunkRadius` / `blueprintHalfExtent`), so it is one iteration today and
follows the blueprint if that grows. Extracted because `terrain.worker.js` assigns `self.onmessage` at
module scope and cannot be imported under vitest — which is why this went unexamined for so long.

## 4. Mask indexing

Every access is `mask[cu + cv * sizeU]` with `cu < sizeU`, `cv < sizeV`, so the live region is exactly
`sizeU * sizeV`. The buffer is sized for the worst axis (4096); on the Y sweep only 256 entries are live.
