import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // plugin-react supplies the automatic JSX runtime under test (mirrors vite.config.js);
  // without it, esbuild's classic transform throws "React is not defined" in .jsx tests.
  plugins: [react({ include: '**/*.{js,jsx}' })],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    exclude: [...configDefaults.exclude, 'tests/visual/**'],
    testTimeout: 20000,
  },
});
