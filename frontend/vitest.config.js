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
  },
});
