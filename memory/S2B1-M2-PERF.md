# S2-B1-M2 — Boulder-bull physics gate (engine-side) + on-device FPS protocol

> The de-risk-FIRST milestone: measure the cost of the largest beast-form collider **before** building the other 3 beasts. Headless CI can't measure GPU FPS, but it CAN measure (a) the transactional-swap correctness against real Rapier and (b) the **engine-side physics cost** of the bigger capsule (the thing the swap actually changes). Branch `s2b1-m2-bull-fps`.

## 1. Correctness — LOCKED (automated, real Rapier WASM)
`tests/integration/beast-collider-rapier.test.js` drives the same `@dimforge/rapier3d-compat` build the app ships:
- **1000-cycle handle-stability** (the M1-review gap): `setShape` mutates **in place** — the collider + rigid-body handle never change across 1000 enter/exit cycles, the handle keeps resolving to the same collider, and the collider count never grows (no leaked remove+re-add). Proves "no re-bind, no re-mesh."
- **All 4 forms KCC-compatible:** `computeColliderMovement` returns finite movement for comet/bull/hawk/golem; the swap never breaks the sweep.
- **Real-collider restore:** `restoreBaseCollider` drives a real Rapier collider back to base + leaves it KCC-usable.
- **Footprint bound:** every form ≤ 2× base in halfHeight and radius (deterministic broad-phase-load bound).

## 2. Engine-side cost (empirical, `scripts/bench/bull-physics-bench.mjs`)
**Worst-case stress** — 576 static cuboid colliders in a tight 12×4×12 grid centered on the player, 4000 KCC sweeps + world steps per shape:

| form | dims [hh, r] | per-sweep | vs base |
|---|---|---|---|
| base (human) | [0.5, 0.4] | ~104 µs | 1.00× |
| **bull** (ice) | [0.45, 0.62] | ~905 µs | **8.75×** |
| **golem** (arcane) | [0.70, 0.50] | ~1231 µs | **11.9×** |

**Reading it honestly:**
- The cost grows **superlinearly with capsule size in dense clusters** — a bigger swept shape touches more broad-phase candidates per sweep. The **golem** (largest combined dims) is actually the costliest, not just the bull.
- BUT this is a **pathological density** (576 colliders packed around one point). It is **one entity's sweep, once per frame**: even the worst case is ~0.9–1.2 ms = **~5–7% of a 16.6 ms (60 fps) frame budget**. Not a frame-killer.
- **Real in-game density is far lower**: terrain is greedy-meshed (few large colliders, not hundreds of tiny ones) and mobs are siege-capped (~16–40). Expected real delta is a small fraction of this worst case.

**Verdict: engine-side physics cost is ACCEPTABLE → GREENLIGHT the other 3 beasts (M3+).** The larger forms are measurably costlier but bounded; no design change required. Re-run the bench anytime with `node scripts/bench/bull-physics-bench.mjs`.

## 3. Mitigation levers (apply only if the device test flags it)
- **`collisionGroups`/`solverGroups`** on the player KCC filter — exclude non-terrain colliders (loot orbs, decorative/sensor colliders) so the big capsule only sweeps what it must. (The current `filterPredicate` in `Components.jsx` already filters; tightening the groups is the next lever.) — S3 perf.
- **Trim the golem/bull dims** (`src/game/beasts.js` BEAST_FORMS — Kevin-tunable) if a real device shows a siege-time dip.
- **`applyImpulsesToDynamicBodies`** (the bull debris-shove, Decision #6) is OFF by default and is the one thing that would add per-contact solve cost on top of this — keep it gated on a real-device pass.

## 4. On-device FPS protocol (Kevin's real-device check — the GPU number CI can't produce)
The above is CPU physics only. The remaining gate is a real GPU frame-rate check:
1. On a mid iPad (the platform floor), enter a **night siege** (max mobs) and transform to the **golem** (costliest), near built structures/terrain.
2. Watch for a sustained frame-rate dip vs human form (the dev FPS overlay / Safari Web Inspector timeline).
3. Pass criterion (per the reviewer): a **bounded delta vs human form**, not an absolute — if the golem/bull in a full siege holds within a few fps of human, ship; if it tanks, pull the §3 levers.
This is a 5-minute manual check; it does NOT block M3–M6 (which are decision-independent), only the final S2-B1 sign-off + the bull's debris-shove decision.
