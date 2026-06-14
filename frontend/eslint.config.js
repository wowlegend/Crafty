// eslint.config.js — TARGETED crash-class gate (NOT a general style linter).
//
// Purpose: catch the "used-but-undefined identifier" bug-class that froze the game THREE times
// (iters 159/160/161: `lookSensitivity`, `MagicWand`, `_trailDir` — every one a symbol orphaned by
// a byte-exact god-file extraction). The rollup/vite build does NOT catch free-variable references
// to module-locals, and the visual gate only caught them at runtime (after they shipped to main).
// This gate catches the entire class STATICALLY, at commit/CI time.
//
// Only two rules, both `error`:
//   - no-undef              → plain-JS identifier refs   (the _trailDir / lookSensitivity sub-class)
//   - react/jsx-no-undef    → undefined JSX components   (the <MagicWand/> sub-class)
//
// Globals are deliberately PERMISSIVE (browser + worker + node merged). The orphaned app symbols are
// always app-specific names (PascalCase components, _camelCase scratch vars) that appear in NO
// globals list — so a generous allowlist eliminates false positives WITHOUT weakening detection of
// the actual bug-class. This is a crash-class tripwire, not a lint-style opinion.
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react: reactPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.worker, ...globals.node },
    },
    settings: { react: { version: '19.0' } },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
    },
  },
];
