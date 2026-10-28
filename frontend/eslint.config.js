// eslint.config.js — TARGETED crash-class gate (NOT a general style linter).
//
// Purpose: catch the "used-but-undefined identifier" bug-class that froze the game THREE times
// (iters 159/160/161: `lookSensitivity`, `MagicWand`, `_trailDir` — every one a symbol orphaned by
// a byte-exact god-file extraction). The rollup/vite build does NOT catch free-variable references
// to module-locals, and the visual gate only caught them at runtime (after they shipped to main).
// This gate catches the entire class STATICALLY, at commit/CI time.
//
// Crash-class rules (`error`):
//   - no-undef              → plain-JS identifier refs   (the _trailDir / lookSensitivity sub-class)
//   - react/jsx-no-undef    → undefined JSX components   (the <MagicWand/> sub-class)
// Dead-code rule (`error` since 2026-07-27 — the holistic-review sweep cleared all ~80 flagged unused
// imports/vars/args across 6 batches; the ONE surviving exception is InputManager's `setActive`, which
// input-abstraction-gates.test.js REQUIRES to be imported, carried on a justified
// `eslint-disable-next-line` that names the gate):
//   - no-unused-vars        → dead imports / vars / args (varsIgnorePattern '^_' for intentional scratch)
//   - react/jsx-uses-vars + jsx-uses-react keep JSX-referenced components + the React import from
//     false-flagging under no-unused-vars.
//
// Globals are deliberately PERMISSIVE (browser + worker + node merged). The orphaned app symbols are
// always app-specific names (PascalCase components, _camelCase scratch vars) that appear in NO
// globals list — so a generous allowlist eliminates false positives WITHOUT weakening detection of
// the actual bug-class. This is a crash-class tripwire, not a lint-style opinion.
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';

export default [
  // The app source. Full crash-class + dead-code rules.
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
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  // The HARNESS — scripts/ (visual probes, perf runner, CI scripts) and tests/. Added 2026-07-27.
  //
  // WHY: this gate exists because four ReferenceError crashes shipped to main from byte-exact god-file
  // extractions — and for two weeks it did not cover the 28 script files that PRODUCE every visual, perf
  // and CI verdict, nor the 330 test files that are the verdict. A crash in a probe or a CI script is
  // exactly as capable of shipping a false GREEN as a crash in src/, and it is less likely to be noticed
  // because nobody looks at a harness that "passed".
  //
  // Scoped to the crash class only (`no-undef`). Deliberately NOT `no-unused-vars`: an unused local in a
  // throwaway probe is not a crash risk, and turning it on here would manufacture a cleanup backlog whose
  // only effect is noise. This landed with ZERO findings across all 265 files — verified, and
  // mutation-proven by injecting an undefined symbol into a probe and watching it go RED.
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
        // vitest/playwright inject these; they are real at runtime, so they are not "undefined".
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', vi: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  // RAW GIT IN A TEST — forbidden. Added 2026-10-27 (harness plan U8).
  //
  // WHY: git exports GIT_DIR and friends to every hook, and the hooks run this suite. A test that shells out to git
  // with the inherited environment talks to the CALLER's repository; in a linked worktree GIT_DIR is absolute, and on
  // 2026-10-27 a fixture suite run that way re-initialised the main checkout `core.bare = true`. Tests use
  // `fixtureGit` / `isolatedGitEnv` from tests/scripts/_isolatedGit.js, the one sanctioned site. Four call shapes:
  // bare or member callee, string or template-literal first argument. Proven by tests/scripts/git-env-scrub.test.js.
  {
    files: ['tests/**/*.{js,jsx,mjs}', 'src/**/*.test.{js,jsx}'],
    ignores: ['tests/scripts/_isolatedGit.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...(() => {
          const exec = '/^(execFileSync|execSync|spawnSync|spawn|execFile|exec)$/';
          const git = '/^git(\\s|$)/';
          const message =
            "raw git in a test runs against the CALLER's repo inside a hook — use fixtureGit / isolatedGitEnv (tests/scripts/_isolatedGit.js)";
          const literal = `[arguments.0.type='Literal'][arguments.0.value=${git}]`;
          const template = `[arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=${git}]`;
          return [
            { selector: `CallExpression[callee.name=${exec}]${literal}`, message },
            { selector: `CallExpression[callee.property.name=${exec}]${literal}`, message },
            { selector: `CallExpression[callee.name=${exec}]${template}`, message },
            { selector: `CallExpression[callee.property.name=${exec}]${template}`, message },
          ];
        })(),
      ],
    },
  },
];
