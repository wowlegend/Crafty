import { describe, it, expect } from 'vitest';
import { parsePerfParams } from './perfProbe.js';

// Unit coverage for the perf-probe URL-param parse (the ?perfsec fast-window override added for the
// Playwright perf e2e). Pure -> testable without a browser; the DEV-only module-level wiring that
// consumes it is exercised by tests/e2e/perf-siege.spec.js.

describe('parsePerfParams', () => {
  it('parses a valid scenario id', () => {
    expect(parsePerfParams('?perf=B')).toEqual({ scenario: 'B', durationSec: null });
    expect(parsePerfParams('?perf=E')).toEqual({ scenario: 'E', durationSec: null });
  });

  it('rejects an invalid scenario id', () => {
    expect(parsePerfParams('?perf=Z')).toEqual({ scenario: null, durationSec: null });
    expect(parsePerfParams('?perf=AA')).toEqual({ scenario: null, durationSec: null });
    expect(parsePerfParams('?perf=1')).toEqual({ scenario: null, durationSec: null });
  });

  it('returns nulls for missing / empty search', () => {
    expect(parsePerfParams('')).toEqual({ scenario: null, durationSec: null });
    expect(parsePerfParams(undefined)).toEqual({ scenario: null, durationSec: null });
  });

  it('parses an in-range perfsec override (inclusive bounds)', () => {
    expect(parsePerfParams('?perf=A&perfsec=8')).toEqual({ scenario: 'A', durationSec: 8 });
    expect(parsePerfParams('?perf=A&perfsec=3')).toEqual({ scenario: 'A', durationSec: 3 });
    expect(parsePerfParams('?perf=A&perfsec=120')).toEqual({ scenario: 'A', durationSec: 120 });
  });

  it('drops an out-of-range / non-numeric perfsec to null (fall back to the default)', () => {
    expect(parsePerfParams('?perf=A&perfsec=2').durationSec).toBe(null);
    expect(parsePerfParams('?perf=A&perfsec=121').durationSec).toBe(null);
    expect(parsePerfParams('?perf=A&perfsec=abc').durationSec).toBe(null);
    expect(parsePerfParams('?perf=A&perfsec=').durationSec).toBe(null);
  });

  it('parses perfsec independently of the scenario', () => {
    expect(parsePerfParams('?perfsec=10')).toEqual({ scenario: null, durationSec: 10 });
  });
});
