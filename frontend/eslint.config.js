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

// Raw git in a test (the block that uses it says why). Four call shapes: bare or member callee, string or
// template-literal first argument.
const RAW_GIT = (() => {
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
})();

// A function that does nothing put in place of a member, in a harness that drives a real browser (the block that uses
// it says why): an empty body, or one that only yields null, undefined (`undefined`, `void`, a bare `return`) or
// `Promise.resolve()`, given by assignment or as a property descriptor's value or getter. A function that returns a
// real value is a replacement, not a no-op, and is left alone: `Math.random = () => 0.999` seeds a spec's rolls.
const NO_OP_STUB = (() => {
  const message =
    'a no-op stub hides the path the platform takes: delete an API the target lacks (tests/_support/iosDocument.js ' +
    'says how), keep a real one real, and wrap one you observe so it still calls through';
  const fn = ':matches(ArrowFunctionExpression, FunctionExpression)';
  const yieldsNothing = (at) => [
    `[${at}.type='Literal'][${at}.raw='null']`,
    `[${at}.type='Identifier'][${at}.name='undefined']`,
    `[${at}.type='UnaryExpression'][${at}.operator='void']`,
    `[${at}.type='CallExpression'][${at}.callee.object.name='Promise'][${at}.callee.property.name='resolve'][${at}.arguments.length=0]`,
  ];
  const onlyReturn = "[body.type='BlockStatement'][body.body.length=1][body.body.0.type='ReturnStatement']";
  const nothing = [
    "[body.type='BlockStatement'][body.body.length=0]",
    `${onlyReturn}[body.body.0.argument=null]`,
    ...yieldsNothing('body'),
    ...yieldsNothing('body.body.0.argument').map((n) => `${onlyReturn}${n}`),
  ];
  const assigned = nothing.map((n) => ({ selector: `AssignmentExpression[left.type='MemberExpression'] > ${fn}.right${n}`, message }));
  const described = nothing.map((n) => ({
    selector: `CallExpression[callee.object.name='Object'][callee.property.name='defineProperty'] > ObjectExpression > Property[key.name=/^(value|get)$/] > ${fn}.value${n}`,
    message,
  }));
  return [...assigned, ...described];
})();

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
  // THE POINTER LOCK API, ONLY THROUGH src/input/pointerLock.js. iOS and iPadOS WebKit define no Pointer Lock API (MDN
  // browser-compat-data: safari_ios version_added false), so a bare `document.exitPointerLock()` throws there, and
  // thrown from a React effect it takes the app to the crash page. A lock goes on the game canvas through GameScene's
  // requester, never on document.body (.claude/rules/input-and-pointer-lock.md). Both are crash or stranding classes,
  // so they are errors. The behaviour is gated by tests/gates/pointer-lock-guard-gates.test.jsx and
  // tests/gates/touch-entry-gate.test.js; this rule stops a new bare call before it reaches them.
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/**/*.test.{js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='document'][property.name='exitPointerLock']",
          message: 'release the pointer with releasePointerLock() from src/input/pointerLock.js: iOS has no exitPointerLock',
        },
        {
          selector: "MemberExpression[property.name='requestPointerLock'][object.type='MemberExpression'][object.object.name='document'][object.property.name='body']",
          message: 'lock the game canvas with requestGameLock() from src/input/pointerLock.js, never document.body',
        },
      ],
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
      'no-restricted-syntax': ['error', ...RAW_GIT],
    },
  },
  // NO NO-OP STUBS IN A HARNESS THAT DRIVES A REAL BROWSER (deep audit 2026-10-30, lane L10). Three visual probes
  // stubbed `document.exitPointerLock = () => {}` to make Chromium look like iOS; iOS defines no such function, so the
  // probes ran a path no iPhone runs, and the death crash it hid (AUDIT:input:ios-death-crash) shipped. An API the
  // target lacks is deleted, a real one stays real, and an observed one is wrapped so it calls through. jsdom gates are
  // outside this block: jsdom lacks Web Audio and media playback altogether, and tests/_support/iosDocument.js models
  // them there. A later block's rule options replace an earlier one's, so the e2e block carries RAW_GIT too.
  // Proven by tests/scripts/no-op-stub-ban.test.js.
  {
    files: ['scripts/visual/**/*.{js,mjs}'],
    rules: { 'no-restricted-syntax': ['error', ...NO_OP_STUB] },
  },
  {
    files: ['tests/e2e/**/*.{js,mjs}'],
    rules: { 'no-restricted-syntax': ['error', ...RAW_GIT, ...NO_OP_STUB] },
  },
];
