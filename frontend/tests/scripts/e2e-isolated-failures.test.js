import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedFailureTracker, gameEntryOf, PRODUCER_PATH, ISOLATED_PREFIX } from '../e2e/_isolatedFailures.js';
import { workerClosure } from '../../scripts/ci/runtime-reach.mjs';

/**
 * What every e2e test collects from its page while it runs, and its verdict at the end (tests/e2e/_fixtures.js).
 * A Playwright fixture cannot run in the unit suite, so the tracker the fixture feeds is driven here with what a page
 * sends it: the console lines it prints and the requests it makes. Cases: a clean game page, failures before and after
 * a reload, a game page whose instrument never loaded, a page that is not the game, other console lines. The producer
 * half (src/game/isolatedEffects.js prints each failure under the prefix read here) is
 * tests/gates/isolated-failures-gates.test.jsx.
 *
 * The tracker only listens: the fixture reads console events and requests, never calls into the page, because a call
 * into the page is a user gesture there (Playwright delivers a binding's result with Runtime.callFunctionOn and
 * userGesture: true, playwright-core 1.64.1 lib/coreBundle.js), and a page handed a gesture at boot starts its music
 * before any key press (CI run 41226199357, music-bus.spec.js).
 *
 * SITED IN tests/scripts/, not tests/gates/: the subject is a Playwright helper file under tests/e2e/ and the HTML entry
 * it reads; the check drives the helper and reads index.html and the entry's import graph, no game behaviour.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = '/src/index.jsx';
const at = (path) => `http://localhost:4179${path}`;
const loaded = (t) => { t.onRequest(at('/src/index.jsx')); t.onRequest(at(`${PRODUCER_PATH}?t=1`)); };
const thrown = (where, message) => ['error', `${ISOLATED_PREFIX}${where}: Error: ${message}\n    at x (http://localhost:4179/src/a.js:1:1)`];

describe('isolatedFailureTracker — what one test collected, across every load of its page', () => {
  it('a game page that loaded the instrument and printed no failure reads 0, with the loads it counted (it can see a zero)', () => {
    const t = isolatedFailureTracker(ENTRY);
    loaded(t);
    const v = t.verdict('a test');
    expect(v.problem).toBeNull();
    expect(v.line).toBe('[isolated-failures] 0 over 1 page load(s) · a test');
  });

  it('a failure before a reload is kept: the count is the test\'s, not the last document\'s', () => {
    const t = isolatedFailureTracker(ENTRY);
    loaded(t);
    t.onConsole(...thrown('the mobKill event', 'quest reactor threw'));
    loaded(t); // the reload: the page's module state starts again at 0, the tracker does not
    const v = t.verdict('context-loss');
    expect(v.problem).toContain('1 isolated failure(s) while this test ran');
    expect(v.problem).toContain('over 2 page load(s)');
    expect(v.problem).toContain('the mobKill event: Error: quest reactor threw');
    expect(v.problem, 'the stack is not the message').not.toContain('    at x');
    expect(v.line).toContain('[isolated-failures] 1 over 2 page load(s)');
  });

  it('every failure counts and the last one is named', () => {
    const t = isolatedFailureTracker(ENTRY);
    loaded(t);
    t.onConsole(...thrown('a', 'one'));
    t.onConsole(...thrown('b', 'two'));
    expect(t.verdict('x').problem).toMatch(/^2 isolated failure\(s\).*the last: b: Error: two/);
  });

  it('a game page whose instrument never loaded is unread, and unread is a failure', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx?t=1730000000000'));
    const v = t.verdict('boot');
    expect(v.problem, 'an unread game page passed').toContain('never loaded');
    expect(v.line).toContain('unread');
  });

  it('a page that never requested the game entry is not a game page: printed as such, and no failure', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/tests/e2e/_fog-probe.html'));
    t.onRequest(at('/src/render/fogShader.js'));
    const v = t.verdict('fog');
    expect(v.problem).toBeNull();
    expect(v.line).toBe('[isolated-failures] not a game page (/src/index.jsx was never requested) · fog');
  });

  it('a page that is not the game but loads the instrument is read like any other', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at(PRODUCER_PATH));
    t.onConsole(...thrown('probe', 'x'));
    expect(t.verdict('probe').problem).toContain('1 isolated failure(s)');
  });

  it('another console line, a warning with the prefix, or a near-miss path is not a failure or a load', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx'));
    t.onRequest(at('/src/game/isolatedEffects.jsx'));
    t.onRequest(at('/src/game/isolatedEffects.js.map'));
    for (const [type, text] of [['error', 'TypeError: x'], ['warning', `${ISOLATED_PREFIX}a: b`], ['log', `${ISOLATED_PREFIX}a: b`], ['error', `an ${ISOLATED_PREFIX}a`], [undefined, undefined]]) t.onConsole(type, text);
    expect(t.verdict('x').problem, 'a line of another kind counted, or a near-miss path loaded the instrument').toContain('never loaded');
  });

  it('two tests do not share a count', () => {
    const a = isolatedFailureTracker(ENTRY);
    const b = isolatedFailureTracker(ENTRY);
    loaded(a);
    a.onConsole(...thrown('a', 'x'));
    loaded(b);
    expect(a.verdict('a').problem).not.toBeNull();
    expect(b.verdict('b').problem).toBeNull();
  });

  it('a tracker with no game entry cannot tell a game page and fails every test', () => {
    const t = isolatedFailureTracker(null);
    loaded(t);
    expect(t.verdict('x').problem).toContain('no game entry');
  });
});

describe('the game entry and the producer on it', () => {
  it('gameEntryOf reads the module script index.html loads, and null when there is none', () => {
    expect(gameEntryOf('<html><body><script type="module" src="/src/index.jsx"></script></body></html>')).toBe('/src/index.jsx');
    expect(gameEntryOf('<script src="/legacy.js"></script>')).toBeNull();
  });

  it('the real index.html names the entry the tracker listens for', () => {
    expect(gameEntryOf(readFileSync(join(APP, 'index.html'), 'utf8'))).toBe(ENTRY);
  });

  it('the producer path is a src module, in the entry\'s static import graph, so every game page fetches it', () => {
    const rel = PRODUCER_PATH.replace(/^\//, '');
    expect(existsSync(join(APP, rel)), `${rel} is not a file`).toBe(true);
    const read = (p) => { try { return readFileSync(join(APP, p), 'utf8'); } catch { return null; } };
    const closure = workerClosure(['src/index.jsx'], read);
    expect(closure.size, 'the import graph came back empty').toBeGreaterThan(300);
    expect([...closure]).toContain(rel);
  });
});
