import { describe, it, expect } from 'vitest';
import {
  classify, driftVerdict, HARD_LIMIT, validateSource, surfaces, queuedClaims, verifyQueued,
  stampBlock, applyStamp, missingTokens, readStamp, STAMP_BEGIN, STAMP_END, STAMP_ROLES,
} from '../../scripts/ci/artifact-currency.mjs';

// Behavioural, not a source-grep: exercises the threshold function directly so gate-shape's
// source-grep ratchet does not rise.
//
// Mutation-Proof: 2026-10-28 (DECISIONS 2026-10-28 item 12: drift is reported, never refused), via
// scripts/dev/mutate.sh. Restoring a drift refusal in driftVerdict (`refuse: false` -> `refuse: level === 'stale'`)
// turned the verdict test RED; the unmeasured `refuse: false` -> `refuse: true` turned it RED; deleting the
// `behind === null` guard (null then reads as a drift of 0, i.e. current) turned it RED. main() refusing a stale
// drift whatever the verdict SURVIVES here — this file cannot see the wiring — and is killed by the process-level
// twin, tests/scripts/artifact-currency-scope.test.js. An identity comment edit survived. The receipts for the
// earlier main-only scope are in git history.

describe('artifact-currency threshold', () => {
  it('at HEAD is current', () => {
    expect(classify(0)).toEqual({ level: 'current', ok: true });
  });

  it('inside the limit it is drifting: the report nudges a refresh at session close', () => {
    expect(classify(1).ok).toBe(true);
    expect(classify(HARD_LIMIT).ok).toBe(true);
    expect(classify(HARD_LIMIT).level).toBe('drifting');
  });

  it('past the limit it is STALE — the report says so (since 2026-10-28 it refuses nothing; see driftVerdict)', () => {
    expect(classify(HARD_LIMIT + 1).ok).toBe(false);
    expect(classify(HARD_LIMIT + 1).level).toBe('stale');
  });

  it('the boundary is pinned from BOTH sides, so the stale wording cannot drift off the limit unseen', () => {
    expect(classify(HARD_LIMIT).ok).toBe(true);
    expect(classify(HARD_LIMIT + 1).ok).toBe(false);
  });

  it('the limit is configurable, so the gate is not welded to one number', () => {
    expect(classify(5, 3).ok).toBe(false);
    expect(classify(2, 3).ok).toBe(true);
  });
});

// DRIFT IS REPORTED, NEVER REFUSED (DECISIONS 2026-10-28 item 12). The cap measured how far the WRITER was
// behind; the reader's question is whether the page is current, which the page answers by stating its own commit.
// The verdict still carries `refuse`, because main() routes it into the exit code: these cases are what go RED if
// a refusal is put back. The main-vs-branch cases that used to live here are gone with the scope they tested —
// the verdict no longer takes the pushed refs at all.
describe('driftVerdict — no drift refuses, at any level', () => {
  const cases = [
    [0, 'current'],
    [1, 'drifting'],
    [HARD_LIMIT, 'drifting'],
    [HARD_LIMIT + 1, 'stale'],
    [HARD_LIMIT * 10, 'stale'],
    // `behind === null`: the recorded sha is not in this history (a shallow clone, a squash-merged lane's sha), so
    // the drift cannot be counted. It is reported as unknown, never as current, and refuses nothing.
    [null, 'unmeasured'],
  ];

  it('every level, from current to unmeasured, is reported with refuse: false', () => {
    let checked = 0;
    for (const [behind, level] of cases) {
      expect(driftVerdict(behind), `behind ${behind}`).toEqual({ level, refuse: false });
      checked++;
    }
    // The denominator: all six levels were judged, the stale and unmeasured ones included.
    expect(checked).toBe(6);
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

// THE READER-SIDE STAMP (DECISIONS 2026-10-28 item 12). The operator's question was whether the page he READS is
// current, so the page says, in one generated line at the top: "As of commit <sha>, <UTC time>." `--stamp` writes it;
// the wiring is pinned as a process in tests/scripts/artifact-currency-scope.test.js.
//
// Mutation-Proof (the stamp, 2026-10-28, via scripts/dev/mutate.sh, each RED observed): a re-sync that keeps the old
// stamp (`html.slice(e + STAMP_END.length)` -> `html.slice(b)`); a replace that leaves a dangling end marker
// (-> `html.slice(e)`); the first stamp placed before the wrapper (`m.index + m[0].length` -> `m.index`); the time to
// the hour (`slice(11, 16)` -> `slice(11, 13)`); local time printed as UTC (run under TZ America/Los_Angeles: in a UTC
// zone that mutant cannot be told apart, which is why the fixed instant sits on the 28th in UTC and the 27th west of
// it); the currentStatus pointer dropped; a literal colour in place of the text token; the token match without its
// left bound; the label not escaped. An identity comment edit survived.
describe('the as-of stamp — a page states its own age', () => {
  const tokens = { text: '--t-x', rule: '--r-x', link: '--l-x', font: '--f-x' };
  // 06:05:59 UTC: seconds are dropped, and in any zone west of UTC this is still the 27th, so a stamp printed in
  // local time, or to the hour, reads differently.
  const when = new Date(Date.UTC(2026, 9, 28, 6, 5, 59));
  const status = { label: 'the Command Record', url: 'https://claude.ai/artifact/BgjzwJJqjnPvaUfxkUtU7f' };
  const WRAP = '<div class="wrap">';
  const page = `<title>p</title><style>:root{--t-x:#111;--r-x:#222;--l-x:#333;--f-x:ui-monospace}</style>\n${WRAP}\n<header>h</header>\n<p>body</p>\n</div>\n`;
  const at = page.indexOf(WRAP) + WRAP.length;
  const visible = (block) => block.replace(/<[^>]+>/g, '');

  it('the line reads "As of commit <sha>, <YYYY-MM-DD HH:MM> UTC.", between the two markers', () => {
    const b = stampBlock({ sha: 'abc12345', when, tokens });
    expect(b.startsWith(STAMP_BEGIN) && b.endsWith(STAMP_END)).toBe(true);
    expect(visible(b)).toBe('As of commit abc12345, 2026-10-28 06:05 UTC.');
  });

  it('a page that is mostly history adds the pointer to the current-status page, as a link', () => {
    const b = stampBlock({ sha: 'abc12345', when, tokens, currentStatus: status });
    expect(visible(b)).toBe('As of commit abc12345, 2026-10-28 06:05 UTC. Most of this page is history; current status: the Command Record.');
    expect(b).toMatch(/<a href="https:\/\/claude\.ai\/artifact\/BgjzwJJqjnPvaUfxkUtU7f"[^>]*>the Command Record<\/a>/);
  });

  it('is styled ONLY by the page\'s own tokens: each of the four roles as var(<token>), and no literal colour', () => {
    const b = stampBlock({ sha: 'abc12345', when, tokens, currentStatus: status });
    let checked = 0;
    for (const role of STAMP_ROLES) { expect(b, role).toContain(`var(${tokens[role]})`); checked++; }
    expect(checked).toBe(4);
    expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('escapes what it prints', () => {
    const b = stampBlock({ sha: 'abc12345', when, tokens, currentStatus: { label: '<b>R&D</b>', url: 'https://x.invalid/?a="1"' } });
    expect(b).toContain('&lt;b&gt;R&amp;D&lt;/b&gt;');
    expect(b).toContain('href="https://x.invalid/?a=&quot;1&quot;"');
  });

  it('WRITES the first stamp right after the content wrapper, before the header, and the rest stays byte-identical', () => {
    const block = stampBlock({ sha: 'aaaa1111', when, tokens });
    const r = applyStamp(page, block);
    expect(r.error).toBeUndefined();
    expect(r.html).toBe(`${page.slice(0, at)}\n${block}${page.slice(at)}`);
    expect(r.html.indexOf(STAMP_BEGIN)).toBeLessThan(r.html.indexOf('<header>'));
  });

  it('REPLACES an existing stamp on a re-sync, never duplicates it, and is idempotent', () => {
    const a = stampBlock({ sha: 'aaaa1111', when, tokens });
    const b = stampBlock({ sha: 'bbbb2222', when: new Date(Date.UTC(2026, 9, 29, 7, 0)), tokens, currentStatus: status });
    const first = applyStamp(page, a).html;
    const second = applyStamp(first, b).html;
    expect(second.split(STAMP_BEGIN)).toHaveLength(2); // exactly one begin marker
    expect(second.split(STAMP_END)).toHaveLength(2); // and exactly one end marker
    expect(second).not.toContain('aaaa1111');
    // Byte-identical outside the markers: the whole page is the original with only the new block inserted.
    expect(second).toBe(`${page.slice(0, at)}\n${b}${page.slice(at)}`);
    expect(applyStamp(second, b).html).toBe(second);
  });

  it('replaces a stamp WHEREVER it sits, touching nothing outside its markers', () => {
    const block = stampBlock({ sha: 'cccc3333', when, tokens });
    const moved = `A\n${STAMP_BEGIN}a hand edit${STAMP_END}\nB ${WRAP}C`;
    expect(applyStamp(moved, block).html).toBe(`A\n${block}\nB ${WRAP}C`);
  });

  it('falls back to <body>, and refuses a page it cannot place a stamp in rather than guessing', () => {
    const block = stampBlock({ sha: 'dddd4444', when, tokens });
    expect(applyStamp('<body class="x">hi', block).html).toBe(`<body class="x">\n${block}hi`);
    expect(applyStamp(`${STAMP_BEGIN}x`, block).error).toMatch(/with no <!-- asof:end -->/);
    expect(applyStamp(`${STAMP_BEGIN}${STAMP_END}${STAMP_BEGIN}${STAMP_END}`, block).error).toMatch(/more than one/);
    expect(applyStamp(`x${STAMP_END}`, block).error).toMatch(/with no <!-- asof:begin -->/);
    expect(applyStamp('<title>t</title><main>no wrapper</main>', block).error).toMatch(/no content wrapper/);
  });

  it('missingTokens names each role whose token the page does not DECLARE — a prefix or a suffix is not a declaration', () => {
    expect(missingTokens(page, tokens)).toEqual([]);
    expect(missingTokens(page, { ...tokens, link: '--nope' })).toEqual(['link']);
    expect(missingTokens(page, { ...tokens, text: '--t' })).toEqual(['text']); // `--t-x:` does not declare `--t`
    expect(missingTokens(`${page}<style>:root{--a--x:1}</style>`, { ...tokens, rule: '--x' })).toEqual(['rule']); // nor `--a--x:` `--x`
    expect(missingTokens(page, { text: '--t-x' })).toEqual(['rule', 'link', 'font']);
    expect(missingTokens(page, { ...tokens, font: 'monospace' })).toEqual(['font']); // not a custom property at all
    expect(missingTokens(page, undefined)).toEqual(STAMP_ROLES);
  });
});

// readStamp: the commit a page's stamp names. `--sync` records a publish only when it matches, so it must read the ONE
// stamp and nothing else, and say so when it cannot, rather than guess.
//
// Mutation-Proof (2026-10-28, via scripts/dev/mutate.sh, each RED observed): the commit searched in the whole page
// rather than between the markers (`.exec(html.slice(b, e))` -> `.exec(html)`); a lone end marker accepted
// (`begins !== 1 || ends !== 1` -> `begins !== 1`); the end-before-begin guard dropped. An identity comment edit survived.
describe('readStamp — the commit the page says it is as of', () => {
  const tokens = { text: '--t-x', rule: '--r-x', link: '--l-x', font: '--f-x' };
  const when = new Date(Date.UTC(2026, 9, 28, 6, 5, 59));
  const status = { label: 'the Command Record', url: 'https://claude.ai/artifact/BgjzwJJqjnPvaUfxkUtU7f' };

  it('reads back the sha of the block stampBlock wrote, with or without the current-status pointer', () => {
    const page = (block) => `<title>p</title><div class="wrap">\n${block}<p>body</p></div>`;
    expect(readStamp(page(stampBlock({ sha: '32a55b75', when, tokens })))).toEqual({ sha: '32a55b75' });
    expect(readStamp(page(stampBlock({ sha: '43d766e6', when, tokens, currentStatus: status })))).toEqual({ sha: '43d766e6' });
  });

  it('reads only BETWEEN the markers: a sha in the page\'s prose is not a stamp', () => {
    const html = `<p>As of commit 1111111, a sentence.</p>${STAMP_BEGIN}<p>a hand edit</p>${STAMP_END}`;
    expect(readStamp(html)).toEqual({ error: 'has an as-of stamp that names no commit' });
  });

  it('refuses anything but exactly one begin marker followed by exactly one end marker', () => {
    const one = stampBlock({ sha: 'abc1234', when, tokens });
    expect(readStamp('<title>p</title><p>no stamp</p>')).toEqual({ error: 'has no as-of stamp' });
    expect(readStamp(`${one}${one}`).error).toMatch(/has 2 <!-- asof:begin --> and 2 <!-- asof:end --> markers/);
    expect(readStamp(`${one}${STAMP_END}`).error).toMatch(/has 1 <!-- asof:begin --> and 2 <!-- asof:end --> markers/);
    expect(readStamp(`${STAMP_BEGIN}As of commit abc1234, x`).error).toMatch(/has 1 <!-- asof:begin --> and 0 <!-- asof:end --> markers/);
    expect(readStamp(`${STAMP_END}As of commit abc1234, x${STAMP_BEGIN}`).error).toMatch(/end --> marker before its/);
  });
});
