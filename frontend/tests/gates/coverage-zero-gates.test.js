import { describe, it, expect } from 'vitest';
import { partitionCoverage } from '../../scripts/ci/coverage-zero.mjs';

// The zero-coverage report answers ONE question: which src modules does no test execute. 113 of the 131
// gate tests read their target as text and run none of it, so a 2,559-test headline says little about how
// much of the app is ever exercised, and nothing here could previously answer that.
//
// It is NOT a threshold gate and must never become one: a coverage ratchet rewards EXECUTION, while
// gate-shape exists to reject assertions satisfied without verifying anything — so ratcheting coverage
// would push the corpus toward exactly the tests gate-shape rejects.
describe('partitionCoverage — and proof it can distinguish the two answers', () => {
  const cov = (m) => Object.fromEntries(Object.entries(m).map(([f, s]) => [f, { s }]));

  it('reports a module executed by nothing', () => {
    const r = partitionCoverage(cov({ '/a.js': { 0: 1, 1: 3 }, '/b.js': { 0: 0, 1: 0 } }));
    expect(r.zero).toEqual(['/b.js']);
    expect(r.executed).toBe(1);
    expect(r.total).toBe(2);
  });

  it('counts a module executed even once as executed', () => {
    // The question is "does anything run this at all", not "is it well covered".
    const r = partitionCoverage(cov({ '/a.js': { 0: 0, 1: 0, 2: 1 } }));
    expect(r.zero).toEqual([]);
    expect(r.executed).toBe(1);
  });

  it('ignores a file with NO statements rather than calling it uncovered', () => {
    // A pure re-export barrel has nothing to execute. Counting it as a zero would pad the finding with
    // noise and make the real list harder to act on.
    const r = partitionCoverage(cov({ '/barrel.js': {}, '/a.js': { 0: 1 } }));
    expect(r.zero).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.executed).toBe(1);
  });

  it('reports a DENOMINATOR, not just the zeroes', () => {
    // "3 modules untested" and "3 of 4 modules untested" are different findings. Seven instruments in
    // this repo have shipped a clean report over input they never examined; a bare list is that shape.
    const r = partitionCoverage(cov({ '/a.js': { 0: 0 }, '/b.js': { 0: 0 }, '/c.js': { 0: 1 } }));
    expect(r.total).toBe(3);
    expect(r.executed).toBe(1);
    expect(r.zero).toHaveLength(2);
  });

  it('survives an empty or missing coverage map instead of throwing', () => {
    expect(partitionCoverage({})).toEqual({ zero: [], executed: 0, total: 0 });
    expect(partitionCoverage(null)).toEqual({ zero: [], executed: 0, total: 0 });
  });

  it('sorts the zero list, so two runs of the same state read identically', () => {
    const r = partitionCoverage(cov({ '/z.js': { 0: 0 }, '/a.js': { 0: 0 } }));
    expect(r.zero).toEqual(['/a.js', '/z.js']);
  });
});
