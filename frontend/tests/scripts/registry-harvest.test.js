import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fixtureGit, fixtureGitWith } from './_isolatedGit.js';
import {
  ROOT, REGISTRY, DECISIONS, SOURCES, FLOORS_FILE, harvest, compare, parseRegistry, readFloors, slug,
  extractStatus, extractActivePlan, extractQueue, extractOpenItems, extractMasterpiece,
  checkReferences, liveReferences, decisionsIndex, resolveDecision,
} from '../../scripts/ci/registry-harvest.mjs';

// Sited in tests/scripts/ because its subject is the content of five docs and the registry file. It executes the
// harvest module; it does not read source code as text.

/** A copy of the five sources and the registry under a temp root; `edits` maps a path to a text edit, or null to omit it. */
function treeWith(edits) {
  const root = mkdtempSync(join(tmpdir(), 'registry-harvest-'));
  for (const rel of [...SOURCES.map((s) => s.path), REGISTRY]) {
    if (edits[rel] === null) continue;
    const to = join(root, rel);
    mkdirSync(dirname(to), { recursive: true });
    const text = readFileSync(join(ROOT, rel), 'utf8');
    writeFileSync(to, edits[rel] ? edits[rel](text) : text);
  }
  return root;
}

function harvestIn(edits, floorsText) {
  const root = treeWith(edits);
  try {
    return floorsText === undefined ? harvest(root) : harvest(root, floorsText);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('registry-harvest on the real tree', () => {
  const r = harvest();

  it('every source yields items, and every extracted item has a registry row', () => {
    expect(SOURCES).toHaveLength(5);
    for (const s of r.perSource) expect(s.total, `${s.path} extracted nothing`).toBeGreaterThan(0);
    expect(r.errors).toEqual([]);
    expect(r.perSource.flatMap((s) => s.missing)).toEqual([]);
  });

  it('extracted keys are unique within each source, so a key names one item', () => {
    for (const s of r.extracted) expect(new Set(s.items.map((it) => it.key)).size).toBe(s.items.length);
  });

  it('deleting the only row of a key turns the check red and names that key', () => {
    const lines = readFileSync(join(ROOT, REGISTRY), 'utf8').split('\n').filter(Boolean);
    const victim = JSON.parse(lines.find((l) => JSON.parse(l).key === 'STATUS:G-ledger:40'));
    const broken = harvestIn({ [REGISTRY]: (text) => text.split('\n').filter((l) => !l.includes(`"id": "${victim.id}"`)).join('\n') });
    expect(broken.errors.some((e) => e.includes('"STATUS:G-ledger:40" has no row'))).toBe(true);
    expect(broken.perSource.find((s) => s.name === 'STATUS').missing.map((m) => m.key)).toEqual(['STATUS:G-ledger:40']);
  });

  it('every source is at or above its committed floor, and the floors name exactly the five sources', () => {
    const { floors, errors } = readFloors(readFileSync(FLOORS_FILE, 'utf8'));
    expect(errors).toEqual([]);
    expect(Object.keys(floors).sort()).toEqual(SOURCES.map((s) => s.name).sort());
    for (const s of r.perSource) expect(s.total, `${s.name}: ${s.total} items, floor ${s.floor}`).toBeGreaterThanOrEqual(s.floor);
  });

  it('a renamed G-ledger heading drops its rows from extraction and fails on the STATUS floor', () => {
    const renamed = harvestIn({ 'memory/STATUS.md': (t) => t.replace(/^### G-ledger\. /m, '### Residue ledger. ') });
    const status = renamed.perSource.find((s) => s.name === 'STATUS');
    expect(status.total).toBeLessThan(status.floor);
    expect(status.missing).toEqual([]);
    expect(renamed.errors).toEqual([expect.stringMatching(new RegExp(`memory/STATUS\\.md: ${status.total} items extracted, below its floor of ${status.floor}\\.`))]);
  });

  it('the same drop passes when the floor is lowered in the same change', () => {
    const floors = JSON.parse(readFileSync(FLOORS_FILE, 'utf8'));
    const edit = { 'memory/STATUS.md': (t) => t.replace(/^### G-ledger\. /m, '### Residue ledger. ') };
    const count = harvestIn(edit).perSource.find((s) => s.name === 'STATUS').total;
    expect(harvestIn(edit, JSON.stringify({ ...floors, STATUS: count })).errors).toEqual([]);
  });

  it('a floors file that misses a source, or names one that is gone, is an error', () => {
    const floors = JSON.parse(readFileSync(FLOORS_FILE, 'utf8'));
    const { QUEUE: _dropped, ...noQueue } = floors;
    expect(readFloors(JSON.stringify(noQueue)).errors).toEqual(['registry-floors.json: QUEUE has no floor (a positive integer)']);
    expect(readFloors(JSON.stringify({ ...floors, GONE: 3 })).errors).toEqual([expect.stringContaining('floor for "GONE", which is not a source')]);
  });

  it('a source that yields nothing, or is missing, is an error, never a pass over an empty set', () => {
    const masterpiece = SOURCES.find((s) => s.name === 'MASTERPIECE').path;
    const emptied = harvestIn({ [masterpiece]: () => '# a plan with no phases\n' });
    expect(emptied.errors).toEqual([expect.stringContaining(`${masterpiece}: 0 items extracted`)]);
    const gone = harvestIn({ [masterpiece]: null });
    expect(gone.errors).toEqual([expect.stringContaining(`${masterpiece}: missing`)]);
  });
});

describe('the extraction rules, on fixtures where the answer is known', () => {
  it('STATUS: open and in-flight markers and open G-ledger rows count; done, struck and closed rows do not', () => {
    const md = [
      '## 1. Where', '- ▢ **R9 [LOOP]** outside section 2, ignored',
      '## 2. THE HARVESTED RECORD', '### A. Bugs',
      '- ▢ **R4 [LOOP] open with an id**', '- ▣✓ **R1 — FIXED**', '- ~~▢ **R2 [LOOP] struck original**~~',
      '- ▣ **E3 — in flight**', '  - ▢ **STILL OPEN:** the three arms', '  **▢ RESIDUAL — a nested marker**',
      '### G-ledger. Residue', '| # | Item | Severity | Source | Owner | State |', '|---|---|---|---|---|---|',
      '| 1 | an open row | LOW | x | command | open |', '| 2 | a closed row | LOW | x | command | closed by its landing |',
      '## 3. What next', '- ▢ **R8 [LOOP]** outside section 2, ignored',
    ].join('\n');
    expect(extractStatus(md).map((i) => i.key)).toEqual([
      'STATUS:R4', 'STATUS:E3', 'STATUS:A:still-open-the-three-arms', 'STATUS:A:residual-a-nested-marker', 'STATUS:G-ledger:1',
    ]);
  });

  it('ACTIVE_PLAN: undone tasks, the owed bullets, review #8 findings and the bake-off candidates count', () => {
    const md = [
      '### COMMAND SESSION — LIVE TASK LIST', '| # | Task | State |', '|---|---|---|',
      '| T1 | done task | DONE `abc` |', '| T2 | partial task | PARTIAL |', '| T3 | repaired | REPAIRED `def` |',
      '**Owed after Wave 1 lands (LOW):**', '- Pause instruments: one; two.', '- gpu-cost-probe hung >5 min; undiagnosed.', '',
      '### PAUSED', '- **Review #8 findings still open** (verify): #1 MED a strand; #6 LOW a header;',
      '  #12 LOW a dead effect.',
      '**Findings from the 2026-10-27 review bake-off — to work:**', '- **B1, REPRODUCED:** a shove.',
      '- **Candidates, unverified:** one thing; two things. Already fixed on main: a third.',
    ].join('\n');
    expect(extractActivePlan(md).map((i) => i.key)).toEqual([
      'ACTIVE_PLAN:T2', 'ACTIVE_PLAN:owed:pause-instruments', 'ACTIVE_PLAN:owed:gpu-cost-probe-hung',
      'ACTIVE_PLAN:review8:#1', 'ACTIVE_PLAN:review8:#6', 'ACTIVE_PLAN:review8:#12',
      'ACTIVE_PLAN:bakeoff:B1', 'ACTIVE_PLAN:bakeoff:candidate:one-thing', 'ACTIVE_PLAN:bakeoff:candidate:two-things',
    ]);
  });

  it('QUEUE: every Q row, the E items, open or partly review rows, follow-ups and unfixed finding headings count', () => {
    const md = [
      '## A. QUEUE', '| ID | What |', '|---|---|', '| **Q01** | **Close PR #18.** |', '| **Q02** | Two lines. |',
      '## E. WHERE THE LANES DISAGREED', '### E1 — a disagreement', '### F9 — not an E item',
      '## R2 — review', '| # | where | finding | disposition |', '|---|---|---|---|',
      '| R2.1 | a | b | ✅ FIXED `abc` |', '| R2.8 | a | b | OPEN as **G2** |', '| R8.8 | a | b | **PARTLY** — half |',
      '| R4.2 | a | b | ✅ FIXED — **Follow-up R4.2b: pause it** |',
      '## I1 — a gap (OPEN)', '## P1 — walls — ✅ FIXED `232f0581`', '## G1 — a lint (FIXED)', '**Related, also open:** 14 files.',
    ].join('\n');
    expect(extractQueue(md).map((i) => i.key)).toEqual([
      'QUEUE:Q01', 'QUEUE:Q02', 'QUEUE:E1', 'QUEUE:R2.8', 'QUEUE:R8.8', 'QUEUE:R4.2b', 'QUEUE:I1', 'QUEUE:G1:related-open',
    ]);
  });

  it('OPEN_ITEMS: OI rows in A-C, a STILL OPEN row elsewhere, OI-03b and the STALE rows count; done rows do not', () => {
    const md = [
      '## A. STILL OPEN — HIGH', '| **OI-01** | a | x |', '### OI-03b — the question',
      '## C. STILL OPEN — LOW', '| **OI-57** | b | x |',
      '## D. ALREADY DONE', '| **OI-72** | done | **DRAINED.** |', '| **OI-76** | reply | **STILL OPEN — confused** |',
      '## G. STALE DOC CLAIMS', '| **STALE-01** | `f` | "claim" | fact |', '## H. cautions', '| **STALE-02** | not in G |',
    ].join('\n');
    expect(extractOpenItems(md).map((i) => i.key)).toEqual([
      'OPEN_ITEMS:OI-01', 'OPEN_ITEMS:OI-03b', 'OPEN_ITEMS:OI-57', 'OPEN_ITEMS:OI-76', 'OPEN_ITEMS:STALE-01',
    ]);
  });

  it('MASTERPIECE: Phase 0 rows, Phase 1-3 bold bullets, the seen bullets and the questions count', () => {
    const md = [
      '## Phase 0 — deliver', '| # | Move |', '|---|---|', '| 0a | Push main |', '| 0e | Re-baseline |',
      '## Seen on a real GPU', '- **Night is unplayable.** maroon', '- The compass overprints.',
      '## Phase 2 — first', '- **The first minute** (roadmap 6): a title', '- plain prose bullet, not a lane',
      '## Decisions taken', '- **Death stays soft.** not an item',
      '## Open questions for Kevin', '- His iPad version.',
    ].join('\n');
    expect(extractMasterpiece(md).map((i) => i.key)).toEqual([
      'MASTERPIECE:0a', 'MASTERPIECE:0e', 'MASTERPIECE:seen:night-is-unplayable', 'MASTERPIECE:seen:the-compass-overprints',
      'MASTERPIECE:the-first-minute', 'MASTERPIECE:question:his-ipad-version',
    ]);
  });

  it('slug drops markup and bracketed tags', () => {
    expect(slug('**[LOOP] SO THE `ORIGINAL` QUESTION IS STILL OPEN**')).toBe('so-the-original-question-is');
  });
});

describe('the registry schema', () => {
  // A lane row for the fixtures' open rows to name: S4 refuses an open row whose lane is not a row.
  const lane = JSON.stringify({
    id: 'L', key: 'L', planUnit: 'p', title: 'a lane', kind: 'lane', area: 'harness', severity: 'LOW', playerVisible: false,
    owner: 'command session', state: 'open', acceptance: 'every row it owns has closed', evidence: 'e', opened: '2026-10-31', updated: '2026-10-31',
  });
  const row = (o) => JSON.stringify({
    id: 'K', key: 'K', planUnit: 'W2-D', title: 't', kind: 'debt', area: 'harness', severity: 'LOW', playerVisible: false,
    owner: 'command session', state: 'open', lane: 'L', acceptance: 'a named check that makes it done',
    evidence: 'memory/STATUS.md:1@a3fb66cd', opened: '2026-07-13', updated: '2026-10-31', ...o,
  });
  const closed = { state: 'closed', lane: undefined, acceptance: undefined };

  it('accepts a well-formed open row, split parts of one key, and closed rows naming a commit or a decision', () => {
    expect(parseRegistry([
      lane, row(), row({ id: 'K/a' }), row({ id: 'K/sun-glow-fog' }), row({ id: 'K/b', ...closed, resolution: 'done', closedBy: 'abc1234' }),
      row({ id: 'K/c', ...closed, resolution: 'superseded', closedBy: 'DECISIONS 2026-10-28 (W1-H) item 1' }),
    ].join('\n')).errors).toEqual([]);
  });

  it('refuses a bad owner, a bad state, a closed row with no closedBy, a repeated id, a missing field, a bad date and a non-JSON line', () => {
    const { errors } = parseRegistry([
      lane, row({ owner: 'someone' }), row({ id: 'K/a', state: 'done' }), row({ id: 'K/b', ...closed, resolution: 'done' }), row({ id: 'K/b' }),
      row({ id: 'K/c', evidence: '' }), row({ id: 'K/d', opened: '10-28' }), 'not json',
    ].join('\n'));
    expect(errors).toHaveLength(7);
    expect(errors.join('\n')).toMatch(/owner "someone"/);
    expect(errors.join('\n')).toMatch(/state "done"/);
    expect(errors.join('\n')).toMatch(/closed done with no closedBy/);
    expect(errors.join('\n')).toMatch(/id "K\/b" repeats/);
    expect(errors.join('\n')).toMatch(/missing evidence/);
    expect(errors.join('\n')).toMatch(/opened "10-28" is not a YYYY-MM-DD date/);
    expect(errors.join('\n')).toMatch(/not a JSON object/);
  });

  it('an id is its key or key/part, so a split row cannot drift away from the source item it came from', () => {
    for (const id of ['K-b', 'KX', 'Q/a', 'K/', 'K/B', 'K/a/b', 'K/-a', 'K/a-']) {
      expect(parseRegistry([lane, row({ id })].join('\n')).errors, id).toEqual([expect.stringContaining(`(${id}): id is neither its key "K" nor "K/<part>"`)]);
    }
  });

  it('compare reports a missing key per source and the rows no rule produced', () => {
    const extracted = [{ name: 'S', path: 'p', items: [{ key: 'K1', line: 1, title: 'x' }, { key: 'K2', line: 2, title: 'y' }] }];
    const r = compare(extracted, [{ key: 'K1' }, { key: 'READ' }]);
    expect(r.perSource[0].missing.map((m) => m.key)).toEqual(['K2']);
    expect(r.unextracted.map((u) => u.key)).toEqual(['READ']);
  });
});

describe('schema v2: the committed registry passes, the v1 registry fails, and one broken copy fails each rule alone', () => {
  const REG = readFileSync(join(ROOT, REGISTRY), 'utf8');
  const LIVE_REFS = liveReferences(ROOT);
  const rulesOf = (text, refs = LIVE_REFS) => {
    const p = parseRegistry(text);
    const r = checkReferences(p.rows, refs);
    return [...new Set([...p.findings, ...r.findings].map((f) => f.rule))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  };
  /** The registry with one row changed by `fn` (a row returned as null is left out of the change: see S1). */
  const edit = (id, fn) => {
    let hit = 0;
    const out = REG.split('\n').map((l) => {
      if (!l.trim()) return l;
      const r = JSON.parse(l);
      if (r.id !== id) return l;
      hit += 1;
      return JSON.stringify(fn({ ...r }));
    }).join('\n');
    expect(hit, `${id} is a row`).toBe(1);
    return out;
  };

  it('the committed registry: every line is a row, and no rule finds anything', () => {
    const lines = REG.split('\n').filter((l) => l.trim()).length;
    const p = parseRegistry(REG);
    expect(p.rows).toHaveLength(lines);
    expect(lines).toBeGreaterThan(700);
    expect(p.findings).toEqual([]);
    expect(checkReferences(p.rows, LIVE_REFS).findings).toEqual([]);
  });

  it('the v1 registry at the triage snapshot a150a93a fails the schema rules (red first, on real data)', () => {
    const v1 = fixtureGit(ROOT, 'show', `a150a93a:${REGISTRY}`);
    expect(rulesOf(v1)).toEqual(expect.arrayContaining(['S0', 'S2', 'S3', 'S4', 'S5', 'S10', 'S11']));
  });

  const cases = [
    ['S0', 'a row gains a field outside the set', () => edit('QUEUE:Q49', (r) => ({ ...r, priority: 'P1' }))],
    ['S1', 'two rows share one id', () => `${REG}${REG.split('\n').find((l) => l.includes('"id": "QUEUE:Q49"'))}\n`],
    ['S2', 'an open row has no kind', () => edit('QUEUE:Q49', ({ kind: _k, ...r }) => r)],
    ['S3', 'an open row has no acceptance', () => edit('QUEUE:Q49', ({ acceptance: _a, ...r }) => r)],
    ['S4', 'a lane closes while 14 open rows name it', () => edit('LANE:W3-D', (r) => ({ ...r, state: 'closed', resolution: 'done', closedBy: 'a150a93a', acceptance: undefined }))],
    ['S5', "a wont-fix row's note loses its reason", () => edit('QUEUE:Q55', (r) => ({ ...r, note: 'dropped' }))],
    ['S6', 'a closure names a sha that is not on main', () => edit('STATUS:R4', (r) => ({ ...r, closedBy: 'deadbeef' }))],
    ['S7', 'a closure names a DECISIONS item that does not exist', () => edit('STATUS:R4', (r) => ({ ...r, closedBy: 'DECISIONS 2026-10-30 item 9999' }))],
    ['S8', 'a duplicate points at no row', () => edit('STATUS:F1', (r) => ({ ...r, closedBy: 'duplicate:QUEUE:Q9999' }))],
    ['S8', 'a duplicate points at a duplicate (a chain)', () => edit('STATUS:F1', (r) => ({ ...r, closedBy: 'duplicate:OPEN_ITEMS:OI-42' }))],
    ['S9', 'a bug no player can see', () => edit('QUEUE:Q49', (r) => ({ ...r, kind: 'bug', playerVisible: false }))],
    ['S10', 'an unrated row outside triage', () => edit('QUEUE:Q49', (r) => ({ ...r, severity: 'unrated' }))],
    ['S11', 'a 161-character title', () => edit('QUEUE:Q49', (r) => ({ ...r, title: 'x'.repeat(161) }))],
  ];
  it.each(cases)('%s: %s', (rule, _what, broken) => {
    expect(rulesOf(broken())).toEqual([rule]);
  });

  it('S10: a triage row may stay 7 days by the head commit\'s date, not the wall clock; the 8th day fails', () => {
    const refs = { ...LIVE_REFS, headDate: '2026-12-01' };
    const inTriage = (opened) => edit('QUEUE:Q49', (r) => ({ ...r, lane: 'LANE:triage', opened }));
    expect(rulesOf(inTriage('2026-11-24'), refs)).toEqual([]);
    expect(rulesOf(inTriage('2026-11-23'), refs)).toEqual(['S10']);
  });

  it('S7 resolves a reference by date, tag and number, and refuses one that is ambiguous or absent', () => {
    const idx = decisionsIndex(['## 2026-10-28 (W1-H) — a', '1. one', 'more of one', '2. two', '## 2026-10-28 (W2-A) — b', '1. other one', '## 2026-10-29 — c', '5. five', '6. six'].join('\n'));
    expect(resolveDecision('DECISIONS 2026-10-28 (W1-H) item 1', idx)).toMatchObject({ ok: true, items: ['1. one\nmore of one'] });
    expect(resolveDecision('DECISIONS 2026-10-28 item 1', idx)).toMatchObject({ ok: false });
    expect(resolveDecision('DECISIONS 2026-10-29 items 5-6', idx).ok).toBe(true);
    expect(resolveDecision('DECISIONS 2026-10-29 items 5 and 7', idx).ok).toBe(false);
    expect(resolveDecision('DECISIONS 2026-10-29 item 6(a)', idx).ok).toBe(true);
  });

  it('S9: a Kevin row closes done only on an item that names him', () => {
    const decisionsText = ['## 2026-10-31 — x', '1. Kevin ran it on his iPad.', '2. The session decided it.'].join('\n');
    const kevin = { id: 'K', state: 'closed', owner: 'Kevin', resolution: 'done', _line: 1 };
    const refs = { isAncestor: () => true, decisionsText, headDate: '2026-10-31' };
    expect(checkReferences([{ ...kevin, closedBy: 'DECISIONS 2026-10-31 item 1' }], refs).findings).toEqual([]);
    expect(checkReferences([{ ...kevin, closedBy: 'DECISIONS 2026-10-31 item 2' }], refs).findings.map((f) => f.rule)).toEqual(['S9']);
  });

  it('a reference check with nothing injected throws rather than passing', () => {
    expect(() => checkReferences([], {})).toThrow(/run blind is not a pass/);
  });
});

describe('S6 while a merge is in progress: a sha main added is reachable from MERGE_HEAD, and no other sha is', () => {
  // The documented way to take main into a lane is a merge commit (CLAUDE.md "Landing"). A merge that stops, on a
  // conflict or with --no-commit, is finished with `git commit`, whose pre-commit hook can run S6 on the working-tree
  // registry while HEAD is still the lane's own tip, so every closedBy sha main added read "not an ancestor of HEAD"
  // and the commit could not be made without --no-verify. Each case builds a throwaway repository
  // where the answer is known by construction: `mainOnly` is on main and not on the lane, `stray` is on a third branch
  // nothing merges, so a rule that accepts any sha git can find is told apart from one that follows the merge.
  const roots = [];
  afterAll(() => {
    for (const d of roots) rmSync(d, { recursive: true, force: true });
  });

  function lane() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'registry-s6-')));
    roots.push(root);
    const g = (...a) => fixtureGit(root, ...a);
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 'fixture@example.invalid');
    g('config', 'user.name', 'fixture');
    g('config', 'commit.gpgsign', 'false');
    mkdirSync(join(root, dirname(DECISIONS)), { recursive: true });
    writeFileSync(join(root, DECISIONS), '## 2026-10-31 - a\n\n1. an item\n');
    const commit = (file, msg) => {
      writeFileSync(join(root, file), `${msg}\n`);
      g('add', '-A');
      g('commit', '-q', '-m', msg);
      return g('rev-parse', 'HEAD');
    };
    const base = commit('base.txt', 'base');
    g('checkout', '-q', '-b', 'lane');
    const laneOnly = commit('lane.txt', 'lane');
    g('checkout', '-q', 'main');
    const mainOnly = commit('main.txt', 'main');
    g('checkout', '-q', '-b', 'stray', base);
    const stray = commit('stray.txt', 'stray');
    g('checkout', '-q', 'lane');
    return { root, g, base, laneOnly, mainOnly, stray };
  }

  /** The S6 findings for a registry that closes one row on each of `shas`, read from the repository at `root`. */
  function s6(root, shas) {
    const rows = shas.map((sha, i) => ({
      id: `R${i}`, state: 'closed', owner: 'command session', resolution: 'done', closedBy: sha.slice(0, 8), _line: i + 1,
    }));
    return checkReferences(rows, liveReferences(root)).findings.filter((f) => f.rule === 'S6').map((f) => f.id);
  }
  const inProgress = (g) => g('rev-parse', '-q', '--verify', 'MERGE_HEAD');

  it('outside a merge, a sha only main holds is not an ancestor of the lane, as before', () => {
    const f = lane();
    expect(() => inProgress(f.g), 'presence: no merge is in progress').toThrow();
    expect(s6(f.root, [f.base, f.laneOnly, f.mainOnly, f.stray])).toEqual(['R2', 'R3']);
  });

  it('mid-merge of main, a sha main added passes; a sha on a branch the merge does not take in, and one that does not exist, still fail', () => {
    const f = lane();
    f.g('merge', '-q', '--no-commit', '--no-ff', 'main');
    expect(inProgress(f.g), 'presence: the fixture is mid-merge, MERGE_HEAD is main').toBe(f.mainOnly);
    expect(s6(f.root, [f.base, f.laneOnly, f.mainOnly])).toEqual([]);
    expect(s6(f.root, [f.stray, 'deadbeef'.padEnd(40, '0')])).toEqual(['R0', 'R1']);
  });

  it('a merge that was aborted takes the allowance with it', () => {
    const f = lane();
    f.g('merge', '-q', '--no-commit', '--no-ff', 'main');
    expect(s6(f.root, [f.mainOnly]), 'control: the allowance is on mid-merge').toEqual([]);
    f.g('merge', '--abort');
    expect(() => inProgress(f.g)).toThrow();
    expect(s6(f.root, [f.mainOnly])).toEqual(['R0']);
  });

  it('once the merge commits, the sha is an ancestor of HEAD and the stray one is still refused', () => {
    const f = lane();
    f.g('merge', '-q', '--no-commit', '--no-ff', 'main');
    f.g('commit', '-q', '-m', 'merge main into lane');
    expect(() => inProgress(f.g)).toThrow();
    expect(s6(f.root, [f.mainOnly, f.laneOnly])).toEqual([]);
    expect(s6(f.root, [f.stray])).toEqual(['R0']);
  });

  it("holds in a linked worktree, where the merge state sits in the worktree's own git dir", () => {
    const f = lane();
    const wt = `${f.root}-wt`;
    roots.push(wt);
    // The override is for a machine whose git shim refuses a worktree under the temp dir; the fixture is deleted above.
    fixtureGitWith(f.root, { AB_ALLOW_EPHEMERAL_WORKTREE: '1' }, 'worktree', 'add', '-q', '-b', 'lane-wt', wt, 'lane');
    const w = (...a) => fixtureGit(wt, ...a);
    w('merge', '-q', '--no-commit', '--no-ff', 'main');
    expect(inProgress(w), 'presence: the worktree is mid-merge').toBe(f.mainOnly);
    expect(s6(wt, [f.mainOnly])).toEqual([]);
    expect(s6(wt, [f.stray])).toEqual(['R0']);
  });

  // `git rev-parse MERGE_HEAD` is a name lookup: with no merge-state file it goes on to refs/MERGE_HEAD, refs/tags/ and
  // refs/heads/, and git lets anyone create a branch or a tag with that name. A merge is in progress when the file
  // exists, so the file is what the rule reads before it resolves the name.
  it.each(['branch', 'tag'])('a %s named MERGE_HEAD with no merge in progress gives no allowance', (kind) => {
    const f = lane();
    f.g(kind, 'MERGE_HEAD', f.stray);
    expect(existsSync(join(f.root, '.git', 'MERGE_HEAD')), 'presence: no merge-state file').toBe(false);
    expect(inProgress(f.g), `presence: the name resolves to the ${kind}, which is the trap`).toBe(f.stray);
    expect(s6(f.root, [f.stray, f.mainOnly, f.laneOnly])).toEqual(['R0', 'R1']);
    expect(liveReferences(f.root).mergeHead).toBeNull();
  });

  it('a branch named MERGE_HEAD does not displace the merge-state file during a real merge', () => {
    const f = lane();
    f.g('merge', '-q', '--no-commit', '--no-ff', 'main');
    f.g('branch', 'MERGE_HEAD', f.stray);
    expect(existsSync(join(f.root, '.git', 'MERGE_HEAD')), 'presence: the merge-state file exists').toBe(true);
    expect(liveReferences(f.root).mergeHead).toBe(f.mainOnly);
    expect(s6(f.root, [f.mainOnly])).toEqual([]);
    expect(s6(f.root, [f.stray])).toEqual(['R0']);
  });
});
