import { describe, it, expect } from 'vitest';

/**
 * THE HARNESS SMOKE TEST. It scores 0/5 on `gate-census.mjs` and it SHOULD — that is the census being
 * right, not a gap to close.
 *
 * Every census dimension asks a question about a check that guards production behaviour: does it import
 * its subject, does it state what makes it fail, does it count what it examined, does it guard an empty
 * set, does it name its blind spot. This file has no subject. Its entire job is to answer "did vitest
 * start and execute a case at all", which is the question every other result in the suite silently
 * assumes. A suite reporting 1,241 passes when the runner never collected anything would look identical
 * from the outside.
 *
 * So it is deliberately trivial, and inflating it to score better would make it worse: a smoke test that
 * depends on application code can fail for reasons that have nothing to do with the harness, which is
 * precisely what a smoke test must not do.
 *
 * Recorded here 2026-09-22 so the next pass through the census does not "fix" it.
 */
describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('can assert a FAILURE — a runner that only ever passes proves nothing', () => {
    // The positive control for the whole suite. If assertions were silently no-ops, every green result
    // in this repo would be meaningless and nothing else would notice.
    expect(() => expect(1 + 1).toBe(3)).toThrow();
  });
});
