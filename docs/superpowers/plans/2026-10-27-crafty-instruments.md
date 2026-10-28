# Instruments — the lookbook probe, a Diagnostics readout, a power A/B (masterpiece Phase 0d)

> Milestone plan under the umbrella `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 0 row 0d), roadmap
> move 1(g) and move 2(g), amended by refute F7 ("proofs need a PROD-reachable read path"). Branch `feat/instruments`.

## Goal frame

- **Goal.** Give the programme three instruments it does not have: (a) frames of the SHIPPED bundle on a REAL GPU with
  motion on, at fixed places and times of day, in Chromium and in WebKit at both iPad viewports; (b) a readout a player
  (or Kevin, on his iPad) can open in production that names the quality tier, the pixel ratio in force, the GL renderer,
  the WebGL context-loss count and the frame cap; (c) a script Kevin runs with sudo that measures GPU and CPU power for
  one build, so two builds can be compared.
- **Metric.** (a) the probe exits 0 only when every target was measured; each shot's JSON row records the renderer, tier,
  dpr, the requested and the actual day-cycle fraction, whether input was live and the player alive, and the console
  errors during that shot; Chromium's renderer string must classify as hardware (not SwiftShader) or the Chromium
  targets are COULD NOT MEASURE (exit 3) unless `--allow-software` is passed. (b) the readout's five fields are driven by
  the real modules in unit gates, and its context-loss count moves on a real `WEBGL_lose_context.loseContext()` in the
  running game (e2e). (c) the parser reads a powermetrics text log into mean and median per rail, prints its denominator,
  and refuses (exit 3) a log with no samples.
- **Strategy.** Everything the probe needs from the page goes through ONE prod-reachable seam that is inert unless the
  page URL carries `?lookbook=1` AND a script calls it; time of day goes through the store's own `setTimeOfDay`, the
  pose through the same early-return pattern capture uses — but nothing else is suppressed.
- **Anti-attack (PASS-but-wrong samples).** A frame shot while the title menu or the resume overlay covers the world
  (input not live) — recorded per shot as `active`, and the shot is marked invalid. A frame shot after the player died
  (death screen) — `isAlive` per shot. A frame at the wrong time of day because the clock kept running (it does; the
  clock is live) — `cycleAtShot` per shot, invalid if it drifted more than 0.01. A "real GPU" claim that was SwiftShader
  — the renderer string is read from the GAME's own context and classified; the classification is a unit gate with a
  SwiftShader string, an ANGLE-Metal string and WebKit's masked string as anchors. **FAIL-but-right:** WebKit masks its
  renderer as "Apple GPU" — that is a hardware renderer and must classify so.

## What the code does today (verified by reading, 2026-10-27)

- `src/render/FrameStats.jsx:21-45` — the Show Stats (F3) overlay draws `"{fps} FPS drawn · {ms} ms"` and nothing else.
  Its text is hardcoded English. `tests/e2e/frame-cap.spec.js` parses `/^(\d+) FPS/` from it, so the first line must keep
  starting with the number.
- `src/GameScene.jsx:258-269` — the context-loss handlers set a boolean (`setIsWebGLContextLost`); there is no count, and
  the flag has no reader (`src/store/useGameStore.jsx:127-128`, grep). The handlers are closures inside `onCreated`, so
  no test can drive them.
- `src/GameScene.jsx:160` computes `capActive`; `:416` mounts `<FrameStats />` with no props.
- `src/index.jsx:61-62` exposes `window.useGameStore` in PRODUCTION too. The test bridge (`src/devtest/testBridge.js:16`),
  the perf probe (`src/devtest/perfProbe.js:25`) and capture mode are DEV-only, so the prod build has no way to pose the
  camera or to make input live without pointer lock.
- `src/Components.jsx:596-605` — capture pins the camera with an early return; capture also turns weather, mobs, NPCs,
  particles and spawning off and pins the sun at noon (`src/render/Atmosphere.jsx:130,246`), which is why its frames
  cannot judge looks.
- `src/systems/PositionTracker.jsx:13-19` mirrors the CAMERA into `playerPosition`, and `src/systems/AIWorkerSystem.jsx:226`
  aims mobs at the camera — so a pinned camera streams terrain and draws mobs around itself.
- `src/game/dayPhase.js:24-31` — `cycleFraction` is DAWN-origin (0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight). The store's
  `setTimeOfDay(t)` takes a MIDNIGHT-origin value (`src/game/dayNight.js:217-222`, `useGameStore.jsx:841-844`). The
  programme's four times (0.30, 0.48, 0.55, 0.75) are `cycleFraction` values (roadmap move 4 says "cycle"), so a
  conversion is needed and is the easiest thing here to get silently wrong.
- `frontend/scripts/visual/ipad-probe.mjs` launches Playwright's default headless Chromium; Playwright runs the
  `chromium-headless-shell` binary for `headless: true` unless `channel: 'chromium'` selects the new headless mode
  (playwright-core 1.64.1 `getExecutableName`, read in `node_modules`; Playwright docs "Chromium: new headless mode").
  Every puppeteer probe forces `--use-angle=swiftshader` (`capture.mjs:357`). No harness here has read a real-GPU frame.
- Headless Chromium refuses pointer lock (`tests/e2e/_boot.js`, `startPlayActive` docblock), so a desktop target cannot
  enter play through the Start button.
- `powermetrics -h` on this Mac (macOS 27.0.1, M3 Max) lists the `cpu_power`, `gpu_power` and `thermal` samplers. Its
  text output carries `CPU Power: N mW`, `GPU Power: N mW` (once per section that reports it),
  `Combined Power (CPU + GPU + ANE): N mW` and, from `thermal`, `Current pressure level: <level>`; each sample opens with
  `*** Sampled system activity ... (N ms elapsed) ***` (three independent published logs agree; the agent cannot run
  it, it needs sudo).

## The change

1. **`src/render/glDiagnostics.js`** (new): `rendererString(ctx)` (unmasked renderer when the debug extension exists, else
   `RENDERER`, else `unknown`); `watchContextLoss(canvas, store)` — the GameScene handlers moved here unchanged, plus a
   session count; `contextLossCount()`; `trackRenderer(gl)` / `glInfo()` for the seam; `diagnosticsLines(...)`, the pure
   readout builder, every label through `t()`.
2. **`src/render/FrameStats.jsx`**: four lines — FPS drawn and ms (unchanged first line), tier · dpr · frame cap, GPU
   renderer, context losses. GameScene passes `capActive`. Pure-read at 4 Hz inside the existing `useFrame`; nothing
   reactive is added.
3. **`src/GameScene.jsx`**: `onCreated` calls `watchContextLoss(canvasEl, useGameStore)` and `trackRenderer(gl)`.
4. **`src/render/lookbookSeam.js`** (new) + one install line in `src/index.jsx`: with `?lookbook=1` it installs
   `window.__craftyLookbook = { pose, clear, setCycle, play, info }`. `pose` stores a camera pose that `Components.jsx`'s
   Player `useFrame` applies right after the capture branch (early return, like capture) and hides the first-person
   hands while it is set; `setCycle` converts a dawn-origin cycle fraction and calls the store's `setTimeOfDay` (a direct
   set, never a half-cycle crossing, so the siege counter does not move); `play` sets the input gate live, as the DEV
   `forcePlay` hook does; `info` reads the facts the probe records. Without the parameter nothing is installed, and with
   it nothing changes until a script calls `pose` — a player who types the parameter sees no difference.
5. **i18n**: `diag.*` keys in en and zh-CN; the cap label reuses `panel.frameRateCapped` / `panel.frameRateUncapped`.
6. **`frontend/scripts/visual/lookbook.mjs`** + `_lookbook.mjs` (pure helpers) + a `PROBE_PORTS` row (4238): serves the
   production build with `vite preview`; resolves a Chromium launch whose GAME renderer is hardware by trying candidates
   in order (new headless, new headless with `--use-angle=metal`, then the headless shell as a recorded control) and
   records every candidate's string; Chromium at 1280x800 dpr 2, WebKit at 1180x820 and 820x1180 with touch; Hearth,
   forest edge, coast, snow terrace at cycle 0.30 / 0.48 / 0.55 / 0.75; writes PNGs, `lookbook.json` and `index.html`
   (contact sheet). `--hold <s>` is the power scenario: one Chromium page entered into play, held for N seconds.
   Exit 0 measured · 3 could not measure, named.
7. **`frontend/scripts/dev/power-ab.sh`** + `power-summary.mjs`: one arm per run (`sh scripts/dev/power-ab.sh <label>`),
   powermetrics sampled for 120 one-second samples after a 20 s warm-up, mean and median per rail, thermal pressure
   counts; `power-summary.mjs A B` prints both arms and the B-A deltas.

The forest-edge pose was located from the world generator itself (`surfaceBlockAt` over a grid, seed 12345): forest at
z <= 58 for x 12..64, plains to the south; the camera stands 12 m above the plains at (36, 56, 92) looking at (36, 47, 50).
The Hearth, coast and snow poses are the capture harness's own (`capture.mjs:486,495,519`).

## TDD, red first

1. `tests/gates/diagnostics-readout-gates.test.js` — `rendererString` against fake contexts (extension present, absent,
   throwing); `watchContextLoss` on a real `EventTarget` with the real store (count moves, `preventDefault` called, flag
   set and cleared); `diagnosticsLines` in en and zh-CN (dpr to two places, cap label both ways, tier names).
   Run, see each fail on the missing module, implement, green.
2. `tests/gates/lookbook-seam-gates.test.js` — the parameter parse (exact `1`, nothing else); install refuses without it;
   `pose` on a real `PerspectiveCamera` (position, look direction, fov) and NaN refused; `setCycle` on the REAL store for
   all four programme times (cycle within one game unit, `isDay` right, `nightCount` unchanged); `play` on the REAL input
   gate; the pinned-subscription fires.
3. `tests/gates/lookbook-plan-gates.test.js` — `_lookbook.mjs`: the renderer classifier (SwiftShader, llvmpipe, ANGLE
   Metal, "Apple GPU", masked "WebKit WebGL"), the candidate pick, the 16-shot plan (four places x the four programme
   times), contact-sheet escaping.
4. `tests/gates/power-summary-gates.test.js` — the parser on a fixture built from the published line shapes; mean and
   median exact; thermal counts; the CLI returns 3 on an empty log; the compare deltas' sign.

Every gate gets `scripts/dev/mutate.sh` receipts: at least one plausible-wrong mutant each and one identity mutant (a
comment edit) that must survive.

## Verification gates

- The offline pipeline through the commit hook (lint, unit suite, build, bundle budget, doc-currency, gate-shape,
  killability-ledger, cli-guard). `tests/scripts/probe-ports.test.js` covers the new port row.
- **Lived proof (e2e, written here, run by the command session on 4179):** `tests/e2e/lookbook-seam.spec.js` — without the
  parameter the seam is absent; with it, `pose` moves the live R3F camera to the pose and `clear` hands it back to the
  player rig; `setCycle(0.75)` puts the sun below the horizon (`sunAboveHorizon` false) and `setCycle(0.30)` back above;
  F3 shows the readout with tier, dpr, GPU and cap; `WEBGL_lose_context.loseContext()` on the game canvas moves both the
  readout's count and `info().contextLosses` to 1.
- **The probe itself, once, at the end** against a production build made in this worktree: the Chromium renderer string
  must not be SwiftShader; frames opened by eye; processes killed and swept.

## Measured (the one allowed probe run, 2026-10-27, build `index-CZasAx0I.js` from commit `c9f07c36`)

These are the run's own readings, true for that build on that machine on that day; re-run rather than quote them.

- **The Chromium GPU mode, verified by the renderer string.** `channel: 'chromium'` (new headless) and the same with
  `--use-angle=metal` both read `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)`; Playwright's
  default headless shell read `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) ...), SwiftShader driver)`.
  The GAME's own renderer (seam `info().gl`) agreed with the about:blank probe. WebKit reads only its masked
  `Apple GPU`, so for WebKit "hardware" is inferred, not proven.
- **48 of 48 shots valid** (16 per target): input live, player alive, no context loss, clock within 0.0033 of the
  asked cycle, 0 console errors and 0 page errors on all three targets. Tier `high` at dpr 2 on all three, including
  the touch targets, whose coarse pointer starts them at `low`: the governor inclined to `high` on this Mac, which says
  nothing about an iPad's GPU.
- **Motion on, seen in the frames:** mobs (spiders, husks with red eyes), NPCs with nametags, motes, rain, onboarding-free
  HUD, and the game's own toasts ("Dusk approaches", "Night 1 — the first siege begins") — the real game, not capture.
- **Observations for the looks lanes, not diagnosed here:** at cycle 0.75 (midnight) the sky renders a saturated orange
  in BOTH Chromium and WebKit (snow-terrace and coast, with rain and Night 1's siege on); at 0.48 the Hearth's stone pad
  reads deep blue in WebKit portrait. The forest-edge pose sits at canopy height (camera y 56 over trees standing on
  y ~44), so a leaf block fills the middle of that frame: raise it (around y 66, z 104) and re-shoot.

## Heat cost

Nothing in play: one module-level null read per Player frame while no pose is set. The readout costs work only while
shown (a `getPixelRatio()` and a string build at 4 Hz; the renderer string is read once). Bundle: a few KB in `index`
against a 760,000 B ceiling (696,924 B on the last main build).

## Risks

- Ranged mobs aim at the camera, so a pinned camera can be shot; the probe records `isAlive` per shot, marks a dead
  shot invalid and calls the store's own `respawn`.
- New headless on macOS may still fall back to SwiftShader; the probe tries candidates and records every renderer
  string rather than assuming, and refuses to call software frames real-GPU frames.
- Pointer lock in headed Chromium (the power scenario) is untested here. AMENDED 2026-10-28 (PR #23 review, item 3):
  the hold no longer uses `play()` in any build — the A/B's baseline build has no seam, so it made the two arms enter
  play differently wherever the click did not lock the pointer. Every arm enters by the click alone, records whether
  the pointer locked (`inPlay`, read from the page in every build) as `scenario:` beside `window:` in meta.txt, and
  `power-summary.mjs` refuses to compare two arms whose lines differ. Whether a headed click locks the pointer on
  Kevin's Mac is answered by the first headed arm's scenario line.
- powermetrics' text format is verified from published logs, not from a run on this Mac; the parser prints its
  denominator and refuses an empty log, and power-ab keeps the raw log beside the summary.
- WebKit on macOS is not iPadOS (same engine and ANGLE-Metal path, not the same GPU, memory or thermals): the lookbook's
  iPad frames show WebKit defects, they do not clear the iPad.
