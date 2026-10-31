import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { commentsOf, historyComments } from '../_support/historyComments.js';

/**
 * A COMMENT SAYS WHY, NOT WHAT USED TO BE (CLAUDE.md "Invariants": "no history or mutation receipts in code"; deep audit
 * 2026-10-30, lane L12; AUDIT:ultra:ultra-game-logic-5, which merges REVIEW:w2d:gamehud-history-comments,
 * REVIEW:w2g:comments-say-history and REVIEW:w3b:comment-history-phrases).
 *
 * History in a comment goes stale, buries the constraint the next author needs, and is the shape in which a comment
 * lies: "after loadGame has hydrated the store" (bossSystem.js) hid two HIGH defects behind a load order the game never
 * ran. Four review rows named the same defect in different files, each fixed by hand and each re-introduced in the
 * next lane's comments. This is the instrument: a count of comments in src that narrate history, per file, which may
 * only fall.
 *
 * A history comment is one that matches a marker of narration, not of a reason:
 *   - "it / they / this / these / that / which / one / each used to ..." and "used to be ...";
 *   - "what was there";
 *   - a mutation receipt: "deleted / removed / retired / fixed / reverted / replaced / added" followed by a date;
 *   - a value's past: "(was 5.5)", "(was #3)";
 *   - relative time that names no date: "has always", "on today's model", "today's impulse".
 * Adjacent line comments are read as one (a phrase broken across `//` lines still matches). Comments are read from the
 * syntax tree (@babel/parser), so a string or a template holding the words is not a comment.
 *
 * NOT CHECKED: history worded another way ("the old X", "previously", "we tried"). Those are prose a reader catches in
 * review and a pattern cannot tell from a reason; the markers above are the ones this repo's reviews kept finding. A
 * date is not history on its own: "measured 2026-10-27" is an external fact with its date, and stays.
 *
 * The count per file is in tests/scripts/history-comments.ledger.json. A file past its number, or one the ledger does not
 * list, fails; the test does not tighten the ledger, so a lane removing comments in a file it is editing changes nothing.
 * Lower a number when you remove a comment; never raise one.
 *
 * SITED IN tests/scripts/ (the subject is the content of the source files), not tests/gates/.
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** The files whose count passes the ledger's number for them (an unlisted file's number is 0). */
function overLedger(perFile, ledger) {
  return Object.entries(perFile).filter(([file, n]) => n > (ledger[file] ?? 0)).map(([file, n]) => `${file}: ${n} > ${ledger[file] ?? 0}`);
}

describe('no file gains a comment that narrates history', () => {
  const ledger = JSON.parse(readFileSync(resolve(APP, 'tests/scripts/history-comments.ledger.json'), 'utf8')).files;
  const tree = readSourceTree();
  const perFile = {};
  const examples = {};
  let comments = 0;
  for (const { file, text } of tree) {
    comments += commentsOf(text).length;
    const hits = historyComments(text);
    if (hits.length) { perFile[file] = hits.length; examples[file] = hits.map((h) => h.line); }
  }
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);

  it('the instrument sees: the tree, its comments and the history in them', () => {
    // Floors under the counts at the sweep (410 files, thousands of comments, 80 history comments in 48 files).
    expect(tree.length, 'the source tree came back short').toBeGreaterThan(350);
    expect(comments, 'the scan read almost no comments').toBeGreaterThan(3000);
    expect(total, 'the scan found almost no history: the markers are not matching').toBeGreaterThan(40);
    expect(Object.keys(ledger).length, 'the ledger lists almost no file').toBeGreaterThan(30);
  });

  it('no file holds more history comments than the ledger allows, and no unlisted file holds one', () => {
    const over = overLedger(perFile, ledger);
    expect(over, `files that gained a history comment (say why, not what used to be; lines ${JSON.stringify(examples)})`).toEqual([]);
  });

  it('the ledger comparison names a file past its number and a file the ledger does not list, and lets a lower count be', () => {
    expect(overLedger({ 'src/a.js': 3, 'src/b.js': 1, 'src/c.js': 2 }, { 'src/a.js': 3, 'src/c.js': 4 })).toEqual(['src/b.js: 1 > 0']);
    expect(overLedger({ 'src/a.js': 4 }, { 'src/a.js': 3 })).toEqual(['src/a.js: 4 > 3']);
    expect(overLedger({}, { 'src/a.js': 3 })).toEqual([]);
  });

  it('the detector finds each marker, joins a phrase broken across line comments, and passes a comment that gives a reason', () => {
    const lines = (...ls) => ls.join('\n');
    const yes = [
      '// It used to swing the sword here',
      '// This call used to be the last statement',
      '/** Those used to be one array. */',
      '// The old chest used to be removed on death',
      '// the thing that used to be here',
      '// WHAT WAS THERE: a toast',
      '// getPlayerXP was deleted 2026-08-11, nothing read it',
      '// the flipflops REMOVED 2026-09-22 restore the default',
      '// glow 7.0 (was 5.5)',
      '// the group (was #3) is gone',
      '// the impulse the roar has always given',
      "// where the hit points sit on today's model",
      lines('// This is why it used', '// to swing before the fix'),
    ];
    for (const c of yes) expect(historyComments(`${c}\nconst a = 1;`).length, c).toBe(1);
    const no = [
      '// A ref used to hold the handle for the next frame',
      '// Bodies are used to carry the velocity',
      '// measured 2026-10-27 on an iPad: 14 ms',
      '// removed from the pool when it dies',
      '// the value (was) read at mount',
      '// the wording has always-on semantics',
      "// today is a new day",
      "const s = 'it used to be here';",
      'const t = `deleted 2026-08-11`;',
    ];
    for (const c of no) expect(historyComments(`${c}\nconst a = 1;`).length, c).toBe(0);
    // Two separate comments, each a history comment, count twice; two comments broken apart by code do not join.
    expect(historyComments(lines('// it used to a', 'const x = 1;', '// to be that')).length).toBe(1);
  });
});
