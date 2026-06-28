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
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: URL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // software WebGL so it renders deterministically headless without a GPU
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --no-open`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
