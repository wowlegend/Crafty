# SOTA-2026-09 Baseline Tranche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three of the external baseline's top gaps — distant texture shimmer, a hitstop that only freezes the player, and an empty sky — each behind a mutation-proven gate and a same-renderer visual check.

**Architecture:** Every change is a small pure module (tested under node) plus the minimum wiring into the imperative render/game loop (asserted structurally, labelled weak, and SEEN in a capture or probe). No new dependencies. No change to the visual oracle (`tests/visual/baseline/` is Kevin-gated: the 147→151 re-baseline is owed and not ours to take).

**Tech Stack:** three 0.172 (installed), R3F 9.5, vitest, puppeteer probes via `scripts/visual/_serve.mjs`.

**Spec:** `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE.md` §4 items #2, #3 (as corrected 2026-09-22 — the dodge already exists), #5.

## Global Constraints

- ROOT = the repo root (the directory holding `.git`); APP = `frontend/`. npm and vitest from APP; git from ROOT.
- AST-safe edits only (Edit tool / exact-anchor replace). Never a backtick inside a JS template literal (the terrain and sky shaders are template literals).
- Zero emoji in `src/`. No `console.log` left behind.
- Game-loop isolation: no zustand subscription or React state in a `useFrame`; read `useGameStore.getState()` transiently.
- Capture determinism: any time-driven visual reads `frameElapsed()` / `captureElapsed()` from `src/devtest/captureClock.js`, never raw `performance.now()` in a gated frame.
- Every new gate carries a `Mutation-Proof:` block and is mutation-proven with `scripts/dev/mutate.sh` (including one plausible-WRONG mutation). Every new export's call sites are counted in the commit message.
- A shader change is not covered by the unit suite: compile it in a real browser (capture or probe) and OPEN the frames before committing.

## Review Focus

1. **Block-edge seams after mipmapping.** `fract(vUv)` in the terrain sampler makes the UV derivative jump at every block edge, so the GPU picks the smallest mip there → a 1-px dark grid line on every block. Expected: no seams. Task 1 removes `fract()` (the texture already wraps REPEAT) and asserts the sampler reads raw `vUv`.
2. **Multi-hit hitstop reading as lag.** Five quick hits must not freeze the world for 5 × 90 ms. Expected: the freeze from one burst is capped. Task 2's `stackHitstop` test pins the cap.
3. **Hitstop during capture / death / menu.** A freeze must never leave the world stuck: when `hitstopUntil` is in the past the scale is exactly 1. Task 2 tests the boundary (`now === until`).
4. **Cloud time under capture.** Clouds that drift with wall-clock time would break every sky frame's determinism. Expected: the drift reads the capture clock. Task 3 asserts the uniform is fed from `frameElapsed`.
5. **Cloud shadows darkening ambient/interiors.** Shadowing the ALBEDO would darken caves and the shadowed side too. Expected: only the direct (sun) term is attenuated. Task 4 injects after `lights_fragment_end` on `directDiffuse`/`directSpecular` only.

---

### Task 1: Mipmapped block textures, seam-free sampler

**Files:**
- Modify: `frontend/src/world/proceduralTextures.js` (texture tail: `minFilter`, `generateMipmaps`)
- Modify: `frontend/src/world/Terrain.jsx` (fragment: `texture(voxelTextures, vec3(fract(vUv.x), fract(vUv.y), layerIndex))`)
- Create: `frontend/tests/gates/texture-mipmap-gates.test.js`

**Interfaces:**
- Produces: `TERRAIN_MIN_FILTER` (exported const from proceduralTextures.js, `THREE.NearestMipmapLinearFilter`) — read by the gate.

- [ ] **Step 1: Write the failing test** — `texture-mipmap-gates.test.js`:
  - import `createProceduralVoxelTextures` (whatever the module exports — read the file first) and assert on the returned `DataArrayTexture`: `generateMipmaps === true`, `minFilter === THREE.NearestMipmapLinearFilter`, `magFilter === THREE.NearestFilter`, `wrapS/wrapT === RepeatWrapping`.
  - structural (weak, labelled): `strip(Terrain.jsx)` matches `/texture\(voxelTextures, vec3\(vUv\.x, vUv\.y, layerIndex\)\)/` and does NOT match `/fract\(vUv/`.
- [ ] **Step 2: Run to verify it fails** — `cd frontend && npx vitest run tests/gates/texture-mipmap-gates.test.js` → FAIL (`generateMipmaps` false).
- [ ] **Step 3: Implement** — minFilter `NearestMipmapLinearFilter` (crisp within a level, blended between levels — Minecraft's choice), `generateMipmaps = true`, magFilter stays `NearestFilter`; sampler reads raw `vUv` (REPEAT wraps it). Verified 2026-09-22 in the installed r172 `WebGLTextures.js`: `texStorage3D` allocates the mip levels for a DataArrayTexture and `generateMipmap(TEXTURE_2D_ARRAY)` fills them.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Mutation-prove** — M1 `generateMipmaps = false`; M2 `minFilter = NearestFilter`; M3 (plausible-wrong) `magFilter = LinearFilter` (blurs the pixel look up close); M4 `fract(` back in the sampler.
- [ ] **Step 6: SEE it** — capture (`npm run visual:capture`), diff every frame against the previous capture of the same tree minus this change (same renderer); open the densest-diff crops of `explore-day` and `landmark`. Expected: change concentrated in the far band; no grid seams at block edges.
- [ ] **Step 7: Commit** with the diff numbers and call-site counts.

### Task 2: World hitstop (the world freezes with the player), capped

**Files:**
- Create: `frontend/src/game/hitstop.js`
- Modify: `frontend/src/store/useGameStore.jsx` (add `hitstopStart`, action `triggerHitstop(ms)`; route the existing inline `hitstopUntil` write at the damage path through it)
- Modify: `frontend/src/systems/CombatSystem.jsx:52`, `frontend/src/world/bossSystem.js:69,126` (producers → `triggerHitstop`)
- Modify: `frontend/src/render/MobModel.jsx` (lerp `t` scaled), `frontend/src/systems/AIWorkerSystem.jsx` (`tickAccumRef.current += delta * scale`), `frontend/src/Components.jsx:1142` (read `worldTimeScale`)
- Create: `frontend/tests/gates/world-hitstop-gates.test.js`

**Interfaces:**
- Produces (`game/hitstop.js`):
  - `export const HITSTOP_BURST_CAP_MS = 180`
  - `export function worldTimeScale(now, hitstopUntil) -> 0 | 1` — `now < hitstopUntil ? 0 : 1`
  - `export function stackHitstop({ until, start }, now, ms, cap = HITSTOP_BURST_CAP_MS) -> { until, start }` — a hit while frozen extends the freeze but never past `start + cap`; a hit after the freeze ended starts a new burst at `now`.
- Produces (store): `triggerHitstop(ms)` — the ONE writer of `hitstopUntil`/`hitstopStart`.

- [ ] **Step 1: Failing tests** —
  - `worldTimeScale(100, 150) === 0`, `worldTimeScale(150, 150) === 1`, `worldTimeScale(200, 0) === 1`.
  - burst cap: from `{until:0,start:0}`, five hits of 90 ms at now = 0, 40, 80, 120, 160 → untils 90, 130, 170, 180 (capped from 210), 180 (capped from 250). Assert the final `until === 180` and `until - start === 180`; uncapped it would be 250.
  - a hit after the burst ended (now = 500) starts fresh: `{ until: 590, start: 500 }`.
  - store: `triggerHitstop(90)` twice in the same instant leaves `hitstopUntil - hitstopStart <= 180`.
  - structural (weak): no file under `src/` other than `store/useGameStore.jsx` assigns `hitstopUntil:` (grep the tree with `_srcWalk.carriersOf`); MobModel and AIWorkerSystem reference `worldTimeScale(`.
- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement** the pure module, the store action, route the three producers, scale the three consumers. MobModel: `const ws = worldTimeScale(performance.now(), useGameStore.getState().hitstopUntil || 0); const t = Math.min(1, delta * 10 * ws);` (capture branch untouched). AIWorkerSystem: accumulate `delta * ws`.
- [ ] **Step 4: Run → PASS**, plus the full unit suite (other gates grep `hitstopUntil` — update any that pinned the old inline writes, keeping their intent).
- [ ] **Step 5: Mutation-prove** — M1 scale always 1; M2 (plausible-wrong) cap ignored (`until = max(until, now+ms)`); M3 new burst keeps the old `start`; M4 MobModel ignores the scale; M5 a producer writes `hitstopUntil` directly again.
- [ ] **Step 6: Commit.** Name the blind spot: whether a 90 ms world freeze FEELS right is a person-playing question.

### Task 3: Clouds in the sky dome

**Files:**
- Create: `frontend/src/render/cloudField.js` — the ONE definition of the cloud field: constants (`CLOUD_HEIGHT`, `CLOUD_SCALE`, `CLOUD_COVERAGE`, `CLOUD_WIND`) and `cloudGlsl()` returning the GLSL for `float cloudDensity(vec2 p)` (value noise, 2 octaves, `smoothstep` on coverage) and `vec2 cloudPlane(vec3 origin, vec3 dir, float t)` (ray to the cloud plane + wind drift).
- Modify: `frontend/src/render/Atmosphere.jsx` (sky dome: `uTime`, `uCloudTint` uniforms; splice `cloudGlsl()`; composite `mix(col, cloudCol, density * upMask)`; feed `uTime` from `frameElapsed`)
- Create: `frontend/tests/gates/cloud-field-gates.test.js`

**Interfaces:**
- Produces: `cloudGlsl() -> string`, `CLOUD_*` constants, and the uniform names `uTime`, `uCloudTint` (Task 4 reads the same `cloudGlsl()` and constants).

- [ ] **Step 1: Failing tests** — `cloudGlsl()` defines `cloudDensity(` and `cloudPlane(`; constants are finite and `0 < CLOUD_COVERAGE < 1`; the GLSL references the constants by VALUE (string contains `CLOUD_HEIGHT.toFixed(1)`), so a tuned constant cannot drift from the shader; structural (weak): Atmosphere splices `cloudGlsl()` and sets `uTime` from `frameElapsed(`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Clouds only above the horizon (`smoothstep(0.02, 0.2, h)`), tinted by the mood's mid colour (`uCloudTint` set per frame where the dome colours are set), bold-flat: two soft bands (`smoothstep` edges), no raymarching.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Mutation-prove** — M1 drop the splice; M2 `uTime` from `performance.now()` (plausible-wrong: breaks capture determinism); M3 coverage constant not substituted into the GLSL.
- [ ] **Step 6: SEE it** — capture; the sky region of `explore-day`, `landmark`, `biome-snow` must change and the UI-only frames must not (presence control: 0.000% on UI frames). Open the frames.
- [ ] **Step 7: Commit.**

### Task 4: Cloud shadows on the terrain (direct light only)

**Files:**
- Modify: `frontend/src/world/Terrain.jsx` (splice `cloudGlsl()`; uniforms `uTime`, `uSunDir`; after `#include <lights_fragment_end>` multiply `reflectedLight.directDiffuse` and `reflectedLight.directSpecular` by `1.0 - CLOUD_SHADOW_STRENGTH * density`, where density samples `cloudPlane(vWorldPos, uSunDir, uTime)`)
- Modify: `frontend/src/render/cloudField.js` (`CLOUD_SHADOW_STRENGTH = 0.35`)
- Test: extend `frontend/tests/gates/cloud-field-gates.test.js`

- [ ] **Step 1: Failing test** — structural (weak): Terrain's fragment splices `cloudGlsl()` and the injection targets `lights_fragment_end` and `directDiffuse` (NOT `diffuseColor`, which would darken ambient); `CLOUD_SHADOW_STRENGTH` in (0, 0.6].
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**; feed `uTime` from the same `frameElapsed` and `uSunDir` from the sun direction Atmosphere already computes (read it, do not recompute).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Mutation-prove** — M1 injection into `diffuseColor` (plausible-wrong: darkens ambient); M2 strength 0; M3 shadows sampled without the sun offset (they would sit under the camera's view of the cloud, not the sun's).
- [ ] **Step 6: SEE it** — capture; open `explore-day` and `hearth`: patchy large-scale shade on sunlit ground, none inside caves/overhangs beyond what was there.
- [ ] **Step 7: Commit.** Then `/code-review high` over the tranche's range.

### Task 5: The freeze reaches EVERY world consumer, not the ones that opted in (QUEUE R2.6)

Review #2: hitstop froze the mobs, the AI clock and the boss because each was edited to read
`worldTimeScale`; allies, projectiles (the player's and the enemies'), particles, element zones, hurled
blocks, snare tethers, XP orbs and loot kept moving through it. Opt-in per consumer is the defect shape: the
next world system written will not opt in either.

**Files:**
- Create: `frontend/src/game/worldClock.js` — `worldDelta(delta)` (0 through a freeze, the frame's delta
  otherwise; reads the store's `hitstopUntil` against `performance.now()`) and `realDelta(delta)` (identity:
  a consumer that runs on real time ON PURPOSE says so at its own call site — the player controller, which
  applies the freeze to its own motion; the sky's mood lerp; the weather).
- Create: `frontend/tests/gates/world-delta-census-gates.test.js`.
- Modify: every `useFrame` whose callback takes a delta — `EnhancedMagicSystem`, `MobModel`,
  `BlockParticleSystem`, `SquadAISystem`, `ElementZoneSystem`, `HurlSystem`, `SnareTetherSystem`,
  `XPOrbSystem`, `LootSystem`, `EnemyProjectileSystem`, `BossEntity`, `AIWorkerSystem` (world);
  `Components`, `Atmosphere`, `WeatherSystem` (real).

**Interfaces:** Produces `worldDelta(delta: number) -> number`, `realDelta(delta: number) -> number`.

- [ ] **Step 1: Failing census** — for every `useFrame((a, d) => ...)` in `src/`, the callback body (comments
  stripped, balanced from `useFrame(` to its close) names `d` exactly twice: the parameter, and one
  `worldDelta(d)` or `realDelta(d)`. So a raw use of the frame delta anywhere in a world callback is red. Prints
  and asserts the denominator. Plus: `worldDelta` is 0 inside a freeze and the delta outside it, through the
  real store.
- [ ] **Step 2: Run → FAIL** (15 sites, 0 routed).
- [ ] **Step 3: Implement** — route each site; the three `worldTimeScale` readers (MobModel, BossEntity,
  AIWorkerSystem) move to `worldDelta`, so one expression, not four, decides what "frozen" means.
- [ ] **Step 4: Run → PASS**, lint, full unit suite, build; the existing `world-hitstop` e2e still green in CI.
- [ ] **Step 5: Mutation-prove** — a world site reads its raw delta again; a site routed through
  `realDelta` that should freeze is NOT caught (state it — the census proves a decision was made, not that it
  was right; the named world list in this task is the review surface); `worldDelta` inverted; a census that
  skips arrow heads with a destructured first parameter.
- [ ] **Step 6: Commit** with the site count.

**Blind spot, stated up front:** consumers animated by ABSOLUTE time (`state.clock`, `performance.now()` —
the spell and pickup VFX, GPU sparks) are not delta readers, so this census cannot see them; they keep moving
through a freeze. That is R2.7's paused world clock, not this task.

### Task 6: A paused WORLD clock for the worker's timers and the windup telegraph (QUEUE R2.7)

The freeze stops every delta consumer (Task 5), but the AI worker's timers — the windup before a strike, the
brute's brace, charge and recovery — compare the `now` AIWorkerSystem sends, which was `performance.now()`.
The worker is not ticked during a freeze, so those timers kept running on the wall clock: a windup begun just
before your hit could expire inside the freeze and strike the frame it ends, and MobModel's telegraph (read
against the same wall clock) kept ramping while the mob stood frozen.

**Files:** `frontend/src/game/worldClock.js` (`worldNow()`), `frontend/src/systems/AIWorkerSystem.jsx` (sends
it), `frontend/src/render/MobModel.jsx` (reads it), `frontend/tests/gates/world-delta-census-gates.test.js`,
`frontend/src/App.jsx` (DEV hook `worldNow`), `frontend/tests/e2e/world-hitstop.spec.js`.

**Interfaces:** `worldNow() -> number` ms: wall time minus every frozen span, exact to the freeze window
`[hitstopStart, hitstopUntil]` rather than to frame boundaries; `performance.now()` before the first tick.

- [ ] **Step 1: Failing tests** — driven ticks with injected `now` and store freeze windows: no freeze → world =
  wall; a 200 ms freeze → world ends 200 ms behind; a freeze that begins or ends between ticks subtracts only
  the overlap; a stacked (extended) burst subtracts its whole span. Structural: AIWorkerSystem sends
  `worldNow()`, MobModel reads the windup against it, no wall-clock windup read remains.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4: PASS**, lint, unit suite, build.
- [ ] **Step 5: e2e** — the world clock HOLDS through a freeze in the running game and advances after it
  (DEV hook), with a presence control that it advances unfrozen.
- [ ] **Step 6: Mutation-prove** — overlap ignored (the whole tick counted as frozen or as live); the worker sent
  wall time again; MobModel reads wall time again. **Step 7: Commit.**

**Blind spot:** hit-flash and other purely visual main-thread timers stay on the wall clock on purpose (the
flash IS the impact); spell/pickup VFX animated by `state.clock` are not moved by this task.
