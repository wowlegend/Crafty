import { describe, it, expect, afterEach } from 'vitest';
import { capDpr, e2eDpr } from './e2eDpr.js';

// THE E2E PIXEL-RATIO CAP (src/devtest/e2eDpr.js). The cap is how the e2e suite draws its canvases at a lower pixel
// ratio on a software renderer without touching the CSS layout; these pin the arithmetic both canvases hand to R3F.
// Exact outputs, not "smaller": R3F resolves a range as min(max(lo, devicePixelRatio), hi), so a range whose lower
// bound stays above the cap is a different value from the one asked for, and only the exact range says which.
//
// Mutation-Proof: via scripts/dev/mutate.sh (2026-10-28, one batch, 8 tests), each RED against this file, with two identity
// mutants in the same batch (a comment edit; whitespace in a comment, both in e2eDpr.js) that SURVIVED:
//   D1 the range left whole (arrays returned unchanged)                              -> RED
//   D2 plausible-wrong: only the range's upper bound capped                          -> RED
//   D3 plausible-wrong: Math.max for the number (a cap that RAISES a lower ratio)    -> RED
//   D4 the guard admits a zero cap (`cap > 0` -> `cap >= 0`)                         -> RED
//   D5 e2eDpr reads no cap from the page (the window global's name changed)          -> RED

// In a page `window` IS `globalThis`, so the cap the fixture writes on `window` is the one read here (node env, no window).
afterEach(() => {
  delete globalThis.__craftyE2eDprCap;
});

describe('capDpr: a cap on what R3F is handed', () => {
  it('caps a number', () => {
    expect(capDpr(1.5, 0.5)).toBe(0.5);
    expect(capDpr(1, 0.5)).toBe(0.5);
  });

  it('never raises a number that is already under the cap', () => {
    expect(capDpr(0.4, 0.5)).toBe(0.4);
    expect(capDpr(1, 2)).toBe(1);
  });

  it('caps BOTH ends of a range, so the range R3F resolves is the cap itself', () => {
    expect(capDpr([1, 1.5], 0.5)).toEqual([0.5, 0.5]);
    expect(capDpr([1, 2], 0.75)).toEqual([0.75, 0.75]);
  });

  it('caps only the end of a range that is above the cap', () => {
    expect(capDpr([1, 2], 1.25)).toEqual([1, 1.25]);
  });

  it('leaves a range under the cap whole', () => {
    expect(capDpr([1, 1.5], 3)).toEqual([1, 1.5]);
  });

  it('is a no-op without a usable cap: absent, null, zero, negative, not a number, infinite', () => {
    for (const cap of [undefined, null, 0, -1, NaN, '0.5', Infinity]) {
      expect(capDpr(1.5, cap), `cap ${String(cap)}`).toBe(1.5);
      expect(capDpr([1, 2], cap), `cap ${String(cap)}`).toEqual([1, 2]);
    }
  });
});

describe('e2eDpr: the cap the e2e fixture installs on the page', () => {
  it('passes the dpr through when the page carries no cap (every real session)', () => {
    expect(e2eDpr([1, 1.5])).toEqual([1, 1.5]);
    expect(e2eDpr(1.5)).toBe(1.5);
  });

  it('applies the cap tests/e2e/_fixtures.js writes before the page loads', () => {
    globalThis.__craftyE2eDprCap = 0.5;
    expect(e2eDpr([1, 1.5])).toEqual([0.5, 0.5]);
    expect(e2eDpr(1)).toBe(0.5);
  });
});
