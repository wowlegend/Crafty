# Steady tiers, cool by budget — milestone plan (masterpiece Phase 0f + 0g)

> Umbrella: `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 0 rows 0f, 0g). Design inputs: roadmap
> moves 1 and 2 in `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json`, with the refute's F2, F3, F7, F8,
> F10 and F12 applied (`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md`). Lane `steady-cool`, branch
> `feat/steady-cool`, built on `feat/parked-looks-perf` (canvasPace and the FrameCap test hooks).

## Goal

Kevin, on the live site: an M3 Max's fans run flat out; on iPad the visuals are "very buggy / broken". This milestone
makes the game canvas spend fewer pixels, settle on one quality tier instead of oscillating, stop rebuilding and leaking
post-processing effects, recover from a lost WebGL context, stop drawing what nobody can see, and stop changing the
light count (which re-links every lit shader) on every cast and chest.

**Success criteria (each is a gate or an e2e named below):** (a) the canvas dpr is a pure function of a per-tier pixel
budget and is recomputed on resize; (b) the composer's buffers follow the renderer's drawing-buffer size after a pixel
ratio change; (c) a tier step or a horizon flip constructs no new GodRays, N8AO or Bloom effect, and the bloom spike
drives the live effect; (d) after a decline from tier T the governor cannot re-incline to T for 60 s (doubling), a
second decline from T bans T for the session, the governor never samples a paced-down canvas, and runtime steps on a
coarse-pointer device never change the render distance; (e) a lost context shows a panel that autosaves and reloads
into the same world; (f) the HUD's three rAF loops become one ticker that follows the capped canvas and falls back to
rAF under Unlimited; (g) behind a panel the canvas draws at 30 fps, in an unfocused desktop window at 10; (h) the sun's
shadow map re-renders on demand, never above 30 Hz; (i) dynamic point lights come from a fixed per-tier pool.

## What the code does today (read in this worktree, 2026-10-27)

- **dpr.** `frontend/src/GameScene.jsx:234` passes `dpr={[1, q.dprCap]}`; R3F clamps `devicePixelRatio` into that
  range. `frontend/src/render/quality.js:20-32` sets `dprCap` low 1.5, med 2, high 2. An M3 Max window of 1728x1117
  CSS px at dpr 2 is 7.72 Mpx through every full-resolution pass.
- **Composer size.** `@react-three/postprocessing` 3.0.4 (`node_modules/@react-three/postprocessing/dist/index.js`,
  the composer component) calls `composer.setSize(size.width, size.height)` in an effect keyed on `[composer, size]`
  only: a pixel-ratio change with the same CSS size never resizes the composer. postprocessing 6.39.5's `setSize`
  sizes its buffers from `renderer.getDrawingBufferSize` (`node_modules/postprocessing/build/index.js:1345-1364`), so
  calling it is enough.
- **Effects rebuilt and leaked.** `PostFX` (`GameScene.jsx:90-137`) mounts `<N8AO>` only when `q.ao` and `<GodRays>`
  only while `sunAboveHorizon`. The package's GodRays wrapper builds `new GodRaysEffect(camera, sun, props)` in a memo
  keyed on the props OBJECT (so on every render of the element) and renders it as a `primitive` with `dispose: null`;
  R3F never disposes primitives (`node_modules/@react-three/fiber/dist/events-5a94e5eb.esm.js:15174-15181`) and the
  composer's `removePass` disposes nothing (`postprocessing/build/index.js:1252-1278`). So every sunrise, every tier
  step and every PostFX re-render in daylight leaves a GodRaysEffect's three render targets and depth texture
  allocated. N8AO is a `primitive` too (same leak on every low<->med step). `<Bloom>` is a wrapEffect element memoised
  on `JSON.stringify(props)`; `mipmapBlur={q.bloomMipmap}` differs low/med (`quality.js:20-21`), so a low<->med step
  constructs a new BloomEffect, and `BloomSpikeDriver.jsx:23-31` caches the first one it found and keeps driving the
  disposed one. Every PostFX re-render also rebuilds the composer's EffectPasses (its layout effect depends on
  `children`), which deletes and re-creates its depth texture.
- **Governor.** drei 10.7.9 `PerformanceMonitor` (`node_modules/@react-three/drei/core/PerformanceMonitor.js`) decides
  every `ms * iterations` = 2.5 s from frames it counts in `useFrame`. `GameScene.jsx:316-330` steps the tier on every
  decision with no memory. Two defects found while reading: (1) no hysteresis — the oscillation F7 calls a hypothesis
  stays a hypothesis here (no device run on record), but nothing prevents it; (2) **the governor samples a paced-down
  canvas.** On this base branch the title screen paces the canvas to 10 fps (`render/canvasPace.js`), and
  PerformanceMonitor counts rendered frames, so a desktop sitting on the title sees ~10 fps < 40 and declines; with
  this milestone's panel and blur pacing the same would happen behind every panel. `<AdaptiveDpr pixelated />`
  (`GameScene.jsx:332`) only acts on `performance.regress()`, which nothing in `src` calls (`grep -rn "regress" src`
  returns comments only). Runtime steps DO change render distance on every device: `world/Terrain.jsx:807-810` reads
  `TIERS[tier].renderDistance` on each chunk tick, and `GameScene.jsx:208,344` derives the shadow extent and the far
  field from it.
- **Context loss.** `useGameStore.jsx:127-128` holds `isWebGLContextLost`; `GameScene.jsx:263-274` writes it; nothing
  reads it. A lost context leaves a black canvas under a live HUD.
- **HUD loops.** `HUD.jsx:217` (ObjectiveTracker), `HUD.jsx:287` (Compass), `ui/AbilityBar.jsx:29` and
  `ui/TouchControlsSurface.jsx:66` each run their own `requestAnimationFrame` at the display rate (120 Hz on
  ProMotion), outside the 60 cap. ObjectiveTracker and AbilityBar write styles on every tick; the Compass already
  writes only on change (parked work).
- **Pacing.** `canvasPace.js` paces only the title (10 fps). Panels draw a full-screen `bg-ink/75` scrim
  (`ui/GamePanels.jsx:225,445,519,615`) while the world draws at 60 behind it; an unfocused window draws at 60.
- **Shadows.** The sun's directional light (`render/Atmosphere.jsx:325-353`) re-renders its shadow map every frame.
  three r172 skips a light whose `shadow.autoUpdate === false && shadow.needsUpdate === false`
  (`node_modules/three/src/renderers/webgl/WebGLShadowMap.js:110`). `render/shadowReset.js` drops the map on a tier
  change.
- **Point lights that mount and unmount** (`grep -rn pointLight src`): the chest beacon (`world/Terrain.jsx:449`), the
  cast hand (`render/playerRender.jsx:512`), the beast core (`render/BeastAvatar.jsx:164`), the boss body and each boss
  fireball (`render/BossEntity.jsx:565,590`), and — beyond the brief's list, same class — every spell projectile
  (`render/spellVfx.jsx:434`) and every spell impact (`render/spellVfx.jsx:618`). Each mount changes
  `NUM_POINT_LIGHTS` and re-links every lit program. Always-mounted lights stay as they are (`Atmosphere` fill,
  `PhantomBlockSystem`'s intensity-gated light, the Hearth brazier).

## The change, item by item (each its own commit with its own red-first gate)

| # | Change | Gate (red first) | Heat effect and how it is measured |
|---|---|---|---|
| a | `pixelBudgetDpr({tier, devicePixelRatio, cssW, cssH})` in `render/quality.js`: `clamp(min(cap, dpr, sqrt(budgetPx / cssPx)), 1, cap)`; TIERS gain `budgetPx` (high 4.2 Mpx, med 2.8, low 1.8) and new caps (1.75 / 1.5 / 1.25). GameScene recomputes it on `resize`. Capture keeps the legacy `clamp(dpr, 1, 2)` so the oracle does not move (the mobile frame is shot at deviceScaleFactor 2). | `tests/gates/pixel-budget-gates.test.js` drives the function over real screens (M3 Max window, iPad Pro 11, 1080p, 5K) | M3 Max window at high: 7.72 -> 4.20 Mpx (dpr 1.475), 46% fewer pixels in every full-resolution pass; iPad Pro 11 at low: 3.99 -> 1.56 Mpx (dpr 1.25). Measure: powermetrics GPU power A/B (Kevin, Phase 0d script) and gpu-cost-probe timer queries on the prod build. |
| b | `ComposerPixelRatioSync` (child of `<EffectComposer>`) compares `composer.inputBuffer` with `gl.getDrawingBufferSize()` each frame and calls `composer.setSize()` when they differ. Lives with PostFX helpers in `render/postFx.js`. | `tests/gates/composer-dpr-sync.test.js` (fake composer + renderer; the CSS size held constant while the ratio changes — the upstream defect's exact shape) | Correctness (no stale, larger buffers after a dpr step down; the N8AO ghosting symptom); without it (a)'s savings do not land after a tier step. Cost: one size comparison per frame. |
| c | `render/postFx.jsx` gives `N8AO`, `GodRays` and `Bloom` components (the package's names, so GameScene's declaration and its source gates keep their literals) that build their effect once per mount, render it as `primitive dispose={null}`, and dispose it on unmount. GameScene mounts N8AO and GodRays on first need (sticky) and keeps them; `PostTierDriver` finds the live instances each frame and toggles them in place (`n8ao.enabled`; a gated GodRays subclass whose `update()` is skipped and whose blend opacity is 0, so no recompile; Bloom's `mipmapBlurPass.enabled` plus its map uniform). PostFX no longer takes `q` or `sunAboveHorizon`, so a tier step or horizon flip re-renders no composer child. BloomSpikeDriver resolves the live Bloom every frame instead of latching the first. | `tests/gates/post-fx-once-gates.test.jsx` drives the real postprocessing classes: construction counts across tier/horizon sequences, the GodRays update skipped while gated, Bloom's map following mipmap, dispose on unmount | Removes per tier step: N8AO and GodRays construction (render targets + shader compiles), a Bloom rebuild, the composer pass rebuild and its depth-texture reallocation; removes per sunrise/sunset the same rebuild and a leaked GodRays target set (GPU memory growth on a long iPad session). Measure: e2e construction counts and `renderer.info.memory.textures` across 20 tier steps and 4 horizon flips. |
| d | `render/tierGovernor.js`: after a decline from T, re-inclining to T is blocked for 60 s; after the second decline (any tier) the governor settles and never inclines again this session (it may still decline). AS BUILT: the brief's "doubling per repeat" is unreachable under a settle at 2 (only one block is ever set first), so it is not shipped as dead code; a per-tier ban was tried first and its gate went red (a probe pair after each block — 2 changes in a minute). PerformanceMonitor mounts only while the canvas runs at its play pace (never while paced down). `renderDistanceFor(tier, {coarsePointer})` pins the render distance to the boot tier on coarse pointers. AdaptiveDpr deleted. | `tests/gates/tier-governor-gates.test.js` (pure, fake clock) | Up to ~12 remounts a minute removed if the oscillation is real (F7: unmeasured); the title no longer drives a decline. Measure: the governor e2e's tier changes per minute; Diagnostics tier timeline (0d). |
| e | `ui/ContextLossPanel.jsx` reads `isWebGLContextLost`; "Graphics were reset by the system — tap to resume" (en + zh-CN); tap = autosave, write a session-scoped resume id, reload; at boot the id is consumed and that world is loaded (the player still presses Start, a gesture the browser needs anyway). Pure helpers in `game/contextRecovery.js`. | `tests/gates/context-loss-gates.test.jsx` renders the panel from store state and drives the recovery with injected save/storage/reload | None (recovery). |
| f | `ui/hudTicker.js`: one ticker. FrameCap (game canvas only) claims it while it paces and ticks it after each rendered frame; otherwise it runs its own rAF (Unlimited, capture, perf probe — F10). ObjectiveTracker, Compass, AbilityBar, TouchControlsSurface subscribe; style writes become write-on-change. | `tests/gates/hud-ticker-gates.test.jsx` (fake rAF; real AbilityBar render) | 120 Hz panel at the 60 cap: 3 loops x 120 -> 1 loop at 60 (lower when paced); zero style writes standing still. Measure: a rAF-wrapping probe (callbacks per second per source), Chrome trace Layout events per second. |
| g | `paceFor` gains `panelCovering` (30 fps, never above the cap) and `unfocused` (10 fps, desktop only); MenuSystem publishes `panelCovering`; GameScene tracks focus. Harness first, unchanged. | extend `tests/gates/canvas-pace-gates.test.js` | Panel open: 60 -> 30 fps (half the GPU while reading the inventory); unfocused desktop: 60 -> 10. Measure: the pacing e2e's frames per tick. |
| h | `render/shadowSchedule.js` decides when the sun's shadow re-renders: immediately on a config reset or a chunk mesh change (block edits must show within two frames); otherwise only when the sun turned >= 0.5 deg, the snapped centre moved, or a dynamic caster is present, and never above 30 Hz. Atmosphere sets `shadow.autoUpdate = false`; `resetShadowForConfig` sets `needsUpdate`. | `tests/gates/shadow-schedule-gates.test.js` (pure; the sun-rate figure computed from the real `sunArcDirection`) | Shadow pass 60 -> at most 30 renders/s in play; with no dynamic caster and a still camera, the sun's 0.5 deg steps alone: 723 per 300 s cycle (2.4 Hz mean, 3.2 Hz peak; measured with the real arc, F2 — not the 1.6-1.9 deg/s the refute estimated: 0.64-1.59 deg/s). Honest: the player's own hands and the loaded square's mobs and villagers are almost always present, so in play the 30 Hz cap is the saving (half the shadow renders at 60 fps); the static path pays off only when nothing moves. Measure: the DEV shadow-render counter. |
| i | `render/lightPool.jsx`: `PointLightPool` mounts a fixed number of pointLights per tier (low 2, med 4, high 6) and assigns them each frame to the requesters nearest the camera; `PooledLight` replaces each mounting light (chest beacon, cast hand, beast core, boss body and fireballs, spell projectile, spell impact) with a registered anchor. | `tests/gates/light-pool-gates.test.js` (pure assignment over a registry) | No program re-link per cast, chest spawn or open (a hitch). Per-fragment light count: today ~3 fixed + 1 per chest (5 chests -> 8) + 3 per cast in flight; after: 3 fixed + pool (5 / 7 / 9) constant. Measure: e2e `renderer.info.programs` constant across 20 casts and chest spawns. |

## TDD steps (per item)

1. Write the gate, run it with `npx vitest run <file>`, see it fail for the stated reason (missing export, wrong value).
2. Implement; run the gate green; run the neighbouring gates the change touches.
3. Mutation receipts with `scripts/dev/mutate.sh`: one deletion-class mutant, at least one plausible-wrong mutant, one
   identity mutant (a comment edit) that must survive. A surviving real mutant means the gate has a hole: fix the gate.
4. Write the e2e spec (not run in this lane: the command session owns port 4179 and the browser) with its intended
   mutants listed as NOT YET RUN.
5. Commit with a `Mutation-Proof:` trailer; the pre-commit hook runs the offline pipeline.

## Verification gates

- Per item: the unit/behavioural gate above, its mutation receipts, the neighbouring existing gates
  (`canvas-pace-gates`, `frame-cap-gates`, `capture-dpr-gates`, `spell-vfx-gates`, `tests/scripts/effect-chain-cost`).
- Every commit: the pre-commit offline pipeline (lint, gate-shape, killability-ledger, unit suite, build, bundle budget,
  doc-currency).

## Lived proof (e2e specs written here, run by the command session)

| Spec | Proves |
|---|---|
| `tests/e2e/composer-dpr.spec.js` | after a forced tier step, `composer.inputBuffer.width === gl.domElement.width`, and the dpr equals the budget function |
| `tests/e2e/post-fx-once.spec.js` | GodRays/N8AO/Bloom construction counts and `renderer.info.memory.textures` constant across 20 tier steps and 4 horizon flips after a warm-up |
| `tests/e2e/light-pool.spec.js` | `renderer.info.programs` constant across 20 casts and chest spawns after a warm-up |
| `tests/e2e/hud-ticker.spec.js` | the compass and objective tracker update under Unlimited (F10) and under the cap |
| `tests/e2e/canvas-pace-panels.spec.js` | the pace reads 30 with a panel open, 60 closed, 10 on blur, never paced under capture |
| `tests/e2e/tier-governor.spec.js` | under a synthetic slow-frame injection and an oscillating governor signal, tier changes per minute after warm-up stay <= 1 |
| `tests/e2e/context-loss.spec.js` | `WEBGL_lose_context.loseContext()` shows the panel; `restoreContext()` hides it and frames draw again |

F7 applies: these read DEV hooks. A production read path is the Diagnostics readout (Phase 0d), not this lane.

## Heat budget (summary)

No item adds GPU work except (i)'s pool at high (one more always-present light than today's 5-chest steady state, in
exchange for a constant count) and (c)'s night-time GodRays targets staying allocated (they leaked before). The large
levers are (a) pixels, (g) pacing and (h) shadow cadence. The power baseline for any before/after is the post-0a deploy
(F12), not `57c45ae4`.

## Risks

- **Sharpness (a)** at dpr ~1.48 on Retina, ~1.07 on a 5K display: Kevin's eye on the side-by-side crops (the
  lookbook, Phase 0d) decides; the caps and budgets are constants.
- **Sticky hysteresis (d)** can leave a capable machine on a lower tier for the session after two transient dips.
- **Shadow staleness (h)**: a moving caster's shadow updates at 30 Hz at a 60 fps frame rate; a long shadow steps by
  up to 0.5 deg between sun steps.
- **Pool starvation (i)**: with 2 lights at low, a third light source nearby goes dark (its emissive mesh still glows).
- **Focus (g)**: a page that never receives `focus` after load would sit at 10 fps; the pace reads `document.hasFocus()`
  at mount and on every focus/blur event, and only on fine pointers.
- **Resume (e)** loads the world that was being played; a session that never saved (no slot) mints one in the autosave.
