import { describe, it, expect } from 'vitest';
import { classify, HARD_LIMIT, validateSource } from '../../scripts/ci/artifact-currency.mjs';

// Behavioural, not a source-grep: exercises the threshold function directly so gate-shape's
// source-grep ratchet does not rise.

describe('artifact-currency threshold', () => {
  it('at HEAD is current', () => {
    expect(classify(0)).toEqual({ level: 'current', ok: true });
  });

  it('inside the limit it nudges but does not fail the push', () => {
    expect(classify(1).ok).toBe(true);
    expect(classify(HARD_LIMIT).ok).toBe(true);
    expect(classify(HARD_LIMIT).level).toBe('drifting');
  });

  it('past the limit it FAILS — the whole point, since three nudges already went unheeded', () => {
    expect(classify(HARD_LIMIT + 1).ok).toBe(false);
    expect(classify(HARD_LIMIT + 1).level).toBe('stale');
  });

  it('the boundary is pinned from BOTH sides so a check that always passes cannot hide here', () => {
    expect(classify(HARD_LIMIT).ok).toBe(true);
    expect(classify(HARD_LIMIT + 1).ok).toBe(false);
  });

  it('the limit is configurable, so the gate is not welded to one number', () => {
    expect(classify(5, 3).ok).toBe(false);
    expect(classify(2, 3).ok).toBe(true);
  });
});

describe('validateSource — the committed page must be the AUTHORED source', () => {
  // Executes the module's own validator instead of regexing files, so this stays a behavioural gate.
  it('accepts the authored page', () => {
    expect(validateSource('<title>x</title><style>a{}</style><div>hi</div>')).toBeNull();
  });

  it('rejects a fetched copy of the PUBLISHED page — re-committing one nests the shell in itself', () => {
    expect(validateSource('<!doctype html><html><head><script>window.__FRAME_PREAMBLE={}</script></head><title>x</title>'))
      .toMatch(/publish-shell runtime|doctype/);
  });

  it('rejects a page with no title, and empty input', () => {
    expect(validateSource('<div>no title</div>')).toMatch(/title/);
    expect(validateSource('')).toMatch(/title/);
  });
});
