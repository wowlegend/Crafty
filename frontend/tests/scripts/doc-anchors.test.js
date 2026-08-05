import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionIds, citations, unresolved, DOC_ALIASES } from '../../scripts/ci/doc-anchors.mjs';

// Cross-doc `§` citations rot exactly like file paths, and doc-currency only ever checked paths. STATUS §G1
// records that ONE stale line in the charter "regenerated a week-sized proposal"; a dangling § pointer is
// the same failure smaller — the next reader follows it, finds nothing, and either invents the rule or
// drops it.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('sectionIds — what a document actually defines', () => {
  it('reads the numbered heading styles these docs really use', () => {
    const ids = sectionIds([
      '# Title',
      '## 0-A. READ ORDER',
      '## 6.4 BROWSER HYGIENE',
      '### E-ter. Other spec-but-unbuilt',
      '## 8. Rule hygiene',
      'not a heading §9',
    ].join('\n'));
    expect(ids).toEqual(new Set(['0-a', '6.4', 'e-ter', '8']));
  });

  it('ignores prose that merely mentions a section', () => {
    expect(sectionIds('see §5 for details')).toEqual(new Set());
  });

  it('is case-folded, because headings write `### E.` and citations write `§e`', () => {
    expect(sectionIds('### E. Gameplay').has('e')).toBe(true);
  });
});

describe('citations — finding the pointers', () => {
  it('finds the forms these docs really use', () => {
    const found = citations('per charter §6.4 and STATUS §2, plus kernel §0-B');
    expect(found).toEqual([
      { alias: 'charter', section: '6.4' },
      { alias: 'status', section: '2' },
      { alias: 'kernel', section: '0-b' }, // found, but intentionally unresolvable — see DOC_ALIASES
    ]);
  });

  it('tolerates a few words between the doc name and the section', () => {
    expect(citations("the charter's §3").map((c) => c.section)).toEqual(['3']);
  });

  it('strips trailing punctuation picked up from prose', () => {
    expect(citations('see charter §6.4.').map((c) => c.section)).toEqual(['6.4']);
  });

  it('does NOT claim a bare §5 with no document named', () => {
    // Inside a doc, a bare section reference means ITSELF; resolving those needs a per-file default and
    // invites false positives, which is how a gate starts accusing innocent text.
    expect(citations('see §5 and §6')).toEqual([]);
  });

  it('de-duplicates repeats so one stale pointer is counted once', () => {
    expect(citations('charter §9 ... charter §9 ... CHARTER §9')).toHaveLength(1);
  });
});

describe('unresolved — the actual check', () => {
  const sections = { charter: new Set(['3', '6.4']), status: new Set(['2', 'e']) };

  it('flags a citation whose section does not exist', () => {
    expect(unresolved('per charter §99', sections).map((c) => c.section)).toEqual(['99']);
  });

  it('passes a citation that resolves', () => {
    expect(unresolved('per charter §6.4 and STATUS §e', sections)).toEqual([]);
  });

  it('SKIPS an alias the caller did not load — a mis-wired checker must not accuse', () => {
    // The gate-shape scar: a checker that concludes from "matched nowhere" accuses innocent code when its
    // own target set is incomplete.
    expect(unresolved('per kernel §12', sections)).toEqual([]);
    expect(unresolved('per charter §99', { charter: new Set() })).toEqual([]);
  });
});

describe('against the REAL canonical docs', () => {
  // Denominator guards: if the docs stopped parsing, every assertion above would be vacuously satisfied
  // while the live check silently examined nothing.
  it('each aliased doc exists and defines a non-trivial number of sections', () => {
    for (const [alias, rel] of Object.entries(DOC_ALIASES)) {
      const ids = sectionIds(read(rel));
      expect(ids.size, `${alias} -> ${rel} parsed ${ids.size} sections`).toBeGreaterThan(4);
    }
  });

  it('the charter really defines the sections the kernel cites most', () => {
    const ids = sectionIds(read(DOC_ALIASES.charter));
    for (const s of ['3', '6.4', '6.5', '8']) expect(ids, `charter §${s}`).toContain(s);
    expect(ids.has('crafty'), 'the document TITLE must not read as a section').toBe(false);
  });

  it('finds a non-trivial number of citations across the canonical set', () => {
    const all = Object.values(DOC_ALIASES).map(read).join('\n');
    expect(citations(all).length).toBeGreaterThan(5);
  });
});
