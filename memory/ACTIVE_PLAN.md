# Active Plan

> **Method (session-archivist 4-piece):** this is the volatile current-task POINTER. It points at the detailed `superpowers` plan for the active work — it does NOT duplicate the TDD checklist. Ground truth = git `main` + `docs/superpowers/`.

## Current Task: S1-B Render & post recipe (Crafty → SOTA) — **M1 + M2a DONE; M2b / S1-C NEXT**

**Status:** ✅ **M2a MERGED to `main`** (fast-forward `599d976..7c82def`, pushed 2026-05-31) — the mood/danger atmosphere system + the **bright-Caribbean art direction**. Whole-branch review APPROVED. `test:unit` 32+2todo · `test:visual` **4/4** (menu / explore-day / explore-night / boss-obsidian). M1 (render correctness + device tiers) merged earlier.

- **Spec (approved):** `docs/superpowers/specs/2026-05-30-crafty-visual-direction-design.md`.
- **M1 — DONE:** `docs/.../2026-05-31-crafty-s1b-render-recipe.md` (sRGB decode · N8AO · bloom · SMAA+grade · device tiers).
- **M2a — DONE:** `docs/.../2026-05-31-crafty-s1b-m2a-mood-atmosphere.md`. Delivered: `mood∈[0,2]` model (`src/render/mood.js` — moodRef / moodTarget / sampleMood) + store `dangerLevel`/`setDangerLevel` · **`<Atmosphere>`** (`src/render/Atmosphere.jsx`) = gradient SkyDome + mood-lerped lights/fog off `tokens.PALETTE` (replaced the inline Sky/fog/ternary-lights) · terrain `mood` uniform desaturation (gentle at dusk, strong at obsidian; luminance-preserving so dusk stays readable) · the **bright-Caribbean art pass**: **Neutral (Khronos PBR) tone mapping** (ACES was muting everything → grey "London"; switched via a `<ToneMapping>` composer EFFECT, since `gl.toneMapping` is overridden by the composer) · turquoise water texture · deeper saturated sky · bloom threshold→1.0 (kills the milky sky haze) · **sun-disc mesh + volumetric GodRays** (high-tier) · softer vignette · 4-state capture suite incl. `boss-obsidian`.
- **NEXT — M2b (character render language):** rim-light + subtle 2-band toon (`MeshToonMaterial`+gradientMap) on mobs (NOT the boss — preserve its emissive telegraphing) + inverted-hull `drei <Outlines>` on mobs/boss/props — must coexist with the mob per-frame hit-flash traversal (`SimplifiedNPCSystem.jsx`). **Needs a character capture fixture** (spawn ONE deterministic mob in capture; mobs are otherwise suppressed) + a `character-closeup` state so the look is gated. Author via `superpowers:writing-plans` against post-M2a `main`.
- **Pending look tweak (deferred):** obsidian boss state is dark (intentional cinematic; bump `MOOD_SCALARS.obsidian.ambientIntensity` if gameplay visibility needs it). Gradient sky + god-rays (originally S1-D) were pulled forward into M2a.
- **Art-direction lessons (load-bearing for ALL future render work):** `~/.claude/projects/-Users-kz-Code/memory/feedback_stylized_render_tonemapping.md` — ACES mutes stylized-vivid looks (use **Neutral/AgX**); tone mapping is a composer **effect** under @r3f/postprocessing (not `gl.toneMapping`); **bloom threshold must track scene brightness** (raise exposure → raise threshold, else milky haze); when subjective art feedback won't converge via tweaks, pull REAL **reference images + extract the color/light DNA**, and after **2 failed tweaks STOP + diagnose** (the haze was found by hypothesis-driven isolation, not more tweaking).
- **Verify against:** the visual-regression gate (`npm run test:visual`, 6% threshold, **4 states**) — re-baseline per intended look change, forced `high` tier, **human-reviewed**.
- **Foundation (S1-A — DONE on `main`):** tokens `src/theme/tokens.js`, quality tiers `src/render/quality.js`, dev bridge + capture-determinism `src/devtest/`, the deterministic visual gate.

## Backlog (other streams)
- **S1-C** UI design system (one language; kill the 3 clashing languages + emoji — burn-down: 10 emoji-files, 255 hardcoded hex / 15 files).
- **S1-D** signatures (Atmosphere always-on / Spell-VFX lead / Mascot phase-2).
- **S2** game design + core loop · **S3** engine (touch input [biggest gap], de-monolith god-files, ECS hardening, WebGPU/TSL migration) · **S4** multiplayer + monetization (cosmetics+pass, NO gacha).
