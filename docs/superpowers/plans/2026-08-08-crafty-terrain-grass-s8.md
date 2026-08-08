# S8 — Per-instance grass variation (yaw, scale, sub-cell jitter, hue)

> **Build contract** for `TERRAIN-GRASS-SOTA-PLAN.md` §S8. Spec = that file's S8 entry; this doc is
> the TDD plan the charter requires before any milestone build.
> **Stream:** terrain-grass · **Prerequisite for:** S9 (grass lighting).

---

## 0. Line cites re-resolved against live HEAD (`b9fbcce`)

The spec's cites into `OptimizedGrassSystem.jsx` were written before S6 (motes deleted) and S7
(wind driver extracted) shipped. The file is now **166 lines**, not ~200. Resolved:

| Spec cite | Live | What is actually there |
|---|---|---|
| `:112-116` position-only set | **`:144-148`** | `dummy.position.set(x, y + 0.35, z); dummy.updateMatrix()` — confirmed, no rotation/scale/colour |
| `:34` wind phase | **`:33`** | `float offset = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5;` — confirmed diagonal-correlated |
| `:190-191` "locked palette" | **`:157`** | in the `planeGeometry` comment: *"Bold-flat (flat blade, locked palette)"* |
| `:170-172` guarded `Math.random()` | **gone** | S6 deleted the motes; `grep Math.random src/OptimizedGrassSystem.jsx` returns nothing. The spec's "it stays inside `if (!capture)`" parenthetical is **moot** — the file is now RNG-free outright, which is a stronger starting position than the spec assumed. |
| `grassField.js:14` bare min-corners | **`grassField.js:15`** | `out.push([originX + x, topYs[i] + 1, originZ + z])` — integer world lattice, `stride = 2`, `cap = 50` |

**Verified live, not recalled** (both are load-bearing for the approach):

- `node_modules/three/src/renderers/webgl/WebGLPrograms.js:198` →
  `instancingColor: IS_INSTANCEDMESH && object.instanceColor !== null`. So `setColorAt()` alone
  turns the define on; **no `vertexColors: true` needed.** The spec's claim holds — but it holds for
  a reason the spec did not check, and the check nearly went the other way. The ShaderChunk sources
  are asymmetric: `color_pars_vertex` declares `vColor` under `USE_INSTANCING_COLOR`, while
  `color_pars_fragment` declares it **only** under `USE_COLOR`. Read from the chunks alone the
  conclusion is "the fragment never sees it, the tint is a no-op" — which is wrong. It is resolved in
  the *prefix*, at `WebGLProgram.js:796`, which ORs `instancingColor` into the fragment-side
  `USE_COLOR`. (`:627`, the vertex-side define, does not.) **Neither the spec's evidence nor the
  chunk sources settle this; only line 796 does.**
- **`instanceColor` MULTIPLIES — the trap the spec walks right past.** `color_vertex.glsl.js:18` is
  `vColor.xyz *= instanceColor.xyz` and `color_fragment.glsl.js` is `diffuseColor.rgb *= vColor`. The
  spec says "add `setColorAt()` hue/value jitter" next to a material whose colour is `#4a7c59`, and
  the natural reading — `setColorAt(i, new Color('#4a7c59'))` — **squares the base and renders the
  grass near-black**. It would have passed every gate in this repo: the call is present, the flag is
  set, the build compiles. So S8's tint is a **multiplier centred on 1.0**, and "the channel means
  stay at 1.0" is a unit test rather than a comment.
- `instanceColor` reaches the fragment on **both** materials: `meshbasic.glsl.js:16` `<color_vertex>`
  + `:79` `<color_fragment>` (today), and `meshlambert.glsl.js` has `color_vertex` too (S9's target).
  So the hue jitter S8 adds **survives S9's material swap** rather than needing redoing.
- `tests/gates/.source-grep-ledger.json` already contains `tests/gates/grass-revival-gates.test.js`
  (116 members). Members are FILES, not `it()` blocks → **extending it cannot raise the ratchet.**

---

## 1. What S8 changes, and what it deliberately does not

**Changes** — `src/OptimizedGrassSystem.jsx` + one new pure module:

1. Per-blade **yaw**, **uniform scale**, **sub-cell XZ jitter**, from an integer hash of the world
   `(x, z)`. Deterministic, RNG-free, clock-free (capture invariant 3).
2. Per-blade **hue/value jitter** via `setColorAt()`.
3. The shader wind **phase** becomes a two-term hash of the two translation components instead of
   `x*0.5 + z*0.5`, so blades stop swaying in lockstep along the world diagonal.

**Does not** (per the spec's KILLED list, plus one addition of my own):
no shared module-scope `BufferGeometry`; no `aVariation` `InstancedBufferAttribute`; no density
change; no wind-pin change; **no blade-silhouette change** — see §4.

---

## 2. The defect the spec does not mention: scale un-anchors the blade

`:145` is `dummy.position.set(x, y + 0.35, z)`. The geometry is a `planeGeometry(0.4, 0.7)`, which is
**centred on its own origin** — so the `+0.35` exists precisely to lift the tuft's *base* from the
plane's centre to the grass surface at `y`.

Apply a uniform scale `s` and that constant stops being correct: the blade becomes `0.7·s` tall,
still centred at `y + 0.35`, so its base lands at `y + 0.35 - 0.35·s`. At `s = 1.3` the blade sinks
**10.5 cm into the ground**; at `s = 0.8` it **floats 7 cm above it**. Sunk blades lose their bottom
to the terrain's opaque depth write; floating ones show a gap under a tuft that is supposed to be
growing out of the dirt.

The fix is one line — `y + 0.35 * s` — but it is exactly the kind of thing that ships wrong and then
gets diagnosed as "the grass looks a bit off" three commits later. **So the seam is not a bare hash
helper; it is a `bladeTransform()` that returns the whole placement, with base-anchoring as a
unit-tested invariant.** That is what makes the bug impossible rather than merely absent today.

---

## 3. Design

### New pure module — `src/game/grassVariation.js`

Follows the `src/game/grassBend.js` precedent from S7 (pure, injectable, unit-tested, imported by
the renderer).

```
hash01(x, z, salt) -> [0, 1)     integer mix (Math.imul), stable for negative coords
bladeTransform(x, y, z) -> { px, py, pz, yaw, scale }
bladeTint(x, z)         -> { r, g, b }   multiplicative jitter around the locked base colour
```

Chosen bounds, and why each is bounded where it is:

| Term | Range | Reason for the bound |
|---|---|---|
| `yaw` | `[0, π)` | π, not 2π — the blade is a **DoubleSide plane**, so yaw and yaw+π are the same picture. A `[0,2π)` range spends half its entropy on duplicates. |
| `scale` | `0.82 – 1.28` | keeps the tallest blade under 0.9 m so a tuft never reads as a bush; base stays anchored via §2. |
| `dx`,`dz` | `±0.45 m` | lattice spacing is `stride = 2` m, blade is 0.4 m wide → a jittered blade cannot reach its neighbour's cell. Breaks the visible grid without creating clumps. |
| tint | `±7%` value, `±4%` opposed R/B | **variation within the locked palette, not a palette change.** The mean stays `#4a7c59`. Re-tinting the grass is S9's owner call (§4), and S8 must not pre-empt it. |

### Wiring — `src/OptimizedGrassSystem.jsx`

- `useEffect`: `dummy.position.set(px, py, pz)`, `dummy.rotation.y = yaw`, `dummy.scale.setScalar(scale)`,
  `dummy.updateMatrix()`, `setMatrixAt`, then `setColorAt(i, tint)`; set
  `instanceColor.needsUpdate = true` alongside the existing `instanceMatrix.needsUpdate`.
- Shader `:33`: replace the diagonal sum with a two-term hash of
  `instanceMatrix[3][0]` / `instanceMatrix[3][2]`. Note the sub-cell jitter makes those components
  non-integer, which strengthens the hash rather than weakening it.

---

## 4. OWNER TASTE CALL — surfaced, not decided

**Blade silhouette.** The spec flags a 3-segment tapered curved blade as a possible follow-on. That
is a **fork of the locked bold-flat design language** (`:157` calls the flat blade locked), and it
also needs a baked vertical gradient.

**This plan ships variation on the EXISTING FLAT QUAD and does not fork the language** — which is
the spec's own recommendation, and the reversible order: look at what per-instance variation alone
buys before spending a design-language exception on geometry. Routed to `KEVIN-REVIEW-BATCH.md` as a
look-at-it-then-decide item, not a blocker.

**Grass COLOUR is S9's call, not S8's** — the 3-swatch ladder at `explore-day` + `explore-night`
belongs to the commit that puts grass in the lighting equation. S8's tint jitter is centred on the
existing colour and moves the mean by nothing.

---

## 5. TDD steps

**RED first, in this order. Each step is red before it is green.**

1. **`src/game/grassVariation.test.js`** — new, colocated (the `grassBend.test.js` precedent).
   Red because the module does not exist.
   - `hash01` **determinism**: same `(x,z,salt)` → identical value across calls, and across a fresh
     module import.
   - `hash01` **range**: `[0,1)` strictly, over a swept lattice incl. **negative** coords
     (`-1024 … 1024`) — the naive `sin`-hash sign bug lives here.
   - `hash01` **spread**: adjacent lattice cells (`x` vs `x+2`, and `z` vs `z+2`) differ by > 0.05;
     asserted over the whole sweep, not one sample. Also `hash01(a,b) !== hash01(b,a)` — a symmetric
     hash re-introduces the diagonal correlation the shader change is meant to kill.
   - `bladeTransform` **base anchoring (§2)**: for every scale the sweep produces,
     `py - 0.35 * scale === y` to 1e-9. **This is the assertion that matters most.**
   - `bladeTransform` **bounds**: `yaw ∈ [0,π)`, `scale ∈ [0.82,1.28]`, `|px-x| ≤ 0.45`, `|pz-z| ≤ 0.45`.
   - `bladeTint` bounds + mean: over the sweep, the channel means sit within 1% of the base colour
     (proves jitter, not a recolour — the §4 boundary made executable).

2. **`tests/gates/grass-revival-gates.test.js`** — extend (existing ledger member, no ratchet hit):
   - `expect(grass).toMatch(/bladeTransform\(/)` and `/setColorAt\(/`
   - `expect(grass).not.toMatch(/instanceMatrix\[3\]\[0\] \* 0\.5/)` — the old diagonal phase is gone
   - `expect(grass).toMatch(/instanceColor\.needsUpdate/)` — the classic forgotten flag
   - **These are source-grep assertions and prove code PRESENCE, not lived result.** Say so in the
     commit. The real proof is step 5.

3. **Implement** `grassVariation.js` → green step 1.

4. **Wire** `OptimizedGrassSystem.jsx` → green step 2. Build-first (JSX/structure touched).

5. **Mutation-prove** (rule 1) — `cp` backup, **never `git checkout`**:
   - break base anchoring (`0.35 * scale` → `0.35`) → step 1's anchor test MUST go red
   - make `hash01` return a constant → spread + tint-mean tests MUST go red
   - drop `setColorAt` from the wiring → step 2 MUST go red
   Restore from the backup, diff against `git show HEAD:<path>` to prove the restore is clean.

6. **Standing gates** — all eleven, from `frontend/`.

7. **LIVED RESULT** (rule 3) — `npm run visual:capture`, then:
   - **run it twice and diff `current/` against itself** — jitter must be bit-deterministic. A
     non-zero self-diff means the hash took a clock or an allocation order. `uptime` first; this
     box has been at load 25-30 and a capture there is ~20 min, not a hang.
   - **OPEN `explore-day.png` and `hearth.png` with my own eyes.** The success criterion is not a
     number: the 2 m grid should stop reading as a grid. A green byte-diff proves nothing here —
     the whole §B-race campaign was baselines of an empty mountain passing a byte comparison.
   - Re-baseline (intended look change) → Kevin sign-off via `KEVIN-REVIEW-BATCH.md`.

---

## 6. Definition of done

- [ ] `grassVariation.js` + colocated tests, all six invariants green, three mutations proven red
- [ ] `OptimizedGrassSystem.jsx` wired; diagonal wind phase gone
- [ ] eleven pre-push gates green; CI `success` observed with my own eyes at the pushed sha
- [ ] capture run **twice**, self-diff ~0
- [ ] frames **opened and described** — not just diffed
- [ ] baselines re-frozen; §4 taste call + re-baseline routed to `KEVIN-REVIEW-BATCH.md`
- [ ] `TERRAIN-GRASS-SOTA-PLAN.md` S8 marked done with the sha; cursor advanced to S9
