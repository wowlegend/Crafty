# Crafty — S1 Visual-Direction Design Spec

**Date:** 2026-05-30 · **Stream:** S1 (Art Direction & Visual Identity) of the Crafty → SOTA initiative
**Status:** ✅ APPROVED — the S1 initiative is built on this (S1-A + S1-B M1/M2a/M2b DONE+merged; S1-C design LOCKED, M1 build next). Brainstorming gate cleared.
**Process:** `superpowers:brainstorming` → this spec → review → `superpowers:writing-plans` → implement
**Grounded by:** `memory/REALITY-AUDIT-2026-05-30.md` (S0) · `memory/MONETIZATION-VIRALITY-SCAN-2026-05-30.md` · live API/platform verification (2026-05-30)

> This spec defines the **look** and the **render/post recipe + UI design system** to achieve it. It deliberately does **not** specify gameplay (S2), engine de-monolith / touch input / WebGPU migration (S3), or multiplayer/monetization (S4). It is authored **renderer-portably** (WebGL2-now / WebGPU-target) so it survives the S3 renderer migration unchanged.

---

## 1. North Star

> **Crafty is a warm, hand-crafted voxel world that reads instantly and turns dangerous beautifully.**

A **lit, ink-outlined voxel** look — the Hytale / modern-Fortnite / Brawl-Stars "Vanguard+Toon" sweet spot — premium and readable at thumbnail/clip scale, running light on web/iPad/mobile, and unmistakably *Crafty* via three owned signatures. Premium taste is the highest bar; commercial readability is the floor; an 8-year-old (Marcus) must read it in 0.5s and a young adult must find it cool.

**Three commitments, in tension, resolved:**
- **Tasteful & distinctive** (Kevin's bar) → carried by the *signatures*, not the base.
- **Commercially readable & cosmetic-friendly** (the data) → carried by the *Vanguard+Toon base*.
- **Performant on a web/iPad/mobile envelope** (S0 reality) → carried by *device-gated quality tiers* + disciplined render budget.

---

## 2. The Base — Vanguard + Toon (LOCKED)

Lit voxel + **ink outlines** + **saturated, high-luminance palette** + **deliberately strong silhouettes**.

| Pillar | Decision |
|---|---|
| **Form** | Voxel geometry, but *characterful* — chunky readable shapes, designed silhouettes (not raw Minecraft cubes). Characters/creatures get rounded, expressive proportions. |
| **Shading** | Lit (not flat): ambient + key/fill, **ambient occlusion in crevices** (the #1 cue separating premium voxel from slop — S0 found AO imported-never-instantiated), gentle **rim light** on characters, **selective specular** on metal/water/magic. Optional soft **toon banding** (2–3 steps) on characters for the cartoon read. |
| **Outline** | **Ink outlines** for instant silhouette legibility (the "cheat code" for thumbnails/clips). Characters/creatures/interactables → inverted-hull outlines (`drei <Outlines>`, verified current). World/terrain → read via AO + palette value-steps; optional screen-space edge outline on high tier only. |
| **Palette** | Saturated + high-luminance, but **value-structured** (controlled lights/darks so it never reads "cheap candy"). One source-of-truth token set (§4). |
| **Silhouette discipline** | Every signature/effect/skin must **preserve silhouette** — nothing may muddy the read at 96–160px or in a 2-second muted vertical clip. This is a hard rule, audited in visual-regression. |

**Why not the alternatives (for the record):** pure soft-illustrative (Lumen/Diorama) = highest taste, lowest commercial ceiling (Monument Valley ~$25M *lifetime*); pure flat-cel (Toonshade) = cheap but slop-risk + flat (Trove, the closest comp, died on flat voxel); pure Stylized-PBR (Vanguard) = premium but over-scoped for the envelope and weaker *shape*-distinctiveness. Vanguard+Toon is the only fork that satisfies all three §1 commitments.

---

## 3. Lighting & Post Recipe (renderer-portable)

The *look* is specified as intent; two implementation targets are noted. **S0 rendering-layer bugs are folded in as must-fixes** because they directly block this look.

| Layer | Intent | WebGL2-now (verified APIs) | WebGPU-target (S3) | S0 fix folded in |
|---|---|---|---|---|
| **Ambient Occlusion** | Crevice shadows = the premium-voxel cue | `SSAO`/`N8AO` (`@react-three/postprocessing`), **half-res, device-gated** | TSL AO node pass | **Instantiate AO** — currently imported, never added to composer (`GameScene.jsx:8`) |
| **Texture color** | Correct, not washed | sRGB **decode in injected GLSL** (`pow(2.2)`) in the voxel `onBeforeCompile` | TSL color-space node | **Fix washout** — texture array has no colorSpace; the fix is GLSL decode, **NOT** `.colorSpace=SRGB` (no-op on a custom-uniform sampler) |
| **Bloom** | Glow on *emissive/magic only*, never diffuse terrain | `Bloom` `luminanceThreshold ≈ 0.85` + `mipmapBlur`; ideally selective/emissive-layer bloom | TSL bloom node | **Raise threshold** — current 0.6 blooms diffuse terrain → flat |
| **Rim light** | Separate characters from background | Fresnel term in character material (`onBeforeCompile`/toon material) | TSL fresnel node | — |
| **Outlines** | Silhouette legibility | `drei <Outlines>` (inverted hull) on characters/creatures/props; pin versions (selective-outline regressions reported in newer pkg combos) | inverted hull (geometry, renderer-agnostic) | — |
| **Color grade** | The warm "magic-hour" signature tone | final LUT / tone-curve effect | TSL grade node | — |
| **Anti-alias** | Clean edges on mobile | `SMAA` (multisampling 0) | renderer MSAA / TAA | — |
| **Day/Night + Danger** | Existing day/night lerp drives mood (verified real: 91→43→92) | lerp ambient/fog/sky/grade/bloom by `timeOfDay` + a `dangerLevel` uniform | same, TSL-driven | extend the working day/night system, don't rebuild |

**Effects to drop / gate:** remove dead `SSAO/N8AO/ContactShadows` imports if not used on the active tier; per-frame `new Object3D`/`Vector3` allocations must be hoisted (S0 perf findings); weather instance matrices must not upload every frame in clear weather.

---

## 4. Palette Tokens (starting set — refine on real renders + device)

One source-of-truth token module (no scattered hex — S0 found hardcoded colors everywhere). Three palette *states* share semantic token names; the day/night + danger system lerps between them.

**Explore (day) — warm-heroic, de-pinked:**
| Token | Hex | Token | Hex |
|---|---|---|---|
| `sky.top` | `#2E4A7A` | `water.shallow` | `#8FD3D8` |
| `sky.mid` | `#6FB7C9` | `water.deep` | `#3E86A6` |
| `sky.horizon` | `#FFD9A0` | `foliage.leaf` | `#4F9E63` |
| `sun` | `#FFE9B0` | `foliage.hi` | `#74C07E` |
| `terrain.grass` | `#7FB85E` | `hero.cloth` | `#E8C07A` |
| `terrain.rock` | `#C2A06A` | `hero.accent` | `#2F6FAE` |
| `terrain.rock.shadow` | `#8A6B41` | `mob.body` | `#58C6A2` |
| `fog` | `#CFE6E4` | `mob.shadow` | `#2E8E74` |

**Magic palette (per-element, emissive — the only true "bloom" sources):** `fire #FF7A3C` · `ice #6FC8FF` · `lightning #FFE066` · `arcane #B36BFF` · `nature #7FE0A0` · default/cyan `#46E0FF`.

**Danger Tier 1 — Dusk-shift (night / combat, everyday):** sky → indigo/ember (`#161B3A → #2E4A6E → #C25A3A`), terrain cools + desaturates, fog `#3A2E40`, magic shifts red-orange `#FF5A4D`, rim light up. Tense, still legible & colourful (gentle for an 8-yo).

**Danger Tier 2 — Full Obsidian (boss only):** ink-stone (`#0A0C14 → #14182B → #2A1622`), terrain near-monochrome, heavy vignette, fog `#241026`; **only** colour = magic-red `#FF3B5C` + cyan creature-eye `#46E0FF`. Cinematic "boss" adrenaline; rare, so it lands as an event.

> Danger tiers are a single `dangerLevel` (0 = explore, 1 = dusk, 2 = obsidian) driving the same lerp infrastructure as day/night. Triggers (gameplay-defined in S2): night, combat, low-HP → Tier 1; boss encounter → Tier 2.

---

## 5. The Three Signatures (the distinctiveness — all three, sequenced)

These make Crafty *ownable* rather than "a nice Hytale-like." Sequenced by when they pay off.

**① Atmosphere — ALWAYS-ON (ships with the base; cheapest; brand recall).**
A signature lighting/atmosphere recipe applied globally: warm key + cool fill, **god-rays** (device-gated), volumetric fog, the **"magic-hour" colour-grade**, drifting light motes. Goal: every screenshot is instantly recognizable as Crafty. Borrows Lumen/Diorama distinctiveness *without breaking silhouettes*.

**② Spell-VFX Language — LEAD signature (the viral / shareable-moment engine; the soul of a combat game).**
A unified, **ownable VFX grammar**, not ad-hoc effects:
- Shared shape vocabulary: rune circles, hexagonal glyphs, energy ribbons/columns, ember bursts, impact shockwaves.
- Per-element palette (§4) + a consistent "signature cast" arc: telegraph (ground rune) → charge (energy column) → release (impact flash + sparks).
- Built for GPU particles (compute shaders post-WebGPU; the honest path to the claimed "1200 embers"). Fixes the S0 ribbon-trail bug + "pooled shockwaves aren't pooled."
- **Deliverable:** a VFX style guide + the hero "wow" cast (§7). This is the clip-able moment the monetization data says a standalone game *must* engineer.

**③ Iconic Mascot + Creatures — PHASE-2 signature (cosmetic/brand engine; built with the cosmetic pipeline in S2).**
A designed cast with a coherent **character design language**: hero silhouette system, a creature/mob family (the spark-sprite companion, characterful critters), all **silhouette-preserving + skin-ready** (cosmetics must read + sell). Replaces the placeholder 🧙‍♂️ emoji mascot and flat `#fdbcb4` box characters. Full asset production lands with S2/cosmetics; S1 delivers the *design language + 2–3 reference characters*.

---

## 6. UI Design System

Replace the **three clashing UI languages** (minecraft-bevel + glassmorphic + ad-hoc neon — S0) and the **emoji HUD markers** (🐉📦) with **one** system.

- **One language:** a refined "Crafty" UI — evolve the best of the glassmorphic into a warm, premium, kid-legible system. Tasteful, not corporate; high contrast for small screens.
- **Design tokens:** color (derived from the game palette — warm parchment/glass surfaces + teal/gold accents), spacing scale, radii, elevation, type scale — single source-of-truth (CSS custom properties), no scattered values.
- **Typography:** friendly-premium + high legibility; a characterful display face + a clean UI sans; **first-class Chinese (Simplified) support** (Marcus, Chinese-speaking) — type pairing must include a quality CJK face. IB-grade: tabular numerals for stats, baseline alignment, no orphaned punctuation.
- **Custom iconography:** a cohesive icon/sprite set replacing all emoji (brand identity + monetization-grade polish).
- **Touch-*ready* layout (input is S3, layout is S1):** responsive HUD breakpoints, `viewport-fit=cover` + `env(safe-area-inset-*)`, thumb-zone-aware HUD placement, `touch-action:none` on canvas. The on-screen controls *layer* is designed here as a visual system; its *input wiring* is built in S3.

---

## 7. The Signature "Wow" Hero Shot (the bar everything serves)

A single canonical frame that defines the target — used as the visual-regression north star and the marketing/clip hero:

> **Dusk-shift danger:** the hero mid-cast on a terraced cliff, a signature rune-circle spell charging (Signature ②), god-rays + magic-hour grade (Signature ①), AO grounding every voxel, ink-outlined silhouettes, a characterful creature reacting (Signature ③), magic-red the dominant accent against cooled terrain. Reads in 0.5s, looks premium, screams "Crafty."

This shot is produced as the **acceptance artifact** for S1 implementation.

---

## 8. Performance Discipline (device-gated; real-device-gated, not faked)

S0's FPS number was a SwiftShader software-floor artifact — **perf on real hardware is unknown.** Therefore:

- **Quality tiers (Low / Med / High)** toggling: AO on/off + resolution, god-rays on/off, shadow-map res, `RENDER_DISTANCE`, weather particle counts, bloom mipmap, DPR cap, outline technique.
- **Auto-gating:** `drei <PerformanceMonitor>` (incline/decline → step quality) + `<AdaptiveDpr>` + coarse-pointer/mobile detection → start Low on touch/mobile. `<Detailed>` LOD for distant chunks/props.
- **Hard rule:** no "60 FPS" claim is admissible without **real-device profiling** (target: iPad Safari + a mid Android). This is an explicit S1 acceptance gate, replacing the blind harness.

---

## 9. Success Criteria (machine-checkable — the anti-blind-harness mandate)

S0's root cause was a test that *cannot fail* on visuals/perf. Every S1 criterion must be verifiable by a harness that can go **red**:

1. **AO is live** — assert AO pass present in the composer (render-probe), and a visual-regression delta vs a no-AO baseline.
2. **Color correct** — texture sRGB decode present; mean saturation/contrast within target band vs reference (catches the washout regression).
3. **Bloom disciplined** — diffuse terrain does not bloom (visual-regression at a known frame); ~~threshold ≥ 0.85~~. **SUPERSEDED (2026-06-17 glowier-grade reversal; Kevin re-confirmed 2026-06-28):** the restrained-NEUTRAL grade lock was REVERSED — glowier/warmer is the intended look. `GameScene.jsx luminanceThreshold = 0.65` is INTENDED, not a violation; do NOT "raise it to 0.85". This S1 rule reflects the pre-reversal direction.
4. **One UI language** — no `minecraft-bevel` + `glass` + `neon` coexisting; UI built only from design tokens (CSS lint).
5. **No emoji as brand/mascot/HUD** (grep gate).
6. **Visual-regression suite** — reference screenshots at: menu, explore-day, explore-night, dusk-danger, boss-obsidian; diff on every change.
7. **Palette centralized** — no hardcoded hex outside the token module (lint).
8. **Perf gate** — measured FPS on real iPad + mid Android at each quality tier (recorded, not asserted from a software renderer).
9. **Silhouette test** — the hero shot + key creatures pass a 128px-thumbnail legibility check.

---

## 10. Scope, Dependencies & Open Questions

**In scope (S1):** visual identity; render/post recipe; palette + UI design tokens; the 3 signatures' *visual specs* (+ Atmosphere shipped, VFX grammar + hero cast, Mascot design language + 2–3 refs); device-tier scaffolding; the **S0 rendering-layer must-fixes that block the look** (AO instantiate, colorSpace decode, bloom threshold, UI unification, dead-import cleanup, per-frame alloc hoist in the render path).

**Explicitly deferred (other streams):**
- **S2 (game design):** danger-trigger rules, the spell roster/combos behind the VFX grammar, full mascot/creature roster, cosmetic pipeline.
- **S3 (engine architecture):** touch-input subsystem (the input wiring under the touch-ready layout), god-file de-monolith + 704-LOC store decoupling, **ECS + imperative-loop hardening**, **WebGPU/TSL renderer migration** (look authored portably so this is a swap, not a redo).
- **S4:** multiplayer, accounts, monetization implementation.
- **Other S0 stabilization fixes not blocking the look** (busy-wait hitstop, dead boss music, CanvasTexture leaks, bundle split) — sequenced into the stabilization pass, tracked but not S1-gating.

**Dependencies:** S1 *look* is renderer-independent; S1 *implementation* runs on WebGL2 now and must use portable authoring (TSL where practical) so the S3 WebGPU migration is non-destructive.

**Resolved decisions (2026-05-30, Kevin approved spec + "go with recommendations"):**
1. **Outline technique** — **inverted-hull (`drei <Outlines>`) on characters/creatures/props is the baseline ship.** A screen-space world-edge pass is built as a **High-tier-only** option and kept iff it survives real-device perf. Pin package versions (selective-outline regressions in newer combos).
2. **Toon banding** — **tunable material parameter; default = subtle 2-band toon on characters** (premium-leaning, not hard candy-cel), smooth-lit terrain. Dialable per art review.
3. **Type/fonts** — direction locked: **friendly-premium display + clean geometric UI sans + a quality Simplified-Chinese face**; pick **license-clean (open-source) families** in the type pass during writing-plans.
4. **Mascot design** — **S1 delivers the character design language + 2–3 reference characters**; full roster + cosmetic production in S2 (a dedicated artist may be engaged then).
5. **Renderer timing** — **look-first on WebGL2 now**, authored portably (TSL where practical); WebGPU/TSL migration is a non-destructive swap in S3.

---

## 11. Acceptance

S1 is "done" when: the hero shot (§7) is reproduced in-engine; criteria §9 pass on a harness that can go red; the look holds across the 5 visual-regression states; and it runs within budget on a real iPad at the Med tier. Then → `superpowers:writing-plans` for the S1 implementation plan.
