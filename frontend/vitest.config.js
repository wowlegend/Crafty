import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: [...configDefaults.exclude, 'tests/visual/**'],
    testTimeout: 20000,
  },
});
