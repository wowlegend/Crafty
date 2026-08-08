# S9 — Put the grass in the lighting equation

> **Build contract** for `TERRAIN-GRASS-SOTA-PLAN.md` §S9. Spec = that file's S9 entry; this doc is the
> TDD plan the charter requires before building. **Prerequisite S8 (`947748f`) is met.**
> **Stream:** terrain-grass.

---

## 0. Cites re-resolved against live HEAD (`eb58176`)

| Spec claim | Verdict |
|---|---|
| `transparent + DoubleSide` renders TWICE, `WebGLRenderer.js:1619` | **TRUE, and worse than cited** — the split is at **`:922` AND `:1619`**, both `material.side = BackSide` → render → `FrontSide` → render. Every grass draw-call estimate in every prior doc is 2x low. |
| Lambert has `#include <begin_vertex>`, so the `onBeforeCompile` patch survives | **TRUE** (1 occurrence in `meshlambert.glsl.js`) |
| Only `characterStyle.js:66` sets `customProgramCacheKey` | **TRUE**, exactly one hit, at line 66 |
| Material is `MeshBasicMaterial({color:'#4a7c59', transparent, opacity:0.7, side:DoubleSide})` | **TRUE**, `OptimizedGrassSystem.jsx:10-15` |
| S8's `instanceColor` tint survives the Lambert swap | **TRUE** — `meshlambert.glsl.js` includes `color_vertex`, and the fragment-side `USE_COLOR` comes from `WebGLProgram.js:796` ORing `instancingColor`. No `vertexColors` flag needed on either material. |

---

## 1. ⚠️ This slice changes frame cost, so determinism MUST be re-measured

**This is the lesson S8 paid for, applied.** `c472533` fixed a fixed-sleep in `capture.mjs`, but the
finding underneath was that **capture determinism is a property of (harness x code state)**. S9 changes
frame cost in three ways at once — a different material, a *new shader program permutation*, and
**halving the grass draw calls** by dropping transparency.

So the plan does not get to inherit "the harness is deterministic" from S8's run. **Re-measure it:
capture twice, self-diff, and require worst < ~0.15% before re-baselining anything.** If it regresses,
that is a finding about the harness, not a reason to loosen a threshold.

---

## 2. What changes

`src/OptimizedGrassSystem.jsx`, material declaration + the `<instancedMesh>`:

1. `MeshBasicMaterial` → `MeshLambertMaterial`. The `onBeforeCompile` wind patch is unchanged (Lambert
   has `begin_vertex`).
2. **Drop `transparent` and `opacity`.** This is the perf half of the slice: it halves grass draw calls
   outright. It is also a real LOOK change — the blades stop being 70% translucent — and combined with
   S8's finding that more tufts are now visible, the field may read considerably denser. Flag it, look
   at it, and hand the density knob (`grassField.js` `cap = 50`) to Kevin rather than pre-emptively
   turning it.
3. `receiveShadow` yes, `castShadow` no (per the spec's KILLED list).
4. `grassMaterial.customProgramCacheKey = () => 'grassWind'` — without it three stringifies the
   `onBeforeCompile` closure on every program lookup.
5. **Colour: OWNER CALL, see §4. Do NOT pick one and ship it.**

---

## 3. TDD steps

1. **`tests/gates/grass-revival-gates.test.js`** (existing ledger member, no ratchet hit):
   - `expect(grass).not.toMatch(/MeshBasicMaterial/)` and `toMatch(/MeshLambertMaterial/)`
   - `expect(grass).toMatch(/customProgramCacheKey/)`
   - `expect(grass).not.toMatch(/transparent: true/)` — the double-draw guard; this is the assertion
     that stops the perf half being silently reverted
   Source-grep, so **presence not lived result** — say so in the commit.
2. Implement → green.
3. **Mutation-prove** all three (cp-backup, never `git checkout`).
4. Standing gates (eleven).
5. **Determinism re-measure per §1**, THEN re-baseline.
6. **Open the frames**, ground-level probe included — the 31 gated cameras sit 20-30m up and cannot
   judge grass (S8 measured 3.119% against baseline with 0 of 31 over the 6% gate).

---

## 4. OWNER TASTE CALL — the grass colour. Produce the ladder; do not decide.

Tufts are `#4a7c59` (blue-green) on ground whose base is `(86,124,53)` (yellow-green): they do not read
as the same plant. **S8 deliberately left this unspent** — its tint is a multiplier centred on 1.0, with
the channel means asserted, precisely so S9 still gets a free choice.

**Deliverable:** a `scripts/visual/grass-swatch-probe.mjs` rendering **3 swatches x 2 moods**
(`explore-day`, `explore-night`) into ONE comparison image, ground-level camera. Spec recommends the
middle be a yellow-green in the `#5E8A3E` family. Route to `KEVIN-REVIEW-BATCH.md`.

Note honestly what this is: `OptimizedGrassSystem.jsx:157` calls the palette **locked**. This is a
design-language edit that is only in scope because art was de-gated — call it that, do not smuggle it in
as a bug fix.

**Blade silhouette stays NOT TAKEN** (S8's call, unchanged): a tapered 3-segment blade forks the locked
bold-flat language and needs a baked vertex gradient. Ship lighting on the flat quad; look; then decide.

---

## 5. Definition of done

- [ ] material swapped; `transparent` gone; `customProgramCacheKey` set; `receiveShadow` on
- [ ] 3 gate assertions, each mutation-proven red
- [ ] eleven gates green; CI `success` observed at the pushed sha with my own eyes
- [ ] **determinism re-measured (§1)** before any baseline is written
- [ ] frames opened and described, ground-level probe included
- [ ] 3-swatch x 2-mood ladder rendered and routed to Kevin; colour NOT chosen by the loop
- [ ] `TERRAIN-GRASS-SOTA-PLAN.md` S9 marked `DONE <sha>`; cursor advanced
