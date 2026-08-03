import { describe, it, expect } from 'vitest';
import { measure, renderBlock, parseBlock, LARGE_FILE_LOC, TOLERANCE, BEGIN, END } from '../../scripts/ci/measure.mjs';

// THE ROUND TRIP IS THE WHOLE CONTRACT.
//
// `measure.mjs` RENDERS the size block into .agent/AGENTS.md and `doc-currency.mjs` PARSES it back to check
// for drift. Those are two regexes pointed at one format, and nothing but this test keeps them agreeing.
// If a later edit reformats the block — bolding, a thousands separator, a reordered clause — parseBlock
// starts returning null or, worse, the wrong number, and the drift check silently stops defending anything.
// That is the failure this repo has now shipped four times: a check reporting PASS over input it never
// really examined.
//
// These assertions run against the REAL tree rather than a fixture, deliberately: the numbers are allowed
// to move, but the shape may not.
describe('measure — the size authority', () => {
  const m = measure();

  it('measures a plausible tree (guards against a walk that silently finds nothing)', () => {
    // Without this, a broken walk() would make every assertion below vacuously true.
    expect(m.srcFiles).toBeGreaterThan(50);
    expect(m.srcLoc).toBeGreaterThan(5000);
  });

  it('separates colocated tests from source — they are not the architecture', () => {
    expect(m.colocatedTestFiles).toBeGreaterThan(0);
    // A source file must never be counted as a test or vice versa.
    expect(m.top5.every((f) => !/\.test\.jsx?$/.test(f.file))).toBe(true);
  });

  it('every large file really is >= the threshold, and they are the biggest ones', () => {
    for (const f of m.largeFiles) expect(f.loc).toBeGreaterThanOrEqual(LARGE_FILE_LOC);
    const top = m.top5.map((f) => f.loc);
    expect([...top].sort((a, b) => b - a)).toEqual(top); // top5 is actually sorted
  });

  it('renders a block that parses back to the same numbers', () => {
    const parsed = parseBlock(renderBlock(m));
    expect(parsed).not.toBeNull();
    expect(parsed.srcFiles).toBe(m.srcFiles);
    expect(parsed.srcLoc).toBe(m.srcLoc);
    expect(parsed.largeFiles.map((f) => f.file)).toEqual(m.largeFiles.map((f) => f.file));
  });

  it('survives a four-digit LOC count with a thousands separator', () => {
    // 30,022 renders with a comma; a parser that forgets to strip it reads 30 and reports 99% drift.
    const fake = { srcFiles: 1234, srcLoc: 56789, colocatedTestFiles: 9, largeFiles: [], top5: [] };
    const parsed = parseBlock(renderBlock(fake));
    expect(parsed.srcFiles).toBe(1234);
    expect(parsed.srcLoc).toBe(56789);
  });

  it('returns null when the markers are absent, so a missing block fails loudly', () => {
    expect(parseBlock('# some doc with no block')).toBeNull();
    expect(parseBlock(`${BEGIN} no numbers here ${END}`)).toBeNull();
  });

  it('keeps the tolerance a band, not a rubber stamp', () => {
    expect(TOLERANCE).toBeGreaterThan(0); // exact-match would redden every commit and get disabled
    expect(TOLERANCE).toBeLessThanOrEqual(0.2); // wide enough to hide a real regression is worse than none
  });
});
