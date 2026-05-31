# Active Plan

> **Method (session-archivist 4-piece):** this is the volatile current-task POINTER. It points at the detailed `superpowers` plan for the active work — it does NOT duplicate the TDD checklist. Ground truth = git `main` + `docs/superpowers/`.

## Current Task: S1-B — Render & post recipe (Crafty → SOTA, stream S1)

**Status:** NOT STARTED (next up, post-compaction).

- **Spec (approved):** `docs/superpowers/specs/2026-05-30-crafty-visual-direction-design.md` (§3 render/post recipe).
- **Execute via:** `superpowers:writing-plans` (write the S1-B plan from the spec) → `superpowers:subagent-driven-development`.
- **Scope:** instantiate AO (currently imported-never-used → flat voxels); GLSL sRGB colorSpace decode (fixes washout — NOT `.colorSpace=SRGB`, that's a no-op on the custom sampler); bloom `luminanceThreshold ≥ 0.85`; rim light; subtle 2-band toon + inverted-hull outlines (`drei <Outlines>`); color-grade; day/night + 2-tier danger lerp (dusk / full-Obsidian) driven off the existing (verified-real) day/night system. Renderer-portable (WebGL2 now; WebGPU/TSL deferred to S3).
- **Verify against:** the S1-A visual-regression gate (`npm run test:visual`, 6% threshold) — **re-baseline after each intended look change**. Flip the `it.todo` AO-live + bloom hard-gates in `tests/gates/static-gates.test.js` to real assertions as they land.
- **Foundation (S1-A — DONE on `main`):** tokens `src/theme/tokens.js`, quality tiers `src/render/quality.js`, dev bridge + capture-determinism `src/devtest/`, the deterministic visual gate.

## Backlog (other streams)
- **S1-C** UI design system (one language; kill the 3 clashing languages + emoji — burn-down: 10 emoji-files, 255 hardcoded hex / 15 files).
- **S1-D** signatures (Atmosphere always-on / Spell-VFX lead / Mascot phase-2).
- **S2** game design + core loop · **S3** engine (touch input [biggest gap], de-monolith god-files, ECS hardening, WebGPU/TSL migration) · **S4** multiplayer + monetization (cosmetics+pass, NO gacha).
