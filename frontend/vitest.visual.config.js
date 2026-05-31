import { defineConfig, configDefaults } from 'vitest/config';

// Visual-regression config. Used ONLY by `npm run test:visual`, which captures
// tests/visual/current/*.png first and then diffs against baselines. The default
// unit config (vitest.config.js) excludes tests/visual/** so `test:unit` stays
// pure and green on a fresh clone (no captured current/ dir); this config opts
// the visual dir back IN since the capture step runs immediately before it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/visual/**/*.test.js'],
    exclude: [...configDefaults.exclude],
    testTimeout: 20000,
  },
});
