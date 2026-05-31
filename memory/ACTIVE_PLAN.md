# Active Plan

> **Method (session-archivist 4-piece):** this is the volatile current-task POINTER. It points at the detailed `superpowers` plan for the active work — it does NOT duplicate the TDD checklist. Ground truth = git `main` + `docs/superpowers/`.

## Current Task: S1-B — Render & post recipe (Crafty → SOTA, stream S1)

**Status:** M1 PLAN WRITTEN — awaiting greenlight to execute. S1-B split into two milestones (a 6-explorer render-subsystem map grounded the split: M1 rewrites the very files M2 would edit, so M2's exact code is authored *after* M1 lands).

- **Spec (approved):** `docs/superpowers/specs/2026-05-30-crafty-visual-direction-design.md` (§3 render/post recipe).
- **M1 plan (render correctness + device tiers):** `docs/superpowers/plans/2026-05-31-crafty-s1b-render-recipe.md` — 7 tasks: tier-wire (`quality.js`→store/composer) · sRGB GLSL decode (washout) · bloom 0.6→0.9 · N8AO AO (tier-gated) + dead-import cleanup · SMAA + warm grade · shadow/DPR tiering + PerformanceMonitor/AdaptiveDpr · verify. Flips the two §9 static gates (AO-present, bloom≥0.85) + adds an sRGB gate. Execute via `superpowers:subagent-driven-development` on branch `s1b-render-recipe`. Every visual task re-baselines under a forced `high` tier with a **mandatory human eyeball** before commit.
- **M2 plan (deferred — authored after M1):** `dangerLevel` mood field + `setDangerLevel` bridge hook · `<Atmosphere>` unifying fog/lights/sky on `tokens.PALETTE` with a continuous `mood∈[0,2]` lerp (explore→dusk→obsidian) · character rim-light + 2-band toon + inverted-hull `drei <Outlines>` (coexisting with the mob hit-flash traversal) · the two new capture states `dusk-danger`+`boss-obsidian`. Renderer-portable (WebGL2 now; WebGPU/TSL deferred to S3).
- **Key map corrections (vs prior assumptions):** the React-side day/night is *binary* `isDay` (NOT a continuous lerp; the "91→43→92" was a fog/background byte readout) — only fog is delta-lerped, ambient/sun/sky are hard ternaries → M2 must add a continuous mood field + convert the light ternaries to ref-driven lerps. `tokens.js` + `quality.js` are still **0-importer orphans** on `main` (S1-B is their first consumer). Player is first-person hands only (no 3rd-person body); 🧙 mascot is DOM text (no 3D mesh); mobs are per-entity (NOT instanced) so `<Outlines>`/toon apply normally but must coexist with the per-frame hit-flash traversal.
- **Verify against:** the S1-A visual-regression gate (`npm run test:visual`, 6% threshold) — **re-baseline after each intended look change, under forced `high` tier, human-reviewed**. Flip the `it.todo` AO-live + bloom hard-gates in `tests/gates/static-gates.test.js` to real assertions as they land.
- **Foundation (S1-A — DONE on `main`):** tokens `src/theme/tokens.js`, quality tiers `src/render/quality.js`, dev bridge + capture-determinism `src/devtest/`, the deterministic visual gate.

## Backlog (other streams)
- **S1-C** UI design system (one language; kill the 3 clashing languages + emoji — burn-down: 10 emoji-files, 255 hardcoded hex / 15 files).
- **S1-D** signatures (Atmosphere always-on / Spell-VFX lead / Mascot phase-2).
- **S2** game design + core loop · **S3** engine (touch input [biggest gap], de-monolith god-files, ECS hardening, WebGPU/TSL migration) · **S4** multiplayer + monetization (cosmetics+pass, NO gacha).
