# Ocean Gerstner Waves on the GPU — Plan (RETROSPECTIVE)

> **Written AFTER the build, on review #3's finding R4.8.** The milestone shipped as `9860eaa9` straight from
> the EXTERNAL-BASELINE runner-up line, without this document — the "no build-directly-from-the-spec"
> shortcut CLAUDE.md forbids. This file records the contract it should have been built against and how each
> step was actually verified, so the milestone has a reviewable plan; it is not a claim that the plan came
> first. The process fix is in OVERNIGHT.md's corrections.

**Goal:** Move the ocean's per-frame Gerstner displacement (~9,400 vertices, position + normal + foam
re-uploaded every frame; ~14% of the frame budget by Ocean.jsx's own earlier measurement) from the CPU into
the vertex shader, with the rendered surface unchanged.

**Architecture:** `world/oceanProfile.gerstnerGlsl(waves, q)` GENERATES the GLSL from the same `WAVES` table
the JS reference functions read, every constant substituted by value and the waves unrolled into scalar
statements. `render/Ocean.jsx` splices it into `begin_vertex`/`beginnormal_vertex` and computes the foam in
the shader; the CPU loop, the per-frame `needsUpdate` and the foam attribute are gone.

**Spec:** `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE.md` §4 runner-up "Gerstner into the vertex shader".

## Global Constraints

- The surface must not change: wave time stays the frozen capture phase under capture (byte-stable frames).
- No backtick inside the shader template literal. No new dependency.

## Tasks (as executed)

### Task 1: the generator, proven against the JS surface
- `gerstnerGlsl` emits `void gerstnerWave(vec2 p, float t, out vec3 disp, out vec3 nrm)`.
- Gate `tests/gates/ocean-gpu-waves-gates.test.js`: an INTERPRETER for the generator's statement shapes
  evaluates the generated text and must match `gerstnerDisplace`/`gerstnerNormal` at sample points and
  times; a driven one-wave table at Q = 0.8 pins the steepness in the normal (the shipped Q = 1 makes a
  dropped Q an equivalent mutant). Mutation-proven W1–W6 (sign, axis swap, dropped wave, dropped Q, phase
  speed, capture time unfrozen).

### Task 2: Ocean.jsx displaces on the GPU
- Vertex-shader splice; foam in the shader; no per-vertex loop, no per-frame upload (structural checks in
  the same gate, anchored to Ocean.jsx).

### Task 3: seen
- Same-renderer capture A/B, frames opened (commit `9860eaa9` message).

## Follow-ups found later
- Review #3 (R4.7): the allocation-free `gerstnerDisplaceInto`/`gerstnerNormalInto` the CPU loop needed became
  dead with it and were deleted, with `gerstnerHeight`; Ocean.jsx's comments still described the CPU path.
