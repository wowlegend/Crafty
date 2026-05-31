# Crafty S0 Reality Audit — Real vs Gemini-Claimed Baseline

**Date:** 2026-05-30 · **Method:** static read + live headless capture · read-only · 2-lens adversarial refutation
**Repo:** `/Users/kz/Code/Crafty` (`frontend/src`) · **Capture assets:** `memory/REALITY-AUDIT-2026-05-30-assets/`

---

## Executive Summary

The single most important truth: **the project's own test pipeline is a blind rubber-stamp**, so every "verified / 100% green / COMPLETED" claim in CHANGELOG/ARCHITECTURE is untrustworthy by construction. `package.json` test script is `node test_swarm.js` — a 3-assertion store test plus a bare `vite build`; "green" means only that the 3.84MB monolith bundled, with **no bundle-size budget, no perf gate, no asset-completeness check, no Lighthouse**. That is the root cause: claims were graded by a harness that cannot fail on the things that actually matter.

That said, the audit's surprise is positive: **the game genuinely renders and runs.** Live capture confirmed a real 3D voxel world (grass/dirt/wood blocks, a tree, horizon terrain, blue sky) plus a complete HUD, and day/night is real and measurable (mean brightness 91 day → 43 night → 92 restored, a clean ~2× darkening). Several "SOTA" subsystems are substantially real, not slop: the greedy mesher, the WebGL2 DataArrayTexture pipeline, the Rapier KCC physics, the A* AI worker, the Web Audio occlusion graph, the store-decoupling architecture, and the chunk-geometry dispose fix all do roughly what they claim. The polished animated menu clears a premium bar.

The headline perf number is **NOT usable**: `fpsAvg=4.6 / fpsMin=0.4` was measured under SwiftShader **software** rendering on a headless host (no GPU) — a hard floor, not a real-GPU number; `drawCalls=-1` (renderer.info unreachable in R3F v9). So "flawless 60+ FPS on web/iPad/mobile" remains **unverifiable** and is the biggest open risk. The one unambiguous, fully-verifiable failure is the **platform envelope**: the game is 100% keyboard+mouse and hard-gated on the desktop Pointer Lock API, which iOS/iPadOS Safari does not support — there is zero touch input layer anywhere, so on a real iPad/phone the player can render the menu but cannot look, move, or fight. **Zero findings stand at Critical after adversarial refutation** (all 4 touch criticals downgraded to High/Medium because touch was never an in-code target, only an externally-stated goal); **6 High-severity findings stand**. Net: a more-real-than-expected codebase carrying real stabilization debt, an unbuilt mobile tier, and a credibility gap created by its own blind test harness.

---

## Real-vs-Claimed Scorecard

| Dimension | Headline Claim | Reality | Confidence | Note |
|---|---|---|---|---|
| render-terrain | See-through terrain "completely resolved" via CCW winding + FrontSide | **works** | High | Winding math independently re-derived for all 6 faces; screenshots show solid opaque terrain. Water shader unverifiable (no water at seed 12345). |
| voxel-mesher-texturing | 3D greedy mesher + 9-layer DataArrayTexture, "80-90% vertex reduction" | **works** (claim partial) | High | Mesher + texturing pipeline genuinely correct (ported & ran). "80-90%" is best-case flat; real cave terrain ~40%. |
| perf-reality | Store decoupling → "0ms" particles, "60+ FPS" | **partial** | High (arch) / Low (FPS) | Decoupling real & well-built. "0ms" literally false (per-burst JS loop). "60+ FPS" unverifiable (SwiftShader floor). One real un-memoized provider re-render leak. |
| gpu-leaks | VRAM "completely stabilized" | **partial / over-claimed** | High | Chunk-geometry dispose chain genuinely correct. Only 2 dispose calls in whole tree; loot/damage CanvasTextures leak. Idle heap delta does NOT refute (paths never exercised). |
| physics-kcc | Real Rapier KCC, not velocity overrides | **works** | High | createCharacterController + computeColliderMovement + setNextKinematicTranslation all real & reachable. Knockback is monkey-patched; delta-scaling mis-resolves at low FPS. |
| ai-workers | Voxel-height A* over 9×9 grid, not linear chase | **works** | High | Genuine priority-queue A* on real Rapier-raycast grid; pack-aggro fires same-tick. Cover aura dead (non-reactive). 81 raycasts/aggro-mob/frame on main thread. |
| combat-magic-boss | Cast→mana→projectile→collision, 3-phase boss, voxel destruction | **partial** | High (code) / 0 (visual) | Substantially wired & reachable. None visually confirmed (boss lvl-5 gated). 35ms busy-wait hitstop; broken ribbon trail; "spell combos" don't exist; melee can't hit boss. |
| audio | FM pad, cavern reverb, occlusion, boss-driven music | **partial** | High | Web Audio graph genuinely connected; occlusion/reverb correct. Boss music **dead** (key mismatch `bossActive` vs `isBossActive`). It's subtractive not FM; chord-mode labels wrong. |
| architecture-debt | Decomposed god-files, no fns in Zustand, ECS = "real architecture" | **partial / broken** | High | Doc's own "AI Structural Law" violated (dual-write fns to store AND GameMethods). ECS real & load-bearing (not vestigial); 2 of 3 queries dead. 10 god-files >700 LOC; 704-LOC/238-key store. |
| mobile-touch | "web + iPad + mobile + touch" platform | **broken** | High | 100% keyboard+mouse; hard-gated on Pointer Lock (unsupported iOS Safari). ZERO touch handlers/joystick/dep. Menu renders; cannot look/move/fight on touch. |
| visual-quality | Cohesive premium SOTA voxel look | **partial / broken** | High | Menu genuinely premium. In-world: flat/washed — AO imported-never-instantiated, texture missing colorSpace (pastel), 3 incompatible UI languages, emoji 🧙‍♂️ mascot. Day/night a real win. |
| build-bundle-load | Optimized SOTA build, "loaded upfront for zero-stutter" | **partial / over-claimed** | High | Mostly TRUE but self-serving. ONE 3.84MB chunk (1.29MB gzip), zero code-split, warning silenced via limit:4000. Dead console-shim ships. Blocks first paint on cellular. |

---

## Live Runtime Truth

| Metric | Value | Read |
|---|---|---|
| Build status | **success** (4s, 2629 modules) | Compiles clean |
| Bundle | `index-CFtvgWjk.js` = **3,842.89 kB (1,290.64 kB gzip)**; ONE chunk, no code-split | Over-weight for mobile; total `build/` = 3.7M |
| CSS | 45.30 kB (8.81 kB gzip) | — |
| Workers | terrain.worker 9.04 kB, ai.worker 3.25 kB | Real off-main-thread |
| Server started | **true** | Vite preview on `[::1]` (IPv6) |
| renderedOk | **true** | 3D world + HUD genuinely rendered |
| FPS avg / min | **4.6 / 0.4** — ⚠️ SwiftShader SOFTWARE floor, NOT a real-GPU number | Any perf verdict from this = fabrication |
| Draw calls | **-1** (renderer.info unreachable in R3F v9) | Genuinely unverifiable from this harness |
| Heap start → end | 52.5MB → 51.23MB (Δ **-1.27MB**) | Clean but **inconclusive** — ~8s static idle never exercised loot/chunk-stream/mob paths |
| Console errors | `ERR_CONNECTION_REFUSED` localhost:8001/api/auth/me (backend absent, gracefully caught) + 2× 404 (favicon/sound) | No uncaught JS errors, no ErrorBoundary trip |
| WebGL warnings | `GPU stall due to ReadPixels` ×2 then self-silences — SwiftShader screenshot-readback artifact, NOT a defect | — |

**Screenshots (all exist):**
- `01-menu.png` — polished animated title screen (shimmer logo, confetti, glow CTA). 261KB.
- `02-spawn-day.png` — actual game world: voxel terrain, tree, HUD, hotbar, minimap. 1.0MB, brightness 91, ~179 colors.
- `03-night.png` — same scene darkened. Brightness 43 (~½ of day) = hard proof day/night path is real. 1.0MB.
- `04-action.png` — daytime restored, store flags flipped (survival + boss + 3 hostiles) but **NO mob/boss visible** (spawning is ECS/proximity-driven; static camera couldn't force it). Brightness 92.

**Capture caveats (anti-fabrication trail):** WebGL was DEAD under the spec'd `--use-gl=egl` (no GPU surface on headless macOS) → switched to `--use-angle=swiftshader`; the spec'd `setGameMode('creative')` menu-bypass was WRONG (real gate is App's local `isPointerLocked` useState — fixed by clicking "Start Adventure"). Combat/mobs could not be visually forced. **No `src/` file was modified** (verified `find -newermt`). FPS and draw-calls are the only genuinely unverifiable runtime metrics; everything else is eye + objective pixel stats.

---

## Prioritized Slop / Bug List

> Severities are post-refutation `verifiedSeverity`. **0 Critical stand.** 6 High stand.

### High

| Title | Reality | Evidence | Fix (1-line) | Refute |
|---|---|---|---|---|
| Platform envelope: no touch — Pointer-Lock-gated, unplayable on iPad/iOS | broken | `GameScene.jsx:679`; `MenuSystem.jsx:229-236`; `Components.jsx:418-433` `isLocked=!!document.pointerLockElement` | Add touch input layer: virtual joystick + drag-to-look + tap zones; gate movement on abstracted input state, not `pointerLockElement`. `mobile-touch#1` | upheld (critical→high) |
| Camera look has no cross-platform/touch fallback | broken | `GameScene.jsx:679` drei PointerLockControls; no `mousemove/pointermove/touchmove` in repo | Add drag-to-look mutating camera Euler when pointer lock unavailable. `mobile-touch#4` | upheld (critical→high) |
| Game cannot be entered/played on touch (soft-lock) | broken | `MenuSystem.jsx:229-236` optimistic flag; all interactivity gated on real `pointerLockElement` | Branch entry flow: on touch skip requestPointerLock, activate touch layer; decouple "started" from lock acquisition. `mobile-touch#6` | upheld (critical→high) |
| Responsive layout absent for mobile/tablet | partial | `App.css:183` only @media (3 HUD icons); `index.html:6` bare viewport; no touch-action/safe-area | Add HUD breakpoints, `viewport-fit=cover` + `env(safe-area-inset-*)`, `touch-action:none` on canvas — but only alongside a real touch input layer. `mobile-touch#5` | upheld (critical→high) |
| Implied SOTA render perf / 60+ FPS — unsubstantiated | unverifiable | `runtime-metrics.json` 4.6 FPS SwiftShader floor; `Terrain.jsx:389` RENDER_DISTANCE=4 (81 chunks); per-frame `new Object3D` `GameScene.jsx:429,460,493` | Profile on real GPU/device; hoist per-frame allocs; consider lower RENDER_DISTANCE/instanced colliders on mobile. `render-terrain#6` | **unrefuted** ⚠️ |
| Boss is not a complete encounter — melee deals 0 dmg | broken | `damageBoss` only from spell collision `EnhancedMagicSystem.jsx:398-418`; melee routes to ECS mobs, boss is separate `BossEntity` | Add melee→boss cone/distance check vs `getBossPosition()` calling `damageBoss`. `combat-magic-boss#6` (note: downgraded to medium by refuters — see below) | downgraded→medium |
| Visceral hitstop is a 35ms synchronous main-thread busy-wait | partial | `SimplifiedNPCSystem.jsx:801-802` `while(performance.now()<hitstopEnd){}`; stacks under AoE/chain (5 mobs = 175ms freeze) | Remove busy-wait; implement via useFrame delta-scale or timed slow-mo flag for ~2 frames (single shared clamped timestamp). `combat-magic-boss#2` | **unrefuted** ⚠️ |
| Combat/boss soundtrack is dead — store key mismatch | broken | SoundManager reads `state.bossActive`; producer writes `isBossActive:()=>...` (function, diff key) `AdvancedGameFeatures.jsx:170`; `bossActive` never set | Set a plain `bossActive` boolean in store (preferred), OR use `isBossActive?.()` in SoundManager. `audio#1` (downgraded→low by 2nd refuter) | upheld(high)/downgraded(low) split |
| Production bundle too heavy for mobile envelope | broken | `index-CFtvgWjk.js` 3.84MB/1.29MB gzip; no public/, no preload, no split | Target <500kB gzip initial via vendor + scene split; modulepreload in-game chunk; dynamic-import postprocessing. `build-bundle-load#4` (downgraded→medium by 2nd refuter) | upheld(high)/downgraded(medium) split |

> Note: `combat-magic-boss#6`, `audio#1`, `build-bundle-load#2/#4`, `gpu-leaks#4`, `visual-quality#1/#2/#3`, `mobile-touch#2/#3` were filed High but **downgraded to Medium** under one or both refute lenses (touch findings: target was never in code; perf/visual/bundle: real but optimization/credibility-grade, not crash/security). The ⚠️ **unrefuted** items (`render-terrain#6`, `combat-magic-boss#2`) hit the 24-refute cap — treat their High as provisional but verify-worthy.

### Medium

| Title | Reality | Evidence | Fix | Refute |
|---|---|---|---|---|
| GameSystemsProvider context value un-memoized → whole-subtree re-render per stat tick | partial | `GameSystems.jsx:33,120-137` rebuilt every render, wraps Canvas | useMemo the value or split high-freq stats into own provider. `perf-reality#3` | unrefuted |
| Player useFrame allocates ~5 Vector3/frame + updateProjectionMatrix every frame | partial | `Components.jsx:579-609,642` | Hoist temporaries to ref scope `.set()`; only updateProjectionMatrix on fov change. `perf-reality#6` | unrefuted |
| Shared-material claim true but bundle has dead SSAO/N8AO/ContactShadows imports | partial | `GameScene.jsx:6,8` imported, never in composer `:711-720` | Remove dead imports; add code-splitting. `perf-reality#7` | unrefuted |
| VRAM "completely stabilized" covers only chunk geometry | over-claimed | only 2 `.dispose()` in tree (`Terrain.jsx:199-200`, `SimplifiedNPCSystem.jsx:426`) | Reword to "chunk geometry leak resolved"; audit textures/transient meshes. `gpu-leaks#3` | upheld(medium) |
| Per-loot CanvasTexture leaks on unmount | broken | `SimplifiedNPCSystem.jsx:1200-1268` CanvasTexture in useMemo, no dispose | `useEffect(()=>()=>texture.dispose(),[texture])`. `gpu-leaks#4` | high→medium (slow linear leak) |
| Damage-number texture dispose only on happy-path `elapsed>1` | partial | `SimplifiedNPCSystem.jsx:382,425-426` | Move dispose into useEffect cleanup. `gpu-leaks#5` | unrefuted |
| Low-FPS delta-scaling defeats autostep/snap (tunneling/wall-stick) | partial | `Components.jsx:609` `disp=vel*delta`; autostep/snap tuned for 60fps | Clamp `delta` to `min(delta,1/30)` or sub-step the sweep. `physics-kcc#6` | unrefuted |
| Cover-seek behavior real but only telegraph (aura) is broken | partial | logic `ai.worker.js:175-228`; aura `SimplifiedNPCSystem.jsx:257-263` gated on non-reactive `isCoverSeeking` | Render aura unconditionally, toggle `mesh.visible` in useFrame. `ai-workers#3` | unrefuted |
| 81 raycasts/aggro-mob/frame on main thread (grid build NOT offloaded) | partial | `SimplifiedNPCSystem.jsx:730-737` → `castRay`; only A* search is in worker | Cache/throttle heightGrid (rebuild every 4-8 frames). `ai-workers#6` | unrefuted |
| Ribbon trail broken: duplicate index write + per-frame realloc + mis-gated capture | broken | `Components.jsx:954-962` (writes `[i*6+2]` twice, `[i*6+5]` stays 0), `:1105` isSwinging=melee-mode | Fix `indices[i*6+5]=2*i+2`; preallocate geometry; gate on 0.2s swing window. `combat-magic-boss#3` | upheld(medium) |
| GameMethods race real but defensively no-op'd | partial | `GameMethods.js:4` empty; assigned across init phases; consumers if-guarded | Assign all methods at module scope or queue pre-mount calls; document drops. `architecture-debt#4` | unrefuted |
| God-files NOT decomposed | broken | 10 files >700 LOC: SimplifiedNPCSystem 1532 (15-17 components), AdvancedGameFeatures 1344, QuestSystem 740; 8× duplicate dist math | Split along export seams; extract `dist3` helper. `architecture-debt#8` | upheld(medium) |
| 3-phase boss state machine real but visually unverified | partial | `AdvancedGameFeatures.jsx:121-141,377-517`; lvl-5 gated | None for correctness; add debug spawn to verify. `combat-magic-boss#5` | unrefuted |
| Cover-seek aura dead (non-reactive ECS mutation) | broken→cosmetic | `SimplifiedNPCSystem.jsx:257-263,687` | Toggle `mesh.visible` in useFrame. `ai-workers#2` | medium→low |
| AO imported but never instantiated → flat voxels | broken | `GameScene.jsx:6,8` SSAO/N8AO/ContactShadows; composer only Bloom/Noise/Vignette `:711-720` | Add `<N8AO>` (remove `disableNormalPass`), half-res + device-gate on mobile; remove dead imports. `visual-quality#1` | high→medium |
| Texture array has no colorSpace → pastel/washed | partial | `proceduralTextures.js:132-142` no `.colorSpace`; manual sampler in onBeforeCompile | **Not** `.colorSpace=SRGB` (no-op on custom uniform) — apply `pow(2.2)` decode in injected GLSL `Terrain.jsx:~96`. `visual-quality#2` | high→medium (fix corrected) |
| Three incompatible UI design languages on one screen | broken→cosmetic | `App.css:15-198` minecraft-bevel, `:398-440` glass, `HUD.jsx:349-372` neon; no CSS vars | Pick one (glass), extract shared CSS tokens, kill bevel. `visual-quality#3` | high→medium |
| ARCHITECTURE "AI Structural Law" violated (fns in Zustand) | broken→low | `ARCHITECTURE.md:231` vs `SimplifiedNPCSystem.jsx:907-909` dual-write | Route callers through GameMethods; delete dead store fn-slots (but migrate `castSpell`/`damageBoss`/`getBossPosition` readers first). `architecture-debt#1` | medium→low |
| Deploy config minimal (favicon/audio 404s, no cache headers) | partial | `vercel.json` outputDirectory only; `build/index.html` no icon ref | Add favicon + audio assets to public/; vercel headers `Cache-Control:immutable` on /assets/*. `build-bundle-load#5` | unrefuted |
| No-code-split "loaded upfront" rationale over-claimed | over-claimed | no manualChunks; single 3.84MB; 0 React.lazy | Lazy-load GameScene; vendor chunk (note: app has no router/title-gate — needs UX work). `build-bundle-load#2` | high→medium |
| Bloom luminanceThreshold 0.6 blooms diffuse terrain → flat | partial | `GameScene.jsx:712-719` | After colorSpace fix, raise threshold ~0.85. `visual-quality#7` | unrefuted |

### Low (slop / doc-accuracy — batch later, don't chase individually)

- `render-terrain#2` opaque/water split **works**; both geometries upload all verts twice → use addGroup.
- `render-terrain#4` N8AO-removal **works**; dead SSAO/N8AO imports remain; "soft corner shadows" over-claimed.
- `render-terrain#7` chunk-seam faces always emitted (interior overdraw at 81 seams) — perf tax, invisible.
- `voxel-mesher-texturing#2` "80-90% reduction" → restate "40-99% by flatness".
- `voxel-mesher-texturing#8` place-block string→numeric map lossy (water→sand, glass/ores→stone).
- `perf-reality#1` GPU particles "0ms" false — per-burst ≤120-iter JS loop + 5 buffer uploads.
- `physics-kcc#3` knockback applyImpulse is a monkey-patch (necessary on kinematic body; ignores wake arg).
- `ai-workers#7` / `architecture-debt#3` `movingMobsQuery`/`aggroMobsQuery` dead code; redundant `World` re-import.
- `combat-magic-boss#1` "spell combos" don't exist (only per-spell secondary modifiers).
- `combat-magic-boss#4` embers are solid additive squares, not "soft radial" (gl_PointCoord computed, unused); 1200-cap but per-burst 120.
- `combat-magic-boss#7` "pooled shockwaves" not pooled — fresh React element + geometry per hit.
- `combat-magic-boss#8` boss fireball/lava ref maps accumulate stale keys per fight (bounded).
- `audio#2` "FM synth" is actually subtractive (filter-LFO).
- `audio#3` chord-mode labels wrong: day=quintal (not Lydian), night=minor (not Dorian); only boss=augmented correct.
- `architecture-debt#5` 3 unused UI-state props threaded into GameScene (only showStats used).
- `architecture-debt#7` grass shader binds player+mobs only; pets never bend grass (doc says "pets").
- `visual-quality#4` emoji mascot 🧙‍♂️ + emoji HUD markers — AI-slop tell.
- `visual-quality#6` water/bioluminescence shader correct but no water in any frame — unverifiable.
- `visual-quality#8` characters are flat single-color #fdbcb4 boxes, no maps.
- `build-bundle-load#1` chunkSizeWarningLimit:4000 works (masks the problem).
- `build-bundle-load#3` debugger/console-calls dropped; dead console-reassignment shim survives to prod.
- `voxel-mesher-texturing#8` (place-map) — see above.

### Refuted / false-alarm (do NOT chase)

- **Runtime heap delta (-1.27MB) "proves no leak"** — `gpu-leaks#7`: FALSE inference. The clean delta came from ~8s static idle that never exercised loot/chunk-stream/mob-death paths; neither confirms nor refutes the texture leaks. Reality: **unverifiable**.
- **`combat-magic-boss#6` melee-can't-hit-boss = "broken encounter"** — refuters note default player ships `mana:100 + activeSpell:'fireball'`, so the boss IS killable via the intended magic path. Real defect is a melee/spell **asymmetry** (sword-only or out-of-mana = locked out), severity medium not high.
- **`visual-quality#2` fix "set `.colorSpace=SRGBColorSpace`"** — proven WRONG (no-op on a custom-uniform sampler not bound to a material map slot). Use a manual `pow(2.2)`/sRGBToLinear decode in the injected GLSL instead. The washout symptom is real; only the prescribed fix was a false lead.
- **`build-bundle-load#2/#4` fix "lazy-load behind Start button"** — naive: App.jsx mounts GameScene unconditionally (no title-gate flow exists), and MenuSystem statically imports three/rapier-laden modules, so a clean <300kB menu chunk is not achievable without UX surgery. Realistic win is vendor chunking + a masking loading state.

---

## Design-Against Baseline (inputs to S1-S4)

The redesign must build on these load-bearing truths:

1. **Test-harness credibility is the meta-problem (S1 gate).** `node test_swarm.js` cannot fail on perf, bundle size, asset completeness, or visual regression. Until CI has a gzip-budget assertion (<500kB target), an asset-presence check, and real-device/real-GPU profiling, **no "verified" claim is admissible**. Every S1-S4 success criterion must be machine-checkable by a harness that can actually go red.

2. **The engine core is real — keep it, don't rewrite.** Greedy mesher, DataArrayTexture texturing, Rapier KCC physics (createCharacterController + computeColliderMovement + setNextKinematicTranslation), A* AI worker over real raycast grid, Web Audio occlusion/reverb graph, store-decoupling (transient PositionTracker, useShallow, React.memo'd chunks), and chunk-geometry dispose are all verified-correct foundations. S2+ builds on these, not over them.

3. **Stabilization must-fixes (small, high-leverage):** (a) 35ms synchronous busy-wait hitstop `SimplifiedNPCSystem.jsx:801-802` — freezes the tab, stacks to 175ms+ under AoE; replace with delta-scaled slow-mo. (b) Dead boss music — key mismatch `bossActive` vs `isBossActive`. (c) Texture colorSpace washout (GLSL decode). (d) GameSystemsProvider un-memoized context re-render. (e) Loot/damage CanvasTexture leaks. (f) Ribbon-trail index bug. These are surgical, not architectural.

4. **Architecture realities to design around, not assume away:** 10 god-files >700 LOC (SimplifiedNPCSystem 1532, AdvancedGameFeatures 1344) pack many unrelated concerns each; the 704-LOC/238-key Zustand store is the deeper coupling spine (file-splitting alone won't decouple it). The miniplex ECS is **real and load-bearing** for mobs/loot/XP-orbs (NOT vestigial — that hypothesis is refuted) but governs only that subsystem; player/pets/projectiles/UI live in store+refs. The doc's own "never store fns in Zustand" law is violated by a dual-write. Treat decomposition as debt to pay deliberately, after correctness.

5. **Perf envelope is genuinely unknown — measure before optimizing.** The 4.6 FPS is a SwiftShader artifact and tells us nothing. The static read shows a heavy per-frame GPU stack (2048² shadow map, Bloom mipmapBlur + Noise + Vignette, Sky, `frameloop="always"`, no `frameloop="demand"`, **zero** mobile/quality-tier/AdaptiveDpr branches anywhere) plus 81 chunks × (2 meshes + 1 trimesh collider) and unconditional per-frame weather-instance matrix uploads even in clear weather. The first S-stream perf task is **real-device/real-GPU profiling**, then per-device quality gating — not blind optimization against a fake number.

6. **The touch/mobile gap is the largest unbuilt feature, not a bug to patch.** The game is architecturally desktop-only: Pointer-Lock-gated look/move/attack across ≥4 files (`Components.jsx`, `Terrain.jsx`, `InputManager.jsx`, `MenuSystem.jsx`), keyboard WASD, wheel hotbar, right-click cast. iOS Safari has no Pointer Lock. Hitting the stated iPad/mobile goal requires a full touch-input subsystem: coarse-pointer detection gate, virtual movement joystick, drag-to-look replacing PointerLockControls, on-screen action buttons (attack/spell/jump/dodge/mine/place), multi-touch by pointerId, viewport `touch-action:none` + safe-area insets, and an entry flow that decouples "game started" from lock acquisition. Scope this as a subsystem (S-stream of its own), not a CSS tweak.

7. **Honest visual read (feeds art-direction stream — be specific):**
   - **Premium / keep:** the pre-game menu (framer-motion springs, radial cosmos, twinkling stars, shimmer title, glow-pulse CTA) genuinely clears a premium bar and is real reachable DOM. Day/night lerp is a measurable, real differentiator (91→43→92). The water/bioluminescence shader is correct (just unverified — capture a coastline).
   - **Generic / AI-slop to fix:** in-world look is flat, washed-out, oversaturated salmon/pink columns. Three root causes: (1) AO imported but never instantiated → voxels read as flat slabs (the single biggest art failure — AO in block crevices is *the* cue separating premium voxel from slop); (2) texture array missing colorSpace → double-brightened pastel; (3) no unified design system — skeuomorphic minecraft-bevel + glassmorphic + ad-hoc neon Tailwind coexist on one screen. The hero mascot is a literal OS emoji 🧙‍♂️ and HUD markers are emoji 🐉📦 — zero brand identity. Characters are flat single-color #fdbcb4 boxes. The art-direction stream's highest-leverage moves: instantiate AO, fix colorSpace, pick ONE UI language with shared tokens, replace emoji with a custom icon/sprite set.

8. **Bundle/load is an intentional-but-wrong tradeoff for the stated envelope.** ONE 3.84MB chunk (1.29MB gzip, ~963KB Brotli on Vercel) blocks first paint on cellular; the "zero-stutter" rationale optimizes steady-state frame pacing at the cost of TTI. Parse/compile of 3.84MB on an iPad-Safari main thread is transport-independent. Vendor chunking (three/rapier/postprocessing) + a masking loading state + dynamic-import postprocessing are the realistic wins; a routeless single-canvas app cannot reach <500KB without dropping engine features.

---

## Method & Caveats

- **Static + live.** 12 dimensions each read at source (file:line cited throughout). Live capture via headless Chromium under `--use-angle=swiftshader` (real-GPU path was dead on the headless macOS host — a harness limitation, not a game defect).
- **Read-only.** No `src/` file modified (verified `find -newermt`); capture script left at `frontend/_s0_capture.mjs`, artifacts in `memory/REALITY-AUDIT-2026-05-30-assets/`.
- **Adversarially verified (2-lens).** Each finding ran through a code-trace skeptic + a severity-calibration skeptic; every cited path was re-read against source. Verdicts and severity downgrades reflect that double-check.
- **Refute cap.** 7 high-severity findings were NOT independently refuted due to a 24-finding refute cap. The 2 still flagged High in this doc — `render-terrain#6` (perf unverifiable) and `combat-magic-boss#2` (busy-wait hitstop) — carry an **⚠️ unrefuted** marker; their severity is provisional pending one more verification pass, but both were directly source-confirmed by the dimension finders.
- **Unverifiable-by-design (NOT defects):** real-GPU FPS, draw-call count, in-world combat/boss/spell visuals (proximity/level-gated, couldn't be forced headless), water-shader appearance, and the leak question under movement. These need real-device profiling + a scripted in-session driver before any verdict.
