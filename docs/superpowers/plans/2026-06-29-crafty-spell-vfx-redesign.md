# Plan — Crafty Spell-VFX SOTA Redesign (v7-S3 build contract)

> **Design (HARD-GATE, approved):** `docs/superpowers/specs/2026-06-29-crafty-spell-vfx-sota-redesign.md`.
> This plan is the TDD build contract (CLAUDE.md Method — no build-from-spec shortcut). Each slice = one
> committable, individually-gated unit. Geometry-first, no shaders (Phase 1). Targets:
> `frontend/src/game/spellVisualProfiles.js` (data) + `frontend/src/render/spellVfx.jsx` (render) +
> new pure helpers `frontend/src/game/spellMotion.js`, `frontend/src/render/spellGeometry.js`.

## Verification reality (READ FIRST)
- The visual gate's spell frame is **`spell-cast.png` = a frozen FIREBALL cast only** (`scripts/visual/capture.mjs`
  ~L329-339). So **fire-touching slices change the gate** → capture-verify + intended re-baseline (batch to
  KEVIN-REVIEW). **Ice/lightning/arcane projectiles are NOT in any capture state** → those slices are
  pixel-invisible to the gate. To keep them honestly gated, **S3.5a extends the capture** to cast all four
  elements (or adds `ice-cast`/`lightning-cast`/`arcane-cast` frames) BEFORE the ice/lightning/arcane shape
  slices land (seam-gate-first discipline). Until then those slices rely on unit/static gates + code review +
  a live probe.
- Capture infra has intermittent load-timeouts (cmux CPU). Protocol: retry once; if env-blocked, ship on the
  frames-signal (all scene frames render, zero crashes) + unit/static gates, and note it (the de-monolith
  precedent). NEVER weaken a gate to pass.
- Capture-determinism is the #1 risk: every motion/geometry value must be a deterministic fn of
  `profile.capturePhase` + `seededUnit` under `isCaptureMode()` — NO `Math.random`/`clock` in capture.

## Slices (TDD red-first; ✓gate per slice)

### S3.1 — shared motion grammar (`spellMotion.js`, pure) + wire
- RED: `spellMotion.test.js` — `computeSpellMotion(motion, phase, flicker)` returns per-layer transform;
  roil = non-uniform scale (taller y) + spin; static = ~uniform, NO spin; strobe = quantized coreIntensity
  (on/off), NO spin; orbit = y-spin only, no scale-breathe; default = legacy uniform pulse+spin; determinism
  (same args → deep-equal). Run → red (module absent).
- GREEN: create `spellMotion.js`; add `motion:'roil'|'static'|'strobe'|'orbit'` to the 4 ENERGY_PROFILE
  entries; wire `SpellProjectileCore` useFrame to branch via `computeSpellMotion` (replaces the shared
  `1+sin(phase)*flicker` + hardcoded `rotation.x+=.06/.05/.04`); apply coreIntensity to the inner-core
  opacity (strobe). `_defaultEnergy` left untagged → default branch (legacy) = back-compat.
- ✓ unit (spellMotion + existing spell gates green) + build + eslint + **capture spell-cast.png** (fireball
  now roils — intended re-baseline; HD eyeball; batch). + new `spell-motion-gates.test.js` (spellVfx imports
  computeSpellMotion; no legacy `rotation.x += 0.06` literal).

### S3.2 — palette lane-separation + selective-bloom (data only)
- `spellVisualProfiles.js`: lightning `glowColor #86B8FF→#C9B8FF` (resolve ice/lightning blue collision,
  highest value); ice desaturate + `glowOpacity 0.20→~0.14`; add `midColor` per element; shrink core hotspot
  / push saturated hue toward HDR so the bloom HALO carries element hue not white.
- ✓ extend `spell-color-unify-gates.test.js` (assert the new hues/fields + no two elements share a glow lane)
  + build + capture spell-cast.png (fire palette shift — intended re-baseline).

### S3.3 — anisotropy + glowShape conform
- velocity-stretch the core along travel (from the velocity already in useFrame); add `glowShape` field:
  lightning `'none'` (DROP the glow sphere → axial glow), fire `'conform'` (anisotropic glow), others sphere.
- ✓ static seam-gate (glowShape honored; lightning glow sphere gone) + build + capture (fire) + unit.

### S3.4 — fire teardrop geometry + blackbody vertexColor ramp (`spellGeometry.js`)
- pure static builder (deterministic, vertexColors baked) ; ✓ spellGeometry.test.js + capture spell-cast.png.

### S3.5a — EXTEND capture to all 4 elements (seam-gate-first) → new baselines
- ✓ capture renders ice/lightning/arcane casts; commit new baselines.
### S3.5 — ice solid shard cluster + non-additive body + inverted-hull rim (BIG fix). ✓ capture ice-cast.
### S3.6 — lightning thin fractal line + strobe + meshBasic wire. ✓ capture lightning-cast.
### S3.7 — arcane counter-rotating rune-wheel + duotone. ✓ capture arcane-cast.
### S3.8 — secondary-motion pools (capped instanced, frustumCulled=false, capture-frozen). ✓ capture all.
### S3.9 — impact + telegraph per-element timing/anticipation polish. ✓ capture all.

(Phase-2 optional shaders + heat-haze = Kevin-gated, spec §9 — NOT auto.)

## Done-when
All 4 spells unmistakably distinct (silhouette + motion + value + palette; grayscale test passes), each
capture-gated, unit/build/eslint green, re-baselines batched to KEVIN-REVIEW with before/after.
