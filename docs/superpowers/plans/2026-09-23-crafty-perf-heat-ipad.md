# Performance: M3 Max heat and iPad breakage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kevin, on the live site (2026-09-23): on an M3 Max "still very much heating up the laptop and turning the fans
up into overdrive", and on iPad "the visuals are very buggy / broken in general". Make Crafty run cool on a laptop and
render correctly on iPad, without touching the locked look (bold-flat, NEUTRAL tone map, bloom) or `dprCap` (Kevin's).

**Architecture:** Measure first, with instruments that read what the GPU and the main thread actually do (a count of
real WebGL allocations per second of idle play; long tasks; frames per second), on the PRODUCTION build — the dev
server measures ~6.6x slower and cannot stand in. Fix in order of verified cost, one task per root cause, each with a
before/after number from the same instrument.

**Tech Stack:** R3F 9.5, @react-three/postprocessing 3.0.4 / postprocessing 6.39.5, three 0.172, drei 10.7
(PerformanceMonitor), Playwright Chromium and WebKit 26.5 (the iOS Safari engine) against `vite preview`.

**Spec:** this document. Source: Kevin's report above, and a code audit of the render loop (2026-09-23) whose claims
are re-verified in source before each fix.

## Global Constraints

- Locked: bold-flat, NEUTRAL tone map, the bloom chain, `dprCap` (a proposal with numbers goes to KEVIN-REVIEW-BATCH,
  never a change). No new dependency.
- Every fix proves its effect with a number from the same instrument before and after, on the production build.
- Anything launched is killed; a local run that binds a port may leave a tab — say so, never "all clean".

## Verified so far (read in source, 2026-09-23)

- **P1 — post-processing is rebuilt on every GameScene re-render.** `@react-three/postprocessing`'s composer builds its
  EffectPasses in a layout effect that depends on `children` (dist/index.js); `<EffectComposer>` sits inline in
  `GameScene` (not memoised), whose parent re-renders through the GameSystems context on every hunger tick (5 s) and
  mana tick (1 s while regenerating) (`GameSystems.jsx`). Each rebuild removes every pass — `removePass` then deletes
  the composer's depth textures and depth render target — and re-adds new EffectPass objects, which re-create them
  (postprocessing `removePass` / `deleteDepthTexture` / `addPass` / `createDepthTexture`).

## Review Focus

1. A tier change (PerformanceMonitor) must still reach the composer (N8AO, GodRays mount/unmount) after P1's memo.
2. The mood grade / bloom-spike drivers inside the composer must keep driving the live effect instances.
3. A frame cap must not judder on a 120 Hz display (an even divisor) and must not slow the SIMULATION (world clock
   and physics already run on delta).
4. Stopping the render loop behind menus must resume on the very next frame the menu closes, and never while the
   capture harness runs.
5. On iPad the tier governor must not oscillate; each tier change must leave shadows registered.

---

### Task 1: the instrument — what does idle play cost?

**Files:** `frontend/scripts/visual/perf-idle-probe.mjs` (registered in `_serve.mjs`), production build.

- [ ] Boot the prod build (`vite preview`), enter play, stand still 30 s. Record: WebGL allocations per second
  (wrap `texImage2D`/`texStorage2D`/`renderbufferStorage*`/`createFramebuffer` via `evaluateOnNewDocument`),
  program compiles (`linkProgram`), long tasks, frames, and — when exposed — `renderer.info.memory`. Chromium and
  WebKit. The numbers go in the commit message and here.

### Task 2 (P1): post-processing built once

**Files:** `frontend/src/render/PostFX.jsx` (new: the composer, memoised on its real inputs — tier flags, sun mesh,
horizon flag, capture flag), `frontend/src/GameScene.jsx`.

- [ ] Red-first: the Task 1 instrument shows allocations tracking the hunger/mana ticks. A gate that drives it: an
  e2e counting `createFramebuffer`/`texStorage2D` over 12 s of idle play with mana regenerating — before: > 0 per
  tick; after: 0 once warm. Mutation: the memo removed -> red.
- [ ] Also memoise `GameScene` against the unstable `bossSystem` object (or pass stable parts).

### Task 3: render only what is seen

- [ ] The game canvas stops rendering (R3F `frameloop` switched, or `invalidate`-driven) while the title screen (it has
  its own canvas), the pause panel or a full-screen panel covers it, and resumes the next frame after; never under
  capture. Measured with the Task 1 instrument on the title screen: frames/s of the game canvas 0.

### Task 4: frame pacing on high-refresh displays

- [ ] Measure the M3 Max case: rAF at 120 Hz doubles the GPU work of 60. Decide from numbers: a 60 fps default cap
  with a Settings choice (Smooth 120 / Cool 60), or the PerformanceMonitor bounds fixed so 120 Hz can step DOWN when
  hot (today at a refresh rate above 90 the bounds [50, 90] step up forever and never down).

### Task 5 (iPad): shadows re-registered on a tier change; the governor stops oscillating; context loss recovers

- [ ] Verify in three r172's WebGLShadowMap that `shadow.map` is allocated only when null (so a tier change keeps the
  old map size and frustum); on a tier change dispose the map and update the shadow camera. Prove it with a WebKit
  probe: the tier stepped low -> med, shadow edges still under the casters (a frame opened and a region measured).
- [ ] WebKit probe of the prod build at an iPad viewport: open the frames; name what is broken before fixing it.

### Task 6: the hot loops

- [ ] The compass rebuilding `innerHTML` every frame; weather instance matrices uploaded every frame in clear weather;
  per-frame allocations in the player loop — each measured, each fixed only if the instrument moves.

### Task 7: review (`/code-review high` over the milestone).
