# W2-J phase 2: one browser stack, and the CLI guard Node already has (2026-10-29)

Lane W2-J of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, rows 39 (one browser stack) and 37 (cli-guard
replaced by `import.meta.main`). Branch `chore/w2j-one-browser`, cut from main `1691217b`. Phase 1 is
`docs/superpowers/plans/2026-10-28-crafty-w2j-phase1.md`. Section 5 of the reset plan keeps prod-smoke (on
Playwright) in the roster of about 10 gates and drops cli-guard; this phase does both halves of that.

## Goal frame

**Goal.** One browser library in the repo (Playwright), with every check prod-smoke makes today intact, and the
"importing a script never runs its CLI" protection held by Node's own `import.meta.main` plus a test that executes it,
in place of a 132-line AST checker that accepts guards that gate nothing (registry STATUS:G-ledger:22).

**Metric.**
1. `package.json` and `package-lock.json` carry no `puppeteer`, and no tracked file under `frontend/` imports it.
2. prod-smoke on Playwright's bundled Chromium (SwiftShader, as now) prints the same nine verdict lines on CI on the
   PR's head sha, and `tests/gates/prod-smoke-gates.test.js` and `tests/scripts/gl-error-ledger.test.js` pass.
3. The new run-by-path test goes red when one exporting script's `if (import.meta.main)` is removed, and when the guard
   is made always-true (the G-ledger:22 mutants), and stays green on an identity mutant.
4. `ci/pipeline.sh` has no cli-guard step; the generated gate tables say so.

**Anti-attack (GF-L2).**
- A port that drops a check passes "prod-smoke is green". So the before/after table below lists each verdict line, and
  CI's log on the head sha must print every one.
- A run-by-path test that only parses source repeats cli-guard's blind spot (a guard that is always true when imported
  reads as a guard). So the test IMPORTS every exporting script in a child node process with every side-effecting API
  trapped, and asserts nothing was called; it does not read guard syntax at all.
- `import.meta.main` is `undefined` before Node 24.2.0, which would make every guarded CLI silently do nothing and
  exit 0, a gate that cannot fail. So the test also RUNS scripts by path (a fixture, through a symlink too, and a real
  read-only gate) and asserts the CLI ran, and `engines.node` rises to `>=24.2.0`.
- Deleting a probe a live lane still names breaks that lane's plan. So each deletion below names its last real use and
  the live docs that cite it; any probe a current lane plan or a live rule names is ported, not deleted.

## Facts (re-measured 2026-10-29)

- `git grep -il puppeteer` lists 102 tracked files, not 37: 29 scripts import it (`prod-smoke.mjs`,
  `run-scenarios.mjs` and 27 under `scripts/visual/`), and the rest are docs and comments.
- The reset plan's "the 7 test files that import them" does not hold: no test imports puppeteer or a probe this phase
  deletes. The three gates the brief names (atmosphere-isolation, bundle-split, spell-vfx) mention puppeteer only in
  comments, about a visual gate that W2-B already retired.
- Node is v24.13.0 locally; CI's `node-version: 24` floats to the latest 24.x. `import.meta.main` landed in Node 24.2.0
  (Node CHANGELOG_V24, 2025-06-09; `doc/api/esm.md`, stability 1.0). Measured here: `true` by path and through a
  symlinked path, `false` when imported, and `undefined` inside a vitest 4.1.12 worker.
- The prod-smoke flake "COULD NOT CHECK — 5 of 89 gave no LINK_STATUS" (CI run 40814659930, attempt 1; attempt 2
  read all 89 linked): five is the title diorama's program count (toon, emissive and ink-hull mascot materials, the
  additive motes, the plinth: `src/render/TitleDiorama.jsx`, `src/render/mascots/voxelKit`). R3F unmounts a Canvas
  by calling `forceContextLoss()` 500 ms after the commit and only then disposes the scene
  (`@react-three/fiber` `unmountComponentAtNode`), so three's `deleteProgram` runs on a lost context and every
  status read on those programs returns null. Whether the title has unmounted by the read is a race with SwiftShader's
  speed: the probe's reading, not the bundle. Fix in the port (below).

## Per-probe decision

Ported means moved to `@playwright/test`'s `chromium` with the same checks. Deleted means no live doc, gate, script or
current lane plan calls it; its last real use is the last commit that changed what it does (the 2026-08-12 port
allocation, the 2026-08-09 headless flag and the 2026-10-28 capture-oracle retirement were sweeps over all probes).

| Script | Decision | Why |
|---|---|---|
| `scripts/ci/prod-smoke.mjs` | ported | CI gate (row 39) |
| `scripts/perf/run-scenarios.mjs` | ported | row 39; `npm run perf:m2`, named by the lantern and feedback-grammar plans |
| `gpu-cost-probe.mjs` | ported | coast-water, lantern, material-grammar, shadow-dragon, steady-cool and feedback-grammar plans run it |
| `pov-probe.mjs` | ported | lantern, light-colour-script and material-grammar plans run it |
| `ocean-probe.mjs` | ported | coast-water plan Task 9 runs it |
| `touch-probe.mjs` | ported | reset plan section 4 keeps it; the only lived check of the touch rings (OI-54) |
| `look-e2e.mjs` | ported | `npm run test:look`, named by `.claude/rules/physics.md`; no e2e spec moves the mouse under lock and reads the camera |
| `ambient-floor-probe.mjs` | deleted | one use, 2026-09-22 (8e1c17ac), answered in sota-2026-09 |
| `dayphase-probe.mjs` | deleted | last real use 2026-08-02 (data-testid sweep); the day-phase dial shipped 2026-06-16 |
| `death-probe.mjs` | deleted | last real use 2026-07-21; Death overlay shipped 2026-06-16 |
| `drive-elemancer.mjs`, `drive-mobs.mjs` | deleted | reset plan section 6 deletes them; last real use 2026-07-21 |
| `esc-pause-probe.mjs` | deleted | last real use 2026-07-21; esc-resume-recovery.test.jsx and the panel-state gate hold the behaviour |
| `godrays-probe.mjs` | deleted | one question, answered 2026-09-22 (OI-03b) |
| `grass-probe.mjs`, `grass-swatch-probe.mjs` | deleted | last real use 2026-08-08; the lookbook reads grass at eye level |
| `hands-probe.mjs`, `heldf-probe.mjs` | deleted | last real use 2026-06-17; heldf's premise is stale (OI-52) |
| `hub-probe.mjs`, `hud-probe.mjs` | deleted | last real use 2026-06-18 |
| `magic-panel-probe.mjs`, `quest-log-probe.mjs`, `settings-probe.mjs` | deleted | last real use 2026-06-16 to 2026-06-18 |
| `mobdeath-probe.mjs`, `spell-elements-probe.mjs`, `soulbind-eyes-probe.mjs` | deleted | last real use 2026-06-17 to 2026-08-02 |
| `pause-resume-probe.mjs` | deleted | last real use 2026-08-05; the pause e2e and panel-state gate hold it |
| `spawn-legibility-probe.mjs`, `storm-probe.mjs` | deleted | last real use 2026-06-18 |

`_serve.mjs` and `_probe.mjs` stay (their puppeteer mentions are a comment and a JSDoc type). `PROBE_PORTS` loses the
deleted entries; `tests/scripts/probe-ports.test.js` asserts the table and directory agree, so its `> 20` floors become
the measured count.

## prod-smoke: before and after

Each line is a verdict prod-smoke prints and fails on today; each stays, under `chromium.launch({ channel: 'chromium',
headless: true, args: ['--use-angle=swiftshader'] })` (Chromium's new headless, which is what puppeteer 25's
`headless: true` ran; Playwright passes `--enable-unsafe-swiftshader` and `--no-sandbox` itself).

| Check | Before (puppeteer) | After (Playwright) |
|---|---|---|
| boot | `waitForSelector('canvas, [data-testid="title-diorama"]')` | same selector, `state: 'attached'` (puppeteer's default) |
| render | at least 1 rAF frame in 4 s | same |
| GL context | no lost context on any canvas | same |
| console | `console.error` and `pageerror` through `isFatalMessage` | same events, same filter |
| GL errors | `getError()` drained per frame against the ledger | same |
| mip chain | `evaluateOnNewDocument(installArrayTextureRecorder)`, `mipVerdict` | `addInitScript`, same verdict |
| settings persistence | sfxVolume round-trip through localStorage | same |
| lookbook seam | absent plain, present with `?lookbook=1`, pass timer loads | same |
| every program links, watched drawn with uniforms | `programVerdict` | same, plus the fix below |
| post chain at tier high | `chainVerdict` | same |

**The LINK_STATUS fix.** The recorder reads each program's status at its first `useProgram` (three has already read
it there, so nothing new stalls) and records each context the page loses on purpose through
`WEBGL_lose_context.loseContext()`. A program whose live status is unreadable takes its first-use status when its
context was discarded by the page; one on a context lost any other way still reads COULD NOT CHECK. A program on a
discarded context that was never used is counted apart and named in the line, never as linked.

## cli-guard replacement

- Every guard form in `scripts/**` (`process.argv[1]` equality, `.endsWith(...)`, `invokedDirectly()` with realpath)
  becomes `if (import.meta.main)`, by a babel-AST codemod over the top-level `if` and its guard binding, unused
  imports removed after (eslint `no-unused-vars` is the check).
- `tests/scripts/cli-entry.test.js`: (a) one child `node` process imports every exporting `.mjs` under `scripts/`
  with `process.exit`, console, stdout/stderr, `child_process`, fs writes and `fetch` trapped; any call fails the test,
  naming the script; the denominator is asserted. (b) A fixture runs by path, through a symlink, and imported. (c) Real
  read-only gates run by path and print their verdict line. (d) `engines.node`'s floor is at least 24.2.0.
- Delete `scripts/ci/cli-guard.mjs`, `tests/scripts/cli-guard.test.js`, the `ci/pipeline.sh` step and the
  `gate-table.mjs` description once (a) to (d) hold; regenerate the gate tables (`gate-table.mjs --write`).
- `engines.node`: `>=24.2.0 <25`.

## Tasks

| # | Task | Done when |
|---|---|---|
| 1 | This task script, committed | commit on the branch |
| 2 | prod-smoke on Playwright, with the LINK_STATUS fix and its tests | prod-smoke-gates red on each mutant below, green after |
| 3 | run-scenarios, gpu-cost, pov, ocean, touch, look-e2e on Playwright | `node --check`, and one local run each where the load allows (lock dir) |
| 4 | Delete the 22 stale probes, their PROBE_PORTS rows, opsec-ledger rows; probe-ports floors | probe-ports green; mutant red |
| 5 | Remove puppeteer from package.json and the lock; kill-test-procs patterns; CI gates job installs Chromium | `npm ls puppeteer` empty in a scratch lock copy |
| 6 | `import.meta.main` codemod; engines; cli-entry test; delete cli-guard and its step | cli-entry red on the mutants, green after |
| 7 | Docs: CLAUDE.md, rule files, DECISIONS entry, registry rows | doc-currency green |
| 8 | VERIFY list, merge origin/main, push, PR, CI on the head sha | `ci ok` green on the exact sha |

## Mutations owed (the `Mutation-Proof:` trailers)

- prod-smoke-gates: drop the first-use capture (the discarded-context case goes red); treat every lost context as
  discarded (the foreign-loss case goes red); identity.
- probe-ports: an orphaned PROBE_PORTS row; a probe file with no row; identity.
- cli-entry: delete one script's `if (import.meta.main)`; make one guard `if (import.meta.main || true)`; make one
  guard `if (process.argv[1])` (the G-ledger:22 shape: true in any child that names a script); identity.

## Not proven by this phase

- That the ported manual probes behave as before on every path: each is run once locally at most, under the load gate.
- The real-GPU WebGL storm: prod-smoke runs SwiftShader, as before.
