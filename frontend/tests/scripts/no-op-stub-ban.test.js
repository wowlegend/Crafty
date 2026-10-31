import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE NO-OP STUB BAN, DRIVEN THROUGH THE REAL ESLINT CONFIG (deep audit 2026-10-30, lane L10, gate G-ios).
 *
 * eslint.config.js forbids, in scripts/visual and tests/e2e (harnesses that drive a real browser), a function that does
 * nothing put in place of a member: three probes made Chromium look like iOS with `document.exitPointerLock = () => {}`,
 * a function iOS does not have, and the death crash that stub hid shipped (AUDIT:input:ios-death-crash). Each banned
 * shape is linted here as a fixture and must be one error; each allowed neighbour must be none; the three probes that
 * carried the stub must lint clean; and the e2e block, which replaces the raw-git block's rule options for its files,
 * must still forbid raw git.
 *
 * It lives in tests/scripts/ because its subject is a file, the ESLint config. Not covered: a stub written in a shape
 * not listed below, or a jsdom gate (tests/gates), where tests/_support/iosDocument.js models what jsdom lacks.
 *
 * Mutation-Proof: see the commit trailer.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: APP });
const STUB = /no-op stub/;
async function lint(code, rel) {
  const [r] = await eslint.lintText(code, { filePath: join(APP, rel) });
  const fatal = r.messages.filter((m) => m.fatal);
  expect(fatal, `the fixture did not parse: ${fatal.map((m) => m.message)}`).toEqual([]);
  return r.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}
const stubs = async (code, rel = 'scripts/visual/x-probe.mjs') => (await lint(code, rel)).filter((m) => STUB.test(m.message)).length;

const BANNED = [
  'document.exitPointerLock = () => {};',
  'document.exitPointerLock = function () {};',
  'navigator.vibrate = () => undefined;',
  'navigator.vibrate = () => null;',
  'navigator.vibrate = () => void 0;',
  'AudioContext.prototype.resume = () => Promise.resolve();',
  'HTMLMediaElement.prototype.play = function () { return; };',
  'HTMLMediaElement.prototype.play = function () { return null; };',
  'HTMLMediaElement.prototype.play = () => { return Promise.resolve(); };',
  "Object.defineProperty(document, 'pointerLockElement', { get: () => null });",
  "Object.defineProperty(document, 'exitPointerLock', { value: () => {} });",
];

const ALLOWED = [
  ['a deletion, the way to remove an API the target lacks', 'delete Document.prototype.exitPointerLock;'],
  ['a seeded replacement that returns a value', 'Math.random = () => 0.999;'],
  ['an observer that calls through', 'const orig = HTMLMediaElement.prototype.play;\nconst log = [];\n'
    + 'HTMLMediaElement.prototype.play = function (...a) { log.push(1); return orig.apply(this, a); };'],
  ['a getter that answers with a real value', "Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });"],
  ['an empty callback passed, not put in place of a member', "window.addEventListener('blur', () => {});"],
];

describe('ESLint bans a no-op stub in a harness that drives a real browser', () => {
  it.each(BANNED)('in scripts/visual: %s is an error', async (code) => {
    expect(await stubs(code)).toBe(1);
  });

  it.each(BANNED)('in tests/e2e: %s is an error', async (code) => {
    expect(await stubs(code, 'tests/e2e/x.spec.js')).toBe(1);
  });

  it.each(ALLOWED)('allowed: %s', async (_label, code) => {
    expect(await stubs(code)).toBe(0);
    expect(await stubs(code, 'tests/e2e/x.spec.js')).toBe(0);
  });

  it('outside those harnesses the ban does not apply: a jsdom gate models what jsdom lacks', async () => {
    expect(await stubs('document.exitPointerLock = () => {};', 'tests/gates/x-gates.test.js')).toBe(0);
  });

  it('the e2e block still forbids raw git, which its own rule options would otherwise drop', async () => {
    const msgs = await lint("import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['status']);\n", 'tests/e2e/x.spec.js');
    expect(msgs.filter((m) => /raw git/.test(m.message)).length).toBe(1);
  });

  it('the three probes that stubbed Pointer Lock lint clean, and each still removes it', async () => {
    const PROBES = ['scripts/visual/touch-probe.mjs', 'scripts/visual/ipad-probe.mjs', 'scripts/visual/_lookbookPage.mjs'];
    let checked = 0;
    for (const rel of PROBES) {
      const code = readFileSync(join(APP, rel), 'utf8');
      expect(await stubs(code, rel), `${rel} carries a no-op stub`).toBe(0);
      // The presence half: the stub's replacement is there, so a clean lint is not a probe that stopped modelling iOS.
      expect(code, `${rel} no longer removes exitPointerLock`).toMatch(/delete Document\.prototype\.exitPointerLock;/);
      checked += 1;
    }
    expect(checked).toBe(PROBES.length);
  });
});
