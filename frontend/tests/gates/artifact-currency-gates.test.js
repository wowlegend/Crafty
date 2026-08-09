import { describe, it, expect } from 'vitest';
import { classify, HARD_LIMIT, validateSource, surfaces, queuedClaims, verifyQueued } from '../../scripts/ci/artifact-currency.mjs';

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

describe('artifact-currency — multiple surfaces (A4)', () => {
  // The second published surface (LOOP-PROGRESS.html) had NO gate and went 17 commits stale while STATUS
  // and CHANGELOG stayed immaculate. Generalizing cost a JSON entry; these pin the normalization, and
  // especially the ARTIFACT-vs-PAGE split, because conflating them manufactures a false failure.

  it('reads the surfaces array', () => {
    const out = surfaces({ surfaces: [{ id: 'a', source: 'x.html', url: 'u' }, { id: 'b', source: 'y.html' }] });
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('still accepts the OLD single-object shape, so an existing state file keeps working', () => {
    const out = surfaces({ url: 'u', source: 'docs/era.html', syncedSha: 'abc' });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('artifact');
    expect(out[0].source).toBe('docs/era.html');
  });

  it('infers kind from the presence of a url — the split that decides which checks run', () => {
    // A `url` means it is published, so drift comes from a RECORDED sha and validateSource applies.
    expect(surfaces({ surfaces: [{ source: 'a.html', url: 'u' }] })[0].kind).toBe('artifact');
    // No url means git knows its last commit, and validateSource must NOT run: it rejects a doctype,
    // which a standalone page legitimately has.
    expect(surfaces({ surfaces: [{ source: 'b.html' }] })[0].kind).toBe('page');
  });

  it('honours an explicit kind over the url inference', () => {
    expect(surfaces({ surfaces: [{ source: 'a.html', url: 'u', kind: 'page' }] })[0].kind).toBe('page');
  });

  it('defaults id to source, so an entry without one is still addressable by --sync', () => {
    expect(surfaces({ surfaces: [{ source: 'docs/x.html', url: 'u' }] })[0].id).toBe('docs/x.html');
  });

  it('drops entries with no source, and handles a missing/!empty state without throwing', () => {
    expect(surfaces({ surfaces: [{ id: 'nope' }, { id: 'ok', source: 'a.html' }] }).map((s) => s.id)).toEqual(['ok']);
    expect(surfaces(null)).toEqual([]);
    expect(surfaces({ surfaces: [] })).toEqual([]);
  });

  it('a standalone page with a doctype would FAIL validateSource — which is why kind gates it', () => {
    // This is the false failure the artifact/page split exists to prevent, pinned so nobody "simplifies"
    // the check into running on every surface.
    expect(validateSource('<!doctype html><title>Progress</title>')).toMatch(/doctype/);
  });
});

// A "Queued" pill is a CLAIM ABOUT THE WORLD — that this work has not shipped — and until now nothing
// checked it. `d90a6b1` sat on the era page marked Queued for a day after it shipped in `2e2da50`, and
// survived a republish whose commit message said "every stat re-measured": true, and beside the point,
// because the stats were in the denominator and the status pills were not. Kevin caught it, having
// raised the general problem more than once already.
//
// AGENTS.md is explicit about what to do when a rule fails repeatedly: escalate to a deterministic layer
// rather than write the sentence again. So a queued row must now declare `data-absent="<path>"` — the
// artifact whose ABSENCE is the reason it is still queued. The moment that path exists, the claim is
// false and the push goes red. It makes "Queued" falsifiable instead of narrative.
describe('queuedClaims — a Queued pill must be falsifiable, and false when the work lands', () => {
  const row = (sha, attr, pill = 'queue') =>
    `<div class="row"><div class="sha">${sha}</div><div class="body"${attr}><div class="t">t</div></div>` +
    `<div class="v"><span class="pill ${pill}"><span class="dot"></span>x</span></div></div>`;

  it('fails a queued row once its declared artifact EXISTS — the case that was missed', () => {
    const claims = queuedClaims(row('d90a6b1', ' data-absent="src/i18n/keyReachability.js"'));
    const r = verifyQueued(claims, () => true); // the file is on disk -> the work shipped
    expect(r.ok).toBe(false);
    expect(r.stale).toEqual([{ sha: 'd90a6b1', path: 'src/i18n/keyReachability.js' }]);
  });

  it('passes a queued row whose declared artifact is genuinely absent', () => {
    const claims = queuedClaims(row('abc1234', ' data-absent="src/not/built/yet.js"'));
    const r = verifyQueued(claims, () => false);
    expect(r.ok).toBe(true);
    expect(r.stale).toEqual([]);
  });

  it('fails a queued row that declares NOTHING — an unfalsifiable claim is the original defect', () => {
    // Without this, the gate is opt-in: anyone could add a Queued row with no attribute and it would
    // pass forever, which is precisely how the page drifted in the first place.
    const r = verifyQueued(queuedClaims(row('nodecl0', '')), () => false);
    expect(r.ok).toBe(false);
    expect(r.undeclared).toEqual(['nodecl0']);
  });

  it('ignores DONE rows — they make no claim about unfinished work', () => {
    expect(queuedClaims(row('done123', ' data-absent="x.js"', 'done'))).toEqual([]);
  });

  it('reports its DENOMINATOR, including the honest zero', () => {
    // There are zero queued rows at the time of writing, so this gate guards nothing TODAY. Saying so is
    // the point: a silent pass over an empty list is the exact shape this repo has shipped seven times.
    const r = verifyQueued([], () => false);
    expect(r.checked).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('finds every queued row, not just the first', () => {
    const html = row('aaa1111', ' data-absent="a.js"') + row('bbb2222', ' data-absent="b.js"');
    expect(queuedClaims(html)).toHaveLength(2);
    expect(verifyQueued(queuedClaims(html), (p) => p === 'b.js').stale).toEqual([
      { sha: 'bbb2222', path: 'b.js' },
    ]);
  });
});
