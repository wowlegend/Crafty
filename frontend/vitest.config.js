import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // plugin-react supplies the automatic JSX runtime under test (mirrors vite.config.js);
  // without it, esbuild's classic transform throws "React is not defined" in .jsx tests.
  plugins: [react({ include: '**/*.{js,jsx}' })],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    // tests/e2e/** are Playwright specs (*.spec.js, import @playwright/test) — never run by vitest
    exclude: [...configDefaults.exclude, 'tests/visual/**', 'tests/e2e/**'],
    testTimeout: 20000,
    // COVERAGE IS AN INSTRUMENT HERE, NOT A GATE — and deliberately has NO thresholds.
    //
    // 113 of the 131 gate tests read their target as TEXT and execute none of it, so a 2,559-test headline
    // says little about how much of the app is ever run. Nothing in this repo could answer "which src
    // modules does no test touch". This can. It CANNOT answer whether the GAME reaches a line — that is the
    // dead-on-arrival class, and coverage is structurally blind to it.
    //
    // No ratchet, on purpose: a coverage threshold rewards EXECUTION, while gate-shape.mjs (already a
    // pre-push gate) exists to reject assertions satisfied without verifying anything. Ratcheting coverage
    // would push the corpus toward exactly the tests gate-shape is there to reject.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/**/__mocks__/**'],
    },
  },
});
