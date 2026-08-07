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

## 4. Mask indexing

Every access is `mask[cu + cv * sizeU]` with `cu < sizeU`, `cv < sizeV`, so the live region is exactly
`sizeU * sizeV`. The buffer is sized for the worst axis (4096); on the Y sweep only 256 entries are live.
