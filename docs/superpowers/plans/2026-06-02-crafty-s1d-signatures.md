# Crafty S1-D — Signatures (Spell-VFX lead · Atmosphere elevation · Mascot) — Implementation Plan

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Opus 4.8. NO Claude footer. NEW commits. AST-safe edits (no `sed` on `.js/.jsx`). Capture-determinism is LOAD-BEARING — every new VFX/atmosphere effect MUST gate animated/random/clock-driven behavior on `isCaptureMode()` (snap mood / `uTime=0` / seeded RNG / fixed cam) or it breaks the visual-regression gate.** Rigorous TDD (static gates + the puppeteer visual gate).

**Goal:** Deliver Crafty's distinctive "wow" signature look (the LEAD viral surface per the visual-direction spec) by elevating the three signatures — serving the LOCKED Vanguard+Toon direction, not redefining it.

**Vision basis:** the S1-D vision scout (2026-06-02, read-only) — full assessment below. **The crux discovery:** Crafty already owns a real GPU particle system (`src/world/GPUSparkSystem.jsx`, 1200-spark instanced additive pool, capture-safe via `uTime=0`, exposed as `store.triggerGPUSparks`) — but it's **only wired to melee/mob-damage** (`SimplifiedNPCSystem.jsx:850-879`); the spell path renders per-instance React-sphere slop instead. The biggest S1-D lever is *wiring the SOTA system the repo already has* into spells — a net draw-call REDUCTION + the combat-feel win.

---

## Verified current-state (spot-checked 2026-06-02)
- **Spell-VFX = SLOP:** `src/EnhancedMagicSystem.jsx` (944 LOC, 46 `useFrame`/`<mesh>`, 8 `meshStandardMaterial`) renders projectiles as emissive PBR primitives + trails/impacts as 25-40 individual React `<mesh>` spheres mounting/unmounting per cast. No cast telegraph/charge, no camera-shake on spells, no impact flash/shockwave/light-pop. The ONE good bone: on-MOB-hit fires `triggerGPUSparks` (SOTA), but ground/air-expiry impacts get the slop.
- **Hitstop:** flagged as a main-thread busy-wait on the shared `damageMob` path (`SimplifiedNPCSystem.jsx` ~825-879) — **implementer must VERIFY the exact form/line before replacing** (the cite is delegated/T3).
- **Atmosphere = good base, under-pushed:** `src/render/Atmosphere.jsx` + `mood.js` (continuous `mood∈[0,2]`, always-on at `GameScene.jsx:680`, capture-safe) + post stack (N8AO, GodRays high-tier, Bloom thr 1.0, HueSat, SMAA, Neutral tone-map, Vignette). Missing drama/recall: light motes, god-rays-at-MED, per-mood LUT, height fog.
- **Mascot:** placeholder `pointy-hat` game-icon at `MenuSystem.jsx:240` — no real signature character. **= Kevin's taste call.**

## Milestones

### M1 — Spell-VFX SPINE (combat feel) — *the recommended first target; buildable autonomously, deterministic, net perf win*
**Files:** `src/EnhancedMagicSystem.jsx`, `src/world/GPUSparkSystem.jsx` (reuse — don't fork), `src/SimplifiedNPCSystem.jsx` (hitstop + the existing spark-wiring pattern at 850-879), `src/Components.jsx` (camera-shake `triggerCameraShake` + spell-cast input ~666-718), `src/store/useGameStore.jsx`.
- Route **ALL spell impacts** (ground hit, air-expiry, mob-hit) through `triggerGPUSparks` with per-element color/velocity profiles (mirror the melee wiring). 
- Add **camera-shake on impact** (`triggerCameraShake`: ~0.4 normal / ~0.8 on mob-kill) — spells currently never shake.
- Replace the **busy-wait hitstop** (VERIFY it's a `while(performance.now()<end){}` first) with a **non-blocking** hitstop (time-scale/delta-dip in the loop, or a short store flag) — it's on the shared damage path spells also call.
- **Delete the per-instance React-sphere trail + impact meshes** (`SpellTrail`, `ImpactParticle`, `SpellImpact` sphere-spawns): trail → a velocity-**stretch-billboard** (or route through the GPU pool); impact → GPU sparks + ONE pooled **shockwave ring** + a transient **point-light pop** + a brief **bloom-spike** (drive Bloom intensity via uniform ~80ms). Projectile may stay a single mesh for now (M2 reshapes it).
- **Capture-determinism:** every new effect gates on `isCaptureMode()`. Preserve all spell GAMEPLAY (damage, cooldown, mana, targeting).
- **TDD:** static gates in `tests/gates/` — (a) the spell-impact path references `triggerGPUSparks`; (b) no `while (...performance.now()...)` busy-wait on the damage path; (c) `EnhancedMagicSystem` per-instance impact/trail sphere spawners removed (assert the slop components are gone / mesh-spawn count dropped). Build + `test:unit` green. Visual: add a `spell-cast` capture state if cleanly drivable (deterministic: fixed cast at `uTime=0`), else verify via build + a manual frame in the review batch.

### M2 — Layered cast ARC (telegraph → charge → release) — *buildable; batch the shape vocabulary for Kevin*
Telegraph rune-quad (≈150ms) → stretch-billboard projectile trail → impact flash, timed to readability budgets (telegraph 120-220ms, flash peak 40-90ms, decay 120-220ms; any impact ≤~15% viewport), built under the Brawl-Stars "animated-shapes, zero-textures" doctrine (additive geometry: rings/cones/hex-glyphs, ink-outline-consistent). **Batch 2-3 rendered cast-arcs for Kevin's shape-vocabulary + per-element personality call.**

### M3 — Atmosphere ELEVATION — *buildable, deterministic, perf-gated*
(1) Always-on warm **light motes** (~80-150 additive billboards, reuse the GPU-spark shader pattern, mood-tinted, `uTime=0` in capture). (2) **God-rays at MED tier** behind a real-device profiling check (samples 100→60). (3) **Per-mood LUT / tone-curve** lerped on `mood` (warm-lifted explore → cool-crushed dusk → near-mono obsidian). (4) **Height/gradient fog** (shader-driven off `mood`). All gate on `isCaptureMode()`. **Batch the magic-hour color script (premium-vs-candy) for Kevin.**

### M4 — Mascot — *KEVIN'S TASTE CALL (do NOT autonomously finalize)*
Render one reference each (same camera/light) of the 3 concept directions → batch for Kevin's pick. All ship on the existing `characterStyle.js` toon+rim+outline pipeline. Acceptance gate = shape-language matrix + 100%-black-silhouette test.
- **A — "Spark Familiar"** (recommended lead): floating voxel elemental companion, element-tinted to active spell, ember aura via GPUSparkSystem. Low-rig, high cosmetic-SKU + Marcus appeal; named in the spec; cross-wired to the spell signature.
- **B — "Crafty Hero"**: chunky toy-like apprentice-mage avatar (evolves the pointy-hat). Most commercial/customizable; humanoid rig (more S2 production).
- **C — "Craft-Golem"**: friendly creature built from the world's voxel blocks + glowing rune-core (reuses spell-emissive material). Most theme-ownable; mid build.

## Execution
Subagent-driven-development (Opus). **M1 first** (the spine). M2/M3 buildable + batch their taste-gates. M4 = render options → Kevin decides. Review frames + the magic-hour/shape/mascot taste-calls → `KEVIN-REVIEW-BATCH.md`. Re-baseline visual gate per intended look change.
