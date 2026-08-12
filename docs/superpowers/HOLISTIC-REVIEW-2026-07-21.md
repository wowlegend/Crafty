# Holistic Repo Review — Findings & Work Queue (2026-07-21)

> Generated from 3 adversarially-verified review workflows (source · tests/scripts/config · docs).
> **CONFIRMED = reproduced against live source.** `[AUTO]` = safe mechanical fix, autonomous. `[KEVIN]` = needs owner taste/decision or higher-risk judgement. Every fix still lands RED-first + mutation-proven + gated per the FIVE RULES.

**Confirmed: 215**  ·  Plausible (secondary pass): 79  ·  Docs: 132 classified (+ archive/merge plan).

## Confirmed by kind (priority ladder = execution order)

| # | kind | count | AUTO | KEVIN |
|---|------|-------|------|-------|
| 1 | security | 2 | 1 | 1 |
| 2 | bug | 18 | 6 | 12 |
| 3 | test-bug | 13 | 9 | 4 |
| 4 | hygiene | 25 | 25 | 0 |
| 5 | config-drift | 3 | 2 | 1 |
| 6 | dead-code | 38 | 25 | 13 |
| 7 | comment-lie | 34 | 28 | 6 |
| 8 | doc-drift | 21 | 17 | 4 |
| 9 | test-vacuity | 32 | 3 | 29 |
| 10 | coverage-gap | 8 | 5 | 3 |
| 11 | perf | 2 | 1 | 1 |
| 12 | a11y | 1 | 0 | 1 |
| 13 | inconsistency | 11 | 6 | 5 |
| 14 | enhancement | 7 | 4 | 3 |

### security (2)

- ▣✓ 32625c0 **`frontend/package.json:10`** [medium·KEVIN·test] @dimforge/rapier3d-compat is a phantom (undeclared) dependency — imported directly by an integration test + a bench script but present only transitively via @react-three/rapier; knip's ignore masks it rather than declaring it.
  - _fix:_ Add `@dimforge/rapier3d-compat` to package.json dependencies pinned to the version @react-three/rapier@2.2 resolves (currently 0.19.2, verified via `npm ls`), then drop the .knip.json ignoreDependencies entry so future drift is caught rather than masked.
- ▣✓ 3660284 **`.github/workflows/ci.yml:16`** [low·AUTO·test] Workflow declares no top-level `permissions:` block, so GITHUB_TOKEN inherits the repo/org default (potentially read-write) — an OpenSSF-flagged least-privilege gap.
  - _fix:_ Add a top-level `permissions:\n  contents: read`. The e2e job's actions/upload-artifact@v4 uses the Actions runtime token (not GITHUB_TOKEN), so read-only contents is sufficient for the whole workflow.

### bug (18)

- ▣✓ e8e218e **`frontend/src/ui/TradingInterface.jsx:141`** [high·AUTO·src] Resources panel + wand-payoff badge read the dead `magic` bucket instead of the canonical `blocks` bucket, so Crystals/Wands always show 0 and the wand mana reduction always shows -0%.
  - _fix:_ Import `getWands` (alongside the already-imported `getCrystals`) from ../game/crystalWallet and use `getCrystals(gameState.inventory)` (line 141), `getWands(gameState.inventory)` (line 145), and `wandManaMultiplier(getWands(gameState.inventory))` (line 148). Drop the now-dead `magic` local.
- ▣✓ aa121de **`frontend/src/workers/ai.worker.js:302`** [high·KEVIN·src] Step-3 A* steering unconditionally re-targets the PLAYER, silently overriding the skeleton's retreat/kite target computed just above, so archers never actually retreat when a height grid is present.
  - _fix:_ Make Step 3 path toward the already-computed tactical (targetX, targetZ) instead of always the player: convert targetX/targetZ to grid coords (relTargetX = round(targetX - startXGrid), clamped 0..8) and pass those as the A* goal. Chasers are unaffected (their targetX/Z already equal playerX/Z); retreat/kite is preserved. Alternatively skip Step 3 for the skeleton retreat sub-case.
- ▣✓ 8472036 **`frontend/src/render/BossEntity.jsx:466`** [medium·KEVIN·src] Damage hit-flash is driven by a ref (flashTime.current) consumed declaratively at render time, but nothing re-renders when the ref is set/decays, so the 180ms red flash is decoupled from its timer and frequently never renders.
  - _fix:_ Drive the flash imperatively in useFrame by writing material.color/material.emissive on the mesh refs while flashTime.current > 0 (transient-read pattern already used for wings/position), OR force a re-render (e.g. a lightweight flash-tick state) so the declarative color actually reflects the timer. Do not leave it purely ref-derived.
- ▣✓ 3ed0f8e **`frontend/src/render/MobModel.jsx:191`** [medium·KEVIN·src] Hit-flash traverse overwrites every feature-box and villager-nose material color with the single body baseColor each non-hit frame, defeating the mobFeatures `tone` (bone/dark) shading and the tan nose.
  - _fix:_ Preserve each mesh's intended base color instead of forcing the one body color: have MobToonMaterial's onUpdate cache self.userData.baseColor = self.color.clone(), then in the non-hit branch restore child.material.userData.baseColor ?? baseColor. Changes visual baselines (bone ribs/horns and the tan nose will show their intended tone) -> requires a deliberate re-baseline.
- ▣✓ 97b8fe7 **`frontend/src/render/WeatherSystem.jsx:219`** [medium·AUTO·src] Rain instancing loop never resets the shared _weatherDummy rotation, so rain streaks inherit the last snow particle's non-identity rotation and render tilted/tumbled instead of vertical after any snow has been seen.
  - _fix:_ In the rain `if (isRaining)` branch, add `dummy.rotation.set(0, 0, 0);` before `dummy.updateMatrix()` (mirroring how the snow loop explicitly sets its rotation each frame).
- ⊘ DISMISSED — the premise is false: navigator.deviceMemory is NOT clamped to 8 in the browser this project ships against. Measured 32 (cores 14) in Chrome for Testing via a playwright probe, so the >= 12 high tier is reachable — `npx playwright test --reporter=list -g 'device memory'  # ad-hoc probe: page.evaluate(() => navigator.deviceMemory) returned 32` **`frontend/src/render/quality.js:33`** [medium·KEVIN·src] selectTier's 'high' tier is unreachable from real device signals because it gates on deviceMemory >= 12, but navigator.deviceMemory is spec-clamped to a max of 8.
  - _fix:_ Lower the high-tier threshold to the real API ceiling, e.g. `if (deviceMemory >= 8 && cores >= 8) return 'high';`, or delete the dead branch if a never-init-at-high policy is intended. Owner should confirm intent.
- ▣✓ 13184e6 **`frontend/src/systems/SpawnerSystem.jsx:172`** [medium·AUTO·src] The spawn while-loop's `attempts++` sits INSIDE the `dist >= 28 && dist <= 85` guard, so out-of-range picks are free retries and maxAttempts=12 fails to bound total iterations.
  - _fix:_ Increment `attempts` once per iteration (move `attempts++` to the top of the while body, before the dist check) so maxAttempts bounds TOTAL picks as intended; keep `spawnedThisTick++` gated on a successful in-range spawn.
- ▢ **`frontend/src/ui/GamePanels.jsx:133`** [medium·KEVIN·src] GearInspector stat comparison is one-sided: it only renders the INSPECTED item's own stat keys, so any stat you would LOSE by swapping (a key the equipped item has but the inspected item lacks) is silently omitted from the diff.
  - _fix:_ Union the stat keys of the inspected item and the equipped item (activeStats) before rendering rows, so a stat present only on the equipped item still renders with its negative diff (val 0, diff = -activeVal).
- ▣✓ f3e87db **`frontend/src/workers/ai.worker.js:202`** [medium·KEVIN·src] Cover-seeking passes an UNCLAMPED player-relative cell to hasLineOfSight, causing out-of-bounds height-grid reads that make LOS always report 'clear' when the player is >4 cells away, so cover is almost never found at range.
  - _fix:_ Clamp relPlayerX/relPlayerZ to [0,8] before the cover scan (mirroring line 302-303), or bail out of cover-seeking when the player cell is off the 9x9 grid, and/or bounds-guard hasLineOfSight so out-of-range endpoints don't read undefined.
- ▣✓ d676069 **`frontend/src/world/mesher.js:247-251`** (was cited as `terrain.worker.js:912`, before `71c24ca` extracted the mesher) [medium·KEVIN·src] UV tiling was transposed on X- and Z-axis faces: the fixed uvs.push order matches the +Y/-Y corner ordering but not the corner order emitted for d===0 (X) and d===2 (Z), so non-square greedy quads on walls get rotated / wrong-density tiling.
  - _fix:_ Emit the UV quad in the same corner order the branch actually generates, or compute UVs from each corner's (u,v) world offset (like the AO block already does via C[u]/C[v]) instead of a fixed array; verify against the terrain shader's sampling + re-run the visual gate.
- ▢ **`frontend/index.html:20`** [low·KEVIN·test] og:image and twitter:image point to /favicon.svg — an SVG (not rendered by social scrapers) at a root-relative URL; social share previews will be blank.
  - _fix:_ Add a raster social card (public/og-image.png at 1200x630) referenced by absolute URL: `<meta property="og:image" content="https://<deployed-domain>/og-image.png" />` (+ og:image:width/height), point twitter:image at the same, and consider summary_large_image.
- ▣✓ 7f9ee5f **`frontend/scripts/ci/doc-currency.mjs:139`** [low·KEVIN·test] The STATUS.md staleness signal keys on filesystem mtime (L139), which a fresh CI checkout resets to ~now, so the 'not touched in N days' warning can never fire in the CI env where the lint runs.
  - _fix:_ Derive age from git history, e.g. `git log -1 --format=%ct -- memory/STATUS.md`, so the signal is meaningful on a fresh checkout.
- ▣✓ c41d693 **`frontend/src/EnhancedMagicSystem.jsx:43`** [low·KEVIN·src] applyBurnEffect's setInterval is never tracked or cleared on unmount — a burn active when the magic system unmounts keeps ticking damage into the global GameMethods.
  - _fix:_ Track active intervals in a ref (Set), clear them all in a useEffect cleanup on unmount; add id on creation, remove on self-clear.
- ▣✓ 869f71e **`frontend/src/OptimizedGrassSystem.jsx:96`** [low·KEVIN·src] Per-chunk ambient grass particles are positioned with no chunk world-offset, so every chunk's 8 particles cluster near world origin instead of over the chunk.
  - _fix:_ Add the chunk's world origin to the particle x/z (derive world offset from chunkX/chunkZ × CHUNK_SIZE, matching how blades use world-space grassTops), or move the particle instancedMesh under a group positioned at the chunk origin.
- ▣✓ 06f3822 **`frontend/src/SoundManager.jsx:111`** [low·AUTO·src] stopSynthPad's deferred disconnect reads pad.filter / pad.lfoGain through the same ref object it nulls synchronously, so those two nodes are never actually disconnected (and a fast restart disconnects the NEW pad's nodes).
  - _fix:_ Capture the two nodes before the setTimeout, mirroring the sibling captures: `const filterToDisconnect = pad.filter; const lfoGainToDisconnect = pad.lfoGain;` and call disconnect on those locals inside the timeout.
- ▣✓ d09b56d **`frontend/src/game/cameraKick.js:34`** [low·KEVIN·src] The 'right' axis vector is computed as the negation of the cross product its own comment claims (worldUp x flatForward, not flatForward x worldUp) — a latent left/right sign flip, currently dormant because every KICK_PROFILE has a zero right component.
  - _fix:_ Flip to `const rx = -fz, rz = fx;` to match the comment's flatForward x worldUp (= true screen-right lookDir x up), or correct the comment; add a test with a nonzero right component (all current tests use lx=0).
- ▣✓ c71b57e **`frontend/src/game/questClaim.js:55`** [low·AUTO·src] The active-feed filter dereferences q.id without a null guard, inconsistent with the null-guarded find() four lines above, so a null/undefined quest entry crashes the claim.
  - _fix:_ Add the same guard: const active = quests.filter((q) => q && q.id !== questId && !q.claimed);
- ▣✓ a2ae62f **`frontend/src/game/worldSaves.js:53`** [low·AUTO·src] writeWorld ignores the index-write result and returns true even when the index save silently failed, orphaning the blob.
  - _fix:_ Make saveIndex return the safeSet boolean and have writeWorld return it (e.g. `return saveIndex(list);`), so a quota failure on the index write is reported to the caller instead of masquerading as success.

### test-bug (13)

- ▣✓ 52ec590 **`frontend/src/game/gameFeel.test.js:32`** [medium·AUTO·test] The 'uses ACCEL when reversing direction' test asserts a bound so loose it cannot distinguish ACCEL from DECEL — the exact behavior the test name claims to lock.
  - _fix:_ Pin the value: `expect(v).toBeCloseTo(-1, 6);` (ACCEL(60) => -1; DECEL(90) would be -4). This makes the accel-vs-decel branch actually mutation-proof.
- ▣✓ c4a4958 **`frontend/tests/gates/spell-shape-gates.test.js:7`** [medium·KEVIN·test] The 'bolt is jagged/forked, not a plain cylinder' assertion uses /fork|jagged|seg/i, which matches the ubiquitous 'segment' substring and passes for ANY bolt geometry.
  - _fix:_ Drop the loose `seg` token (and note fork/jagged also leak from comments + the impact `fork` case); prefer asserting on the ENERGY_PROFILE shape flag / prebuilt geometry seam (as the same file already does for FIRE_TEARDROP/ICE_SHARDS) rather than a whole-file substring.
- ▣✓ 3f16071 **`frontend/src/audio/stormBed.test.js:37`** [low·KEVIN·test] The 'builds a bed...' test ends in the tautology expect(true).toBe(true) with a comment claiming 'the gain ramps were scheduled', but nothing verifies any ramp/param call — the test only proves start/setIntensity/stop don't throw.
  - _fix:_ Have fakeCtx.node() push each created node into a shared array (or capture the gain nodes returned by build), then after bed.start(); bed.setIntensity(1); bed.stop() assert that a gain node's linearRampToValueAtTime mock was called with 0.05 and 0.07 (intensity 1) and 0 (stop), plus src.start/stop fired. Replace the expect(true).toBe(true) tautology with those assertions.
- ▣✓ 3f16071 **`frontend/src/game/settingsPersist.test.js:53`** [low·AUTO·test] The `__proto__: {}` term in the 'drops unknown keys' input is a no-op — an object literal's bare __proto__ sets the prototype, not an own key, so it exercises no pollution defense.
  - _fix:_ Route a genuine own `__proto__` key through the load path where JSON.parse (which uses CreateDataProperty, unlike an object literal) DOES create an own `__proto__` property: loadSettings(fakeStorage({ [SETTINGS_KEY]: '{"__proto__":{"sfxVolume":9},"sfxVolume":0.5}' })) and assert the result is { sfxVolume: 0.5 } with Object.prototype unpolluted. Or simply drop the misleading term.
- ▣✓ 97065b4 **`frontend/src/input/verbRouter.test.js:51`** [low·AUTO·test] Test 11 ('out-of-reach terrain behaves as nothing') exercises the same inputs/branch as Test 10 — `{ ...base }` shallow-copies base's identical primitive values — adding no coverage while claiming a distinct §5-11 case.
  - _fix:_ Replace Test 11 with a genuinely distinct case the ladder doesn't already cover — e.g. terrain in-reach but a mob nearer/tied at button 2 with a FINITE terrainDist — or delete Test 11 as a redundant duplicate of Test 10.
- ▣✓ 1b75400 **`frontend/tests/gates/boss-melee-spark-gates.test.js:19`** [low·AUTO·test] The assertion region is delimited by a source COMMENT ('Boss-cone branch'); between() returns '' if the anchor is missing, so rewording/removing that comment breaks the gate with zero behavior change.
  - _fix:_ Re-anchor the region on stable code tokens (e.g. the boss-hit conditional or the sparkFor/triggerGPUSparks call site itself) instead of the comment, or extract the boss-spark decision into a pure helper and test it behaviorally.
- ▣✓ bee3300 **`frontend/tests/gates/dynamic-light-gates.test.js:22`** [low·AUTO·test] The shadow-casting-pointLight regex `/<pointLight[^>]*castShadow/s` matches the attribute NAME regardless of value, so it would flag the defensively-correct `<pointLight castShadow={false}>` and it misses imperative `light.castShadow = true` and spread-prop forms.
  - _fix:_ Tighten to only catch a truthy value, e.g. `/<pointLight[^>]*castShadow(?!\s*=\s*\{?\s*false)/s`, and add a secondary check for imperative `.castShadow = true` on PointLight instances if any exist.
- ▣✓ 31e7b57 **`frontend/tests/gates/friend-foe-gates.test.jsx:55`** [low·AUTO·test] This jsdom suite renders <CombatSystem> in beforeEach but never unmounts it — no cleanup import, no afterEach — so mounted React trees/effects accumulate across all six tests; RTL auto-cleanup is inactive because vitest.config.js sets no globals/setupFiles.
  - _fix:_ Import cleanup from '@testing-library/react' and add afterEach(() => cleanup()), mirroring the three sibling jsx gates, so each CombatSystem tree unmounts between tests.
- ▣✓ c4a4958 **`frontend/tests/gates/hands-render-gates.test.js:8`** [low·KEVIN·test] The 'white-gold accent is present' assertion uses an alternation so broad (`/#FFF|#F8E|gold|FFD700|E8D9|accent/i`) that the case-insensitive `accent`/`#FFF`/`gold` terms match incidental tokens (including comment words), so the gate can pass without any actual gold accent color.
  - _fix:_ Drop this to the puppeteer visual gate (authoritative for hand appearance) or narrow the regex to the exact accent token the design uses (e.g. `#E8D9A8`/`#FFD700`) rather than an /i alternation containing the generic words 'gold'/'accent'.
- ▣✓ 52ec590 **`frontend/tests/gates/save-slot-ownership-gates.test.js:179`** [low·AUTO·test] B2c derives its trigger list by indexing .match(...)[1]; a source reformat makes .match return null and the test throws an opaque TypeError instead of a meaningful failure.
  - _fix:_ Guard each match: const m = schema.match(...); expect(m, 'progression block not found — saveSchema shape changed').not.toBeNull(); before indexing, and loosen `\n\s{4}\}` to `\n\s*\}`. Same for the App subscribe match.
- ▢ **`frontend/tests/store/beastForm.test.js:111`** [low·AUTO·test] The 'form state is TRANSIENT — never serialized' assertions hold regardless of whether a beast form is active, so they prove the schema omits two key names, not that active transient state is dropped.
  - _fix:_ Assert the precondition before serializing: after `enterBeastForm('arcane')` add `expect(useGameStore.getState().isBeastFormActive()).toBe(true);` then build the save and keep the not.toContain checks — failing if the form never became active or if the key ever leaks into the schema.
- ▣✓ 3bddf29 **`frontend/tests/store/bossActive.test.js:10`** [low·AUTO·test] The 'defaults to a boolean false (never undefined)' test is masked by its own beforeEach that pre-sets the value, so the default-value guarantee is never actually exercised.
  - _fix:_ Add one default-probe test per flag that reads the pristine initializer without running the setter first, e.g. `expect(useGameStore.getInitialState().bossActive).toBe(false)` (zustand v5.0.11 exposes getInitialState()). Keep the existing beforeEach-guarded tests for the setter behavior.
- ▣✓ 3bddf29 **`frontend/tests/store/qualityTier.test.js:8`** [low·KEVIN·test] The 'defaults to a valid tier key' test never exercises the store's init default — beforeEach forces qualityTier='low' before the assertion reads it, so the default is masked.
  - _fix:_ Read the store's initial qualityTier without a preceding setQualityTier override (or assert the module default literal) and assert it is a key of TIERS, in a test that does not run the 'low' beforeEach. Optionally add a behavioral test that setQualityTier rejects/ignores an invalid key if validation is intended.

### hygiene (25)

- ▣✓ 399aeea **`frontend/scripts/visual/look-e2e.mjs:11`** [high·AUTO·test] test:look gate spawns vite non-detached, SIGKILLs only npx (orphans vite), and closes the browser only on the happy path (l37) — a throw before l37 leaks Chromium.
  - _fix:_ Adopt ocean-probe.mjs: `spawn(..., { detached: true })`, hoist `let browser = null` above the try, close it in a finally, and `process.kill(-server.pid,'SIGKILL')` (fallback server.kill('SIGKILL')) there.
- ▣✓ 75da3a2 **`frontend/scripts/perf/run-scenarios.mjs:68`** [medium·AUTO·test] Headless Chrome is closed only on the happy path (L68); the finally (L83-85) kills only the vite server, never the browser, so a scenario throw skips browser.close().
  - _fix:_ Declare `let browser` before the try and add `if (browser) { try { await browser.close(); } catch {} }` in the finally so any throw still closes Chromium.
- ▣✓ c1516bc **`frontend/scripts/visual/dayphase-probe.mjs:14`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on happy/early-return paths, not the top-level catch.
  - _fix:_ Port ocean-probe: detached spawn, `let browser = null` above the try, browser.close() + `process.kill(-server.pid,'SIGKILL')` in a finally.
- ▣✓ b0d6846 **`frontend/scripts/visual/death-probe.mjs:14`** [medium·AUTO·test] Non-detached vite spawn reaped with a bare server.kill() (SIGTERM) — orphans the npx-forked vite child; browser IS correctly in a finally.
  - _fix:_ Add `detached: true`; replace `server.kill()` with `process.kill(-server.pid,'SIGKILL')` (fallback server.kill('SIGKILL')); move the launch inside the try with `let browser = null`.
- ▣✓ 1b8b32d **`frontend/scripts/visual/drive-elemancer.mjs:18`** [medium·AUTO·test] Non-detached vite spawn + bare server.kill() orphans the vite child; browser launched before the try so a launch failure leaks the server.
  - _fix:_ detached spawn + `process.kill(-server.pid,'SIGKILL')` in the finally; hoist `let browser = null` and launch inside the try.
- ▣✓ 1b8b32d **`frontend/scripts/visual/drive-mobs.mjs:18`** [medium·AUTO·test] Non-detached vite spawn + bare server.kill() orphans the vite child; browser launched before the try.
  - _fix:_ detached spawn + `process.kill(-server.pid,'SIGKILL')` in the finally; move launch inside the try with `let browser = null`.
- ▣✓ 052c284 **`frontend/scripts/visual/esc-pause-probe.mjs:13`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on explicit fail/success branches, not the top-level catch.
  - _fix:_ Adopt ocean-probe: detached spawn, `let browser = null` above the try, a single finally that closes the browser and does `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ b0d6846 **`frontend/scripts/visual/grass-probe.mjs:14`** [medium·AUTO·test] Non-detached vite spawn + bare server.kill() orphans the vite child (browser IS in a finally).
  - _fix:_ detached spawn + `process.kill(-server.pid,'SIGKILL')` in the finally; hoist `let browser = null` and launch inside the try.
- ▣✓ b3ea100 **`frontend/scripts/visual/hands-probe.mjs:10`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch.
  - _fix:_ detached spawn; `let browser = null` above the try + finally-close; `process.kill(-server.pid,'SIGKILL')` in that finally.
- ▣✓ c1516bc **`frontend/scripts/visual/heldf-probe.mjs:16`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on happy/fail branches, not the top-level catch.
  - _fix:_ detached spawn + finally-close (`let browser = null`) + `process.kill(-server.pid,'SIGKILL')`, per ocean-probe.mjs.
- ▣✓ 5fac04c **`frontend/scripts/visual/hub-probe.mjs:12`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 052c284 **`frontend/scripts/visual/hud-probe.mjs:13`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only at the happy-path end, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 19e4119 **`frontend/scripts/visual/magic-panel-probe.mjs:13`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on happy/fail branches, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 5fac04c **`frontend/scripts/visual/mobdeath-probe.mjs:27`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ b0d6846 **`frontend/scripts/visual/pov-probe.mjs:11`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ f48546e **`frontend/scripts/visual/quest-log-probe.mjs:12`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child, and the probe NEVER closes the browser (no browser.close on any path — even success).
  - _fix:_ detached spawn + `let browser = null` + a finally that always `await browser.close()` and `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 1b8b32d **`frontend/scripts/visual/settings-probe.mjs:14`** [medium·AUTO·test] Non-detached vite spawn + bare server.kill() orphans the vite child (browser IS in a finally).
  - _fix:_ detached spawn + `process.kill(-server.pid,'SIGKILL')` in the finally; hoist `let browser = null` and launch inside the try.
- ▣✓ 75da3a2 **`frontend/scripts/visual/soulbind-eyes-probe.mjs:15`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on happy/fail branches, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ f48546e **`frontend/scripts/visual/spawn-legibility-probe.mjs:13`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch. Uses port 4197 — the ad-hoc port CLAUDE.md names as the worst husk-minter. *(the orphan-vite defect is fixed via `_serve.mjs`; its fixed port 4197 is a SEPARATE open item, see the port cluster — not closed here.)*
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ f48546e **`frontend/scripts/visual/spell-elements-probe.mjs:26`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on the happy path, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ b3ea100 **`frontend/scripts/visual/storm-probe.mjs:13`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; the probe NEVER closes the browser on any path (success or catch).
  - _fix:_ detached spawn + `let browser = null` + a finally that always closes the browser and does `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 052c284 **`frontend/scripts/visual/touch-probe.mjs:16`** [medium·AUTO·test] Non-detached vite + server.kill('SIGKILL') orphans the vite child; browser closed only on happy/early-return paths, not the top-level catch.
  - _fix:_ detached spawn + `let browser = null` + finally-close + `process.kill(-server.pid,'SIGKILL')`.
- ▣✓ 0dee956 **`frontend/src/input/blurReset.test.js:50`** [low·AUTO·test] The test redefines the global document.visibilityState ('visible' then 'hidden') with no afterEach to restore it — a leaked jsdom global mutation left pinned to 'hidden'.
  - _fix:_ Capture the original descriptor once and add afterEach(() => Object.defineProperty(document,'visibilityState',original)), or scope the redefinition and delete the override in an afterEach.
- ▣✓ 0dee956 **`frontend/tests/gates/night-ratchet-gates.test.jsx:61`** [low·AUTO·test] jsdom renderHook test omits afterEach(cleanup); with vitest globals disabled, mounted hooks leak across the file's tests.
  - _fix:_ Import afterEach from vitest + cleanup from @testing-library/react and add `afterEach(cleanup);` (matching the 6 sibling .jsx gate tests), and call unmount() in the two tests that omit it.
- ▣✓ 0dee956 **`frontend/tests/gates/spell-mastery-load-gates.test.jsx:28`** [low·AUTO·test] renderHook is called 7 times with no afterEach(cleanup) while this repo's vitest config registers NO auto-cleanup, leaking store-subscribed hook mounts across tests.
  - _fix:_ import { cleanup } from '@testing-library/react' and add afterEach(cleanup), matching the sibling touch-xp-readout.test.jsx.

### config-drift (3)

- ▢ **`frontend/vite.config.js:11`** [medium·AUTO·test] esbuild.drop:['console','debugger'] strips console during `vite dev`, not just the production build, silencing app diagnostics in the dev server the E2E drives.
  - _fix:_ Gate the drop to production: `defineConfig(({ mode }) => ({ ..., esbuild: { drop: mode === 'production' ? ['console','debugger'] : [] } }))` — keeps console+debugger live in dev/E2E, still strips them from the shipped bundle.
- ▣✓ bee3300 **`frontend/package.json:4`** [low·AUTO·test] No engines.node field and no .nvmrc/.node-version, while CI hard-pins node 24 — the required local runtime is undeclared, inviting silent dev/CI drift.
  - _fix:_ Add `"engines": { "node": ">=24" }` to package.json and a `.nvmrc` containing `24` so local dev matches CI and `npm install` warns on mismatch.
- ▣✓ 32625c0 **`frontend/scripts/bench/bull-physics-bench.mjs:5`** [low·KEVIN·test] L5 imports '@dimforge/rapier3d-compat', which is NOT declared in frontend/package.json — it resolves only via npm hoisting of @react-three/rapier's transitive dep.
  - _fix:_ Add @dimforge/rapier3d-compat as an explicit devDependency pinned to the version @react-three/rapier resolves, or import rapier through the same entry the app uses.

### dead-code (38)

- ▣✓ 634dcc1 **`frontend/src/QuestSystem.jsx:121`** [medium·KEVIN·src] `lootDrops` state is never populated (setLootDrops is never called) yet it is exported from the hook return.
  - _fix:_ Remove `lootDrops`/`setLootDrops` state and drop `lootDrops` from the return object. Confirm no dynamic `.lootDrops` access first.
- ▣✓ 7c07b56 **`frontend/src/ui/touchTray.js:10`** [medium·KEVIN·src] The `icon` field in TRAY_PANELS is never rendered — the touch tray glyphs come from a separate id-keyed map in TouchControlsSurface, so the field is vestigial/duplicated data.
  - _fix:_ Either (a) drive TouchControlsSurface's glyphs from `p.icon` to dedupe the two mappings, or (b) delete the `icon` field from TRAY_PANELS and the vacuous test assertion. Owner should pick the single source of truth.
- ▣✓ c4a4958 **`frontend/src/utils/combat.js:32`** [medium·KEVIN·src] The `color` field returned by solveSpellDamage (line 32) and solveMeleeDamage (line 12) is never consumed by any production caller, and the hex values are stale legacy colors that contradict the canonical MAGIC palette.
  - _fix:_ Either drop the `color` field from both solvers (and the 4 color assertions in combat.test.js), or, if damage-number tinting was the intent, wire `color` into DamageNumber and source it from the MAGIC palette instead of the legacy hexes. Owner call on remove-vs-wire.
- ▣✓ 93bf3d3 **`frontend/src/Components.jsx:48`** [low·AUTO·src] A large block of vestigial imports survives from the monolith era; none of these identifiers are referenced anywhere in the file (which now exports only Player).
  - _fix:_ Delete the unused import specifiers: useMemo/useLayoutEffect, the framer-motion motion import, all nine lucide-react icons, useSimpleExperience, EnhancedMagicSystem/MagicWand, and Panel/Slot.
- ▣✓ 93bf3d3 **`frontend/src/Components.jsx:1334`** [low·AUTO·src] The file ends with an orphaned section-header comment for weapon meshes that no longer live here — the Player component closed at line 1332 and nothing follows the header.
  - _fix:_ Delete the dangling comment on line 1334.
- ⊘ DISMISSED — the comment block is not orphaned — glowColor has three live code hits in this same file (:67 arcColor fallback, :109 telegraph payload, :147 impact payload) — `grep -n glowColor frontend/src/EnhancedMagicSystem.jsx` **`frontend/src/EnhancedMagicSystem.jsx:493`** [low·AUTO·src] The entire trailing comment block (493-509) documents the extracted EnhancedSpellProjectile component — coreColor/capturePhase/glowColor now live in render/spellVfx.jsx, not this file.
  - _fix:_ Delete the block or relocate it above the EnhancedSpellProjectile definition in render/spellVfx.jsx.
- ▣✓ a72bffd **`frontend/src/EnhancedMagicSystem.jsx:1`** [low·AUTO·src] `useMemo` is imported but never used anywhere in the file.
  - _fix:_ Remove `useMemo` from the import destructure.
- ▣✓ a72bffd **`frontend/src/GameScene.jsx:28`** [low·AUTO·src] The imported `isCaptureMode` function is shadowed by a local const on line 89 and is never called anywhere in the file.
  - _fix:_ Remove the unused `isCaptureMode` import from './devtest/captureMode' (the reactive store selector on line 89 is the intended source).
- ▣✓ 9387c7d **`frontend/src/HUD.jsx:523`** [low·AUTO·src] `setIsPointerLocked` prop is destructured but never called (only named in an explanatory comment).
  - _fix:_ Remove `setIsPointerLocked` from the destructure (the caller can still pass it as an ignored prop). The KEVIN-FIX C3 comment at 664 stays valid and continues to document the deliberate non-write.
- ▣✓ a72bffd **`frontend/src/QuestSystem.jsx:122`** [low·AUTO·src] `achievements` local state (and `setAchievements`) is dead — the hook returns the module-level `ACHIEVEMENTS` constant instead.
  - _fix:_ Delete `const [achievements, setAchievements] = useState([]);`; the return already uses the `ACHIEVEMENTS` constant.
- ▣✓ a72bffd **`frontend/src/QuestSystem.jsx:126`** [low·AUTO·src] `lootId` ref is declared but never used anywhere.
  - _fix:_ Remove the unused `const lootId = useRef(0);` declaration.
- ▣✓ a72bffd **`frontend/src/QuestSystem.jsx:9`** [low·AUTO·src] `Slot` is imported from ui/primitives but never used in this file.
  - _fix:_ Drop `Slot` from the import list.
- ▢ **`frontend/src/QuestSystem.jsx:260`** [low·AUTO·src] Unreachable `if (!nextQuest) return null;` guard — `nextQuest` can never be falsy.
  - _fix:_ Remove the `if (!nextQuest) return null;` line.
- ▣✓ ca504eb **`frontend/src/SoundManager.jsx:490`** [low·AUTO·src] Large block of orphaned SFX comments (490-521) describes voice-generation functions that no longer live here; the header 'NEW: Attack sound generation functions' is a lie — there are zero functions between these comments.
  - _fix:_ Delete the vestigial comment blocks (or replace with a single pointer comment: 'voice definitions live in audio/synthVoices.js'). Same for the orphaned `// Enhanced magic system sounds` at 516.
- ▣✓ 97065b4 **`frontend/src/SoundManager.jsx:185`** [low·KEVIN·src] synthPadRef's `gains` array is written but never read — the per-voice gain nodes are pushed and later reset, but never used for cleanup or modulation.
  - _fix:_ Either drop the `gains` array entirely (the vGain nodes stay alive via their in-graph connections during playback), or actually disconnect `pad.gains` in stopSynthPad if explicit teardown of those nodes is intended.
- ▣✓ ca504eb **`frontend/src/SoundManager.jsx:16`** [low·AUTO·src] Orphaned standalone comment 'Ambient chord progressions for mood adjustments' sits with no associated code — the chord progressions it refers to are imported at line 6.
  - _fix:_ Delete the orphaned comment.
- ▣✓ 31e7b57 **`frontend/src/audio/aspectMotifs.js:41`** [low·AUTO·src] makeArp and the four make*Motif functions are exported but nothing outside this module imports them — only the MOTIFS object is consumed (synthVoices.js:656), and there is no aspectMotifs.test.js exercising them.
  - _fix:_ Drop the `export` keyword from makeArp and the four make*Motif helpers (they are still referenced internally via the MOTIFS map), or add a unit test that justifies the public surface.
- ▣✓ 52ec590 **`frontend/src/audio/musicTheory.js:26`** [low·AUTO·src] The `hostileCount >= 1` branch in arpeggiatorBpm returns 110, identical to the default return 110, making it a vestigial branch that never alters behavior.
  - _fix:_ Delete line 26; the default `return 110;` already covers hostileCount 0-2. (Keep it only if you intend the tiers to diverge later — then add a comment.)
- ▣✓ 634dcc1 **`frontend/src/devtest/PerfProbeSystem.jsx:26`** [low·AUTO·src] The `active` gate and both return branches are vestigial dead code — both paths return null and the useFrame is unconditional.
  - _fix:_ Delete lines 26-28 and drop the now-unused `isPerfProbe`, `perfScenarioId`, and `SCENARIOS` imports (leaving `consumeHurl` from perfProbe and the THREE/hurlChannel imports). Non-E scenarios are already inert because `consumeHurl()` only returns true when the runner scheduled a hurl.
- ▣✓ 55df4c8 **`frontend/src/devtest/perfProbe.js:10`** [low·KEVIN·src] `_phase` is write-only state — `setProbePhase` is called but the phase value is never read anywhere.
  - _fix:_ Either remove `_phase` + `setProbePhase` + its three call sites, or (if phase inspection is intended for the harness) expose it via a `getProbePhase()` export and/or publish it on `window.__craftyPerfPhase` so run-scenarios.mjs/e2e can poll it. Pick one; today it is a no-op.
- ▣✓ 55df4c8 **`frontend/src/game/questLore.js:5`** [low·KEVIN·src] CHAIN_ORDER is exported but has no runtime consumer — only a test imports it, and that test merely asserts on the literal's own contents.
  - _fix:_ Either wire CHAIN_ORDER into the quest-offer sequencing (QuestSystem pickNext), or remove the export + its vacuous test if the chain concept was dropped.
- ▢ **`frontend/src/input/verbRouter.js:28`** [low·KEVIN·src] The final `return 'attack'` (button 0) and its mirror `return 'cast'` (button 2, line 35) are unreachable given the ctx contract, and the 'whiff' comment misplaces where the whiff is actually routed.
  - _fix:_ Either keep as an intentional defensive default and correct the comment (the whiff is handled at line 26/33, not here), or drop the unreachable trailing return. Prefer keeping the defensive default but fixing the misleading 'whiff' attribution.
- ▣✓ a72bffd **`frontend/src/render/LightMotes.jsx:22`** [low·AUTO·src] `sampleMood` is imported but never used — the component computes its mote tint via its own `moteAppearance`, not `sampleMood`.
  - _fix:_ Drop `sampleMood` from the import: import { moodRef } from './mood.js';
- ▣✓ 1b75400 **`frontend/src/render/spellVfx.jsx:249`** [low·AUTO·src] case 'crystal' is unreachable — no ENERGY_PROFILE entry uses shape:'crystal' (iceball moved to 'shards' at S3.5); the branch is self-described legacy pre-S3.5.
  - _fix:_ Remove the 'crystal' case (the 'sphere'/default arm already covers any unknown shape via shapeMat). If keeping as defensive, note it is currently unreachable.
- ▣✓ ca504eb **`frontend/src/store/useGameStore.jsx:480`** [low·KEVIN·src] addTalentPoint store action has zero callers; talent points are granted inline in grantXP's level-up loop.
  - _fix:_ Remove addTalentPoint, or if kept as public API add the same `Math.max(0, Math.floor(Number(amount) || 0))` guard the sibling point-granters use.
- ▢ **`frontend/src/store/useGameStore.jsx:285`** [low·KEVIN·src] addAttributePoints store action has zero callers; attribute points are granted inline in grantXP's level-up loop.
  - _fix:_ Remove addAttributePoints, or document it as intentional public API if a future feature (e.g. a quest reward) is planned to use it.
- ▣✓ 52ec590 **`frontend/src/systems/EnemyProjectileSystem.jsx:1`** [low·AUTO·src] `React` is imported but never referenced; the project uses the automatic JSX runtime (@vitejs/plugin-react default), so the import is vestigial.
  - _fix:_ Drop the default `React` from the import: `import { useRef, useState, useEffect } from 'react';`.
- ▣✓ cd16e76 **`frontend/src/theme/tokens.js:94`** [low·KEVIN·src] UI.color.gray neutral ramp (g950..g50) is never read anywhere — not emitted as a CSS var, not in Tailwind, not imported by any module.
  - _fix:_ Delete UI.color.gray, or if deliberately reserved, keep the '(kept)' note but surface it through the SoT chain (CSS var + Tailwind).
- ▢ **`frontend/src/theme/tokens.js:100`** [low·KEVIN·src] UI.border.hairline (1.5) is defined and its comment promises a 'gold hairline accent', but it is never surfaced or consumed anywhere.
  - _fix:_ Either remove `hairline` (and its comment clause) as unused, or surface it: add --ui-border-hairline to SCALAR_VARS and borderWidth.hairline to TW_SCALES + tailwind.config.cjs so the promised accent is usable.
- ▣✓ 1b75400 **`frontend/src/ui/GamePanels.jsx:44`** [low·AUTO·src] Orphaned comment block describing `ItemIcon` remains in this file even though ItemIcon was extracted to ui/panels/itemUi.jsx (imported at line 13). The comment floats detached above the PaperDollSlot comment and documents code that no longer lives here.
  - _fix:_ Delete the orphaned lines 44-47 (the accurate doc already lives above the export in itemUi.jsx).
- ▣✓ 9387c7d **`frontend/src/ui/GamePanels.jsx:52`** [low·AUTO·src] PaperDollSlot destructures a `slotName` prop that is never referenced in its body; it is passed at all five call sites but does nothing (unequip is bound at the call site via onUnequip).
  - _fix:_ Drop `slotName` from the destructure and from the five call sites, or actually use it inside onUnequip instead of hardcoding the slot at each call site.
- ▣✓ 9387c7d **`frontend/src/world/Blocks.js:22`** [low·AUTO·src] BLOCK_TYPE_KEYS is computed but never exported or referenced anywhere.
  - _fix:_ Remove the unused `BLOCK_TYPE_KEYS` declaration (or export it if a consumer is intended).
- ▣✓ b5be02f **`frontend/src/world/Terrain.jsx:641`** [low·AUTO·src] getMobGroundLevel does `hit.toi !== undefined ? hit.toi : hit.timeOfImpact`, but this file's own #72 fixes establish hit.toi is always undefined in this Rapier build.
  - _fix:_ Simplify to `return 255 - hit.timeOfImpact;`.
- ▢ **`frontend/src/world/mesher.js:220`** [low·AUTO·src] The `if (blockType === 9)` water-AO branch in the corner loop is unreachable: water (code 9) is never written into the mesh mask, so blockType is never 9 at this point. ⟵ **CITE CORRECTED 2026-08-08** (filed as `terrain.worker.js:891`; that file is 692 lines and the greedy mesher moved to `mesher.js` at `71c24ca`). Defect intact at the new home; stale comment clause at `mesher.js:208`.
  - _fix:_ Remove the `blockType === 9` guard (and the 'Water faces carry AO 3' clause in the comment), or add an assert documenting that water never reaches the mask.
- ▢ **`frontend/src/world/terrain.worker.js:260`** [low·KEVIN·src] The cx+-1 neighbor loop in stampStructures never writes cross-chunk: a dungeon footprint (halfW=6, centered at chunk*16+8) always fits inside its own chunk, so only dcx==cx,dcz==cz can stamp.
  - _fix:_ Either drop the neighbor loop (stamp self-chunk only) for clarity/perf, or add a comment that it's defensive for future dungeons wider than one chunk (halfW>7).
- ▣✓ 9387c7d **`frontend/src/world/terrain.worker.js:704`** [low·AUTO·src] generateMesh redeclares local CHUNK_SIZE=16 and CHUNK_HEIGHT=256 that are never referenced in its body (getBlock and the axis sweep use literal 16/256), shadowing the identical module-level consts.
  - _fix:_ Delete the two local consts (module-level ones suffice), or actually use them in getBlock/the sweep to replace the 16/256 magic numbers.
- ▣✓ ca504eb **`frontend/tests/world/heightAt.test.js:25`** [low·AUTO·test] Test declares helper `mk` then abandons it in favor of `baseAt`, leaving an unused declaration.
  - _fix:_ Delete the unused `mk` declaration; `baseAt` is the only helper the test body uses.
- ▣✓ 31e7b57 **`frontend/src/world/spellUpgrades.js:48`** [low·KEVIN·src] `statsFor` and `levelOf` are exported but never imported anywhere — they are used only internally within spellUpgrades.js. ⟵ **CITE CORRECTED 2026-08-08** (filed as `:51`, now JSDoc for `requiredLevelForUpgrade`). Live: `levelOf` at :48, `statsFor` at :62.
  - _fix:_ Drop the `export` on `levelOf`/`statsFor` (keep them module-local), or add a test that pins them if they are meant as public pure API.

### comment-lie (34)

- ▣✓ 5740c9e **`frontend/tests/gates/spawn-legibility-gates.test.js:20`** [high·KEVIN·test] Test named 'the far beacon is capture-suppressed' only asserts the FarBeacon component exists, never that it is capture-guarded.
  - _fix:_ Slice the FarBeacon body and assert it includes 'isCaptureMode()' before the beam mesh (mirror shrine-marker-gates.test.js), or extract the capture-suppress decision so a behavioral test can mount FarBeacon under isCaptureMode()=true and assert null render.
- ▣✓ d2684fd **`frontend/src/App.jsx:361`** [medium·AUTO·src] The 'Boss-render fixture … Shadow Dragon' comment block is stranded directly above the spawnBeastTransform hook, not the boss hook it describes.
  - _fix:_ Move the boss-fixture comment block (lines 361-364) down to immediately above registerTestHook('spawnBossCloseup', …) (line 387); leave only the WILDHEART comment (365-367) above spawnBeastTransform.
- ▣✓ d2684fd **`frontend/src/App.jsx:422`** [medium·AUTO·src] spawnSpellCast claims the closeup zombie 'CANNOT be cleared from a hook (same constraint boss-closeup documents)', but boss-closeup documents the OPPOSITE and clears mobs via ecs.remove.
  - _fix:_ Rewrite the spawnSpellCast comment (422-425) to drop the false 'CANNOT be cleared' claim; either add the same ecs.remove mob-clear the sibling fixtures use, or state 'staged far on +X so any stray mob falls off-frame'.
- ▣✓ 52ec590 **`frontend/src/EnhancedMagicSystem.jsx:497`** [medium·AUTO·src] The trailing design comment cites two mutually-contradictory bloom thresholds (0.85 and 1.0), both wrong — the real composer luminanceThreshold is 0.65.
  - _fix:_ Reconcile both mentions to the actual value: '§3 bloom pass (luminanceThreshold 0.65)'.
- ▣✓ 4ae60bc **`frontend/src/data/items.js:6`** [medium·AUTO·src] items.js header claims T3 (removing duplicate getItemRarity/getItemEmoji) is still pending, but T3 is already done and getItemEmoji no longer exists.
  - _fix:_ Update the header to state T3 is complete (both files re-export getItemRarity from this registry) and drop the reference to the non-existent getItemEmoji.
- ▣✓ ca504eb **`frontend/src/data/lootTables.js:8`** [medium·AUTO·src] Header claims the loot-coverage gate enforces 'every item string is a valid registry item', but that gate only iterates LOOT_TABLES — CHEST_LOOT membership is unchecked.
  - _fix:_ Extend loot-coverage-gates.test.js to also iterate CHEST_LOOT rows through the same `NAME_TO_ID[row.item]` assertion, or narrow the comment to say the gate covers only per-mob LOOT_TABLES.
- ▣✓ 4ae60bc **`frontend/src/game/mobHitFx.js:11`** [medium·AUTO·src] deathBurst JSDoc describes the OLD reversed behavior (mob-body color, 50..110 clamp, unknown->white/50, hue-preserving tint floor) — every claim contradicts the actual code.
  - _fix:_ Rewrite the JSDoc block (lines 9-18) to match the code: fixed warm-gold '#FFB84D' for all mobs, count clamped 14..28 (= 8 + xp), no per-mob color / no tint-floor / no hue preservation. The correct description already exists in the inline comment lines 22-26; fold it into the JSDoc and delete the stale W2-T5 hue paragraph.
- ▣✓ 5740c9e **`frontend/src/world/BlockParticleSystem.jsx:84`** [medium·AUTO·src] Comment claims per-frame scale-matrix shrink of dying particles, but the loop only ages and teleports them.
  - _fix:_ Delete or rewrite line 84 to describe the actual behavior: particles live at full scale for 2s, then are teleported far below the world.
- ▣✓ b5be02f **`frontend/src/world/Terrain.jsx:347`** [medium·AUTO·src] Comment says the Hearth plinth top is 'HEARTH_Y=32', but the imported HEARTH_Y is 51.
  - _fix:_ Change 'top at HEARTH_Y=32' to 'top at HEARTH_Y=51'.
- ▣✓ 5740c9e **`frontend/src/world/accrualHooks.js:23`** [medium·AUTO·src] The 'Kinetic twin — grab charge' header comment sits above useSoulAccrual, not the Kinetic hook.
  - _fix:_ Move the 'Kinetic twin / grab charge / S2-B2-M4' comment down to sit above useKineticAccrual (line 32), and give useSoulAccrual a correct Soul-describing header (S2-B3, soul accrual).
- ▣✓ 4f05f77 **`frontend/src/world/terrain.worker.js:656`** [medium·AUTO·src] Comment says toLinear is 'for BufferGeometry vertex colors', but it feeds BLOCK_COLORS which is used only for break-debris particle color; the mesh vertex-color attribute carries the raw block-type index, not these RGB colors.
  - _fix:_ Reword to e.g. `// Convert sRGB hex -> linear RGB for the break-debris particle color (BLOCK_COLORS, consumed in block_broken)`.
- ▣✓ 5740c9e **`frontend/scripts/ci/bundle-budget.mjs:18`** [low·AUTO·test] The MUTATION-PROOF comment (L18) says adding a `three` import to an entry module blows the `index` budget, but manualChunks buckets by module id, so the pulled three modules land in — and blow — the `three` chunk.
  - _fix:_ Reword L18 to 'the `three` chunk blows its budget → RED', or pick a mutation that genuinely lands in index (a large non-vendor module in the entry).
- ▣✓ 5740c9e **`frontend/scripts/perf/run-scenarios.mjs:1`** [low·AUTO·test] L1 header says the harness drives a HEADED Chrome, but L43 launches `headless:'new'` and the L36-41 comment explicitly explains the headless choice.
  - _fix:_ Change the L1 comment from 'HEADED Chrome' to 'HEADLESS Chrome' to match L43 and the L36-41 rationale.
- ▣✓ 5740c9e **`frontend/scripts/visual/drive-mobs.mjs:34`** [low·AUTO·test] Success log prints 'CAPTURED zones-card-1' but this probe captures the mob showcase card (mobs-card-1) — copy-paste leftover from drive-elemancer.mjs.
  - _fix:_ Change l34 to `console.log('CAPTURED mobs-card-1');`.
- ▣✓ d2684fd **`frontend/src/App.jsx:688`** [low·AUTO·src] The 'SINGLE canonical panel set (panelState.js)' comment sits above the ResizeObserver-error effect, which it does not describe.
  - _fix:_ Move the panelState.js comment (688-689) to above the ESC/isAnyPanelOpen effect (line 203); give the ResizeObserver effect its own accurate one-line comment.
- ▣✓ 93bf3d3 **`frontend/src/Components.jsx:366`** [low·AUTO·src] The comment claims KeyT is a 'double-bound legacy tame' key to be avoided, but no tame binding exists anywhere and KeyT is single-bound to melee attack right below.
  - _fix:_ Update the parenthetical to reflect reality (KeyT = melee attack) or drop the stale tame rationale.
- ▣✓ 4f05f77 **`frontend/src/audio/synthVoices.test.js:32`** [low·AUTO·src] The characterization test's title claims 'VOICES holds EXACTLY the 38 registered names', but VOICES (and the ALL_NAMES fixture it asserts against) actually contain 36 names — 32 explicit entries in synthVoices.js (lines 661-692) plus 4 MOTIFS. The assertion still passes (both sides are 36); only the human-readable count '38' is wrong.
  - _fix:_ Change '38' to '36' in the test title (or derive the count dynamically from ALL_NAMES.length).
- ▣✓ 4f05f77 **`frontend/src/audio/synthVoices.test.js:32`** [low·AUTO·test] Test title says VOICES holds 'EXACTLY the 38 registered names', but the registry and the ALL_NAMES array it asserts against both hold 36.
  - _fix:_ Change '38' to '36' in the it() description, or make it dynamic (`EXACTLY the ${ALL_NAMES.length} registered names`) so the count self-updates when voices are added.
- ▣✓ 4ae60bc **`frontend/src/devtest/captureMode.js:53`** [low·AUTO·src] Comment labels the string hash 'xmur3', but the mixing loop uses MurmurHash2's constant, not xmur3's.
  - _fix:_ Relabel to what it is, e.g. `// murmur-style string hash (murmur2 mix + murmur3 fmix finalize) -> 32-bit seed`. Determinism is unaffected; only the name is wrong.
- ▣✓ 4ae60bc **`frontend/src/game/dayNight.js:95`** [low·AUTO·src] Comment claims maxMobs caps at 16+24=40, but the later S7 zone-tier term (SIEGE_MOBS_TIER_CAP=8) raises the true cap to 48.
  - _fix:_ Scope the claim to the night term (e.g. 'the night ramp adds up to +24') or update the total to note the additive zone-tier term pushes the true cap to 16+24+8=48.
- ▣✓ 4f05f77 **`frontend/src/game/dayPhase.js:28`** [low·AUTO·src] cycleFraction doc labels the phase origin as midnight, but the module's authoritative clock (isDayAtUnit) makes cf=0 = sunrise/dawn — the exact pre-B5 model the code was fixed away from.
  - _fix:_ Fix the stale label to match isDayAtUnit / the B5-corrected dial: `cycleFraction 0=dawn(sunrise), 0.25=noon, 0.5=dusk(sunset), 0.75=midnight`.
- ▣✓ 4ae60bc **`frontend/src/game/hybrids.js:6`** [low·AUTO·src] JSDoc says the hybrid is born 'at their midpoint' but the Y coordinate uses Math.max, not the midpoint.
  - _fix:_ Clarify: 'at their XZ midpoint (Y = the higher of the two, so the hybrid never spawns sunk into terrain).'
- ▣✓ 4f05f77 **`frontend/src/render/spellGeometry.js:33`** [low·AUTO·src] Comment says the teardrop bulb 'peaks ~1/4 up' but the radius function actually peaks at ~44% up the profile.
  - _fix:_ Change '~1/4 up' to '~2/5 up' (or '~0.43 up the profile').
- ▣✓ 4ae60bc **`frontend/src/render/spellVfx.jsx:62`** [low·AUTO·src] Header says EMS imports 'the 3' renderers, but EMS imports 4 (ChainArc was added later) and the renderer list omits chain-lightning.
  - _fix:_ Update to 'EMS imports the 4 it renders directly' and add ChainArc (chain-lightning arc) to the renderer inventory in the header comment.
- ▣✓ 4ae60bc **`frontend/src/render/spellVfx.jsx:394`** [low·AUTO·src] Comment states the bloom threshold is 1.0, but the actual composer threshold is 0.65 — and line 222 in this same file correctly says 0.65.
  - _fix:_ Change '(1.0)' to '(0.65)' (or drop the parenthetical) so the inner-core comment matches the actual composer threshold and line 222.
- ▣✓ bf1fa9a **`frontend/src/render/spellVfx.jsx:114`** [low·KEVIN·src] Ice trail comment says the cone 'tapers to a point at the tail', but the cone apex is oriented toward the projectile head, so it tapers to a point at the FRONT and is wide at the tail.
  - _fix:_ Either fix the comment to 'tapers to a point at the head/leading edge', or, if a trailing point is intended, flip the cone (negate its Y / rotate 180°). This is a visual call, so surface it.
- ▣✓ 4ae60bc **`frontend/src/render/spellVfx.jsx:720`** [low·KEVIN·src] Telegraph 'spoke-ring' comment claims '8 short radial ticks', but the geometry is a continuous 8-segment (octagonal) ring band with no discrete ticks/spokes; spokesRef is a misleading name.
  - _fix:_ Reword to 'a low-poly (octagonal) ring band' or, if actual radial ticks are wanted, build them as discrete radial boxes; rename `spokesRef` accordingly. Visual intent is Kevin's call.
- ▣✓ 4ae60bc **`frontend/src/store/useGameStore.jsx:99`** [low·AUTO·src] setLocale comment says CJK-font lazy-loading is 'a later task', but setLocale already implements it.
  - _fix:_ Update the comment to state that setLocale lazy-loads CJK fonts on the flip to zh-CN (drop the '(A later task ...)' framing).
- ▣✓ 5740c9e **`frontend/src/systems/AIWorkerSystem.jsx:48`** [low·KEVIN·src] The leap impulse's vertical component `8` is labeled `// Vertical boost` and stored as knockback[1], but the only knockback consumer (lines 145-146) reads only indices [0] and [2] — no vertical motion is ever applied.
  - _fix:_ Either apply the vertical term (e.g. `entity.position.y += entity.knockback[1] * delta * 4;` before the ground-snap) if a leap hop is desired, or drop the dead `8`/`2` values and the misleading `// Vertical boost` comment so leap/hurl are honestly horizontal-only.
- ▣✓ 4ae60bc **`frontend/src/ui/GamePanels.jsx:713`** [low·AUTO·src] Stale future-tense comment on the SFX slider claims music volume and master mute are yet to be delivered ('land in S3b'), but both controls are implemented directly below in the same panel.
  - _fix:_ Drop the '. Music volume + a master mute land in S3b' clause (or reword to reference the implemented controls).
- ▣✓ 5740c9e **`frontend/src/utils/spellCast.js:4`** [low·KEVIN·src] Comments cite 'shield/heal' as unmapped-spell fallback examples, but neither exists as a castable spell, and for a truly-unmapped spell resolveCastBaseDamage would throw rather than 'fall back to the static base'.
  - _fix:_ Drop the fictional 'shield/heal' example (or replace with an accurate one), and for the damage seam describe the real reachable fallback (getSpellStats returns null pre-mount -> `spell.damage`), noting that a truly-unmapped spellType is prevented upstream by the caller's `!spell` guard rather than handled here.
- ▣✓ 5740c9e **`frontend/src/world/GPUSparkSystem.jsx:76`** [low·AUTO·src] Fragment shader comments promise a soft radial round edge, but coord is computed and discarded — sparks stay square.
  - _fix:_ Either implement the radial falloff using the plane's local UV/vertex coords (gl_PointCoord won't work for a plane) or remove the dead `coord` line and the misleading comment.
- ▢ **`frontend/src/world/Terrain.jsx:138`** [low·KEVIN·src] Shader comment 'Water faces carry AO 3' and the abs(vBlockType-9.0) guards describe/handle water faces the mesher no longer emits (W2).
  - _fix:_ Drop the now-unreachable `abs(vBlockType-9.0)` water guards (or convert to an explicit assertion/comment) and remove the 'Water faces carry AO 3' clause from line 138.
- ▣✓ 5740c9e **`frontend/tests/store/spellUpgradeCost.test.js:39`** [low·AUTO·test] Comment (and the it-name) claim 'arcane' has no upgrade-table entry, but SPELL_UPGRADES.arcane exists; the test actually exercises the getSpellStats-returns-null fallback branch.
  - _fix:_ Reword the comment to describe the real branch (e.g. `// getSpellStats yields no leveled stats for this cast -> fall back to the static base`) and fix the it-name, or use a spell genuinely absent from SPELL_UPGRADES that still has a SPELL_MANA_COSTS entry, to match the stated intent.

### doc-drift (21)

- ▣✓ 88010a9 **`frontend/src/input/touchMath.js:45`** [medium·AUTO·src] MAX_PITCH comment cites the controller's defensive pitch clamp as 'Components:1218', but that line is a bare closing brace; the actual clamp is at Components.jsx:1283-1284.
  - _fix:_ Update the reference to `Components:1283` (or drop the brittle line number and reference the symbol/comment `Defensive camera pitch clamp` instead — line-number pins drift every edit of the 1330-line file).
- ▣✓ 88010a9 **`.claude/rules/r3f-pointer-lock-voxel-meshing.md:11`** [low·KEVIN·src] The companion winding-rule doc's Bottom(-Y) coordinates use the same XZ vertex order as its Top(+Y), which cannot both be CCW-from-outside; the shipped worker correctly reverses Bottom, so the doc contradicts the code. *(2026-08-07: that file is RETIRED — split into `.claude/rules/voxel-mesher.md` + `.claude/rules/input-and-pointer-lock.md`, both paths-scoped; the winding text was rewritten and the four-of-six omission fixed.)*
  - _fix:_ Update the rule doc's Bottom (-Y) (and re-check Front/Back) winding to match the shipped, gate-verified code in terrain.worker.js, which is the source of truth.
- ▣✓ 88010a9 **`frontend/src/GameScene.jsx:53`** [low·AUTO·src] Comment cites the Bloom prop 'on line ~906', but after the v6 de-monolith the file is 304 lines and the Bloom prop is at line 283.
  - _fix:_ Update the parenthetical to 'the <Bloom intensity={0.95}> prop below' (or the current line) to avoid a hard-coded, drift-prone line number.
- ▣✓ 88010a9 **`frontend/src/HUD.jsx:70`** [low·KEVIN·src] Capture-baseline count is stated inconsistently within the file (20 vs 13) and both are stale against the 31 baselines on disk.
  - _fix:_ Drop the hard numeric count from these determinism comments (write 'the capture baselines stay byte-identical' with no number). Carrying a specific count in prose next to a growing baseline set guarantees recurring drift.
- ▣✓ 88010a9 **`frontend/src/combat/cone.js:2`** [low·AUTO·src] Docstring says the cone math was extracted from SimplifiedNPCSystem.jsx's checkMobsInMeleeCone, but checkMobsInMeleeCone now lives in systems/CombatSystem.jsx, not SimplifiedNPCSystem.jsx.
  - _fix:_ Update the provenance reference to `systems/CombatSystem.jsx's checkMobsInMeleeCone` (the current home of the mob melee-cone path).
- ▣✓ 88010a9 **`frontend/src/combat/ribbonIndices.js:3`** [low·AUTO·src] Docstring says the index builder was extracted from Components.jsx's ProceduralRibbonTrail, but ProceduralRibbonTrail now lives in render/playerRender.jsx, not Components.jsx.
  - _fix:_ Update the provenance reference to `render/playerRender.jsx's ProceduralRibbonTrail` (the current home and the actual consumer of buildRibbonIndices).
- ▣✓ 88010a9 **`frontend/src/data/lootTables.js:63`** [low·AUTO·src] CHEST_LOOT row-shape comment documents a `duration?` field that no row defines and no consumer reads.
  - _fix:_ Remove `duration?` from the shape comment (it was a buff-scroll leftover), or reinstate a consumer if timed effects are intended.
- ▣✓ 88010a9 **`frontend/src/game/allegiance.js:5`** [low·KEVIN·src] Comment cites 'SimplifiedNPCSystem :753-757' for the per-message apply map, but that file is now only 183 lines after the v6 de-monolith.
  - _fix:_ Drop the specific ':753-757' line numbers (or re-point to the extracted system in src/systems/ once located) so the comment doesn't rot on the next line shift.
- ▣✓ 88010a9 **`frontend/src/game/dayNight.js:96`** [low·AUTO·src] Comment says the siege constants are 'consumed by nightSiege below', but there is no nightSiege function — the consumer is siegeParams (renamed).
  - _fix:_ Replace 'nightSiege' with 'siegeParams' in the comment.
- ▣✓ 88010a9 **`frontend/src/game/hybrids.js:4`** [low·AUTO·src] Header lists the hybrid role-spread as 'skirmisher/bruiser/harasser' but grimhound uses role 'runner', a fourth role absent from the header.
  - _fix:_ Update the header to 'skirmisher/bruiser/runner/harasser' (or make it clearly illustrative, e.g. 'roles spread across skirmisher/bruiser/runner/harasser').
- ▣✓ 88010a9 **`frontend/src/input/inputState.js:40`** [low·KEVIN·src] The INTENT_KEYS JSDoc enumerates producer/consumer status for every intent EXCEPT the three Aspect verbs grab/snare/imbue that are actually in the array.
  - _fix:_ Extend the JSDoc producer-status paragraph to cover grab/snare/imbue (the S2-B Aspect verbs) alongside roar, or add a one-line note that the Aspect-verb row (roar/grab/snare/imbue) follows the same real-consumed-intent pattern as roar.
- ▣✓ 88010a9 **`frontend/src/render/mascots/voxelKit.jsx:2`** [low·AUTO·src] Header comment says 'the two render primitives every mascot direction reuses, so all three render...' but the file exports THREE primitives and only ONE mascot direction survives.
  - _fix:_ Update to 'the three render primitives the mascot reuses' and drop 'all three directions' / reword to the single surviving Direction-B mascot.
- ▣✓ 88010a9 **`frontend/src/render/pickupVfx.jsx:41`** [low·AUTO·src] Comment describes rarityBeam's return as '{ color, height, intensity }' but it actually returns five fields, two of which (auraRadius, auraOpacity) this component consumes.
  - _fix:_ Update the listed shape to '{ color, height, intensity, auraRadius, auraOpacity }' or drop the explicit field list.
- ▣✓ 88010a9 **`frontend/src/ui/AspectHintToast.jsx:11`** [low·AUTO·src] Sibling capture-safety comments disagree on the baseline count (18 vs 20) and both are stale.
  - _fix:_ Drop the hardcoded count from these comments (say 'the captured visual baselines') or update all four to the real number so they stop drifting independently.
- ▣✓ 88010a9 **`frontend/src/ui/touchTray.js:5`** [low·AUTO·src] JSDoc cites `InputManager:117-120` and a `<TouchTray>` component, both stale — the actual toggles are at 119-122 and no `<TouchTray>` component exists.
  - _fix:_ Update the line reference to InputManager:119-122 (or drop the brittle line number) and rename `<TouchTray>` to `<TouchControls>`/`<TouchControlsSurface>`.
- ▣✓ b5be02f **`frontend/src/world/Terrain.jsx:462`** [low·AUTO·src] FarBeacon comment states the Blight-Heart 'sits at ~1280 blocks', but the radius was pulled in to 1024 (~1025 blocks radial).
  - _fix:_ Update '~1280 blocks' to '~1025 blocks' (radius 1024).
- ▣✓ b5be02f **`frontend/src/world/Terrain.jsx:428`** [low·AUTO·src] BlightMonolith comment says 'the lair is ~906 blocks out', a stale figure from the old 1280 radius era.
  - _fix:_ Update '~906 blocks out' to reflect the current site (~725 per axis / ~1025 radial).
- ▣✓ 88010a9 **`frontend/src/world/biomeTable.js:12`** [low·AUTO·src] Comment says the texture atlas has 14 layers; it now has 16 (proceduralTextures numLayers = 16).
  - _fix:_ Change '14 layers' to '16 layers' (or reference the numLayers constant) so the atlas-size note matches reality.
- ▣✓ 88010a9 **`frontend/src/world/blockIds.js:16`** [low·AUTO·src] Comment states numLayers = 14, but proceduralTextures.js now uses numLayers = 16 (contradicts same file's line 43).
  - _fix:_ Update line 16 to `(numLayers = 16)` to match proceduralTextures.js and the file's own R4a note on line 43.
- ▣✓ 88010a9 **`frontend/src/world/homeAnchor.js:3`** [low·AUTO·src] Stale file/line reference: the comment points the spawn probe at Components.jsx:892-930, but the spawn logic now lives in game/spawnPlacement.js and those lines hold unrelated dodge-roll code.
  - _fix:_ Update the reference to `game/spawnPlacement.js` (resolveSpawnGround/spawnTargetY) or make it version-agnostic (drop the exact line range) so it does not misdirect the next dev.
- ▣✓ 88010a9 **`frontend/tests/gates/ore-drop-gates.test.js:4`** [low·AUTO·src] ore-drop-gate comment references a 'Gold Helmet recipe' that does not exist — recipes.js's only gold recipe is 'Golden Crown'.
  - _fix:_ Change 'Gold Helmet recipe' to 'Golden Crown recipe' in the comment.

### test-vacuity (32)

- ▢ **`frontend/tests/gates/ally-eyes-gate.test.js:11`** [medium·KEVIN·test] Asserts the single token `!entity.isAlly` exists anywhere in MobModel.jsx as a proxy for the 3-way compound hostile-eyes gate, which the grep cannot verify is intact.
  - _fix:_ Extract a pure predicate showsHostileEyes({ passive, type, isAlly }) into a new module (e.g. src/render/mobEyes.js), call it in the MobModel JSX conditional, and behaviorally test the matrix: hostile->true, passive->false, villager->false, captured ally->false. Keep only a thin call-site grep on MobModel.
- ▣✓ 91530be **`frontend/tests/gates/aspect-hint-gate.test.js:15`** [medium·AUTO·test] The store's first-unlock aspect-hint gating (currentVal===0 ? aspectUnlockHint) is asserted only by string-grepping useGameStore.jsx, though the store is importable and this is the gating's ONLY coverage. *(gate replaced by a behavioural one at `tests/gates/aspect-hint-gate.test.jsx`; the .js file is gone)*
  - _fix:_ In tests/integration/spell-upgrade-talents.test.jsx (already drives the real spendTalentPoint via Upgrade buttons), spend a fresh Aspect verb-talent and assert getState().aspectHint is truthy; spend it again (currentVal>0) and assert aspectHint is unchanged (no re-hint). jsdom-render AspectHintToast with fake timers to assert the 5s setAspectHint(null) auto-clear. Then delete the source-string assertions. No seam extraction needed — the store is already importable.
- ▢ **`frontend/tests/gates/coin-sink-gates.test.js:33`** [medium·KEVIN·test] The 'merchant has a coin sink' describe source-greps TradingInterface.jsx for type:'coin' / executeCoinTrade / spendCoins / potion names as a proxy for the coin->consumable trade, which is directly behaviorally renderable.
  - _fix:_ Replace the grep describe with a behavioral test mirroring crystal-wallet-gates.test.jsx: setState coins:20, render <TradingInterface villager={...}/> under SoundProvider, click the 'Coins to Health Potion' row, assert useGameStore coins 20->8 and inventory gained a Health Potion. No seam extraction needed — executeCoinTrade is already isolated.
- ▢ **`frontend/tests/gates/combat-log-gates.test.js:14`** [medium·KEVIN·test] The ring-buffer cap ('caps the visible lines') is asserted by grepping CombatLog.jsx for `.slice(-` rather than rendering with >cap notifications and counting rendered lines.
  - _fix:_ Behavioral test: render <CombatLog notifications={20 entries}/> in jsdom, assert exactly 8 rows render and they are the LAST 8; render again with isTouchUIMode mocked true and assert 4. The isCaptureMode()->null path is directly assertable under capture mode.
- ▢ **`frontend/tests/gates/death-beats-gates.test.js:23`** [medium·KEVIN·test] The mob death-deferral lifecycle (sets dyingUntil, defers ecs.remove, keeps rendering the corpse) is asserted with brittle multi-file source regexes rather than driven through CombatSystem, which is already behaviorally renderable in the sibling suite.
  - _fix:_ Behavioral test: add a mob entity, apply lethal damage via GameMethods.damageMob, assert entity.dyingUntil is set and the entity is still in mobsQuery; advance performance.now past dyingUntil, run the sweep, assert ecs.remove happened. Leave the boss slow-mo / overlay-token asserts as grep/visual.
- ▢ **`frontend/tests/gates/error-boundary-gates.test.js:13`** [medium·KEVIN·test] The ErrorBoundary gate asserts literal palette hex strings and a window.location.reload substring in index.jsx source instead of rendering the boundary and observing the crash fallback.
  - _fix:_ Extract ErrorBoundary to its own module and add a jsdom behavioral test: render <ErrorBoundary><ThrowsOnRender/></ErrorBoundary>, assert the fallback + Reload button are in the DOM and clicking calls a mocked reload; with import.meta.env.DEV stubbed false assert the component stack is NOT rendered. Keep exact-hex greps only if a visual contract needs them.
- ⊘ DISMISSED — the premise is mechanically impossible here — gate-shape Check A re-runs every positive toMatch against an AST-blanked copy and hard-fails a pattern satisfied only by a comment — `node frontend/scripts/ci/gate-shape.mjs` **`frontend/tests/gates/heartbeat-stable-interval-gates.test.js:17`** [medium·KEVIN·test] The 'interval re-arms only on bucket change' regression is guarded by grepping the effect dep-array source text (`}, [bucket];` and playRef.current) instead of driving re-arm behavior with a setInterval spy.
  - _fix:_ jsdom test with vi.useFakeTimers + a spy on setInterval: mock useGameSounds to return a fresh object per render, render HeartbeatAudio at a low-HP bucket, force several re-renders WITHOUT changing the bucket, assert setInterval called exactly once; then change health to a new bucket and assert exactly one additional re-arm.
- ▣✓ 3f327b3 **`frontend/tests/gates/hub-render-gates.test.js:20`** [medium·KEVIN·test] Conditional glow-guard assertion is self-defeating and only checks the guard string appears once anywhere, not per-Emissive.
  - _fix:_ Drop the outer `if` and assert positionally per glow like home-anchor-gates.test.js:31 (`expect(guard).toBeLessThan(emissive)`), or assert every `<Emissive` occurrence is preceded by a `!isCaptureMode()` guard within N chars, so a removed/unguarded glow fails loudly.
- ▣✓ 3f327b3 **`frontend/tests/gates/hud-declutter-gates.test.js:24`** [medium·KEVIN·test] Regex alternation with a bare `gameMode` token makes the survival-gating assertion near-tautological and unanchored to the render site.
  - _fix:_ Anchor to the PlayerHungerBar render site (slice the JSX around `<PlayerHungerBar` and assert the survival guard wraps it), or render HUD/PlayerHungerBar in jsdom with gameMode='survival' vs 'creative' and assert mount/unmount (see modal-a11y.test.jsx for the jsdom pattern).
- ▣✓ d2fbc7b **`frontend/tests/gates/place-puff-gates.test.js:19`** [medium·KEVIN·test] Place-puff gate asserts a comment-marker string exists (/place puff/i) — proxy for behavior a pure color resolver could test.
  - _fix:_ Extract puffColorForBlock(blockType) as a pure fn returning the BLOCK_TYPES hex; keep only the triggerGPUSparks-fires-on-place grep as a narrow structural check and stop asserting on comment text.
- ▣✓ 0cb78ca **`frontend/tests/gates/quest-lore-gates.test.js:11`** [medium·KEVIN·test] Entire file is one bare identifier OR-grep (/loreFor|themedDescription/) — near-tautological coverage of quest lore application.
  - _fix:_ Extract applyQuestLore(quest) as a pure fn and assert a raw quest comes out with lore + giver + a themed description (loreFor/themedDescription in questLore.js are already pure and importable).
- ▢ **`frontend/tests/gates/spell-mastery-ui-gates.test.js:18`** [medium·KEVIN·test] The player-facing Spell Mastery panel is validated purely by grepping SpellUpgradePanel.jsx source, though it is a jsdom-renderable DOM/framer component whose Upgrade click could be tested behaviorally.
  - _fix:_ Add a jsdom render test mirroring touch-xp-readout.test.jsx: seed useGameStore (spellLevels + level), render <SpellUpgradePanel onClose={()=>{}}/>, assert 4 spell rows render, fire the Upgrade Button click, and assert store.upgradeSpell was invoked with the right key / spellLevels advanced.
- ▢ **`frontend/tests/gates/touch-entry-gate.test.js:35`** [medium·KEVIN·test] A confirmed prod bug (touch players stuck on the title screen) is locked by source-greps, including an exact-whitespace regex counting requestPointerLock blocks that breaks on any reformat.
  - _fix:_ Extract the entry decision to a pure helper resolvePlayEntry({isTouch}) and unit-test it; replace the whitespace-coupled block count with a whitespace-insensitive/normalized match or a mount-order regression test.
- ▣✓ 5378965 **`frontend/tests/gates/touch-tray-gate.test.js:14`** [medium·KEVIN·test] Tray openers are validated by regex-grepping the store SOURCE for action:/show: keys, when the zustand store is importable and touchTray already exports a pure togglePanel seam.
  - _fix:_ Import useGameStore + TRAY_PANELS + togglePanel; assert typeof getState()[p.action] === 'function' and p.show in getState(), then call togglePanel(p, getState()) and assert getState()[p.show] flipped (and toggled back). Also cover togglePanel's `return false` unwired branch.
- ▢ **`frontend/tests/gates/trade-fresh-prev-gates.test.js:17`** [medium·KEVIN·test] A real inventory-clobbering concurrency fix is locked only by matching the exact fix expression as a source string; the fresh-prev subtraction behaviour is never executed.
  - _fix:_ Seam-extract a pure reducer (applyBlockTrade/applyCrystalTrade in src/game/ or ui/tradeReducer.js), have TradingInterface call setInventory(prev => applyBlockTrade(prev,...)), then unit-test: a DIFFERENT bucket changed after render survives and the correct bucket is decremented from prev.
- ▢ **`frontend/tests/render/title-diorama-gates.test.js:6`** [medium·KEVIN·test] All three TitleDiorama gates assert raw source substrings as proxies for behaviour instead of testing the extractable capture-freeze drift logic; the mote gate even matches the word in a comment.
  - _fix:_ Extract pure drift functions (e.g. dioramaCameraPose(t,isCapture), dioramaMotesRotation(t,isCapture)) into src/render/titleDioramaDrift.js and behaviorally assert pose(t,true)===pose(0,true) for all t (frozen) and pose changes with t when isCapture=false. Keep only the /Canvas/ structural grep for the genuinely un-runnable R3F mount.
- ▣✓ 31e7b57 **`frontend/tests/world/climate.test.js:17`** [medium·KEVIN·test] Beach-sand test guards its only assertion behind the exact threshold the source uses, so it is tautological when the guard is true and asserts nothing when it is false.
  - _fix:_ Import BEACH_BAND_TOP and assert unconditionally: first expect(s.surfaceY).toBeLessThan(BEACH_BAND_TOP) so it fails loud if (-24,0) is no longer a beach, then expect(s.surfaceBlock).toBe(4). Prefer a coordinate independently verified to sit in the beach band rather than re-deriving the source's branch.
- ▣✓ 7f9ee5f **`frontend/tests/game/keyMap.test.js:36`** [low·KEVIN·test] The 'ANTI-LIE keydown handler' gate asserts a code literal exists as a substring of two concatenated JSX source files rather than driving the handler behaviorally.
  - _fix:_ For observable-effect keys (panel toggles like KeyM/KeyU), extend the tests/integration/menu-panel-interaction.test.jsx jsdom pattern: dispatch each advertised code and assert the mapped store flag/intent flips. Keep the textual grep only for keys with no node-observable effect (raw WASD movement) and label them.
- ▣✓ 47513ef **`frontend/tests/gates/ability-bar-gates.test.js:13`** [low·KEVIN·test] The store cooldown-mirror shape and the AbilityBar render surface are grepped as source strings though the store is importable (573-574) and the component is jsdom-renderable; only the Components throttle-wiring grep is conventionally legit.
  - _fix:_ Assert the store shape via import (expect(useGameStore.getState().abilityCooldowns).toBeDefined(); call setAbilityCooldowns and read back). jsdom-render AbilityBar with a store fixture and assert 5 labelled slots reading store cooldowns, and null under isCaptureMode(). Keep the Components buildCooldownMirror/throttle-ref grep as the structural piece (buildCooldownMirror behavior is already covered by cooldownMirror.test.js).
- ▢ **`frontend/tests/gates/allocate-ui-gates.test.js:13`** [low·KEVIN·test] All three assertions grep GamePanels.jsx for allocateAttribute call strings and `attributePoints > 0`; the same behavior (incl. the 0-point gating) is already E2E-covered by inventory-attributes.test.jsx, making this gate a redundant source-string proxy.
  - _fix:_ Delete the redundant gate, or replace it with a thin note; the behavioral coverage already lives in tests/integration/inventory-attributes.test.jsx. If extra assurance is wanted, extend that render test rather than grepping the JSX.
- ▢ **`frontend/tests/gates/combat-keybind-gates.test.js:19`** [low·KEVIN·test] The F-casts / T-melees keybinds are pinned with brittle windowed source regexes over Components.jsx (`/code === 'KeyF'\)\s*\{[\s\S]{0,120}triggerSpellCast\(\)/`) — a proxy for dispatch behavior a pure key->action router would let you test behaviorally.
  - _fix:_ Extract a pure keyToCombatAction(code) router from the Components.jsx keydown handler (returns 'cast' for KeyF, 'melee' for KeyT) and unit-test it directly; keep the keyMap label assertions (lines 27-30) as the data-contract gate.
- ⊘ DISMISSED — colour distinctness IS pinned exactly, in a file the finding never opened — src/game/mobHitFx.test.js:10-13 asserts all four spark colours by value — `npx vitest run src/game/mobHitFx.test.js` **`frontend/tests/gates/element-impact-gates.test.js:32`** [low·KEVIN·test] The 'every spell element has a distinct impact case' check greps mobHitFx.js for `case 'spell':` even though sparkFor is a callable pure export — the per-element mapping is directly testable by invoking the function.
  - _fix:_ For each spell in SPELL_TO_ELEMENT call sparkFor(spell) and assert it returns a defined per-element-distinct descriptor (collect results, assert the set of colors has no unintended duplicates) instead of asserting the `case` label text exists.
- ⊘ DISMISSED — acting on this would REDUCE coverage — the claimed executed replacement in tests/world/heightAt.test.js is a formula restatement, not a numeric pin, so deleting the source assertion removes the only check on the literal — `npx vitest run tests/world/heightAt.test.js` **`frontend/tests/gates/heightat-single-source.test.js:16`** [low·AUTO·test] Source-literal formula assertion is redundant with an executed numeric pin of the same formula.
  - _fix:_ Delete the L16 `toContain('40 + n * 18')` assertion (formula is behaviorally pinned in tests/world/heightAt.test.js). Keep the L17 `export function computeHeight` structural anchor and the two genuinely-structural it-blocks (both consumers import computeHeight; no inline baseHeight copy survives) — the proposed 'delete the whole first it-block' would also drop the L17 export check.
- ▣✓ 3f327b3 **`frontend/tests/gates/input-abstraction-gates.test.js:44`** [low·AUTO·test] `.toMatch(/\.active\b/)` matches any `.active` in the 1330-line controller, not the getInput().active verb gate.
  - _fix:_ Tighten to `expect(components()).toMatch(/getInput\(\)\.active/)` (matches at L382/385/422), or assert the count of getInput().active reads >= the number of gated verbs; the pure seam src/input/inputState.js is already unit-testable for a behavioral reader/writer test.
- ▢ **`frontend/tests/gates/inventory-flat-bucket-gates.test.js:21`** [low·KEVIN·test] Trade routing is asserted as exact inline code strings; the routing invariant is encoded but never executed.
  - _fix:_ Extract the trade-apply logic into a pure reducer (e.g. applyTrade(inventory, {resultItem, magicItem, count}) -> inventory) and behaviorally assert the result has counts under blocks[...] and nothing new under magic[...]; keep the negative source-grep as belt-and-suspenders.
- ▢ **`frontend/tests/gates/quest-log-gates.test.js:15`** [low·KEVIN·test] QuestLog gate uses bare substring greps (/Modal/, /lore/, /giver/) that match any occurrence including comments/imports.
  - _fix:_ Render <QuestLog> in jsdom with a seeded active quest and assert lore/giver/objective text appears; simulate the L key through the real InputManager handler. Keep only the cross-file MenuSystem-mounts-QuestLog grep as structural.
- ▣✓ 0cb78ca **`frontend/tests/gates/quest-persistence-gates.test.js:18`** [low·KEVIN·test] Persistence gate asserts identifier presence; buildSaveData serialization of questState is directly round-trippable behaviorally.
  - _fix:_ Import buildSaveData, build from a store state carrying quest progress, and assert the returned blob has questState with the expected quests/completedQuestIds.
- ▣✓ ca504eb **`frontend/tests/gates/reward-audio-gates.test.js:32`** [low·KEVIN·test] Reward-audio gate counts source occurrences of window.playFanfare (>=2) as a proxy for two reward beats firing.
  - _fix:_ Stub window.playFanfare, drive the real achievement-unlock and quest-complete paths (the claimQuest behavioral harness already exists), and assert the stub was called for each beat.
- ⊘ DISMISSED — the behavioural coverage the finding asks for already exists in tests/store/siegeParams.test.js, which imports siegeParams directly and pins the night-0 baseline and the per-night ramp — `npx vitest run tests/store/siegeParams.test.js` **`frontend/tests/gates/siege-gates.test.js:44`** [low·KEVIN·test] Siege gate source-greps the consumer for siegeParams(nightCount).hostileChance instead of testing the pure exported siegeParams escalation behaviorally.
  - _fix:_ Import siegeParams and assert siegeParams(7).hostileChance > siegeParams(1).hostileChance and maxMobs escalates (and the zoneTier arg); keep the negative-literal + consumer-call greps as the thin structural wiring check.
- ▣✓ 5378965 **`frontend/tests/gates/target-frame-gates.test.js:12`** [low·KEVIN·test] The store's targetEntity field is asserted by grepping useGameStore.jsx source; the store is importable and TargetFrame is a jsdom-renderable nameplate whose gating contract could be tested behaviorally.
  - _fix:_ Assert 'targetEntity' in useGameStore.getState(); add a jsdom render test for TargetFrame: shows the nameplate when targetEntity is set, renders null without one, and is suppressed under isCaptureMode().
- ⊘ DISMISSED — between() does return empty on a missing marker, but a POSITIVE toMatch runs first in every it() and fails on the empty string, so a removed anchor cannot pass silently — `npx vitest run tests/gates/terrain-quest-callback-gates.test.js` **`frontend/tests/gates/terrain-quest-callback-gates.test.js:21`** [low·KEVIN·test] The block-place/break dead-wire fix is verified by string-slicing mine()/place() bodies out of Terrain.jsx via fragile signature markers; a missing marker returns '' making the not.toMatch pass vacuously.
  - _fix:_ Extract the mutation->quest-callback dispatch into a thin pure helper (e.g. onVoxelMutated(kind, store)) firing the right callback exactly once per kind, unit-test it, and keep the Terrain grep only as a thin wiring check.
- ▢ **`frontend/tests/gates/victory-audio-gate.test.js:33`** [low·KEVIN·test] VictoryOverlay firing its sting on mount is asserted via a fragile 600-char proximity slice of GameSystems.jsx source rather than a render test — and the slice is already satisfied by a COMMENT.
  - _fix:_ Render VictoryOverlay under jsdom with window.playVictory = vi.fn(), mount it in the victory state, and assert the mock was called once on mount (VictoryOverlay is a presentational DOM component; the VOICES.victory check at L20 already covers the voice).

### coverage-gap (8)

- ▣✓ a4845ca **`frontend/src/game/settingsPersist.test.js:89`** [medium·KEVIN·test] The hydrate-on-boot + persist-on-change glue in initSettingsPersistence is never exercised — the two tests only hit the two early-return no-op guards.
  - _fix:_ Seam extraction: add an injectable storage param — initSettingsPersistence(store, isCapture, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) — used at both the loadSettings hydrate site and the saveSettings subscribe-write site (also update the App.jsx:685 call site or rely on the default). Then behavioral tests with a fake store {getState/setState/subscribe} + the existing fakeStorage: (a) boot hydrates the sanitized stored blob; (b) a dial change writes sanitized; (c) an unchanged dial does NOT write (sameSettings dedup); (d) the returned cleanup unsubscribes.
- ▣✓ 4b06940 **`frontend/src/game/worldSaves.test.js:3`** [medium·AUTO·test] mintWorldId() — the collision-avoidance fn the module says 'this whole slice exists to kill' — is never imported or tested, and every guarded failure path (quota, corrupt-JSON, delete-active) is untested. *(`mintWorldId` + the quota path are behavioural now. The corrupt-JSON catches and the delete-active branch remain uncovered — that is a NEW, smaller coverage-gap, deliberately NOT folded into this closure.)*
  - _fix:_ Import mintWorldId and add: (1) freeze Date.now, seed index/blob with the base id, assert next mint gets `_2` then `_3`; (2) monkeypatch localStorage.setItem to throw, assert writeWorld returns false AND listWorlds() stays empty (no dangling index); (3) seed a corrupt blob, assert readWorld returns null (not a throw); (4) setActiveWorldId('local_1'); writeWorld+deleteWorld('local_1'); assert getActiveWorldId() is null.
- ▣✓ a4845ca **`frontend/src/input/pointerLook.test.js:2`** [medium·AUTO·test] attachPointerLook() — the lenient pointer-lock gate the module exists to replace drei's silently-broken PLC — has ZERO behavioral tests; only the pure applyMouseLook math is covered.
  - _fix:_ Add a @vitest-environment jsdom block: stub document.pointerLockElement truthy, dispatch mousemove with movementX/Y, assert camera.rotation changed; set it falsy, dispatch again, assert NO rotation (the lock gate); assert getSensitivity() is re-read each move; call the returned cleanup and assert a later mousemove is ignored; assert attachPointerLook({}) returns a no-op fn when camera is absent.
- ▣✓ 4b06940 **`frontend/tests/store/bossReward.test.js:5`** [medium·KEVIN·test] The test asserts the ITEMS registry contains the two boss-reward items at the claimed rarities, but is fully decoupled from the actual boss drop (hardcoded string literals in bossSystem.js), so a drop-name typo is invisible.
  - _fix:_ Extract a shared constant e.g. `export const BOSS_LOOT = [['Crown of the Dragon King', 1], ['Dragon Scale', 3]]`; have bossSystem.js consume it instead of literals, and rewrite the test to iterate BOSS_LOOT asserting each name is registry-consistent — closing the loop between the drop and the registry.
- ▣✓ 4b06940 **`frontend/src/game/chainArc.test.js:28`** [low·AUTO·test] Every chainArcPoints test uses a horizontal or shallow-diagonal arc; the near-vertical axis branch (|ay|>0.99) in chainArc.js:32 is never exercised.
  - _fix:_ Add a test with `from=[0,0,0], to=[0,10,0]` asserting exact endpoints (first=from, last=to), all coords Number.isFinite, and interior deviation `Math.hypot(dx,dz) <= Math.SQRT2*jitter + 1e-6` (perpendicular basis now in the X/Z plane).
- ▣✓ 4b06940 **`frontend/src/game/lootJuice.test.js:21`** [low·AUTO·test] The rgba→rgb alpha-strip is only format-checked (no rgba() / starts-with rgb() ), never that the r/g/b channel values survive the toThreeColor capture-group transform.
  - _fix:_ Add a channel-preservation assertion for the one tier that goes through the rgba branch: expect(rarityBeam('common').color).toBe('rgb(174, 184, 204)') (derived from RARITY_FILL.common.ring = 'rgba(174,184,204,0.65)'), so a broken capture-group regex is caught behaviorally rather than only format-checked.
- ▣✓ 4b06940 **`frontend/src/input/touchDevice.test.js:10`** [low·AUTO·test] The legacy `'ontouchstart' in window` fallback branch of isTouchDevice is never exercised, and setEnv's `ontouchstart` param is dead code — no test ever passes it.
  - _fix:_ Add a test: navigator {} (no maxTouchPoints), window with matchMedia returning matches:false and `ontouchstart: null` present -> expect isTouchDevice() true (proves the ontouchstart legacy path). Wire the existing setEnv `ontouchstart` param into that test, or remove the dead param.
- ▣✓ a4845ca **`frontend/tests/store/settingsPersist.test.js:2`** [low·KEVIN·test] initSettingsPersistence — the capture-guarded hydrate + subscribe-persist glue — has zero test coverage; only the pure sanitize/load/save helpers are tested.
  - _fix:_ Add a behavioral test with an injected fake store (getState/setState/subscribe stub) + a fakeStorage: assert (a) it returns a no-op and touches no storage when isCapture()===true; (b) it hydrates the store via setState from a stored blob on boot; (c) a subscribed dial change triggers saveSettings while an unchanged emit does not.

### perf (2)

- ▣✓ 8624f69 **`frontend/src/GameSystems.jsx:61`** [low·AUTO·src] `attributes`, `equipment`, and `getEffectiveAttributes` are pulled into the useShallow selector but never used, causing needless provider (and all-consumer) re-renders when equipment/attributes change.
  - _fix:_ Drop `attributes`, `equipment`, and `getEffectiveAttributes` from the useShallow selector.
- ▣✓ f0faddc **`frontend/src/render/playerRender.jsx:250`** [low·KEVIN·src] The ribbon trail replaces all three geometry attributes with brand-new THREE.BufferAttribute objects every frame during a swing, churning typed-array allocations and orphaning the previous frame's GL buffers.
  - _fix:_ Preallocate position/uv/index BufferAttributes once at a max point count with THREE.DynamicDrawUsage, write into their `.array` in place each frame, set `needsUpdate`, and use `geometry.setDrawRange` to control how many quads render; cache `buildRibbonIndices` output keyed by N so it is not rebuilt when the point count is stable.

### a11y (1)

- ▣✓ 3cc7df0 **`frontend/src/ui/ChestInventoryPanel.jsx:61`** [medium·KEVIN·src] Chest transfer items are click-only <Slot> divs with no keyboard operability inside a focus-trapped modal.
  - _fix:_ Render the transfer items as real buttons (or give Slot role="button", tabIndex={0}, and an onKeyDown Enter/Space handler when onClick is present), so they enter the modal's FOCUSABLE set and can be activated by keyboard.

### inconsistency (11)

- ▣✓ d539b0b **`frontend/src/i18n/strings.js:49`** [medium·KEVIN·src] Missing `credits.font_puhuiti` i18n key: the PuHuiTi font-credit label is hardcoded in the Credits UI while its sibling Smiley Sans goes through t(), so zh-CN never gets the Chinese font name.
  - _fix:_ Add `'credits.font_puhuiti': 'Alibaba PuHuiTi 3.0 / 阿里巴巴普惠体'` (en) and `'阿里巴巴普惠体 / Alibaba PuHuiTi 3.0'` (zh-CN) to strings.js, then change CreditsScreen.jsx:69 to `label={t('credits.font_puhuiti')}` — mirroring the Smiley Sans row.
- ▣✓ 18a210d **`frontend/src/theme/cssVars.js:82`** [medium·AUTO·src] TW_COLORS has silently drifted from the real Tailwind config: it omits the four Aspect colors (ferocity/kinetic/soul/resonance) that tailwind.config.cjs actually ships, and no parity test guards color structure.
  - _fix:_ Add the four missing entries to TW_COLORS after `info` (ferocity/kinetic/soul/resonance via tw('--ui-...')) to realign the spec object with the config. Stronger fix: have tailwind.config.cjs import TW_COLORS so colors have one SoT, and add a deep-equality color-parity test mirroring the existing scale parity so future color drift fails CI.
- ▢ **`frontend/scripts/visual/heldf-probe.mjs:12`** [low·KEVIN·test] Probes reuse overlapping fixed ports (4194/4195/4196/5199) rather than per-probe dedicated ones; combined with the un-reaped vite orphan bug, a leaked vite squats the shared port and blocks the next probe.
  - _fix:_ Assign each probe a unique fixed port (or centralize a small port registry in a shared harness). Fixing the detached+group-kill orphan bug also removes the squatting source.
- ▣✓ 18a210d **`frontend/src/EnhancedMagicSystem.jsx:383`** [low·AUTO·src] The 'pierce' switch case declares `const healAmount` without a block scope while the sibling 'freeze' case wraps its declarations in braces — no-case-declarations lint gap and an inconsistency with the neighbouring case.
  - _fix:_ Wrap the 'pierce' case body in braces `case 'pierce': { ... break; }` to match the 'freeze' case.
- ▣✓ 18a210d **`frontend/src/GameSystems.jsx:26`** [low·KEVIN·src] Default (no-provider) context exposes `regenerateMana`, which is neither a real store action (store has `restoreMana`) nor present in the actual provider value.
  - _fix:_ Remove the dead `regenerateMana` key from the default context (or rename to `restoreMana` and add it to the provider value) so the two context shapes match reality.
- ▢ **`frontend/src/audio/synthVoices.js:15`** [low·AUTO·src] The older voices (makeTone, makeNoise, makeRoarSound, makeAggroGrowl, makeGrabSound, makeHurlSound, makeSlamSound, makeAnvilSound, makeIgniteSound, makeFreezeSound, makeZapSound, makeRuneSound, makeBindSound, and the makeAttack/Hit/Defeat/Swing/Magic*/LevelUp family) compute frameCount = sampleRate * duration WITHOUT Math.floor, whereas the newer voices (makeHeartbeat 503, makeSiegeHorn 525, makeDawnChime 552, makeFanfare 583, makeVictorySound 618, makeUIOpen 472, makeUIClose 484) all floor it. Float imprecision makes the product non-integer for several durations, so the synthesis loop overshoots the Float32Array by one index (silently ignored) and the buffer is truncated a sample short.
  - _fix:_ Wrap every `frameCount = sampleRate * duration` in Math.floor() (as the newer voices already do) so the loop bound always matches the allocated buffer length.
- ▣✓ 18a210d **`frontend/src/combat/targeting.js:60`** [low·AUTO·src] damageableInCone passes e.position to isPointInCone without a position guard, unlike its sibling nearestDamageable which guards !e.position.
  - _fix:_ Add `e.position &&` to the filter predicate: `(e) => canPlayerDamage(e) && e.position && isPointInCone(...)`, matching nearestDamageable's defensive guard.
- ▣✓ d539b0b **`frontend/src/ui/GamePanels.jsx:95`** [low·KEVIN·src] GearInspector fallback description mislabels non-cooked consumables (raw meats, XP tokens) as building material, contradicting the fact that the same tile shows a working 'Use' consume button.
  - _fix:_ Drive the fallback desc off the consumables registry (e.g. `if (isConsumable(itemName)) desc = 'Consumable: ...'`) instead of a hardcoded two-item food list.
- ▢ **`frontend/src/ui/TouchControls.jsx:206`** [low·KEVIN·src] Touch-tray labels are hardcoded English, bypassing the i18n `t()` layer that GamePanels uses — untranslated for zh-CN. ⟵ **CITE CORRECTED 2026-08-08** — the filed line in `touchTray.js` WAS fixed (`labelKey` added at `d539b0b`); the untranslated fallback now lives here (`aria-label={p.label}`).
  - _fix:_ Store an i18n key (e.g. `labelKey: 'ui.inventory'`) instead of a literal, and resolve via `t()` at the consumer, so the touch tray aria-labels localize like the desktop panels.
- ⊘ DISMISSED — the zero-emoji rule is SRC-scoped by design, not by oversight — static-gates.test.js builds its file list from src/ only, and these are test fixtures — `grep -n "SRC = resolve" frontend/tests/gates/static-gates.test.js` **`frontend/tests/data/loot-characterization.test.js:94`** [low·AUTO·test] This file embeds literal emoji as test fixtures while sibling items.test.js deliberately uses \u{...} escapes to stay emoji-free per the same M3 emoji-hygiene rationale.
  - _fix:_ For consistency with items.test.js, hoist/import a shared codepoint map (E) and build the emoji-prefixed fixtures via \u escapes; behaviour-preserving. Or, if literal emoji in tests is accepted, drop the emoji-free scaffolding in items.test.js so the convention is uniform.
- ▣✓ 18a210d **`src/world/spellUpgrades.js:90`** [low·AUTO·src] The required-player-level ladder derived from xpCost is hard-coded identically in two places (the real gate here and the display gate in SpellUpgradePanel.jsx), so an edit to one silently desyncs the UI from the actual rule.
  - _fix:_ Export a single `requiredLevelForUpgrade(nextLevelEntry)` from spellUpgrades.js and have both upgradeSpell() (line 90) and SpellUpgradePanel.jsx:19 call it, removing the duplicated literal ladder.

### enhancement (7)

- ▢ **`.github/workflows/ci.yml:47`** [low·KEVIN·test] No dependency vulnerability scanning anywhere — install uses --no-audit and there is no npm audit step or Dependabot config, so a CVE in a (transitive) dep ships to the live Vercel demo unnoticed.
  - _fix:_ Add a non-blocking (or high-severity-gating) `npm audit --audit-level=high` step, or a .github/dependabot.yml with the npm ecosystem for frontend/, to surface known-CVE advisories before auto-deploy.
- ▣✓ d539b0b **`frontend/scripts/perf/run-scenarios.mjs:82`** [low·KEVIN·test] The M2 C−B budget verdict (L82) is only logged; the process never exits non-zero on FAIL, so despite 'gate' framing `npm run perf:m2` returns 0 on a budget breach.
  - _fix:_ If it is meant to gate, `process.exit(withinBudget(cb) ? 0 : 1)`; otherwise rename 'gate' to 'report' in the header (L4) and log (L82) so no one wires it in expecting enforcement.
- ▣✓ 93bf3d3 **`frontend/src/Components.jsx:484`** [low·AUTO·src] The input effect publishes performVerb into the store but its cleanup never clears it, unlike the sibling effect that nulls playerRigidBodyRef on teardown — a stale closure is retained after unmount.
  - _fix:_ Add `useGameStore.setState({ performVerb: null });` to the effect's cleanup return, matching the playerRigidBodyRef teardown.
- ▣✓ 1b75400 **`frontend/src/systems/CombatSystem.jsx:110`** [low·AUTO·src] The death branch re-declares `const store = useGameStore.getState();`, shadowing the identical outer `store` fetched at line 52.
  - _fix:_ Delete the inner `const store = useGameStore.getState();` at line 110 and reuse the outer `store`.
- ▣✓ d539b0b **`frontend/src/utils/combat.js:30`** [low·AUTO·src] Redundant outer Math.round in solveSpellDamage's non-crit branch — finalDmg is already rounded at line 20.
  - _fix:_ Rewrite as `damage: isCrit ? Math.round(finalDmg * 1.8) : finalDmg,` — behaviorally identical, all existing tests still pass.
- ▢ **`frontend/src/workers/ai.worker.js:96`** [low·KEVIN·src] A* uses a Manhattan heuristic while movement allows diagonal moves at cost 1.414, making the heuristic inadmissible (it overestimates diagonal distance), which can yield slightly suboptimal paths. ⟵ **CITE CORRECTED 2026-08-08** (filed as `:81`, now a plain neighbour coord). Live `stepCost` at :96, 8-way neighbours at :74-77.
  - _fix:_ Use an octile/Chebyshev-consistent heuristic, e.g. h = (dx+dz) + (1.414-2)*min(dx,dz) with dx=|nx-endX|, dz=|nz-endZ|, to keep it admissible for diagonal movement. Impact is minor on a 9x9 grid where only the next node is used, so this is a correctness/clarity nicety, not a hot-path fix.
- ▣✓ d539b0b **`src/world/proceduralTextures.js:147`** [low·AUTO·src] The constant `ORES` array (4 objects) is re-allocated inside the per-pixel double loop, so it is rebuilt 1024 times during texture generation instead of once.
  - _fix:_ Hoist the `ORES` array declaration above the `for (y)`/`for (x)` loops (module scope or top of the function).

## Execution batches — files with multiple findings (fix together)

- **`frontend/src/world/Terrain.jsx`** (5): 2×comment-lie, 2×doc-drift, 1×dead-code
- **`frontend/src/world/terrain.worker.js`** (5): 3×dead-code, 1×bug, 1×comment-lie
- **`frontend/src/QuestSystem.jsx`** (5): 5×dead-code
- **`frontend/src/ui/GamePanels.jsx`** (5): 2×dead-code, 1×bug, 1×inconsistency, 1×comment-lie
- **`frontend/src/render/spellVfx.jsx`** (5): 4×comment-lie, 1×dead-code
- **`frontend/src/EnhancedMagicSystem.jsx`** (5): 2×dead-code, 1×comment-lie, 1×bug, 1×inconsistency
- **`frontend/src/Components.jsx`** (4): 2×dead-code, 1×comment-lie, 1×enhancement
- **`frontend/src/SoundManager.jsx`** (4): 3×dead-code, 1×bug
- **`frontend/src/store/useGameStore.jsx`** (3): 2×dead-code, 1×comment-lie
- **`frontend/src/App.jsx`** (3): 3×comment-lie
- **`frontend/src/ui/touchTray.js`** (3): 1×dead-code, 1×inconsistency, 1×doc-drift
- **`frontend/src/workers/ai.worker.js`** (3): 2×bug, 1×enhancement
- **`frontend/scripts/perf/run-scenarios.mjs`** (3): 1×hygiene, 1×comment-lie, 1×enhancement
- **`frontend/src/audio/synthVoices.test.js`** (2): 2×comment-lie
- **`frontend/src/HUD.jsx`** (2): 1×dead-code, 1×doc-drift
- **`frontend/src/GameSystems.jsx`** (2): 1×inconsistency, 1×perf
- **`frontend/src/GameScene.jsx`** (2): 1×dead-code, 1×doc-drift
- **`frontend/src/data/lootTables.js`** (2): 1×comment-lie, 1×doc-drift
- **`frontend/src/game/dayNight.js`** (2): 1×doc-drift, 1×comment-lie
- **`frontend/src/game/hybrids.js`** (2): 1×doc-drift, 1×comment-lie
- **`frontend/src/theme/tokens.js`** (2): 2×dead-code
- **`frontend/src/utils/combat.js`** (2): 1×dead-code, 1×enhancement
- **`src/world/spellUpgrades.js`** (2): 1×inconsistency, 1×dead-code
- **`frontend/src/game/settingsPersist.test.js`** (2): 1×coverage-gap, 1×test-bug
- **`frontend/scripts/visual/drive-mobs.mjs`** (2): 1×hygiene, 1×comment-lie
- **`frontend/scripts/visual/heldf-probe.mjs`** (2): 1×hygiene, 1×inconsistency
- **`frontend/package.json`** (2): 1×security, 1×config-drift
- **`.github/workflows/ci.yml`** (2): 1×security, 1×enhancement
