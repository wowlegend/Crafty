import { describe, it, expect } from 'vitest';
import { readIsolatedFailures, isolatedFailureLine, isolatedFailureProblem } from '../e2e/_isolatedFailures.js';

/**
 * What every e2e test asks the page at its end: how many isolated reactors or effects threw (tests/e2e/_fixtures.js).
 * A Playwright fixture cannot run in the unit suite, so the read, the printed line and the verdict are three functions
 * driven here with a fake page, in the cases the fixture meets: a clean page, a page with failures, a page that did
 * not answer, a page that threw on the read, and a page without the counter.
 *
 * SITED IN tests/scripts/, not tests/gates/: the subject is a Playwright helper file under tests/e2e/ that no gate
 * imports, and the check imports it and drives it, reading no source text.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */

// Playwright's page.evaluate(fn) runs fn in the page; here fn runs against a fake window.
const pageWith = (win) => ({ evaluate: async (fn) => { globalThis.window = win; try { return fn(); } finally { delete globalThis.window; } } });

describe('readIsolatedFailures — the page\'s counter, or null when it cannot be read', () => {
  it('reads a clean page as a count of 0 (the case that proves the read can see a zero)', async () => {
    expect(await readIsolatedFailures(pageWith({ __isolatedFailures: { count: 0, last: '' } }))).toEqual({ count: 0, last: '' });
  });

  it('reads a page with failures as its count and last message', async () => {
    expect(await readIsolatedFailures(pageWith({ __isolatedFailures: { count: 3, last: 'sound: no audio' } }))).toEqual({ count: 3, last: 'sound: no audio' });
  });

  it('a page without the counter is unread (null), never read as 0', async () => {
    expect(await readIsolatedFailures(pageWith({}))).toBeNull();
    expect(await readIsolatedFailures(pageWith({ __isolatedFailures: 'x' }))).toBeNull();
    expect(await readIsolatedFailures(pageWith({ __isolatedFailures: { count: '2' } }))).toBeNull();
  });

  it('a page that throws on the read (closed, crashed) is unread, not a throw', async () => {
    const dead = { evaluate: async () => { throw new Error('Target page, context or browser has been closed'); } };
    expect(await readIsolatedFailures(dead)).toBeNull();
  });

  it('a page that does not answer inside the bound is unread, and the read returns', async () => {
    const hung = { evaluate: () => new Promise(() => {}) };
    const t0 = Date.now();
    expect(await readIsolatedFailures(hung, 30)).toBeNull();
    expect(Date.now() - t0, 'the read waited on the page instead of the bound').toBeLessThan(2000);
  });
});

describe('isolatedFailureProblem — the error a test ends with', () => {
  it('is null for an unread page and for a count of 0: nothing to raise', () => {
    expect(isolatedFailureProblem(null)).toBeNull();
    expect(isolatedFailureProblem({ count: 0, last: '' })).toBeNull();
  });

  it('names the count and the last failure when the page counted any', () => {
    const p = isolatedFailureProblem({ count: 2, last: 'the mobKill event: boom' });
    expect(p).toContain('2 isolated failure(s)');
    expect(p).toContain('the mobKill event: boom');
  });

  it('a single failure is enough', () => {
    expect(isolatedFailureProblem({ count: 1, last: 'x' })).not.toBeNull();
  });
});

describe('isolatedFailureLine — the denominator a test prints', () => {
  it('prints the count, and says "unread" for a page that could not be read', () => {
    expect(isolatedFailureLine({ count: 0, last: '' }, 'a test')).toBe('[isolated-failures] 0 · a test');
    expect(isolatedFailureLine({ count: 4, last: 'x' }, 'a test')).toContain('[isolated-failures] 4');
    expect(isolatedFailureLine(null, 'a test')).toContain('unread');
  });
});
