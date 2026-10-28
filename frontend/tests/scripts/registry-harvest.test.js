import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  ROOT, REGISTRY, SOURCES, harvest, compare, parseRegistry, slug,
  extractStatus, extractActivePlan, extractQueue, extractOpenItems, extractMasterpiece,
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

function harvestIn(edits) {
  const root = treeWith(edits);
  try {
    return harvest(root);
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

  it('deleting one registry row turns the check red and names that row', () => {
    const lines = readFileSync(join(ROOT, REGISTRY), 'utf8').split('\n').filter(Boolean);
    const victim = JSON.parse(lines.find((l) => JSON.parse(l).key === 'STATUS:G-ledger:41'));
    const broken = harvestIn({ [REGISTRY]: (text) => text.split('\n').filter((l) => !l.includes(`"id": "${victim.id}"`)).join('\n') });
    expect(broken.errors.some((e) => e.includes('"STATUS:G-ledger:41" has no row'))).toBe(true);
    expect(broken.perSource.find((s) => s.name === 'STATUS').missing.map((m) => m.key)).toEqual(['STATUS:G-ledger:41']);
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
      '## 2. THE REGISTRY', '### A. Bugs',
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
  const row = (o) => JSON.stringify({
    id: 'a', key: 'K', source: 'memory/STATUS.md:1', title: 't', owner: 'command session', severity: 'LOW',
    status: 'open', planUnit: 'W2-D', playerVisible: true, ...o,
  });

  it('accepts a well-formed open row and a closed row with closedBy', () => {
    expect(parseRegistry([row(), row({ id: 'b', status: 'closed', closedBy: 'abc1234' })].join('\n')).errors).toEqual([]);
  });

  it('refuses a bad owner, a closed row with no closedBy, a repeated id, a missing field and a non-JSON line', () => {
    const { errors } = parseRegistry([
      row({ owner: 'someone' }), row({ id: 'b', status: 'closed' }), row({ id: 'b' }), row({ id: 'c', planUnit: '' }), 'not json',
    ].join('\n'));
    expect(errors).toHaveLength(5);
    expect(errors.join('\n')).toMatch(/owner "someone"/);
    expect(errors.join('\n')).toMatch(/closed with no closedBy/);
    expect(errors.join('\n')).toMatch(/id "b" repeats/);
    expect(errors.join('\n')).toMatch(/missing planUnit/);
    expect(errors.join('\n')).toMatch(/not a JSON object/);
  });

  it('compare reports a missing key per source and the rows no rule produced', () => {
    const extracted = [{ name: 'S', path: 'p', items: [{ key: 'K1', line: 1, title: 'x' }, { key: 'K2', line: 2, title: 'y' }] }];
    const r = compare(extracted, [{ key: 'K1' }, { key: 'READ' }]);
    expect(r.perSource[0].missing.map((m) => m.key)).toEqual(['K2']);
    expect(r.unextracted.map((u) => u.key)).toEqual(['READ']);
  });
});
