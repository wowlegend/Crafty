import { describe, it, expect } from 'vitest';
import { evaluateCaptureFreshness } from './captureFreshness.js';

// Unit coverage for the visual-gate FAIL-LOUD predicate (KEVIN-REVIEW-BATCH item #12).
// These run under the normal unit config (no puppeteer) so the gate's LOGIC is verified even
// when the capture infra is down -- which is precisely the situation the guard defends against.

const STATES = ['menu', 'explore-day', 'boss-obsidian'];
const NOW = 1_700_000_000_000;

// Helper: every gated state has a fresh PNG (written after startedAt).
const freshPngs = (startedAt) =>
  Object.fromEntries(STATES.map((s) => [s, { exists: true, mtimeMs: startedAt + 1000 }]));

describe('evaluateCaptureFreshness', () => {
  it('passes a fresh, complete, crash-free capture', () => {
    const meta = { startedAt: NOW, finishedAt: NOW + 5000, complete: true, crashes: 0 };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, freshPngs(NOW));
    expect(ok).toBe(true);
    expect(reasons).toEqual([]);
  });

  it('FAILS LOUD when the sentinel is missing (null meta)', () => {
    const { ok, reasons } = evaluateCaptureFreshness(null, STATES, freshPngs(NOW));
    expect(ok).toBe(false);
    expect(reasons[0]).toMatch(/missing \.capture-meta\.json/);
  });

  it('FAILS LOUD when capture did not complete (complete:false = crashed/timed-out/aborted)', () => {
    // This is the item-#12 hole: a crashed/timed-out capture leaves complete:false, but the
    // pre-failure PNGs (and their mtimes) can look "present". The complete flag still catches it.
    const meta = { startedAt: NOW, complete: false };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, freshPngs(NOW));
    expect(ok).toBe(false);
    expect(reasons.some((r) => /did not complete cleanly/.test(r))).toBe(true);
  });

  it('FAILS LOUD when a render crash was recorded', () => {
    const meta = { startedAt: NOW, finishedAt: NOW + 5000, complete: false, crashes: 2 };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, freshPngs(NOW));
    expect(ok).toBe(false);
    expect(reasons.some((r) => /2 render crash/.test(r))).toBe(true);
  });

  it('FAILS LOUD when a gated state png is missing', () => {
    const pngInfo = { ...freshPngs(NOW), 'boss-obsidian': { exists: false } };
    const meta = { startedAt: NOW, finishedAt: NOW + 5000, complete: true, crashes: 0 };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok).toBe(false);
    expect(reasons.some((r) => /missing current\/boss-obsidian\.png/.test(r))).toBe(true);
  });

  it('FAILS LOUD when a png predates the run start (STALE leftover frame)', () => {
    const pngInfo = { ...freshPngs(NOW), 'explore-day': { exists: true, mtimeMs: NOW - 60_000 } };
    const meta = { startedAt: NOW, finishedAt: NOW + 5000, complete: true, crashes: 0 };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok).toBe(false);
    expect(reasons.some((r) => /explore-day\.png is older than the capture run start/.test(r))).toBe(true);
  });

  it('tolerates small fs/clock skew within the mtime slack window', () => {
    // a png written ~1.5s "before" startedAt (clock skew) is still accepted under the 2s slack.
    const pngInfo = { ...freshPngs(NOW), menu: { exists: true, mtimeMs: NOW - 1500 } };
    const meta = { startedAt: NOW, finishedAt: NOW + 5000, complete: true, crashes: 0 };
    const { ok } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok).toBe(true);
  });

  it('does not gate mtime when startedAt is absent (back-compat with an old sentinel)', () => {
    // an old sentinel without startedAt should not spuriously fail on mtime (complete still required).
    const pngInfo = Object.fromEntries(STATES.map((s) => [s, { exists: true, mtimeMs: 1 }]));
    const meta = { complete: true, crashes: 0 };
    const { ok } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok).toBe(true);
  });

  it('FAILS LOUD when a gated frame was SKIPPED, even though the run reached a clean end', () => {
    // The exact shape capture.mjs produces: the title-mascot try/catch falls through to the CLEAN end,
    // so the sentinel says complete:true crashes:0 over a run that never photographed a gated frame.
    // Measured 2026-08-13: skipped in 2 of the last 3 runs, and the run reported itself complete both
    // times. Note the mtime check is NOT what fires here — this png is dated INSIDE the run window, so
    // this is the case the old predicate would have passed.
    const { ok, reasons } = evaluateCaptureFreshness(
      { startedAt: 1000, finishedAt: 9000, complete: true, crashes: 0, skipped: ['title-mascot'] },
      ['menu', 'title-mascot'],
      { menu: { exists: true, mtimeMs: 5000 }, 'title-mascot': { exists: true, mtimeMs: 5000 } },
    );
    expect(ok).toBe(false);
    expect(reasons.join(' ')).toMatch(/SKIPPED/);
    expect(reasons.join(' ')).toContain('title-mascot');
    expect(reasons.join(' '), 'it fired on mtime, not on the skip — the coincidence, not the cause')
      .not.toMatch(/older than the capture run start/);
  });

  it('a clean run with an EMPTY skipped list still passes — the check is not just "field present"', () => {
    // The presence case. If any `skipped` key failed the run, every capture would red the moment the
    // field was added, and the guard would be a blanket rather than a measurement.
    const { ok } = evaluateCaptureFreshness(
      { startedAt: 1000, finishedAt: 9000, complete: true, crashes: 0, skipped: [] },
      ['menu'],
      { menu: { exists: true, mtimeMs: 5000 } },
    );
    expect(ok).toBe(true);
  });

  it('accumulates multiple independent failure reasons', () => {
    const pngInfo = { ...freshPngs(NOW), menu: { exists: false } };
    const meta = { startedAt: NOW, complete: false, crashes: 1 };
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok).toBe(false);
    expect(reasons.length).toBeGreaterThanOrEqual(3); // incomplete + crash + missing png
  });
});
