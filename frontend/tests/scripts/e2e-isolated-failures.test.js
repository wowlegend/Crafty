import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedFailureTracker, gameEntryOf } from '../e2e/_isolatedFailures.js';
import { workerClosure } from '../../scripts/ci/runtime-reach.mjs';

/**
 * What every e2e test collects from its page while it runs, and its verdict at the end (tests/e2e/_fixtures.js).
 * A Playwright fixture cannot run in the unit suite, so the tracker the fixture feeds is driven here with the events and
 * requests a page sends: a clean game page, failures before and after a reload, a game page whose instrument never armed,
 * a page that is not the game. The producer half (src/game/isolatedEffects.js arms and reports through the binding) is
 * tests/gates/isolated-failures-gates.test.jsx.
 *
 * SITED IN tests/scripts/, not tests/gates/: the subject is a Playwright helper file under tests/e2e/ and the HTML entry
 * it reads; the check drives the helper and reads index.html and the entry's import graph, no game behaviour.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = '/src/index.jsx';
const at = (path) => `http://localhost:4179${path}`;
const armed = { kind: 'armed' };
const failure = (where, message) => ({ kind: 'failure', where, message });

describe('isolatedFailureTracker — what one test collected, across every load of its page', () => {
  it('a game page that armed and reported nothing reads 0, with the loads it counted (the case that proves it can see a zero)', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx'));
    t.onEvent(armed);
    const v = t.verdict('a test');
    expect(v.problem).toBeNull();
    expect(v.line).toBe('[isolated-failures] 0 over 1 page load(s) · a test');
  });

  it('a failure before a reload is kept: the count is the test\'s, not the last document\'s', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx'));
    t.onEvent(armed);
    t.onEvent(failure('the mobKill event', 'quest reactor threw'));
    t.onEvent(armed); // the reload: the page's module state starts again at 0, the tracker does not
    const v = t.verdict('context-loss');
    expect(v.problem).toContain('1 isolated failure(s) while this test ran');
    expect(v.problem).toContain('over 2 page load(s)');
    expect(v.problem).toContain('the mobKill event: quest reactor threw');
    expect(v.line).toContain('[isolated-failures] 1 over 2 page load(s)');
  });

  it('every failure counts and the last one is named', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onEvent(armed);
    t.onEvent(failure('a', 'one'));
    t.onEvent(failure('b', 'two'));
    expect(t.verdict('x').problem).toMatch(/^2 isolated failure\(s\).*the last: b: two/);
  });

  it('a game page whose instrument never armed is unread, and unread is a failure', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx?t=1730000000000'));
    const v = t.verdict('boot');
    expect(v.problem, 'an unread game page passed').toContain('never reported in');
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
    t.onEvent(armed);
    t.onEvent(failure('probe', 'x'));
    expect(t.verdict('probe').problem).toContain('1 isolated failure(s)');
  });

  it('an event of another shape is ignored, not counted', () => {
    const t = isolatedFailureTracker(ENTRY);
    t.onRequest(at('/src/index.jsx'));
    for (const e of [null, undefined, 'armed', { kind: 'other' }, { kind: 'failure' }]) t.onEvent(e);
    expect(t.verdict('x').problem, 'a malformed event armed the tracker or counted').toContain('never reported in');
  });

  it('two tests do not share a count', () => {
    const a = isolatedFailureTracker(ENTRY);
    const b = isolatedFailureTracker(ENTRY);
    a.onEvent(armed);
    a.onEvent(failure('a', 'x'));
    b.onEvent(armed);
    expect(a.verdict('a').problem).not.toBeNull();
    expect(b.verdict('b').problem).toBeNull();
  });

  it('a tracker with no game entry cannot tell a game page and fails every test', () => {
    const t = isolatedFailureTracker(null);
    t.onEvent(armed);
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

  it('src/game/isolatedEffects.js is in the entry\'s static import graph, so every game page loads the instrument', () => {
    const read = (p) => { try { return readFileSync(join(APP, p), 'utf8'); } catch { return null; } };
    const closure = workerClosure(['src/index.jsx'], read);
    expect(closure.size, 'the import graph came back empty').toBeGreaterThan(300);
    expect([...closure]).toContain('src/game/isolatedEffects.js');
  });
});
