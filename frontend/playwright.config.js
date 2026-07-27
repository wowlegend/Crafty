import { defineConfig } from '@playwright/test';

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
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
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
