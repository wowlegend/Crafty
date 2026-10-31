import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sourceFiles, strip } from '../gates/_srcWalk.js';

/**
 * A DEFERRAL IS A REGISTRY ROW, NEVER A COMMENT (CLAUDE.md "Invariants"; AUDIT:ultra:ultra-game-logic-7).
 *
 * `locomotion.js` carried "same as dodge.planarBasis, unify later" over a second copy of the move basis. A deferral
 * written into the code belongs to nobody and is read by nobody; the registry row is the one place work waits.
 *
 * SITED HERE, NOT IN tests/gates/, and stated: the subject is the CONTENT of the source files (their comments), which
 * is what tests/scripts/ is for, and a source-reading check sited in tests/gates/ would join the frozen source-grep
 * population (gate-shape). The detector is a PROPERTY check over every non-test file of src/, not a sweep of the one
 * phrase that was found: it looks for the deferral markers (TODO, FIXME, "unify later") inside comments, and the
 * instrument is shown to see them below before it is trusted to find none.
 *
 * NOT CHECKED: a deferral worded another way ("later", "for now", "temporary"). Those are prose and cannot be told from
 * a reason; the three markers are the ones that name a debt. A marker inside a string is code, not a comment, and is
 * ignored (`strip` removes comments only).
 *
 * Mutation-Proof: see the commit trailer.
 */

const MARKER = /\b(TODO|FIXME|unify later)\b/gi;

/** How many deferral markers sit in COMMENTS of `text`: all the markers there are, less those that survive stripping. */
function deferralsIn(text) {
  return (text.match(MARKER) || []).length - (strip(text).match(MARKER) || []).length;
}

describe('no comment in src/ defers work', () => {
  it('the detector sees a deferral in a line comment, a trailing comment and a block comment, and not in code or a clean comment', () => {
    expect(deferralsIn('// TODO: tune\nconst a = 1;'), 'a line comment').toBe(1);
    expect(deferralsIn('const a = 1; // same as b, unify later'), 'a trailing comment').toBe(1);
    expect(deferralsIn('/* FIXME */\nconst a = 1;'), 'a block comment').toBe(1);
    expect(deferralsIn('const label = "TODO";\n// a note about the label'), 'a marker in a string is code').toBe(0);
    expect(deferralsIn('// a note\nconst a = 1;'), 'a clean comment').toBe(0);
  });

  it('no non-test file of src/ holds one', () => {
    const files = sourceFiles();
    const offenders = [];
    for (const f of files) {
      const n = deferralsIn(readFileSync(f, 'utf8'));
      if (n > 0) offenders.push(`${f.slice(f.indexOf('/src/') + 1)}: ${n}`);
    }
    expect(files.length, 'source files scanned').toBeGreaterThanOrEqual(300);
    expect(offenders, 'files with a deferral comment (make it a registry row)').toEqual([]);
  });
});
