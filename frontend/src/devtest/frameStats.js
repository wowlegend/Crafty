// frameStats.js — S2-B2-M2: pure frame-time statistics for the perf probe. Input = an array
// of rAF frame deltas in ms. No deps, no globals — unit-testable, and importable from BOTH
// the in-page runner and the node report script (plain ESM, no JSX/import.meta).

export const LONG_FRAME_MS = 33.4; // ≥2 missed 60Hz vsyncs = a visible hitch

/** Interpolated quantile (q in [0,1]) of a numeric array. Input need not be sorted. */
export function quantile(values, q) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Summarize one scenario's frame deltas. */
export function frameStats(deltasMs) {
  const n = deltasMs.length;
  if (!n) return { frames: 0, seconds: 0, fps: 0, medianMs: 0, p95Ms: 0, maxMs: 0, longFrames: 0 };
  const total = deltasMs.reduce((a, b) => a + b, 0);
  return {
    frames: n,
    seconds: total / 1000,
    fps: n / (total / 1000),
    medianMs: quantile(deltasMs, 0.5),
    p95Ms: quantile(deltasMs, 0.95),
    maxMs: Math.max(...deltasMs),
    longFrames: deltasMs.filter((d) => d > LONG_FRAME_MS).length,
  };
}

/** Probe-vs-baseline comparison: positive deltas = the probe scenario is more expensive. */
export function compareScenarios(baseline, probe) {
  return {
    medianDeltaMs: probe.medianMs - baseline.medianMs,
    p95DeltaMs: probe.p95Ms - baseline.p95Ms,
    fpsDelta: probe.fps - baseline.fps,
    longFrameDelta: probe.longFrames - baseline.longFrames,
  };
}

/** The pinned M2 budget for the C−B delta (STATE-REVIEW-2026-06-10 §4 rec, adopted 2026-06-10). */
export const M2_BUDGET = { medianDeltaMs: 1.5, p95DeltaMs: 3.0 };

export function withinBudget(cmp, budget = M2_BUDGET) {
  return cmp.medianDeltaMs <= budget.medianDeltaMs && cmp.p95DeltaMs <= budget.p95DeltaMs;
}
