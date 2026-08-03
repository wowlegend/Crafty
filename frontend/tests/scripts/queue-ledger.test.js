import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, tally, QUEUES } from '../../scripts/ci/queue-ledger.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const doc = (...lines) => ['## Confirmed by kind (priority ladder)', '', ...lines].join('\n');

describe('queue-ledger — marker classification', () => {
  it('an unmarked finding is UNMARKED', () => {
    const f = classify(doc('- **`src/a.js:1`** [low·AUTO·bug] thing'));
    expect(f.map((x) => x.state)).toEqual(['unmarked']);
  });

  it('▣✓ <sha> is done, and a bare ▣✓ without a sha is NOT', () => {
    expect(classify(doc('- ▣✓ a1b2c3d **`src/a.js:1`** x'))[0].state).toBe('done');
    // Without a sha there is nothing to check the claim against, so it does not count as marked.
    expect(classify(doc('- ▣✓ **`src/a.js:1`** x'))[0].state).toBe('unmarked');
  });

  it('▢ is open and ⊘ DISMISSED is dismissed', () => {
    expect(classify(doc('- ▢ **`src/a.js:1`** x'))[0].state).toBe('open');
    expect(classify(doc('- ⊘ DISMISSED — nope — `npm test` **`src/a.js:1`** x'))[0].state).toBe('dismissed');
  });

  it('a dismissal WITHOUT a backticked command is flagged unproven', () => {
    // The load-bearing case: dismissal is the one disposition with no artifact behind it, and the loop's own
    // vacuity pass dismissed 29 of 32 findings on its own authority — 7 of which an auditor later showed
    // stay green when the guarded code is deleted.
    const t = tally(classify(doc('- ⊘ DISMISSED — it is fine, trust me **`src/a.js:1`** x')));
    expect(t.dismissed).toBe(1);
    expect(t.unprovenDismissals).toHaveLength(1);
  });

  it('a dismissal WITH a backticked command passes', () => {
    const t = tally(classify(doc('- ⊘ DISMISSED — not reachable — `grep -rn foo src/` **`src/a.js:1`** x')));
    expect(t.unprovenDismissals).toEqual([]);
  });

  it('counts ONLY the confirmed section — the execution-batches tail repeats the same findings', () => {
    // This exact bug shipped for one commit: scanning the whole document counted 243 against a stated 215.
    const md = [
      '## Confirmed by kind (priority ladder)',
      '- **`src/a.js:1`** x',
      '- **`src/b.js:2`** y',
      '## Execution batches — files with multiple findings (fix together)',
      '- **`src/a.js`** 3 findings',
      '- **`src/b.js`** 2 findings',
    ].join('\n');
    expect(tally(classify(md)).total).toBe(2);
  });

  it('tallies a mixed document', () => {
    const t = tally(
      classify(
        doc(
          '- ▣✓ abc1234 **`a:1`** x',
          '- ▢ **`b:2`** y',
          '- ⊘ DISMISSED — r — `cmd` **`c:3`** z',
          '- **`d:4`** w',
        ),
      ),
    );
    expect([t.total, t.done, t.open, t.dismissed, t.unmarked]).toEqual([4, 1, 1, 1, 1]);
  });
});

describe('queue-ledger — against the real queue', () => {
  it('finds the number of findings the document itself claims', () => {
    // The doc states "**Confirmed: 215**" in its own header. If the parser and the header disagree, one of
    // them is wrong and the ratchet is frozen on a number nobody can explain.
    const md = readFileSync(join(ROOT, QUEUES[0]), 'utf8');
    const stated = Number(md.match(/\*\*Confirmed:\s*(\d+)\*\*/)[1]);
    expect(tally(classify(md)).total).toBe(stated);
  });
});
