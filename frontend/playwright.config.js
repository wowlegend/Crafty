import { defineConfig } from '@playwright/test';

// THE SUITE DRAWS ITS CANVASES AT PIXEL RATIO 0.5 (2026-10-28). Every spec runs on SwiftShader, a software rasteriser,
// so a frame costs per pixel drawn; tests/e2e/_fixtures.js writes a cap on each page before it loads and both R3F
// canvases (GameScene, TitleDiorama) hand R3F `e2eDpr(theirOwnDpr)` (src/devtest/e2eDpr.js). Viewport, CSS layout, HUD
// and every DOM coordinate are unchanged; only the GL drawing buffer shrinks (640x400 inside the 1280x800 box). A spec
// opts out with `test.use({ e2eDprCap: null })`: perf-siege does (its floor is read at PROBE_DPR), and composer-dpr (it
// asserts the renderer's ratio equals each tier's pixel budget). Each test prints its
// canvases as `[e2e-dpr] ... drawing buffer/CSS box`; smoke asserts the cap took, tests/gates/e2e-dpr-seam-gates that
// both canvases apply it.
// MEASURED ON CI, all green, against main 2bb0857d (runs 40648756061 / 40651588887, the same sha twice):
//   slowest e2e shard 978 / 926 s -> 605 s · the 8 shard jobs summed 5153 / 4698 s -> 2850 s · the workflow 16.4 / 15.5
//   min -> 10.2 min · test time summed 4673 / 4205 s -> 2386 s · touch-hold 648 / 446 s -> 221 s · ore-glow 420 / 366 s
//   -> 156 s · lightning 90 / 96 s -> 49 s (run 40660167239). Readings held: lightning sky 8.3 -> 144.5 vs 8.2 -> 143.4,
//   ore-glow night diamond lift +74.5 vs +83.2 with stone/coal still flat.
// REJECTED, measured the same way: a 640x400 default viewport (run 40661726468) summed the same (2871 s) but its slowest
// shard was 701 s, it left every spec with its own viewport (touch-hold 498 s) at full cost, and it changed what
// ore-glow measures: its stone patch read 56.8 at noon AND at midnight (26.4 / 3.0 at 1280x800), no longer the stone face.

// Gameplay-flow E2E foundation (Option A, 2026-06-28 audit follow-up).
// Runs against `vite dev` because the test bridge (window.__craftyTest) + window.useGameStore
// are DEV-ONLY (tree-shaken in prod). Headless WebGL via swiftshader — mirrors the proven
// scripts/visual/capture.mjs launch config. The puppeteer visual gate stays separate + intact;
// this layer adds gameplay-flow + runtime-error coverage the headless gate never had.
const PORT = 4179; // dedicated port (capture.mjs uses 4178; vite dev default 3000)
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false, // one vite dev + shared in-page game state -> serialize
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  // The `json` reporter exists so `scripts/ci/flaky-report.mjs` can NAME the specs that only passed on a
  // retry. `retries: 2` above means a retry-then-pass concludes the run as `success`, and the conclusion
  // is the only thing anyone reads — which is how two specs stayed flaky for weeks. The github/list
  // reporters print a flaky COUNT but nothing machine-readable, and grepping run logs by hand is what
  // this replaces.
  reporter: process.env.CI
    ? [['github'], ['list'], ['json', { outputFile: 'test-results/results.json' }]]
    : 'list',
  // 120s, not 60s. The shared helpers in tests/e2e/_boot.js declare inner waits of up to 30s
  // (bootDev: store + test bridge) plus 45s (startPlay: isSpawnChunkLoaded) = 75s of legal waiting
  // INSIDE a test — so a 60s per-test budget was structurally impossible to satisfy whenever terrain
  // streaming ran slow. Six specs had already discovered this and set test.setTimeout(150000) or
  // (180000) individually; the other ten inherited 60s and were one slow world-build away from a
  // timeout. smoke.spec.js — the highest-value E2E in the repo — failed on BOTH CI and real hardware
  // for exactly this reason, and it was invisible because the whole e2e job was being killed by its
  // own job timeout before anyone read the result.
  // This raises no assertion threshold and weakens no check: every expect() in the suite is
  // unchanged. It gives a slow machine the wall-clock the helpers already say they may consume.
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: URL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // software WebGL so it renders deterministically headless without a GPU.
      // --expose-gc lets the perf-probe force a full GC around its sampling window so the heap
      // delta is a RETAINED-growth (leak) signal rather than allocation-since-last-scavenge noise.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --no-open`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
