import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ratchetDiff } from '../../scripts/ci/_gate-ratchet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATES = resolve(HERE, '../gates');
const LEDGER = resolve(GATES, '.source-grep-ledger.json');

// THE RATCHET WAS HOLDING AGAINST A FILE THAT DOES NOT EXIST.
//
// `gate-shape.mjs` freezes the population of gates that read source with `readFileSync`, and the
// population may fall but never rise. It enforced that with one comparison: anything LIVE that is not
// FROZEN is an addition. A frozen entry that is no longer live went unmentioned — and one had been
// sitting there. The ledger listed `tests/gates/aspect-hint-gate.test.js`; the file on disk is
// `aspect-hint-gate.test.jsx` and contains zero `readFileSync`, having already been converted to a
// behavioural gate. So the ledger said 116 while the scan found 115, and the run printed the scan's
// number beside the phrase "ratchet holding".
//
// TWO DEFECTS, AND THE SECOND IS THE ONE THAT MATTERS.
//   1. The printed count disagreed with the frozen count, silently.
//   2. A stale entry is a FREE SLOT. `added` is computed with `frozen.includes(g)`, so a brand-new
//      source-grep gate created at exactly `tests/gates/aspect-hint-gate.test.js` would be waved
//      through by a ratchet whose entire job is to refuse it.
//
// A fall is GOOD NEWS — it is the ratchet working. It just has to be RECORDED, so that the population
// the gate defends is the population that exists.
describe('gate-shape ratchet — the frozen population must be the live one', () => {
  it('reports a NEW source-grep gate as an addition', () => {
    const { added, stale } = ratchetDiff(['a.test.js'], ['a.test.js', 'b.test.js']);
    expect(added).toEqual(['b.test.js']);
    expect(stale).toEqual([]);
  });

  it('reports a CONVERTED gate as stale rather than ignoring it', () => {
    const { added, stale } = ratchetDiff(['a.test.js', 'ghost.test.js'], ['a.test.js']);
    expect(stale, 'a frozen entry with no live counterpart was silently tolerated').toEqual(['ghost.test.js']);
    expect(added).toEqual([]);
  });

  it('separates the two directions instead of reporting a net count', () => {
    // A rename is one of each. Netting them to zero is how a population can churn completely while the
    // number never moves.
    const { added, stale } = ratchetDiff(['old.test.js'], ['new.test.js']);
    expect(added).toEqual(['new.test.js']);
    expect(stale).toEqual(['old.test.js']);
  });

  it('is quiet when they agree', () => {
    const { added, stale } = ratchetDiff(['a.test.js', 'b.test.js'], ['b.test.js', 'a.test.js']);
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  // AND THE CALLER, because a seam nothing calls is this repo's most-repeated defect and I shipped one
  // earlier the same day (`stepCaptureFrames` existed for two days before `capture.mjs` ever called it).
  // Reading the script's source is the right tool: the assertion is that one CLI consumes one function,
  // and executing gate-shape.mjs to prove it would mean re-parsing the whole corpus.
  it('gate-shape actually CONSUMES the stale direction, rather than only computing it', () => {
    const cli = readFileSync(resolve(HERE, '../../scripts/ci/gate-shape.mjs'), 'utf8');
    expect(cli, 'gate-shape does not use the shared ratchet at all').toContain("from './_gate-ratchet.mjs'");
    const at = cli.indexOf('if (stale.length)');
    expect(at, 'gate-shape computes stale and never branches on it').toBeGreaterThan(-1);
    expect(cli.slice(at, at + 300), 'a stale entry is detected but not raised as an error').toContain('errors.push');
  });

  // THE DENOMINATOR, ASSERTED RATHER THAN PRINTED. This is the test that would have caught the ghost on
  // the day it appeared, and it runs against the real ledger and the real directory rather than fixtures.
  it('the committed ledger matches the gates actually on disk, and counts itself correctly', () => {
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
    const live = readdirSync(GATES)
      .filter((f) => /\.test\.(js|jsx)$/.test(f))
      .filter((f) => readFileSync(resolve(GATES, f), 'utf8').includes('readFileSync'))
      .map((f) => `tests/gates/${f}`);
    expect(live.length, 'no gate files were enumerated at all — this test is measuring nothing').toBeGreaterThan(50);
    const { added, stale } = ratchetDiff(ledger.gates, live);
    expect(stale, 'the ledger freezes gate(s) that no longer read source — each one is a free slot for a new source-grep gate at that exact path; re-freeze with `node scripts/ci/gate-shape.mjs --write`').toEqual([]);
    expect(added, 'source-grep gate(s) exist that the ledger does not freeze').toEqual([]);
    expect(ledger._count, 'the ledger _count disagrees with its own list').toBe(ledger.gates.length);
  });
});
