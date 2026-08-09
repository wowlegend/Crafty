import { describe, it, expect } from 'vitest';
import { summarizeFlaky } from '../../scripts/ci/flaky-report.mjs';

// WHY THIS EXISTS. `retries: 2` in CI means a spec that fails twice and passes on the third attempt
// reports the whole run as `success`. Playwright calls that FLAKY, and it is invisible in the run
// conclusion — which is the only thing anyone reads. Two specs were flaky for weeks under exactly that
// cover, and were found only by grepping five runs' logs by hand.
//
// The obvious fix is `failOnFlakyTests`, which turns a retry-then-pass into a hard failure. It is not
// enabled, deliberately: at the time of writing there is exactly ONE clean CI run since the fix, and
// flipping a gate on n=1 is the error this session already had to correct once. So this instrument makes
// the flaky count VISIBLE in every run, and the flip happens when the visible record supports it.
//
// It is a REPORT, not a gate — it exits 0 always. See scripts/ci/flaky-report.mjs.
describe('summarizeFlaky', () => {
  const test = (status) => ({ status, results: status === 'flaky' ? [{}, {}] : [{}] });
  const spec = (title, status) => ({ title, file: 'a.spec.js', line: 1, tests: [test(status)] });

  it('names each flaky spec — file, title and attempt count', () => {
    const r = summarizeFlaky({
      stats: { flaky: 1, expected: 1, unexpected: 0, skipped: 0 },
      suites: [{ specs: [spec('opens the panel', 'flaky'), spec('closes it', 'expected')] }],
    });
    expect(r.flaky).toEqual([{ file: 'a.spec.js', line: 1, title: 'opens the panel', attempts: 2 }]);
  });

  it('reports the DENOMINATOR — how many specs it actually walked', () => {
    // "0 flaky" from a walker that enumerated nothing reads identically to a clean run. This repo has
    // shipped seven instruments with exactly that defect; the count is the difference.
    const r = summarizeFlaky({
      stats: { flaky: 0, expected: 2, unexpected: 0, skipped: 0 },
      suites: [{ specs: [spec('a', 'expected'), spec('b', 'expected')] }],
    });
    expect(r.walked).toBe(2);
    expect(r.flaky).toEqual([]);
  });

  it('descends into NESTED suites, which is where a naive walker loses specs', () => {
    // Playwright nests a suite per file under a suite per project. A walk that reads only the top level
    // sees zero specs and reports a clean run over input it never examined.
    const r = summarizeFlaky({
      stats: { flaky: 1, expected: 1, unexpected: 0, skipped: 0 },
      suites: [{ specs: [], suites: [{ specs: [spec('deep', 'flaky'), spec('deeper', 'expected')] }] }],
    });
    expect(r.walked).toBe(2);
    expect(r.flaky).toHaveLength(1);
    expect(r.flaky[0].title).toBe('deep');
  });

  it('CROSS-CHECKS its own walk against the report stats, and reports disagreement', () => {
    // The load-bearing assertion. If the walk misses a spec, `flaky: []` is indistinguishable from a
    // clean run — unless it is checked against a tally computed by someone else. Playwright's own
    // `stats.flaky` is that independent tally, so a mismatch means THIS INSTRUMENT is broken, and the
    // instrument must say so rather than print a reassuring zero.
    const r = summarizeFlaky({
      stats: { flaky: 3, expected: 1, unexpected: 0, skipped: 0 },
      suites: [{ specs: [spec('only one found', 'flaky')] }],
    });
    expect(r.agrees).toBe(false);
    expect(r.statsFlaky).toBe(3);
    expect(r.flaky).toHaveLength(1);
  });

  it('agrees when the walk and the stats match', () => {
    const r = summarizeFlaky({
      stats: { flaky: 1, expected: 0, unexpected: 0, skipped: 0 },
      suites: [{ specs: [spec('x', 'flaky')] }],
    });
    expect(r.agrees).toBe(true);
  });

  it('reports an EMPTY report as a zero denominator, never as clean', () => {
    // A shard that crashed before running anything writes a report with no suites. "0 flaky" would be
    // true and utterly misleading; `walked === 0` is the finding.
    const r = summarizeFlaky({ stats: { flaky: 0, expected: 0, unexpected: 0, skipped: 0 }, suites: [] });
    expect(r.walked).toBe(0);
    expect(r.empty).toBe(true);
  });

  it('survives a malformed or missing report instead of throwing', () => {
    // This runs in `if: always()`, i.e. precisely when the e2e step has already failed and the report
    // may be truncated. An instrument that throws here destroys the diagnosis it exists to provide.
    for (const bad of [null, undefined, {}, { suites: null }, { suites: [{}] }]) {
      const r = summarizeFlaky(bad);
      expect(r.flaky).toEqual([]);
      expect(r.walked).toBe(0);
    }
  });

  it('counts attempts from the results array, not from a hardcoded retry setting', () => {
    // "how many tries did it need" is a per-spec fact. Reading it from config.retries would report the
    // ceiling for every spec, including ones that passed first time.
    const r = summarizeFlaky({
      stats: { flaky: 1, expected: 0, unexpected: 0, skipped: 0 },
      suites: [{ specs: [{ title: 't', file: 'f.js', line: 9, tests: [{ status: 'flaky', results: [{}, {}, {}] }] }] }],
    });
    expect(r.flaky[0].attempts).toBe(3);
  });
});
